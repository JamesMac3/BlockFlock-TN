// Pure mirror of the branching setval() logic in
// supabase/migrations/20260821080000_sync_goal_and_template_sequences.sql.
// This is NOT the source of truth — the migration is — but there is no
// live database in this environment to execute it against, so this lets
// the empty-vs-populated branching be proven with real values.
export function resolveSequenceSetval(maxId) {
  if (maxId === null || maxId === undefined) {
    return { value: 1, isCalled: false };
  }
  return { value: maxId, isCalled: true };
}
