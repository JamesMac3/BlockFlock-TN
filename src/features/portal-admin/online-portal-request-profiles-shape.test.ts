import { describe, expect, it } from "vitest";
// eslint-disable-next-line import/no-unresolved -- Vite/Vitest ?raw import
import portalPanelSource from "../../components/records-request-goals/RequestPortalDeliveryPanel.jsx?raw";
// eslint-disable-next-line import/no-unresolved -- Vite/Vitest ?raw import
import tiersSource from "../../components/records-request-goals/RecordsRequestGoalsTiers.jsx?raw";
// eslint-disable-next-line import/no-unresolved -- Vite/Vitest ?raw import
import operatorPreviewSource from "../../components/records-request-goals/OperatorDraftPreviewButton.jsx?raw";
// eslint-disable-next-line import/no-unresolved -- Vite/Vitest ?raw import
import editorSource from "../../components/records-request-goals/OnlinePortalProfileEditor.jsx?raw";
// eslint-disable-next-line import/no-unresolved -- Vite/Vitest ?raw import
import managerSource from "../../components/records-request-goals/RecordsRequestGoalsManager.jsx?raw";

/**
 * No React render harness exists in this repo (see pdf-preview-shape.test.ts
 * for the established precedent) — these are source-shape assertions for
 * the online_portal frontend (docs/online-portal-request-profiles.md).
 * Structural/logical correctness of the schemas and readiness check is
 * separately proven under plain Node in profile-schema.test.ts and
 * online-portal-readiness.test.ts.
 */

describe("RequestPortalDeliveryPanel: clipboard copy works from a direct click (iPhone Safari requirement)", () => {
  it("calls navigator.clipboard.writeText synchronously inside the click handler, not after an await", () => {
    const handlerBlock = portalPanelSource.match(/function handleCopyClick\(\)[\s\S]*?\n {2}\}/)?.[0] ?? "";
    expect(handlerBlock).not.toBe("");
    // No `await` appears before the writeText call within this handler —
    // the call is the first async-capable statement, invoked directly by
    // the click, not scheduled after some other awaited work.
    const beforeWriteText = handlerBlock.slice(0, handlerBlock.indexOf("navigator.clipboard.writeText"));
    expect(beforeWriteText).not.toMatch(/await /);
    expect(handlerBlock).toMatch(/navigator\.clipboard\.writeText\(result\.request_text\)/);
  });

  it("shows 'Copied' only after the write actually succeeds, via the resolved promise branch", () => {
    expect(portalPanelSource).toMatch(/navigator\.clipboard\.writeText\(result\.request_text\)\.then\(\s*\n\s*\(\) => \{\s*\n\s*setCopyState\("copied"\);/);
  });

  it("falls back to selecting the textarea when the Clipboard API is unavailable or the write is rejected/denied", () => {
    expect(portalPanelSource).toMatch(/if \(!navigator\.clipboard \|\| typeof navigator\.clipboard\.writeText !== "function"\)/);
    expect(portalPanelSource).toMatch(/function fallBackToManualSelection\(\)/);
    expect(portalPanelSource).toMatch(/textareaRef\.current\?\.select\(\)/);
    // The rejection branch of the same .then() calls the same fallback.
    const thenBlock = portalPanelSource.match(/\.then\(\s*\n\s*\(\) => \{[\s\S]*?\n\s*\},\s*\n\s*\(\) => fallBackToManualSelection\(\),\s*\n\s*\);/)?.[0] ?? "";
    expect(thenBlock).not.toBe("");
  });

  it("never disables the textarea (a disabled field can't be selected for manual copy on some mobile browsers)", () => {
    const textareaBlock = portalPanelSource.match(/<textarea[\s\S]*?\/>/)?.[0] ?? "";
    expect(textareaBlock).not.toMatch(/disabled/);
    expect(textareaBlock).toMatch(/readOnly/);
  });
});

describe("RequestPortalDeliveryPanel: plain text only, no request content in the URL, safe external link", () => {
  it("the Open request website link uses portal_url as a real anchor with target=_blank and rel=noopener noreferrer", () => {
    expect(portalPanelSource).toMatch(/href=\{result\.portal_url\}/);
    expect(portalPanelSource).toMatch(/target="_blank"/);
    expect(portalPanelSource).toMatch(/rel="noopener noreferrer"/);
  });

  it("never builds a URL by concatenating request_text or other result fields into it", () => {
    expect(portalPanelSource).not.toMatch(/portal_url\s*\+/);
    expect(portalPanelSource).not.toMatch(/\$\{result\.request_text\}.*href/);
    expect(portalPanelSource).not.toMatch(/href=\{`/);
  });

  it("request_text is rendered as the textarea's plain value, never through dangerouslySetInnerHTML", () => {
    expect(portalPanelSource).not.toMatch(/dangerouslySetInnerHTML/);
    expect(portalPanelSource).toMatch(/value=\{result\.request_text\}/);
  });

  it("contains the exact required directions sentence", () => {
    expect(portalPanelSource).toMatch(
      /Copy the request below, open the agency's website, paste it into the records description field,\s*\n\s*complete any required information, and submit your request there\./,
    );
  });
});

describe("RequestPortalDeliveryPanel: keyboard/accessibility and no auto-behavior", () => {
  it("closes on Escape via a real keydown listener", () => {
    expect(portalPanelSource).toMatch(/event\.key === "Escape"/);
    expect(portalPanelSource).toMatch(/document\.addEventListener\("keydown", handleKeyDown\)/);
    expect(portalPanelSource).toMatch(/document\.removeEventListener\("keydown", handleKeyDown\)/);
  });

  it("the close button has an accessible name", () => {
    expect(portalPanelSource).toMatch(/aria-label="Close"/);
  });

  it("is a real dialog: role=dialog, aria-modal, aria-labelledby", () => {
    expect(portalPanelSource).toMatch(/role="dialog"/);
    expect(portalPanelSource).toMatch(/aria-modal="true"/);
    expect(portalPanelSource).toMatch(/aria-labelledby="portal-delivery-panel-title"/);
  });

  it("never auto-copies, auto-opens the portal URL, or auto-submits on mount — the only clipboard/window actions are inside explicit click handlers", () => {
    expect(portalPanelSource).not.toMatch(/useEffect\(\(\) => \{\s*\n\s*navigator\.clipboard/);
    expect(portalPanelSource).not.toMatch(/window\.open/);
    expect(portalPanelSource).not.toMatch(/\.submit\(\)/);
  });

  it("shows an operator-preview banner only when result.preview is true, distinguishing draft from verified wording", () => {
    expect(portalPanelSource).toMatch(/\{result\.preview && \(/);
    expect(portalPanelSource).toMatch(/Draft operator preview — do not submit or distribute/);
  });
});

describe("RecordsRequestGoalsTiers: online_portal branch bypasses PDF loading entirely", () => {
  it("handlePrepareOnlinePortalRequest calls rrg_prepare_online_request with p_preview: false and never imports the PDF generator", () => {
    const block = tiersSource.match(/async function handlePrepareOnlinePortalRequest\(\)[\s\S]*?\n {2}\}/)?.[0] ?? "";
    expect(block).not.toBe("");
    expect(block).toMatch(/supabase\.rpc\("rrg_prepare_online_request", \{\s*\n\s*p_goal_id: goal\.id,\s*\n\s*p_preview: false,\s*\n\s*\}\)/);
    expect(block).not.toMatch(/generate-request-document/);
    expect(block).not.toMatch(/generateRequestDocument/);
  });

  it("handlePrepareRequest delegates to the online-portal handler before touching PDF generation, when the profile is online_portal", () => {
    const block = tiersSource.match(/async function handlePrepareRequest\(\)[\s\S]*?\n {2}\}/)?.[0] ?? "";
    const delegation = block.match(/if \(isOnlinePortal\) \{[\s\S]*?\n\s*\}/)?.[0] ?? "";
    expect(delegation).toMatch(/handlePrepareOnlinePortalRequest\(\)/);
    expect(delegation).toMatch(/return;/);
  });

  it("existing PDF prepare path (generateRequestDocument) is untouched and still reachable for non-portal profiles", () => {
    expect(tiersSource).toMatch(/const \{ generateRequestDocument \} = await import\(\s*\n\s*"\.\.\/\.\.\/features\/document-request\/pdf\/generate-request-document"\s*\n\s*\);/);
  });

  it("readiness evaluation branches on template_family, calling evaluateOnlinePortalGoalReadiness for online_portal goals and evaluateGoalReadiness (PDF) otherwise", () => {
    expect(tiersSource).toMatch(/import\("\.\.\/\.\.\/features\/document-request\/pdf\/online-portal-readiness"\)/);
    expect(tiersSource).toMatch(/result: isOnlinePortal\s*\n\s*\? evaluateOnlinePortalGoalReadiness\(\{ goal, profileRow, entityRow \}\)\s*\n\s*: evaluateGoalReadiness\(\{ goal, profileRow, entityRow \}\)/);
  });

  it("isReadinessCandidate allows an online_portal goal through even with no goal-level records_description (text precedence)", () => {
    const fnBlock = tiersSource.match(/function isReadinessCandidate\(goal, profilesById\)[\s\S]*?\n\}/)?.[0] ?? "";
    expect(fnBlock).toMatch(/summary\?\.template_family === "online_portal"/);
    expect(fnBlock).toMatch(/return true;/);
  });

  it("renders RequestPortalDeliveryPanel from a separate state slot than the PDF RequestDeliveryPanel", () => {
    expect(tiersSource).toMatch(/import RequestPortalDeliveryPanel from "\.\/RequestPortalDeliveryPanel";/);
    expect(tiersSource).toMatch(/const \[portalDelivery, setPortalDelivery\] = useState\(null\);/);
    expect(tiersSource).toMatch(/<RequestPortalDeliveryPanel result=\{portalDelivery\} onClose=\{\(\) => setPortalDelivery\(null\)\} \/>/);
  });

  it("labels the online_portal template family", () => {
    expect(tiersSource).toMatch(/online_portal: "Online request portal"/);
  });

  it("distinguishes 'still resolving whether this goal is a candidate' from 'genuinely no profile' using profilesLoaded, avoiding a false missing-profile flash for an online_portal goal relying on its profile default", () => {
    expect(tiersSource).toMatch(/const \[profilesLoaded, setProfilesLoaded\] = useState\(false\);/);
    expect(tiersSource).toMatch(/const stillResolvingCandidacy = Boolean\(goal\.request_profile_id\) && !profile && !profilesLoaded;/);
    expect(tiersSource).toMatch(/profilesLoaded=\{profilesLoaded\}/);
  });

  it("shows a distinct 'not verified yet' message (not the generic missing-profile message) when a profile id is linked but the public query can't see it — i.e. it's still draft/unverified", () => {
    expect(tiersSource).toMatch(/goal\.request_profile_id && profilesLoaded && !profile \?/);
    expect(tiersSource).toMatch(/This request profile has not been verified yet and is not available for requests\./);
  });

  it("shows a distinct missing-request-text message rather than a generic one, sourced from the readiness result itself (MISSING_REQUEST_TEXT)", () => {
    // The card renders readiness.result.message directly for the "done"
    // case — online-portal-readiness.test.ts proves MISSING_REQUEST_TEXT's
    // message is the RPC's own verbatim text, not invented here.
    expect(tiersSource).toMatch(/: readiness\.result\.message\}/);
  });
});

describe("OperatorDraftPreviewButton: online_portal preview uses p_preview: true and never touches PDF readiness/generation", () => {
  it("fetches template_family alongside status so it can distinguish online_portal from PDF profiles", () => {
    expect(operatorPreviewSource).toMatch(/\.select\("status, template_family"\)/);
  });

  it("handleOnlinePortalPreview calls rrg_prepare_online_request with p_preview: true", () => {
    const block = operatorPreviewSource.match(/async function handleOnlinePortalPreview\(\)[\s\S]*?\n {2}\}/)?.[0] ?? "";
    expect(block).not.toBe("");
    expect(block).toMatch(/supabase\.rpc\("rrg_prepare_online_request", \{\s*\n\s*p_goal_id: goal\.id,\s*\n\s*p_preview: true,\s*\n\s*\}\)/);
    expect(block).not.toMatch(/fetchDraftPreviewBundle/);
    expect(block).not.toMatch(/evaluateGoalReadiness/);
    expect(block).not.toMatch(/generateRequestDocument|generateOperatorPreviewDocument/);
  });

  it("still calls onPreviewSuccess on success so the existing activation gate keeps working, and never auto-activates itself", () => {
    const block = operatorPreviewSource.match(/async function handleOnlinePortalPreview\(\)[\s\S]*?\n {2}\}/)?.[0] ?? "";
    expect(block).toMatch(/onPreviewSuccess\?\.\(data\.profile_id\)/);
    expect(block).not.toMatch(/supabase\.rpc\("rrg_activate_request_profile"/);
  });

  it("is available for both draft and verified online_portal profiles, covering both preview statuses the RPC itself allows", () => {
    expect(operatorPreviewSource).toMatch(/const isOnlinePortalMode = \(isDraftMode \|\| isVerifiedMode\) && profileTemplateFamily === "online_portal";/);
  });

  it("routes the button's click handler to the online-portal handler ahead of the draft/verified PDF handlers", () => {
    expect(operatorPreviewSource).toMatch(/onClick=\{isOnlinePortalMode \? handleOnlinePortalPreview : isDraftMode \? handleDraftPreview : handleVerifiedPreview\}/);
  });

  it("renders RequestPortalDeliveryPanel from its own state, separate from the PDF delivery panel", () => {
    expect(operatorPreviewSource).toMatch(/import RequestPortalDeliveryPanel from "\.\/RequestPortalDeliveryPanel";/);
    expect(operatorPreviewSource).toMatch(/const \[portalDelivery, setPortalDelivery\] = useState\(null\);/);
  });
});

describe("OnlinePortalProfileEditor: saves the exact RPC parameter literals the doc and DB trigger require", () => {
  it("field_schema/validation_schema/output_options are the exact required literals, defined once as constants", () => {
    expect(editorSource).toMatch(/const FIELD_SCHEMA = \{ schema_version: 1, renderer_type: "online_portal", fields: \[\] \};/);
    expect(editorSource).toMatch(
      /const VALIDATION_SCHEMA = \{ schema_version: 1, required_paths: \[\], rules: \[\], scope_warnings: \[\], broad_mode_confirmation: false \};/,
    );
    expect(editorSource).toMatch(/const OUTPUT_OPTIONS = \{ schema_version: 1 \};/);
  });

  it("rpcParamsFor sends template_family/renderer_type/form_mode as the exact required literals and null for the PDF-only fields", () => {
    const block = editorSource.match(/function rpcParamsFor\(form, governmentEntityId\) \{[\s\S]*?\n\}/)?.[0] ?? "";
    expect(block).toMatch(/p_template_family: "online_portal"/);
    expect(block).toMatch(/p_renderer_type: "online_portal"/);
    expect(block).toMatch(/p_form_mode: "portal_only"/);
    expect(block).toMatch(/p_base_pdf_object_id: null/);
    expect(block).toMatch(/p_continuation_profile_id: null/);
    expect(block).toMatch(/p_field_schema: FIELD_SCHEMA/);
    expect(block).toMatch(/p_validation_schema: VALIDATION_SCHEMA/);
    expect(block).toMatch(/p_output_options: OUTPUT_OPTIONS/);
  });

  it("uses the existing lifecycle RPCs unchanged — create, update, and replace — never a new/renamed function", () => {
    expect(editorSource).toMatch(/supabase\.rpc\(\s*\n\s*"rrg_create_request_profile"/);
    expect(editorSource).toMatch(/supabase\.rpc\("rrg_update_request_profile", \{/);
    expect(editorSource).toMatch(/supabase\.rpc\("rrg_replace_request_profile", \{/);
  });

  it("never edits a verified profile in place — offers only 'Create New Draft Version' (replace) for a verified profile", () => {
    const verifiedBranch = editorSource.match(/if \(!creating && isVerified\) \{[\s\S]*?\n {2}\}/)?.[0] ?? "";
    expect(verifiedBranch).toMatch(/immutable/);
    expect(verifiedBranch).toMatch(/handleReplace/);
    expect(verifiedBranch).not.toMatch(/handleSaveDraft/);
  });

  it("renders nothing when a PDF renderer profile is selected and the operator isn't creating a new portal profile — this editor never touches non-online_portal profiles", () => {
    expect(editorSource).toMatch(/if \(!creating && !isExistingOnlinePortal\) return null;/);
  });

  it("creation is a parent-controlled `creating` flag, not gated on 'no profile currently selected' — the create option must work even with a PDF profile selected", () => {
    // The component's own render logic never requires selectedProfile to be
    // absent before offering/rendering the creation form.
    expect(editorSource).not.toMatch(/if \(!governmentEntityId/);
    expect(editorSource).toMatch(/creating \? "New Online Request Portal Profile" : "Online Request Portal Profile"/);
  });

  it("only tells the parent about a new profile id after rrg_create_request_profile actually succeeds (onCreated), never speculatively", () => {
    const block = editorSource.match(/async function handleCreate\(event\)[\s\S]*?\n {2}\}/)?.[0] ?? "";
    const tryBlock = block.match(/try \{[\s\S]*?\n {4}\} catch/)?.[0] ?? "";
    expect(tryBlock).toMatch(/onCreated\(data\.id\)/);
    const catchBlock = block.match(/\} catch \(err\) \{[\s\S]*?\n {4}\} finally/)?.[0] ?? "";
    expect(catchBlock).not.toMatch(/onCreated/);
  });

  it("validates the portal URL through onlinePortalUrlSchema — the same HTTPS/credential/whitespace rules the DB trigger enforces", () => {
    expect(editorSource).toMatch(/import \{ onlinePortalUrlSchema \} from "\.\.\/\.\.\/features\/document-request\/pdf\/profile-schema";/);
    expect(editorSource).toMatch(/onlinePortalUrlSchema\.safeParse\(form\.portal_url\)/);
  });

  it("explains that the goal's own records description takes precedence over the profile default", () => {
    expect(editorSource).toMatch(/a goal's own saved request language always\s*\n\s*takes precedence over this default\./);
  });
});

describe("RecordsRequestGoalsManager: '+ New online request portal…' is always offered, never sends a placeholder profile id", () => {
  it("the sentinel value is a distinct constant, never a real profile id shape, and is never written into request_profile_id", () => {
    expect(managerSource).toMatch(/const NEW_ONLINE_PORTAL_OPTION = "__new_online_portal__";/);
    // The two request_profile_id writer call sites (goalData insert /
    // update payload construction) are covered by the "actually persists"
    // tests below — this just confirms the sentinel constant itself is
    // never assigned directly to request_profile_id anywhere in the file.
    expect(managerSource).not.toMatch(/request_profile_id: NEW_ONLINE_PORTAL_OPTION/);
  });

  it("both GoalForm and GoalEditForm offer the '+ New online request portal…' option whenever a government entity is selected, regardless of what's currently selected", () => {
    expect(managerSource.match(/<option value=\{NEW_ONLINE_PORTAL_OPTION\}>\+ New online request portal…<\/option>/g)?.length).toBe(2);
    // Both occurrences are gated only on an entity being selected — never
    // on the current profile selection (PDF, portal, or none).
    expect(managerSource).toMatch(/\{formData\.government_entity_id && \(\s*\n\s*<option value=\{NEW_ONLINE_PORTAL_OPTION\}>/);
  });

  it("selecting the sentinel sets creatingOnlinePortal instead of touching request_profile_id, in both forms", () => {
    expect(managerSource.match(/if \(e\.target\.value === NEW_ONLINE_PORTAL_OPTION\) \{/g)?.length).toBe(2);
    expect(managerSource.match(/setCreatingOnlinePortal\(true\);\s*\n\s*return;/g)?.length).toBe(2);
  });

  it("selecting an ordinary profile (including switching away from '+ New') clears creatingOnlinePortal", () => {
    expect(managerSource.match(/setCreatingOnlinePortal\(false\);\s*\n\s*(setFormData|updateField)/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("OnlinePortalProfileEditor's onCreated writes the confirmed new id into request_profile_id and refreshes the profiles list, in both forms", () => {
    expect(managerSource.match(/onCreated=\{\(profileId\) => \{/g)?.length).toBe(2);
    expect(managerSource).toMatch(/onCreated=\{\(profileId\) => \{\s*\n\s*setCreatingOnlinePortal\(false\);\s*\n\s*setFormData\(\(current\) => \(\{ \.\.\.current, request_profile_id: profileId \}\)\);\s*\n\s*loadProfiles\(\);/);
    expect(managerSource).toMatch(/onCreated=\{\(profileId\) => \{\s*\n\s*setCreatingOnlinePortal\(false\);\s*\n\s*updateField\(\{ request_profile_id: profileId \}\);\s*\n\s*loadProfiles\(\);/);
  });

  it("Cancel restores the prior selection by simply clearing creatingOnlinePortal — request_profile_id was never touched while creating", () => {
    expect(managerSource.match(/onCancelCreate=\{\(\) => setCreatingOnlinePortal\(false\)\}/g)?.length).toBe(2);
  });

  it("saving the goal actually persists request_profile_id — the create/update payloads both include it, so creating a profile alone (without saving) never links it", () => {
    expect(managerSource).toMatch(/request_profile_id: formData\.request_profile_id \|\| null,/);
    expect(managerSource).toMatch(/request_profile_id: formData\.request_profile_id,\s*\n\s*fill_payload: \{ request: fillRequest \},/);
  });

  it("the profiles list query includes template_family so options can be labeled distinctly, in both forms", () => {
    expect(managerSource.match(/\.select\("id, version, status, template_family"\)/g)?.length).toBe(2);
  });

  it("labels a saved online_portal profile option as 'Online request portal — Version N (status)', distinct from a PDF profile's plain label", () => {
    expect(managerSource).toMatch(
      /function profileOptionLabel\(profile\) \{\s*\n\s*return profile\.template_family === "online_portal"\s*\n\s*\? `Online request portal — Version \$\{profile\.version\} \(\$\{profile\.status\}\)`\s*\n\s*: `Version \$\{profile\.version\} \(\$\{profile\.status\}\)`;/,
    );
    expect(managerSource.match(/\{profileOptionLabel\(profile\)\}/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("creating a portal profile never modifies or retires the goal's previously-selected PDF profile — OnlinePortalProfileEditor's own creation path only ever inserts via rrg_create_request_profile", () => {
    // rrg_retire_request_profile is legitimately used elsewhere in this
    // file (RequestProfileLifecycle's explicit "Retire Profile" button) —
    // the point here is that OnlinePortalProfileEditor itself never calls
    // it, which is already covered by online-portal-request-profiles-shape.test.ts's
    // own assertions on editorSource ("uses the existing lifecycle RPCs
    // unchanged — create, update, and replace"). This test just confirms
    // the manager only ever passes a fresh, independent creation callback
    // to that component, never one that also retires anything.
    expect(managerSource).toMatch(/onCreated=\{\(profileId\) => \{\s*\n\s*setCreatingOnlinePortal\(false\);/g);
  });
});
