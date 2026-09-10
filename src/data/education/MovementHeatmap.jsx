import { useEffect, useState } from 'react';

// Deterministic fictional observations; the tested movement is held out of history.
const HISTORY = Array.from({ length: 28 }, (_, d) => Array.from({ length: 24 }, (_, i) => ({
  day: d + 1, x: 2 + ((i * 7 + d * 3) % 15),
  y: i < 17 ? 5 + (d + i) % 3 : 2 + (d * 3 + i) % 9,
}))).flat();
const INDIVIDUAL = HISTORY.filter((_, i) => i % 4 === 0).map(p => ({ ...p, y: 6 + p.day % 2 }));
const POPULATION_IDEAS = [
  { day: 8, risk: true, title: 'Is a protest gathering?', icon: '!', evidence: 'Movement converges near a civic square and coincides with a publicly announced demonstration.', inference: 'A system could flag a potential protest and associate nearby tracks with it. Misuse could turn lawful assembly into a reason for monitoring, including people merely passing through.' },
  { day: 16, risk: true, title: 'Who might be organizing?', icon: '!', evidence: 'Some linked tracks repeatedly arrive before gatherings and meet with overlapping groups.', inference: 'A model could label people as possible organizers or connectors. Used for retaliation, these labels could direct scrutiny toward activists, colleagues, and their wider networks.' },
  { day: 21, risk: true, title: 'Which visits could expose someone?', icon: '!', evidence: 'Repeated movements cluster near a clinic, shelter, legal-aid office, or place of worship.', inference: 'Sensitive associations could be used for intimidation, discrimination, or coercion. Even a mistaken attribution could expose someone to harm.' },
  { day: 26, risk: true, title: 'Can a community be singled out?', icon: '!', evidence: 'Movement clusters are joined with inferred political or religious affiliations and neighborhood statistics.', inference: 'An operator could prioritize an entire community for surveillance based on inferred identity or beliefs rather than specific conduct. Population profiling can scale that targeting.' },
  { day: 3, title: 'Where does the population move?', icon: '↗', evidence: 'Repeated movement through the market corridor.', inference: 'A major commuting or shopping route? Counts can reveal busy periods and common destinations.' },
  { day: 6, title: 'Most popular eating spots?', icon: '◷', evidence: 'Lunchtime activity clusters around mapped restaurants.', inference: 'Market Café could rank above Riverside Grill for observed lunchtime traffic. Passing traffic and actual customers are different measurements.' },
  { day: 10, title: 'Who associates with whom?', icon: '⋈', evidence: 'Linked tracks repeatedly appear together across places and times.', inference: 'A model could suggest recurring social or work groups. Shared commutes can also produce these patterns.' },
  { day: 14, title: 'What are the demographics?', icon: '▥', evidence: 'Movement areas are joined to census summaries and public neighborhood data.', inference: 'An area may have more students, older residents, or higher-income households. Area-level statistics do not identify the demographics of each observed person.' },
  { day: 18, title: 'What might people believe?', icon: '◇', evidence: 'Recurring gatherings are linked to places of worship or issue-based events.', inference: 'A system could assign probable religious or issue affiliations to groups. Attendance can reflect employment, observation, or other reasons as well as belief.' },
  { day: 23, title: 'Mostly liberal or conservative?', icon: '⚖', evidence: 'Movement clusters are combined with mapped political events and precinct election results.', inference: 'An area could be labeled “mostly liberal” or “mostly conservative.” That is a group-level inference, not a measurement of any individual’s vote or beliefs.' },
  { day: 28, title: 'A population profile at scale', icon: '◎', evidence: 'Routes, gatherings, venue rankings, and outside records are compared together.', inference: 'Models can segment communities by predicted interests, affiliations, schedules, and associations—turning many ordinary observations into profiles that can influence who receives scrutiny.' },
];
function PopulationInferences({ days, mode }) {
  const visible = POPULATION_IDEAS.filter(item => item.day <= days).sort((a, b) => a.day - b.day);
  return <section className="br-population-inferences"><div className="br-eyebrow">FROM MOVEMENTS TO POPULATION PROFILES</div><h3>What can be learned about the populace?</h3><p className="br-muted">Machine analysis can count movements, compare recurring patterns, and join outside records to make assumptions about whole communities. The examples below unfold with the history slider; venue, demographic, and political examples require the additional sources named on each card.</p>{mode === 'individual' && <p className="br-muted">The map shows one track. These cards explain population-scale analysis, which requires many tracks and additional context.</p>}
    <div className="br-population-grid" role="region" aria-label="Population inference cards" tabIndex={0}>{visible.map(item => <article key={item.title} className={item.risk ? "br-population-risk" : undefined}><span className="br-pop-icon" aria-hidden="true">{item.icon}</span><h4>{item.title}</h4><small>INPUT / PATTERN</small><p>{item.evidence}</p><small>{item.risk ? "POTENTIAL MISUSE" : "MACHINE INFERENCE"}</small><p>{item.inference}</p></article>)}</div>{!visible.length && <p className="br-muted">Add more days to reveal the first population patterns.</p>}
    <div className="br-explanation"><strong>More observations. More connections. More personal conclusions.</strong><p>Automated systems can repeat this analysis across thousands of tracks. A density map measures observed activity; beliefs and affiliations are inferred by joining that activity with context. More data can make a profile more detailed without making every conclusion correct.</p></div>
  </section>;
}
export default function MovementHeatmap() {
  const [days, setDays] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [mode, setMode] = useState('population');
  const [route, setRoute] = useState('unusual');
  const [context, setContext] = useState(false);
  useEffect(() => {
    if (!playing) return;
    const timer = window.setTimeout(() => { if (days >= 28) setPlaying(false); else setDays(d => d + 1); }, 350);
    return () => window.clearTimeout(timer);
  }, [days, playing]);
  useEffect(() => {
    const pause = () => { if (document.hidden) setPlaying(false); };
    document.addEventListener('visibilitychange', pause);
    return () => document.removeEventListener('visibilitychange', pause);
  }, []);
  const records = (mode === 'population' ? HISTORY : INDIVIDUAL).filter(p => p.day <= days);
  const cells = Array.from({ length: 240 }, (_, i) => ({ x: i % 20, y: Math.floor(i / 20), count: 0 }));
  records.forEach(p => { cells[p.y * 20 + p.x].count++; });
  const max = Math.max(1, ...cells.map(c => c.count));
  const target = route === 'unusual' ? { x: 18, y: 2 } : { x: 9, y: 6 };
  const nearby = records.filter(p => Math.abs(p.x - target.x) <= 1 && Math.abs(p.y - target.y) <= 1).length;
  const ready = days >= 7;
  const flagged = ready && nearby / records.length < .02;
  return <>
    <div className="br-heat-workbench"><div className="br-heat-main">
    <div className="br-controls br-journey-playback"><button onClick={() => { if (!playing && days === 28) setDays(1); setPlaying(!playing); }}>{playing ? 'Ⅱ Pause' : '▶ Build the heatmap'}</button><span>{records.length} observations · {days} days</span></div>
    <div className="br-steps"><button aria-pressed={mode === 'population'} onClick={() => setMode('population')}>Population movement</button><button aria-pressed={mode === 'individual'} onClick={() => setMode('individual')}>Individual movement</button></div>
    <div className="br-history-desktop"><label className="br-muted">History collected: {days} days<input aria-label="Heatmap history days" type="range" min="1" max="28" value={days} onChange={e => { setPlaying(false); setDays(+e.target.value); }}/></label></div>
    <div className="br-heatmap"><div className="br-chart-heading"><span>{mode === 'population' ? 'MANY OBSERVED MOVEMENTS' : 'ONE LINKED TRACK · DEMO-01'}</span><strong>{ready ? 'Baseline established' : 'Building the baseline'}</strong></div>
      <svg viewBox="0 0 600 360" role="img" aria-label={`${mode} movement density map. ${records.length} observations. ${ready ? flagged ? 'New movement flagged in a low-density area.' : 'New movement in a familiar area.' : 'Collecting history before evaluating the new movement.'}`}>
        <rect width="600" height="360" fill="#0b1420"/>
        <path d="M0 195H600M285 0V360M0 255H600M555 0V360" stroke="#304453" strokeWidth="16"/>
        {cells.map(c => <rect key={`${c.x}-${c.y}`} x={c.x * 30 + 1} y={c.y * 30 + 1} width="28" height="28" rx="6" fill={c.count ? `hsl(${190 - c.count / max * 160} 85% 55%)` : '#17303d'} opacity={c.count ? .25 + .7 * Math.min(1, c.count / 5) : .12} className="br-heat-cell"/>)}
        <g className="br-heat-labels"><text x="20" y="165">Residential area</text><text x="325" y="165">Market / transit</text><text x="420" y="35">Hospital</text></g>
        {ready && <g key={route} className="br-new-movement"><path d={route === 'unusual' ? 'M285 195H555V75' : 'M75 195H285'} fill="none" stroke="#fff" strokeWidth="3" strokeDasharray="7 5"/><circle cx={target.x * 30 + 15} cy={target.y * 30 + 15} r="13" fill={flagged ? '#f4a45a' : '#86e0cd'} stroke="#fff" strokeWidth="2"/><text x={target.x * 30 + 15} y={target.y * 30 + 21} textAnchor="middle" fontSize="18" fontWeight="700" fill="#0b1420">{flagged ? '!' : '✓'}</text></g>}
      </svg>
      <div className="br-heat-legend"><span>Fewer observations</span><i/><span>More observations</span></div><p className="br-muted">Color = relative movement density, not danger. White dashed line = new movement tested against earlier observations.</p>
    </div>
    <div className="br-history-sticky"><div className="br-eyebrow">BUILD THE HISTORY</div><label className="br-muted">History collected: {days} days<input aria-label="Mobile heatmap history days" type="range" min="1" max="28" value={days} onChange={e => { setPlaying(false); setDays(+e.target.value); }}/></label></div>
    <div className="br-steps"><button aria-pressed={route === 'usual'} onClick={() => { setRoute('usual'); setContext(false); }}>Test familiar route</button><button aria-pressed={route === 'unusual'} onClick={() => { setRoute('unusual'); setContext(false); }}>Test different route</button></div>
    <div className={`br-verdict ${flagged ? 'br-warning' : ''}`} aria-live={playing ? 'off' : 'polite'}><span>{!ready ? '01 / COLLECT → BUILD' : flagged ? '03 / ANOMALOUS MOVEMENT FLAG' : '02 / COMPARE WITH BASELINE'}</span><h3>{!ready ? 'Repeated movements draw the pattern.' : flagged ? 'A movement outside the familiar pattern.' : 'This movement falls within the familiar pattern.'}</h3><p>{!ready ? 'As observations arrive, frequently visited areas become warmer. At seven days, this demonstration evaluates a separate new movement.' : `${nearby} earlier observations near the new endpoint, out of ${records.length}. ${mode === 'individual' ? 'The comparison is with this linked track’s history.' : 'The comparison is with the observed population’s history.'}`}</p></div>
    <button onClick={() => setContext(!context)}>{context ? 'Hide context' : 'What could explain a different route?'}</button>{context && <div className="br-explanation"><strong>A hospital visit changed the journey.</strong><p>The detector identifies a difference. The movement record does not explain why it happened. A flag can draw scrutiny without establishing wrongdoing.</p></div>}
    <p className="br-muted">This example flags an endpoint when fewer than 2% of historical observations fall within its neighboring cells, after seven days. Those are teaching settings.</p>
    </div>
    <PopulationInferences days={days} mode={mode}/>
    </div>
    <details className="br-sources"><summary>Research behind movement density maps</summary><p>Parzych and colleagues (2013) describe generating people-density maps from surveillance video to analyze movement in sales and office spaces. This lesson extends the density-map concept with a fictional spatial anomaly rule; it does not reproduce the paper’s algorithm or establish a particular deployment.</p><a href="https://www.researchgate.net/publication/259013555_Automatic_people_density_maps_generation_with_the_use_of_movement_detection_analysis" target="_blank" rel="noreferrer">Automatic people density maps generation with the use of movement detection analysis</a></details>
  </>;
}
