"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import TrafficViewer from "../components/TrafficViewer";
import {
  createProject, cloneScenario, DEFAULT_FLOW, DEFAULT_SPEED, evaluateScenario,
  INTERVENTIONS, isValidProject, MODES, MODE_COLORS, newIntervention, newRoute,
  TrafficProject, TrafficScenario, Vec3, Mode, InterventionKind, Metrics,
} from "../lib/traffic";
import "./traffic.css";

const DEFAULT_MODEL = "/models/kvarter-fokus.glb";
const STORE_PREFIX = "pace-seed-traffic-v1:";
const human = (s: string) => s.replaceAll("_", " ").replace(/\b\w/g, c => c.toUpperCase());
const fmt = (n: number, digits = 1) => Number.isFinite(n) ? n.toFixed(digits) : "–";
const isMotor = (m: Mode) => m === "car" || m === "truck" || m === "bus";
const blankMetrics: Metrics = { generated: 0, completed: 0, active: 0, avgTravelSec: 0, avgDelaySec: 0, avgSpeedKmh: 0, avgQueue: 0, peakQueue: 0, byMode: { car: 0, truck: 0, bus: 0, pedestrian: 0, bicycle: 0, scooter: 0 } };

export default function TrafficPage() {
  const [modelUrl, setModelUrl] = useState(DEFAULT_MODEL);
  const [modelName, setModelName] = useState("Kvarter fokus");
  const [project, setProject] = useState<TrafficProject>(createProject);
  const [loaded, setLoaded] = useState(false);
  const [scenarioTab, setScenarioTab] = useState<"routes" | "interventions" | "scenarios">("routes");
  const [drawMode, setDrawMode] = useState<"route" | "intervention" | null>(null);
  const [draft, setDraft] = useState<Vec3[]>([]);
  const [newMode, setNewMode] = useState<Mode>("car");
  const [routeName, setRouteName] = useState("New corridor");
  const [interventionKind, setInterventionKind] = useState<InterventionKind>("crossing");
  const [running, setRunning] = useState(false);
  const [simSpeed, setSimSpeed] = useState(4);
  const [durationMin, setDurationMin] = useState(10);
  const [resetToken, setResetToken] = useState(0);
  const [liveMetrics, setLiveMetrics] = useState<Metrics>(blankMetrics);
  const [simTime, setSimTime] = useState(0);
  const [compare, setCompare] = useState<{ base: Metrics; current: Metrics } | null>(null);
  const [metersPerSceneUnit, setMetersPerSceneUnit] = useState(1);
  const [calibrated, setCalibrated] = useState(false);
  const [modelError, setModelError] = useState("");
  const fileUrl = useRef<string | null>(null);
  const scenario = project.scenarios.find(s => s.id === project.selectedId) || project.scenarios[0];
  const baseline = project.scenarios[0];
  const storageKey = STORE_PREFIX + modelName;
  const modelInfo = useCallback((meters: number, valid: boolean) => { setMetersPerSceneUnit(meters); setCalibrated(valid); }, []);
  const onMetrics = useCallback((metrics: Metrics, seconds: number) => { setLiveMetrics(metrics); setSimTime(seconds); }, []);
  const onError = useCallback((message: string) => { setModelError(message); }, []);

  useEffect(() => {
    try { const raw = localStorage.getItem(storageKey); if (raw) { const parsed: unknown = JSON.parse(raw); if (isValidProject(parsed)) setProject(parsed); } }
    catch { /* invalid local cache: start with an empty project */ }
    setLoaded(true);
  }, [storageKey]);
  useEffect(() => { if (loaded) { try { localStorage.setItem(storageKey, JSON.stringify(project)); } catch { /* private mode or quota */ } } }, [project, storageKey, loaded]);
  useEffect(() => () => { if (fileUrl.current) URL.revokeObjectURL(fileUrl.current); }, []);

  const updateScenario = useCallback((updater: (s: TrafficScenario) => TrafficScenario) => {
    setProject(p => ({ ...p, scenarios: p.scenarios.map(s => s.id === p.selectedId ? updater(s) : s) }));
    setRunning(false); setCompare(null);
  }, []);
  const addPoint = useCallback((point: Vec3) => {
    if (drawMode === "route") setDraft(p => [...p, point]);
    if (drawMode === "intervention") {
      updateScenario(s => ({ ...s, interventions: [...s.interventions, newIntervention(interventionKind, point)] }));
      setDrawMode(null);
    }
  }, [drawMode, interventionKind, updateScenario]);
  const finishRoute = () => {
    if (draft.length < 2) return;
    const name = routeName.trim() || `${human(newMode)} route`;
    updateScenario(s => ({ ...s, routes: [...s.routes, newRoute(name, newMode, draft)] }));
    setDraft([]); setDrawMode(null); setRouteName(`${human(newMode)} corridor`);
  };
  const cancelDrawing = () => { setDrawMode(null); setDraft([]); };
  const changeRoute = (id: string, changes: { flowPerHour?: number; speedKmh?: number; name?: string }) => {
    updateScenario(s => ({ ...s, routes: s.routes.map(r => r.id === id ? { ...r, ...changes } : r) }));
  };
  const selectScenario = (id: string) => { setProject(p => ({ ...p, selectedId: id })); setRunning(false); setCompare(null); cancelDrawing(); };
  const duplicateScenario = () => {
    const copy = cloneScenario(scenario);
    setProject(p => ({ ...p, scenarios: [...p.scenarios, copy], selectedId: copy.id }));
    setRunning(false); setCompare(null); cancelDrawing();
  };
  const removeScenario = () => {
    if (project.scenarios.length < 2 || project.selectedId === baseline.id) return;
    if (!window.confirm("Delete this scenario?")) return;
    setProject(p => ({ ...p, scenarios: p.scenarios.filter(s => s.id !== p.selectedId), selectedId: p.scenarios[0].id }));
    setRunning(false); setCompare(null);
  };
  const loadFile = (file?: File) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".glb")) { setModelError("Please select a .glb model."); return; }
    if (fileUrl.current) URL.revokeObjectURL(fileUrl.current);
    const url = URL.createObjectURL(file); fileUrl.current = url;
    setLoaded(false); setModelUrl(url); setModelName(file.name.replace(/\.glb$/i, "")); setProject(createProject()); setModelError(""); setRunning(false); setCompare(null); cancelDrawing();
  };
  const runComparison = () => {
    if (!scenario.routes.length) return;
    setRunning(false);
    setCompare({ base: evaluateScenario(baseline, metersPerSceneUnit, durationMin), current: evaluateScenario(scenario, metersPerSceneUnit, durationMin) });
  };
  const resetSimulation = () => { setRunning(false); setResetToken(x => x + 1); setSimTime(0); setLiveMetrics(blankMetrics); };
  const stats = useMemo(() => ({ routes: scenario.routes.length, interventions: scenario.interventions.length, flow: scenario.routes.reduce((a, r) => a + r.flowPerHour, 0) }), [scenario]);
  return <main className="traffic-shell">
    <header className="traffic-header">
      <div className="traffic-brand"><Link href="/platform" className="traffic-back">← Workspace</Link><span className="traffic-logo">P</span><div><strong>PACE-SEED</strong><span>Mobility & Traffic Analysis</span></div></div>
      <div className="traffic-header-right"><span className="traffic-tag">Exploratory simulation</span><span className="traffic-model-name">{modelName}</span></div>
    </header>
    <div className="traffic-layout">
      <aside className="traffic-sidebar">
        <div className="traffic-section">
          <div className="traffic-section-title"><span>01 · URBAN MODEL</span><span className="traffic-small-pill">GLB</span></div>
          <label className="traffic-file">Change 3D model <input type="file" accept=".glb,model/gltf-binary" onChange={e => loadFile(e.target.files?.[0])}/></label>
          <p className="traffic-muted">The model is the only required spatial file. Draw routes directly on its ground surface.</p>
          <p className={calibrated ? "traffic-good" : "traffic-warning"}>{calibrated ? "✓ Metric scale read from GLB metadata" : "⚠ Metric scale not verified; numerical results are indicative"}</p>
          {modelError && <p className="traffic-error">Model error: {modelError}</p>}
        </div>
        <div className="traffic-section">
          <div className="traffic-section-title"><span>02 · SCENARIO</span></div>
          <select className="traffic-input" value={project.selectedId} onChange={e => selectScenario(e.target.value)}>
            {project.scenarios.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <div className="traffic-button-row"><button className="traffic-btn secondary" onClick={duplicateScenario}>Duplicate alternative</button><button className="traffic-btn secondary" onClick={() => setScenarioTab("scenarios")}>Manage</button></div>
        </div>
        <div className="traffic-tabstrip">
          <button className={scenarioTab === "routes" ? "selected" : ""} onClick={() => setScenarioTab("routes")}>Routes</button>
          <button className={scenarioTab === "interventions" ? "selected" : ""} onClick={() => setScenarioTab("interventions")}>Measures</button>
          <button className={scenarioTab === "scenarios" ? "selected" : ""} onClick={() => setScenarioTab("scenarios")}>Scenarios</button>
        </div>
        <div className="traffic-panel-scroll">
          {scenarioTab === "routes" && <div className="traffic-section">
            <h3>Define traffic movements</h3>
            <p className="traffic-muted">Each route follows a line you draw. Draw separate routes for different directions or travel modes.</p>
            <label className="traffic-label">Travel mode</label>
            <select className="traffic-input" value={newMode} onChange={e => { const m = e.target.value as Mode; setNewMode(m); setRouteName(`${human(m)} corridor`); }}>
              {MODES.map(m => <option key={m} value={m}>{human(m)}</option>)}
            </select>
            <label className="traffic-label">Route name</label>
            <input className="traffic-input" value={routeName} onChange={e => setRouteName(e.target.value)} />
            {drawMode !== "route" ? <button className="traffic-btn primary full" onClick={() => { setDrawMode("route"); setDraft([]); setRunning(false); }}>＋ Draw route on 3D model</button> : <div className="traffic-draw-actions"><p>{draft.length} points selected · click along the street</p><div className="traffic-button-row"><button className="traffic-btn primary" disabled={draft.length < 2} onClick={finishRoute}>Finish route</button><button className="traffic-btn secondary" onClick={cancelDrawing}>Cancel</button></div><button className="traffic-btn subtle" disabled={!draft.length} onClick={() => setDraft(p => p.slice(0, -1))}>Undo last point</button></div>}
            <div className="traffic-rule" />
            <h3>Defined routes <span className="traffic-count">{scenario.routes.length}</span></h3>
            {!scenario.routes.length && <div className="traffic-empty">No routes yet. Start by drawing a vehicle or pedestrian corridor directly on the model.</div>}
            {scenario.routes.map(route => <div className="traffic-route-card" key={route.id}>
              <div className="traffic-route-top"><span className="traffic-mode-dot" style={{ background: MODE_COLORS[route.mode] }}/><strong>{route.name}</strong><button aria-label="Delete route" title="Delete route" onClick={() => updateScenario(s => ({ ...s, routes: s.routes.filter(r => r.id !== route.id) }))}>×</button></div>
              <div className="traffic-route-meta">{human(route.mode)} · {route.points.length} points</div>
              <div className="traffic-two-inputs"><label>Flow / hour<input type="number" min={0} max={1800} step={10} value={route.flowPerHour} onChange={e => changeRoute(route.id, { flowPerHour: Math.max(0, Math.min(1800, Number(e.target.value) || 0)) })}/></label><label>Speed km/h<input type="number" min={1} max={120} step={1} value={route.speedKmh} onChange={e => changeRoute(route.id, { speedKmh: Math.max(1, Math.min(120, Number(e.target.value) || 1)) })}/></label></div>
            </div>)}
          </div>}
          {scenarioTab === "interventions" && <div className="traffic-section">
            <h3>Infrastructure & traffic measures</h3>
            <p className="traffic-muted">Place a measure on the 3D model. Some measures affect the simplified traffic calculation; others are planning annotations.</p>
            <label className="traffic-label">Measure type</label>
            <select className="traffic-input" value={interventionKind} onChange={e => setInterventionKind(e.target.value as InterventionKind)}>
              {INTERVENTIONS.map(kind => <option key={kind} value={kind}>{human(kind)}</option>)}
            </select>
            {drawMode === "intervention" ? <button className="traffic-btn secondary full" onClick={cancelDrawing}>Cancel placement</button> : <button className="traffic-btn primary full" onClick={() => { setDrawMode("intervention"); setDraft([]); setRunning(false); }}>＋ Place on model</button>}
            <p className="traffic-muted">Roundabouts: reduce approach speed only; draw the roundabout route geometry manually. Bus/cycle lanes are spatial annotations until a dedicated lane model is added.</p>
            <div className="traffic-rule" />
            <h3>Measures <span className="traffic-count">{scenario.interventions.length}</span></h3>
            {!scenario.interventions.length && <div className="traffic-empty">No measures placed yet.</div>}
            {scenario.interventions.map(i => <div className="traffic-route-card" key={i.id}><div className="traffic-route-top"><strong>{human(i.kind)}</strong><button aria-label="Delete measure" onClick={() => updateScenario(s => ({ ...s, interventions: s.interventions.filter(x => x.id !== i.id) }))}>×</button></div><div className="traffic-two-inputs"><label>Influence radius (m)<input type="number" min={2} max={100} value={i.radiusM} onChange={e => updateScenario(s => ({ ...s, interventions: s.interventions.map(x => x.id === i.id ? { ...x, radiusM: Math.max(2, Math.min(100, Number(e.target.value) || 2)) } : x) }))}/></label></div></div>)}
          </div>}
          {scenarioTab === "scenarios" && <div className="traffic-section"><h3>Planning alternatives</h3><p className="traffic-muted">Duplicate existing conditions, then change route volumes, speeds and infrastructure measures to compare outcomes.</p>
            {project.scenarios.map((s, i) => <div className="traffic-route-card" key={s.id}><div className="traffic-route-top"><strong>{i === 0 ? "Baseline · " : ""}{s.name}</strong><button onClick={() => selectScenario(s.id)}>{s.id === project.selectedId ? "✓" : "Open"}</button></div>{s.id === project.selectedId && i > 0 && <input className="traffic-input" value={s.name} onChange={e => setProject(p => ({ ...p, scenarios: p.scenarios.map(x => x.id === s.id ? { ...x, name: e.target.value } : x) }))}/>}</div>)}
            <button className="traffic-btn primary full" onClick={duplicateScenario}>＋ Create alternative</button>
            {project.selectedId !== baseline.id && <button className="traffic-btn danger full" onClick={removeScenario}>Delete selected alternative</button>}
          </div>}
        </div>
        <div className="traffic-sidebar-footer"><span className="traffic-good">● Changes saved in this browser</span><span>Not shared between devices</span></div>
      </aside>
      <section className="traffic-view">
        <div className="traffic-view-toolbar"><span>3D URBAN ENVIRONMENT</span><span>{stats.routes} routes · {stats.interventions} measures · {stats.flow.toLocaleString()} movements/h</span></div>
        <TrafficViewer modelUrl={modelUrl} scenario={scenario} draftPoints={draft} drawMode={drawMode} running={running} simSpeed={simSpeed} onPoint={addPoint} onMetrics={onMetrics} onModelInfo={modelInfo} onError={onError} resetToken={resetToken}/>
        <div className="traffic-view-legend">{MODES.map(mode => <span key={mode}><i style={{ background: MODE_COLORS[mode] }}/>{human(mode)}</span>)}</div>
      </section>
      <aside className="traffic-analysis">
        <div className="traffic-section-title"><span>03 · SIMULATION & RESULTS</span></div>
        <h3>Traffic simulation</h3>
        <p className="traffic-muted">Deterministic corridor-based exploratory model. All volumes are assumptions until replaced with observed traffic counts.</p>
        <div className="traffic-control-row"><button className="traffic-btn primary" disabled={!scenario.routes.length || !!drawMode} onClick={() => setRunning(v => !v)}>{running ? "Ⅱ Pause" : "▶ Run"}</button><button className="traffic-btn secondary" onClick={resetSimulation}>↻ Reset</button></div>
        <label className="traffic-label">Playback speed: {simSpeed}×</label><input className="traffic-range" type="range" min={1} max={12} value={simSpeed} onChange={e => setSimSpeed(Number(e.target.value))}/>
        <div className="traffic-time">Simulated time <strong>{String(Math.floor(simTime / 60)).padStart(2, "0")}:{String(Math.floor(simTime % 60)).padStart(2, "0")}</strong></div>
        <div className="traffic-metric-grid"><div><span>Completed trips</span><strong>{liveMetrics.completed}</strong></div><div><span>Vehicles / users active</span><strong>{liveMetrics.active}</strong></div><div><span>Average delay</span><strong>{fmt(liveMetrics.avgDelaySec, 0)} s</strong></div><div><span>Average queue</span><strong>{fmt(liveMetrics.avgQueue)}</strong></div></div>
        <div className="traffic-rule" />
        <h3>Compare scenarios</h3>
        <label className="traffic-label">Evaluation period (minutes)</label>
        <select className="traffic-input" value={durationMin} onChange={e => setDurationMin(Number(e.target.value))}>{[5, 10, 15, 30].map(v => <option key={v} value={v}>{v} minutes</option>)}</select>
        <button className="traffic-btn primary full" disabled={!scenario.routes.length} onClick={runComparison}>Calculate scenario indicators</button>
        {compare && <div className="traffic-comparison"><div className="traffic-compare-head"><span>Indicator</span><span>Baseline</span><span>Selected</span></div>
          {([ ["Completed trips", compare.base.completed, compare.current.completed, 0], ["Avg travel time (s)", compare.base.avgTravelSec, compare.current.avgTravelSec, 1], ["Avg delay (s)", compare.base.avgDelaySec, compare.current.avgDelaySec, 1], ["Avg queue", compare.base.avgQueue, compare.current.avgQueue, 1], ["Peak queue", compare.base.peakQueue, compare.current.peakQueue, 0] ] as [string, number, number, number][]).map(([label, base, current, digits]) => <div className="traffic-compare-row" key={label}><span>{label}</span><strong>{fmt(base, digits)}</strong><strong>{fmt(current, digits)}</strong></div>)}
        </div>}
        <div className="traffic-method"><strong>Methodological scope</strong><p>Route-level car following, demand, speed limits, basic signal phases and crossing interactions. Roundabouts are represented by a local speed reduction; lane-changing, junction capacity, crash risk and calibrated network assignment are <b>not</b> calculated.</p><p>Results are scenario illustrations, not validated forecasts or road-safety assessments.</p></div>
      </aside>
    </div>
  </main>;
}
