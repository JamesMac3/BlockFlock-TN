import MovementHeatmap from './MovementHeatmap';
import CollectionComparison from './CollectionComparison';
import { useEffect, useState } from 'react';
import './BeyondResultExperience.css';

const CHAPTERS = ['Follow the information', 'Learn a baseline', 'After access ends'];
const FLOW = [
  ['Capture', 'A passing vehicle becomes an observation.', 'The example camera records an image, time, and location. The person operating a search screen sees only the result relevant to their query.'],
  ['Extract', 'The image becomes searchable fields.', 'Processing extracts a plate and vehicle attributes. These are separate representations of the observation; an extracted value can also be wrong.'],
  ['Combine', 'Outside context changes the questions.', 'Public maps and a second camera add context. Registration links the plate to a fictional owner; open-source records add possible contact and address matches. These links do not establish who drove or where they currently live.'],
  ['Return', 'One result is a window into a larger process.', 'A filtered result does not inventory everything processed. Which fields exist, who can access them, and how long they remain require separate answers.'],
];
const LAYERS = [
  { name: 'Customer search result', end: 30, detail: 'Available through the customer interface for 30 days in this example.', risk: 'A search result can reveal a plate, time, and place.' },
  { name: 'Original footage', end: 30, detail: 'Deleted at day 30 in this example. Customer access and deletion are shown as separate events.', risk: 'Images can expose vehicles and surrounding context.' },
  { name: 'Exported case copy', end: 90, detail: 'A separate recipient keeps an export for 90 days in this example.', risk: 'An identifiable copy can expose a person’s recorded movements.' },
  { name: 'Linked location records', end: 60, detail: 'A hypothetical separate store keeps linked records for 60 days.', risk: 'Repeated places and times can suggest a home, workplace, or sensitive visits—even when an inference is wrong.' },
  { name: 'Population baseline', end: 120, detail: 'An illustrative hourly count remains for 120 days. It contains no individual journey list.', risk: 'Aggregate traffic patterns may reveal when an area is busy or quiet; they do not by themselves identify a particular driver.' },
  { name: 'Training contribution', end: null, detail: 'No expiry is specified in this teaching scenario. Model parameters are not a browsable archive of the original trips.', risk: 'Exposure of a model is different from exposure of a movement database. Recovering training details depends on the model and attack; it is not automatic.' },
];

function FollowInformation() {
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!playing) return;
    const timer = window.setTimeout(() => { if (step === 3) setPlaying(false); else setStep(s => s + 1); }, 4200);
    return () => window.clearTimeout(timer);
  }, [playing, step]);
  useEffect(() => {
    const pause = () => { if (document.hidden) setPlaying(false); };
    document.addEventListener('visibilitychange', pause);
    return () => document.removeEventListener('visibilitychange', pause);
  }, []);
  return <>
    <div className="br-controls br-journey-playback"><button onClick={() => { if (!playing && step === 3) setStep(0); setPlaying(!playing); }}>{playing ? 'Ⅱ Pause' : '▶ Play sequence'}</button><span>0{step + 1} / 04</span></div>
    <div className="br-steps" aria-label="Data journey stages">{FLOW.map(([label], i) => <button key={label} aria-pressed={step === i} onClick={() => { setPlaying(false); setStep(i); }}>{i + 1}. {label}</button>)}</div>
    <div className="br-split">
      <section className="br-processing"><div className="br-eyebrow">THE ILLUSTRATIVE PROCESS BEHIND IT</div>
        <div className="br-pipeline">{FLOW.map(([label], i) => <div key={label} className={step >= i ? 'br-node br-on' : 'br-node'}><span>{['▣', '≡', '⋈', '⌕'][i]}</span>{label}</div>)}</div>
        <div className="br-fields" key={step}><span className="br-chip">Image + time + camera location</span>{step >= 1 && <><span className="br-chip">Plate: ABC-123</span><span className="br-chip">Color: blue</span><span className="br-chip">Vehicle class</span></>}{step >= 2 && <span className="br-chip br-context">Public map → clinic nearby?</span>}{step >= 2 && <><span className="br-chip br-context">Other camera → 7:44 PM sighting</span><span className="br-chip br-context">Registration → John Smith</span>{step === 3 ? <><span className="br-chip br-context">Possible email → johnsmith@example.com</span><span className="br-chip br-context">Possible phone → (202) 555-0145</span><span className="br-chip br-context">Listed address → 123 Blockstreet Ave.</span></> : <span className="br-chip br-context">Open sources → possible contact / address</span>}</>}</div>
        <div className="br-source-summary"><span className="br-eyebrow">EXAMPLE SOURCES INCLUDED</span><p>Public maps · another camera · registration lookup · open-source records</p><small>This scenario combines these sources automatically.</small></div>
      </section>
      <section className="br-terminal"><div className="br-eyebrow">THE LOCAL SEARCH SCREEN</div><div className="br-query">Search: ABC-123 <span>⌕</span></div>
        <div className={`br-result ${step === 3 ? 'br-revealed' : ''}`}><span>1 MATCHING RESULT</span><strong>ABC-123</strong><p>Blue vehicle · Cedar Road<br/>7:42 PM</p><dl className="br-result-details"><div><dt>Registration owner</dt><dd>John Smith</dd></div><div><dt>Possible email</dt><dd>johnsmith@example.com</dd></div><div><dt>Possible phone</dt><dd>(202) 555-0145</dd></div><div><dt>Listed address</dt><dd>123 Blockstreet Ave.</dd></div></dl></div>
        {step !== 3 && <p className="br-muted">Follow the processing stages to see the result returned here.</p>}
      </section>
    </div>
    <div className="br-caption" aria-live={playing ? 'off' : 'polite'}><h3>{FLOW[step][1]}</h3><p>{FLOW[step][2]}</p></div>
    <div className="br-three"><section><h4>Who collects?</h4><p>The source creates the observation.</p></section><section><h4>Who processes?</h4><p>A service transforms or combines it under the applicable arrangements.</p></section><section><h4>Who receives?</h4><p>A user may receive a result or an independent copy. Those are different forms of access.</p></section></div>
    <CollectionComparison/>
  </>;
}

function Persistence() {
  const [day, setDay] = useState(20);
  const [leaked, setLeaked] = useState(false);
  const [selected, setSelected] = useState(2);
  const layer = LAYERS[selected];
  const remains = layer.end === null || day < layer.end;
  return <>
    <div className="br-controls"><label>Advance the clock: <strong>Day {day}</strong><input aria-label="Lifecycle day" type="range" min="1" max="130" value={day} onChange={e => setDay(+e.target.value)}/></label><button aria-pressed={leaked} onClick={() => setLeaked(!leaked)}>{leaked ? 'Hide exposure scenario' : 'Explore a data leak'}</button></div>
    <p className="br-muted">Explore the exposure risks associated with retaining data. Advance the clock and select each information layer to see what remains and what its exposure could reveal.</p>
    <div className="br-layers">{LAYERS.map((item, i) => { const alive = item.end === null || day < item.end; return <button key={item.name} aria-pressed={selected === i} onClick={() => setSelected(i)} className={`${alive ? '' : 'br-expired'} ${leaked && alive && i > 0 ? 'br-exposed' : ''}`}><span>{item.name}</span><div className="br-track"><i style={{ width: `${item.end === null ? 100 : item.end / 130 * 100}%` }}/></div><small>{item.end === null ? 'Expiry unspecified' : alive ? `Until day ${item.end}` : i === 0 ? 'Access ended' : 'Deleted in this scenario'}</small></button>; })}</div>
    <div className="br-caption" aria-live="polite"><span className="br-eyebrow">{layer.name}</span><h3>{leaked ? remains && selected > 0 ? 'If this remaining layer were exposed…' : 'This scenario has no remaining copy in this layer to expose.' : 'Each layer needs its own answer.'}</h3><p>{leaked && remains && selected > 0 ? layer.risk : layer.detail}</p></div>
    <div className="br-explanation"><strong>A leak does not come with a recall button.</strong><p>If an authorized or unauthorized recipient has already copied information, deleting the source does not retrieve that copy. Stopping new collection reduces future exposure; it does not establish that earlier copies have disappeared.</p></div>
    <div className="br-three"><section><h4>Personal exposure</h4><p>Linked movement histories can support stalking, coercion, or mistaken accusations. A possible inference can cause harm even when wrong.</p></section><section><h4>Community exposure</h4><p>Population patterns can disclose sensitive activity or quiet periods. Aggregate data has different risks from an identifiable trip history.</p></section><section><h4>Ask what remains</h4><p>Which copies, fields, or training uses exist? Who holds them? Which deletion obligations apply, and what verifies deletion?</p></section></div>
  </>;
}

export default function BeyondResultExperience() {
  const [chapter, setChapter] = useState(0);
  return <article className="br-lesson">
    <header className="br-hero"><div className="br-eyebrow">FIELD GUIDE / 02 · BEYOND THE SEARCH RESULT</div><h2>One result.<br/>Many layers.<br/><em>Different lifetimes.</em></h2><p>Follow an observation through processing, pattern detection, and the information that may exist beyond a customer’s screen.</p></header>
    <nav className="br-tabs" aria-label="Beyond the search result chapters">{CHAPTERS.map((label, i) => <button key={label} aria-pressed={chapter === i} onClick={() => setChapter(i)}><span>0{i + 1}</span>{label}<span className="br-tab-arrow" aria-hidden="true">↗</span></button>)}</nav>
    <section className="br-lab" aria-label={CHAPTERS[chapter]} key={chapter}>{chapter === 0 ? <FollowInformation/> : chapter === 1 ? <MovementHeatmap/> : <Persistence/>}</section>
    <footer className="br-footer"><button disabled={chapter === 0} onClick={() => setChapter(chapter - 1)}>← Previous chapter</button><span>{chapter + 1} / 3</span><button onClick={() => setChapter((chapter + 1) % 3)}>{chapter === 2 ? 'Return to beginning' : 'Next chapter →'}</button></footer>
    <details className="br-sources"><summary>Sources and data lifecycle</summary><p>Follow the information from collection and processing to linked records, population patterns, and downstream copies. Each layer has its own uses, access controls, and retention rules.</p><p><a href="https://patents.google.com/patent/US11416545B1/en" target="_blank" rel="noreferrer">US11416545B1</a> describes object-based processing and search. Contracts govern permitted uses, while system configuration governs available connections and features. A retention period for one store does not describe the lifecycle of every downstream copy or derived output.</p></details>
  </article>;
}
