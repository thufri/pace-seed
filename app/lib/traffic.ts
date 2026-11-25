/** PACE-SEED Mobility: deterministic, exploratory corridor simulation.
 * This is NOT a calibrated microsimulation or a safety prediction model.
 * Coordinates in the viewer are scene units; metersPerSceneUnit is determined from GLB metadata.
 */
export type Vec3 = { x: number; y: number; z: number };
export type Mode = "car" | "truck" | "bus" | "pedestrian" | "bicycle" | "scooter";
export type InterventionKind = "roundabout" | "crossing" | "traffic_light" | "speed_bump" | "bus_stop" | "bus_lane" | "cycle_lane";
export type TrafficRoute = { id: string; name: string; mode: Mode; points: Vec3[]; flowPerHour: number; speedKmh: number };
export type Intervention = { id: string; name: string; kind: InterventionKind; position: Vec3; radiusM: number };
export type TrafficScenario = { id: string; name: string; routes: TrafficRoute[]; interventions: Intervention[] };
export type TrafficProject = { version: 1; scenarios: TrafficScenario[]; selectedId: string };
export type Agent = { id: number; routeId: string; mode: Mode; distanceM: number; speedMps: number; enteredAt: number; waitingSec: number; dwellAt: string[]; dwellRemaining: number };
export type Metrics = { generated: number; completed: number; active: number; avgTravelSec: number; avgDelaySec: number; avgSpeedKmh: number; avgQueue: number; peakQueue: number; byMode: Record<Mode, number> };
export const MODES: Mode[] = ["car", "truck", "bus", "pedestrian", "bicycle", "scooter"];
export const INTERVENTIONS: InterventionKind[] = ["roundabout", "crossing", "traffic_light", "speed_bump", "bus_stop", "bus_lane", "cycle_lane"];
export const MODE_COLORS: Record<Mode, string> = { car: "#3579bf", truck: "#c18a3e", bus: "#e4a532", pedestrian: "#ba6a83", bicycle: "#278b7c", scooter: "#8c69b0" };
export const DEFAULT_SPEED: Record<Mode, number> = { car: 40, truck: 30, bus: 30, pedestrian: 4.8, bicycle: 16, scooter: 18 };
export const DEFAULT_FLOW: Record<Mode, number> = { car: 240, truck: 30, bus: 12, pedestrian: 120, bicycle: 45, scooter: 20 };
export const VEHICLE_LENGTH: Record<Mode, number> = { car: 4.5, truck: 11, bus: 12, pedestrian: 0.6, bicycle: 1.8, scooter: 1.2 };
const uid = () => typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
export function createProject(): TrafficProject { const id = "baseline"; return { version: 1, scenarios: [{ id, name: "Existing conditions", routes: [], interventions: [] }], selectedId: id }; }
export function newRoute(name: string, mode: Mode, points: Vec3[]): TrafficRoute { return { id: uid(), name, mode, points, flowPerHour: DEFAULT_FLOW[mode], speedKmh: DEFAULT_SPEED[mode] }; }
export function newIntervention(kind: InterventionKind, position: Vec3): Intervention { return { id: uid(), kind, name: kind.replaceAll("_", " "), position, radiusM: kind === "roundabout" ? 18 : 7 }; }
export function cloneScenario(s: TrafficScenario): TrafficScenario { return { id: uid(), name: `${s.name} – alternative`, routes: s.routes.map(r => ({ ...r, points: r.points.map(p => ({ ...p })) })), interventions: s.interventions.map(i => ({ ...i, position: { ...i.position } })) }; }
export function isValidProject(x: unknown): x is TrafficProject {
  if (!x || typeof x !== "object") return false;
  const p = x as Partial<TrafficProject>;
  return p.version === 1 && typeof p.selectedId === "string" && Array.isArray(p.scenarios) && p.scenarios.length > 0 && p.scenarios.some(s => s.id === p.selectedId) && p.scenarios.every(s =>
    typeof s.id === "string" && typeof s.name === "string" && Array.isArray(s.routes) && Array.isArray(s.interventions) &&
    s.routes.every(r => MODES.includes(r.mode) && Array.isArray(r.points) && r.points.length >= 2 && r.points.every(pt => Number.isFinite(pt.x) && Number.isFinite(pt.y) && Number.isFinite(pt.z)) && Number.isFinite(r.flowPerHour) && r.flowPerHour >= 0 && r.flowPerHour <= 1800 && Number.isFinite(r.speedKmh) && r.speedKmh > 0 && r.speedKmh <= 120) &&
    s.interventions.every(i => INTERVENTIONS.includes(i.kind) && Number.isFinite(i.position?.x) && Number.isFinite(i.position?.y) && Number.isFinite(i.position?.z))
  );
}
export function distance(a: Vec3, b: Vec3) { return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z); }
export function routeLength(route: TrafficRoute, metersPerSceneUnit: number): number {
  let total = 0; for (let i = 1; i < route.points.length; i++) total += distance(route.points[i - 1], route.points[i]);
  return total * metersPerSceneUnit;
}
export function pointOnRoute(route: TrafficRoute, distanceM: number, metersPerSceneUnit: number): { point: Vec3; direction: Vec3 } {
  let remain = Math.max(0, distanceM / metersPerSceneUnit);
  for (let i = 1; i < route.points.length; i++) {
    const a = route.points[i - 1], b = route.points[i], len = distance(a, b);
    if (len < 0.00001) continue;
    if (remain <= len || i === route.points.length - 1) {
      const t = Math.max(0, Math.min(1, remain / len));
      return { point: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t }, direction: { x: (b.x - a.x) / len, y: (b.y - a.y) / len, z: (b.z - a.z) / len } };
    }
    remain -= len;
  }
  return { point: route.points.at(-1) || { x: 0, y: 0, z: 0 }, direction: { x: 0, y: 0, z: 1 } };
}
function nearestRouteDistance(route: TrafficRoute, pos: Vec3, metersPerSceneUnit: number): { offsetM: number; separationM: number; direction: Vec3 } {
  let closest = Infinity, offset = 0, accumulated = 0, direction = { x: 0, y: 0, z: 1 };
  for (let i = 1; i < route.points.length; i++) {
    const a = route.points[i - 1], b = route.points[i], vx = b.x - a.x, vz = b.z - a.z;
    const len2 = vx * vx + vz * vz; if (len2 < 1e-8) continue;
    const t = Math.max(0, Math.min(1, ((pos.x - a.x) * vx + (pos.z - a.z) * vz) / len2));
    const px = a.x + vx * t, pz = a.z + vz * t, d = Math.hypot(px - pos.x, pz - pos.z);
    if (d < closest) { closest = d; offset = accumulated + Math.sqrt(len2) * t; const l = Math.sqrt(len2); direction = { x: vx / l, y: 0, z: vz / l }; }
    accumulated += distance(a, b);
  }
  return { offsetM: offset * metersPerSceneUnit, separationM: closest * metersPerSceneUnit, direction };
}
const isMotor = (m: Mode) => m === "car" || m === "truck" || m === "bus";
const isActive = (m: Mode) => m === "pedestrian" || m === "bicycle" || m === "scooter";
type Event = { intervention: Intervention; offsetM: number; direction: Vec3 };
export class TrafficSimulator {
  public timeSec = 0;
  public agents: Agent[] = [];
  private accum = new Map<string, number>();
  private routeLengths = new Map<string, number>();
  private routeEvents = new Map<string, Event[]>();
  private nextId = 1;
  private generated = 0;
  private completed = 0;
  private sumTravel = 0;
  private sumDelay = 0;
  private sumDistance = 0;
  private sumQueue = 0;
  private queueSamples = 0;
  private peakQueue = 0;
  private byMode: Record<Mode, number> = { car: 0, truck: 0, bus: 0, pedestrian: 0, bicycle: 0, scooter: 0 };
  constructor(public scenario: TrafficScenario, public metersPerSceneUnit: number) {
    for (const route of scenario.routes) {
      this.routeLengths.set(route.id, routeLength(route, metersPerSceneUnit));
      this.accum.set(route.id, 0);
      this.routeEvents.set(route.id, scenario.interventions.map(intervention => {
        const nearest = nearestRouteDistance(route, intervention.position, metersPerSceneUnit);
        return { intervention, offsetM: nearest.offsetM, direction: nearest.direction, separationM: nearest.separationM };
      }).filter(e => e.separationM <= Math.max(e.intervention.radiusM, 5)).map(({ intervention, offsetM, direction }) => ({ intervention, offsetM, direction })));
    }
  }
  step(dt: number): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    dt = Math.min(dt, 2);
    this.timeSec += dt;
    for (const route of this.scenario.routes) {
      const lengthM = this.routeLengths.get(route.id) || 0;
      if (lengthM < 3 || route.flowPerHour <= 0) continue;
      let pending = (this.accum.get(route.id) || 0) + route.flowPerHour * dt / 3600;
      let loops = 0;
      while (pending >= 1 && loops++ < 10) {
        const first = this.agents.filter(a => a.routeId === route.id).reduce<Agent | undefined>((best, a) => !best || a.distanceM < best.distanceM ? a : best, undefined);
        const gap = VEHICLE_LENGTH[route.mode] + (isMotor(route.mode) ? 3 : 1.5);
        if (first && first.distanceM < gap) break;
        this.agents.push({ id: this.nextId++, routeId: route.id, mode: route.mode, distanceM: 0, speedMps: 0, enteredAt: this.timeSec, waitingSec: 0, dwellAt: [], dwellRemaining: 0 });
        pending -= 1; this.generated++;
      }
      this.accum.set(route.id, Math.min(pending, 5));
    }
    const routeMap = new Map(this.scenario.routes.map(r => [r.id, r]));
    const ordered = [...this.agents].sort((a, b) => a.routeId.localeCompare(b.routeId) || b.distanceM - a.distanceM);
    const front = new Map<string, Agent>();
    const completedIds = new Set<number>();
    let queue = 0;
    for (const agent of ordered) {
      const route = routeMap.get(agent.routeId); if (!route) { completedIds.add(agent.id); continue; }
      const length = this.routeLengths.get(route.id) || 0;
      let target = Math.max(0.3, route.speedKmh / 3.6);
      let stopAt: number | null = null;
      const lead = front.get(route.id);
      if (lead) {
        const gap = lead.distanceM - agent.distanceM - VEHICLE_LENGTH[lead.mode];
        const desired = 2 + agent.speedMps * (isMotor(agent.mode) ? 1.4 : 0.7);
        if (gap < desired + 5) target = Math.min(target, Math.max(0, (gap - 1) / (isMotor(agent.mode) ? 1.6 : 0.7)));
      }
      for (const event of this.routeEvents.get(route.id) || []) {
        const { intervention, offsetM, direction } = event;
        const ahead = offsetM - agent.distanceM;
        if (ahead < -intervention.radiusM || ahead > Math.max(15, intervention.radiusM + 12)) continue;
        if (intervention.kind === "roundabout" && isMotor(agent.mode)) target = Math.min(target, 25 / 3.6);
        if (intervention.kind === "speed_bump" && isMotor(agent.mode)) target = Math.min(target, 15 / 3.6);
        if (intervention.kind === "crossing" && isMotor(agent.mode)) {
          target = Math.min(target, 30 / 3.6);
          const pedestrianNear = this.agents.some(a => a.mode === "pedestrian" && (() => {
            const otherRoute = routeMap.get(a.routeId); if (!otherRoute) return false;
            const pos = pointOnRoute(otherRoute, a.distanceM, this.metersPerSceneUnit).point;
            return distance(pos, intervention.position) * this.metersPerSceneUnit < Math.max(5, intervention.radiusM);
          })());
          if (pedestrianNear && ahead > 0 && ahead < 20) { target = Math.min(target, Math.sqrt(2 * 2.5 * Math.max(0, ahead - 2))); stopAt = offsetM - 2; }
        }
        if (intervention.kind === "traffic_light" && isMotor(agent.mode) && ahead > 0 && ahead < 16) {
          const xDominant = Math.abs(direction.x) >= Math.abs(direction.z);
          const phase = this.timeSec % 60;
          const red = xDominant ? phase < 30 : phase >= 30;
          if (red) { target = Math.min(target, Math.sqrt(2 * 2.5 * Math.max(0, ahead - 2))); stopAt = offsetM - 2; }
        }
        if (intervention.kind === "bus_stop" && agent.mode === "bus" && ahead > -1 && ahead < 5 && !agent.dwellAt.includes(intervention.id)) {
          agent.dwellAt.push(intervention.id);
          agent.dwellRemaining = 12;
          if (ahead > 0) stopAt = offsetM - 1;
          target = 0;
        }
      }
      if (agent.dwellRemaining > 0) { target = 0; agent.dwellRemaining = Math.max(0, agent.dwellRemaining - dt); }
      const accel = isMotor(agent.mode) ? (agent.mode === "truck" || agent.mode === "bus" ? 0.9 : 1.6) : 1.1;
      const brake = isMotor(agent.mode) ? 3.0 : 2.0;
      agent.speedMps = Math.max(0, Math.min(route.speedKmh / 3.6, agent.speedMps + Math.max(-brake * dt, Math.min(accel * dt, target - agent.speedMps))));
      if (agent.speedMps < 0.5) { agent.waitingSec += dt; queue++; }
      const nextDistance = agent.distanceM + agent.speedMps * dt;
      if (stopAt !== null && agent.distanceM <= stopAt && nextDistance >= stopAt) { agent.distanceM = stopAt; agent.speedMps = 0; }
      else agent.distanceM = nextDistance;
      front.set(route.id, agent);
      if (agent.distanceM >= length) {
        completedIds.add(agent.id); this.completed++;
        const travel = this.timeSec - agent.enteredAt;
        const free = length / Math.max(0.3, route.speedKmh / 3.6);
        this.sumTravel += travel; this.sumDelay += Math.max(0, travel - free);
        this.sumDistance += length; this.byMode[agent.mode]++;
      }
    }
    if (completedIds.size) this.agents = this.agents.filter(a => !completedIds.has(a.id));
    this.sumQueue += queue; this.queueSamples++; this.peakQueue = Math.max(this.peakQueue, queue);
  }
  metrics(): Metrics {
    return { generated: this.generated, completed: this.completed, active: this.agents.length,
      avgTravelSec: this.completed ? this.sumTravel / this.completed : 0,
      avgDelaySec: this.completed ? this.sumDelay / this.completed : 0,
      avgSpeedKmh: this.sumTravel ? this.sumDistance / this.sumTravel * 3.6 : 0,
      avgQueue: this.queueSamples ? this.sumQueue / this.queueSamples : 0, peakQueue: this.peakQueue,
      byMode: { ...this.byMode } };
  }
}
export function evaluateScenario(s: TrafficScenario, metersPerSceneUnit: number, durationMin = 10): Metrics {
  const engine = new TrafficSimulator(s, metersPerSceneUnit);
  const steps = Math.ceil(Math.max(1, Math.min(60, durationMin)) * 60 / 0.5);
  for (let i = 0; i < steps; i++) engine.step(0.5);
  return engine.metrics();
}
