import { useId, useState } from "react";
import "./InteractiveModule.css";

const ICON_PATHS = {
  camera: "M4 7h3l1.3-2h7.4L17 7h3v11H4V7Zm8 2.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z",
  tower: "M12 3l7 6h-4l2 12h-2l-1.5-9h-3L9 21H7l2-12H5l7-6Zm0 0v6",
  database: "M4 6c0-2 16-2 16 0v12c0 2-16 2-16 0V6Zm0 0c0 2 16 2 16 0M4 12c0 2 16 2 16 0",
  clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4v5l3 2",
  search: "m20 20-4.4-4.4M18 10.5a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z",
  brain: "M9 4a3 3 0 0 0-3 3 3 3 0 0 0-1 5.8A3 3 0 0 0 8 17a3 3 0 0 0 4-2.8V6a3 3 0 0 0-3-2Zm6 0a3 3 0 0 1 3 3 3 3 0 0 1 1 5.8A3 3 0 0 1 16 17a3 3 0 0 1-4-2.8V6a3 3 0 0 1 3-2Z",
  link: "M9 15l6-6M8 16l-2 2a3.5 3.5 0 0 1-5-5l3-3a3.5 3.5 0 0 1 5-.3M16 8l2-2a3.5 3.5 0 0 1 5 5l-3 3a3.5 3.5 0 0 1-5 .3",
  alert: "M12 3 2 20h20L12 3Zm0 7v4m0 3h.01",
  document: "M7 3h7l4 4v14H7V3Zm7 0v4h4M9 12h6M9 16h6",
  monitor: "M4 5h16v11H4V5Zm5 15h6m-3-4v4",
  lock: "M6 11V8a6 6 0 0 1 12 0v3m-13 0h14v10H5V11Z",
  scale: "M12 3v18M7 6h10M5 6l-3 6a3 3 0 0 0 6 0L5 6Zm14 0-3 6a3 3 0 0 0 6 0l-3-6Z",
  car: "M4 16V11l2-5h12l2 5v5m-16 0h16m-16 0a2 2 0 1 0 4 0m8 0a2 2 0 1 0 4 0M4 11h16",
  question: "M9 8a3 3 0 1 1 4.5 2.6C12.5 11.2 12 11.9 12 13m0 4h.01M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3Z",
  people: "M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM2 20c0-3.3 2.7-5 6-5s6 1.7 6 5m2-5c3.3 0 6 1.7 6 5",
  eye: "M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  copy: "M8 8h11v11H8V8Zm-3 8H4V4h11v1",
  network: "M12 3v4m0 10v4M4 12h4m8 0h4M6.3 6.3l2.8 2.8m9.6 9.6-2.8-2.8m0-9.6 2.8-2.8M6.3 17.7l2.8-2.8M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z",
  cloud: "M7 18a4 4 0 0 1-.5-8A5.5 5.5 0 0 1 17 9.5 4 4 0 0 1 17 18H7Z",
};

function StageIcon({ name }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d={ICON_PATHS[name] ?? ICON_PATHS.search} />
      </g>
    </svg>
  );
}

function StageTabs({ groupId, stages, ariaLabel }) {
  const [activeId, setActiveId] = useState(stages[0]?.id);
  const activeStage = stages.find((stage) => stage.id === activeId) ?? stages[0];

  if (!activeStage) return null;

  function selectRelative(index, direction) {
    const nextIndex = (index + direction + stages.length) % stages.length;
    setActiveId(stages[nextIndex].id);
    document.getElementById(`${groupId}-tab-${stages[nextIndex].id}`)?.focus();
  }

  function handleKeyDown(event, index) {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      selectRelative(index, 1);
    }
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      selectRelative(index, -1);
    }
  }

  return (
    <div className="im-stagetabs">
      <div className="im-stagetabs__desktop">
        <div className="im-stage-row" role="tablist" aria-label={ariaLabel}>
          {stages.map((stage, index) => {
            const selected = stage.id === activeStage.id;
            return (
              <button
                key={stage.id}
                id={`${groupId}-tab-${stage.id}`}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={`${groupId}-panel`}
                tabIndex={selected ? 0 : -1}
                className={selected ? "is-active" : ""}
                onClick={() => setActiveId(stage.id)}
                onKeyDown={(event) => handleKeyDown(event, index)}
              >
                {stage.number && <span className="im-stage__number">{stage.number}</span>}
                {stage.icon && <StageIcon name={stage.icon} />}
                <strong>{stage.title}</strong>
                <small>{stage.summary}</small>
              </button>
            );
          })}
        </div>

        <article
          id={`${groupId}-panel`}
          className="im-stage-detail"
          role="tabpanel"
          aria-labelledby={`${groupId}-tab-${activeStage.id}`}
        >
          <p>{activeStage.explanation}</p>
          {activeStage.detail?.length > 0 && (
            <ul>
              {activeStage.detail.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
        </article>
      </div>

      <div className="im-stagetabs__mobile">
        {stages.map((stage) => {
          const selected = stage.id === activeStage.id;
          return (
            <section key={stage.id} className={`im-accordion ${selected ? "is-open" : ""}`}>
              <button
                type="button"
                aria-expanded={selected}
                aria-controls={`${groupId}-mobile-${stage.id}`}
                onClick={() => setActiveId(stage.id)}
              >
                {stage.number && <span className="im-stage__number">{stage.number}</span>}
                {stage.icon && <StageIcon name={stage.icon} />}
                <span>
                  <strong>{stage.title}</strong>
                  <small>{stage.summary}</small>
                </span>
                <i aria-hidden="true">{selected ? "−" : "+"}</i>
              </button>
              {selected && (
                <div id={`${groupId}-mobile-${stage.id}`}>
                  <p>{stage.explanation}</p>
                  {stage.detail?.length > 0 && (
                    <ul>
                      {stage.detail.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function IntroBlock({ body, warning }) {
  return (
    <section className="im-intro">
      {body && <p>{body}</p>}
      {warning && (
        <div className="im-callout im-callout--warning" role="note">
          <StageIcon name="alert" />
          <p>{warning}</p>
        </div>
      )}
    </section>
  );
}

function StageFlowBlock({ heading, description, stages = [] }) {
  const groupId = useId();
  if (stages.length === 0) return null;

  return (
    <section className="im-block im-stageflow" aria-labelledby={`${groupId}-h`}>
      {heading && <h3 id={`${groupId}-h`}>{heading}</h3>}
      {description && <p className="im-block__description">{description}</p>}
      <StageTabs groupId={groupId} stages={stages} ariaLabel={heading} />
    </section>
  );
}

function ComparisonBlock({ heading, description, before, after }) {
  const groupId = useId();

  return (
    <section className="im-block im-comparison" aria-labelledby={`${groupId}-h`}>
      {heading && <h3 id={`${groupId}-h`}>{heading}</h3>}
      {description && <p className="im-block__description">{description}</p>}

      <div className="im-compare">
        <div className="im-compare__col im-compare__col--before">
          <h4>{before.label}</h4>
          {before.description && <p>{before.description}</p>}
          <StageTabs groupId={`${groupId}-before`} stages={before.stages} ariaLabel={before.label} />
        </div>

        <div className="im-compare__col im-compare__col--after">
          <h4>{after.label}</h4>
          {after.description && <p>{after.description}</p>}
          <StageTabs groupId={`${groupId}-after`} stages={after.stages} ariaLabel={after.label} />
        </div>
      </div>
    </section>
  );
}

function CardGridBlock({ heading, description, cards = [] }) {
  const groupId = useId();
  const [openIds, setOpenIds] = useState(() => new Set());

  function toggle(id) {
    setOpenIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (cards.length === 0) return null;

  return (
    <section className="im-block im-cardgrid" aria-labelledby={`${groupId}-h`}>
      {heading && <h3 id={`${groupId}-h`}>{heading}</h3>}
      {description && <p className="im-block__description">{description}</p>}

      <div className="im-cards">
        {cards.map((card, index) => {
          const id = card.id ?? `${groupId}-card-${index}`;
          const open = openIds.has(id);
          return (
            <div className={`im-card ${open ? "is-open" : ""}`} key={id}>
              <button
                type="button"
                aria-expanded={open}
                aria-controls={`${id}-panel`}
                onClick={() => toggle(id)}
              >
                {card.number && <span className="im-card__number">{card.number}</span>}
                <span className="im-card__title">{card.title}</span>
                <i aria-hidden="true">{open ? "−" : "+"}</i>
              </button>
              {open && (
                <div id={`${id}-panel`} className="im-card__body">
                  <p>{card.body}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function TimelineBlock({ heading, description, steps = [] }) {
  const groupId = useId();
  const [index, setIndex] = useState(0);
  const step = steps[index];

  if (!step) return null;

  return (
    <section className="im-block im-timeline" aria-labelledby={`${groupId}-h`}>
      {heading && <h3 id={`${groupId}-h`}>{heading}</h3>}
      {description && <p className="im-block__description">{description}</p>}

      <p className="im-timeline__progress">
        Step {index + 1} of {steps.length}
      </p>

      <div className="im-timeline__rail" aria-hidden="true">
        {steps.map((_, dotIndex) => (
          <span key={dotIndex} className={dotIndex <= index ? "is-past" : ""} />
        ))}
      </div>

      <article className="im-timeline__card" aria-live="polite">
        {step.time && <span className="im-timeline__time">{step.time}</span>}
        <h4>{step.title}</h4>
        <p>{step.body}</p>
      </article>

      <div className="im-timeline__controls">
        <button
          type="button"
          onClick={() => setIndex((current) => Math.max(0, current - 1))}
          disabled={index === 0}
        >
          Previous
        </button>
        <button type="button" onClick={() => setIndex(0)} disabled={index === 0}>
          Restart
        </button>
        <button
          type="button"
          onClick={() => setIndex((current) => Math.min(steps.length - 1, current + 1))}
          disabled={index === steps.length - 1}
        >
          Next
        </button>
      </div>
    </section>
  );
}

function PrincipleBlock({ heading, explanation }) {
  return (
    <section className="im-block im-principle">
      {heading && <p className="im-principle__headline">{heading}</p>}
      {explanation && <p className="im-principle__explanation">{explanation}</p>}
    </section>
  );
}

function TakeawayBlock({ heading, body, supporting }) {
  return (
    <section className="im-block im-takeaway">
      {heading && <h3>{heading}</h3>}
      {body && <p className="im-takeaway__body">{body}</p>}
      {supporting && <p className="im-takeaway__supporting">{supporting}</p>}
    </section>
  );
}

function ScopeNoteBlock({ body }) {
  if (!body) return null;
  return (
    <section className="im-block im-scopenote">
      <p>{body}</p>
    </section>
  );
}

function SourcesBlock({ sources = [] }) {
  if (sources.length === 0) return null;
  return (
    <section className="im-block im-sources">
      <h3>Sources</h3>
      <ul>
        {sources.map((source) => (
          <li key={source.url}>
            <a href={source.url} target="_blank" rel="noopener noreferrer">
              {source.label}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Block({ block }) {
  switch (block.type) {
    case "intro":
      return <IntroBlock {...block} />;
    case "stageFlow":
      return <StageFlowBlock {...block} />;
    case "comparison":
      return <ComparisonBlock {...block} />;
    case "cardGrid":
      return <CardGridBlock {...block} />;
    case "timeline":
      return <TimelineBlock {...block} />;
    case "principle":
      return <PrincipleBlock {...block} />;
    case "takeaway":
      return <TakeawayBlock {...block} />;
    case "scopeNote":
      return <ScopeNoteBlock {...block} />;
    default:
      return null;
  }
}

export default function InteractiveModule({ module }) {
  if (!module) return null;
  const LessonComponent = module.component;
  if (LessonComponent) return <LessonComponent />;

  return (
    <article className="interactive-module">
      <header className="im-header">
        <h2>{module.title}</h2>
        {module.dek && <p className="im-dek">{module.dek}</p>}
      </header>

      {module.blocks.map((block, index) => (
        <Block key={block.id ?? index} block={block} />
      ))}

      <SourcesBlock sources={module.sources} />
    </article>
  );
}
