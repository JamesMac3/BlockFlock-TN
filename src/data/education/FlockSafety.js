const flockSafety = {
  company: {
    name: "Flock Safety",
    headquarters: "Atlanta, Georgia",

    description:
      "Flock Safety develops networked surveillance hardware and software used by law enforcement agencies, public-safety organizations, businesses, schools, neighborhoods, and private security operators.",

    capabilities: [
      "Automatic License Plate Recognition",
      "Vehicle and Video Surveillance",
      "Gunshot and Audio-Event Detection",
      "Drone-Based Aerial Surveillance",
      "Real-Time Crime Center Software",
      "Cross-System and Cross-Agency Data Integration",
    ],
  },

  operation: [
    {
      title: "Distributed Camera and Sensor Network",
      content:
        "Flock deploys roadside license-plate readers, video cameras, audio sensors, mobile surveillance trailers, and drones. Its license-plate readers capture vehicle images and associated details when vehicles pass within view of a device.",
      sources: [
        {
          label: "Flock Safety Product Overview",
          url: "https://www.flocksafety.com/products",
        },
      ],
    },
    {
      title: "Cellular Data Transmission",
      content:
        "Flock states that individual license-plate readers and audio-detection sensors communicate with its cloud services through cellular networks. Images, audio clips, and associated metadata are transmitted using encrypted connections.",
      sources: [
        {
          label: "Flock Sensor Security Alert",
          url: "https://www.flocksafety.com/blog/gunshot-detection-and-license-plate-reader-security-alert",
        },
      ],
    },
    {
      title: "Cloud Storage and Processing",
      content:
        "Flock states that uploaded footage and metadata are stored through Amazon Web Services using encryption at rest. Its published evidence policy describes a default rolling retention period of 30 days unless law or an individual customer agreement requires otherwise.",
      sources: [
        {
          label: "Flock Evidence Policy",
          url: "https://www.flocksafety.com/legal/flock-evidence-policy",
        },
      ],
    },
    {
      title: "Search and Automated Analysis",
      content:
        "The platform makes captured records searchable and can organize vehicle, video, location, time, alert, and incident information. Flock also markets natural-language searching across compatible video and license-plate systems.",
      sources: [
        {
          label: "Flock Safety Product Overview",
          url: "https://www.flocksafety.com/products",
        },
      ],
    },
    {
      title: "Real-Time Crime Center Integration",
      content:
        "FlockOS is designed to combine license-plate readers, video, sensors, computer-aided dispatch, records-management systems, drones, 911 information, gunshot detection, and other sources into a shared operational interface.",
      sources: [
        {
          label: "FlockOS Platform",
          url: "https://www.flocksafety.com/products/flock-os",
        },
      ],
    },
    {
      title: "Cross-Agency and Private-Sector Sharing",
      content:
        "Flock promotes cross-agency information sharing and operates systems used by both public and private organizations. Access to a participating organization's records can therefore extend beyond the organization that physically operates a particular camera when sharing permissions are enabled.",
      sources: [
        {
          label: "FlockOS Platform",
          url: "https://www.flocksafety.com/products/flock-os",
        },
      ],
    },
  ],

  findings: [
    {
      title: "Publicly Accessible Condor Camera Interfaces",
      summary:
        "In 2025, researchers located more than 60 Flock Condor camera interfaces that were accessible over the public internet without password protection. Reporting showed that exposed interfaces could provide live camera access and, in some instances, administrative controls and recorded footage. Flock characterized the exposure as a limited configuration problem and said it was addressed.",
      sources: [
        {
          label: "The Verge — Exposed Flock Camera Feeds",
          url: "https://www.theverge.com/news/849624/flock-ai-camera-feeds-exposed-benn-jordan",
        },
        {
          label: "Flock Safety Security Response",
          url: "https://www.flocksafety.com/blog/has-flock-been-hacked",
        },
      ],
    },
    {
      title: "Private Camera Networks Shared With Police",
      summary:
        "Public-record reporting documented private companies granting police access to Flock surveillance feeds. Examples included cameras operated around commercial properties and distribution facilities, extending police-accessible vehicle surveillance beyond cameras purchased directly by government agencies.",
      sources: [
        {
          label: "Forbes — Simon Property Camera Sharing",
          url: "https://www.forbes.com/sites/thomasbrewster/2024/05/06/simon-property-and-flock-safety-feed-ai-surveillance-feeds-to-the-cops/",
        },
        {
          label: "Forbes — FedEx Camera Sharing",
          url: "https://www.forbes.com/sites/thomasbrewster/2024/06/19/fedex-police-help-cops-build-an-ai-car-surveillance-network/",
        },
      ],
    },
    {
      title: "Audio Clips Retained as Evidence",
      summary:
        "Flock states that its audio-detection devices can preserve three-second recordings when the system detects gunshots, fireworks, or certain vehicle-related audio events. Those clips and their associated metadata are transmitted to cloud storage and may be retained as evidence.",
      sources: [
        {
          label: "Flock Sensor Security Alert",
          url: "https://www.flocksafety.com/blog/gunshot-detection-and-license-plate-reader-security-alert",
        },
      ],
    },
    {
      title: "Integrated Multi-System Operational View",
      summary:
        "FlockOS is marketed as a platform capable of combining public and private video, license-plate records, drones, audio detections, dispatch information, records systems, 911 information, and outside vendor systems. The resulting interface is broader than a standalone license-plate-reader deployment.",
      sources: [
        {
          label: "FlockOS Platform",
          url: "https://www.flocksafety.com/products/flock-os",
        },
      ],
    },
  ],

  caseStudies: [
    {
      title: "Exposed Condor Camera Feeds",
      summary:
        "Researchers used an internet-connected-device search engine to locate publicly exposed Flock Condor systems. They demonstrated live access by standing within view of an affected camera while observing themselves through its interface. The exposure showed that a locally deployed camera could become remotely accessible when its supporting interface was improperly configured.",
      sources: [
        {
          label: "The Verge — Exposed Flock Camera Feeds",
          url: "https://www.theverge.com/news/849624/flock-ai-camera-feeds-exposed-benn-jordan",
        },
        {
          label: "Flock Safety Security Response",
          url: "https://www.flocksafety.com/blog/has-flock-been-hacked",
        },
      ],
    },
    {
      title: "Commercial Property Camera Sharing",
      summary:
        "Public records obtained by journalists showed that cameras operated by major private companies were shared with law-enforcement users through Flock. These arrangements illustrate how a government-accessible surveillance network can include privately funded cameras located outside a traditional municipal camera deployment.",
      sources: [
        {
          label: "Forbes — Simon Property Camera Sharing",
          url: "https://www.forbes.com/sites/thomasbrewster/2024/05/06/simon-property-and-flock-safety-feed-ai-surveillance-feeds-to-the-cops/",
        },
        {
          label: "Forbes — FedEx Camera Sharing",
          url: "https://www.forbes.com/sites/thomasbrewster/2024/06/19/fedex-police-help-cops-build-an-ai-car-surveillance-network/",
        },
      ],
    },
  ],

  evidence: [],
};

export default flockSafety;