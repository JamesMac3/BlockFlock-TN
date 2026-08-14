import { useState, useEffect } from "react";
import { usePortalAuth } from "../../auth/portalAuth";
import { supabase } from "../../lib/supabase";
import "./RecordsRequestGoalsManager.css";

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
      } else if (countyId) {
        // Chapter masters see goals and entities for their county
        const [goalsResult, entitiesResult] = await Promise.all([
          supabase
            .from("county_records_request_goals")
            .select(
              `
              id,
              title,
              status,
              is_public,
              government_entity_id,
              request_profile_id,
              position,
              public_summary,
              created_at,
              records_request_goal_links(id, label, position, is_primary, evidence_object_id, external_url)
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

  if (state.phase === "loading") {
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
          <AdminTemplateManager
            templates={state.templates}
            counties={state.counties}
            entities={state.entities}
            onRefresh={loadData}
          />
          <AdminGoalsManager counties={state.counties} entities={state.entities} onRefresh={loadData} />
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

function AdminTemplateManager({ templates, counties, entities, onRefresh }) {
  const [showForm, setShowForm] = useState(false);
  const [cloneTarget, setCloneTarget] = useState(null);

  return (
    <section className="rrg-templates">
      <div className="rrg-section-header">
        <h3>Goal Templates</h3>
        <button
          type="button"
          className="rrg-btn rrg-btn--primary"
          onClick={() => setShowForm(!showForm)}
        >
          {showForm ? "Cancel" : "Create Template"}
        </button>
      </div>

      {showForm && (
        <TemplateForm
          onSuccess={() => {
            setShowForm(false);
            onRefresh();
          }}
        />
      )}

      {cloneTarget && (
        <TemplateCloneForm
          template={cloneTarget}
          counties={counties}
          onSuccess={() => {
            setCloneTarget(null);
            onRefresh();
          }}
          onCancel={() => setCloneTarget(null)}
        />
      )}

      {templates.length === 0 ? (
        <p className="rrg-empty">No templates yet</p>
      ) : (
        <div className="rrg-template-grid">
          {templates.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              onUpdate={onRefresh}
              onClone={() => setCloneTarget(template)}
            />
          ))}
        </div>
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

function TemplateCard({ template, onUpdate, onClone }) {
  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState(template);

  async function handleUpdate() {
    try {
      const { error } = await supabase
        .from("records_request_goal_templates")
        .update(formData)
        .eq("id", template.id);

      if (error) throw error;

      setEditing(false);
      onUpdate();
    } catch (error) {
      console.error("Update failed:", error);
    }
  }

  if (editing) {
    return (
      <div className="rrg-template-card rrg-template-card--editing">
        <div className="rrg-form-group">
          <label>Title</label>
          <input
            type="text"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          />
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

        <div className="rrg-template-actions">
          <button type="button" className="rrg-btn rrg-btn--primary" onClick={handleUpdate}>
            Save
          </button>
          <button
            type="button"
            className="rrg-btn"
            onClick={() => {
              setEditing(false);
              setFormData(template);
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rrg-template-card">
      <div className="rrg-template-header">
        <h4>{template.title}</h4>
        <span className={`rrg-badge ${template.active ? "rrg-badge--active" : "rrg-badge--inactive"}`}>
          {template.active ? "Active" : "Inactive"}
        </span>
      </div>

      {template.public_summary && (
        <p className="rrg-template-summary">{template.public_summary}</p>
      )}

      <div className="rrg-template-meta">
        <small>Seed Key: {template.seed_key}</small>
      </div>

      <div className="rrg-template-footer">
        <button type="button" className="rrg-btn rrg-btn--small" onClick={() => setEditing(true)}>
          Edit
        </button>
        <button type="button" className="rrg-btn rrg-btn--small" onClick={onClone}>
          Clone to County
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
      const { data, error: rpcError } = await supabase.rpc(
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
  const [selectedCountyId, setSelectedCountyId] = useState(counties.length > 0 ? counties[0].id : null);

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
          status,
          is_public,
          government_entity_id,
          request_profile_id,
          position,
          public_summary,
          records_request_goal_links(id, label, position, is_primary)
        `
        )
        .eq("county_id", selectedCountyId)
        .order("position", { ascending: true });

      if (error) throw error;

      setGoals(data ?? []);
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

      {loading ? (
        <p className="rrg-status">Loading goals...</p>
      ) : goals.length === 0 ? (
        <p className="rrg-empty">No goals yet for this county</p>
      ) : (
        <div className="rrg-goals-list">
          {goals.map((goal) => (
            <GoalRow
              key={goal.id}
              goal={goal}
              county={counties.find((c) => c.id === selectedCountyId)}
              entities={countyEntities}
              onUpdate={() => {
                loadGoals();
                onRefresh();
              }}
            />
          ))}
        </div>
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
          onSuccess={() => {
            setShowForm(false);
            onRefresh();
          }}
        />
      )}

      {goals.length === 0 ? (
        <p className="rrg-empty">No goals yet for {county?.name}</p>
      ) : (
        <div className="rrg-goals-list">
          {goals.map((goal) => (
            <GoalRow
              key={goal.id}
              goal={goal}
              county={county}
              entities={entities}
              onUpdate={onRefresh}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function GoalForm({ county, entities, onSuccess }) {
  const [formData, setFormData] = useState({
    title: "",
    public_summary: "",
    status: "profile_needed",
    is_public: false,
    government_entity_id: null,
    request_profile_id: null,
  });
  const [profiles, setProfiles] = useState([]);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadProfiles();
  }, [formData.government_entity_id]);

  async function loadProfiles() {
    if (!formData.government_entity_id) {
      setProfiles([]);
      return;
    }

    try {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from("request_profiles")
        .select("id, version, status")
        .eq("government_entity_id", formData.government_entity_id)
        .eq("status", "verified")
        .lte("effective_from", now)
        .or(`effective_to.is.null,effective_to.gte.${now}`)
        .order("version", { ascending: false });

      if (error) throw error;

      setProfiles(data ?? []);
    } catch (err) {
      console.error("Failed to load profiles:", err);
      setProfiles([]);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const goalData = {
        county_id: county.id,
        title: formData.title,
        public_summary: formData.public_summary,
        status: formData.status,
        is_public: formData.is_public,
        government_entity_id: formData.government_entity_id || null,
        request_profile_id: formData.request_profile_id || null,
      };

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
              Version {profile.version}
            </option>
          ))}
        </select>
      </div>

      <div className="rrg-form-group">
        <label htmlFor="goal-status">Status</label>
        <select
          id="goal-status"
          value={formData.status}
          onChange={(e) => setFormData({ ...formData, status: e.target.value })}
        >
          <option value="draft">Draft</option>
          <option value="profile_needed">Profile Needed</option>
          <option value="ready">Ready</option>
          <option value="requested">Requested</option>
          <option value="received">Received</option>
          <option value="published">Published</option>
          <option value="unavailable">Unavailable</option>
          <option value="retired">Retired</option>
        </select>
      </div>

      <div className="rrg-form-group">
        <label>
          <input
            type="checkbox"
            checked={formData.is_public}
            onChange={(e) => setFormData({ ...formData, is_public: e.target.checked })}
          />
          Public Visibility
        </label>
      </div>

      <button type="submit" className="rrg-btn rrg-btn--primary" disabled={submitting}>
        {submitting ? "Creating..." : "Create Goal"}
      </button>
    </form>
  );
}

function GoalRow({ goal, county, entities, onUpdate }) {
  const [editing, setEditing] = useState(false);
  const [showLinks, setShowLinks] = useState(false);
  const [formData, setFormData] = useState(goal);
  const [profiles, setProfiles] = useState([]);

  useEffect(() => {
    loadProfiles();
  }, [formData.government_entity_id]);

  async function loadProfiles() {
    if (!formData.government_entity_id) {
      setProfiles([]);
      return;
    }

    try {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from("request_profiles")
        .select("id, version")
        .eq("government_entity_id", formData.government_entity_id)
        .eq("status", "verified")
        .lte("effective_from", now)
        .or(`effective_to.is.null,effective_to.gte.${now}`)
        .order("version", { ascending: false });

      if (error) throw error;

      setProfiles(data ?? []);
    } catch (err) {
      console.error("Failed to load profiles:", err);
      setProfiles([]);
    }
  }

  async function handleUpdate() {
    try {
      const { error } = await supabase
        .from("county_records_request_goals")
        .update({
          title: formData.title,
          public_summary: formData.public_summary,
          status: formData.status,
          is_public: formData.is_public,
          government_entity_id: formData.government_entity_id,
          request_profile_id: formData.request_profile_id,
        })
        .eq("id", goal.id);

      if (error) throw error;

      setEditing(false);
      onUpdate();
    } catch (error) {
      console.error("Update failed:", error);
    }
  }

  const entityName =
    entities.find((e) => e.id === formData.government_entity_id)?.display_name ||
    entities.find((e) => e.id === formData.government_entity_id)?.legal_name ||
    "No entity";

  if (editing) {
    return (
      <div className="rrg-goal-row rrg-goal-row--editing">
        <div className="rrg-form-group">
          <label>Title</label>
          <input
            type="text"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          />
        </div>

        <div className="rrg-form-group">
          <label>Government Entity</label>
          <select
            value={formData.government_entity_id ?? ""}
            onChange={(e) =>
              setFormData({
                ...formData,
                government_entity_id: e.target.value ? parseInt(e.target.value) : null,
                request_profile_id: null,
              })
            }
          >
            <option value="">-- No entity --</option>
            {entities.map((entity) => (
              <option key={entity.id} value={entity.id}>
                {entity.display_name || entity.legal_name}
              </option>
            ))}
          </select>
        </div>

        <div className="rrg-form-group">
          <label>Request Profile</label>
          <select
            value={formData.request_profile_id ?? ""}
            onChange={(e) =>
              setFormData({ ...formData, request_profile_id: e.target.value || null })
            }
            disabled={!formData.government_entity_id}
          >
            <option value="">-- No profile --</option>
            {profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                Version {profile.version}
              </option>
            ))}
          </select>
        </div>

        <div className="rrg-form-group">
          <label>Status</label>
          <select
            value={formData.status}
            onChange={(e) => setFormData({ ...formData, status: e.target.value })}
          >
            <option value="draft">Draft</option>
            <option value="profile_needed">Profile Needed</option>
            <option value="ready">Ready</option>
            <option value="requested">Requested</option>
            <option value="received">Received</option>
            <option value="published">Published</option>
            <option value="unavailable">Unavailable</option>
            <option value="retired">Retired</option>
          </select>
        </div>

        <div className="rrg-form-group">
          <label>
            <input
              type="checkbox"
              checked={formData.is_public}
              onChange={(e) => setFormData({ ...formData, is_public: e.target.checked })}
            />
            Public
          </label>
        </div>

        <div className="rrg-goal-actions">
          <button type="button" className="rrg-btn rrg-btn--primary" onClick={handleUpdate}>
            Save
          </button>
          <button
            type="button"
            className="rrg-btn"
            onClick={() => {
              setEditing(false);
              setFormData(goal);
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="rrg-goal-row">
        <div className="rrg-goal-header">
          <h4>{formData.title}</h4>
          <div className="rrg-goal-meta">
            <span className={`rrg-badge rrg-badge--${formData.status}`}>{formData.status}</span>
            {formData.is_public && <span className="rrg-badge rrg-badge--public">Public</span>}
          </div>
        </div>

        {formData.public_summary && (
          <p className="rrg-goal-summary">{formData.public_summary}</p>
        )}

        <div className="rrg-goal-details">
          <small>Entity: {entityName}</small>
          {formData.records_request_goal_links?.length > 0 && (
            <small>{formData.records_request_goal_links.length} link(s)</small>
          )}
        </div>

        <div className="rrg-goal-actions">
          <button type="button" className="rrg-btn rrg-btn--small" onClick={() => setEditing(true)}>
            Edit
          </button>
          <button
            type="button"
            className="rrg-btn rrg-btn--small"
            onClick={() => setShowLinks(!showLinks)}
          >
            {showLinks ? "Hide" : "Manage"} Links
          </button>
        </div>
      </div>

      {showLinks && (
        <GoalLinksManager
          goal={formData}
          onUpdate={onUpdate}
          onClose={() => setShowLinks(false)}
        />
      )}
    </>
  );
}

function GoalLinksManager({ goal, onUpdate, onClose }) {
  const [links, setLinks] = useState(goal.records_request_goal_links || []);
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="rrg-links-manager">
      <h5>Goal Links</h5>

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
            <LinkItem key={link.id} link={link} goalId={goal.id} onDelete={onUpdate} />
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

function LinkItem({ link, goalId, onDelete }) {
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!confirm("Delete this link?")) return;

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
        <span>{link.label}</span>
        {link.is_primary && <span className="rrg-badge rrg-badge--small">Primary</span>}
      </div>
      <button
        type="button"
        className="rrg-btn rrg-btn--small rrg-btn--danger"
        onClick={handleDelete}
        disabled={deleting}
      >
        Delete
      </button>
    </li>
  );
}
