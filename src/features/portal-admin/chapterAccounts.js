// Pure account-state labeling shared by the Chapter Master Management table
// and the chapter master's own Account Settings view. Mirrors the mapping
// given for this task: trusted = active && !review_required, restricted =
// active && review_required, suspended = status === 'suspended'.

export function describeAccountState({ status, review_required: reviewRequired }) {
  if (status === "suspended") {
    return { state: "suspended", label: "Suspended" };
  }
  if (reviewRequired) {
    return { state: "restricted", label: "Restricted" };
  }
  return { state: "trusted", label: "Trusted" };
}

export function describePostApprovalBehavior({ status, review_required: reviewRequired }) {
  if (status === "suspended") {
    return "No access (suspended)";
  }
  return reviewRequired ? "Requires admin review" : "Publishes immediately";
}

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function normalizeForwardingEmail(rawEmail) {
  const normalized = (rawEmail ?? "").trim().toLowerCase();
  if (!EMAIL_PATTERN.test(normalized)) {
    throw new Error("A valid forwarding email address is required.");
  }
  return normalized;
}
