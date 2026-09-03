-- Trigger functions are invoked by PostgreSQL and must not be exposed as RPCs.
revoke all on function public.enforce_post_review_workflow() from public;
revoke all on function public.enforce_post_review_workflow() from anon;
revoke all on function public.enforce_post_review_workflow() from authenticated;

