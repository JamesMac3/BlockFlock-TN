import { useId, useState } from "react";
import "./SequencedExplainer.css";

function StageIcon({ name }) {
  const paths = {
    camera: <path d="M4 7h3l1.3-2h7.4L17 7h3v11H4V7Zm8 2.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z" />,
    upload: <path d="M12 16V5m0 0L8 9m4-4 4 4M5 14v5h14v-5" />,
    database: <path d="M4 6c0-2 16-2 16 0v12c0 2-16 2-16 0V6Zm0 0c0 2 16 2 16 0M4 12c0 2 16 2 16 0" />,
    clock: <path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4v5l3 2" />,
    search: <path d="m20 20-4.4-4.4M18 10.5a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z" />,
  };

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {paths[name] ?? paths.search}
      </g>
    </svg>
  );
}

export default function SequencedExplainer({
  title,
  description,
  stages = [],
  supportingData,
  scopeNote,
}) {
  const sequenceId = useId();
  const [activeId, setActiveId] = useState(stages[0]?.id);
  const activeStage = stages.find((stage) => stage.id === activeId) ?? stages[0];

  if (!activeStage) return null;

  function selectRelativeStage(currentIndex, direction) {
    const nextIndex = (currentIndex + direction + stages.length) % stages.length;
    setActiveId(stages[nextIndex].id);
    document.getElementById(`${sequenceId}-tab-${stages[nextIndex].id}`)?.focus();
  }

  function handleTabKeyDown(event, index) {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      selectRelativeStage(index, 1);
    }

    if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      selectRelativeStage(index, -1);
    }
  }

  return (
    <section className="sequenced-explainer" aria-labelledby={`${sequenceId}-title`}>
      <header className="sequenced-explainer__header">
        <p>Process explainer</p>
        <h3 id={`${sequenceId}-title`}>{title}</h3>
        {description && <div>{description}</div>}
      </header>

      <div className="sequenced-explainer__desktop">
        <div className="sequence-stage-row" role="tablist" aria-label={title}>
          {stages.map((stage, index) => {
            const selected = stage.id === activeStage.id;

            return (
              <button
                key={stage.id}
                id={`${sequenceId}-tab-${stage.id}`}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={`${sequenceId}-detail`}
                tabIndex={selected ? 0 : -1}
                className={selected ? "is-active" : ""}
                onClick={() => setActiveId(stage.id)}
                onKeyDown={(event) => handleTabKeyDown(event, index)}
              >
                <span className="sequence-stage__number">{stage.number}</span>
                <StageIcon name={stage.icon} />
                <span className="sequence-stage__verb">{stage.verb}</span>
                <strong>{stage.title}</strong>
                <small>{stage.summary}</small>
              </button>
            );
          })}
        </div>

        <article
          id={`${sequenceId}-detail`}
          className="sequence-stage-detail"
          role="tabpanel"
          aria-labelledby={`${sequenceId}-tab-${activeStage.id}`}
        >
          <div>
            <span>{activeStage.number} / {activeStage.verb}</span>
            <h4>{activeStage.title}</h4>
            <p>{activeStage.explanation}</p>
          </div>
          <p className="sequence-stage-detail__result">
            <span>Result</span>
            <strong>{activeStage.result}</strong>
          </p>
        </article>
      </div>

      <div className="sequenced-explainer__mobile">
        {stages.map((stage) => {
          const selected = stage.id === activeStage.id;

          return (
            <section key={stage.id} className={`sequence-accordion ${selected ? "is-open" : ""}`}>
              <button
                type="button"
                aria-expanded={selected}
                aria-controls={`${sequenceId}-mobile-detail-${stage.id}`}
                onClick={() => setActiveId(stage.id)}
              >
                <span className="sequence-stage__number">{stage.number}</span>
                <StageIcon name={stage.icon} />
                <span>
                  <small>{stage.verb}</small>
                  <strong>{stage.title}</strong>
                </span>
                <i aria-hidden="true">{selected ? "−" : "+"}</i>
              </button>
              {selected && (
                <div id={`${sequenceId}-mobile-detail-${stage.id}`}>
                  <p>{stage.summary}</p>
                  <p>{stage.explanation}</p>
                  <p className="sequence-stage-detail__result">
                    <span>Result</span>
                    <strong>{stage.result}</strong>
                  </p>
                </div>
              )}
            </section>
          );
        })}
      </div>

      {supportingData && (
        <section className="sequence-supporting-data">
          <h4>{supportingData.title}</h4>
          <ul>
            {supportingData.items.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </section>
      )}

      {scopeNote && <p className="sequence-scope-note">{scopeNote}</p>}
    </section>
  );
}
