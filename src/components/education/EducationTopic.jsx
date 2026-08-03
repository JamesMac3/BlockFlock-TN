import SequencedExplainer from "./SequencedExplainer";

function SourceLinks({ sources = [] }) {
  if (sources.length === 0) {
    return null;
  }

  return (
    <ul className="source-links">
      {sources.map((source) => (
        <li key={source.url}>
          <a
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {source.label}
          </a>
        </li>
      ))}
    </ul>
  );
}

export default function EducationTopic({ topic }) {
  if (!topic?.company) {
    return null;
  }

  const capabilities = topic.company.capabilities ?? [];
  const operation = topic.operation ?? [];
  const findings = topic.findings ?? [];
  const caseStudies = topic.caseStudies ?? [];
  const sequencedExplainer = topic.sequencedExplainer;

  return (
    <article className="education-topic">
      <header className="education-topic__header">
        <h2>{topic.company.name}</h2>
        <p>{topic.company.description}</p>
      </header>

      <section className="education-section">
        <h3>Capabilities</h3>

        <ul className="capability-list">
          {capabilities.map((capability) => (
            <li key={capability}>{capability}</li>
          ))}
        </ul>
      </section>

      {sequencedExplainer && <SequencedExplainer {...sequencedExplainer} />}

      <section className="education-section">
        <h3>System Operation</h3>

        {operation.map((item) => (
          <div key={item.title} className="education-item">
            <h4>{item.title}</h4>
            <p>{item.content}</p>
          </div>
        ))}
      </section>

      <section className="education-section">
        <h3>Documented Findings</h3>

        {findings.map((finding) => (
          <div key={finding.title} className="education-item">
            <h4>{finding.title}</h4>
            <p>{finding.summary}</p>

            <SourceLinks sources={finding.sources} />
          </div>
        ))}
      </section>

      <section className="education-section">
        <h3>Case Studies</h3>

        {caseStudies.map((caseStudy) => (
          <div key={caseStudy.title} className="education-item">
            <h4>{caseStudy.title}</h4>
            <p>{caseStudy.summary}</p>

            <SourceLinks sources={caseStudy.sources} />
          </div>
        ))}
      </section>
    </article>
  );
}
