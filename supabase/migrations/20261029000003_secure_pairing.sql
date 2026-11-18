-- =============================================================================
-- MULE × PRINCESS — migration 3 of 6: secure pairing functions
-- =============================================================================
-- Everything that creates, joins, leaves or reads a relationship space is a SECURITY DEFINER
-- function, because the tables themselves give the browser no write access to them
-- (migration 2). Each function:
--   * derives the caller from auth.uid() (a signed token), never from an argument,
--   * sets `search_path = ''` and schema-qualifies every name,
--   * is executable by `authenticated` only (never by anon, never by PUBLIC).
--
-- Invitation codes
--   * 20 characters of Crockford base32 = 100 bits from the database CSPRNG (gen_random_uuid()).
--   * Only SHA-256(code) is stored. The code itself appears once, in the response to
--     create_invitation(), and cannot be recovered afterwards.
--   * Single use, expires after 48 hours, and a newer code cancels the older one.
--   * Redemption is rate limited: 5 failed attempts per user per 15 minutes.
--   * Wrong, expired, used and revoked codes all give the same answer, so a guess reveals nothing.
--   * A space holds two people at most; the limit is also enforced by a trigger on the table.
-- =============================================================================

-- ------------------------------------------------------------------ code helpers
create or replace function public._generate_invite_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';   -- Crockford base32: no I, L, O, U
  raw   bytea := uuid_send(gen_random_uuid());
  u     bytea;
  code  text := '';
  i     integer;
  off   integer;
  val   integer;
begin
  -- Bytes 6 and 8 of a v4 uuid carry the fixed version/variant bits. Skip them and keep the 14
  -- fully random bytes (112 bits), of which 100 bits become 20 symbols.
  u := substring(raw from 1 for 6) || substring(raw from 8 for 1) || substring(raw from 10 for 7);
  for i in 0..19 loop
    off := i * 5;
    val := (((get_byte(u, off / 8) << 8) | get_byte(u, off / 8 + 1)) >> (11 - (off % 8))) & 31;
    code := code || substr(alphabet, val + 1, 1);
  end loop;
  return code;
end
$$;

-- Accepts what a person might type (lower case, spaces, dashes, O for 0, I/L for 1) and returns
-- the canonical 20-character code, or null when it cannot be a code.
create or replace function public._normalize_invite_code(p_code text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when c ~ '^[0-9A-HJKMNP-TV-Z]{20}$' then c
    else null
  end
  from (
    select translate(upper(regexp_replace(coalesce(p_code, ''), '[^0-9A-Za-z]', '', 'g')), 'OIL', '011') as c
  ) s
$$;

-- --------------------------------------------------------------- move your data
-- Moves one player's own rows from one space to another (used when joining a partner and
-- when leaving). Moved answers always become private: nothing is ever shared as a side
-- effect of moving. The transaction-local flag lets only this move change relationship_id.
create or replace function public._move_user_data(p_user uuid, p_from uuid, p_to uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config('mule.allow_move', 'on', true);

  update public.answers
     set relationship_id = p_to, visibility = 'private'
   where relationship_id = p_from and author_id = p_user;

  update public.story_memories s
     set relationship_id = p_to
   where s.relationship_id = p_from
     and s.created_by = p_user
     and not exists (
       select 1 from public.story_memories t
       where t.relationship_id = p_to and t.stage_id = s.stage_id and t.memory_key = s.memory_key
     );

  update public.game_progress
     set relationship_id = p_to
   where user_id = p_user and relationship_id = p_from;

  perform set_config('mule.allow_move', 'off', true);
end
$$;

-- ----------------------------------------------------------- ensure_relationship
-- Every signed-in player has exactly one space ("pending" while it holds only them). Answers
-- saved to an account live in it, and it is the space a partner joins.
create or replace function public.ensure_relationship()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_rel uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select relationship_id into v_rel from public.relationship_members where user_id = v_uid;
  if v_rel is not null then
    return v_rel;
  end if;

  insert into public.relationships (created_by, status) values (v_uid, 'pending') returning id into v_rel;
  insert into public.relationship_members (relationship_id, user_id) values (v_rel, v_uid);
  return v_rel;
exception
  when unique_violation then
    -- two calls raced; the other one created the membership
    select relationship_id into v_rel from public.relationship_members where user_id = v_uid;
    return v_rel;
end
$$;

-- ------------------------------------------------------------ create_invitation
create or replace function public.create_invitation()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_rel     uuid;
  v_members integer;
  v_recent  integer;
  v_code    text;
  v_expires timestamptz := now() + interval '48 hours';
  v_try     integer := 0;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  v_rel := public.ensure_relationship();
  perform 1 from public.relationships where id = v_rel for update;

  select count(*) into v_members from public.relationship_members where relationship_id = v_rel;
  if v_members >= 2 then
    raise exception 'already_paired';
  end if;

  select count(*) into v_recent
    from public.invitations
   where created_by = v_uid and created_at > now() - interval '1 hour';
  if v_recent >= 5 then
    raise exception 'too_many_invitations';
  end if;

  -- a newer code cancels any earlier unused one
  update public.invitations
     set revoked_at = now()
   where relationship_id = v_rel and used_at is null and revoked_at is null;

  loop
    v_code := public._generate_invite_code();
    begin
      insert into public.invitations (relationship_id, token_hash, expires_at, created_by)
      values (v_rel, encode(sha256(convert_to(v_code, 'UTF8')), 'hex'), v_expires, v_uid);
      exit;
    exception when unique_violation then
      v_try := v_try + 1;
      if v_try >= 3 then
        raise;
      end if;
    end;
  end loop;

  return jsonb_build_object('code', v_code, 'expires_at', v_expires);
end
$$;

-- ----------------------------------------------------------- redeem_invitation
create or replace function public.redeem_invitation(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid            uuid := (select auth.uid());
  v_code           text;
  v_hash           text;
  v_inv            public.invitations%rowtype;
  v_target         uuid;
  v_target_members integer;
  v_old            uuid;
  v_old_members    integer;
  v_failed         integer;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  -- housekeeping: attempts older than a day are of no use
  delete from public.invitation_attempts where attempted_at < now() - interval '1 day';

  select count(*) into v_failed
    from public.invitation_attempts
   where user_id = v_uid and not succeeded and attempted_at > now() - interval '15 minutes';
  if v_failed >= 5 then
    raise exception 'too_many_attempts';
  end if;

  v_code := public._normalize_invite_code(p_code);
  if v_code is not null then
    v_hash := encode(sha256(convert_to(v_code, 'UTF8')), 'hex');
    select * into v_inv from public.invitations where token_hash = v_hash for update;
  end if;

  -- Failures RETURN (rather than raise) so the attempt row below is committed and counted.
  if v_code is null or v_inv.id is null
     or v_inv.used_at is not null or v_inv.revoked_at is not null or v_inv.expires_at <= now() then
    insert into public.invitation_attempts (user_id, succeeded) values (v_uid, false);
    return jsonb_build_object('error', 'invalid_or_expired_code');
  end if;

  v_target := v_inv.relationship_id;
  perform 1 from public.relationships where id = v_target for update;

  select relationship_id into v_old from public.relationship_members where user_id = v_uid;
  if v_old is not null and v_old = v_target then
    return jsonb_build_object('error', 'own_code');
  end if;

  select count(*) into v_target_members from public.relationship_members where relationship_id = v_target;
  if v_target_members >= 2 then
    update public.invitations set revoked_at = now() where id = v_inv.id;
    insert into public.invitation_attempts (user_id, succeeded) values (v_uid, false);
    return jsonb_build_object('error', 'invalid_or_expired_code');
  end if;

  if v_old is not null then
    select count(*) into v_old_members from public.relationship_members where relationship_id = v_old;
    if v_old_members >= 2 then
      raise exception 'already_paired';
    end if;
    -- Your own solo space folds into your partner's: answers and progress come along, private.
    perform public._move_user_data(v_uid, v_old, v_target);
    update public.invitations set revoked_at = now()
     where relationship_id = v_old and used_at is null and revoked_at is null;
    delete from public.relationship_members where relationship_id = v_old and user_id = v_uid;
  end if;

  insert into public.relationship_members (relationship_id, user_id) values (v_target, v_uid);  -- trigger: max two
  update public.relationships set status = 'active' where id = v_target;
  update public.invitations set used_at = now(), used_by = v_uid where id = v_inv.id;
  update public.invitations set revoked_at = now()
   where relationship_id = v_target and used_at is null and revoked_at is null;
  insert into public.invitation_attempts (user_id, succeeded) values (v_uid, true);

  return jsonb_build_object('relationship_id', v_target, 'status', 'active');
end
$$;

-- ---------------------------------------------------------- get_my_relationship
-- The only way the browser learns anything about its space. It reveals the partner's display
-- name and chosen character and nothing else (no email, no id, no answers).
create or replace function public.get_my_relationship()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_rel     uuid;
  v_status  text;
  v_members integer;
  v_inv     timestamptz;
  v_partner jsonb;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select r.id, r.status into v_rel, v_status
    from public.relationships r
    join public.relationship_members m on m.relationship_id = r.id
   where m.user_id = v_uid;
  if v_rel is null then
    return null;
  end if;

  select count(*) into v_members from public.relationship_members where relationship_id = v_rel;

  select jsonb_build_object('display_name', coalesce(p.display_name, 'Partner'), 'selected_character', p.selected_character)
    into v_partner
    from public.relationship_members m
    left join public.profiles p on p.id = m.user_id
   where m.relationship_id = v_rel and m.user_id <> v_uid
   limit 1;

  select max(expires_at) into v_inv
    from public.invitations
   where relationship_id = v_rel and used_at is null and revoked_at is null and expires_at > now();

  return jsonb_build_object(
    'relationship_id', v_rel,
    'status', v_status,
    'member_count', v_members,
    'partner', v_partner,
    'invitation', case when v_inv is null then null else jsonb_build_object('expires_at', v_inv) end
  );
end
$$;

-- ----------------------------------------------------------- leave_relationship
create or replace function public.leave_relationship()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_old     uuid;
  v_members integer;
  v_new     uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select relationship_id into v_old from public.relationship_members where user_id = v_uid;
  if v_old is null then
    raise exception 'not_paired';
  end if;
  perform 1 from public.relationships where id = v_old for update;
  select count(*) into v_members from public.relationship_members where relationship_id = v_old;
  if v_members < 2 then
    raise exception 'not_paired';
  end if;

  -- 1) a fresh space of your own, 2) your answers/progress move into it (private),
  -- 3) you leave the old one (it returns to 'pending' for your partner) and join the new one.
  insert into public.relationships (created_by, status) values (v_uid, 'pending') returning id into v_new;
  perform public._move_user_data(v_uid, v_old, v_new);
  delete from public.relationship_members where relationship_id = v_old and user_id = v_uid;
  insert into public.relationship_members (relationship_id, user_id) values (v_new, v_uid);

  return jsonb_build_object('relationship_id', v_new);
end
$$;

-- -------------------------------------------------------------------- privileges
revoke all on function public._generate_invite_code()                from public, anon, authenticated;
revoke all on function public._normalize_invite_code(text)           from public, anon, authenticated;
revoke all on function public._move_user_data(uuid, uuid, uuid)      from public, anon, authenticated;
revoke all on function public.ensure_relationship()                  from public, anon, authenticated;
revoke all on function public.create_invitation()                    from public, anon, authenticated;
revoke all on function public.redeem_invitation(text)                from public, anon, authenticated;
revoke all on function public.get_my_relationship()                  from public, anon, authenticated;
revoke all on function public.leave_relationship()                   from public, anon, authenticated;

grant execute on function public.ensure_relationship()      to authenticated;
grant execute on function public.create_invitation()        to authenticated;
grant execute on function public.redeem_invitation(text)    to authenticated;
grant execute on function public.get_my_relationship()      to authenticated;
grant execute on function public.leave_relationship()       to authenticated;
