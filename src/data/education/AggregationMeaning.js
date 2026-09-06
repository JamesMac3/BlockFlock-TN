const aggregationMeaning = {
  slug: "aggregation-changes-what-data-means",
  navGroup: "From Data to Insight",
  navLabel: "Aggregation Changes What the Data Means",
  title: "Aggregation Changes What the Data Means",
  dek: "One record tells you where a vehicle was. Many records, combined, can begin telling you about the person driving it.",

  blocks: [
    {
      type: "intro",
      body: "A single observation is almost meaningless by itself: a vehicle was on a particular street at a particular time. Nothing about that one record changes when a second, a tenth, or a thousandth similar record is added. What changes is what can be learned once they are placed next to each other.",
    },

    {
      type: "stageFlow",
      heading: "From One Record to a Pattern",
      stages: [
        {
          id: "one",
          number: "01",
          icon: "camera",
          title: "One Observation",
          summary: "A moment in time.",
          explanation:
            "A vehicle was recorded on a particular street on a particular afternoon. There is not much to learn from a single record like this.",
        },
        {
          id: "many",
          number: "02",
          icon: "database",
          title: "Many Observations",
          summary: "The same kind of data, collected over time.",
          explanation:
            "The same plate is recorded again and again across different days and times. The records themselves have not changed — they are still just plate, location, and time — but there are now many of them.",
        },
        {
          id: "pattern",
          number: "03",
          icon: "network",
          title: "Pattern Emerges",
          summary: "Repetition creates new inferences.",
          explanation:
            "Once enough observations exist, an analyst can infer likely patterns: where a vehicle is seen most nights, where it is seen on weekday mornings, where it recurs on a particular day of the week, and which other vehicles it is frequently seen near.",
          detail: [
            "These are inferences, not verified facts — a repeated location does not, by itself, confirm a home, workplace, or relationship.",
          ],
        },
      ],
    },

    {
      type: "principle",
      heading: "The records haven't changed. Their meaning has.",
      explanation:
        "A photograph is not a movie. One photo shows a moment. Thousands of photos, placed in sequence, show a history. Nothing magical happens to the individual photos — the capability emerges entirely from putting them together.",
    },

    {
      type: "cardGrid",
      heading: "Why It Matters",
      cards: [
        {
          title: "More cameras",
          body: "More coverage means more observations feeding into the same aggregation.",
        },
        {
          title: "Longer retention",
          body: "A longer retention window means more history is available to analyze at once.",
        },
        {
          title: "More sharing and integrations",
          body: "When systems are connected, more data can be combined across agencies and platforms.",
        },
        {
          title: "Combination with other data",
          body: "Combining location records with other data sources can support richer, more personal conclusions than location data alone.",
        },
      ],
    },

    {
      type: "takeaway",
      heading: "The Unanswered Question",
      body: "Individually ordinary observations can collectively reveal details about daily life that no single record would show.",
      supporting:
        "Whether — and with whom — an aggregated dataset can be combined further is often not fully visible to the public or even to the agency operating the original cameras.",
    },

    {
      type: "scopeNote",
      body: "Whether a given system supports cross-agency sharing, data-broker access, or combination with other datasets varies by vendor, contract, and policy. This module describes the general effect of aggregation, not a claim about any specific deployment's actual data-sharing practices.",
    },
  ],

  sources: [],
};

export default aggregationMeaning;
