import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { usePortalAuth } from "../../auth/portalAuth";
import { supabase } from "../../lib/supabase";
import OperatorDraftPreviewButton from "./OperatorDraftPreviewButton";
import GoalCompletionUpload from "./GoalCompletionUpload";
import ExternalSourceForm from "./ExternalSourceForm";
import FillPayloadFields from "./FillPayloadFields";
import TabNav from "../admin/TabNav";
import AdminPopout from "../admin/AdminPopout";
import { classifyRpcError } from "../../features/portal-admin/rpcErrors";
import {
  publicVisibilityAllowed,
  applyPublicVisibilityRule,
  PUBLIC_VISIBILITY_BLOCKED_REASON,
  goalFormSnapshot,
  goalRowSnapshot,
  goalFormIsDirty,
} from "../../features/portal-admin/goalFormRules";
import "../admin/ContentManagementTable.css";
import "./RecordsRequestGoalsManager.css";

// A single frozen, referentially-stable empty object passed as
// FillPayloadFields' initialRequest whenever a goal has no fill_payload
// yet. Using `{}` inline instead would create a brand-new object on every
// render, which would make FillPayloadFields' own initialRequest-tracking
// effect (see FillPayloadFields.jsx) fire on every keystroke and reset
// whatever the operator just typed.
const EMPTY_FILL_REQUEST = Object.freeze({});

const GOAL_MANAGEMENT_TABS = [
  { id: "county-goals", label: "County Goals" },
  { id: "goal-templates", label: "Goal Templates" },
];

/**
 * Protected operator interface for managing records-request-goals
 * 
 * Admins can:
 * - Manage templates (create, update, delete, toggle active)
 * - Manage goals and links for all counties
 * - Clone templates to counties
 * 
 * Chapter masters can:
 * - Manage goals and links only for their assigned county
 * - Select government entity and request profile
 * - Edit only approved nonpersonal fill fields
 */

export default function RecordsRequestGoalsManager() {
  const { account, assignedCounty } = usePortalAuth();
  const [activeTab, setActiveTab] = useState("county-goals");
  const [state, setState] = useState({
    phase: "loading",
    error: null,
    goals: [],
    templates: [],
    entities: [],
    counties: [],
    selectedGoalId: null,
    editingGoal: null,
    showForm: false,
  });
  // Tracked separately from state.phase so a *background* refresh (e.g.
  // after saving a goal, adding a resource, or any other onRefresh call
  // from deep inside the tree) never swaps the whole admin/chapter-master
  // UI out for a bare loading message — doing that previously unmounted
  // GoalsTable and, with it, any open goal-editor popout, discarding its
  // in-progress state. Only the genuine first load still shows that
  // full-page state.
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  const isAdmin = account?.role === "admin";
  const countyId = isAdmin ? null : assignedCounty?.id;

  useEffect(() => {
    loadData();
  }, [isAdmin, countyId]);

  async function loadData() {
    setState((prev) => ({ ...prev, phase: "loading" }));

    try {
      if (isAdmin) {
        // Admins see all templates, counties, and entities for goal management
        const [templatesResult, countiesResult, entitiesResult] = await Promise.all([
          supabase
            .from("records_request_goal_templates")
            .select("*")
            .order("active", { ascending: false })
            .order("created_at", { ascending: false }),
          supabase
            .from("counties")
            .select("id, name, slug")
            .order("name"),
          supabase
            .from("government_entities")
            .select("id, county_id, legal_name, display_name")
            .order("display_name"),
        ]);

        if (templatesResult.error) throw templatesResult.error;
        if (countiesResult.error) throw countiesResult.error;
        if (entitiesResult.error) throw entitiesResult.error;

        setState((prev) => ({
          ...prev,
          templates: templatesResult.data ?? [],
          counties: countiesResult.data ?? [],
          entities: entitiesResult.data ?? [],
          phase: "ready",
        }));
        setHasLoadedOnce(true);
      } else if (countyId) {
        // Chapter masters see goals and entities for their county
        const [goalsResult, entitiesResult] = await Promise.all([
          supabase
            .from("county_records_request_goals")
            .select(
              `
              id,
              title,
              tier,
              status,
              is_public,
              locked,
              locked_reason,
              government_entity_id,
              request_profile_id,
              position,
              public_summary,
              fill_payload,
              created_at,
              updated_at,
              records_request_goal_links(id, label, position, is_primary, evidence_object_id, external_url, public_description)
            `
            )
            .eq("county_id", countyId)
            .order("position", { ascending: true }),
          supabase
            .from("government_entities")
            .select("id, county_id, legal_name, display_name")
            .eq("county_id", countyId)
            .order("display_name"),
        ]);

        if (goalsResult.error) throw goalsResult.error;
        if (entitiesResult.error) throw entitiesResult.error;

        setState((prev) => ({
          ...prev,
          goals: goalsResult.data ?? [],
          entities: entitiesResult.data ?? [],
          phase: "ready",
        }));
        setHasLoadedOnce(true);
      }
    } catch (error) {
      console.error("Failed to load records-request data:", error);
      setState((prev) => ({
        ...prev,
        phase: "error",
        error: error.message,
      }));
    }
  }

  if (state.phase === "loading" && !hasLoadedOnce) {
    return <div className="rrg-manager__status">Loading records-request goals...</div>;
  }

  if (state.phase === "error") {
    return (
      <div className="rrg-manager__error">
        <h3>Error Loading Data</h3>
        <p>{state.error}</p>
        <button type="button" onClick={loadData}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="rrg-manager">
      <header className="rrg-manager__header">
        <h2>Records Request Goals Management</h2>
        <p className="rrg-manager__subtitle">
          {isAdmin
            ? "Manage templates and goals for all counties"
            : `Manage goals for ${assignedCounty?.name}`}
        </p>
      </header>

      {isAdmin ? (
        <>
          <TabNav items={GOAL_MANAGEMENT_TABS} activeId={activeTab} onSelect={setActiveTab} label="Goal Management sections" />
          {activeTab === "county-goals" && (
            <AdminGoalsManager counties={state.counties} entities={state.entities} onRefresh={loadData} />
          )}
          {activeTab === "goal-templates" && (
            <AdminTemplateManager
              templates={state.templates}
              counties={state.counties}
              onRefresh={loadData}
            />
          )}
        </>
      ) : (
        <ChapterGoalsManager
          county={assignedCounty}
          goals={state.goals}
          entities={state.entities}
          onRefresh={loadData}
        />
      )}
    </div>
  );
}

function AdminTemplateManager({ templates, counties, onRefresh }) {
  const [creating, setCreating] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [cloneTarget, setCloneTarget] = useState(null);

  return (
    <section className="content-management rrg-templates">
      <div className="rrg-section-header">
        <h3>Goal Templates</h3>
        <button type="button" className="rrg-btn rrg-btn--primary" onClick={() => setCreating(true)}>
          Create Template
        </button>
      </div>

      {templates.length === 0 ? (
        <p className="rrg-empty">No templates yet</p>
      ) : (
        <table className="management-table">
          <thead>
            <tr>
              <th>Template title</th>
              <th>Seed key</th>
              <th>Default tier</th>
              <th>Active</th>
              <th>Purpose summary</th>
              <th>Updated</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {templates.map((template) => (
              <tr key={template.id}>
                <td>{template.title}</td>
                <td>{template.seed_key}</td>
                <td>{template.default_tier ? `Tier ${template.default_tier}` : "—"}</td>
                <td>
                  <span className={`rrg-badge ${template.active ? "rrg-badge--active" : "rrg-badge--inactive"}`}>
                    {template.active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td>{template.public_summary || "—"}</td>
                <td>{template.updated_at ? new Date(template.updated_at).toLocaleDateString() : "Not recorded"}</td>
                <td className="management-actions">
                  <button type="button" onClick={() => setEditingTemplate(template)} aria-label={`Edit ${template.title}`}>
                    ✎ Edit
                  </button>
                  <button type="button" onClick={() => setCloneTarget(template)}>
                    Clone to County
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {creating && (
        <AdminPopout title="Create Template" onClose={() => setCreating(false)}>
          <TemplateForm onSuccess={() => { setCreating(false); onRefresh(); }} />
        </AdminPopout>
      )}

      {editingTemplate && (
        <AdminPopout title={`Edit "${editingTemplate.title}"`} onClose={() => setEditingTemplate(null)}>
          <TemplateEditor
            template={editingTemplate}
            onUpdate={() => { setEditingTemplate(null); onRefresh(); }}
            onCancel={() => setEditingTemplate(null)}
          />
        </AdminPopout>
      )}

      {cloneTarget && (
        <AdminPopout title={`Clone "${cloneTarget.title}" to County`} onClose={() => setCloneTarget(null)}>
          <TemplateCloneForm
            template={cloneTarget}
            counties={counties}
            onSuccess={() => { setCloneTarget(null); onRefresh(); }}
            onCancel={() => setCloneTarget(null)}
          />
        </AdminPopout>
      )}
    </section>
  );
}

function TemplateForm({ onSuccess }) {
  const [formData, setFormData] = useState({
    seed_key: "",
    title: "",
    public_summary: "",
    default_position: 0,
    default_tier: null,
    active: true,
  });
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const { error: insertError } = await supabase
        .from("records_request_goal_templates")
        .insert([formData]);

      if (insertError) throw insertError;

      onSuccess();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="rrg-form" onSubmit={handleSubmit}>
      {error && <div className="rrg-error-message">{error}</div>}

      <div className="rrg-form-group">
        <label htmlFor="seed_key">Seed Key</label>
        <input
          id="seed_key"
          type="text"
          pattern="^[a-z0-9]+(_[a-z0-9]+)*$"
          value={formData.seed_key}
          onChange={(e) => setFormData({ ...formData, seed_key: e.target.value })}
          placeholder="e.g., birth_certificate_request"
          required
        />
        <small>Alphanumeric and underscores only, lowercase</small>
      </div>

      <div className="rrg-form-group">
        <label htmlFor="title">Title</label>
        <input
          id="title"
          type="text"
          maxLength="200"
          value={formData.title}
          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          required
        />
      </div>

      <div className="rrg-form-group">
        <label htmlFor="public_summary">Public Summary</label>
        <textarea
          id="public_summary"
          maxLength="2000"
          value={formData.public_summary}
          onChange={(e) => setFormData({ ...formData, public_summary: e.target.value })}
          rows="3"
        />
      </div>

      <div className="rrg-form-group">
        <label htmlFor="default_position">Position</label>
        <input
          id="default_position"
          type="number"
          min="0"
          value={formData.default_position}
          onChange={(e) => setFormData({ ...formData, default_position: parseInt(e.target.value) })}
        />
      </div>

      <div className="rrg-form-group">
        <label htmlFor="template-default-tier">Default tier</label>
        <select
          id="template-default-tier"
          value={formData.default_tier ?? ""}
          onChange={(e) => setFormData({ ...formData, default_tier: e.target.value ? Number(e.target.value) : null })}
        >
          <option value="">-- No default tier --</option>
          {TIER_OPTIONS.map((tier) => <option key={tier} value={tier}>Tier {tier}</option>)}
        </select>
      </div>

      <div className="rrg-form-group">
        <label>
          <input
            type="checkbox"
            checked={formData.active}
            onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
          />
          Active
        </label>
      </div>

      <button type="submit" className="rrg-btn rrg-btn--primary" disabled={submitting}>
        {submitting ? "Creating..." : "Create Template"}
      </button>
    </form>
  );
}

function TemplateEditor({ template, onUpdate, onCancel }) {
  const [formData, setFormData] = useState(template);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const { error: updateError } = await supabase
        .from("records_request_goal_templates")
        .update({
          title: formData.title,
          public_summary: formData.public_summary,
          default_tier: formData.default_tier,
          default_position: formData.default_position,
          active: formData.active,
        })
        .eq("id", template.id);
      if (updateError) throw updateError;
      onUpdate();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rrg-goal-edit-form">
      {error && <div className="rrg-error-message">{error}</div>}

      <div className="rrg-form-group">
        <label>Title</label>
        <input type="text" value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} />
      </div>

      <div className="rrg-form-group">
        <label>Seed Key</label>
        <input type="text" value={formData.seed_key} disabled />
      </div>

      <div className="rrg-form-group">
        <label>Default tier</label>
        <select
          value={formData.default_tier ?? ""}
          onChange={(e) => setFormData({ ...formData, default_tier: e.target.value ? Number(e.target.value) : null })}
        >
          <option value="">-- No default tier --</option>
          {TIER_OPTIONS.map((tier) => <option key={tier} value={tier}>Tier {tier}</option>)}
        </select>
      </div>

      <div className="rrg-form-group">
        <label>Purpose summary</label>
        <textarea
          rows={3}
          maxLength={2000}
          value={formData.public_summary ?? ""}
          onChange={(e) => setFormData({ ...formData, public_summary: e.target.value })}
        />
      </div>

      <div className="rrg-form-group">
        <label>
          <input type="checkbox" checked={formData.active} onChange={(e) => setFormData({ ...formData, active: e.target.checked })} />
          Active
        </label>
      </div>

      <div className="rrg-goal-actions">
        <button type="button" className="rrg-btn rrg-btn--primary" onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save"}
        </button>
        <button type="button" className="rrg-btn" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function TemplateCloneForm({ template, counties, onSuccess, onCancel }) {
  const [selectedCountyId, setSelectedCountyId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  async function handleClone() {
    if (!selectedCountyId) {
      setError("Please select a county");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const { error: rpcError } = await supabase.rpc(
        "rrg_clone_template_to_county",
        {
          p_template_id: template.id,
          p_county_id: selectedCountyId,
        }
      );

      if (rpcError) throw rpcError;

      onSuccess();
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  }

  return (
    <div className="rrg-clone-form">
      <h4>Clone "{template.title}" to County</h4>

      {error && <div className="rrg-error-message">{error}</div>}

      <div className="rrg-form-group">
        <label htmlFor="clone-county">Target County</label>
        <select
          id="clone-county"
          value={selectedCountyId ?? ""}
          onChange={(e) => setSelectedCountyId(e.target.value ? parseInt(e.target.value) : null)}
        >
          <option value="">-- Select a county --</option>
          {counties.map((county) => (
            <option key={county.id} value={county.id}>
              {county.name}
            </option>
          ))}
        </select>
      </div>

      <div className="rrg-clone-actions">
        <button
          type="button"
          className="rrg-btn rrg-btn--primary"
          onClick={handleClone}
          disabled={submitting || !selectedCountyId}
        >
          {submitting ? "Cloning..." : "Clone"}
        </button>
        <button type="button" className="rrg-btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function AdminGoalsManager({ counties, entities, onRefresh }) {
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);
  // Same reasoning as RecordsRequestGoalsManager's hasLoadedOnce: a
  // background refresh (after saving a goal, uploading a resource, etc.)
  // must not swap GoalsTable out for a bare loading message, which would
  // unmount it and discard any open goal-editor popout's state. Only the
  // very first load for a given county selection still shows it.
  const [hasLoadedGoalsOnce, setHasLoadedGoalsOnce] = useState(false);
  const [selectedCountyId, setSelectedCountyId] = useState(counties.length > 0 ? counties[0].id : null);
  const [showCreateForm, setShowCreateForm] = useState(false);

  useEffect(() => {
    loadGoals();
  }, [selectedCountyId]);

  async function loadGoals() {
    if (!selectedCountyId) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("county_records_request_goals")
        .select(
          `
          id,
          title,
          tier,
          status,
          is_public,
          locked,
          locked_reason,
          government_entity_id,
          request_profile_id,
          position,
          public_summary,
          fill_payload,
          created_at,
          updated_at,
          records_request_goal_links(id, label, position, is_primary, evidence_object_id, external_url, public_description)
        `
        )
        .eq("county_id", selectedCountyId)
        .order("position", { ascending: true });

      if (error) throw error;

      setGoals(data ?? []);
      setHasLoadedGoalsOnce(true);
    } catch (error) {
      console.error("Failed to load goals:", error);
    } finally {
      setLoading(false);
    }
  }

  const countyEntities = entities.filter((e) => e.county_id === selectedCountyId);

  return (
    <section className="rrg-admin-goals">
      <div className="rrg-section-header">
        <h3>County Goals</h3>
        <button type="button" className="rrg-btn rrg-btn--primary" onClick={() => setShowCreateForm(!showCreateForm)} disabled={!selectedCountyId}>
          {showCreateForm ? "Cancel" : "Create Goal"}
        </button>
      </div>

      <div className="rrg-form-group">
        <label htmlFor="admin-county-select">View Goals for County</label>
        <select
          id="admin-county-select"
          value={selectedCountyId ?? ""}
          onChange={(e) => setSelectedCountyId(parseInt(e.target.value))}
        >
          {counties.map((county) => (
            <option key={county.id} value={county.id}>
              {county.name}
            </option>
          ))}
        </select>
      </div>

      {showCreateForm && selectedCountyId && (
        <GoalForm
          county={counties.find((c) => c.id === selectedCountyId)}
          entities={entities.filter((e) => e.county_id === selectedCountyId)}
          isAdmin
          onSuccess={() => {
            setShowCreateForm(false);
            loadGoals();
            onRefresh();
          }}
        />
      )}

      {loading && !hasLoadedGoalsOnce ? (
        <p className="rrg-status">Loading goals...</p>
      ) : (
        <GoalsTable
          goals={goals}
          county={counties.find((c) => c.id === selectedCountyId)}
          entities={countyEntities}
          isAdmin
          onUpdate={() => {
            loadGoals();
            onRefresh();
          }}
        />
      )}
    </section>
  );
}

function ChapterGoalsManager({ county, goals, entities, onRefresh }) {
  const [showForm, setShowForm] = useState(false);

  return (
    <section className="rrg-goals">
      <div className="rrg-section-header">
        <h3>Records Request Goals</h3>
        <button
          type="button"
          className="rrg-btn rrg-btn--primary"
          onClick={() => setShowForm(!showForm)}
        >
          {showForm ? "Cancel" : "Create Goal"}
        </button>
      </div>

      {showForm && (
        <GoalForm
          county={county}
          entities={entities}
          isAdmin={false}
          onSuccess={() => {
            setShowForm(false);
            onRefresh();
          }}
        />
      )}

      <GoalsTable
        goals={goals}
        county={county}
        entities={entities}
        isAdmin={false}
        onUpdate={onRefresh}
      />
    </section>
  );
}

function GoalForm({ county, entities, isAdmin = true, onSuccess }) {
  const [formData, setFormData] = useState({
    title: "",
    // county_records_request_goals.tier is NOT NULL with a 1-4 CHECK
    // constraint live — this must never submit null.
    tier: 1,
    public_summary: "",
    // Chapter masters only ever see draft/ready/published in the status
    // selector below, so their new goal must start in one of those —
    // admins keep the full internal workflow's usual starting point.
    status: isAdmin ? "profile_needed" : "draft",
    is_public: false,
    government_entity_id: null,
    request_profile_id: null,
    locked: false,
    locked_reason: "",
  });
  const [profiles, setProfiles] = useState([]);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [fillRequest, setFillRequest] = useState({});
  const [fillValid, setFillValid] = useState(true);

  async function loadProfiles() {
    if (!formData.government_entity_id) {
      setProfiles([]);
      return;
    }

    try {
      // Every profile status is shown (not just verified) — see the
      // matching comment in GoalEditForm's loadProfiles.
      const { data, error } = await supabase
        .from("request_profiles")
        .select("id, version, status")
        .eq("government_entity_id", formData.government_entity_id)
        .order("version", { ascending: false });

      if (error) throw error;

      setProfiles(data ?? []);
    } catch (err) {
      console.error("Failed to load profiles:", err);
      setProfiles([]);
    }
  }

  useEffect(() => {
    const timer = setTimeout(loadProfiles, 0);
    return () => clearTimeout(timer);
  }, [formData.government_entity_id]);

  const selectedEntity = entities.find((entity) => entity.id === formData.government_entity_id);

  const trimmedLockedReason = formData.locked_reason.trim();
  const lockedReasonMissing = formData.locked && trimmedLockedReason.length === 0;

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    if (!fillValid && formData.request_profile_id) {
      setError("The structured request data is not valid for the selected profile.");
      return;
    }

    if (lockedReasonMissing) {
      setError("A locked goal requires a non-blank reason.");
      return;
    }

    setSubmitting(true);

    try {
      // Re-applied here, not just on the status <select>'s onChange — a
      // defense-in-depth guarantee that this exact payload can never carry
      // the live-forbidden draft/retired + public combination, even if some
      // future code path sets is_public without going through the field
      // handler above.
      const goalData = applyPublicVisibilityRule({
        county_id: county.id,
        title: formData.title,
        tier: formData.tier,
        public_summary: formData.public_summary,
        status: formData.status,
        is_public: formData.is_public,
        government_entity_id: formData.government_entity_id || null,
        request_profile_id: formData.request_profile_id || null,
        fill_payload: { request: fillRequest },
        locked: formData.locked,
        locked_reason: formData.locked ? trimmedLockedReason : null,
      });

      const { error: insertError } = await supabase
        .from("county_records_request_goals")
        .insert([goalData]);

      if (insertError) throw insertError;

      onSuccess();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="rrg-form" onSubmit={handleSubmit}>
      {error && <div className="rrg-error-message">{error}</div>}

      <div className="rrg-form-group">
        <label htmlFor="goal-title">Title</label>
        <input
          id="goal-title"
          type="text"
          maxLength="200"
          value={formData.title}
          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          required
        />
      </div>

      <div className="rrg-form-group">
        <label htmlFor="goal-summary">Public Summary</label>
        <textarea
          id="goal-summary"
          maxLength="2000"
          value={formData.public_summary}
          onChange={(e) => setFormData({ ...formData, public_summary: e.target.value })}
          rows="3"
        />
      </div>

      <div className="rrg-form-group">
        <label htmlFor="goal-tier">Tier</label>
        <select
          id="goal-tier"
          value={formData.tier}
          onChange={(e) => setFormData({ ...formData, tier: Number(e.target.value) })}
          required
        >
          {[1, 2, 3, 4].map((tier) => <option key={tier} value={tier}>Tier {tier}</option>)}
        </select>
      </div>

      <div className="rrg-form-group">
        <label htmlFor="goal-entity">Government Entity</label>
        <select
          id="goal-entity"
          value={formData.government_entity_id ?? ""}
          onChange={(e) =>
            setFormData({
              ...formData,
              government_entity_id: e.target.value ? parseInt(e.target.value) : null,
              request_profile_id: null,
            })
          }
        >
          <option value="">-- No entity selected --</option>
          {entities.map((entity) => (
            <option key={entity.id} value={entity.id}>
              {entity.display_name || entity.legal_name}
            </option>
          ))}
        </select>
      </div>

      <div className="rrg-form-group">
        <label htmlFor="goal-profile">
          Request Profile {!formData.government_entity_id && "(select entity first)"}
        </label>
        <select
          id="goal-profile"
          value={formData.request_profile_id ?? ""}
          onChange={(e) =>
            setFormData({ ...formData, request_profile_id: e.target.value ? e.target.value : null })
          }
          disabled={!formData.government_entity_id}
        >
          <option value="">-- No profile selected --</option>
          {profiles.map((profile) => (
            <option key={profile.id} value={profile.id}>
              Version {profile.version} ({profile.status})
            </option>
          ))}
        </select>
        {formData.government_entity_id && profiles.length === 0 && (
          <small className="rrg-fill-payload__hint">
            No request profile exists yet for this government entity.
          </small>
        )}
      </div>

      {formData.request_profile_id && (
        <div className="rrg-form-group">
          <label>Structured request data</label>
          <FillPayloadFields
            profileId={formData.request_profile_id}
            entity={selectedEntity}
            initialRequest={EMPTY_FILL_REQUEST}
            goalLanguage={formData.public_summary}
            onValidChange={(valid, request) => { setFillValid(valid); setFillRequest(request); }}
          />
        </div>
      )}

      <div className="rrg-form-group">
        <label htmlFor="goal-status">Status</label>
        <select
          id="goal-status"
          value={formData.status}
          onChange={(e) => setFormData((current) => applyPublicVisibilityRule({ ...current, status: e.target.value }))}
        >
          {isAdmin ? (
            <>
              <option value="draft">Draft</option>
              <option value="profile_needed">Profile Needed</option>
              <option value="ready">Ready</option>
              <option value="requested">Requested</option>
              <option value="received">Received</option>
              <option value="published">Published</option>
              <option value="unavailable">Unavailable</option>
              <option value="retired">Retired</option>
            </>
          ) : (
            <>
              <option value="draft">Draft</option>
              <option value="ready">Ready</option>
              <option value="published">Published</option>
            </>
          )}
        </select>
      </div>

      <div className="rrg-form-group">
        <label>
          <input
            type="checkbox"
            checked={formData.is_public}
            disabled={!publicVisibilityAllowed(formData.status)}
            onChange={(e) => setFormData({ ...formData, is_public: e.target.checked })}
          />
          Public Visibility
        </label>
        {!publicVisibilityAllowed(formData.status) && (
          <small className="rrg-fill-payload__hint">{PUBLIC_VISIBILITY_BLOCKED_REASON}</small>
        )}
      </div>

      <div className="rrg-form-group">
        <label>
          <input
            type="checkbox"
            checked={formData.locked}
            onChange={(e) => setFormData({ ...formData, locked: e.target.checked })}
          />
          Locked
        </label>
      </div>

      {formData.locked && (
        <div className="rrg-form-group">
          <label htmlFor="goal-locked-reason">Locked Reason (required)</label>
          <textarea
            id="goal-locked-reason"
            maxLength="500"
            value={formData.locked_reason}
            onChange={(e) => setFormData({ ...formData, locked_reason: e.target.value })}
            rows="2"
            required
          />
        </div>
      )}

      <button
        type="submit"
        className="rrg-btn rrg-btn--primary"
        disabled={submitting || (!fillValid && Boolean(formData.request_profile_id)) || lockedReasonMissing}
      >
        {submitting ? "Creating..." : "Create Goal"}
      </button>
    </form>
  );
}

const GOAL_STATUS_OPTIONS = [
  "draft", "profile_needed", "ready", "requested", "received", "published", "unavailable", "retired",
];
// Chapter masters manage the day-to-day request lifecycle without needing
// (or being exposed to) the full internal workflow vocabulary — the
// database enum, RLS, and every other internal status value are
// unchanged; this is a UI-only restriction. An admin still has the full
// list and can move a goal through any of the internal-only statuses.
const CHAPTER_MASTER_GOAL_STATUS_OPTIONS = ["draft", "ready", "published"];
const TIER_OPTIONS = [1, 2, 3, 4];

function GoalEditForm({ goal, entities, isAdmin, onSave, onCancel, onDirtyChange }) {
  const [formData, setFormData] = useState(goal);
  const [profiles, setProfiles] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [fillRequest, setFillRequest] = useState(goal.fill_payload?.request ?? EMPTY_FILL_REQUEST);
  const [fillValid, setFillValid] = useState(true);
  const [fillIssueSummary, setFillIssueSummary] = useState(null);
  const [savedAt, setSavedAt] = useState(null);
  // The saved baseline this form was opened with, as a normalized snapshot
  // string. Dirty is a *derived* comparison (current snapshot !== baseline
  // snapshot) rather than a manually-toggled flag, so initial hydration and
  // revalidation passes can never mark an untouched form dirty — only an
  // actual value change can, because only an actual value change moves the
  // current snapshot away from the baseline.
  const [baselineSnapshot, setBaselineSnapshot] = useState(() => goalRowSnapshot(goal));

  const currentSnapshot = goalFormSnapshot(formData, fillRequest);
  const dirty = goalFormIsDirty(baselineSnapshot, currentSnapshot);

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  // Re-hydrates from a freshly refetched goal row (e.g. after adding a
  // resource elsewhere in the same open panel, or the parent's query now
  // returning the full row instead of a lightweight projection) — but only
  // while the form is genuinely untouched. `dirty` is read fresh at effect
  // time rather than listed as a dependency, specifically so this never
  // fires again merely because the operator typed something (which flips
  // dirty to true but does not change the `goal` prop itself).
  useEffect(() => {
    if (dirty) return undefined;
    const timer = setTimeout(() => {
      setFormData(goal);
      setFillRequest(goal.fill_payload?.request ?? EMPTY_FILL_REQUEST);
      setBaselineSnapshot(goalRowSnapshot(goal));
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see comment above: dirty is read, not depended on
  }, [goal]);

  function updateField(changes) {
    setFormData((current) => applyPublicVisibilityRule({ ...current, ...changes }));
    // A fresh edit supersedes the last "Saved" confirmation — showing it
    // stale while the operator has since made further changes would be
    // misleading about which values are actually persisted.
    setSavedAt(null);
  }

  async function loadProfiles() {
    if (!formData.government_entity_id) {
      setProfiles([]);
      return;
    }
    try {
      // Every profile status is shown here (not just verified) so an
      // operator can link a goal to a draft profile still in progress —
      // the operator-preview path is exactly what makes a draft profile
      // usable before it's verified. Public/anonymous generation still
      // independently requires status = 'verified' downstream.
      const { data, error: profileError } = await supabase
        .from("request_profiles")
        .select("id, version, status")
        .eq("government_entity_id", formData.government_entity_id)
        .order("version", { ascending: false });
      if (profileError) throw profileError;
      setProfiles(data ?? []);
    } catch (err) {
      console.error("Failed to load profiles:", err);
      setProfiles([]);
    }
  }

  useEffect(() => {
    const timer = setTimeout(loadProfiles, 0);
    return () => clearTimeout(timer);
  }, [formData.government_entity_id]);

  const lockedReasonMissing = Boolean(formData.locked) && !formData.locked_reason?.trim();
  const fillInvalid = !fillValid && Boolean(formData.request_profile_id);
  const selectedEntity = entities.find((entity) => entity.id === formData.government_entity_id);

  // Whenever Save is disabled, this names the exact reason rather than
  // leaving the operator to guess. Checked in priority order: an
  // in-flight save always wins (nothing else matters mid-request), then
  // the two structural blockers. Changing goal status alone never lands
  // in either blocker branch — status isn't part of fillValid's inputs
  // and doesn't touch locked/locked_reason.
  const saveDisabledReason = saving
    ? "Saving is currently in progress."
    : lockedReasonMissing
      ? "A locked goal needs a reason."
      : fillInvalid
        ? `Structured request data is invalid${fillIssueSummary ? ` — ${fillIssueSummary}` : "."}`
        : null;

  async function handleSave() {
    if (lockedReasonMissing) {
      setError("A locked goal requires a non-blank locked reason.");
      return;
    }
    if (fillInvalid) {
      setError(`The structured request data is not valid for the selected profile${fillIssueSummary ? ` — ${fillIssueSummary}` : "."}`);
      return;
    }

    if (saving) return;

    setSaving(true);
    setError(null);
    try {
      // Re-applied here, not just in updateField's onChange path — the
      // same defense-in-depth guarantee as the create form: this exact
      // payload can never carry the live-forbidden draft/retired + public
      // combination.
      const payload = applyPublicVisibilityRule({
        title: formData.title,
        tier: formData.tier,
        public_summary: formData.public_summary,
        status: formData.status,
        is_public: formData.is_public,
        locked: formData.locked,
        locked_reason: formData.locked ? formData.locked_reason.trim() : null,
        government_entity_id: formData.government_entity_id,
        request_profile_id: formData.request_profile_id,
        fill_payload: { request: fillRequest },
      });
      const { error: updateError } = await supabase
        .from("county_records_request_goals")
        .update(payload)
        .eq("id", goal.id);
      if (updateError) throw updateError;
      // The just-saved values become the new baseline immediately, without
      // waiting for the parent's refetch round-trip — dirty is derived, so
      // this alone is what makes it read false again right after a save.
      setBaselineSnapshot(goalFormSnapshot({ ...formData, ...payload }, fillRequest));
      setSavedAt(Date.now());
      // Reconciles the parent's goal list in the background — onSave never
      // closes this popout itself; only Cancel/Close/Delete do.
      onSave();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rrg-goal-edit-form">
      {error && <div className="rrg-error-message">{error}</div>}

      <div className="rrg-form-group">
        <label>Title</label>
        <input type="text" value={formData.title} onChange={(e) => updateField({ title: e.target.value })} />
      </div>

      <div className="rrg-form-group">
        <label>Tier</label>
        {/* county_records_request_goals.tier is NOT NULL with a 1-4 CHECK
            constraint live — this select never offers a null option. */}
        <select value={formData.tier ?? 1} onChange={(e) => updateField({ tier: Number(e.target.value) })} required>
          {TIER_OPTIONS.map((tier) => <option key={tier} value={tier}>Tier {tier}</option>)}
        </select>
      </div>

      <div className="rrg-form-group">
        <label>Government Entity</label>
        <select
          value={formData.government_entity_id ?? ""}
          onChange={(e) => updateField({ government_entity_id: e.target.value ? parseInt(e.target.value) : null, request_profile_id: null })}
        >
          <option value="">-- No entity --</option>
          {entities.map((entity) => (
            <option key={entity.id} value={entity.id}>{entity.display_name || entity.legal_name}</option>
          ))}
        </select>
      </div>

      <div className="rrg-form-group">
        <label>Request Profile</label>
        <select
          value={formData.request_profile_id ?? ""}
          onChange={(e) => updateField({ request_profile_id: e.target.value || null })}
          disabled={!formData.government_entity_id}
        >
          <option value="">-- No profile --</option>
          {profiles.map((profile) => (
            <option key={profile.id} value={profile.id}>Version {profile.version} ({profile.status})</option>
          ))}
        </select>
        {formData.government_entity_id && profiles.length === 0 && (
          <small className="rrg-fill-payload__hint">
            No request profile exists yet for this government entity — a profile is required before this goal's
            request document can be previewed or generated.
          </small>
        )}
      </div>

      {formData.request_profile_id && (
        <div className="rrg-form-group">
          <label>Structured request data</label>
          <FillPayloadFields
            profileId={formData.request_profile_id}
            entity={selectedEntity}
            initialRequest={goal.fill_payload?.request ?? EMPTY_FILL_REQUEST}
            goalLanguage={formData.public_summary}
            onValidChange={(valid, request, issueSummary) => {
              setFillValid(valid);
              setFillRequest(request);
              setFillIssueSummary(issueSummary);
            }}
          />
        </div>
      )}

      <div className="rrg-form-group">
        <label>Status</label>
        <select value={formData.status} onChange={(e) => updateField({ status: e.target.value })}>
          {(isAdmin ? GOAL_STATUS_OPTIONS : CHAPTER_MASTER_GOAL_STATUS_OPTIONS).map((status) => (
            <option key={status} value={status}>{status}</option>
          ))}
          {!isAdmin && !CHAPTER_MASTER_GOAL_STATUS_OPTIONS.includes(formData.status) && (
            <option value={formData.status} disabled>{formData.status} (internal workflow status — an administrator manages this)</option>
          )}
        </select>
      </div>

      <div className="rrg-form-group">
        <label>
          <input
            type="checkbox"
            checked={formData.is_public}
            disabled={!publicVisibilityAllowed(formData.status)}
            onChange={(e) => updateField({ is_public: e.target.checked })}
          />
          Public
        </label>
        {!publicVisibilityAllowed(formData.status) && (
          <small className="rrg-fill-payload__hint">{PUBLIC_VISIBILITY_BLOCKED_REASON}</small>
        )}
      </div>

      <div className="rrg-form-group">
        <label>
          <input
            type="checkbox"
            checked={Boolean(formData.locked)}
            onChange={(e) => {
              const nextLocked = e.target.checked;
              if (!nextLocked && formData.locked_reason?.trim() && !confirm("Clear the locked reason too?")) {
                updateField({ locked: false });
                return;
              }
              updateField({ locked: nextLocked, locked_reason: nextLocked ? formData.locked_reason : "" });
            }}
          />
          Locked
        </label>
      </div>

      {formData.locked && (
        <div className="rrg-form-group">
          <label>Locked reason *</label>
          <textarea
            rows={2}
            maxLength={500}
            value={formData.locked_reason ?? ""}
            onChange={(e) => updateField({ locked_reason: e.target.value })}
          />
          <small>Shown publicly wherever this locked goal is displayed.</small>
          {lockedReasonMissing && <small className="rrg-fill-payload__error">A non-blank locked reason is required while Locked is checked.</small>}
        </div>
      )}

      <div className="rrg-goal-actions">
        <button
          type="button"
          className="rrg-btn rrg-btn--primary"
          onClick={handleSave}
          disabled={Boolean(saveDisabledReason)}
        >
          {saving ? "Saving..." : "Save"}
        </button>
        <button type="button" className="rrg-btn" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        {saveDisabledReason && <span className="rrg-fill-payload__hint" role="status">{saveDisabledReason}</span>}
        {savedAt && !saveDisabledReason && <span className="rrg-success-message" role="status">Saved.</span>}
      </div>
    </div>
  );
}

function GoalsTable({ goals, county, entities, isAdmin, onUpdate }) {
  const [managingGoalId, setManagingGoalId] = useState(null);
  const [filters, setFilters] = useState({ tier: "all", status: "all", locked: "all", completed: "all", search: "" });

  const entitiesById = Object.fromEntries(entities.map((entity) => [entity.id, entity]));

  const filtered = goals.filter((goal) => {
    if (filters.tier !== "all" && String(goal.tier ?? "") !== filters.tier) return false;
    if (filters.status !== "all" && goal.status !== filters.status) return false;
    if (filters.locked === "locked" && !goal.locked) return false;
    if (filters.locked === "unlocked" && goal.locked) return false;
    if (filters.completed === "completed" && goal.status !== "published") return false;
    if (filters.completed === "incomplete" && goal.status === "published") return false;
    if (filters.search) {
      const query = filters.search.trim().toLowerCase();
      const entityName = entitiesById[goal.government_entity_id]?.display_name || entitiesById[goal.government_entity_id]?.legal_name || "";
      if (!goal.title.toLowerCase().includes(query) && !entityName.toLowerCase().includes(query)) return false;
    }
    return true;
  });

  // Default administrator ordering: county, tier, goal title, completion
  // status. The county column itself is constant within one table (the
  // admin already scoped it via the county picker above), so only tier /
  // title / completion vary row-to-row here.
  const sorted = [...filtered].sort((a, b) => {
    const tierCompare = (a.tier ?? 99) - (b.tier ?? 99);
    if (tierCompare !== 0) return tierCompare;
    const titleCompare = a.title.localeCompare(b.title);
    if (titleCompare !== 0) return titleCompare;
    return (a.status === "published" ? 1 : 0) - (b.status === "published" ? 1 : 0);
  });

  const managingGoal = goals.find((goal) => goal.id === managingGoalId) ?? null;

  return (
    <div className="content-management rrg-goals-table">
      <div className="management-toolbar">
        <label>
          Search
          <input type="search" value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} placeholder="Title or entity" />
        </label>
        <label>
          Tier
          <select value={filters.tier} onChange={(e) => setFilters({ ...filters, tier: e.target.value })}>
            <option value="all">All tiers</option>
            {TIER_OPTIONS.map((tier) => <option key={tier} value={String(tier)}>Tier {tier}</option>)}
          </select>
        </label>
        <label>
          Status
          <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
            <option value="all">All statuses</option>
            {GOAL_STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
        </label>
        <label>
          Locked
          <select value={filters.locked} onChange={(e) => setFilters({ ...filters, locked: e.target.value })}>
            <option value="all">All</option>
            <option value="locked">Locked</option>
            <option value="unlocked">Unlocked</option>
          </select>
        </label>
        <label>
          Partial/Complete
          <select value={filters.completed} onChange={(e) => setFilters({ ...filters, completed: e.target.value })}>
            <option value="all">All</option>
            <option value="completed">Complete</option>
            <option value="incomplete">Partial</option>
          </select>
        </label>
      </div>

      {sorted.length === 0 ? (
        <p className="management-state">No goals match the current filters.</p>
      ) : (
        <>
          <div className="rrg-goals-table__scroll">
            <table className="management-table rrg-goals-table__table">
              <thead>
                <tr>
                  {isAdmin && <th className="rrg-goals-table__col-county">County</th>}
                  <th className="rrg-goals-table__col-tier">Tier</th>
                  <th className="rrg-goals-table__col-title">Goal title</th>
                  <th className="rrg-goals-table__col-entity">Government entity</th>
                  <th className="rrg-goals-table__col-profile">Request-profile state</th>
                  <th className="rrg-goals-table__col-status">Goal status</th>
                  <th className="rrg-goals-table__col-visibility">Public/locked</th>
                  <th className="rrg-goals-table__col-sources">Sources</th>
                  <th className="rrg-goals-table__col-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((goal) => {
                  const entity = entitiesById[goal.government_entity_id];
                  const entityName = entity?.display_name || entity?.legal_name || "No entity";
                  const sourceCount = (goal.records_request_goal_links ?? []).length;
                  return (
                    <tr key={goal.id}>
                      {isAdmin && <td className="rrg-goals-table__col-county">{county?.name ?? "—"}</td>}
                      <td className="rrg-goals-table__col-tier">{goal.tier ? `Tier ${goal.tier}` : "—"}</td>
                      <td className="rrg-goals-table__col-title">{goal.title}</td>
                      <td className="rrg-goals-table__col-entity">{entityName}</td>
                      <td className="rrg-goals-table__col-profile">{goal.request_profile_id ? "Profile linked" : "No profile"}</td>
                      <td className="rrg-goals-table__col-status">
                        <span className={`rrg-badge rrg-badge--${goal.status}`}>
                          {goal.status === "published" ? "Complete" : goal.status === "received" ? "Partial" : goal.status}
                        </span>
                      </td>
                      <td className="rrg-goals-table__col-visibility">
                        {goal.is_public && <span className="rrg-badge rrg-badge--public">Public</span>}
                        {goal.locked && <span className="rrg-badge rrg-badge--locked">Locked</span>}
                      </td>
                      <td className="rrg-goals-table__col-sources">{sourceCount}</td>
                      <td className="management-actions rrg-goals-table__col-actions">
                        <button type="button" onClick={() => setManagingGoalId(goal.id)} aria-label={`Edit ${goal.title}`}>
                          ✎ Edit
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="management-mobile-list rrg-goals-table__mobile-list">
            {sorted.map((goal) => {
              const entity = entitiesById[goal.government_entity_id];
              const entityName = entity?.display_name || entity?.legal_name || "No entity";
              const sourceCount = (goal.records_request_goal_links ?? []).length;
              return (
                <div className="management-mobile-record" key={goal.id}>
                  <strong>{goal.title}</strong>
                  <span>{entityName}</span>
                  <div className="management-badges">
                    <span className={`rrg-badge rrg-badge--small rrg-badge--${goal.status}`}>
                      {goal.status === "published" ? "Complete" : goal.status === "received" ? "Partial" : goal.status}
                    </span>
                    {goal.is_public && <span className="rrg-badge rrg-badge--small rrg-badge--public">Public</span>}
                    {goal.locked && <span className="rrg-badge rrg-badge--small rrg-badge--locked">Locked</span>}
                  </div>
                  <details>
                    <summary>Details</summary>
                    <dl>
                      {isAdmin && (
                        <div>
                          <dt>County</dt>
                          <dd>{county?.name ?? "—"}</dd>
                        </div>
                      )}
                      <div>
                        <dt>Tier</dt>
                        <dd>{goal.tier ? `Tier ${goal.tier}` : "—"}</dd>
                      </div>
                      <div>
                        <dt>Request-profile state</dt>
                        <dd>{goal.request_profile_id ? "Profile linked" : "No profile"}</dd>
                      </div>
                      <div>
                        <dt>Sources</dt>
                        <dd>{sourceCount}</dd>
                      </div>
                    </dl>
                  </details>
                  <div className="management-actions">
                    <button type="button" onClick={() => setManagingGoalId(goal.id)} aria-label={`Edit ${goal.title}`}>
                      ✎ Edit
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {managingGoal && (
        <AdminPopout title={managingGoal.title} onClose={() => setManagingGoalId(null)}>
          <GoalManagePanel
            goal={managingGoal}
            county={county}
            entities={entities}
            isAdmin={isAdmin}
            onUpdate={onUpdate}
            onClose={() => setManagingGoalId(null)}
          />
        </AdminPopout>
      )}
    </div>
  );
}

function GoalManagePanel({ goal, county, entities, isAdmin, onUpdate, onClose }) {
  const [showUpload, setShowUpload] = useState(false);
  const [showExternalSource, setShowExternalSource] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [completionBusy, setCompletionBusy] = useState(false);
  const [completionError, setCompletionError] = useState("");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  // Tracks the exact profile id a preview most recently succeeded for —
  // Activate Profile is only ever offered for that same profile, never as
  // a standing "some preview once worked" flag that could go stale after
  // switching which profile the goal links to.
  const [previewSucceededProfileId, setPreviewSucceededProfileId] = useState(null);

  async function handleSetCompletion(complete) {
    setCompletionBusy(true);
    setCompletionError("");
    const { error } = await supabase.rpc("rrg_set_goal_completion", {
      p_goal_id: goal.id,
      p_complete: complete,
    });
    setCompletionBusy(false);
    if (error) {
      const classified = classifyRpcError(error);
      setCompletionError(
        classified === "missing-migration"
          ? "This feature is not installed on this environment yet. The required database migration must be applied."
          : error.message
      );
      return;
    }
    onUpdate();
  }

  async function handleDelete() {
    const { error } = await supabase.from("county_records_request_goals").delete().eq("id", goal.id);
    if (error) {
      console.error("Goal deletion failed:", error);
      setCompletionError(error.message);
      return;
    }
    onClose();
    onUpdate();
  }

  return (
    <div className="rrg-goal-manage-panel">
      <GoalEditForm goal={goal} entities={entities} isAdmin={isAdmin} onSave={onUpdate} onCancel={onClose} onDirtyChange={setHasUnsavedChanges} />

      <OperatorDraftPreviewButton
        goal={goal}
        county={county}
        hasUnsavedChanges={hasUnsavedChanges}
        onPreviewSuccess={setPreviewSucceededProfileId}
      />

      {goal.request_profile_id && (
        <RequestProfileLifecycle
          key={goal.request_profile_id}
          requestProfileId={goal.request_profile_id}
          previewSucceededProfileId={previewSucceededProfileId}
        />
      )}

      <section className="rrg-goal-manage-panel__section">
        <h4>Partial / Complete</h4>
        <p>
          Current state: <strong>{goal.status === "published" ? "Complete" : goal.status === "received" ? "Partial" : goal.status}</strong>
        </p>
        {completionError && <div className="rrg-error-message">{completionError}</div>}
        <div className="rrg-goal-actions">
          <button type="button" className="rrg-btn" disabled={completionBusy || goal.status !== "published"} onClick={() => handleSetCompletion(false)}>
            Mark Partial
          </button>
          <button type="button" className="rrg-btn rrg-btn--primary" disabled={completionBusy || goal.status === "published"} onClick={() => handleSetCompletion(true)}>
            Mark Complete
          </button>
        </div>
      </section>

      <section className="rrg-goal-manage-panel__section">
        <h4>Associated Records and Sources</h4>
        <GoalLinksManager goal={goal} onUpdate={onUpdate} onClose={() => {}} embedded />

        <div className="rrg-goal-actions">
          {!goal.locked && (
            <>
              <button type="button" className="rrg-btn rrg-btn--small" onClick={() => { setShowUpload(!showUpload); setShowExternalSource(false); }}>
                {showUpload ? "Hide" : "Upload hosted record"}
              </button>
              <button type="button" className="rrg-btn rrg-btn--small" onClick={() => { setShowExternalSource(!showExternalSource); setShowUpload(false); }}>
                {showExternalSource ? "Hide" : "Add external source"}
              </button>
            </>
          )}
        </div>

        {showUpload && (
          <GoalCompletionUpload goal={goal} county={county} onComplete={() => { setShowUpload(false); onUpdate(); }} onCancel={() => setShowUpload(false)} />
        )}
        {showExternalSource && (
          <ExternalSourceForm goal={goal} onComplete={() => { setShowExternalSource(false); onUpdate(); }} onCancel={() => setShowExternalSource(false)} />
        )}
      </section>

      <section className="rrg-goal-manage-panel__section rrg-goal-manage-panel__section--danger">
        <h4>Delete goal</h4>
        {!confirmingDelete ? (
          <button type="button" className="rrg-btn rrg-btn--danger" onClick={() => setConfirmingDelete(true)}>
            Delete goal
          </button>
        ) : (
          <div className="rrg-delete-dialog">
            <p>
              This deletes the goal and its public archive links. Any uploaded files remain
              retained in backend storage and are not deleted — only the goal record and its
              links disappear from this site.
            </p>
            <div className="rrg-goal-actions">
              <button type="button" className="rrg-btn rrg-btn--danger" onClick={handleDelete}>Confirm delete</button>
              <button type="button" className="rrg-btn" onClick={() => setConfirmingDelete(false)}>Cancel</button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

const PROFILE_LIFECYCLE_LABELS = {
  draft: "Draft",
  in_review: "In review",
  verified: "Active / Verified",
  retired: "Retired",
};

// Deliberately separate from the goal's own Partial/Complete section above
// — a goal's status and its linked request profile's status are two
// different lifecycles that must never be conflated. Activation is only
// ever offered once a real operator preview has actually succeeded for
// this exact profile (see OperatorDraftPreviewButton's onPreviewSuccess) —
// activation itself cannot re-run PDF generation server-side, so a
// successful preview is the closest UX proxy for "this renders correctly,"
// backed by rrg_activate_request_profile independently re-checking every
// prerequisite it can verify server-side (renderer/evidence/entity/dates).
function RequestProfileLifecycle({ requestProfileId, previewSucceededProfileId }) {
  const [profile, setProfile] = useState(null);
  const [loadState, setLoadState] = useState("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function loadProfile() {
    setLoadState("loading");
    const { data, error: loadError } = await supabase
      .from("request_profiles")
      .select("id, version, status")
      .eq("id", requestProfileId)
      .maybeSingle();
    if (loadError || !data) {
      setLoadState("error");
      return;
    }
    setProfile(data);
    setLoadState("ready");
  }

  useEffect(() => {
    const timer = setTimeout(loadProfile, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadProfile only closes over requestProfileId, which is already a dependency
  }, [requestProfileId]);

  async function handleActivate() {
    setBusy(true);
    setError("");
    const { error: rpcError } = await supabase.rpc("rrg_activate_request_profile", { p_profile_id: requestProfileId });
    setBusy(false);
    if (rpcError) {
      const classified = classifyRpcError(rpcError);
      setError(
        classified === "missing-migration"
          ? "This feature is not installed on this environment yet. The required database migration must be applied."
          : rpcError.message
      );
      return;
    }
    loadProfile();
  }

  async function handleRetire() {
    if (!confirm("Retire this request profile? It will no longer be usable for new requests.")) return;
    setBusy(true);
    setError("");
    const { error: rpcError } = await supabase.rpc("rrg_retire_request_profile", { p_profile_id: requestProfileId });
    setBusy(false);
    if (rpcError) {
      const classified = classifyRpcError(rpcError);
      setError(
        classified === "missing-migration"
          ? "This feature is not installed on this environment yet. The required database migration must be applied."
          : rpcError.message
      );
      return;
    }
    loadProfile();
  }

  if (loadState === "loading") {
    return (
      <section className="rrg-goal-manage-panel__section">
        <h4>Request Profile Lifecycle</h4>
        <p className="rrg-status">Loading profile status…</p>
      </section>
    );
  }
  if (loadState === "error" || !profile) {
    return (
      <section className="rrg-goal-manage-panel__section">
        <h4>Request Profile Lifecycle</h4>
        <p className="rrg-error-message">The linked request profile could not be loaded.</p>
      </section>
    );
  }

  const canActivate = profile.status === "draft" && previewSucceededProfileId === profile.id;

  return (
    <section className="rrg-goal-manage-panel__section">
      <h4>Request Profile Lifecycle</h4>
      <p>
        Version {profile.version} — <span className={`rrg-badge rrg-badge--${profile.status}`}>{PROFILE_LIFECYCLE_LABELS[profile.status] ?? profile.status}</span>
      </p>
      {error && <div className="rrg-error-message">{error}</div>}
      <div className="rrg-goal-actions">
        {profile.status === "draft" && (
          <button type="button" className="rrg-btn rrg-btn--primary" disabled={busy || !canActivate} onClick={handleActivate}>
            Activate Profile
          </button>
        )}
        {profile.status === "verified" && (
          <button type="button" className="rrg-btn rrg-btn--danger" disabled={busy} onClick={handleRetire}>
            Retire Profile
          </button>
        )}
      </div>
      {profile.status === "draft" && !canActivate && (
        <small className="rrg-fill-payload__hint">
          Run "Preview Draft Request Form" above and confirm it succeeds before this profile can be activated.
        </small>
      )}
    </section>
  );
}

function GoalLinksManager({ goal, onUpdate, onClose, embedded = false }) {
  // Derived directly from props on every render, never copied into local
  // state — this component never mutates its own copy (deletes/reorders go
  // straight through Supabase, then onUpdate() refreshes the parent's
  // goal), so a local copy could only ever go stale once the goal prop
  // refreshed (e.g. after adding a resource elsewhere in the same panel)
  // while this component stayed mounted.
  const links = goal.records_request_goal_links || [];
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="rrg-links-manager">
      {!embedded && (
        <div className="rrg-links-manager__header">
          <h5>Associated Records and Sources</h5>
          <button type="button" className="rrg-btn rrg-btn--small" onClick={onClose}>
            Close
          </button>
        </div>
      )}

      {showForm ? (
        <LinkForm
          goalId={goal.id}
          existingLinks={links}
          onSuccess={() => {
            setShowForm(false);
            onUpdate();
          }}
          onCancel={() => setShowForm(false)}
        />
      ) : (
        <button
          type="button"
          className="rrg-btn rrg-btn--small"
          onClick={() => setShowForm(true)}
        >
          Add Link
        </button>
      )}

      {links.length === 0 ? (
        <p className="rrg-empty-small">No links yet</p>
      ) : (
        <ul className="rrg-links-list">
          {links.map((link) => (
            <LinkItem key={link.id} link={link} onDelete={onUpdate} />
          ))}
        </ul>
      )}
    </div>
  );
}

function LinkForm({ goalId, existingLinks, onSuccess, onCancel }) {
  const [formData, setFormData] = useState({
    label: "",
    external_url: "",
    evidence_object_id: null,
    is_primary: existingLinks.every((l) => !l.is_primary),
  });
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    if (!formData.label) {
      setError("Label is required");
      return;
    }

    if (!formData.external_url && !formData.evidence_object_id) {
      setError("Either external URL or evidence object is required");
      return;
    }

    if (formData.external_url && !formData.external_url.startsWith("https://")) {
      setError("External URLs must use HTTPS");
      return;
    }

    setSubmitting(true);

    try {
      const linkData = {
        goal_id: goalId,
        label: formData.label,
        external_url: formData.external_url || null,
        evidence_object_id: formData.evidence_object_id || null,
        is_primary: formData.is_primary,
        position: existingLinks.length,
      };

      const { error: insertError } = await supabase
        .from("records_request_goal_links")
        .insert([linkData]);

      if (insertError) throw insertError;

      onSuccess();
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  }

  return (
    <form className="rrg-form rrg-link-form" onSubmit={handleSubmit}>
      {error && <div className="rrg-error-message">{error}</div>}

      <div className="rrg-form-group">
        <label htmlFor="link-label">Label</label>
        <input
          id="link-label"
          type="text"
          maxLength="200"
          value={formData.label}
          onChange={(e) => setFormData({ ...formData, label: e.target.value })}
          placeholder="e.g., Application Form, Supporting Documents"
          required
        />
      </div>

      <div className="rrg-form-group">
        <label htmlFor="link-url">External URL (HTTPS only)</label>
        <input
          id="link-url"
          type="url"
          value={formData.external_url}
          onChange={(e) => setFormData({ ...formData, external_url: e.target.value })}
          placeholder="https://example.com/resource"
        />
        <small>Leave blank if linking to hosted evidence</small>
      </div>

      <div className="rrg-form-group">
        <label>
          <input
            type="checkbox"
            checked={formData.is_primary}
            onChange={(e) => setFormData({ ...formData, is_primary: e.target.checked })}
          />
          Primary Link
        </label>
        <small>Primary link is shown prominently on the public timeline</small>
      </div>

      <div className="rrg-link-actions">
        <button
          type="submit"
          className="rrg-btn rrg-btn--primary rrg-btn--small"
          disabled={submitting}
        >
          {submitting ? "Adding..." : "Add Link"}
        </button>
        <button type="button" className="rrg-btn rrg-btn--small" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function LinkItem({ link, onDelete }) {
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    // Unlinks the document from this goal only — the underlying
    // evidence_objects row and its Storage object are never touched here.
    if (!confirm("Remove this archive link? The retained file itself will not be deleted.")) return;

    setDeleting(true);
    try {
      const { error } = await supabase.from("records_request_goal_links").delete().eq("id", link.id);

      if (error) throw error;

      onDelete();
    } catch (err) {
      console.error("Delete failed:", err);
      setDeleting(false);
    }
  }

  return (
    <li className="rrg-link-item">
      <div className="rrg-link-info">
        {link.evidence_object_id ? (
          <Link className="rrg-link-info__title" to={`/archive/documents/${link.evidence_object_id}`}>
            {link.label}
          </Link>
        ) : link.external_url ? (
          <a className="rrg-link-info__title" href={link.external_url} target="_blank" rel="noopener noreferrer">
            {link.label}
          </a>
        ) : (
          <span className="rrg-link-info__title">{link.label}</span>
        )}
        {link.is_primary && <span className="rrg-badge rrg-badge--small">Primary</span>}
      </div>
      <button
        type="button"
        className="rrg-btn rrg-btn--small rrg-btn--danger"
        onClick={handleDelete}
        disabled={deleting}
      >
        Remove archive link
      </button>
    </li>
  );
}
