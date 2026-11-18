// Supabase adapter for questionnaire answers. Every function either resolves with what the
// database confirmed or throws; nothing is ever reported as saved before the database says so.
//
// Privacy notes
//  * The partner's answers are requested with an explicit filter (shared + submitted, not mine)
//    AND Row Level Security enforces the same rule on the server. The rows are filtered once
//    more here before use, so a private answer can never reach the partner view even if a
//    policy were misconfigured.
//  * No function here logs answer text or puts it into a URL (it only travels in the request body).
import { getQuestion } from '../data/questions.js';

export function createCloudAnswers({ getClient, auth, relationship }) {
  let idByKey = null;   // question_key -> uuid
  let keyById = null;   // uuid -> question_key

  async function client() {
    const c = await getClient();
    if (!c || !auth.status().signedIn) throw new Error('not_authenticated');
    return c;
  }

  async function loadQuestionIds(c) {
    if (idByKey) return;
    const { data, error } = await c.from('questions').select('id, question_key').eq('active', true);
    if (error) throw error;
    idByKey = new Map(data.map((r) => [r.question_key, r.id]));
    keyById = new Map(data.map((r) => [r.id, r.question_key]));
  }

  const toMine = (r) => ({
    questionKey: keyById.get(r.question_id),
    text: r.answer_text ?? '',
    choice: r.answer_choice ?? null,
    visibility: r.visibility,
    status: r.status,
    updatedAt: r.updated_at,
  });

  return {
    available: () => Boolean(auth.status().signedIn),

    /** Forget cached ids (e.g. after the question seed was updated). */
    resetCache() { idByKey = null; keyById = null; },

    async upsert(questionKey, { text, choice, visibility, status }) {
      if (!getQuestion(questionKey)) throw new Error('unknown_question');
      const c = await client();
      const space = await relationship.ensureSpace();
      if (!space.ok) throw new Error(space.error ?? 'no_space');
      await loadQuestionIds(c);
      const questionId = idByKey.get(questionKey);
      if (!questionId) throw new Error('question_not_seeded');
      const { data, error } = await c.from('answers').upsert({
        relationship_id: space.id,
        question_id: questionId,
        author_id: auth.userId,
        answer_text: text || null,
        answer_choice: choice || null,
        visibility,
        status,
      }, { onConflict: 'relationship_id,question_id,author_id' })
        .select('question_id, answer_text, answer_choice, visibility, status, updated_at')
        .single();
      if (error) throw error;
      return toMine(data);   // the row the database actually stored
    },

    async remove(questionKey) {
      const c = await client();
      await loadQuestionIds(c);
      const questionId = idByKey.get(questionKey);
      if (!questionId) return;
      const { error } = await c.from('answers').delete().eq('author_id', auth.userId).eq('question_id', questionId);
      if (error) throw error;
    },

    /** Only the signed-in user's own answers (own rows are always readable by their author). */
    async listMine() {
      const c = await client();
      await loadQuestionIds(c);
      const { data, error } = await c.from('answers')
        .select('question_id, answer_text, answer_choice, visibility, status, updated_at')
        .eq('author_id', auth.userId);
      if (error) throw error;
      return data.map(toMine).filter((a) => a.questionKey);
    },

    /** The partner's answers that they chose to share. Anything else is dropped here as well. */
    async listPartner() {
      const c = await client();
      await loadQuestionIds(c);
      const { data, error } = await c.from('answers')
        .select('question_id, author_id, answer_text, answer_choice, visibility, status, updated_at')
        .neq('author_id', auth.userId)
        .eq('visibility', 'shared')
        .eq('status', 'submitted');
      if (error) throw error;
      return data
        .filter((r) => r.author_id !== auth.userId && r.visibility === 'shared' && r.status === 'submitted')
        .map((r) => ({ questionKey: keyById.get(r.question_id), text: r.answer_text ?? '', choice: r.answer_choice ?? null, updatedAt: r.updated_at }))
        .filter((a) => a.questionKey);
    },
  };
}
