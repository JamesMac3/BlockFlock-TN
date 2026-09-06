const capabilityExpansion = {
  slug: "expansion-tomorrow-exceeds-today",
  navGroup: "Systemic Risk",
  navLabel: "Expansion: Tomorrow Will Exceed Today",
  title: "Expansion: Tomorrow Will Exceed Today",
  dek: "Technology tends to change faster than oversight. The capability approved today can do much more tomorrow, on the same hardware.",

  blocks: [
    {
      type: "intro",
      body: "A camera network is often approved for a narrow, specific purpose: reading plates, flagging stolen or wanted vehicles, recording time and location. The cameras, poles, network, and database that make up that system are general-purpose infrastructure, and what they can be used for can expand through software alone.",
    },

    {
      type: "stageFlow",
      heading: "What the Same Infrastructure Can Do Over Time",
      description: "This is a general pattern of how capability tends to expand on fixed infrastructure — not a specific product roadmap.",
      stages: [
        {
          id: "accuracy",
          number: "Year 1",
          icon: "camera",
          title: "Higher Accuracy",
          summary: "Better reads, fewer missed plates.",
          explanation: "Software updates improve detection accuracy and reduce missed reads, without any new hardware being installed.",
        },
        {
          id: "visual-search",
          number: "Year 2",
          icon: "search",
          title: "Visual Search",
          summary: "Searching by vehicle characteristics, not just plate.",
          explanation: "Search expands beyond plate numbers to vehicle make, model, color, and type, and to finding visually similar vehicles.",
        },
        {
          id: "pattern-analysis",
          number: "Year 3",
          icon: "network",
          title: "Pattern Analysis",
          summary: "Identifying routines and associations.",
          explanation: "The system can identify frequent locations, routines, and associations between people and vehicles — even those without a name attached yet.",
        },
        {
          id: "cross-system",
          number: "Year 4",
          icon: "link",
          title: "Cross-System Integration",
          summary: "Linking with other databases and data sources.",
          explanation: "The same infrastructure can be linked with other databases and data sources, broadening context and the inferences that can be drawn.",
        },
        {
          id: "advanced-analytics",
          number: "Year 5+",
          icon: "brain",
          title: "AI and Advanced Analytics",
          summary: "Predictive models and anomaly detection.",
          explanation: "Predictive models, risk scoring, and anomaly detection become possible on top of the same underlying data.",
        },
        {
          id: "unknown",
          number: "Year ?",
          icon: "question",
          title: "Capabilities Not Yet Known",
          summary: "The ceiling keeps rising.",
          explanation:
            "The camera, the pole, and the database do not need to change for new capabilities to be added — only the software running on top of them.",
        },
      ],
    },

    {
      type: "cardGrid",
      heading: "The Surveillance Ratchet",
      description: "Each of these tends to move in one direction once infrastructure is in place.",
      cards: [
        { title: "More cameras", body: "Additional coverage is typically easier to add than to remove once budgeted and installed." },
        { title: "More data", body: "More coverage produces more raw observations feeding the same system." },
        { title: "Longer history", body: "Retention windows are easier to extend than to shorten once a system is in routine use." },
        { title: "Better search", body: "Search capability tends to improve over time as the underlying software matures." },
        { title: "More connections", body: "Integrations with other systems tend to accumulate rather than be removed." },
        { title: "Better analytics", body: "Analytics capability improves as more data and better models become available." },
        { title: "More uses", body: "Each of the above tends to expand what the system is actually used for over time." },
      ],
    },

    {
      type: "cardGrid",
      heading: "Oversight Can't Keep Up",
      cards: [
        {
          title: "Technology timeline",
          body: "A new feature can go from deployment to widely available to normal practice in a matter of days or weeks.",
        },
        {
          title: "Government timeline",
          body: "Public discovery, debate, legislation, and implementation of a policy response can take months or years.",
        },
      ],
    },

    {
      type: "principle",
      heading: "Expansion is easy. Reversal is hard.",
      explanation: "Once a capability is built and adopted, the default tends to be more use over time — rarely less.",
    },

    {
      type: "takeaway",
      heading: "The Decision Before You",
      body: "Approving the infrastructure for a system is not the same as approving only what it does on day one.",
      supporting: "If a future capability built on the same infrastructure would not be authorized on its own, that is worth weighing before the infrastructure is built.",
    },

    {
      type: "scopeNote",
      body: "How quickly any specific system's capabilities actually expand, and what oversight mechanisms apply, vary by vendor, agency policy, and jurisdiction. This module describes a general pattern in how software-defined surveillance infrastructure tends to grow, not a prediction about any one deployment.",
    },
  ],

  sources: [],
};

export default capabilityExpansion;
