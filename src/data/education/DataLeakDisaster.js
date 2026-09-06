const dataLeakDisaster = {
  slug: "the-data-leak-disaster",
  navGroup: "Systemic Risk",
  navLabel: "The Data Leak Disaster",
  title: "The Damage Is Done: A Data Leak Disaster",
  dek: "Once mass surveillance data is collected and processed, copies, derived models, and learned patterns can spread through an ecosystem in ways that are difficult or impossible to fully reverse.",

  blocks: [
    {
      type: "intro",
      body: "Shutting down a camera network stops future collection. It does not undo what has already been learned, copied, shared, or built from the data collected while it was running. This module walks through why that distinction matters.",
    },

    {
      type: "stageFlow",
      heading: "From Deployment to Downstream Use",
      stages: [
        {
          id: "deployment",
          number: "01",
          icon: "camera",
          title: "Deployment",
          summary: "Cameras go live and collection begins.",
          explanation: "Cameras go live and collection begins across the deployed network.",
        },
        {
          id: "collection",
          number: "02",
          icon: "database",
          title: "Mass Collection",
          summary: "Large volumes of observations are captured daily.",
          explanation: "Large volumes of observations are captured every day across the network.",
        },
        {
          id: "extraction",
          number: "03",
          icon: "brain",
          title: "Processing and Extraction",
          summary: "AI systems extract attributes and build context.",
          explanation: "AI and machine-learning systems extract attributes from the raw captures — vehicles, plates, people, colors, locations, and relationships — and use them to build broader context.",
        },
        {
          id: "aggregation",
          number: "04",
          icon: "network",
          title: "Aggregation and Correlation",
          summary: "Data is linked and turned into intelligence.",
          explanation: "Extracted data is linked and correlated across observations, turning individual records into intelligence about patterns and relationships.",
        },
        {
          id: "storage",
          number: "05",
          icon: "cloud",
          title: "Storage and Distribution",
          summary: "Data and derived products are stored and shared.",
          explanation: "The resulting data and derived products are stored and can be distributed to databases, backups, cloud storage, and third-party services.",
        },
        {
          id: "training",
          number: "06",
          icon: "brain",
          title: "Model Training and Derived Knowledge",
          summary: "Models learn from the data and detect anomalies.",
          explanation: "Machine-learning models are trained on the collected data, learning baselines for normal behavior and detecting deviations from them.",
        },
        {
          id: "downstream",
          number: "07",
          icon: "link",
          title: "Downstream Uses",
          summary: "The resulting information fuels many future uses.",
          explanation: "The resulting information and models can fuel investigations, alerts, search, analytics, planning, and use by other agencies — well beyond the system's original purpose.",
        },
      ],
    },

    {
      type: "cardGrid",
      heading: "How Data Can Spread Beyond a Single System's Control",
      cards: [
        { title: "Copies and backups", body: "System backups, local agency copies, vendor backups, and disconnected archive media can all hold independent copies." },
        { title: "Third-party providers", body: "Cloud hosting, data processors, support vendors, and analytics partners may have their own access to the data." },
        { title: "Integrations and sharing", body: "Fusion centers, state systems, national networks, real-time crime centers, and other agencies can be connected." },
        { title: "Anonymized and aggregated data", body: "Shared \"anonymized\" datasets, research partnerships, and product-improvement pipelines can carry derived information further." },
        { title: "Model knowledge", body: "Trained models, learned parameters, feature embeddings, and behavioral baselines can retain what was learned even after source data changes." },
        { title: "Human access and exports", body: "User downloads, screenshots, reports, and manual exports create copies outside any centralized control." },
        { title: "Future replica systems", body: "New systems can be trained on old data, carrying its influence forward into designs that did not exist when it was collected." },
      ],
    },

    {
      type: "cardGrid",
      heading: "Why This Is Difficult to Reverse",
      cards: [
        { title: "Data is everywhere", body: "Once distributed across systems, agencies, servers, and clouds, it becomes difficult to locate and account for every copy." },
        { title: "It's not just raw data", body: "The damage, once done, lives in derived information — correlations, patterns, and insights — not only in the original files." },
        { title: "Models are not data", body: "Even if raw data is deleted, a trained model can still contain what it learned from that data." },
        { title: "There is no technical \"delete\" button for learning", body: "There is generally no way to make a trained system un-learn or un-see something it has already processed at scale." },
        { title: "Future systems can build on old data", body: "Old data can improve future systems, models, and capabilities that come after it." },
        { title: "Trust is harder to restore than a database", body: "Public trust in how information is handled is not something that can be restored simply by deleting a database." },
      ],
    },

    {
      type: "principle",
      heading: "The only thing you can fully control is what you choose not to start collecting.",
      explanation:
        "Stopping future collection is meaningful and worth doing. It is a different action from undoing copies, correlations, or model training that has already occurred with data collected in the past.",
    },

    {
      type: "takeaway",
      heading: "The Bottom Line",
      body: "This is not only a storage problem or a retention-setting problem. Once data has been processed, correlated, and distributed, it is closer to an ecosystem-wide exposure problem.",
      supporting: "The past cannot be deleted after the fact, and future systems may already be built on what was collected. What remains within anyone's control is what is collected starting today.",
    },

    {
      type: "scopeNote",
      body: "Whether a specific system has actually experienced unauthorized copying, sharing, or a security incident varies by vendor and deployment, and this module does not claim that any particular breach has occurred. It describes a general, structural reason why persistent surveillance data is difficult to fully contain once it exists.",
    },
  ],

  sources: [],
};

export default dataLeakDisaster;
