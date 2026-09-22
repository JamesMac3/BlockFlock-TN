import { describe, expect, it } from "vitest";
// eslint-disable-next-line import/no-unresolved -- Vite/Vitest ?raw import
import portalPanelSource from "../../components/records-request-goals/RequestPortalDeliveryPanel.jsx?raw";
// eslint-disable-next-line import/no-unresolved -- Vite/Vitest ?raw import
import tiersSource from "../../components/records-request-goals/RecordsRequestGoalsTiers.jsx?raw";
// eslint-disable-next-line import/no-unresolved -- Vite/Vitest ?raw import
import operatorPreviewSource from "../../components/records-request-goals/OperatorDraftPreviewButton.jsx?raw";
// eslint-disable-next-line import/no-unresolved -- Vite/Vitest ?raw import
import editorSource from "../../components/records-request-goals/OnlinePortalProfileEditor.jsx?raw";

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
    const verifiedBranch = editorSource.match(/if \(isVerified\) \{[\s\S]*?\n {2}\}/)?.[0] ?? "";
    expect(verifiedBranch).toMatch(/immutable/);
    expect(verifiedBranch).toMatch(/handleReplace/);
    expect(verifiedBranch).not.toMatch(/handleSaveDraft/);
  });

  it("renders nothing when the selected profile is a PDF renderer type — this editor never touches non-online_portal profiles", () => {
    expect(editorSource).toMatch(/if \(selectedProfile && !isExistingOnlinePortal\) return null;/);
  });

  it("validates the portal URL through onlinePortalUrlSchema — the same HTTPS/credential/whitespace rules the DB trigger enforces", () => {
    expect(editorSource).toMatch(/import \{ onlinePortalUrlSchema \} from "\.\.\/\.\.\/features\/document-request\/pdf\/profile-schema";/);
    expect(editorSource).toMatch(/onlinePortalUrlSchema\.safeParse\(form\.portal_url\)/);
  });

  it("explains that the goal's own records description takes precedence over the profile default", () => {
    expect(editorSource).toMatch(/a goal's own saved request language always\s*\n\s*takes precedence over this default\./);
  });
});
