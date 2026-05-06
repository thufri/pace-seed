"use client";
import { useEffect, useRef, useState, memo } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export type Marker = { id: string; name: string; x: number; y: number; z: number; category?: string; value?: string; unit?: string; };
export type Zone = { id: string; name: string; category: string; color: string; vertices: { x: number; y: number; z: number }[]; };
export type Infrastructure = { id: string; type: string; name: string; x: number; y: number; z: number; width: number; height: number; depth: number; color: string; };
export type SensorItem = { id: string; name: string; type: string; x: number; y: number; z: number; value?: number; unit?: string; };
export type WeatherData = { temperature: number; windspeed: number; precipitation: number; weathercode: number; description: string; };
export type ExtremeWeatherConfig = { type: "flood" | "storm" | "heatwave" | null; intensity: number; };
export type SunConfig = { hour: number; month: number; };

type Props = {
  modelUrl: string;
  markers: Marker[];
  zones: Zone[];
  infrastructure: Infrastructure[];
  sensors: SensorItem[];
  scenarioObjects: ScenarioObject[];
  placingMode: boolean;
  drawingZone: boolean;
  onPlaceMarker: (x: number, y: number, z: number) => void;
  onAddZoneVertex: (x: number, y: number, z: number) => void;
  extremeWeather?: ExtremeWeatherConfig | null;
  rainMmPerDay?: number;
  sunConfig?: SunConfig | null;
  loadingText?: string;
  placeText?: string;
  drawText?: string;
};

export type ScenarioObject = { id: string; type: "tree"|"water"|"bush"|"hedge"|"grass"|"heatmap"|"flood"|"wind"; x: number; y: number; z: number; scale?: number; intensity?: number; };

function getSunPosition(hour: number, month: number, lat = 55): THREE.Vector3 {
  const decl = -23.45 * Math.cos((2 * Math.PI / 12) * (month + 10));
  const ha = (hour - 12) * 15 * (Math.PI / 180);
  const dr = decl * (Math.PI / 180), lr = lat * (Math.PI / 180);
  const el = Math.asin(Math.sin(dr) * Math.sin(lr) + Math.cos(dr) * Math.cos(lr) * Math.cos(ha));
  const az = Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(lr) - Math.tan(dr) * Math.cos(lr));
  const dist = 500;
  return new THREE.Vector3(dist * Math.cos(el) * Math.sin(az), dist * Math.sin(el), dist * Math.cos(el) * Math.cos(az));
}

// ── HELPER FUNCTIONS (module-level so they don't recreate on render) ──
function mk(geo: THREE.BufferGeometry, matProps: THREE.MeshStandardMaterialParameters, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial(matProps));
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; return m;
}
function pole(g: THREE.Group, x: number, y: number, z: number, color: number) {
  g.add(mk(new THREE.CylinderGeometry(0.3, 0.3, 10, 8), { color }, x, y + 5, z));
  g.add(mk(new THREE.SphereGeometry(2.2, 16, 16), { color, emissive: color, emissiveIntensity: 0.5 }, x, y + 12, z));
}

const ThreeViewer = memo(function ThreeViewer({
  modelUrl, markers, zones, infrastructure, sensors, scenarioObjects,
  placingMode, drawingZone, onPlaceMarker, onAddZoneVertex,
  extremeWeather, rainMmPerDay = 0, sunConfig,
  loadingText = "Loading 3D model...", placeText = "📍 Click on the model to place a location", drawText = "✏️ Click points to draw a zone"
}: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const sunLightRef = useRef<THREE.DirectionalLight | null>(null);
  const sunSphereRef = useRef<THREE.Mesh | null>(null);
  const markersGroupRef = useRef<THREE.Group>(new THREE.Group());
  const zonesGroupRef = useRef<THREE.Group>(new THREE.Group());
  const infraGroupRef = useRef<THREE.Group>(new THREE.Group());
  const sensorsGroupRef = useRef<THREE.Group>(new THREE.Group());
  const scenarioGroupRef = useRef<THREE.Group>(new THREE.Group());
  const weatherGroupRef = useRef<THREE.Group>(new THREE.Group());
  const rainSimGroupRef = useRef<THREE.Group>(new THREE.Group());
  const modelRef = useRef<THREE.Object3D | null>(null);
  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef = useRef(new THREE.Vector2());
  const placingRef = useRef(placingMode);
  const drawingRef = useRef(drawingZone);
  const onPlaceRef = useRef(onPlaceMarker);
  const onZoneRef = useRef(onAddZoneVertex);
  const rainExtRef = useRef<THREE.Points | null>(null);
  const rainSimRef = useRef<THREE.Points | null>(null);
  const animRef = useRef<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => { placingRef.current = placingMode; }, [placingMode]);
  useEffect(() => { drawingRef.current = drawingZone; }, [drawingZone]);
  useEffect(() => { onPlaceRef.current = onPlaceMarker; }, [onPlaceMarker]);
  useEffect(() => { onZoneRef.current = onAddZoneVertex; }, [onAddZoneVertex]);

  // ── SETUP ONCE ────────────────────────────────────────────────────
  useEffect(() => {
    if (!mountRef.current) return;
    const mount = mountRef.current;
    const w = mount.clientWidth, h = mount.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f172a);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(60, w / h, 0.01, 10000);
    camera.position.set(0, 100, 300);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(w, h);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setPixelRatio(window.devicePixelRatio);
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.05;
    controlsRef.current = controls;

    scene.add(new THREE.AmbientLight(0xffffff, 0.8));

    const sunLight = new THREE.DirectionalLight(0xfff4e0, 2);
    sunLight.position.set(100, 200, 100);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 1;
    sunLight.shadow.camera.far = 2000;
    sunLight.shadow.camera.left = -300;
    sunLight.shadow.camera.right = 300;
    sunLight.shadow.camera.top = 300;
    sunLight.shadow.camera.bottom = -300;
    scene.add(sunLight);
    sunLightRef.current = sunLight;

    const sunSphere = new THREE.Mesh(
      new THREE.SphereGeometry(8, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xfff7a0 })
    );
    sunSphere.visible = false;
    scene.add(sunSphere);
    sunSphereRef.current = sunSphere;

    scene.add(markersGroupRef.current);
    scene.add(zonesGroupRef.current);
    scene.add(infraGroupRef.current);
    scene.add(sensorsGroupRef.current);
    scene.add(scenarioGroupRef.current);
    scene.add(weatherGroupRef.current);
    scene.add(rainSimGroupRef.current);

    const onClick = (e: MouseEvent) => {
      if (!modelRef.current) return;
      const rect = mount.getBoundingClientRect();
      mouseRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouseRef.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current!);
      const hits = raycasterRef.current.intersectObject(modelRef.current, true);
      if (hits.length > 0) {
        const p = hits[0].point;
        if (placingRef.current) onPlaceRef.current(p.x, p.y, p.z);
        else if (drawingRef.current) onZoneRef.current(p.x, p.y, p.z);
      }
    };
    mount.addEventListener("click", onClick);

    const onResize = () => {
      const w = mount.clientWidth, h = mount.clientHeight;
      camera.aspect = w / h; camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);

    const animate = () => {
      animRef.current = requestAnimationFrame(animate);
      [rainExtRef.current, rainSimRef.current].forEach(rain => {
        if (!rain) return;
        const pos = rain.geometry.attributes.position.array as Float32Array;
        for (let i = 1; i < pos.length; i += 3) { pos[i] -= 4; if (pos[i] < -50) pos[i] = 350; }
        rain.geometry.attributes.position.needsUpdate = true;
      });
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      window.removeEventListener("resize", onResize);
      mount.removeEventListener("click", onClick);
      cancelAnimationFrame(animRef.current);
      renderer.dispose();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
    };
  }, []);

  // ── LOAD MODEL ────────────────────────────────────────────────────
  useEffect(() => {
    if (!sceneRef.current || !modelUrl) return;
    setLoading(true);
    if (modelRef.current) { sceneRef.current.remove(modelRef.current); modelRef.current = null; }
    new GLTFLoader().load(modelUrl, (gltf) => {
      const model = gltf.scene;
      model.traverse(node => {
        if (node instanceof THREE.Mesh) { node.castShadow = true; node.receiveShadow = true; }
      });
      const box = new THREE.Box3().setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      model.position.sub(center);
      const maxDim = Math.max(size.x, size.y, size.z);
      const scale = 200 / maxDim;
      model.scale.setScalar(scale);
      sceneRef.current!.add(model);
      modelRef.current = model;
      if (cameraRef.current && controlsRef.current) {
        cameraRef.current.position.set(0, maxDim * scale * 0.5, maxDim * scale * 1.2);
        controlsRef.current.target.set(0, 0, 0);
        controlsRef.current.update();
      }
      setLoading(false);
    }, undefined, () => setLoading(false));
  }, [modelUrl]);

  // ── SUN & SHADOW ──────────────────────────────────────────────────
  useEffect(() => {
    if (!sunLightRef.current || !sceneRef.current) return;
    if (!sunConfig) {
      sunLightRef.current.position.set(100, 200, 100);
      sunLightRef.current.intensity = 2;
      sunLightRef.current.color.set(0xfff4e0);
      if (sunSphereRef.current) sunSphereRef.current.visible = false;
      if (!extremeWeather?.type && rainMmPerDay <= 0)
        sceneRef.current.background = new THREE.Color(0x0f172a);
      return;
    }
    const pos = getSunPosition(sunConfig.hour, sunConfig.month);
    sunLightRef.current.position.copy(pos);
    const isUp = pos.y > 0;
    sunLightRef.current.intensity = isUp ? 2.5 : 0.1;
    if (sunSphereRef.current) {
      sunSphereRef.current.position.copy(pos);
      sunSphereRef.current.visible = isUp;
    }
    if (isUp) {
      const t = Math.min(pos.y / 250, 1);
      const dawn = sunConfig.hour < 8 || sunConfig.hour > 18;
      if (dawn) {
        sceneRef.current.background = new THREE.Color(0.15 + t * 0.1, 0.06, 0.05);
        sunLightRef.current.color.set(0xff8844);
      } else {
        sceneRef.current.background = new THREE.Color(0.05 + t * 0.35, 0.1 + t * 0.45, 0.25 + t * 0.55);
        sunLightRef.current.color.set(0xfff4e0);
      }
    } else {
      sceneRef.current.background = new THREE.Color(0x020408);
      sunLightRef.current.color.set(0x1a2a4a);
    }
  }, [sunConfig, extremeWeather, rainMmPerDay]);

  // ── RAIN SIMULATION ───────────────────────────────────────────────
  useEffect(() => {
    rainSimGroupRef.current.clear();
    rainSimRef.current = null;
    if (rainMmPerDay <= 0) {
      if (!extremeWeather?.type && !sunConfig)
        sceneRef.current && (sceneRef.current.background = new THREE.Color(0x0f172a));
      return;
    }
    const mm = rainMmPerDay;
    const count = Math.min(800 + mm * 90, 14000);
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count * 3; i += 3) {
      pos[i] = (Math.random() - 0.5) * 600;
      pos[i + 1] = Math.random() * 350;
      pos[i + 2] = (Math.random() - 0.5) * 600;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const rain = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0x93c5fd, size: 0.4 + mm * 0.015, transparent: true, opacity: 0.75 }));
    rainSimGroupRef.current.add(rain);
    rainSimRef.current = rain;

    const waterH = mm < 5 ? 0 : mm < 15 ? 1 : mm < 30 ? 3 : mm < 50 ? 8 : mm < 80 ? 16 : 28;
    const waterOp = mm < 5 ? 0 : 0.2 + Math.min(mm / 200, 0.35);

    if (waterH > 0) {
      const waterPlane = mk(new THREE.PlaneGeometry(900, 900), { color: 0x1d4ed8, transparent: true, opacity: waterOp, side: THREE.DoubleSide, roughness: 0.05 }, 0, waterH, 0);
      waterPlane.rotation.x = -Math.PI / 2;
      rainSimGroupRef.current.add(waterPlane);

      const deepPlane = mk(new THREE.PlaneGeometry(900, 900), { color: 0x2563eb, transparent: true, opacity: waterOp * 0.6, side: THREE.DoubleSide }, 0, waterH * 0.4, 0);
      deepPlane.rotation.x = -Math.PI / 2;
      rainSimGroupRef.current.add(deepPlane);

      const rippleCount = Math.min(Math.round(mm / 10) + 2, 8);
      for (let r = 1; r <= rippleCount; r++) {
        const ripple = mk(new THREE.RingGeometry(r * 20, r * 20 + 1.2, 64), { color: 0x60a5fa, transparent: true, opacity: 0.2, side: THREE.DoubleSide }, 0, waterH + 0.3, 0);
        ripple.rotation.x = -Math.PI / 2;
        rainSimGroupRef.current.add(ripple);
      }
    }

    if (mm >= 20) {
      const dirs = [new THREE.Vector3(1, -0.05, 0.3), new THREE.Vector3(-1, -0.05, 0.5), new THREE.Vector3(0.4, -0.05, 1), new THREE.Vector3(-0.5, -0.05, -1)];
      const arrowCount = Math.round(2 + mm / 15);
      dirs.forEach(dir => {
        for (let i = 0; i < arrowCount; i++) {
          rainSimGroupRef.current.add(new THREE.ArrowHelper(
            dir.clone().normalize(),
            new THREE.Vector3((Math.random() - 0.5) * 180, waterH + 1.5, (Math.random() - 0.5) * 180),
            12 + mm * 0.25, 0x60a5fa, 5, 4
          ));
        }
      });
    }

    if (!sunConfig && sceneRef.current) {
      const d = Math.min(mm / 120, 0.85);
      sceneRef.current.background = new THREE.Color(0.06 - d * 0.05, 0.09 - d * 0.07, 0.18 - d * 0.12);
    }
  }, [rainMmPerDay, sunConfig, extremeWeather]);

  // ── EXTREME WEATHER ───────────────────────────────────────────────
  useEffect(() => {
    weatherGroupRef.current.clear();
    rainExtRef.current = null;
    if (!extremeWeather?.type && !sunConfig && rainMmPerDay <= 0)
      sceneRef.current && (sceneRef.current.background = new THREE.Color(0x0f172a));
    if (!extremeWeather?.type) return;

    const { type: t, intensity } = extremeWeather;

    if (t === "flood" || t === "storm") {
      sceneRef.current!.background = new THREE.Color(t === "flood" ? 0x040d1a : 0x03060f);
      const count = (t === "flood" ? 3000 : 4000) + intensity * 1400;
      const pos = new Float32Array(count * 3);
      for (let i = 0; i < count * 3; i += 3) { pos[i] = (Math.random() - 0.5) * 600; pos[i + 1] = Math.random() * 350; pos[i + 2] = (Math.random() - 0.5) * 600; }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      const rain = new THREE.Points(g, new THREE.PointsMaterial({ color: t === "flood" ? 0x93c5fd : 0xbae6fd, size: 0.8 + intensity * 0.14, transparent: true, opacity: 0.85 }));
      weatherGroupRef.current.add(rain);
      rainExtRef.current = rain;
    }

    if (t === "flood") {
      const wH = intensity * 8;
      const fl = mk(new THREE.PlaneGeometry(1000, 1000), { color: 0x1d4ed8, transparent: true, opacity: 0.35 + intensity * 0.04, side: THREE.DoubleSide, roughness: 0.05 }, 0, wH, 0);
      fl.rotation.x = -Math.PI / 2;
      weatherGroupRef.current.add(fl);
      const fl2 = mk(new THREE.PlaneGeometry(1000, 1000), { color: 0x2563eb, transparent: true, opacity: 0.2, side: THREE.DoubleSide }, 0, wH * 0.35, 0);
      fl2.rotation.x = -Math.PI / 2;
      weatherGroupRef.current.add(fl2);
      for (let r = 1; r <= Math.round(intensity / 2) + 2; r++) {
        const rp = mk(new THREE.RingGeometry(r * 30, r * 30 + 1.5, 64), { color: 0x60a5fa, transparent: true, opacity: 0.15, side: THREE.DoubleSide }, 0, wH + 0.5, 0);
        rp.rotation.x = -Math.PI / 2;
        weatherGroupRef.current.add(rp);
      }
    }

    if (t === "storm") {
      for (let i = 0; i < 4 + Math.round(intensity * 0.8); i++) {
        const cl = mk(new THREE.SphereGeometry(40 + Math.random() * 25 + intensity * 3, 16, 16), { color: 0x0d0d1a, transparent: true, opacity: 0.75 }, (Math.random() - 0.5) * 350, 170 + Math.random() * 70, (Math.random() - 0.5) * 350);
        cl.scale.y = 0.45;
        weatherGroupRef.current.add(cl);
      }
      for (let i = 0; i < 3 + Math.round(intensity * 0.8); i++) {
        weatherGroupRef.current.add(new THREE.ArrowHelper(
          new THREE.Vector3(1, -0.15, 0.3).normalize(),
          new THREE.Vector3((Math.random() - 0.5) * 200, 25 + Math.random() * 60, (Math.random() - 0.5) * 200),
          18 + intensity * 3, 0x7dd3fc, 7, 5
        ));
      }
    }

    if (t === "heatwave") {
      const r2 = Math.round(8 + intensity * 17), g2 = Math.round(intensity * 4);
      sceneRef.current!.background = new THREE.Color(`rgb(${r2}, ${g2}, 0)`);
      weatherGroupRef.current.add(mk(new THREE.SphereGeometry(450, 32, 32), { color: 0xf97316, transparent: true, opacity: 0.05 + intensity * 0.009, side: THREE.BackSide }));
      const gnd = mk(new THREE.PlaneGeometry(700, 700), { color: 0xef4444, transparent: true, opacity: 0.06 + intensity * 0.022, side: THREE.DoubleSide }, 0, 1, 0);
      gnd.rotation.x = -Math.PI / 2;
      weatherGroupRef.current.add(gnd);
      for (let r3 = 1; r3 <= 3 + Math.round(intensity * 0.7); r3++) {
        const rng = mk(new THREE.RingGeometry(r3 * 28, r3 * 28 + 2.5, 64), { color: 0xfbbf24, transparent: true, opacity: 0.08 + intensity * 0.01, side: THREE.DoubleSide }, 0, 1 + r3 * 1.5, 0);
        rng.rotation.x = -Math.PI / 2;
        weatherGroupRef.current.add(rng);
      }
      if (intensity >= 5) {
        for (let i = 0; i < Math.round((intensity - 4) * 2); i++) {
          weatherGroupRef.current.add(mk(
            new THREE.CylinderGeometry(1.5, 9, 50 + intensity * 6, 16, 1, true),
            { color: 0xfb923c, transparent: true, opacity: 0.1, side: THREE.DoubleSide },
            (Math.random() - 0.5) * 220, 25 + intensity * 2, (Math.random() - 0.5) * 220
          ));
        }
      }
    }
  }, [extremeWeather?.type, extremeWeather?.intensity, sunConfig, rainMmPerDay]);

  // ── DATA LAYER MARKERS ────────────────────────────────────────────
  useEffect(() => {
    const g = markersGroupRef.current; g.clear();
    markers.forEach(m => {
      const val = parseFloat(m.value || "5") || 5;
      const n = Math.min(Math.max(val / 100, 0.2), 3);
      if (m.category === "stormwater") {
        g.add(mk(new THREE.CylinderGeometry(6 * n, 6 * n, 0.6, 32), { color: 0x3b82f6, transparent: true, opacity: 0.6 }, m.x, m.y + 0.3, m.z));
        for (let r = 1; r <= 3; r++) { const rp = mk(new THREE.RingGeometry(6 * n * r * 0.5, 6 * n * r * 0.5 + 0.8, 32), { color: 0x60a5fa, transparent: true, opacity: 0.3 / r, side: THREE.DoubleSide }, m.x, m.y + 0.5, m.z); rp.rotation.x = -Math.PI / 2; g.add(rp); }
        pole(g, m.x, m.y, m.z, 0x3b82f6);
      } else if (m.category === "heatisland") {
        const dm = mk(new THREE.SphereGeometry(10 * n, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), { color: 0xef4444, transparent: true, opacity: 0.18, side: THREE.DoubleSide }, m.x, m.y, m.z); g.add(dm);
        const gc = mk(new THREE.CircleGeometry(10 * n, 32), { color: 0xf97316, transparent: true, opacity: 0.25, side: THREE.DoubleSide }, m.x, m.y + 0.4, m.z); gc.rotation.x = -Math.PI / 2; g.add(gc);
        for (let r = 1; r <= 3; r++) { const rng = mk(new THREE.RingGeometry(r * 4 * n, r * 4 * n + 0.5, 32), { color: 0xfbbf24, transparent: true, opacity: 0.15, side: THREE.DoubleSide }, m.x, m.y + r * 0.5, m.z); rng.rotation.x = -Math.PI / 2; g.add(rng); }
        pole(g, m.x, m.y, m.z, 0xef4444);
      } else if (m.category === "ecology") {
        const gz = mk(new THREE.CircleGeometry(8 * n, 32), { color: 0x22c55e, transparent: true, opacity: 0.3, side: THREE.DoubleSide }, m.x, m.y + 0.3, m.z); gz.rotation.x = -Math.PI / 2; g.add(gz);
        for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2, r = 5 * n; g.add(mk(new THREE.CylinderGeometry(0.3, 0.4, 3, 6), { color: 0x8B4513 }, m.x + Math.cos(a) * r, m.y + 1.5, m.z + Math.sin(a) * r)); g.add(mk(new THREE.SphereGeometry(2, 10, 10), { color: 0x16a34a, transparent: true, opacity: 0.9 }, m.x + Math.cos(a) * r, m.y + 5, m.z + Math.sin(a) * r)); }
        pole(g, m.x, m.y, m.z, 0x22c55e);
      } else if (m.category === "accessibility") {
        [new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1)].forEach(d => { g.add(new THREE.ArrowHelper(d, new THREE.Vector3(m.x, m.y + 3, m.z), 8 * n, 0xf59e0b, 3, 2)); });
        const zn = mk(new THREE.CircleGeometry(7 * n, 32), { color: 0xf59e0b, transparent: true, opacity: 0.2, side: THREE.DoubleSide }, m.x, m.y + 0.3, m.z); zn.rotation.x = -Math.PI / 2; g.add(zn);
        pole(g, m.x, m.y, m.z, 0xf59e0b);
      } else if (m.category === "social") {
        g.add(mk(new THREE.CylinderGeometry(8 * n, 8 * n, 0.4, 32), { color: 0xa855f7, transparent: true, opacity: 0.35 }, m.x, m.y + 0.2, m.z));
        for (let r = 1; r <= 3; r++) { const rng = mk(new THREE.RingGeometry(r * 3 * n, r * 3 * n + 0.6, 32), { color: 0xd946ef, transparent: true, opacity: 0.2, side: THREE.DoubleSide }, m.x, m.y + 0.4, m.z); rng.rotation.x = -Math.PI / 2; g.add(rng); }
        for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2, r = 4 * n; g.add(mk(new THREE.CylinderGeometry(0.5, 0.5, 4, 8), { color: 0xc084fc }, m.x + Math.cos(a) * r, m.y + 2, m.z + Math.sin(a) * r)); g.add(mk(new THREE.SphereGeometry(0.7, 8, 8), { color: 0xe879f9 }, m.x + Math.cos(a) * r, m.y + 5, m.z + Math.sin(a) * r)); }
        pole(g, m.x, m.y, m.z, 0xa855f7);
      } else {
        pole(g, m.x, m.y, m.z, 0xffffff);
      }
    });
  }, [markers]);

  // ── ZONES ─────────────────────────────────────────────────────────
  useEffect(() => {
    const g = zonesGroupRef.current; g.clear();
    zones.forEach(zone => {
      if (zone.vertices.length < 3) return;
      const col = parseInt(zone.color.replace("#", ""), 16) || 0x3b82f6;
      const shape = new THREE.Shape();
      shape.moveTo(zone.vertices[0].x, zone.vertices[0].z);
      zone.vertices.slice(1).forEach(v => shape.lineTo(v.x, v.z));
      shape.closePath();
      const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
      mesh.rotation.x = -Math.PI / 2;
      const avgY = zone.vertices.reduce((s, v) => s + v.y, 0) / zone.vertices.length;
      mesh.position.y = avgY + 0.5; g.add(mesh);
      const pts = [...zone.vertices, zone.vertices[0]].map(v => new THREE.Vector3(v.x, avgY + 1, v.z));
      g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: col })));
      zone.vertices.forEach(v => g.add(mk(new THREE.SphereGeometry(1.2, 8, 8), { color: col }, v.x, v.y + 1.5, v.z)));
    });
  }, [zones]);

  // ── INFRASTRUCTURE ────────────────────────────────────────────────
  useEffect(() => {
    const g = infraGroupRef.current; g.clear();
    infrastructure.forEach(inf => {
      const col = parseInt(inf.color.replace("#", ""), 16) || 0x64748b;
      if (inf.type === "building") {
        const bld = mk(new THREE.BoxGeometry(inf.width, inf.height, inf.depth), { color: col, transparent: true, opacity: 0.8 }, inf.x, inf.y + inf.height / 2, inf.z); bld.castShadow = true; bld.receiveShadow = true; g.add(bld);
        g.add(mk(new THREE.BoxGeometry(inf.width + 1, 1, inf.depth + 1), { color: 0x334155 }, inf.x, inf.y + inf.height, inf.z));
        for (let fl = 1; fl <= Math.min(Math.floor(inf.height / 4), 8); fl++) for (let w = -1; w <= 1; w++) g.add(mk(new THREE.BoxGeometry(1.5, 2, 0.3), { color: 0xbae6fd, transparent: true, opacity: 0.8 }, inf.x + w * 3, inf.y + fl * 4, inf.z + inf.depth / 2 + 0.2));
      } else if (inf.type === "road") {
        g.add(mk(new THREE.BoxGeometry(inf.width, 0.3, inf.depth), { color: 0x374151 }, inf.x, inf.y + 0.15, inf.z));
        for (let i = -2; i <= 2; i++) g.add(mk(new THREE.BoxGeometry(inf.depth * 0.08, 0.1, 1.5), { color: 0xffffff, transparent: true, opacity: 0.7 }, inf.x, inf.y + 0.4, inf.z + i * inf.depth / 5));
      } else if (inf.type === "park") {
        g.add(mk(new THREE.CylinderGeometry(inf.width / 2, inf.width / 2, 0.3, 32), { color: 0x22c55e, transparent: true, opacity: 0.6 }, inf.x, inf.y + 0.15, inf.z));
        for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2, r = inf.width * 0.35; g.add(mk(new THREE.CylinderGeometry(0.4, 0.5, 4, 8), { color: 0x8B4513 }, inf.x + Math.cos(a) * r, inf.y + 2, inf.z + Math.sin(a) * r)); g.add(mk(new THREE.SphereGeometry(2.5, 10, 10), { color: 0x16a34a, transparent: true, opacity: 0.9 }, inf.x + Math.cos(a) * r, inf.y + 7, inf.z + Math.sin(a) * r)); }
      } else if (inf.type === "bridge") {
        g.add(mk(new THREE.BoxGeometry(inf.width, 1.5, inf.depth), { color: 0x9ca3af }, inf.x, inf.y + inf.height, inf.z));
        for (let i = -1; i <= 1; i += 2) g.add(mk(new THREE.CylinderGeometry(1, 1.5, inf.height, 8), { color: 0x6b7280 }, inf.x + i * inf.width * 0.3, inf.y + inf.height / 2, inf.z));
      } else if (inf.type === "parking") {
        g.add(mk(new THREE.BoxGeometry(inf.width, 0.2, inf.depth), { color: 0x4b5563 }, inf.x, inf.y + 0.1, inf.z));
        for (let i = 0; i < Math.floor(inf.width / 4); i++) g.add(mk(new THREE.BoxGeometry(0.2, 0.1, inf.depth * 0.8), { color: 0xe2e8f0, transparent: true, opacity: 0.6 }, inf.x - inf.width / 2 + i * 4 + 2, inf.y + 0.3, inf.z));
      }
    });
  }, [infrastructure]);

  // ── SENSORS ───────────────────────────────────────────────────────
  useEffect(() => {
    const g = sensorsGroupRef.current; g.clear();
    const SENSOR_COLORS: Record<string, number> = {
      "rain_gauge": 0x3b82f6, "temperature": 0xef4444, "wind": 0x7dd3fc,
      "humidity": 0x22c55e, "pressure": 0xf59e0b, "noise": 0xa855f7, "air_quality": 0x10b981,
    };
    sensors.forEach(s => {
      const col = SENSOR_COLORS[s.type] || 0x94a3b8;
      g.add(mk(new THREE.BoxGeometry(2, 1.5, 2), { color: 0x1e293b }, s.x, s.y + 0.75, s.z));
      g.add(mk(new THREE.BoxGeometry(1.6, 1, 0.1), { color: col, transparent: true, opacity: 0.8 }, s.x, s.y + 0.75, s.z + 1.05));
      g.add(mk(new THREE.CylinderGeometry(0.15, 0.15, 8, 8), { color: 0x475569 }, s.x, s.y + 5.5, s.z));
      g.add(mk(new THREE.SphereGeometry(0.5, 8, 8), { color: col, emissive: col, emissiveIntensity: 0.8 }, s.x, s.y + 9.5, s.z));
      const ring = mk(new THREE.RingGeometry(2, 3.5, 32), { color: col, transparent: true, opacity: 0.3, side: THREE.DoubleSide }, s.x, s.y + 0.2, s.z);
      ring.rotation.x = -Math.PI / 2;
      g.add(ring);
      g.add(mk(new THREE.CylinderGeometry(1.2, 1.4, 0.4, 8), { color: 0x334155 }, s.x, s.y + 0.2, s.z));
    });
  }, [sensors]);

  // ── SCENARIO OBJECTS ──────────────────────────────────────────────
  useEffect(() => {
    const g = scenarioGroupRef.current; g.clear();
    scenarioObjects.forEach(obj => {
      const sc = obj.scale || 4;
      if (obj.type === "tree") { g.add(mk(new THREE.CylinderGeometry(0.5, 0.8, 5, 8), { color: 0x8B4513 }, obj.x, obj.y + 2.5, obj.z)); g.add(mk(new THREE.SphereGeometry(sc, 16, 16), { color: 0x22c55e, transparent: true, opacity: 0.9 }, obj.x, obj.y + 5 + sc, obj.z)); }
      else if (obj.type === "bush") { const b = mk(new THREE.SphereGeometry(sc * 0.6, 10, 10), { color: 0x16a34a }, obj.x, obj.y + sc * 0.4, obj.z); b.scale.y = 0.6; g.add(b); }
      else if (obj.type === "hedge") { g.add(mk(new THREE.BoxGeometry(sc, 4, 2), { color: 0x15803d }, obj.x, obj.y + 2, obj.z)); }
      else if (obj.type === "grass") { g.add(mk(new THREE.CylinderGeometry(sc, sc, 0.5, 32), { color: 0x4ade80, transparent: true, opacity: 0.8 }, obj.x, obj.y + 0.25, obj.z)); }
      else if (obj.type === "water") { g.add(mk(new THREE.CylinderGeometry(sc, sc, 1.5, 32), { color: 0x3b82f6, transparent: true, opacity: 0.6 }, obj.x, obj.y + 0.75, obj.z)); }
      else if (obj.type === "heatmap") { g.add(mk(new THREE.SphereGeometry(sc, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), { color: 0xef4444, transparent: true, opacity: 0.2, side: THREE.DoubleSide }, obj.x, obj.y, obj.z)); }
      else if (obj.type === "wind") { g.add(new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(obj.x, obj.y + 5, obj.z), sc, 0xf59e0b, 4, 3)); }
    });
  }, [scenarioObjects]);

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <div ref={mountRef} style={{ width: "100%", height: "100%" }} />
      {loading && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "#0f172a", flexDirection: "column", gap: 12 }}>
          <div style={{ width: 40, height: 40, border: "3px solid #334155", borderTop: "3px solid #3b82f6", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
          <p style={{ color: "#64748b", fontSize: 14 }}>{loadingText}</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}
      {placingMode && <div style={{ position: "absolute", bottom: 20, left: "50%", transform: "translateX(-50%)", background: "#059669", color: "white", padding: "8px 16px", borderRadius: 20, fontSize: 13, fontWeight: "bold", whiteSpace: "nowrap" }}>{placeText}</div>}
      {drawingZone && <div style={{ position: "absolute", bottom: 20, left: "50%", transform: "translateX(-50%)", background: "#7c3aed", color: "white", padding: "8px 16px", borderRadius: 20, fontSize: 13, fontWeight: "bold", whiteSpace: "nowrap" }}>{drawText}</div>}
      {sunConfig && (
        <div style={{ position: "absolute", bottom: 16, left: 16, background: "rgba(15,23,42,0.85)", border: "1px solid #f59e0b", borderRadius: 12, padding: "8px 14px", fontSize: 12, color: "white" }}>
          <p style={{ margin: 0, fontWeight: 700, color: "#fbbf24" }}>☀️ Sun simulation active</p>
          <p style={{ margin: "2px 0 0", color: "#94a3b8" }}>Hour: {sunConfig.hour}:00 · Month: {sunConfig.month}</p>
        </div>
      )}
      {rainMmPerDay > 0 && !extremeWeather?.type && (
        <div style={{ position: "absolute", bottom: sunConfig ? 90 : 16, left: 16, background: "rgba(15,23,42,0.85)", border: "1px solid #3b82f6", borderRadius: 12, padding: "8px 14px", fontSize: 12, color: "white" }}>
          <p style={{ margin: 0, fontWeight: 700, color: "#60a5fa" }}>🌧️ Rain simulation: {rainMmPerDay} mm/day</p>
          <p style={{ margin: "2px 0 0", color: "#94a3b8" }}>
            {rainMmPerDay < 5 ? "Light rain" : rainMmPerDay < 20 ? "Moderate rain" : rainMmPerDay < 50 ? "Heavy rain — runoff active" : "Extreme rainfall — flooding"}
          </p>
        </div>
      )}
      {extremeWeather?.type && (
        <div style={{ position: "absolute", bottom: 16, left: 16, background: "rgba(15,23,42,0.92)", border: "1px solid #ef4444", borderRadius: 12, padding: "8px 14px", fontSize: 12, color: "white" }}>
          <p style={{ margin: 0, fontWeight: 700, color: "#f87171" }}>
            {extremeWeather.type === "flood" && "🌊 Flash Flood"}{extremeWeather.type === "storm" && "⛈️ Heavy Storm"}{extremeWeather.type === "heatwave" && "🔥 Heatwave"}
          </p>
          <p style={{ margin: "2px 0 0", color: "#94a3b8" }}>Intensity: {extremeWeather.intensity}/10</p>
        </div>
      )}
    </div>
  );
});

export default ThreeViewer;
