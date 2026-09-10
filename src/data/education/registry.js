import inversion from "./Inversion";
import beyondResult from "./BeyondResult";
import limitsOfControl from "./LimitsOfControl";

// The visible education sequence: exactly the three field guides, in
// display/navigation order. Adding a future guide only requires appending
// it here (and, if it replaces older standalone topics, adding their old
// slugs to LEGACY_TOPIC_REDIRECTS below so bookmarked links keep working).
const educationRegistry = [inversion, beyondResult, limitsOfControl];

// Slugs of the standalone lesson topics that were folded into the three
// field guides above, mapped to the guide that now covers that material.
// EducationPage consults this before falling back to the default topic,
// so an old bookmarked/shared URL still lands somewhere relevant instead
// of just bouncing to guide 1.
const LEGACY_TOPIC_REDIRECTS = {
  // Preservation and aggregation -> The Inversion
  "preservation-changes-the-capability": "the-inversion",
  "aggregation-changes-what-data-means": "the-inversion",

  // Information control, plate access, machine-useful data,
  // collected-versus-returned data, anomaly detection, and data-leak
  // topics -> Beyond the Search Result
  "who-controls-the-information": "beyond-the-search-result",
  "who-can-see-your-plate": "beyond-the-search-result",
  "machine-useful-information": "beyond-the-search-result",
  "more-collected-than-returned": "beyond-the-search-result",
  "trained-to-identify-anomalies": "beyond-the-search-result",
  "the-data-leak-disaster": "beyond-the-search-result",

  // Policy, warrant placement, expansion, and legitimacy -> The Limits of
  // Control
  "policy-does-not-remove-capability": "the-limits-of-control",
  "where-the-warrant-must-be-placed": "the-limits-of-control",
  "expansion-tomorrow-exceeds-today": "the-limits-of-control",
  "legitimacy-erosion": "the-limits-of-control",
};

export function getEducationTopics() {
  return educationRegistry;
}

export function getEducationTopicBySlug(slug) {
  return educationRegistry.find((topic) => topic.slug === slug);
}

export function getLegacyTopicRedirect(slug) {
  return LEGACY_TOPIC_REDIRECTS[slug];
}

export function getAdjacentEducationTopics(slug) {
  const index = educationRegistry.findIndex((topic) => topic.slug === slug);
  if (index === -1) {
    return { previous: undefined, next: undefined };
  }

  return {
    previous: educationRegistry[index - 1],
    next: educationRegistry[index + 1],
  };
}

export function getGroupedEducationTopics() {
  const groups = [];
  const groupIndex = new Map();

  for (const topic of educationRegistry) {
    if (!groupIndex.has(topic.navGroup)) {
      groupIndex.set(topic.navGroup, { name: topic.navGroup, topics: [] });
      groups.push(groupIndex.get(topic.navGroup));
    }
    groupIndex.get(topic.navGroup).topics.push(topic);
  }

  return groups;
}

export default educationRegistry;
