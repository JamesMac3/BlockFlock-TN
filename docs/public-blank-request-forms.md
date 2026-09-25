# Public blank request forms — backend handoff

Applied 2026-09-25 to zvmfvyhhcxdzwlbquudw: migration 20260925193140_public_blank_request_forms.sql.

## Frontend contract

Call supabase.rpc('get_public_blank_request_forms') for the catalog, or pass {p_evidence_id: evidenceId} for one document. Both calls return arrays. Anonymous access is supported. Fields: evidence_id, title, county, government_entity, government_entity_id, mime_type, original_filename, storage_bucket, storage_path, upload_date.

Only published public base PDFs in request-templates with an existing storage object, active matching entity and a draft/in_review/verified profile are included. Private/quarantined evidence, policy documents, online portals and retired-only profiles are excluded. Blank-document publication is independent of automated filling-profile verification. Do not filter these results by verified profile status.

ArchivePage.jsx currently lists only two static blank forms from documentManifest.js. Replace that blank-form source with this RPC. Keep educational documents and legacy /documents/:slug URLs working; avoid duplicate static entries. get_public_archive_document requires goal links and is not the correct detail endpoint for these independent blank templates. Use the new optional-ID RPC and existing PDF viewer via a dedicated route. Build file URLs only from returned bucket/path, never arbitrary URL query parameters.

## Live import

Uploaded and imported the three Blount municipal forms; no county government, sheriff or city police forms were supplied. Downloaded uploaded files and verified SHA-256 matches the originals. IMPORT-reviewed.sql is the executed corrected import; original IMPORT.sql remains historical and must not be run.

| Entity | Entity ID | Evidence ID | Profile ID |
|---|---|---|---|
| Alcoa | 464 | 4f50af92-b781-4cae-8303-9d20f6f08af9 | 088dc16d-5097-4456-b811-c022a265a08c |
| Friendsville | 463 | 9fb0551c-fa3d-4c4d-8764-abcc748ddc1b | 2997555b-1ee1-47c9-9f82-d1ae290db926 |
| Maryville | 461 | 97000c98-b6e8-4ce5-ae33-0cd8501adeb5 | 5ef050d4-2089-480f-8318-631a897548c8 |

All three profiles are version 1, draft, with no verification or goal assignments. Blank evidence is public/published with import-admin review attribution and official source URLs. Current anonymous catalog returns 9 forms: six Rutherford and three Blount. Do not hardcode this count.

## Validation and limitations

Production-renderer harness via Vitest passes all ten scenarios: six Alcoa short/long plus delivery combinations, and short-success/long-rejection for each other city. Friendsville/Maryville mappings enforce a conservative 90-character description limit and do not support continuation; remain drafts pending mapping review. Alcoa also remains draft for operator approval. Original and generated sample pages were visually reviewed. Uploaded originals were not modified.

SQL regression checks passed for anonymous public listing, unknown IDs, draft-linked published blanks, private/quarantined exclusion, and inactive entity exclusion. Tests run in a rollback transaction; the fixture IDs are production-specific. Supabase advisor flags the new SECURITY DEFINER function as public/authenticated: intentional for this narrowly filtered public catalog, with empty search_path and explicit grants. It does not change bucket policies or claim to resolve existing advisor warnings.

Frontend has not been changed or deployed by this task. Claude should test anonymous listing and actual viewer navigation, mobile layout, loading/error/retry/empty states, unknown-ID handling and existing links. Preserve prior Safari/PDF decoder fixes.
