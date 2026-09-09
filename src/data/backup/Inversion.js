const inversion = {
  slug: "the-inversion",
  navGroup: "The Investigative Shift",
  navLabel: "The Inversion",
  title: "The Inversion",
  dek: "Persistent surveillance reverses the normal order of investigation. Instead of beginning with a specific reason and then collecting relevant information, the system collects information about everyone first and allows investigators to decide later whose history to examine.",

  blocks: [
    {
      type: "intro",
      warning:
        "The concern is not only whether a system is abused. It is the investigative capability created by collecting searchable histories before anyone is suspected of anything.",
    },

    {
      type: "comparison",
      heading: "Two Investigative Orders",
      description:
        "Automatic license plate readers (ALPR) are used here as the primary example, but the same structure applies to any system that records activity continuously before anyone is a suspect.",
      before: {
        label: "Traditional Targeted Investigation",
        description: "Reason comes before collection.",
        stages: [
          {
            id: "reason",
            number: "01",
            icon: "question",
            title: "Reason",
            summary: "A crime, complaint, or specific fact creates a reason to investigate.",
            explanation:
              "A crime, complaint, or specific fact creates a reason to investigate.",
          },
          {
            id: "collect",
            number: "02",
            icon: "document",
            title: "Collect",
            summary: "Investigators obtain information relevant to that reason.",
            explanation: "Investigators obtain information relevant to that reason.",
          },
          {
            id: "analyze",
            number: "03",
            icon: "search",
            title: "Analyze",
            summary: "The collected information is examined.",
            explanation: "The collected information is examined.",
          },
          {
            id: "focus",
            number: "04",
            icon: "scale",
            title: "Focus",
            summary: "The investigation remains connected to its original justification.",
            explanation: "The investigation remains connected to its original justification.",
          },
        ],
      },
      after: {
        label: "Persistent Collection",
        description: "Collection happens first. Reason may come later.",
        stages: [
          {
            id: "collect2",
            number: "01",
            icon: "camera",
            title: "Collect",
            summary: "Cameras or sensors record vehicles or activity continuously.",
            explanation: "Cameras or sensors record vehicles or activity continuously.",
          },
          {
            id: "preserve",
            number: "02",
            icon: "database",
            title: "Preserve",
            summary: "The observations are stored for a defined retention period.",
            explanation: "The observations are stored for a defined retention period.",
          },
          {
            id: "reason-later",
            number: "03",
            icon: "clock",
            title: "Reason Arises Later",
            summary: "A person or vehicle may become relevant after the observation was recorded.",
            explanation:
              "A person or vehicle may become relevant after the observation was recorded.",
          },
          {
            id: "search2",
            number: "04",
            icon: "search",
            title: "Search",
            summary: "Investigators search backward and reconstruct earlier movements or associations.",
            explanation:
              "Investigators search backward and reconstruct earlier movements or associations.",
          },
        ],
      },
    },

    {
      type: "principle",
      heading: "Retrospective search requires prospective collection.",
      explanation:
        "To search for where a vehicle was last week, its location had to be recorded last week, before anyone knew it would later become relevant.",
    },

    {
      type: "cardGrid",
      heading: "Why It Matters",
      cards: [
        {
          number: "01",
          title: "Suspicion becomes cheap",
          body: "Searching a large database takes much less effort than conducting physical surveillance or obtaining information separately. More people can therefore be examined for weaker reasons.",
        },
        {
          number: "02",
          title: "Investigation can become exploratory",
          body: "Instead of collecting evidence to answer a defined question, investigators may search existing information to generate new questions or possible connections.",
        },
        {
          number: "03",
          title: "The past can be reconsidered",
          body: "Lawful, ordinary activity recorded today may be examined later because of an event or suspicion that did not yet exist when the information was collected.",
        },
        {
          number: "04",
          title: "Context can be reconstructed",
          body: "Separate observations can be combined over time to infer routines, relationships, frequently visited locations, and patterns of movement. These inferences can be incomplete or misleading, since a database record shows where a vehicle was, not who was driving it or why.",
        },
        {
          number: "05",
          title: "The default shifts",
          body: "A person does not need to be under investigation when their information is collected. They only need to become relevant later for their stored history to be searched.",
        },
        {
          number: "06",
          title: "Misuse does not require a conspiracy",
          body: "Routine searches, policy changes, expanded access, new integrations, or new features can gradually change how collected information is used.",
        },
      ],
    },

    {
      type: "timeline",
      heading: "Example: How Retrospective Search Works",
      description: "Step through an ordinary evening to see when investigation actually begins relative to collection.",
      steps: [
        {
          time: "7:42 PM",
          title: "Ordinary travel",
          body: "You drive home. You are not under investigation.",
        },
        {
          time: "7:42 PM",
          title: "Observation",
          body: "A roadside camera records your license plate with time and location information.",
        },
        {
          time: "7:42 PM",
          title: "Storage",
          body: "The observation enters a searchable database for the system's configured retention period.",
        },
        {
          time: "8:47 PM",
          title: "Unrelated event",
          body: "A robbery occurs elsewhere. At this point, investigators have not connected it to you.",
        },
        {
          time: "9:15 PM",
          title: "A plate becomes relevant",
          body: "Investigators receive a possible suspect vehicle plate matching yours.",
        },
        {
          time: "9:16 PM",
          title: "Retrospective search",
          body: "They search the database and find the earlier trip that was recorded before the investigation existed.",
        },
      ],
    },

    {
      type: "takeaway",
      heading: "Final Takeaway",
      body: "Information about the population is collected first. Authorities can decide later whose history to examine.",
      supporting:
        "You do not need to be under investigation when the information is collected. You only need to become relevant before the stored information expires.",
    },

    {
      type: "scopeNote",
      body: "Retention periods, access rules, audit controls, integrations, and permitted uses vary between systems and jurisdictions. This module explains the structural capability created by persistent, searchable collection rather than claiming that every deployment operates identically.",
    },
  ],

  sources: [],
};

export default inversion;
