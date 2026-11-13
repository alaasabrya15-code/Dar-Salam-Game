import { STOP_NAMES } from "./types";

export const LANE_W = 3.45;
/** Half-width of the reserved center-median corridor, measured from road center. */
export const MEDIAN_HALF = 1;
export const ROAD_HALF = 8.15;

export type Sample = { x: number; z: number; s: number; yaw: number; len: number };

export type Proj = {
  i: number;
  s: number;
  x: number;
  z: number;
  yaw: number;
  lat: number;
  dist: number;
};

export type Track = {
  pts: Sample[];
  total: number;
  stops: { name: string; s: number }[];
  tollS: number;
  radarS: number[];
  gasS: number;
  bumps: number[];
  sample: (s: number) => { x: number; z: number; yaw: number; s: number };
  project: (x: number, z: number, hint: number) => Proj;
};

/**
 * Four traffic lanes indexed from the negative-lateral curb to the
 * positive-lateral curb. Lanes 0/1 and 2/3 are separated by a reserved median
 * corridor; each two-lane carriageway keeps the original lane spacing.
 */
export function laneLat(lane: number) {
  const clamped = Math.max(0, Math.min(3, lane));
  const side = clamped < 1.5 ? -1 : 1;
  return (clamped - 1.5) * LANE_W + side * MEDIAN_HALF;
}

/** Same-direction lane divider positions on either carriageway. */
export function laneDividerLats(): [number, number] {
  return [-(MEDIAN_HALF + LANE_W / 2), MEDIAN_HALF + LANE_W / 2];
}

/** Inner edges of the median corridor; useful for raised separator geometry. */
export function medianEdgeLats(): [number, number] {
  return [-MEDIAN_HALF, MEDIAN_HALF];
}

export function wrapDelta(a: number, b: number, total: number) {
  let d = a - b;
  const h = total * 0.5;
  while (d > h) d -= total;
  while (d < -h) d += total;
  return d;
}

export function wrapAngle(d: number) {
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function buildTrack(): Track {
  const straight = 680;
  const radius = 34;
  const segStraight = 190;
  const segArc = 32;
  const raw: { x: number; z: number }[] = [];

  for (let i = 0; i <= segStraight; i++) {
    const u = i / segStraight;
    const env = Math.sin(u * Math.PI);
    const wob = env * (Math.sin(u * Math.PI * 4) * 2.1 + Math.sin(u * Math.PI * 9) * 0.55);
    raw.push({ x: -radius + wob, z: -straight / 2 + u * straight });
  }
  for (let i = 1; i <= segArc; i++) {
    const ang = Math.PI - (i / segArc) * Math.PI;
    raw.push({ x: Math.cos(ang) * radius, z: straight / 2 + Math.sin(ang) * radius });
  }
  for (let i = 1; i <= segStraight; i++) {
    const u = i / segStraight;
    const env = Math.sin(u * Math.PI);
    const wob = env * (Math.sin(u * Math.PI * 3.5 + 0.6) * 1.8);
    raw.push({ x: radius + wob, z: straight / 2 - u * straight });
  }
  for (let i = 1; i < segArc; i++) {
    const ang = -(i / segArc) * Math.PI;
    raw.push({ x: Math.cos(ang) * radius, z: -straight / 2 + Math.sin(ang) * radius });
  }

  const pts: Sample[] = [];
  let s = 0;
  const N = raw.length;
  for (let i = 0; i < N; i++) {
    const a = raw[i];
    const b = raw[(i + 1) % N];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz) || 0.001;
    const yaw = Math.atan2(-dx / len, -dz / len);
    pts.push({ x: a.x, z: a.z, s, yaw, len });
    s += len;
  }
  const total = s;

  const stops = STOP_NAMES.map((name, i) => ({
    name,
    s: ((i + 0.06) / STOP_NAMES.length) * total,
  }));

  const tollS = stops[0].s + 6;
  const radarS = [0.16, 0.41, 0.73].map((t) => t * total);
  const gasS = total * 0.58;
  const bumps = [0.11, 0.28, 0.47, 0.66, 0.84].map((t) => t * total);

  function sample(dist: number) {
    let sDist = dist % total;
    if (sDist < 0) sDist += total;
    let lo = 0;
    let hi = pts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (pts[mid].s <= sDist) lo = mid;
      else hi = mid - 1;
    }
    const p = pts[lo];
    const n = pts[(lo + 1) % pts.length];
    const u = Math.min(1, Math.max(0, (sDist - p.s) / p.len));
    return {
      x: p.x + (n.x - p.x) * u,
      z: p.z + (n.z - p.z) * u,
      yaw: p.yaw,
      s: sDist,
    };
  }

  function project(x: number, z: number, hint: number): Proj {
    const scan = (from: number, count: number) => {
      let best: Proj | null = null;
      for (let k = 0; k < count; k++) {
        const i = (from + k + pts.length * 8) % pts.length;
        const p = pts[i];
        const n = pts[(i + 1) % pts.length];
        const dx = n.x - p.x;
        const dz = n.z - p.z;
        const l2 = dx * dx + dz * dz || 1;
        let t = ((x - p.x) * dx + (z - p.z) * dz) / l2;
        if (t < 0) t = 0;
        else if (t > 1) t = 1;
        const px = p.x + dx * t;
        const pz = p.z + dz * t;
        const dist = Math.hypot(x - px, z - pz);
        if (!best || dist < best.dist) {
          const rx = Math.cos(p.yaw);
          const rz = -Math.sin(p.yaw);
          best = {
            i,
            s: p.s + p.len * t,
            x: px,
            z: pz,
            yaw: p.yaw,
            lat: (x - px) * rx + (z - pz) * rz,
            dist,
          };
        }
      }
      return best!;
    };

    if (hint < 0) return scan(0, pts.length);
    const near = scan(hint - 30, 70);
    if (near.dist > 24) return scan(0, pts.length);
    return near;
  }

  return { pts, total, stops, tollS, radarS, gasS, bumps, sample, project };
}
