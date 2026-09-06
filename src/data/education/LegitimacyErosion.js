const legitimacyErosion = {
  slug: "legitimacy-erosion",
  navGroup: "Systemic Risk",
  navLabel: "Legitimacy Erosion",
  title: "Legitimacy Erosion",
  dek: "Surveillance infrastructure creates risk for the government or institution that deploys it, not only for the population it monitors.",

  blocks: [
    {
      type: "intro",
      body: "Discussions about persistent surveillance often focus entirely on risk to the people being watched. The infrastructure itself — the cameras, the network, the stored data — is also a target and a liability for the institution that owns and operates it.",
    },

    {
      type: "cardGrid",
      heading: "Six Ways Legitimacy Can Erode",
      cards: [
        {
          number: "1",
          title: "An apolitical issue",
          body: "Surveillance capability affects all residents regardless of political affiliation. Once it becomes framed as government power versus individual autonomy, partisan justifications on either side tend to lose credibility.",
        },
        {
          number: "2",
          title: "Trust breaks down beyond the intended targets",
          body: "Distrust of a system can spread beyond its original targets to ordinary residents. Frustration may be misdirected at local officers or employees who had little role in the decision to build the system.",
        },
        {
          number: "3",
          title: "Inaction erodes legitimacy",
          body: "If a concern is raised and ignored, the issue can stop being a narrow technology question and become a broader question of whether local institutions can be trusted to govern responsibly.",
        },
        {
          number: "4",
          title: "Officials become higher-value targets",
          body: "The same infrastructure used to monitor the public can potentially be turned toward the officials who operate and authorize it, making its existence a risk to them as well.",
        },
        {
          number: "5",
          title: "Dependence creates fragility",
          body: "Over-reliance on a surveillance system can weaken traditional skills and procedures, so that outages, vendor failures, legal changes, or removal of the system can disrupt operations that came to depend on it.",
        },
        {
          number: "6",
          title: "Security risk grows with capability",
          body: "No complex, connected system stays secure indefinitely. Greater capability and connectivity tend to make a system a larger target over time.",
        },
      ],
    },

    {
      type: "cardGrid",
      heading: "Adversaries Are Not Just Hackers",
      description: "A surveillance system can attract interest from more than one type of adversary, for more than one motive.",
      cards: [
        { title: "Criminals", body: "Motivated by financial gain, extortion, or blackmail using stolen or leaked data." },
        { title: "Nation-states", body: "Motivated by intelligence gathering, influence, or destabilization." },
        { title: "Near-peer adversaries", body: "Rival jurisdictions, agencies, or competing organizations." },
        { title: "Powerful individuals or entities", body: "Corporations, executives, or other influential actors with an interest in the data." },
        { title: "Anyone with sufficient capability", body: "Advanced tools, insider access, or opportunistic exploitation can come from unexpected sources." },
      ],
    },

    {
      type: "principle",
      heading: "A surveillance capability creates risk for the institution that possesses it, not merely for the population subjected to it.",
      explanation:
        "Loss of public trust, operational vulnerability, cybersecurity exposure, counterintelligence risk, and personal risk to officials are all consequences that fall on the operator of a system, not only on the people it watches.",
    },

    {
      type: "takeaway",
      heading: "The Question Is Not Whether a System Is Secure Today",
      body: "The more useful question is what the consequences are when one component eventually fails.",
      supporting: "Every complex system eventually experiences an outage, a breach, a policy change, or a failure of some kind. Planning for that possibility is different from assuming it will never happen.",
    },

    {
      type: "scopeNote",
      body: "The likelihood and severity of any of these risks varies by system, agency, and threat environment. This module describes categories of risk that surveillance infrastructure can create for the institutions that operate it, not a claim that any specific system has already experienced these outcomes.",
    },
  ],

  sources: [],
};

export default legitimacyErosion;
