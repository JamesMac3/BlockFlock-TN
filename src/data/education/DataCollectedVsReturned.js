const dataCollectedVsReturned = {
  slug: "more-collected-than-returned",
  navGroup: "From Data to Insight",
  navLabel: "More Is Collected Than Is Returned",
  title: "More Data Is Collected Than Is Returned",
  dek: "The interface a user sees is typically a filtered view. The system underneath it can process and retain far more than what is shown.",

  blocks: [
    {
      type: "intro",
      body: "It is easy to judge a surveillance system by what its interface shows a user: a plate read, a vehicle detection, a search result. Many of these platforms capture and process a much broader set of raw data before narrowing it down to only what a given screen or feature needs to display.",
    },

    {
      type: "stageFlow",
      heading: "From Broad Capture to a Filtered Interface",
      stages: [
        {
          id: "capture",
          number: "01",
          icon: "camera",
          title: "Capture More Data",
          summary: "Cameras and sensors collect broad raw context.",
          explanation:
            "Cameras and sensors can collect video, audio, images, motion metadata, GPS location, timestamps, environmental data, and device health data — far more than a single plate read.",
        },
        {
          id: "processing",
          number: "02",
          icon: "brain",
          title: "Processing Center",
          summary: "Raw data is parsed, classified, and enriched.",
          explanation:
            "The raw capture is sent to a processing pipeline that classifies vehicles, people, faces, animals, and other objects, extracts detailed attributes from each, and can run additional analysis such as object fingerprinting, similarity matching, or behavior analytics. The full set of raw and derived data is typically stored, not just the parts later shown to a user.",
        },
        {
          id: "filter",
          number: "03",
          icon: "search",
          title: "Only Applicable Data Is Returned",
          summary: "A subset is filtered for what the interface needs.",
          explanation:
            "Only the data relevant to a specific feature or search is returned to the interface — for example, a plate read, a vehicle detection, or a matching alert — filtered from the larger set that was actually processed and stored.",
        },
        {
          id: "interface",
          number: "04",
          icon: "monitor",
          title: "User Interface",
          summary: "Users see a narrowed, feature-specific view.",
          explanation:
            "The user sees only what is relevant to their task: alerts, search results, or detections. Full raw video, non-matching objects, and other extracted attributes are typically not shown unless specifically requested.",
        },
      ],
    },

    {
      type: "cardGrid",
      heading: "Why More Is Collected Than Is Returned",
      cards: [
        {
          title: "Better detection",
          body: "More raw data can improve the accuracy of the AI system and give it more context to work with.",
        },
        {
          title: "Future use",
          body: "Retained data can support new features and models that did not exist at the time it was originally collected.",
        },
        {
          title: "Investigations",
          body: "Full data can be made available later for authorized searches tied to a specific investigation.",
        },
        {
          title: "System improvement",
          body: "Anonymized or aggregated data can be used to train and improve the underlying detection models.",
        },
      ],
    },

    {
      type: "principle",
      heading: "Retention settings apply to stored data. They do not necessarily apply to everything derived from it.",
      explanation:
        "A published retention period usually describes how long raw footage and records are kept. Derived and anonymized information built from that data can potentially persist and be used independently of that stated period.",
    },

    {
      type: "takeaway",
      heading: "Key Point",
      body: "A surveillance system commonly collects and processes far more information than is ever shown in its user interface.",
      supporting: "What a user sees on screen is not a complete inventory of what the underlying system captured, stored, or derived.",
    },

    {
      type: "scopeNote",
      body: "Exactly what is captured, what is retained, and how derived or anonymized data may be used varies by vendor, product configuration, and contract terms — including whether a vendor's license to use customer data for its own purposes is limited or open-ended. This module describes a general pattern, not the confirmed terms of any specific vendor agreement.",
    },
  ],

  sources: [],
};

export default dataCollectedVsReturned;
