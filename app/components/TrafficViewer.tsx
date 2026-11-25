"use client";
import { memo, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  Agent, TrafficScenario, TrafficSimulator, Vec3, Mode, MODE_COLORS,
  VEHICLE_LENGTH, pointOnRoute, Metrics,
} from "../lib/traffic";

type Props = {
  modelUrl: string; scenario: TrafficScenario; draftPoints: Vec3[];
  drawMode: "route" | "intervention" | null; running: boolean; simSpeed: number;
  onPoint: (p: Vec3) => void; onMetrics: (m: Metrics, time: number) => void;
  onModelInfo: (metersPerSceneUnit: number, calibrated: boolean) => void;
  onError: (error: string) => void; resetToken: number;
};
function disposeTree(group: THREE.Group) {
  for (const obj of [...group.children]) {
    obj.traverse(node => {
      if (node instanceof THREE.Mesh || node instanceof THREE.Line || node instanceof THREE.Points) {
        node.geometry?.dispose();
        const mats = Array.isArray(node.material) ? node.material : [node.material];
        mats.forEach((m: THREE.Material) => m?.dispose());
      }
    });
    group.remove(obj);
  }
}
function line(points: Vec3[], color: string, opacity = 1): THREE.Line {
  const geometry = new THREE.BufferGeometry().setFromPoints(points.map(p => new THREE.Vector3(p.x, p.y + 0.6, p.z)));
  return new THREE.Line(geometry, new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity, depthTest: true }));
}
function vehicle(mode: Mode, metersPerSceneUnit: number): THREE.Group {
  const group = new THREE.Group();
  const unit = 1 / metersPerSceneUnit;
  const length = VEHICLE_LENGTH[mode] / unit;
  const width = (mode === "bus" || mode === "truck" ? 2.5 : mode === "car" ? 1.8 : 0.7) / unit;
  const height = (mode === "truck" ? 3.3 : mode === "bus" ? 3.1 : mode === "car" ? 1.5 : 1.5) / unit;
  const color = MODE_COLORS[mode];
  if (mode === "pedestrian") {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.24 / unit, 0.24 / unit, 1.1 / unit, 8), new THREE.MeshStandardMaterial({ color }));
    body.position.y = 0.9 / unit; group.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.25 / unit, 10, 10), new THREE.MeshStandardMaterial({ color: 0xe4b99d }));
    head.position.y = 1.7 / unit; group.add(head);
  } else if (mode === "bicycle" || mode === "scooter") {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.22 / unit, 0.18 / unit, length), new THREE.MeshStandardMaterial({ color }));
    frame.position.y = 0.45 / unit; group.add(frame);
    const person = new THREE.Mesh(new THREE.CylinderGeometry(0.2 / unit, 0.2 / unit, 0.9 / unit, 8), new THREE.MeshStandardMaterial({ color }));
    person.position.y = 1.1 / unit; group.add(person);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2 / unit, 8, 8), new THREE.MeshStandardMaterial({ color: 0xe4b99d }));
    head.position.y = 1.7 / unit; group.add(head);
  } else {
    const body = new THREE.Mesh(new THREE.BoxGeometry(width, height * 0.68, length), new THREE.MeshStandardMaterial({ color, roughness: 0.7 }));
    body.position.y = height * 0.36; body.castShadow = true; group.add(body);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(width * 0.84, height * 0.30, length * 0.65), new THREE.MeshStandardMaterial({ color: mode === "bus" ? 0xf6f0d9 : 0xdbe8ef, roughness: 0.4 }));
    roof.position.y = height * 0.79; group.add(roof);
    for (const x of [-width * 0.43, width * 0.43]) for (const z of [-length * 0.32, length * 0.32]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.3 / unit, 0.3 / unit, 0.2 / unit, 10), new THREE.MeshStandardMaterial({ color: 0x263238 }));
      wheel.rotation.z = Math.PI / 2; wheel.position.set(x, 0.28 / unit, z); group.add(wheel);
    }
  }
  return group;
}
const TrafficViewer = memo(function TrafficViewer(props: Props) {
  const { modelUrl, scenario, draftPoints, drawMode, running, simSpeed, onPoint, onMetrics, onModelInfo, onError, resetToken } = props;
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const modelRef = useRef<THREE.Object3D | null>(null);
  const groundRef = useRef<THREE.Object3D | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const routeGroup = useRef(new THREE.Group());
  const agentGroup = useRef(new THREE.Group());
  const meshMap = useRef(new Map<number, THREE.Group>());
  const simRef = useRef<TrafficSimulator | null>(null);
  const scaleRef = useRef(1);
  const [loading, setLoading] = useState(true);
  const [modelVersion, setModelVersion] = useState(0);
  const onPointRef = useRef(onPoint);
  const onMetricsRef = useRef(onMetrics);
  const onInfoRef = useRef(onModelInfo);
  const onErrorRef = useRef(onError);
  const drawRef = useRef(drawMode);
  const runningRef = useRef(running);
  const speedRef = useRef(simSpeed);
  const lastMetricsRef = useRef(0);
  useEffect(() => { onPointRef.current = onPoint; }, [onPoint]);
  useEffect(() => { onMetricsRef.current = onMetrics; }, [onMetrics]);
  useEffect(() => { onInfoRef.current = onModelInfo; }, [onModelInfo]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);
  useEffect(() => { drawRef.current = drawMode; }, [drawMode]);
  useEffect(() => { runningRef.current = running; }, [running]);
  useEffect(() => { speedRef.current = simSpeed; }, [simSpeed]);

  useEffect(() => {
    const mount = mountRef.current; if (!mount) return;
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0xe8eef0); sceneRef.current = scene;
    const camera = new THREE.PerspectiveCamera(58, 1, 0.05, 30000);
    camera.position.set(180, 165, 180); cameraRef.current = camera;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement); rendererRef.current = renderer;
    const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.dampingFactor = 0.07; controls.minDistance = 6; controls.maxDistance = 1500; controlsRef.current = controls;
    scene.add(new THREE.AmbientLight(0xffffff, 1.5));
    const sun = new THREE.DirectionalLight(0xffffff, 2.0); sun.position.set(180, 250, 100); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024); sun.shadow.camera.left = -250; sun.shadow.camera.right = 250; sun.shadow.camera.top = 250; sun.shadow.camera.bottom = -250; scene.add(sun);
    scene.add(routeGroup.current, agentGroup.current);
    const resize = () => { const w = Math.max(1, mount.clientWidth), h = Math.max(1, mount.clientHeight); camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h); };
    const observer = new ResizeObserver(resize); observer.observe(mount); resize();
    const onClick = (event: MouseEvent) => {
      if (!drawRef.current || !modelRef.current) return;
      const bounds = renderer.domElement.getBoundingClientRect();
      const mouse = new THREE.Vector2(((event.clientX - bounds.left) / bounds.width) * 2 - 1, -((event.clientY - bounds.top) / bounds.height) * 2 + 1);
      const ray = new THREE.Raycaster(); ray.setFromCamera(mouse, camera);
      const target = groundRef.current || modelRef.current;
      const hits = ray.intersectObject(target, true);
      if (!hits.length) return;
      const p = hits[0].point;
      onPointRef.current({ x: p.x, y: p.y, z: p.z });
    };
    renderer.domElement.addEventListener("click", onClick);
    let raf = 0, last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      if (runningRef.current && simRef.current) {
        const scaled = dt * speedRef.current;
        const steps = Math.max(1, Math.ceil(scaled / 0.5));
        for (let i = 0; i < steps; i++) simRef.current.step(scaled / steps);
        if (now - lastMetricsRef.current > 650) { lastMetricsRef.current = now; onMetricsRef.current(simRef.current.metrics(), simRef.current.timeSec); }
      }
      const simulator = simRef.current;
      if (simulator) {
        const alive = new Set(simulator.agents.map(a => a.id));
        for (const [id, obj] of meshMap.current) if (!alive.has(id)) {
          agentGroup.current.remove(obj); obj.traverse(child => { if (child instanceof THREE.Mesh) { child.geometry.dispose(); (child.material as THREE.Material).dispose(); } }); meshMap.current.delete(id);
        }
        const routes = new Map(simulator.scenario.routes.map(r => [r.id, r]));
        for (const agent of simulator.agents) {
          const route = routes.get(agent.routeId); if (!route) continue;
          let mesh = meshMap.current.get(agent.id);
          if (!mesh) { mesh = vehicle(agent.mode, scaleRef.current); meshMap.current.set(agent.id, mesh); agentGroup.current.add(mesh); }
          const { point, direction } = pointOnRoute(route, agent.distanceM, scaleRef.current);
          mesh.position.set(point.x, point.y + 0.4, point.z);
          mesh.rotation.y = Math.atan2(direction.x, direction.z);
        }
      }
      controls.update(); renderer.render(scene, camera); raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); observer.disconnect(); renderer.domElement.removeEventListener("click", onClick); controls.dispose(); renderer.dispose(); disposeTree(routeGroup.current); disposeTree(agentGroup.current); meshMap.current.clear(); if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement); sceneRef.current = null; rendererRef.current = null; };
  }, []);

  useEffect(() => {
    if (!sceneRef.current) return;
    let cancelled = false; setLoading(true);
    if (modelRef.current) { sceneRef.current.remove(modelRef.current); modelRef.current = null; groundRef.current = null; }
    const loader = new GLTFLoader();
    loader.load(modelUrl, gltf => {
      if (cancelled || !sceneRef.current) return;
      const model = gltf.scene;
      const bounds = new THREE.Box3().setFromObject(model);
      const center = bounds.getCenter(new THREE.Vector3());
      const size = bounds.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z, 0.001);
      const sceneScale = 200 / maxDim;
      model.scale.setScalar(sceneScale);
      model.position.copy(center).multiplyScalar(-sceneScale);
      model.traverse(node => { if (node instanceof THREE.Mesh) { node.receiveShadow = true; node.castShadow = node.name.toLowerCase().includes("bygg") || node.name.toLowerCase().includes("building"); } });
      sceneRef.current.add(model); modelRef.current = model;
      model.traverse(node => { if (!groundRef.current && /ortofoto|ground|terrain|mark/i.test(node.name) && node instanceof THREE.Mesh) groundRef.current = node; });
      const meta = gltf.parser.json.extras as { units?: string } | undefined;
      const calibrated = meta?.units === "meters";
      scaleRef.current = calibrated ? 1 / sceneScale : 1;
      onInfoRef.current(scaleRef.current, calibrated);
      if (cameraRef.current && controlsRef.current) { cameraRef.current.position.set(150, 150, 170); controlsRef.current.target.set(0, 0, 0); controlsRef.current.update(); }
      setLoading(false); setModelVersion(v => v + 1);
    }, undefined, error => { if (!cancelled) { setLoading(false); onErrorRef.current(error instanceof Error ? error.message : String(error)); } });
    return () => { cancelled = true; };
  }, [modelUrl]);

  useEffect(() => {
    const g = routeGroup.current; disposeTree(g);
    for (const route of scenario.routes) {
      if (route.points.length < 2) continue;
      g.add(line(route.points, MODE_COLORS[route.mode]));
      const start = route.points[0];
      const marker = new THREE.Mesh(new THREE.SphereGeometry(1.3, 10, 10), new THREE.MeshBasicMaterial({ color: MODE_COLORS[route.mode] }));
      marker.position.set(start.x, start.y + 1.5, start.z); g.add(marker);
    }
    for (const intervention of scenario.interventions) {
      const p = intervention.position;
      const radius = Math.max(1, intervention.radiusM / Math.max(0.01, scaleRef.current));
      const kindColor: Record<string, number> = { roundabout: 0x648d71, crossing: 0xe7b34d, traffic_light: 0xb66e50, speed_bump: 0xd5a351, bus_stop: 0x467ca8, bus_lane: 0x3b83a1, cycle_lane: 0x34947d };
      const color = kindColor[intervention.kind] || 0x64748b;
      const ring = new THREE.Mesh(new THREE.RingGeometry(Math.max(0.2, radius * 0.75), radius, 36), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthTest: false }));
      ring.rotation.x = -Math.PI / 2; ring.position.set(p.x, p.y + 0.8, p.z); g.add(ring);
      const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 3, 8), new THREE.MeshStandardMaterial({ color }));
      pin.position.set(p.x, p.y + 2.2, p.z); g.add(pin);
    }
    if (draftPoints.length) {
      if (draftPoints.length > 1) g.add(line(draftPoints, "#d16d33"));
      for (const p of draftPoints) { const m = new THREE.Mesh(new THREE.SphereGeometry(1.4, 10, 10), new THREE.MeshBasicMaterial({ color: 0xd16d33 })); m.position.set(p.x, p.y + 1.5, p.z); g.add(m); }
    }
  }, [scenario, draftPoints, modelUrl, modelVersion]);

  useEffect(() => {
    simRef.current = new TrafficSimulator(scenario, scaleRef.current);
    disposeTree(agentGroup.current); meshMap.current.clear();
    onMetricsRef.current(simRef.current.metrics(), 0);
  }, [scenario, resetToken, modelUrl, modelVersion]);
  return <div style={{ width: "100%", height: "100%", position: "relative", background: "#e8eef0" }}>
    <div ref={mountRef} style={{ width: "100%", height: "100%", cursor: drawMode ? "crosshair" : "grab" }} />
    {loading && <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: "#e8eef0", color: "#3a5549", fontWeight: 600 }}>Loading 3D model…</div>}
    {drawMode && <div style={{ position: "absolute", bottom: 20, left: "50%", transform: "translateX(-50%)", background: "#fff", border: "1px solid #ccd8d2", borderRadius: 8, padding: "9px 16px", fontSize: 12, boxShadow: "0 5px 25px #0002", color: "#243d32", pointerEvents: "none" }}>Click on the ground to {drawMode === "route" ? "add route points" : "place an intervention"}</div>}
  </div>;
});
export default TrafficViewer;
