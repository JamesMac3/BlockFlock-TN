import { useEffect, useId, useState } from 'react';
import './InversionExperience.css';

const CHAPTERS = [
  { label: 'The inversion', title: 'The record comes before the reason.', description: 'An ordinary drive. A nearby incident. A search that connects records collected earlier.' },
  { label: 'Preservation', title: 'A moment becomes a searchable past.', description: 'The camera has not changed. Change the retention window to see what a later search can retrieve.' },
  { label: 'Aggregation', title: 'Separate sightings start to suggest a routine.', description: 'Add more days of observations. The records remain plate, place, and time. What someone can infer changes.' },
];
const EVENTS = [
  ['7:42 PM', 'An ordinary drive', 'ABC-123 approaches Cedar Road. The driver is not under investigation. Follow the car past two cameras.'],
  ['7:42–7:44 PM', 'Two cameras keep the journey', 'Cedar Road records ABC-123 at 7:42. Market Street records it at 7:44. Both sightings are saved automatically, before investigators have a reason to look at this vehicle.'],
  ['8:10 PM', 'A nearby break-in is reported', 'A business near Cedar Road reports a break-in around 7:43. Investigators want to find vehicles nearby at that time: someone may have witnessed it, or may warrant further investigation.'],
  ['8:12 PM', 'Earlier sightings become a lead', 'Investigators search nearby records for the reported time. ABC-123 appears at Cedar Road; a plate search connects its Market Street sighting. The driver could be a witness or a possible suspect. Proximity alone proves neither.'],
];
const PLACES = [
  { name: 'Cedar Road', x: 135, y: 220 },
  { name: 'Market Street', x: 440, y: 102 },
  { name: 'Riverside', x: 470, y: 267 },
];
const RECORDS = Array.from({ length: 28 }, (_, i) => ({ day: i + 1, place: i % 7 === 6 ? 2 : i % 2, time: i % 7 === 6 ? '10:06 AM' : i % 2 ? '8:03 AM' : '7:42 PM' }));

// Fictional observations support each example; thresholds are teaching choices,
// not confidence scores or claims about a deployed analysis system.
const HISTORY = Array.from({ length: 28 }, (_, i) => {
  const day = i + 1;
  const weekday = i % 7 < 5;
  const entries = [{ kind: 'start', place: 0, time: '7:20 AM', location: 'Cedar / Oak Lane' }];
  if (weekday) entries.push(
    { kind: 'coffee', place: 1, time: '7:35 AM', location: 'Market / Bean House' },
    { kind: 'work', place: 1, time: '8:03 AM', location: 'Market / Office Square' },
  );
  if (i % 7 === 4) entries.push({ kind: 'bar', place: 1, time: '5:45 PM', location: 'Market / Lantern Bar' });
  if (i % 7 === 6) entries.push({ kind: 'church', place: 2, time: '10:06 AM', location: 'Riverside / Grace Church' });
  if ([9, 16, 23].includes(day)) entries.push({ kind: 'hospital', place: 2, time: '2:15 PM', location: 'Riverside / Hospital' });
  if (weekday) entries.push({ kind: 'return', place: 0, time: '7:10 PM', location: 'Cedar / Oak Lane' });
  return entries.map(entry => ({ ...entry, day, id: `${day}-${entry.kind}` }));
}).flat();
const INFERENCE_GROUPS = [
  { title: 'Always starts here?', area: 'Cedar Road', ideas: [
    { kind: 'start', minimum: 3, text: 'First recorded near Oak Lane around 7:20 AM. A regular starting area?' },
    { kind: 'start', minimum: 10, text: 'Repeated morning departures could suggest a home near Oak Lane.' },
    { kind: 'return', minimum: 15, text: 'Morning starts and evening returns could narrow a possible home area. An address would need other evidence.' },
  ] },
  { title: 'Daily routine?', area: 'Market Street', ideas: [
    { kind: 'coffee', minimum: 4, text: '7:35 AM near Bean House: usually stops for coffee?' },
    { kind: 'work', minimum: 8, text: '8:03 AM near Office Square on weekdays: arrives at work here?' },
    { kind: 'bar', minimum: 3, text: '5:45 PM near Lantern Bar on Fridays: a regular after-work stop?' },
  ] },
  { title: 'Weekly routine?', area: 'Riverside', ideas: [
    { kind: 'church', minimum: 2, text: '10:06 AM near Grace Church on Sundays: attends services here?' },
    { kind: 'hospital', minimum: 3, sensitive: true, text: '2:15 PM near the hospital on three Tuesdays: a recurring medical visit, visiting someone, or work?' },
    { kind: 'church', minimum: 4, sensitive: true, text: 'Four Sundays at the same time could suggest a religious routine. Location alone does not establish belief.' },
  ] },
];
function InferenceIllustrations() {
  const cards = [
    { title: 'Place + time', description: 'Where and when a movement was recorded.', icon: <><path d="M21 10c-8 0-13 6-13 13 0 9 13 22 13 22s13-13 13-22c0-7-5-13-13-13Z"/><circle cx="21" cy="23" r="4"/><circle cx="49" cy="38" r="13"/><path d="M49 30v8l6 4"/></> },
    { title: 'Movement patterns', description: 'Repeated routes, visit frequency, and daily rhythms.', icon: <><path d="m9 46 15-25 15 19 16-27"/>{[[9,46],[24,21],[39,40],[55,13]].map(([x,y])=><circle key={x} cx={x} cy={y} r="4"/>)}</> },
    { title: 'Relationships + links', description: 'Connections across sightings, places, and other records.', icon: <><path d="m14 30 36-16M14 30l30 22"/><circle cx="14" cy="30" r="8"/><circle cx="50" cy="14" r="7"/><circle cx="44" cy="52" r="7"/></> },
  ];
  return <div className="ix-inference-illustrations">{cards.map(card=><div key={card.title}><svg viewBox="0 0 64 64" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">{card.icon}</svg><h5>{card.title}</h5><p>{card.description}</p></div>)}</div>;
}

function InferenceCards({ records }) {
  return <div className="ix-inference-panel">
    <div className="ix-patterns">{INFERENCE_GROUPS.map(group => {
      const ideas = group.ideas.filter(idea => records.filter(r => r.kind === idea.kind).length >= idea.minimum);
      return <section key={group.title} className={ideas.length ? 'ix-pattern-visible' : ''}>
        <span>{group.area}</span><h4>{group.title}</h4>
        {ideas.length ? <ul>{ideas.map(idea => <li key={`${idea.kind}-${idea.minimum}`} className={idea.sensitive ? 'ix-sensitive-inference' : undefined}>
          {idea.sensitive && <strong className="ix-sensitive-label">May contain sensitive information</strong>}<p>{idea.text}</p><small>{records.filter(r => r.kind === idea.kind).length} relevant sightings</small>
        </li>)}</ul> : <p className="ix-inference-empty">Not enough repeated sightings yet.</p>}
      </section>;
    })}</div>
    <p className="ix-inference-footnote">Examples assume nearby places have been identified from a map. A camera records a passing vehicle—not entry into a building, a purchase, the driver’s identity, or the purpose of a visit. Reveal thresholds illustrate accumulation, not statistical certainty.</p>
  </div>;
}

function Scene({ chapter, phase, records }) {
  const id = useId().replace(/:/g, '');
  const captured = chapter !== 0 || phase > 0;
  const searching = chapter === 0 && phase === 3;
  const points = chapter === 0 ? (captured ? [{ day: 1, place: 0 }, { day: 2, place: 1 }] : []) : records;
  return <svg className="ix-scene" viewBox="0 0 640 360" role="img" aria-label={`Fictional street diagram. ${points.length} retained observations. ${chapter === 2 ? 'Dashed links represent possible patterns, not proven journeys.' : ''}`}>
    <defs><pattern id={`${id}-grid`} width="32" height="32" patternUnits="userSpaceOnUse"><path d="M32 0H0V32" fill="none" stroke="currentColor" strokeWidth=".5" /></pattern></defs>
    <rect width="640" height="360" fill={`url(#${id}-grid)`} className="ix-grid" />
    <path d="M325 -20C270 65 355 113 320 190S290 285 360 390" className="ix-river" />
    <g className="ix-blocks"><rect x="60" y="70" width="125" height="80" rx="8"/><rect x="75" y="266" width="130" height="58" rx="8"/><rect x="382" y="150" width="93" height="58" rx="8"/><rect x="505" y="65" width="76" height="120" rx="8"/><rect x="380" y="300" width="80" height="44" rx="8"/></g>
    <path d="M-20 220H260L425 102H660M135 -20V380M-10 40H245L470 267H660M470 -20V380" className="ix-roads" />
    <path d="M-20 220H260L425 102H660M135 -20V380M-10 40H245L470 267H660M470 -20V380" className="ix-road-lines" />
    {chapter === 2 && PLACES.every((_, index) => records.filter(r => r.place === index).length > 1) && <path d="M135 220Q250 50 440 102L470 267Q270 315 135 220" className="ix-association" />}
    {PLACES.map((p, index) => <g key={p.name}>
      <circle cx={p.x} cy={p.y} r="20" className="ix-camera-zone" />
      <path d={`M${p.x-8} ${p.y-6}h12v10h-12z m12 2 6-3v12l-6-3`} className="ix-camera" />
      <text x={p.x} y={p.y+43} textAnchor="middle" className="ix-map-label">{p.name}</text>
      {points.filter(r => r.place === index).slice(-18).map((r, i) => <circle key={r.id ?? r.day} cx={p.x - 35 + (i % 6) * 13} cy={p.y - 33 - Math.floor(i / 6) * 13} r="4" className="ix-observation" style={{ animationDelay: `${chapter === 0 && phase === 1 ? (index === 0 ? 300 : 1800) : i * 45}ms` }} />)}
    </g>)}
    {chapter === 0 && <g className={`ix-vehicle ${phase === 1 ? "ix-vehicle-arriving" : ""}`} style={{ transform: phase === 0 ? "translate(60px, 220px)" : "translate(570px, 102px)" }}><rect x="-17" y="-10" width="34" height="20" rx="6"/><path d="M-6 -8v16M9 -8v16"/><rect x="-12" y="-14" width="8" height="4"/><rect x="-12" y="10" width="8" height="4"/></g>}
    {chapter === 0 && phase >= 2 && <g className="ix-incident">
      <path d="M218 188L218 166" stroke="#efb36f" strokeWidth="2" strokeDasharray="4 4"/>
      <path d="M218 118L240 158H196Z" fill="#392b21" stroke="#efb36f" strokeWidth="2"/>
      <text x="218" y="150" textAnchor="middle" fill="#efb36f" fontSize="26" fontWeight="700">!</text>
      <text x="218" y="88" textAnchor="middle" className="ix-map-label">Break-in reported</text>
      <text x="218" y="109" textAnchor="middle" className="ix-map-label">Around 7:43 PM</text>
    </g>}
    {searching && <g>
      <path d="M135 220L440 102" className="ix-linked-sightings"/>
      {[0,1].map(i=><circle key={i} cx={PLACES[i].x} cy={PLACES[i].y} r="28" className="ix-linked-camera"/>)}
      <text x="320" y="323" textAnchor="middle" className="ix-map-label">Same plate · two earlier sightings</text>
    </g>}

  </svg>;
}


const TARGETED_STEPS = [
  ['No investigative collection yet', 'A business may hold its own footage. Investigators have not obtained it for this vehicle.'],
  ['Still held at the source', 'A local recording is not the same as a history already collected into the investigators’ searchable system.'],
  ['Reason → request access', 'Investigators identify relevant footage and seek access through the applicable process.'],
  ['Acquire → examine', 'They examine the material they obtain, if it still exists and is available.'],
];
const PERSISTENT_STEPS = [
  ['Collection is already operating', 'The system observes passing vehicles before this investigation exists.'],
  ['Two sightings are saved', 'Cedar Road at 7:42. Market Street at 7:44. The records already exist when the break-in is reported.'],
  ['The same reason arises', 'A break-in is reported nearby. Investigators can search records already collected around that time.'],
  ['Search the existing history', 'A nearby sighting becomes a vehicle lead. A plate search links the second camera’s record.'],
];

function OrderComparison({ phase, playing, onStep, onPlay }) {
  return <section className="ix-comparison" aria-label="Synchronized comparison of investigative order">
    <div className="ix-comparison-clock"><span>SAME VEHICLE · SAME MOMENT</span><strong>{EVENTS[phase][0]}</strong><button type="button" onClick={onPlay} aria-pressed={playing}>{playing ? 'Ⅱ Pause comparison' : '▶ Play comparison'}</button></div>
    <div className="ix-compare-columns">
      {[{label:'Targeted acquisition',order:['Reason','Obtain','Examine'],active:phase<2?-1:phase===2?0:2,steps:TARGETED_STEPS}, {label:'Persistent collection',order:['Collect','Retain','Reason','Search'],active:phase,steps:PERSISTENT_STEPS}].map((model,index)=><section key={model.label} className={`ix-model ix-model-${index}`}>
        <span className="ix-model-label">{index === 0 ? 'SEEK RELEVANT RECORDS AFTER A REASON' : 'BUILD SEARCHABLE RECORDS BEFORE A REASON'}</span>
        <h4>{model.label}</h4>
        <ol className="ix-model-order">{model.order.map((label,i)=><li key={label} className={i<=model.active?'ix-active-stage':''}>{label}</li>)}</ol>
        <div className="ix-model-state" aria-live={playing?'off':'polite'}><h5>{model.steps[phase][0]}</h5><p>{model.steps[phase][1]}</p></div>
        <div className="ix-model-store"><strong>{index === 0 ? (phase===3?'Only if obtained':'Not yet obtained') : phase===0?'Capture pending':'Already retained'}</strong></div>
      </section>)}
    </div>
    <div className="ix-comparison-steps">{EVENTS.map((event,i)=><button key={event[1]} type="button" onClick={()=>onStep(i)} aria-pressed={phase===i}><span>0{i+1}</span>{['Drive','Record','Incident','Connect'][i]}</button>)}</div>
    <p className="ix-comparison-note">The difference is when investigators acquire a searchable history—not whether a camera existed. These are simplified models; access and authorization requirements vary.</p>
  </section>;
}

export default function InversionExperience() {
  const [chapter, setChapter] = useState(0);
  const [phase, setPhase] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [retention, setRetention] = useState(30);
  const [days, setDays] = useState(1);
  useEffect(() => {
    if (!playing) return;
    const timer = window.setTimeout(() => {
      if (phase === EVENTS.length - 1) setPlaying(false);
      else setPhase(current => current + 1);
    }, 3400);
    return () => window.clearTimeout(timer);
  }, [playing, phase]);
  useEffect(() => {
    const pause = () => { if (document.hidden) setPlaying(false); };
    document.addEventListener('visibilitychange', pause);
    return () => document.removeEventListener('visibilitychange', pause);
  }, []);
  const retained = RECORDS.filter(r => 29 - r.day <= retention);
  const shown = chapter === 1 ? retained : HISTORY.filter(r => r.day <= days);
  const current = CHAPTERS[chapter];
  const changeChapter = (index) => { setPlaying(false); setChapter(index); };
  const step = (value) => { setPlaying(false); setPhase(value); };
  return <article className="ix-lesson">
    <header className="ix-hero">
      <div className="ix-eyebrow">FIELD GUIDE / 01 · THE INVERSION</div>
      <h2>A moment. <br/>A history.<br/><em>A pattern.</em></h2>
      <p>How an ordinary sighting becomes information that can be searched—and interpreted—later.</p>
      
    </header>
    <nav className="ix-chapters" aria-label="Parts of the demonstration">
      {CHAPTERS.map((item, index) => <button key={item.label} type="button" aria-pressed={chapter === index} onClick={() => changeChapter(index)}><span>0{index+1}</span>{item.label}<span className="ix-chapter-arrow" aria-hidden="true">↗</span></button>)}
    </nav>
    <section className="ix-lab" aria-label={current.label}>
      <div className="ix-section-heading"><span className="ix-eyebrow">0{chapter+1} / 03</span><h3>{current.title}</h3><p>{current.description}</p></div>
      <div className="ix-workbench">
        <div className="ix-visual">
          <div className="ix-scene-top"><span>THE SAME VEHICLE</span><strong>ABC-123</strong><span>{chapter === 0 ? EVENTS[phase][0] : chapter === 1 ? 'SEARCH ON DAY 29' : `${days} ${days === 1 ? 'DAY' : 'DAYS'} OF OBSERVATIONS`}</span></div>
          {chapter === 0 && <div className="ix-scene-controls">
            <div className="ix-playback"><button type="button" onClick={()=>{ if (!playing && phase === EVENTS.length - 1) setPhase(0); setPlaying(!playing); }} aria-pressed={playing}>{playing ? 'Ⅱ Pause' : '▶ Play sequence'}</button><span>{phase+1} / 4</span></div>
            <div className="ix-step-dots" aria-label="Choose a moment">{EVENTS.map((e,i)=><button key={e[1]} type="button" onClick={()=>step(i)} aria-label={`Step ${i+1}: ${e[1]}`} aria-pressed={phase===i}>{i+1}</button>)}</div>
          </div>}
          <Scene chapter={chapter} phase={phase} records={shown}/>
          <div className="ix-legend"><span><i/> Recorded sighting</span><span>{chapter === 2 ? "Up to 18 recent dots per area · see record count" : "Illustrative street layout"}</span></div>
          {chapter === 0 && <p className="ix-story-key">{phase === 3 ? 'Dashed line = linked records, not proof of the route or involvement.' : phase === 2 ? 'The incident is reported later. The camera records already exist.' : 'Watch Cedar Road first, then Market Street. Each camera stores a separate sighting.'}</p>}
          {chapter === 1 && <div className="ix-retention"><div><span>Records remaining at day 29</span><strong>{retained.length} <small>/ 28</small></strong></div><div className="ix-days" aria-hidden="true">{RECORDS.map(r=><span key={r.day} className={29-r.day <= retention ? 'ix-kept' : ''}/>)}</div><div className="ix-range-labels"><span>Day 1</span><span>Day 28</span></div></div>}
          {chapter === 2 && <div className="ix-history-mobile"><div className="ix-inspector-label ix-sticky-history-title">BUILD THE HISTORY</div><label className="ix-control" htmlFor="ix-history-mobile">Combine <strong>{days} {days===1?'day':'days'}</strong></label><input id="ix-history-mobile" type="range" min="1" max="28" value={days} onChange={e=>setDays(Number(e.target.value))}/><div className="ix-range-labels"><span>One moment</span><span>Four weeks</span></div></div>}
          {chapter === 2 && <div className="ix-inferences-desktop"><InferenceCards records={shown}/></div>}
        </div>
        <aside className="ix-inspector" aria-label="What the records show">
          {chapter === 0 ? <>
            <div className="ix-inspector-label">THE MOMENT THAT MATTERS</div>
            <div className="ix-event" key={phase} aria-live={playing ? 'off' : 'polite'}><span className="ix-time">{EVENTS[phase][0]}</span><h4>{EVENTS[phase][1]}</h4><p>{EVENTS[phase][2]}</p></div>
            <div aria-hidden={phase === 0} className={`ix-record ${phase > 0 ? 'ix-record-visible' : ''} ${phase === 1 ? 'ix-record-capture' : ''}`}><span>TWO STORED SIGHTINGS</span><strong>ABC-123</strong><dl><div><dt>Cedar Road</dt><dd>7:42 PM</dd></div><div><dt>Market Street</dt><dd>7:44 PM</dd></div><div><dt>Reason at capture</dt><dd>motion detected.</dd></div></dl></div>
          </> : <>
            <div className={`ix-inspector-label ${chapter === 2 ? 'ix-history-panel-title' : ''}`}>{chapter === 1 ? 'CHANGE THE RETENTION WINDOW' : 'BUILD THE HISTORY'}</div>
            {chapter === 1 ? <><label className="ix-control" htmlFor="ix-retention">Keep observations for <strong>{retention === 0 ? 'no days' : `${retention} days`}</strong></label><input id="ix-retention" type="range" min="0" max="30" value={retention} onChange={e=>setRetention(Number(e.target.value))}/><div className="ix-range-labels"><span>No preservation</span><span>30 days</span></div><p className="ix-control-note">At day 29, an observation survives only if its age fits inside this window.</p></> : <><div className="ix-history-desktop"><label className="ix-control" htmlFor="ix-history">Combine <strong>{days} {days===1?'day':'days'}</strong></label><input id="ix-history" type="range" min="1" max="28" value={days} onChange={e=>setDays(Number(e.target.value))}/><div className="ix-range-labels"><span>One moment</span><span>Four weeks</span></div></div></>}
            <div className="ix-ledger-title"><span>RETRIEVABLE RECORDS</span><strong aria-live="polite">{shown.length}</strong></div>
            {chapter === 1 && <div className="ix-ledger">{shown.length ? shown.slice(-5).map(r=><div key={r.id ?? r.day}><span>DAY {String(r.day).padStart(2,'0')}</span><span>{r.location ?? PLACES[r.place].name}</span><time>{r.time}</time></div>):<p className="ix-empty">No observations remain in this example.</p>}</div>}
            {chapter === 1 && shown.length>5 && <p className="ix-table-note">Showing the latest 5 of {shown.length} records.</p>}
            {chapter === 2 && <div className="ix-inferences-mobile"><InferenceCards records={shown}/></div>}
            <div className="ix-fact">{chapter === 2 && <InferenceIllustrations/>}<span>{chapter === 1 ? 'WHAT CHANGED?' : 'OBSERVATION = MACHINE-BASED INFERENCE'}</span><p>{chapter === 1 ? 'The observation was fleeting. Keeping it made it available to a future search.' : 'Machines can combine many individual captures of movement, compare locations and times, and detect recurring patterns. Linking those patterns with maps and other records can produce inferences about a home area, workplace, daily schedule, relationships, or sensitive visits. These personal details are inferred from the combined history rather than directly recorded in any single capture.'}</p></div>
          </>}
        </aside>
      </div>
      {chapter === 0 && <OrderComparison phase={phase} playing={playing} onStep={step} onPlay={()=>{if (!playing && phase===EVENTS.length-1) setPhase(0);setPlaying(!playing);}}/>}
      <div className="ix-takeaway"><span>THE DISTINCTION</span><p>{chapter===0 ? 'You do not need to be under investigation when a record is created. You may become relevant while it is still retained.' : chapter===1 ? 'Retention determines how much of the past this store can return. Copies and separately preserved records are a different question.' : 'The records have not gained new fields. Putting them together creates new possibilities for interpretation.'}</p></div>
      <div className="ix-footer"><button type="button" disabled={chapter===0} onClick={()=>changeChapter(chapter-1)}>← Previous idea</button><span>0{chapter+1} / 03</span><button type="button" onClick={()=>changeChapter((chapter+1)%3)}>{chapter===2?'Return to the beginning':'Next idea →'}</button></div>
    </section>
    <section className="ix-reading"><h3>Three questions to take into an investigation.</h3><div><p><b>01 · Collection</b>What is recorded before anyone has a reason to look?</p><p><b>02 · Retention</b>How long can it be retrieved, and where might copies remain?</p><p><b>03 · Combination</b>Who can combine these records with other information?</p></div><p className="ix-source-note">This demonstration explains a structural capability, not a verified configuration of a particular deployment. The 30-day maximum is an example setting. Local retention, sharing, access, and technical capabilities need to be established from the applicable documents.</p></section>
  </article>;
}
