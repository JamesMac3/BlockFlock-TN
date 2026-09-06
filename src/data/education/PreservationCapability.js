const preservationCapability = {
  slug: "preservation-changes-the-capability",
  navGroup: "How Collection Works",
  navLabel: "Preservation Changes the Capability",
  title: "Preservation Changes the Capability",
  dek: "The camera sees a moment. Preservation is what makes that moment available to the future.",

  blocks: [
    {
      type: "intro",
      body: "A single license-plate camera only ever sees one instant: a vehicle passing a fixed point at a fixed time. On its own, that instant is forgettable. What changes the capability of the system is not the camera, but the decision to keep what the camera saw.",
    },

    {
      type: "stageFlow",
      heading: "From a Moment to a Searchable History",
      description: "Select each stage to see what actually happens to a single observation.",
      stages: [
        {
          id: "observation",
          number: "01",
          icon: "camera",
          title: "Observation",
          summary: "A camera sees a moment.",
          explanation:
            "A roadside camera captures a vehicle's plate along with the time and location of the pass. Without preservation, this observation is temporary: it exists only long enough to be processed and is then gone.",
        },
        {
          id: "preservation",
          number: "02",
          icon: "database",
          title: "Preservation",
          summary: "The moment is recorded and stored.",
          explanation:
            "Instead of discarding the observation, the system writes it to storage alongside every other plate read from every other camera on the network. Individually ordinary records accumulate into a growing log tied to a retention window set by the operator's policy.",
          detail: [
            "Each stored record typically includes the plate, timestamp, and camera location.",
            "How long records are kept before deletion is a configuration choice, not a fixed technical limit.",
          ],
        },
        {
          id: "retrieval",
          number: "03",
          icon: "search",
          title: "Retrieval",
          summary: "The past becomes searchable.",
          explanation:
            "Once an investigative reason exists, an authorized user can search stored records by plate, and every preserved sighting within the retention window is returned at once — sightings from different days and different locations, reassembled in seconds.",
        },
      ],
    },

    {
      type: "principle",
      heading: "Preservation transforms a fleeting observation into a searchable history.",
      explanation:
        "Nothing about the camera itself changes when retention is added. The capability comes entirely from the decision to keep what would otherwise have disappeared.",
    },

    {
      type: "cardGrid",
      heading: "What Preservation Adds That the Camera Alone Does Not",
      cards: [
        {
          title: "A single sighting becomes a timeline",
          body: "One camera pass tells you almost nothing on its own. Preserved sightings across days or weeks can be pulled together into a timeline of where a vehicle has been.",
        },
        {
          title: "The retention window sets the reach of a search",
          body: "A longer retention period does not change what a camera can see in the moment, but it does change how far back an investigator can search once a reason to look arises.",
        },
        {
          title: "Where the data can travel is a separate question",
          body: "Encryption in transit and at rest protects data from outside interception, but it does not answer who else the operator's network, cloud provider, or partner agencies can share stored records with.",
        },
      ],
    },

    {
      type: "takeaway",
      heading: "The Question Worth Asking",
      body: "The question is no longer simply who can see a plate in the moment.",
      supporting:
        "It is who can retrieve where that plate was after the moment has already passed — and for how long that remains true.",
    },

    {
      type: "scopeNote",
      body: "Retention periods, storage locations, and what is shared with other agencies or vendors vary by system, contract, and jurisdiction. This module describes the general effect of preservation rather than the specific configuration of any one deployment.",
    },
  ],

  sources: [],
};

export default preservationCapability;
