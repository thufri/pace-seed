"use client";

import { useEffect, useState, useCallback, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";
import { T, type Lang } from "../lib/translations";
import ThreeViewer, {
  type Marker,
  type Zone,
  type Infrastructure,
  type SensorItem,
  type ScenarioObject,
  type ExtremeWeatherConfig,
  type SunConfig,
} from "../components/ThreeViewer";

type Twin = {
  id: string;
  name: string;
  description: string;
  model_url: string;
  latitude: number;
  longitude: number;
};

type Building = {
  id: string;
  twin_id: string;
  name: string;
  description: string;
  x: number;
  y: number;
  z: number;
};

type DataLayer = {
  id: string;
  building_id: string;
  twin_id: string;
  category: string;
  label: string;
  value: string;
  unit: string;
  recorded_at: string;
};

type Scenario = {
  id: string;
  twin_id: string;
  name: string;
  description: string;
};

type ScenarioLayer = {
  id: string;
  scenario_id: string;
  building_id: string;
  category: string;
  label: string;
  value: string;
  unit: string;
};

type LocationZone = {
  id: string;
  building_id: string;
  twin_id: string;
  name: string;
  category: string;
  color: string;
  vertices: { x: number; y: number; z: number }[];
};

type InfraItem = {
  id: string;
  twin_id: string;
  type: string;
  name: string;
  description: string;
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  depth: number;
  color: string;
};

type SensorDb = {
  id: string;
  twin_id: string;
  name: string;
  type: string;
  x: number;
  y: number;
  z: number;
  value?: number;
  unit?: string;
  description?: string;
};

const CATEGORIES = [
  { id: "stormwater", label: "🌧️ Stormwater & Surface Runoff", color: "3b82f6" },
  { id: "heatisland", label: "🌡️ Heat Island Effect & Impervious Surfaces", color: "ef4444" },
  { id: "ecology", label: "🌿 Ecological Connectivity & Green Structure", color: "22c55e" },
  { id: "accessibility", label: "🚶 Accessibility & Movement Patterns", color: "f59e0b" },
  { id: "social", label: "👥 Social Vulnerability Layers", color: "a855f7" },
] as const;

const VEG = [
  { id: "tree", label: "🌳 Trees" },
  { id: "bush", label: "🌿 Bushes" },
  { id: "hedge", label: "🌱 Hedges" },
  { id: "grass", label: "🟩 Grass" },
] as const;

const INFRA_TYPES = [
  { id: "building", label: "🏢 Building", color: "64748b" },
  { id: "road", label: "🛣️ Road", color: "374151" },
  { id: "park", label: "🌳 Park", color: "22c55e" },
  { id: "bridge", label: "🌉 Bridge", color: "9ca3af" },
  { id: "parking", label: "🅿️ Parking", color: "4b5563" },
] as const;

const inp: CSSProperties = {
  background: "#1e293b",
  color: "white",
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid #334155",
  width: "100%",
  boxSizing: "border-box",
};

const card: CSSProperties = {
  background: "#0f172a",
  borderRadius: 12,
  padding: 14,
  marginBottom: 12,
};

const btn = (bg = "#3b82f6"): CSSProperties => ({
  background: bg,
  color: "white",
  padding: "9px 14px",
  borderRadius: 8,
  border: "none",
  cursor: "pointer",
  fontWeight: "bold",
  width: "100%",
});

const sBtn = (bg = "#3b82f6"): CSSProperties => ({
  background: bg,
  color: "white",
  border: "none",
  borderRadius: 6,
  padding: "4px 10px",
  cursor: "pointer",
  fontSize: 13,
});

function getVuln(buildingId: string, layers: DataLayer[]) {
  const c = new Set(layers.filter(l => l.building_id === buildingId).map(l => l.category)).size;
  if (c === 0) return { score: 0, label: "vulnNone", color: "#475569", light: "⚫" };
  if (c <= 1) return { score: 20, label: "vulnLow", color: "#22c55e", light: "🟢" };
  if (c <= 3) return { score: 60, label: "vulnModerate", color: "#f59e0b", light: "🟡" };
  return { score: 90, label: "vulnHigh", color: "#ef4444", light: "🔴" };
}

function buildScenObjs(scenLayers: ScenarioLayer[], buildings: Building[]): ScenarioObject[] {
  const objs: ScenarioObject[] = [];

  scenLayers.forEach(sl => {
    const b = buildings.find(x => x.id === sl.building_id);
    if (!b) return;

    const val = parseFloat(sl.value) || 1;

    if (sl.category === "ecology") {
      const vt = sl.unit as "tree" | "bush" | "hedge" | "grass";
      for (let i = 0; i < Math.min(Math.max(1, Math.round(val / 30)), 25); i++) {
        objs.push({
          id: `veg-${sl.id}-${i}`,
          type: ["tree", "bush", "hedge", "grass"].includes(vt) ? vt : "tree",
          x: b.x + (Math.random() - 0.5) * 25,
          y: b.y,
          z: b.z + (Math.random() - 0.5) * 25,
          scale: vt === "tree" ? 3 + Math.random() * 2 : 2 + Math.random(),
        });
      }
    } else if (sl.category === "stormwater") {
      objs.push({
        id: `water-${sl.id}`,
        type: "water",
        x: b.x,
        y: b.y,
        z: b.z,
        scale: Math.min(5 + val * 0.3, 30),
      });
    } else if (sl.category === "heatisland") {
      objs.push({
        id: `heat-${sl.id}`,
        type: "heatmap",
        x: b.x,
        y: b.y,
        z: b.z,
        scale: Math.min(10 + val * 0.5, 40),
        intensity: val,
      });
    } else if (sl.category === "accessibility") {
      objs.push({
        id: `wind-${sl.id}`,
        type: "wind",
        x: b.x,
        y: b.y,
        z: b.z,
        scale: 5 + val * 0.2,
      });
    }
  });

  return objs;
}

export default function Platform() {
  const router = useRouter();
  const [lang, setLang] = useState<Lang>("en");
  const t = T[lang];

  const [tab, setTab] = useState(1);
  const [msg, setMsg] = useState("");
  const [placingMode, setPlacingMode] = useState(false);
  const [drawingZone, setDrawingZone] = useState(false);
  const [pendingLoc, setPendingLoc] = useState<{ x: number; y: number; z: number } | null>(null);
  const [zoneVertices, setZoneVertices] = useState<{ x: number; y: number; z: number }[]>([]);
  const [zoneName, setZoneName] = useState("");
  const [zoneCat, setZoneCat] = useState("stormwater");

  const [extremeType, setExtremeType] = useState<"flood" | "storm" | "heatwave" | null>(null);
  const [extremeIntensity, setExtremeIntensity] = useState(5);
  const [rainMmPerDay, setRainMmPerDay] = useState(0);
  const [rainInput, setRainInput] = useState("0");
  const [sunConfig, setSunConfig] = useState<SunConfig | null>(null);
  const [sunHour, setSunHour] = useState(12);
  const [sunMonth, setSunMonth] = useState(6);
  const [sunActive, setSunActive] = useState(false);

  const [twins, setTwins] = useState<Twin[]>([]);
  const [twin, setTwin] = useState<Twin | null>(null);
  const [showNewTwin, setShowNewTwin] = useState(false);
  const [twinName, setTwinName] = useState("");
  const [twinDesc, setTwinDesc] = useState("");
  const [twinFile, setTwinFile] = useState<File | null>(null);
  const [twinLat, setTwinLat] = useState("59.3293");
  const [twinLng, setTwinLng] = useState("18.0686");
  const [uploading, setUploading] = useState(false);

  const [buildings, setBuildings] = useState<Building[]>([]);
  const [locName, setLocName] = useState("");
  const [locDesc, setLocDesc] = useState("");

  const [zones, setZones] = useState<LocationZone[]>([]);
  const [infra, setInfra] = useState<InfraItem[]>([]);
  const [showNewInfra, setShowNewInfra] = useState(false);
  const [infraType, setInfraType] = useState("building");
  const [infraName, setInfraName] = useState("");
  const [infraDesc, setInfraDesc] = useState("");
  const [infraX, setInfraX] = useState("0");
  const [infraY, setInfraY] = useState("0");
  const [infraZ, setInfraZ] = useState("0");
  const [infraW, setInfraW] = useState("20");
  const [infraH, setInfraH] = useState("30");
  const [infraD, setInfraD] = useState("20");

  const [layers, setLayers] = useState<DataLayer[]>([]);
  const [dlLoc, setDlLoc] = useState("");
  const [dlCat, setDlCat] = useState("stormwater");
  const [dlLabel, setDlLabel] = useState("");
  const [dlVal, setDlVal] = useState("");
  const [dlUnit, setDlUnit] = useState("");

  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [scenLayers, setScenLayers] = useState<ScenarioLayer[]>([]);
  const [showNewScen, setShowNewScen] = useState(false);
  const [scenName, setScenName] = useState("");
  const [scenDesc, setScenDesc] = useState("");
  const [showScenLayer, setShowScenLayer] = useState(false);
  const [slLoc, setSlLoc] = useState("");
  const [slCat, setSlCat] = useState("ecology");
  const [slLabel, setSlLabel] = useState("");
  const [slVal, setSlVal] = useState("");
  const [slUnit, setSlUnit] = useState("tree");

  const [sensors, setSensors] = useState<SensorDb[]>([]);
  const [showNewSensor, setShowNewSensor] = useState(false);
  const [sensorName, setSensorName] = useState("");
  const [sensorType, setSensorType] = useState("temperature");
  const [sensorX, setSensorX] = useState("0");
  const [sensorY, setSensorY] = useState("0");
  const [sensorZ, setSensorZ] = useState("0");
  const [sensorValue, setSensorValue] = useState("");
  const [sensorUnit, setSensorUnit] = useState("");
  const [sensorDesc, setSensorDesc] = useState("");

  useEffect(() => {
    const stored = localStorage.getItem("pace-seed-lang");
    if (stored === "sv" || stored === "en") setLang(stored);
  }, []);

  useEffect(() => {
    loadTwins();
  }, []);

  useEffect(() => {
    if (!twin) return;
    loadBuildings(twin.id);
    loadLayers(twin.id);
    loadScenarios(twin.id);
    loadZones(twin.id);
    loadInfra(twin.id);
    loadSensors(twin.id);
  }, [twin]);

  useEffect(() => {
    if (scenario) loadScenLayers(scenario.id);
  }, [scenario]);

  useEffect(() => {
    setSunConfig(sunActive ? { hour: sunHour, month: sunMonth } : null);
  }, [sunActive, sunHour, sunMonth]);

  const loadTwins = async () => {
    const { data, error } = await supabase.from("twins").select("*");
    if (error) {
      notify("⚠️ " + error.message);
      return;
    }
    const items = (data || []) as Twin[];
    setTwins(items);
    setTwin(prev => {
      if (items.length === 0) return null;
      if (prev) return items.find(x => x.id === prev.id) || items[0];
      return items[0];
    });
  };

  const loadBuildings = async (tid: string) => {
    const { data } = await supabase.from("buildings").select("*").eq("twin_id", tid);
    setBuildings((data || []) as Building[]);
  };

  const loadLayers = async (tid: string) => {
    const { data } = await supabase.from("data_layers").select("*").eq("twin_id", tid);
    setLayers((data || []) as DataLayer[]);
  };

  const loadScenarios = async (tid: string) => {
    const { data } = await supabase.from("scenarios").select("*").eq("twin_id", tid);
    const items = (data || []) as Scenario[];
    setScenarios(items);
    setScenario(prev => {
      if (items.length === 0) return null;
      if (prev) return items.find(x => x.id === prev.id) || items[0];
      return items[0];
    });
  };

  const loadScenLayers = async (sid: string) => {
    const { data } = await supabase.from("scenario_layers").select("*").eq("scenario_id", sid);
    setScenLayers((data || []) as ScenarioLayer[]);
  };

  const loadZones = async (tid: string) => {
    const { data } = await supabase.from("location_zones").select("*").eq("twin_id", tid);
    setZones((data || []) as LocationZone[]);
  };

  const loadInfra = async (tid: string) => {
    const { data } = await supabase.from("infrastructure").select("*").eq("twin_id", tid);
    setInfra((data || []) as InfraItem[]);
  };

  const loadSensors = async (tid: string) => {
    const { data } = await supabase.from("sensors").select("*").eq("twin_id", tid);
    setSensors((data || []) as SensorDb[]);
  };

  const notify = (m: string) => {
    setMsg(m);
    setTimeout(() => setMsg(""), 3000);
  };

  const saveTwin = async () => {
    if (!twinName || !twinFile) {
      notify("⚠️ Enter a name and select a .glb file!");
      return;
    }

    setUploading(true);

    const fileName = `${Date.now()}-${twinFile.name.replace(/\s/g, "_")}`;
    const { data: up, error: upErr } = await supabase.storage.from("models").upload(fileName, twinFile);
    if (upErr) {
      notify("⚠️ Upload failed: " + upErr.message);
      setUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage.from("models").getPublicUrl(up.path);
    const { error } = await supabase.from("twins").insert({
      name: twinName,
      description: twinDesc,
      model_url: urlData.publicUrl,
      latitude: parseFloat(twinLat) || 59.3293,
      longitude: parseFloat(twinLng) || 18.0686,
    });

    if (!error) {
      notify("✅ Twin added!");
      setTwinName("");
      setTwinDesc("");
      setTwinFile(null);
      setShowNewTwin(false);
      loadTwins();
    }

    setUploading(false);
  };

  const deleteTwin = async (id: string) => {
    await supabase.from("twins").delete().eq("id", id);
    notify("🗑️");
    setTwin(null);
    loadTwins();
  };

  const handlePlaceMarker = useCallback((x: number, y: number, z: number) => {
    setPendingLoc({ x, y, z });
    setPlacingMode(false);
    setTab(1);
    notify("📍 Position set!");
  }, []);

  const handleAddZoneVertex = useCallback((x: number, y: number, z: number) => {
    setZoneVertices(prev => {
      notify(`📐 Point ${prev.length + 1} added`);
      return [...prev, { x, y, z }];
    });
  }, []);

  const saveLoc = async () => {
    if (!twin || !locName) {
      notify("⚠️ Enter a name!");
      return;
    }

    const coords = pendingLoc || { x: 0, y: 0, z: 0 };
    const { error } = await supabase.from("buildings").insert({
      twin_id: twin.id,
      name: locName,
      description: locDesc,
      ...coords,
    });

    if (!error) {
      notify("✅ Location added!");
      setLocName("");
      setLocDesc("");
      setPendingLoc(null);
      loadBuildings(twin.id);
    }
  };

  const deleteLoc = async (id: string) => {
    if (!twin) return;
    await supabase.from("buildings").delete().eq("id", id);
    notify("🗑️");
    loadBuildings(twin.id);
  };

  const finishZone = async () => {
    if (!twin || !zoneName || zoneVertices.length < 3) {
      notify(t.needPoints);
      return;
    }

    const cat = CATEGORIES.find(c => c.id === zoneCat);
    const { error } = await supabase.from("location_zones").insert({
      twin_id: twin.id,
      building_id: null,
      name: zoneName,
      category: zoneCat,
      color: cat?.color || "3b82f6",
      vertices: zoneVertices,
    });

    if (!error) {
      notify("✅ Zone saved!");
      setZoneName("");
      setZoneVertices([]);
      setDrawingZone(false);
      loadZones(twin.id);
    }
  };

  const deleteZone = async (id: string) => {
    if (!twin) return;
    await supabase.from("location_zones").delete().eq("id", id);
    notify("🗑️");
    loadZones(twin.id);
  };

  const saveInfra = async () => {
    if (!twin || !infraName) {
      notify("⚠️ Enter a name!");
      return;
    }

    const it = INFRA_TYPES.find(i => i.id === infraType);
    const { error } = await supabase.from("infrastructure").insert({
      twin_id: twin.id,
      type: infraType,
      name: infraName,
      description: infraDesc,
      x: parseFloat(infraX) || 0,
      y: parseFloat(infraY) || 0,
      z: parseFloat(infraZ) || 0,
      width: parseFloat(infraW) || 20,
      height: parseFloat(infraH) || 30,
      depth: parseFloat(infraD) || 20,
      color: it?.color || "64748b",
    });

    if (!error) {
      notify("✅ Added!");
      setInfraName("");
      setInfraDesc("");
      setShowNewInfra(false);
      loadInfra(twin.id);
    }
  };

  const deleteInfra = async (id: string) => {
    if (!twin) return;
    await supabase.from("infrastructure").delete().eq("id", id);
    notify("🗑️");
    loadInfra(twin.id);
  };

  const saveLayer = async () => {
    if (!dlLoc || !dlLabel || !dlVal) {
      notify("⚠️ Fill in all fields!");
      return;
    }

    const { error } = await supabase.from("data_layers").insert({
      building_id: dlLoc,
      twin_id: twin?.id,
      category: dlCat,
      label: dlLabel,
      value: dlVal,
      unit: dlUnit,
    });

    if (!error && twin) {
      notify("✅ Data layer added!");
      setDlLabel("");
      setDlVal("");
      setDlUnit("");
      loadLayers(twin.id);
    }
  };

  const deleteLayer = async (id: string) => {
    if (!twin) return;
    await supabase.from("data_layers").delete().eq("id", id);
    notify("🗑️");
    loadLayers(twin.id);
  };

  const saveScenario = async () => {
    if (!twin || !scenName) {
      notify("⚠️ Enter a name!");
      return;
    }

    const { error } = await supabase.from("scenarios").insert({
      twin_id: twin.id,
      name: scenName,
      description: scenDesc,
    });

    if (!error) {
      notify("✅ Scenario created!");
      setScenName("");
      setScenDesc("");
      setShowNewScen(false);
      loadScenarios(twin.id);
    }
  };

  const deleteScenario = async (id: string) => {
    if (!twin) return;
    await supabase.from("scenarios").delete().eq("id", id);
    notify("🗑️");
    setScenario(null);
    loadScenarios(twin.id);
  };

  const saveScenLayer = async () => {
    if (!scenario || !slLoc || !slLabel || !slVal) {
      notify("⚠️ Fill in all fields!");
      return;
    }

    const { error } = await supabase.from("scenario_layers").insert({
      scenario_id: scenario.id,
      building_id: slLoc,
      category: slCat,
      label: slLabel,
      value: slVal,
      unit: slUnit,
    });

    if (!error) {
      notify("✅ Added!");
      setSlLabel("");
      setSlVal("");
      setSlUnit("tree");
      loadScenLayers(scenario.id);
    }
  };

  const deleteScenLayer = async (id: string) => {
    if (!scenario) return;
    await supabase.from("scenario_layers").delete().eq("id", id);
    loadScenLayers(scenario.id);
  };

  const saveSensor = async () => {
    if (!twin || !sensorName) {
      notify("⚠️ Enter a name!");
      return;
    }

    const { error } = await supabase.from("sensors").insert({
      twin_id: twin.id,
      name: sensorName,
      type: sensorType,
      x: parseFloat(sensorX) || 0,
      y: parseFloat(sensorY) || 0,
      z: parseFloat(sensorZ) || 0,
      value: sensorValue ? parseFloat(sensorValue) : null,
      unit: sensorUnit,
      description: sensorDesc,
    });

    if (!error) {
      notify("✅ Sensor added!");
      setSensorName("");
      setSensorValue("");
      setSensorUnit("");
      setSensorDesc("");
      setShowNewSensor(false);
      loadSensors(twin.id);
    }
  };

  const deleteSensor = async (id: string) => {
    if (!twin) return;
    await supabase.from("sensors").delete().eq("id", id);
    notify("🗑️");
    loadSensors(twin.id);
  };

  const exportJSON = () => {
    if (!twin) return;
    const data = {
      twin,
      buildings,
      layers,
      zones,
      infra,
      sensors,
      scenarios,
      scenLayers,
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${twin.name.replace(/\s/g, "_")}_export.json`;
    a.click();
    notify("✅ JSON exported!");
  };

  const exportCSV = () => {
    if (!twin || layers.length === 0) {
      notify("⚠️ No data to export");
      return;
    }

    const header = "location,category,label,value,unit,recorded_at";
    const rows = layers.map(l => {
      const loc = buildings.find(b => b.id === l.building_id);
      return `"${loc?.name || ""}","${l.category}","${l.label}","${l.value}","${l.unit}","${l.recorded_at || ""}"`;
    });

    const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${twin.name.replace(/\s/g, "_")}_data.csv`;
    a.click();
    notify("✅ CSV exported!");
  };

  const markers: Marker[] = buildings.flatMap(b => {
    const bl = layers.filter(l => l.building_id === b.id);
    if (bl.length === 0) return [{ id: b.id, name: b.name, x: b.x, y: b.y, z: b.z }];
    return bl.map((l, i) => ({
      id: `${b.id}-${l.id}`,
      name: b.name,
      x: b.x + (i % 2) * 8,
      y: b.y,
      z: b.z + Math.floor(i / 2) * 8,
      category: l.category,
      value: l.value,
      unit: l.unit,
    }));
  });

  const threeZones: Zone[] = zones.map(z => ({
    id: z.id,
    name: z.name,
    category: z.category,
    color: z.color,
    vertices: z.vertices,
  }));

  const threeInfra: Infrastructure[] = infra.map(i => ({
    id: i.id,
    type: i.type,
    name: i.name,
    x: i.x,
    y: i.y,
    z: i.z,
    width: i.width,
    height: i.height,
    depth: i.depth,
    color: i.color,
  }));

  const threeSensors: SensorItem[] = sensors.map(s => ({
    id: s.id,
    name: s.name,
    type: s.type,
    x: s.x,
    y: s.y,
    z: s.z,
    value: s.value,
    unit: s.unit,
  }));

  const scenarioObjects = scenario ? buildScenObjs(scenLayers, buildings) : [];
  const extremeWeatherConfig: ExtremeWeatherConfig | null = extremeType
    ? { type: extremeType, intensity: extremeIntensity }
    : null;

  const intensityColor =
    extremeIntensity <= 3 ? "#059669" : extremeIntensity <= 6 ? "#d97706" : "#dc2626";

  const getExtremeDesc = () => {
    const descs =
      extremeType === "flood"
        ? t.floodDesc
        : extremeType === "storm"
          ? t.stormDesc
          : t.heatDesc;

    if (!descs) return "";
    const idx = extremeIntensity <= 3 ? 0 : extremeIntensity <= 6 ? 1 : extremeIntensity <= 8 ? 2 : 3;
    return descs[idx];
  };

  const TABS = [t.twins, t.locations, t.data, t.scenarios, t.infra, t.weather, t.sensors];

  return (
    <main
      style={{
        display: "flex",
        height: "100vh",
        background: "#0f172a",
        color: "white",
        overflow: "hidden",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <div style={{ flex: 1, position: "relative" }}>
        <div style={{ position: "absolute", top: 16, left: 16, zIndex: 10 }}>
          <div
            style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}
            onClick={() => router.push("/")}
          >
            <span style={{ fontSize: 20 }}>🏙️</span>
            <span
              style={{
                fontSize: 18,
                fontWeight: 800,
                letterSpacing: 2,
                textShadow: "0 2px 8px rgba(0,0,0,0.9)",
              }}
            >
              PACE-SEED
            </span>
          </div>
          {twin && <p style={{ margin: "4px 0 0", color: "#94a3b8", fontSize: 13 }}>{twin.name}</p>}
        </div>

        <div
          style={{
            position: "absolute",
            top: 16,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 10,
            display: "flex",
            gap: 6,
          }}
        >
          {(["en", "sv"] as Lang[]).map(l => (
            <button
              key={l}
              onClick={() => {
                setLang(l);
                localStorage.setItem("pace-seed-lang", l);
              }}
              style={{
                background: lang === l ? "#1e293b" : "transparent",
                color: lang === l ? "white" : "#64748b",
                border: `1px solid ${lang === l ? "#3b82f6" : "#334155"}`,
                borderRadius: 6,
                padding: "4px 10px",
                cursor: "pointer",
                fontSize: 11,
              }}
            >
              {l === "en" ? "🇬🇧" : "🇸🇪"}
            </button>
          ))}
        </div>

        {twin && (
          <div
            style={{
              position: "absolute",
              top: 16,
              right: 16,
              zIndex: 10,
              display: "flex",
              gap: 8,
            }}
          >
            <button
              onClick={() => {
                setPlacingMode(!placingMode);
                setDrawingZone(false);
              }}
              style={{
                background: placingMode ? "#059669" : "#1e293b",
                color: "white",
                border: "1px solid #334155",
                borderRadius: 8,
                padding: "7px 12px",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: "bold",
              }}
            >
              {placingMode ? t.clickToPlace : t.placeLocation}
            </button>

            <button
              onClick={() => {
                setDrawingZone(!drawingZone);
                setPlacingMode(false);
                if (!drawingZone) setZoneVertices([]);
              }}
              style={{
                background: drawingZone ? "#7c3aed" : "#1e293b",
                color: "white",
                border: "1px solid #334155",
                borderRadius: 8,
                padding: "7px 12px",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: "bold",
              }}
            >
              {drawingZone ? t.drawingZone : t.drawZone}
            </button>
          </div>
        )}

        {twin ? (
          <ThreeViewer
            modelUrl={twin.model_url}
            markers={markers}
            zones={threeZones}
            infrastructure={threeInfra}
            sensors={threeSensors}
            scenarioObjects={scenarioObjects}
            placingMode={placingMode}
            drawingZone={drawingZone}
            onPlaceMarker={handlePlaceMarker}
            onAddZoneVertex={handleAddZoneVertex}
            extremeWeather={extremeWeatherConfig}
            rainMmPerDay={rainMmPerDay}
            sunConfig={sunConfig}
            loadingText={t.loading}
            placeText={t.placeOnModel}
            drawText={t.drawOnModel}
          />
        ) : (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              flexDirection: "column",
              gap: 12,
              color: "#475569",
            }}
          >
            <p style={{ fontSize: 64, margin: 0 }}>🏙️</p>
            <p style={{ fontSize: 18 }}>{t.noTwins}</p>
          </div>
        )}
      </div>

      <div
        style={{
          width: 430,
          background: "#111827",
          borderLeft: "1px solid #1e293b",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
            gap: 6,
            padding: 12,
            borderBottom: "1px solid #1e293b",
            background: "#0b1220",
          }}
        >
          {TABS.map((label, i) => (
            <button
              key={`tab-${i}`}
              onClick={() => setTab(i)}
              style={{
                background: tab === i ? "#2563eb" : "#111827",
                color: "white",
                border: "1px solid #334155",
                borderRadius: 10,
                minHeight: 60,
                cursor: "pointer",
                fontSize: 11,
                fontWeight: 700,
                padding: 6,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 4,
              }}
            >
              <span style={{ fontSize: 16 }}>{["🌐", "📍", "📊", "🔬", "🏗️", "🌦️", "📡"][i]}</span>
              <span style={{ lineHeight: 1.1, textAlign: "center" }}>{label}</span>
            </button>
          ))}
        </div>

        {msg && (
          <div
            style={{
              padding: "10px 14px",
              borderBottom: "1px solid #1e293b",
              background: "#13233f",
              color: "#7dd3fc",
              fontSize: 12,
            }}
          >
            {msg}
          </div>
        )}

        <div style={{ flex: 1, overflowY: "auto", padding: 14 }}>
          {tab === 0 && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <h2 style={{ margin: 0, fontSize: 15 }}>🌐 {t.twins}</h2>
                <button onClick={() => setShowNewTwin(!showNewTwin)} style={sBtn(showNewTwin ? "#475569" : "#3b82f6")}>
                  {showNewTwin ? t.cancel : t.newTwin}
                </button>
              </div>

              {showNewTwin && (
                <div style={{ ...card, display: "flex", flexDirection: "column", gap: 8 }}>
                  <input
                    type="text"
                    placeholder={lang === "sv" ? "Tvillingnamn" : "Twin name"}
                    style={inp}
                    value={twinName}
                    onChange={e => setTwinName(e.target.value)}
                  />
                  <input
                    type="text"
                    placeholder={t.description}
                    style={inp}
                    value={twinDesc}
                    onChange={e => setTwinDesc(e.target.value)}
                  />
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      type="text"
                      placeholder={t.latitude}
                      style={{ ...inp, width: "50%" }}
                      value={twinLat}
                      onChange={e => setTwinLat(e.target.value)}
                    />
                    <input
                      type="text"
                      placeholder={t.longitude}
                      style={{ ...inp, width: "50%" }}
                      value={twinLng}
                      onChange={e => setTwinLng(e.target.value)}
                    />
                  </div>
                  <input
                    type="file"
                    accept=".glb"
                    onChange={e => setTwinFile(e.target.files?.[0] || null)}
                    style={{ color: "#cbd5e1", fontSize: 12 }}
                  />
                  <button onClick={saveTwin} style={btn("#3b82f6")}>
                    {uploading ? t.uploading : t.save}
                  </button>
                </div>
              )}

              {twins.map(tw => (
                <div
                  key={tw.id}
                  style={{
                    ...card,
                    border: tw.id === twin?.id ? "1px solid #3b82f6" : "1px solid transparent",
                    cursor: "pointer",
                  }}
                  onClick={() => setTwin(tw)}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <p style={{ margin: 0, fontWeight: 700, fontSize: 14 }}>{tw.name}</p>
                      {tw.description && (
                        <p style={{ margin: "4px 0 0", color: "#94a3b8", fontSize: 12 }}>{tw.description}</p>
                      )}
                      <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 11 }}>
                        {tw.latitude}, {tw.longitude}
                      </p>
                    </div>
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        deleteTwin(tw.id);
                      }}
                      style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer" }}
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))}

              {twin && (
                <div style={card}>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={exportJSON} style={btn("#0891b2")}>{t.exportJson}</button>
                    <button onClick={exportCSV} style={btn("#10b981")}>{t.exportCsv}</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 1 && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <h2 style={{ margin: 0, fontSize: 15 }}>📍 {t.locations}</h2>
              </div>

              {pendingLoc && (
                <div style={{ ...card, display: "flex", flexDirection: "column", gap: 8 }}>
                  <p style={{ margin: 0, fontSize: 12, color: "#10b981", fontWeight: 600 }}>{t.positionSet}</p>
                  <input
                    type="text"
                    placeholder={t.locationName}
                    style={inp}
                    value={locName}
                    onChange={e => setLocName(e.target.value)}
                  />
                  <input
                    type="text"
                    placeholder={t.description}
                    style={inp}
                    value={locDesc}
                    onChange={e => setLocDesc(e.target.value)}
                  />
                  <button onClick={saveLoc} style={btn("#10b981")}>{t.save}</button>
                </div>
              )}

              {drawingZone && (
                <div style={{ ...card, display: "flex", flexDirection: "column", gap: 8 }}>
                  <input
                    type="text"
                    placeholder={lang === "sv" ? "Zonnamn" : "Zone name"}
                    style={inp}
                    value={zoneName}
                    onChange={e => setZoneName(e.target.value)}
                  />
                  <select style={inp} value={zoneCat} onChange={e => setZoneCat(e.target.value)}>
                    {CATEGORIES.map(c => (
                      <option key={c.id} value={c.id}>{c.label}</option>
                    ))}
                  </select>
                  <p style={{ margin: 0, fontSize: 11, color: "#64748b" }}>
                    {zoneVertices.length} {t.zonePoints}
                  </p>
                  <button onClick={finishZone} style={btn("#7c3aed")}>{t.finishZone}</button>
                </div>
              )}

              {buildings.map(b => {
                const vuln = getVuln(b.id, layers);
                return (
                  <div key={b.id} style={card}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        <p style={{ margin: 0, fontWeight: 700, fontSize: 14 }}>📍 {b.name}</p>
                        {b.description && (
                          <p style={{ margin: "2px 0", fontSize: 11, color: "#94a3b8" }}>{b.description}</p>
                        )}
                        <p style={{ margin: "2px 0", fontSize: 11, color: "#64748b" }}>
                          {b.x}, {b.y}, {b.z}
                        </p>
                      </div>
                      <button
                        onClick={() => deleteLoc(b.id)}
                        style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer" }}
                      >
                        🗑️
                      </button>
                    </div>

                    <div
                      style={{
                        marginTop: 10,
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 10,
                      }}
                    >
                      <div
                        style={{
                          flex: 1,
                          background: "#111827",
                          borderRadius: 8,
                          padding: "8px 10px",
                        }}
                      >
                        <p style={{ margin: 0, fontSize: 11, color: "#64748b" }}>{t.vulnerability}</p>
                        <p style={{ margin: "4px 0 0", fontSize: 14, color: vuln.color, fontWeight: 700 }}>
                          {vuln.light} {t[vuln.label]}
                        </p>
                      </div>

                      <div
                        style={{
                          flex: 1,
                          background: "#111827",
                          borderRadius: 8,
                          padding: "8px 10px",
                        }}
                      >
                        <p style={{ margin: 0, fontSize: 11, color: "#64748b" }}>{t.dataCoverage}</p>
                        <p style={{ margin: "4px 0 0", fontSize: 14, color: "#e2e8f0", fontWeight: 700 }}>
                          {new Set(layers.filter(l => l.building_id === b.id).map(l => l.category)).size}/5
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}

              {zones.map(z => (
                <div key={z.id} style={card}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <p style={{ margin: 0, fontWeight: 700, fontSize: 14 }}>📐 {z.name}</p>
                      <p style={{ margin: "2px 0 0", fontSize: 11, color: "#64748b" }}>
                        {z.category} · {z.vertices.length} pts
                      </p>
                    </div>
                    <button
                      onClick={() => deleteZone(z.id)}
                      style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer" }}
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))}

              {buildings.length === 0 && !pendingLoc && !drawingZone && (
                <p style={{ color: "#64748b", fontSize: 13 }}>{t.noLocations}</p>
              )}
            </div>
          )}

          {tab === 2 && (
            <div>
              <h2 style={{ margin: "0 0 12px", fontSize: 15 }}>📊 {t.data}</h2>

              <div style={{ ...card, display: "flex", flexDirection: "column", gap: 8 }}>
                <select style={inp} value={dlLoc} onChange={e => setDlLoc(e.target.value)}>
                  <option value="">{t.selectLocation}</option>
                  {buildings.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>

                <select style={inp} value={dlCat} onChange={e => setDlCat(e.target.value)}>
                  {CATEGORIES.map(c => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>

                <input type="text" placeholder={t.label} style={inp} value={dlLabel} onChange={e => setDlLabel(e.target.value)} />
                <div style={{ display: "flex", gap: 8 }}>
                  <input type="text" placeholder={t.value} style={{ ...inp, width: "50%" }} value={dlVal} onChange={e => setDlVal(e.target.value)} />
                  <input type="text" placeholder={t.unit} style={{ ...inp, width: "50%" }} value={dlUnit} onChange={e => setDlUnit(e.target.value)} />
                </div>

                <button onClick={saveLayer} style={btn("#10b981")}>{t.addLayer}</button>
              </div>

              {layers.map(l => {
                const loc = buildings.find(b => b.id === l.building_id);
                const cat = CATEGORIES.find(c => c.id === l.category);
                return (
                  <div key={l.id} style={card}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        <p style={{ margin: 0, fontWeight: 700, fontSize: 14 }}>
                          {cat?.label.split(" ")[0]} {l.label}
                        </p>
                        <p style={{ margin: "2px 0", fontSize: 11, color: "#64748b" }}>
                          {loc?.name || "—"} · {l.category}
                        </p>
                        <p style={{ margin: 0, fontSize: 14, color: "#e2e8f0", fontWeight: 700 }}>
                          {l.value} {l.unit}
                        </p>
                      </div>
                      <button
                        onClick={() => deleteLayer(l.id)}
                        style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer" }}
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                );
              })}

              {layers.length === 0 && <p style={{ color: "#64748b", fontSize: 13 }}>{t.noData}</p>}
            </div>
          )}

          {tab === 3 && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <h2 style={{ margin: 0, fontSize: 15 }}>🔬 {t.scenarios}</h2>
                <button onClick={() => setShowNewScen(!showNewScen)} style={sBtn(showNewScen ? "#475569" : "#7c3aed")}>
                  {showNewScen ? t.cancel : t.newScen}
                </button>
              </div>

              {showNewScen && (
                <div style={{ ...card, display: "flex", flexDirection: "column", gap: 8 }}>
                  <input type="text" placeholder={lang === "sv" ? "Scenarionamn" : "Scenario name"} style={inp} value={scenName} onChange={e => setScenName(e.target.value)} />
                  <input type="text" placeholder={t.description} style={inp} value={scenDesc} onChange={e => setScenDesc(e.target.value)} />
                  <button onClick={saveScenario} style={btn("#7c3aed")}>{t.save}</button>
                </div>
              )}

              {scenarios.map(sc => (
                <div
                  key={sc.id}
                  style={{
                    ...card,
                    border: sc.id === scenario?.id ? "1px solid #7c3aed" : "1px solid transparent",
                    cursor: "pointer",
                  }}
                  onClick={() => setScenario(sc)}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <p style={{ margin: 0, fontWeight: 700, fontSize: 14 }}>{sc.name}</p>
                      {sc.description && (
                        <p style={{ margin: "2px 0", fontSize: 11, color: "#94a3b8" }}>{sc.description}</p>
                      )}
                    </div>
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        deleteScenario(sc.id);
                      }}
                      style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer" }}
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))}

              {scenario && (
                <div style={card}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <p style={{ margin: 0, fontWeight: 700 }}>{scenario.name}</p>
                    <button onClick={() => setShowScenLayer(!showScenLayer)} style={sBtn(showScenLayer ? "#475569" : "#10b981")}>
                      {showScenLayer ? t.cancel : t.addToScen}
                    </button>
                  </div>

                  {showScenLayer && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
                      <select style={inp} value={slLoc} onChange={e => setSlLoc(e.target.value)}>
                        <option value="">{t.selectLocation}</option>
                        {buildings.map(b => (
                          <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                      </select>

                      <select style={inp} value={slCat} onChange={e => setSlCat(e.target.value)}>
                        {CATEGORIES.map(c => (
                          <option key={c.id} value={c.id}>{c.label}</option>
                        ))}
                      </select>

                      <input type="text" placeholder={t.label} style={inp} value={slLabel} onChange={e => setSlLabel(e.target.value)} />
                      <input type="text" placeholder={t.value} style={inp} value={slVal} onChange={e => setSlVal(e.target.value)} />

                      {slCat === "ecology" ? (
                        <select style={inp} value={slUnit} onChange={e => setSlUnit(e.target.value)}>
                          {VEG.map(v => (
                            <option key={v.id} value={v.id}>{v.label}</option>
                          ))}
                        </select>
                      ) : (
                        <input type="text" placeholder={t.unit} style={inp} value={slUnit} onChange={e => setSlUnit(e.target.value)} />
                      )}

                      <button onClick={saveScenLayer} style={btn("#10b981")}>{t.addToScen}</button>
                    </div>
                  )}

                  {scenLayers.map(sl => {
                    const loc = buildings.find(b => b.id === sl.building_id);
                    const current = layers.find(l => l.building_id === sl.building_id && l.category === sl.category);
                    return (
                      <div key={sl.id} style={{ ...card, marginBottom: 10, background: "#111827" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                          <div>
                            <p style={{ margin: 0, fontWeight: 700, fontSize: 14 }}>{sl.label}</p>
                            <p style={{ margin: "2px 0", fontSize: 11, color: "#64748b" }}>{loc?.name || "—"}</p>
                          </div>
                          <button
                            onClick={() => deleteScenLayer(sl.id)}
                            style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer" }}
                          >
                            🗑️
                          </button>
                        </div>

                        <div style={{ display: "flex", gap: 8 }}>
                          <div style={{ flex: 1, background: "#0f172a", borderRadius: 6, padding: "6px 8px" }}>
                            <p style={{ margin: 0, fontSize: 11, color: "#64748b" }}>{t.current}</p>
                            <p style={{ margin: 0, fontSize: 13, color: "#e2e8f0", fontWeight: 600 }}>
                              {current ? `${current.value} ${current.unit}` : "No data"}
                            </p>
                          </div>
                          <div style={{ flex: 1, background: "#1a0f3a", borderRadius: 6, padding: "6px 8px" }}>
                            <p style={{ margin: 0, fontSize: 11, color: "#7c3aed" }}>{t.scenario}</p>
                            <p style={{ margin: 0, fontSize: 13, color: "#c4b5fd", fontWeight: 600 }}>
                              {sl.value} {sl.unit}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {scenLayers.length === 0 && !showScenLayer && (
                    <p style={{ color: "#64748b", fontSize: 13 }}>No data added yet.</p>
                  )}
                </div>
              )}

              {scenarios.length === 0 && !showNewScen && (
                <p style={{ color: "#64748b", fontSize: 13 }}>{t.noScenarios}</p>
              )}
            </div>
          )}

          {tab === 4 && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <h2 style={{ margin: 0, fontSize: 15 }}>🏗️ {t.infra}</h2>
                <button onClick={() => setShowNewInfra(!showNewInfra)} style={sBtn(showNewInfra ? "#475569" : "#0891b2")}>
                  {showNewInfra ? t.cancel : t.newInfra}
                </button>
              </div>

              {showNewInfra && (
                <div style={{ ...card, display: "flex", flexDirection: "column", gap: 8 }}>
                  <select style={inp} value={infraType} onChange={e => setInfraType(e.target.value)}>
                    {INFRA_TYPES.map(i => (
                      <option key={i.id} value={i.id}>{i.label}</option>
                    ))}
                  </select>

                  <input type="text" placeholder={t.infraName} style={inp} value={infraName} onChange={e => setInfraName(e.target.value)} />
                  <input type="text" placeholder={t.description} style={inp} value={infraDesc} onChange={e => setInfraDesc(e.target.value)} />

                  <p style={{ margin: 0, fontSize: 11, color: "#64748b" }}>{t.position}:</p>
                  <div style={{ display: "flex", gap: 6 }}>
                    {([["X", infraX, setInfraX], ["Y", infraY, setInfraY], ["Z", infraZ, setInfraZ]] as [string, string, (v: string) => void][]).map(([label, val, set]) => (
                      <input key={label} type="text" placeholder={label} style={{ ...inp, width: "33%" }} value={val} onChange={e => set(e.target.value)} />
                    ))}
                  </div>

                  <p style={{ margin: 0, fontSize: 11, color: "#64748b" }}>{t.size}:</p>
                  <div style={{ display: "flex", gap: 6 }}>
                    {([["W", infraW, setInfraW], ["H", infraH, setInfraH], ["D", infraD, setInfraD]] as [string, string, (v: string) => void][]).map(([label, val, set]) => (
                      <input key={label} type="text" placeholder={label} style={{ ...inp, width: "33%" }} value={val} onChange={e => set(e.target.value)} />
                    ))}
                  </div>

                  <button onClick={saveInfra} style={btn("#0891b2")}>{t.addToScene}</button>
                </div>
              )}

              {infra.map(i => {
                const it = INFRA_TYPES.find(x => x.id === i.type);
                return (
                  <div key={i.id} style={{ ...card, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <p style={{ margin: 0, fontWeight: 600, fontSize: 14 }}>
                        {it?.label.split(" ")[0]} {i.name}
                      </p>
                      <p style={{ margin: "2px 0 0", fontSize: 11, color: "#64748b" }}>
                        {i.x},{i.y},{i.z} · {i.width}×{i.height}×{i.depth}
                      </p>
                    </div>
                    <button
                      onClick={() => deleteInfra(i.id)}
                      style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer" }}
                    >
                      🗑️
                    </button>
                  </div>
                );
              })}

              {infra.length === 0 && !showNewInfra && (
                <p style={{ color: "#64748b", fontSize: 13 }}>{t.noInfra}</p>
              )}
            </div>
          )}

          {tab === 5 && (
            <div>
              <h2 style={{ margin: "0 0 12px", fontSize: 15 }}>🌦️ {t.weather}</h2>

              <div style={card}>
                <p style={{ margin: "0 0 8px", fontWeight: 700, fontSize: 14 }}>{t.rainSim}</p>
                <p style={{ margin: "0 0 10px", fontSize: 12, color: "#94a3b8" }}>{t.rainDesc}</p>

                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
                  <input
                    type="number"
                    min={0}
                    max={300}
                    placeholder={t.rainInput}
                    style={{ ...inp, width: "70%" }}
                    value={rainInput}
                    onChange={e => setRainInput(e.target.value)}
                  />
                  <button onClick={() => setRainMmPerDay(parseFloat(rainInput) || 0)} style={sBtn("#3b82f6")}>
                    Apply
                  </button>
                </div>

                <input
                  type="range"
                  min={0}
                  max={150}
                  step={1}
                  value={rainMmPerDay}
                  onChange={e => {
                    setRainMmPerDay(parseInt(e.target.value));
                    setRainInput(e.target.value);
                  }}
                  style={{ width: "100%", accentColor: "#3b82f6", marginBottom: 6 }}
                />

                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#475569", marginBottom: 8 }}>
                  <span>0</span>
                  <span>150 {t.rainInput}</span>
                </div>

                <div style={{ fontSize: 12, color: "#94a3b8" }}>
                  {t.rainLevels[Math.min(Math.floor(rainMmPerDay / 30), t.rainLevels.length - 1)]}
                </div>
              </div>

              <div style={card}>
                <p style={{ margin: "0 0 8px", fontWeight: 700, fontSize: 14 }}>{t.sunShadow}</p>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <button
                    onClick={() => setSunActive(!sunActive)}
                    style={sBtn(sunActive ? "#f59e0b" : "#475569")}
                  >
                    {sunActive ? t.on : t.off}
                  </button>
                  <span style={{ fontSize: 12, color: "#94a3b8" }}>
                    {sunActive ? t.sunActive : ""}
                  </span>
                </div>

                {sunActive && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div>
                      <p style={{ margin: "0 0 4px", fontSize: 11, color: "#64748b" }}>
                        {t.hour}: {sunHour}:00
                      </p>
                      <input
                        type="range"
                        min={0}
                        max={23}
                        step={1}
                        value={sunHour}
                        onChange={e => setSunHour(parseInt(e.target.value))}
                        style={{ width: "100%", accentColor: "#f59e0b" }}
                      />
                    </div>
                    <div>
                      <p style={{ margin: "0 0 4px", fontSize: 11, color: "#64748b" }}>
                        {t.month}: {t.months[sunMonth - 1]}
                      </p>
                      <input
                        type="range"
                        min={1}
                        max={12}
                        step={1}
                        value={sunMonth}
                        onChange={e => setSunMonth(parseInt(e.target.value))}
                        style={{ width: "100%", accentColor: "#f59e0b" }}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div style={card}>
                <p style={{ margin: "0 0 8px", fontWeight: 700, fontSize: 14 }}>{t.extremeWeather}</p>

                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
                  {([
                    { id: null, label: t.extremeOff, color: "#475569" },
                    { id: "flood", label: t.extremeFlood, color: "#1d4ed8" },
                    { id: "storm", label: t.extremeStorm, color: "#4f46e5" },
                    { id: "heatwave", label: t.extremeHeatwave, color: "#b45309" },
                  ] as { id: "flood" | "storm" | "heatwave" | null; label: string; color: string }[]).map(ev => (
                    <button
                      key={String(ev.id)}
                      onClick={() => setExtremeType(ev.id)}
                      style={{
                        background: extremeType === ev.id ? ev.color : "#1e293b",
                        color: "white",
                        border: `1px solid ${extremeType === ev.id ? ev.color : "#334155"}`,
                        borderRadius: 8,
                        padding: "10px 14px",
                        cursor: "pointer",
                        fontWeight: extremeType === ev.id ? "bold" : "normal",
                        fontSize: 13,
                        textAlign: "left",
                      }}
                    >
                      {ev.label}
                    </button>
                  ))}
                </div>

                {extremeType && (
                  <div style={{ background: "#1e293b", borderRadius: 10, padding: 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0" }}>{t.intensity}</span>
                      <span
                        style={{
                          background: intensityColor,
                          color: "white",
                          borderRadius: 6,
                          padding: "2px 10px",
                          fontSize: 14,
                          fontWeight: 700,
                        }}
                      >
                        {extremeIntensity}/10
                      </span>
                    </div>

                    <input
                      type="range"
                      min={1}
                      max={10}
                      step={1}
                      value={extremeIntensity}
                      onChange={e => setExtremeIntensity(parseInt(e.target.value))}
                      style={{ width: "100%", accentColor: intensityColor }}
                    />

                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#475569", marginTop: 2 }}>
                      <span>{t.mild}</span>
                      <span>{t.extreme}</span>
                    </div>

                    <div
                      style={{
                        marginTop: 12,
                        fontSize: 12,
                        color: "#94a3b8",
                        lineHeight: 1.6,
                        background: "#0f172a",
                        borderRadius: 8,
                        padding: "10px 12px",
                      }}
                    >
                      {getExtremeDesc()}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === 6 && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <h2 style={{ margin: 0, fontSize: 15 }}>📡 {t.sensors}</h2>
                <button onClick={() => setShowNewSensor(!showNewSensor)} style={sBtn(showNewSensor ? "#475569" : "#10b981")}>
                  {showNewSensor ? t.cancel : t.newSensor}
                </button>
              </div>

              <p style={{ margin: "0 0 12px", fontSize: 12, color: "#64748b" }}>
                Add IoT sensors to your twin. Each sensor appears as a 3D device in the scene at its specified coordinates.
              </p>

              {showNewSensor && (
                <div style={{ ...card, display: "flex", flexDirection: "column", gap: 8 }}>
                  <input
                    type="text"
                    placeholder="Sensor name (e.g. Rain gauge North)"
                    style={inp}
                    value={sensorName}
                    onChange={e => setSensorName(e.target.value)}
                  />

                  <select style={inp} value={sensorType} onChange={e => setSensorType(e.target.value)}>
                    {[
                      ["rain_gauge", "🌧️ Rain gauge"],
                      ["temperature", "🌡️ Temperature"],
                      ["wind", "💨 Wind speed"],
                      ["humidity", "💧 Humidity"],
                      ["pressure", "📊 Air pressure"],
                      ["noise", "🔊 Noise level"],
                      ["air_quality", "🌬️ Air quality"],
                    ].map(([val, label]) => (
                      <option key={val} value={val}>{label}</option>
                    ))}
                  </select>

                  <input
                    type="text"
                    placeholder={t.description}
                    style={inp}
                    value={sensorDesc}
                    onChange={e => setSensorDesc(e.target.value)}
                  />

                  <p style={{ margin: 0, fontSize: 11, color: "#64748b" }}>{t.position}:</p>
                  <div style={{ display: "flex", gap: 6 }}>
                    {([["X", sensorX, setSensorX], ["Y", sensorY, setSensorY], ["Z", sensorZ, setSensorZ]] as [string, string, (v: string) => void][]).map(([label, val, set]) => (
                      <input key={label} type="text" placeholder={label} style={{ ...inp, width: "33%" }} value={val} onChange={e => set(e.target.value)} />
                    ))}
                  </div>

                  <p style={{ margin: 0, fontSize: 11, color: "#64748b" }}>Current reading (optional):</p>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      type="text"
                      placeholder={t.sensorValue}
                      style={{ ...inp, width: "50%" }}
                      value={sensorValue}
                      onChange={e => setSensorValue(e.target.value)}
                    />
                    <input
                      type="text"
                      placeholder={t.sensorUnit}
                      style={{ ...inp, width: "50%" }}
                      value={sensorUnit}
                      onChange={e => setSensorUnit(e.target.value)}
                    />
                  </div>

                  <button onClick={saveSensor} style={btn("#10b981")}>{t.save}</button>
                </div>
              )}

              {sensors.map(s => {
                const typeMap: Record<string, string> = {
                  rain_gauge: "🌧️",
                  temperature: "🌡️",
                  wind: "💨",
                  humidity: "💧",
                  pressure: "📊",
                  noise: "🔊",
                  air_quality: "🌬️",
                };

                return (
                  <div key={s.id} style={{ ...card, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <p style={{ margin: 0, fontWeight: 600, fontSize: 14 }}>
                        {typeMap[s.type] || "📡"} {s.name}
                      </p>
                      <p style={{ margin: "2px 0", fontSize: 11, color: "#64748b" }}>
                        Position: {s.x}, {s.y}, {s.z}
                      </p>
                      {s.value !== undefined && s.value !== null && (
                        <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#10b981" }}>
                          {s.value} {s.unit}
                        </p>
                      )}
                      {s.description && (
                        <p style={{ margin: "2px 0 0", fontSize: 11, color: "#94a3b8" }}>{s.description}</p>
                      )}
                    </div>

                    <button
                      onClick={() => deleteSensor(s.id)}
                      style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer" }}
                    >
                      🗑️
                    </button>
                  </div>
                );
              })}

              {sensors.length === 0 && !showNewSensor && (
                <p style={{ color: "#64748b", fontSize: 13 }}>{t.noSensors}</p>
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}