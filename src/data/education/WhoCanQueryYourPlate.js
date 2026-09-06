const whoCanQueryYourPlate = {
  slug: "who-can-see-your-plate",
  navGroup: "How Collection Works",
  navLabel: "Who Can See Your Plate?",
  title: "Who Can See Your Plate?",
  dek: "Does your city or county's ALPR information become queryable by entities beyond your local police department through a vendor's sharing, lookup, API, or integration features?",

  blocks: [
    {
      type: "intro",
      body: "A department's own policy might describe exactly who on its own staff can run a search. That answer alone often does not describe what a vendor's platform allows once sharing, lookup, or integration features are enabled between agencies.",
    },

    {
      type: "cardGrid",
      heading: "Then Determine",
      description: "These questions apply whether or not any specific sharing arrangement is currently active for a given deployment.",
      cards: [
        {
          number: "1",
          title: "Who can query it?",
          body: "Which agencies, users, systems, or third parties have permission to search your city or county's ALPR data?",
        },
        {
          number: "2",
          title: "What do they receive?",
          body: "What information is returned — plate, date, time, location, image, vehicle attributes, and other data?",
        },
        {
          number: "3",
          title: "Whether they receive a copy or a query result",
          body: "Do recipients get a full export of the data or only on-screen results? Are results logged?",
        },
        {
          number: "4",
          title: "Which sharing settings are enabled?",
          body: "What features are active? Who can initiate searches? Are bulk searches or exports allowed?",
        },
        {
          number: "5",
          title: "Whether those relationships are direct, radius, statewide, or national",
          body: "How far can the data travel, and what jurisdictions are connected through the sharing arrangement?",
        },
        {
          number: "6",
          title: "Who authorized them?",
          body: "Who approved these connections and sharing arrangements, and under what policies or agreements?",
        },
      ],
    },

    {
      type: "takeaway",
      heading: "Transparency Is the First Step",
      body: "Whether a local system's data becomes queryable beyond the department that installed it is a configuration question, not an assumption either way.",
      supporting: "A community reasonably has an interest in a clear, specific answer to each of the six questions above for its own local deployment.",
    },

    {
      type: "scopeNote",
      body: "Sharing architecture, lookup features, and API access vary by vendor, product tier, and the specific agreements a given agency has entered into. This module lists the categories of questions worth asking, not a claim about how any particular vendor's platform is currently configured.",
    },
  ],

  sources: [],
};

export default whoCanQueryYourPlate;
