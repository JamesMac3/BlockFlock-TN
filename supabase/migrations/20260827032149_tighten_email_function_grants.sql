-- Supabase can retain explicit role-level EXECUTE privileges independently of
-- PUBLIC. Close every non-public email RPC before restoring intended grants.

revoke execute on function public.rrg_request_post_email_campaign(bigint, text) from anon;
revoke execute on function public.rrg_admin_review_email_campaign(bigint, boolean, text) from anon;
revoke execute on function public.rrg_list_email_campaigns(text, integer, integer) from anon;

revoke execute on function public.rrg_claim_email_deliveries(integer) from anon, authenticated;
revoke execute on function public.rrg_record_email_delivery_result(bigint, boolean, text, text) from anon, authenticated;
revoke execute on function public.rrg_claim_due_reminders(integer) from anon, authenticated;
revoke execute on function public.rrg_record_reminder_result(bigint, boolean, text, text) from anon, authenticated;
revoke execute on function public.rrg_process_resend_webhook(text, text, text, text) from anon, authenticated;

grant execute on function public.rrg_request_post_email_campaign(bigint, text) to authenticated;
grant execute on function public.rrg_admin_review_email_campaign(bigint, boolean, text) to authenticated;
grant execute on function public.rrg_list_email_campaigns(text, integer, integer) to authenticated;

grant execute on function public.rrg_claim_email_deliveries(integer) to service_role;
grant execute on function public.rrg_record_email_delivery_result(bigint, boolean, text, text) to service_role;
grant execute on function public.rrg_claim_due_reminders(integer) to service_role;
grant execute on function public.rrg_record_reminder_result(bigint, boolean, text, text) to service_role;
grant execute on function public.rrg_process_resend_webhook(text, text, text, text) to service_role;
