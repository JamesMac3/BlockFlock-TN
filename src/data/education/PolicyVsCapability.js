const policyVsCapability = {
  slug: "policy-does-not-remove-capability",
  navGroup: "The Investigative Shift",
  navLabel: "Policy Does Not Remove Capability",
  title: "Policy Does Not Remove Capability",
  dek: "A policy can tell someone not to use a capability. It does not make the capability disappear.",

  blocks: [
    {
      type: "intro",
      body: "Rules about who may search a database, and under what circumstances, are often described as the safeguard that makes persistent collection acceptable. A rule governing access is a different thing from a limit on what was collected in the first place — and the two protect against different risks.",
    },

    {
      type: "comparison",
      heading: "Where the Safeguard Sits",
      description: "Compare where judicial or supervisory authorization is required in each model.",
      before: {
        label: "Traditional Warrant Model (Targeted)",
        description: "Authorization is required before information is obtained.",
        stages: [
          {
            id: "wants",
            number: "01",
            icon: "eye",
            title: "Government Wants Information",
            summary: "An interest in a specific person or fact arises.",
            explanation: "A government actor wants information about a specific person, based on some existing fact or suspicion.",
          },
          {
            id: "judge",
            number: "02",
            icon: "scale",
            title: "Goes to an Independent Judge",
            summary: "A neutral authority reviews the request.",
            explanation: "The request goes to an independent judge or magistrate for review before any information is obtained.",
          },
          {
            id: "authorizes",
            number: "03",
            icon: "document",
            title: "Judge Authorizes the Search",
            summary: "A warrant is issued, if justified.",
            explanation: "If the legal standard is met, the judge authorizes the search through a warrant.",
          },
          {
            id: "obtains",
            number: "04",
            icon: "database",
            title: "Government Obtains Information",
            summary: "Information about the person is acquired.",
            explanation:
              "Only after authorization does the government obtain the information — meaning no database of everyone was created in the process.",
          },
        ],
      },
      after: {
        label: "Collection-First Model (Persistent ALPR)",
        description: "Information is collected about everyone first; authorization, if required, applies only to searching it.",
        stages: [
          {
            id: "no-warrant",
            number: "01",
            icon: "camera",
            title: "No Warrant Needed to Collect",
            summary: "Every passing vehicle is recorded.",
            explanation: "Cameras record every passing vehicle without any individualized suspicion or judicial authorization.",
          },
          {
            id: "transmitted",
            number: "02",
            icon: "tower",
            title: "Record Transmitted and Preserved",
            summary: "The observation is stored.",
            explanation: "The observation is transmitted and preserved in a database for the system's configured retention period.",
          },
          {
            id: "accumulate",
            number: "03",
            icon: "database",
            title: "Records Accumulate",
            summary: "A growing history builds up, without individualized authorization.",
            explanation:
              "Records accumulate across every vehicle observed, without individualized judicial authorization at the point of collection.",
          },
          {
            id: "reason-develops",
            number: "04",
            icon: "question",
            title: "An Investigative Reason Develops",
            summary: "A person or vehicle becomes relevant.",
            explanation: "At some later point, an investigative reason develops that makes a particular vehicle or person relevant.",
          },
          {
            id: "warrant-search",
            number: "05",
            icon: "scale",
            title: "Authorization May Be Required to Search",
            summary: "A warrant or approval may gate access to what already exists.",
            explanation:
              "Depending on the jurisdiction and system, a warrant or supervisory approval may be required before the already-existing database can be searched.",
          },
          {
            id: "database-searched",
            number: "06",
            icon: "search",
            title: "Historical Database Searched",
            summary: "The pre-existing history is retrieved.",
            explanation: "The historical database — built before the investigation existed — is searched and reconstructed.",
          },
        ],
      },
    },

    {
      type: "principle",
      heading: "A rule about who may search protects access. It does not prevent the database from existing.",
      explanation:
        "When authorization is required before collection, the information about a specific person does not exist until that authorization is granted. When authorization is only required before a search, the information about everyone already exists — the rule only decides who is allowed to look at it and when.",
    },

    {
      type: "cardGrid",
      heading: "Prevention vs. Detection",
      cards: [
        {
          title: "Prevention",
          body: "When the information does not exist until authorized, the underlying risk is prevented before it can occur.",
        },
        {
          title: "Detection",
          body: "When the information already exists, risk is instead managed after the fact through rules, audits, and penalties for misuse.",
        },
      ],
    },

    {
      type: "cardGrid",
      heading: "Policies Can Change. Capability Remains.",
      cards: [
        { title: "Administrations change", body: "New leadership can bring different priorities for how existing systems are used." },
        { title: "Leadership changes", body: "A change in department leadership can change day-to-day search practices." },
        { title: "Laws and policies change", body: "Legal rules governing access can be revised over time." },
        { title: "Vendors and contracts change", body: "A new contract or vendor relationship can change what is technically possible." },
        { title: "Software and features change", body: "New features can be added to an existing platform without new hardware." },
        { title: "Mistakes and breaches happen", body: "Human error and security incidents remain possible regardless of the access policy in place." },
      ],
    },

    {
      type: "takeaway",
      heading: "Policy Tells People What They Should Do. Architecture Determines What Can Happen.",
      body: "A database built once tends to survive changes in policy, leadership, and law unless its architecture limits what is collected or retained in the first place.",
      supporting: "An access policy is a meaningful safeguard. It is a different kind of safeguard than a limit on collection.",
    },

    {
      type: "scopeNote",
      body: "Whether a warrant or other authorization is legally required to search a given database, and what that standard is, varies by system and jurisdiction. This module describes a structural distinction between collection-time and access-time safeguards, and does not offer a legal conclusion about what any specific law requires.",
    },
  ],

  sources: [],
};

export default policyVsCapability;
