// A stand-in for @supabase/supabase-js, used ONLY to test scripts/verify-rls.mjs offline.
// It turns the few client calls that script makes into SQL and runs them on the real migrations
// (embedded Postgres) as role `anon` or `authenticated`, with the user's id in the JWT setting,
// so the real row-level-security policies decide what comes back. It is not a general client.
import { createDb, createUser, asUser, asAnon } from '../helpers/db.js';
import { MUTATIONS } from './mutations.mjs';

let dbPromise = null;
const users = new Map();
const getDb = () => (dbPromise ??= (async () => {
  const db = await createDb();
  const m = process.env.MUTATE;
  if (m) {
    if (!MUTATIONS[m]) throw new Error(`unknown MUTATE ${m}`);
    await db.exec(MUTATIONS[m].sql);
  }
  return db;
})());

const ident = (s) => { if (!/^[a-z_][a-z0-9_]*$/.test(s)) throw new Error(`bad identifier ${s}`); return s; };
const failure = (e) => ({ data: null, error: { code: e.code, message: e.message }, count: null });

class Builder {
  constructor(client, table) {
    Object.assign(this, { c: client, table: ident(table), op: 'select', cols: '*', filters: [], opts: {}, wantRows: false, limitN: null, values: null, conflict: null });
  }
  select(cols = '*', opts = {}) { this.wantRows = true; if (this.op === 'select') { this.cols = cols; this.opts = opts; } return this; }
  insert(v) { this.op = 'insert'; this.values = v; return this; }
  upsert(v, o = {}) { this.op = 'upsert'; this.values = v; this.conflict = o.onConflict; return this; }
  update(v) { this.op = 'update'; this.values = v; return this; }
  delete() { this.op = 'delete'; return this; }
  eq(c, v) { this.filters.push([ident(c), '=', v]); return this; }
  neq(c, v) { this.filters.push([ident(c), '<>', v]); return this; }
  ilike(c, v) { this.filters.push([ident(c), 'ilike', v]); return this; }
  limit(n) { this.limitN = n; return this; }
  then(res, rej) { return this.run().then(res, rej); }

  async run() {
    const t = this.table; const params = [];
    const where = this.filters.length ? ` where ${this.filters.map(([c, op, v]) => { params.push(v); return `${c} ${op} $${params.length}`; }).join(' and ')}` : '';
    let sql; let head = false;
    if (this.op === 'select') {
      const cols = this.cols === '*' ? '*' : this.cols.split(',').map((x) => ident(x.trim())).join(', ');
      if (this.opts.head && this.opts.count) { head = true; sql = `select count(*)::int as count from public.${t}${where}`; }
      else sql = `select ${cols} from public.${t}${where}${this.limitN ? ` limit ${Number(this.limitN)}` : ''}`;
    } else if (this.op === 'insert' || this.op === 'upsert') {
      const keys = Object.keys(this.values).map(ident);
      const ph = keys.map((k) => { params.push(this.values[k]); return `$${params.length}`; });
      sql = `insert into public.${t} (${keys.join(', ')}) values (${ph.join(', ')})`;
      if (this.op === 'upsert') {
        const conf = this.conflict.split(',').map((x) => ident(x.trim()));
        sql += ` on conflict (${conf.join(', ')}) do update set ${keys.filter((k) => !conf.includes(k)).map((k) => `${k} = excluded.${k}`).join(', ')}`;
      }
      sql += ' returning *';
    } else if (this.op === 'update') {
      const keys = Object.keys(this.values).map(ident);
      // The filters took $1..$n above; the SET values continue the numbering.
      const sets = keys.map((k) => { params.push(this.values[k]); return `${k} = $${params.length}`; });
      sql = `update public.${t} set ${sets.join(', ')}${where} returning *`;
    } else if (this.op === 'delete') {
      sql = `delete from public.${t}${where} returning *`;
    }
    try {
      const rows = await this.c.exec((q) => q.query(sql, params));
      if (head) return { data: null, error: null, count: rows[0].count };
      return { data: this.op === 'select' || this.wantRows ? rows : null, error: null, count: null };
    } catch (e) { return failure(e); }
  }
}

export function createClient() {
  const client = {
    userId: null,
    async exec(fn) { const db = await getDb(); return this.userId ? asUser(db, this.userId, fn) : asAnon(db, fn); },
    auth: {
      async signInWithPassword({ email }) {
        const db = await getDb();
        if (!users.has(email)) users.set(email, await createUser(db, email.split('@')[0], email));
        client.userId = users.get(email);
        return { data: { user: { id: client.userId } }, error: null };
      },
      async getUser() { return { data: { user: client.userId ? { id: client.userId } : null } }; },
      async signOut() { client.userId = null; return { error: null }; },
    },
    from(table) { return new Builder(client, table); },
    async rpc(name, args = {}) {
      const keys = Object.keys(args).map(ident); const params = keys.map((k) => args[k]);
      const sql = `select public.${ident(name)}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as r`;
      try { const rows = await client.exec((q) => q.query(sql, params)); return { data: rows[0]?.r ?? null, error: null }; } catch (e) { return failure(e); }
    },
  };
  return client;
}
