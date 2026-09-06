const warrantPlacement = {
  slug: "where-the-warrant-must-be-placed",
  navGroup: "The Investigative Shift",
  navLabel: "Where the Warrant Must Be Placed",
  title: "Where a Warrant Would Need to Be Placed",
  dek: "For a warrant requirement to meaningfully gate a pipeline, it would need to sit after capture but before any processing occurs — and that placement runs into real operational tension.",

  blocks: [
    {
      type: "intro",
      body: "This module walks through a purely structural question: at which point in an automated data pipeline could a warrant requirement actually gate what happens, and what tradeoffs come with placing it there? It does not offer a legal conclusion about what any law currently requires.",
    },

    {
      type: "stageFlow",
      heading: "The Pipeline, Stage by Stage",
      stages: [
        {
          id: "capture",
          number: "01",
          icon: "camera",
          title: "Capture",
          summary: "A camera captures a real-world scene.",
          explanation: "A camera captures a real-world scene, generating raw video, audio, and metadata.",
        },
        {
          id: "placement-point",
          number: "02",
          icon: "scale",
          title: "Warrant Placement Point",
          summary: "After capture, before any processing.",
          explanation:
            "For a warrant to meaningfully gate the pipeline rather than only its later stages, it would need to sit here — after capture, but before any AI processing begins.",
        },
        {
          id: "edge-processing",
          number: "03",
          icon: "brain",
          title: "Edge Processing",
          summary: "AI extracts objects and attributes.",
          explanation: "Local or edge AI analyzes the captured data and extracts objects and attributes such as plates, vehicles, and people.",
        },
        {
          id: "fusion",
          number: "04",
          icon: "network",
          title: "Fusion and Analysis",
          summary: "Data is aggregated and correlated with other sources.",
          explanation: "Extracted data is aggregated, correlated with other sources, and analyzed alongside watchlists or prior records.",
        },
        {
          id: "storage",
          number: "05",
          icon: "database",
          title: "Preservation and Storage",
          summary: "Data is stored, indexed, and retained.",
          explanation: "The processed and correlated data is stored, indexed, and retained according to the system's policy.",
        },
        {
          id: "search",
          number: "06",
          icon: "search",
          title: "Search and Use",
          summary: "Users query the system based on need.",
          explanation: "Authorized users query the stored system later, based on whatever investigative need has since arisen.",
        },
      ],
    },

    {
      type: "cardGrid",
      heading: "Why Placement Before Processing Is Operationally Difficult",
      cards: [
        {
          title: "It would require a warrant for every camera, every moment",
          body: "Millions of events are captured daily; obtaining individualized authorization for each one in real time is not how these systems currently operate.",
        },
        {
          title: "AI would need to sit idle until authorization arrived",
          body: "Automated alerts and public-safety features that depend on immediate processing would need to pause pending a warrant.",
        },
        {
          title: "Officers would not yet know what justifies a warrant",
          body: "Before any analysis occurs, there may be nothing concrete yet to point to as probable cause.",
        },
        {
          title: "Delays could make time-sensitive responses less useful",
          body: "Any built-in wait for authorization runs against situations where a fast response matters.",
        },
      ],
    },

    {
      type: "cardGrid",
      heading: "Why Placement After Processing Comes Too Late to Prevent Collection",
      cards: [
        {
          title: "Extraction has already happened",
          body: "Object detection and attribute extraction occur automatically once data reaches the processing stage.",
        },
        {
          title: "Correlation has already happened",
          body: "By the time a warrant might be sought, the data may already have been aggregated with other sources.",
        },
        {
          title: "Copies may already exist",
          body: "Databases, logs, caches, and backups can already contain the processed data well before any search request is made.",
        },
        {
          title: "Deleting the copy later does not undo the analysis",
          body: "Removing a record afterward does not reverse whatever correlation or analysis was already performed on it.",
        },
      ],
    },

    {
      type: "principle",
      heading: "In practice, warrants are typically used to search data that has already been collected and processed.",
      explanation:
        "That is a different function than authorizing the original collection before it happens. Whichever gate a specific system or policy actually uses, this module describes the structural difference between the two, not a claim about which one any particular jurisdiction legally requires.",
    },

    {
      type: "takeaway",
      heading: "How These Systems Actually Operate Today",
      body: "Capture, AI processing, and storage typically happen immediately and automatically.",
      supporting: "A warrant, when one is obtained, is generally used afterward to search historical data — not to authorize the original collection in real time.",
    },

    {
      type: "scopeNote",
      body: "What legal authorization is required for a given system to collect or search data varies by jurisdiction, statute, and case law, and this module does not attempt to resolve that legal question. It describes the operational tension in where a warrant requirement could technically be placed in an automated pipeline.",
    },
  ],

  sources: [],
};

export default warrantPlacement;
