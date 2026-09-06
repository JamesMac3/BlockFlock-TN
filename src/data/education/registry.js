import inversion from "./Inversion";
import preservationCapability from "./PreservationCapability";
import aggregationMeaning from "./AggregationMeaning";
import machineUsefulData from "./MachineUsefulData";
import controlOverInformation from "./ControlOverInformation";
import dataCollectedVsReturned from "./DataCollectedVsReturned";
import anomalyAssociation from "./AnomalyAssociation";
import policyVsCapability from "./PolicyVsCapability";
import capabilityExpansion from "./CapabilityExpansion";
import whoCanQueryYourPlate from "./WhoCanQueryYourPlate";
import warrantPlacement from "./WarrantPlacement";
import legitimacyErosion from "./LegitimacyErosion";
import dataLeakDisaster from "./DataLeakDisaster";

// Ordered list of every interactive education module. Each module's own
// `slug`/`navGroup`/`navLabel` drive both the sidebar navigation and the
// content pane, so adding a future topic only requires appending it here.
const educationRegistry = [
  inversion,
  preservationCapability,
  aggregationMeaning,
  machineUsefulData,
  controlOverInformation,
  dataCollectedVsReturned,
  anomalyAssociation,
  policyVsCapability,
  capabilityExpansion,
  whoCanQueryYourPlate,
  warrantPlacement,
  legitimacyErosion,
  dataLeakDisaster,
];

export function getEducationTopics() {
  return educationRegistry;
}

export function getEducationTopicBySlug(slug) {
  return educationRegistry.find((topic) => topic.slug === slug);
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
