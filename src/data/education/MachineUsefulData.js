const machineUsefulData = {
  slug: "machine-useful-information",
  navGroup: "From Data to Insight",
  navLabel: "How Data Becomes Machine-Useful",
  title: "How Surveillance Data Becomes Machine-Useful Information",
  dek: "Even when identifying details are deleted or anonymized, what a system learned from them does not necessarily disappear with them.",

  blocks: [
    {
      type: "intro",
      body: "It is common to assume that deleting the original image, or removing a license plate number, removes the underlying value of that observation. Many systems process raw captures into structured, machine-readable records well before any deletion or anonymization ever happens.",
    },

    {
      type: "stageFlow",
      heading: "From Capture to a Structured Record",
      stages: [
        {
          id: "capture",
          number: "01",
          icon: "camera",
          title: "Capture",
          summary: "A camera captures a real-world scene.",
          explanation: "A camera captures a real-world scene, including a vehicle and its surroundings.",
        },
        {
          id: "processing",
          number: "02",
          icon: "brain",
          title: "AI Processing",
          summary: "The system detects objects and extracts attributes.",
          explanation:
            "Software analyzes the image and extracts structured attributes such as object class, color, make and model, and plate text — each typically tagged with a confidence score.",
        },
        {
          id: "record",
          number: "03",
          icon: "document",
          title: "Structured Record",
          summary: "Extracted attributes become a data record.",
          explanation:
            "The extracted attributes are turned into a structured record: time, location, object class, color, make and model, and plate — independent of the original image file.",
        },
        {
          id: "stored",
          number: "04",
          icon: "database",
          title: "Stored and Indexed",
          summary: "The record is stored and indexed for search.",
          explanation: "The structured record is stored in the system's database and indexed so it can be found later.",
        },
        {
          id: "search",
          number: "05",
          icon: "search",
          title: "Search and Use",
          summary: "Users search by attribute, not by image.",
          explanation:
            "Authorized users can search by attribute — plate, color, make, model, location, or time — and the system returns matches without needing to review raw video.",
        },
      ],
    },

    {
      type: "cardGrid",
      heading: "Why Deletion or Anonymization Does Not Eliminate Machine-Useful Value",
      cards: [
        {
          number: "A",
          title: "Original data is deleted after the retention period",
          body: "The raw image or video is removed once the configured retention period ends, consistent with the system's stated policy.",
        },
        {
          number: "B",
          title: "Identifiers are removed or anonymized",
          body: "Direct identifiers such as a plate number or a face may be removed or irreversibly anonymized from the remaining record.",
        },
        {
          number: "C",
          title: "Machine-useful representations can remain",
          body: "Even without the original image or identifying details, a system can retain object attributes, numeric visual representations, spatial and temporal context, and behavioral patterns tied to the observation.",
        },
        {
          number: "D",
          title: "Those representations can be used independently",
          body: "Retained representations can still be used to train models, improve detection accuracy, develop new features, or power other analytics — independent of whether the original raw data still exists.",
        },
      ],
    },

    {
      type: "principle",
      heading: "Deletion is not the same as loss. Anonymization is not the same as no value.",
      explanation:
        "The retention period that governs raw data does not necessarily limit the lifetime or usefulness of the structured information derived from it.",
    },

    {
      type: "takeaway",
      heading: "The Bottom Line",
      body: "Removing the original image or the plate number does not necessarily remove a system's ability to identify, correlate, or learn from what that image showed.",
      supporting:
        "Whether — and how long — derived representations are kept after the source data is deleted is a policy and architecture question, not a fixed rule.",
    },

    {
      type: "scopeNote",
      body: "What a specific system retains after deletion or anonymization, and how derived data may be reused, varies by vendor, product, and contract. This module explains a general technical pattern rather than describing any one vendor's actual retention practices in detail.",
    },
  ],

  sources: [],
};

export default machineUsefulData;
