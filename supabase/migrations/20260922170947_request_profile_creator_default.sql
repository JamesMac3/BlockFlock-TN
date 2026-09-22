-- Existing create/replace RPCs omit created_by although it is NOT NULL.
-- auth.uid() remains the caller identity inside the existing definer RPCs.
alter table public.request_profiles alter column created_by set default auth.uid();
