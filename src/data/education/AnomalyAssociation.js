const anomalyAssociation = {
  slug: "trained-to-identify-anomalies",
  navGroup: "From Data to Insight",
  navLabel: "Trained to Identify Anomalies",
  title: "The System Is Trained to Identify Anomalies",
  dek: "Even after a retention period ends and identifiers are anonymized, a vehicle or pattern can still be associated and flagged later.",

  blocks: [
    {
      type: "intro",
      body: "Deleting a plate number after a retention period is often treated as the end of a record's useful life. Some systems are specifically designed to learn behavioral patterns and object characteristics that outlast the original identifying details, which changes what \"deleted\" actually means in practice.",
    },

    {
      type: "stageFlow",
      heading: "From Capture to a Flagged Anomaly",
      stages: [
        {
          id: "capture",
          number: "01",
          icon: "camera",
          title: "Data Capture",
          summary: "Cameras collect far more than is shown to users.",
          explanation:
            "Cameras and sensors collect video, images, audio, vehicle details, and location and time data — far more than what any single user-facing feature displays.",
        },
        {
          id: "processing",
          number: "02",
          icon: "brain",
          title: "Processing and Classification",
          summary: "The system extracts attributes and builds behavior baselines.",
          explanation:
            "The system parses and classifies captured objects, extracts detailed attributes, and can run analytics that learn what counts as \"normal\" for people, vehicles, and locations over time.",
        },
        {
          id: "persists",
          number: "03",
          icon: "database",
          title: "Anonymized Data Persists",
          summary: "Derived data can be retained and used to train models.",
          explanation:
            "After a retention period ends, direct identifiers such as a plate or a face may be removed or anonymized, but underlying fingerprints, attributes, and learned patterns can remain and continue to be used to train detection and anomaly models.",
        },
        {
          id: "flagged",
          number: "04",
          icon: "alert",
          title: "Anomaly Detected Later",
          summary: "The system can still associate and flag activity, even much later.",
          explanation:
            "Days, weeks, or months later, a new observation that resembles the earlier anonymized pattern closely enough can be associated with it and flagged as significant, without needing the original plate or image.",
        },
      ],
    },

    {
      type: "timeline",
      heading: "Illustrative Example",
      description: "A hypothetical example of how an anonymized record can still contribute to a later flag.",
      steps: [
        {
          time: "Day 1",
          title: "Original observation",
          body: "A vehicle is observed and fully recorded, including its plate, color, and location.",
        },
        {
          time: "Day 30",
          title: "Retention period ends",
          body: "The original image and plate are deleted or anonymized under the system's stated policy.",
        },
        {
          time: "Day 45",
          title: "A new observation occurs",
          body: "A vehicle resembling the earlier pattern is seen again, possibly with a different plate, paint, or location.",
        },
        {
          time: "Day 45",
          title: "The system compares the two",
          body: "The system compares the new observation against learned fingerprints, attributes, and behavior patterns from the earlier anonymized record.",
        },
        {
          time: "Day 45",
          title: "Anomaly flagged",
          body: "If the comparison is close enough, the system links the new observation to the prior anonymized record and flags it as an anomaly.",
        },
      ],
    },

    {
      type: "cardGrid",
      heading: "What Anonymized Data Can Still Contain",
      cards: [
        { title: "Object fingerprints", body: "Shape, lighting, and structural details that distinguish one object from another." },
        { title: "Color, type, and modifications", body: "General visual characteristics that persist even without a plate number." },
        { title: "Movement and dwell patterns", body: "How often and how long an object appears in a given place." },
        { title: "Location history and travel behavior", body: "General patterns of where and when similar activity has previously occurred." },
        { title: "Relationships to other objects and events", body: "Associations between separate observations that were linked before anonymization." },
      ],
    },

    {
      type: "takeaway",
      heading: "The Bottom Line",
      body: "Deleting or anonymizing the original data does not necessarily eliminate a system's ability to identify, associate, and flag related activity later.",
      supporting: "The retention period governing raw data and the lifespan of what the system learned from it are not always the same thing.",
    },

    {
      type: "scopeNote",
      body: "Whether a given system performs this kind of anomaly detection, how long derived patterns are kept, and how re-identification safeguards work all vary by vendor and configuration. This module describes a general technical capability, not a claim about how any specific product is currently configured.",
    },
  ],

  sources: [],
};

export default anomalyAssociation;
