const controlOverInformation = {
  slug: "who-controls-the-information",
  navGroup: "How Collection Works",
  navLabel: "Who Actually Controls the Information",
  title: "Control: Who Actually Controls the Information?",
  dek: "Ownership is not the same as control. Once data can be searched, shared, connected, or copied, control depends on every path it can travel.",

  blocks: [
    {
      type: "intro",
      body: "A common assumption is simple: “We bought the cameras. It's our department's system. Our department controls the information.” In practice, modern cloud-connected surveillance usually involves many parties and systems — some visible, some not — and any one of them can represent a path the data can travel.",
    },

    {
      type: "cardGrid",
      heading: "Parties That May Touch the Data",
      description: "Each of these is a potential path for a single record, not a claim that every path is actually used in every deployment.",
      cards: [
        {
          title: "The operating agency",
          body: "The agency that deployed the system has internal access and can run its own searches.",
        },
        {
          title: "The vendor",
          body: "The company providing the software and cloud service typically stores and processes the data on the agency's behalf.",
        },
        {
          title: "Cloud infrastructure",
          body: "The underlying cloud provider stores and processes the data at the infrastructure level.",
        },
        {
          title: "Other agencies",
          body: "Local, statewide, or nationwide sharing arrangements can extend access beyond the agency that owns the cameras.",
        },
        {
          title: "Integrations",
          body: "Connections to other police technologies can extend how and where the data is used.",
        },
        {
          title: "Data brokers or private companies",
          body: "Whether information could reach private companies depends on contract terms and configuration that are not always publicly visible.",
        },
        {
          title: "Exported copies",
          body: "Downloads, exports, screenshots, and reports can create copies that exist outside the original system entirely.",
        },
        {
          title: "Other databases",
          body: "Data can potentially be combined with other systems or datasets once it leaves its original context.",
        },
      ],
    },

    {
      type: "stageFlow",
      heading: "Copies Outlive Retention",
      description: "A retention policy governs the original record. It does not automatically govern any copy made from it.",
      stages: [
        {
          id: "kept",
          number: "01",
          icon: "clock",
          title: "Data Is Kept",
          summary: "The city or agency retains data for its configured period.",
          explanation: "The city or agency retains data for its configured retention period.",
        },
        {
          id: "copies",
          number: "02",
          icon: "copy",
          title: "Copies Can Be Made",
          summary: "Copies can be created and shared before deletion.",
          explanation: "During that period, copies can be created and shared through exports, reports, or downloads.",
        },
        {
          id: "after",
          number: "03",
          icon: "question",
          title: "After Deletion?",
          summary: "Where those copies ended up may not be tracked.",
          explanation:
            "Once the original record is deleted, whether every copy made from it is also deleted is a separate question that the retention policy alone does not answer.",
        },
      ],
    },

    {
      type: "cardGrid",
      heading: "Questions Worth Asking Before a System Is Deployed",
      cards: [
        {
          number: "1",
          title: "Who can search it?",
          body: "Just the deploying agency? Other agencies? Statewide or nationwide access?",
        },
        {
          number: "2",
          title: "Who can copy it?",
          body: "Can search results be downloaded, screenshotted, or exported as evidence files?",
        },
        {
          number: "3",
          title: "Who can receive it?",
          body: "Which other systems or agencies can receive the information once it leaves the original database?",
        },
        {
          number: "4",
          title: "Where can it go?",
          body: "Which systems, databases, or jurisdictions is it allowed to travel to?",
        },
        {
          number: "5",
          title: "Who authorized those connections?",
          body: "Was a sharing connection approved by a police chief, an administrator, a city council, or a contract term?",
        },
        {
          number: "6",
          title: "Who verifies the answers?",
          body: "Is there an audit process, and is the public notified when connections or sharing arrangements change?",
        },
      ],
    },

    {
      type: "takeaway",
      heading: "The Bottom Line",
      body: "Owning the data is not the same as controlling every place it can go.",
      supporting: "Transparency about who can search, copy, and receive stored information is a reasonable starting point for oversight.",
    },

    {
      type: "scopeNote",
      body: "The specific parties with access, the sharing arrangements in place, and the audit controls available all vary by agency, vendor, contract, and jurisdiction. This module lists categories of potential access, not a confirmed map of any one system's actual connections.",
    },
  ],

  sources: [],
};

export default controlOverInformation;
