import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { cloneModel, streetLoader } from "./gltf";
import {
  GAS_COST,
  JOBS_NEED,
  RENT,
  ROUTE,
  SHIFT_SECONDS,
  UPGRADES,
  ACCESSORIES,
  PAINTS,
  SLOGANS,
  STICKERS,
  type AccessoryId,
  type CosmeticSlot,
  type Hud,
  type Pax,
  type Phase,
  type PreviewCfg,
  type SloganId,
  type StickerId,
  type UpgradeId,
  type Upgrades,
  type VehicleId,
  type Workshop,
  vehicleById,
} from "./types";
import { LANE_W, ROAD_HALF, buildTrack, laneLat, wrapAngle, wrapDelta, type Track } from "./track";
import { smoothTrafficHeadingOffset, trafficHeadingOffset } from "./vehicle-heading";
import {
  buildLandmarks,
  buildPosts,
  buildingKit,
  dressFayoum,
  placeDogs,
  placeBikes,
  placeShopSigns,
} from "./fayoum";
import { OCCUPATIONS, dressStreet, placeBridgeWalls, placeLocalSigns, placeMetroRun } from "./street";
import { fitProp } from "./fit";
import { dirtMaterial, roadMaterial, skyDome, walkMaterial } from "./surfaces";

export type GameHandle = {
  getHud: () => Hud;
  setPreview: (cfg: PreviewCfg) => void;
  start: (cfg: PreviewCfg) => void;
  pause: () => void;
  resume: () => void;
  quit: () => void;
  finish: () => void;
  setTouch: (t: { steer: number; throttle: number; brake: number }) => void;
  horn: () => void;
  cycleCam: () => void;
  toggleSound: () => void;
  buy: (id: UpgradeId) => void;
  buyCosmetic: (slot: CosmeticSlot, id: string) => boolean;
  dispose: () => void;
};

type Npc = {
  alive: boolean;
  kind: VehicleId;
  s: number;
  lane: number;
  laneTarget: number;
  speed: number;
  cruise: number;
  brake: number;
  color: THREE.Color;
  nextLane: number;
  dir: 1 | -1;
  laneVel: number;
  heading: number;
};

type Ped = {
  s: number;
  side: 1 | -1;
  extra: number;
  dir: 1 | -1;
  speed: number;
  mode: "walk" | "wait" | "cross";
  wait: number;
  lat: number;
  phase: number;
  face: number;
};

type GaitUniform = { uWalk: { value: number }; uGait: { value: number } };

/** Per-person stride on static meshes: legs and arms swing on the facing axis. */
function enableGait(root: THREE.Object3D) {
  const gaits: GaitUniform[] = [];
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry || !mesh.material) return;
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    const bb = mesh.geometry.boundingBox;
    const minY = bb?.min.y ?? 0;
    const span = Math.max(0.2, (bb?.max.y ?? 1) - minY);
    const src = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const next = src.map((mat) => {
      const c = mat.clone();
      c.customProgramCacheKey = () => "ped-gait-v4";
      c.onBeforeCompile = (shader) => {
        shader.uniforms.uWalk = { value: 0 };
        shader.uniforms.uGait = { value: 0 };
        shader.uniforms.uMinY = { value: minY };
        shader.uniforms.uSpan = { value: span };
        gaits.push(shader.uniforms as unknown as GaitUniform);
        shader.vertexShader = shader.vertexShader
          .replace(
            "#include <common>",
            "#include <common>\nuniform float uWalk;\nuniform float uGait;\nuniform float uMinY;\nuniform float uSpan;",
          )
          .replace(
            "#include <begin_vertex>",
            `#include <begin_vertex>
             float nh = clamp((transformed.y - uMinY) / uSpan, 0.0, 1.0);
             float swing = sin(uGait);
             float side = sign(transformed.x + 0.0001);
             float leg = 1.0 - smoothstep(0.05, 0.48, nh);
             float arm = smoothstep(0.5, 0.7, nh) * (1.0 - smoothstep(0.78, 0.94, nh));
             transformed.z += side * swing * leg * uWalk * 0.045;
             transformed.y += max(swing * side, 0.0) * leg * uWalk * 0.02;
             transformed.z -= side * swing * arm * uWalk * 0.03;
            `,
          );
      };
      return c;
    });
    mesh.material = Array.isArray(mesh.material) ? next : next[0];
  });
  root.userData.gaits = gaits;
}

const SAVE_KEY = "daralsalam-save-v2";
const RADAR_LIMIT = 46 / 3.6;
const TOLL_LIMIT = 36 / 3.6;

type Save = {
  v: 2;
  bestMoney: number;
  bestKm: number;
  bestTrial: number | null;
  sound: boolean;
  wallet: number;
  upgrades: Upgrades;
  paint: string;
  slogan: SloganId;
  sticker: StickerId;
  accessories: AccessoryId[];
  ownedPaints: string[];
  ownedSlogans: SloganId[];
  ownedStickers: StickerId[];
  ownedAccessories: AccessoryId[];
  plateNo: number;
};

function blankUpgrades(): Upgrades {
  return { motor: 0, fuel: 0, seats: 0, tires: 0 };
}

function clampLvl(n: unknown) {
  const v = Math.floor(Number(n) || 0);
  return Math.max(0, Math.min(3, v));
}

function asIds<T extends string>(value: unknown, allowed: readonly T[], fallback: T[]): T[] {
  if (!Array.isArray(value)) return fallback;
  const ok = value.filter((item): item is T => allowed.includes(item as T));
  return ok.length ? ok : fallback;
}

function loadSave(): Save {
  const blank: Save = {
    v: 2,
    bestMoney: 0,
    bestKm: 0,
    bestTrial: null,
    sound: true,
    wallet: 0,
    upgrades: blankUpgrades(),
    paint: "#f0b429",
    slogan: "dar",
    sticker: "none",
    accessories: [],
    ownedPaints: ["#f0b429"],
    ownedSlogans: ["dar"],
    ownedStickers: ["none"],
    ownedAccessories: [],
    plateNo: 1,
  };
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return blank;
    const p = JSON.parse(raw) as Partial<Save>;
    if (p.v !== 2) return blank;
    const u = (p.upgrades ?? {}) as Partial<Upgrades>;
    const paint = PAINTS.some((item) => item.hex === p.paint) ? (p.paint as string) : blank.paint;
    const slogan = SLOGANS.some((item) => item.id === p.slogan) ? (p.slogan as SloganId) : blank.slogan;
    const sticker = STICKERS.some((item) => item.id === p.sticker) ? (p.sticker as StickerId) : blank.sticker;
    const ownedPaints = asIds(p.ownedPaints, PAINTS.map((item) => item.hex), [paint]);
    if (!ownedPaints.includes(paint)) ownedPaints.push(paint);
    return {
      v: 2,
      bestMoney: Number(p.bestMoney) || 0,
      bestKm: Number(p.bestKm) || 0,
      bestTrial: typeof p.bestTrial === "number" ? p.bestTrial : null,
      sound: p.sound !== false,
      wallet: Math.max(0, Math.floor(Number(p.wallet) || 0)),
      upgrades: {
        motor: clampLvl(u.motor),
        fuel: clampLvl(u.fuel),
        seats: clampLvl(u.seats),
        tires: clampLvl(u.tires),
      },
      paint,
      slogan,
      sticker,
      accessories: asIds(p.accessories, ACCESSORIES.map((item) => item.id), []),
      ownedPaints,
      ownedSlogans: asIds(p.ownedSlogans, SLOGANS.map((item) => item.id), [slogan]),
      ownedStickers: asIds(p.ownedStickers, STICKERS.map((item) => item.id), [sticker]),
      ownedAccessories: asIds(p.ownedAccessories, ACCESSORIES.map((item) => item.id), []),
      plateNo: 1,
    };
  } catch {
    return blank;
  }
}

function writeSave(s: Save) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(s));
  } catch {
    /* ignore quota */
  }
}

function box(w: number, h: number, d: number, x: number, y: number, z: number) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}

function merge(parts: THREE.BufferGeometry[]) {
  return mergeGeometries(parts, false) ?? parts[0];
}

const KINDS: VehicleId[] = ["malaky", "taxi", "micro", "tuktuk", "truck"];

function trafficGeoms(kind: VehicleId) {
  const body: THREE.BufferGeometry[] = [];
  const glass: THREE.BufferGeometry[] = [];
  const wheels: THREE.BufferGeometry[] = [];
  const lights: THREE.BufferGeometry[] = [];
  const wheel = () => {
    const g = new THREE.CylinderGeometry(0.34, 0.34, 0.22, 8);
    g.rotateZ(Math.PI / 2);
    return g;
  };
  const addW = (x: number, y: number, z: number, s = 1) => {
    const g = wheel();
    g.scale(s, s, s);
    g.translate(x, y, z);
    wheels.push(g);
  };

  if (kind === "micro") {
    body.push(box(2.05, 1.45, 4.9, 0, 1.2, 0.05));
    glass.push(box(1.85, 0.55, 1.3, 0, 1.85, -1.05));
    glass.push(box(1.7, 0.42, 2.2, 0, 1.78, 0.85));
    lights.push(box(0.2, 0.22, 0.08, -0.75, 0.95, 2.5));
    lights.push(box(0.2, 0.22, 0.08, 0.75, 0.95, 2.5));
    addW(-1.05, 0.36, -1.6, 1.05);
    addW(1.05, 0.36, -1.6, 1.05);
    addW(-1.05, 0.36, 1.5, 1.05);
    addW(1.05, 0.36, 1.5, 1.05);
  } else if (kind === "tuktuk") {
    // better matching shape for traffic tuk-tuks
    body.push(box(1.32, 0.55, 1.35, 0, 0.72, 0.28));
    body.push(box(1.42, 0.06, 1.58, 0, 1.48, 0.15));
    body.push(box(1.02, 0.22, 0.85, 0, 0.42, -0.95));
    glass.push(box(1.15, 0.48, 0.05, 0, 1.12, -0.42));
    glass.push(box(0.04, 0.4, 0.9, -0.66, 1.12, 0.1));
    glass.push(box(0.04, 0.4, 0.9, 0.66, 1.12, 0.1));
    lights.push(box(0.16, 0.16, 0.08, -0.28, 0.55, -1.28));
    lights.push(box(0.16, 0.16, 0.08, 0.28, 0.55, -1.28));
    addW(-0.62, 0.26, 0.52, 0.85);
    addW(0.62, 0.26, 0.52, 0.85);
    addW(0, 0.26, -1.05, 0.8);
  } else if (kind === "truck") {
    body.push(box(2.35, 1.55, 7.2, 0, 1.25, 1.35));
    body.push(box(2.2, 1.7, 2.3, 0, 1.45, -3.15));
    glass.push(box(1.9, 0.55, 0.9, 0, 1.9, -3.55));
    lights.push(box(0.22, 0.18, 0.08, -0.8, 0.85, 4.95));
    lights.push(box(0.22, 0.18, 0.08, 0.8, 0.85, 4.95));
    addW(-1.15, 0.42, -3.3, 1.2);
    addW(1.15, 0.42, -3.3, 1.2);
    addW(-1.15, 0.42, 1.2, 1.2);
    addW(1.15, 0.42, 1.2, 1.2);
    addW(-1.15, 0.42, 3.5, 1.2);
    addW(1.15, 0.42, 3.5, 1.2);
  } else {
    body.push(box(1.72, 0.48, 4.25, 0, 0.62, 0));
    body.push(box(1.55, 0.42, 2.05, 0, 1.05, 0.28));
    if (kind === "taxi") body.push(box(0.34, 0.16, 0.34, 0, 1.38, 0.15));
    glass.push(box(1.4, 0.36, 1.15, 0, 1.08, -0.15));
    lights.push(box(0.22, 0.14, 0.06, -0.62, 0.72, 2.12));
    lights.push(box(0.22, 0.14, 0.06, 0.62, 0.72, 2.12));
    addW(-0.78, 0.32, -1.35);
    addW(0.78, 0.32, -1.35);
    addW(-0.78, 0.32, 1.28);
    addW(0.78, 0.32, 1.28);
  }
  return {
    body: merge(body),
    glass: merge(glass),
    wheels: merge(wheels),
    lights: merge(lights),
  };
}

const PLATE_PAIRS: [string, string][] = [
  ["أ", "A"],
  ["ب", "B"],
  ["ج", "G"],
  ["د", "D"],
  ["ر", "R"],
  ["س", "S"],
  ["ص", "C"],
  ["ط", "T"],
  ["ع", "E"],
  ["ف", "F"],
  ["ق", "K"],
  ["ل", "L"],
  ["م", "M"],
  ["ن", "N"],
  ["ه", "H"],
  ["و", "W"],
  ["ي", "Y"],
];

function arabicDigits(n: number, len: number) {
  const map = "٠١٢٣٤٥٦٧٨٩";
  return String(Math.abs(Math.floor(n))).padStart(len, "0").slice(-len).replace(/\d/g, (d) => map[Number(d)]);
}

function latinDigits(n: number, len: number) {
  return String(Math.abs(Math.floor(n))).padStart(len, "0").slice(-len);
}

function paintEgyptianPlate(
  kind: VehicleId,
  seed: number,
  _sloganId = "dar",
  _sticker = "none",
  playerPlate = false,
) {
  const canvas = document.createElement("canvas");
  canvas.width = 700;
  canvas.height = 340;
  const g = canvas.getContext("2d");
  if (!g) return canvas;
  if (kind === "tuktuk") {
    const num = playerPlate ? Math.max(1, Math.floor(Math.abs(seed))) : 100 + (Math.abs(seed) % 900);
    const digitsN = playerPlate ? String(num).length : 3;
    g.fillStyle = "#141414";
    g.fillRect(0, 0, 700, 340);
    g.fillStyle = "#f4f1ea";
    g.fillRect(10, 10, 680, 320);
    g.fillStyle = "#24527e";
    g.fillRect(10, 10, 680, 108);
    g.fillStyle = "#fff";
    g.textAlign = "center";
    g.direction = "rtl";
    g.font = "800 58px Tajawal, 'Noto Naskh Arabic', sans-serif";
    g.fillText("دار السلام", 350, 82);
    g.fillStyle = "#17191d";
    g.direction = "ltr";
    g.font = "800 124px Tajawal, 'Noto Naskh Arabic', sans-serif";
    g.fillText(arabicDigits(num, digitsN), 350, 238);
    g.font = "700 40px Arial, sans-serif";
    g.fillText(latinDigits(num, digitsN).split("").join("  "), 350, 300);
    return canvas;
  }
  const header =
    kind === "truck" ? "#d21f1f" : kind === "taxi" || kind === "micro" ? "#f08a12" : "#3c8fd4";
  const digitsN = 3;
  const num = 100 + (Math.abs(seed) % 900);
  const letters = [0, 1, 2].map((i) => PLATE_PAIRS[(Math.abs(seed) + i * 5) % PLATE_PAIRS.length]);
  g.fillStyle = "#141414";
  g.fillRect(0, 0, 700, 340);
  g.fillStyle = header;
  g.fillRect(10, 10, 680, 108);
  g.fillStyle = "#f4f1ea";
  g.fillRect(10, 118, 680, 212);
  g.fillStyle = "#111";
  g.fillRect(348, 128, 4, 190);
  g.fillStyle = "#e8e4dc";
  g.beginPath();
  g.arc(36, 40, 11, 0, Math.PI * 2);
  g.arc(664, 40, 11, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#111";
  g.textAlign = "left";
  g.direction = "ltr";
  g.font = "800 54px Arial, sans-serif";
  g.fillText("EGYPT", 56, 82);
  g.textAlign = "right";
  g.font = "800 64px Tajawal, 'Noto Naskh Arabic', sans-serif";
  g.fillText("مصر", 640, 86);
  const arNum = arabicDigits(num, digitsN);
  const latNum = latinDigits(num, digitsN);
  g.textAlign = "center";
  g.direction = "ltr";
  g.font = "800 118px Tajawal, 'Noto Naskh Arabic', sans-serif";
  g.fillText(arNum, 180, 230);
  g.font = "700 42px Arial, sans-serif";
  g.fillText(latNum.split("").join("  "), 180, 292);
  const shown = [...letters].reverse();
  g.font = "800 100px Tajawal, 'Noto Naskh Arabic', sans-serif";
  g.fillText(shown.map((pair) => pair[0]).join("  "), 524, 226);
  g.font = "700 40px Arial, sans-serif";
  g.fillText(shown.map((pair) => pair[1]).join("   "), 524, 292);
  return canvas;
}

function localBodyBox(root: THREE.Object3D) {
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  const inv = new THREE.Matrix4();
  root.updateWorldMatrix(true, true);
  inv.copy(root.matrixWorld).invert();
  let any = false;
  root.traverse((obj) => {
    let skip: THREE.Object3D | null = obj;
    while (skip) {
      if (skip.name === "workshop-kit" || skip.name === "eg-plate" || skip.name === "player-rider") return;
      skip = skip.parent;
    }
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    const geo = mesh.geometry;
    if (!geo.boundingBox) geo.computeBoundingBox();
    const bb = geo.boundingBox;
    if (!bb || bb.isEmpty()) return;
    for (const x of [bb.min.x, bb.max.x]) {
      for (const y of [bb.min.y, bb.max.y]) {
        for (const z of [bb.min.z, bb.max.z]) {
          v.set(x, y, z).applyMatrix4(mesh.matrixWorld).applyMatrix4(inv);
          box.expandByPoint(v);
          any = true;
        }
      }
    }
  });
  if (!any) box.set(new THREE.Vector3(-0.7, 0, -1.27), new THREE.Vector3(0.7, 1.55, 1.27));
  return box;
}

function attachRearMark(
  root: THREE.Object3D,
  kind: VehicleId,
  custom?: { slogan: SloganId; sticker: StickerId; seed: number },
) {
  const seed = custom?.seed ?? 1000 + Math.floor(Math.random() * 9000);
  const playerPlate = Boolean(custom);
  const tex = new THREE.CanvasTexture(paintEgyptianPlate(kind, seed, custom?.slogan, custom?.sticker, playerPlate));
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    roughness: 0.55,
    metalness: 0.02,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const bounds = localBodyBox(root);
  const size = bounds.getSize(new THREE.Vector3());
  const sane = size.z > 1.2 && size.z < 14 && size.y > 0.4 && size.y < 6;
  const rearZ = sane ? bounds.max.z + 0.03 : kind === "tuktuk" ? 1.22 : kind === "truck" ? 3.7 : 2.15;
  const y = sane
    ? bounds.min.y + size.y * (kind === "tuktuk" ? 0.55 : kind === "truck" ? 0.46 : kind === "micro" ? 0.4 : 0.34)
    : kind === "tuktuk"
      ? 0.95
      : 0.7;
  const w = kind === "truck" ? 0.96 : kind === "micro" ? 0.74 : kind === "tuktuk" ? 0.7 : 0.64;
  const h = w * (17 / 35);
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  plate.name = "eg-plate";
  plate.position.set(0, y, rearZ);
  plate.frustumCulled = false;
  root.add(plate);
  if (document.fonts && document.fonts.status !== "loaded") {
    void document.fonts.ready.then(() => {
      const fresh = new THREE.CanvasTexture(
        paintEgyptianPlate(kind, seed, custom?.slogan, custom?.sticker, playerPlate),
      );
      fresh.colorSpace = THREE.SRGBColorSpace;
      fresh.anisotropy = 8;
      mat.map = fresh;
      mat.needsUpdate = true;
      tex.dispose();
    });
  }
}

let egyptFlagCanvas: HTMLCanvasElement | null = null;
function egyptFlagTexture() {
  if (!egyptFlagCanvas) {
    egyptFlagCanvas = document.createElement("canvas");
    egyptFlagCanvas.width = 180;
    egyptFlagCanvas.height = 120;
    const g = egyptFlagCanvas.getContext("2d");
    if (g) {
      g.fillStyle = "#ce1126";
      g.fillRect(0, 0, 180, 40);
      g.fillStyle = "#ffffff";
      g.fillRect(0, 40, 180, 40);
      g.fillStyle = "#111111";
      g.fillRect(0, 80, 180, 40);
      g.fillStyle = "#c5a035";
      g.beginPath();
      g.ellipse(90, 62, 18, 11, 0, 0, Math.PI * 2);
      g.fill();
    }
  }
  const tex = new THREE.CanvasTexture(egyptFlagCanvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeKit(bounds: THREE.Box3, ids: readonly string[]) {
  const g = new THREE.Group();
  g.name = "workshop-kit";
  const size = bounds.getSize(new THREE.Vector3());
  const roof = bounds.max.y;
  const rear = bounds.max.z;
  const span = Math.max(0.7, Math.min(size.x || 1.3, 1.55));
  const metal = new THREE.MeshStandardMaterial({ color: "#cfc6b8", metalness: 0.55, roughness: 0.35 });
  if (ids.includes("flag")) {
    const z = rear - Math.min(0.22, size.z * 0.08);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.42, 6), metal);
    pole.position.set(span * 0.28, roof + 0.2, z);
    const cloth = new THREE.Mesh(
      new THREE.PlaneGeometry(0.34, 0.2),
      new THREE.MeshStandardMaterial({ map: egyptFlagTexture(), side: THREE.DoubleSide, roughness: 0.55 }),
    );
    cloth.position.set(span * 0.28 + 0.18, roof + 0.32, z);
    g.add(pole, cloth);
  }
  if (ids.includes("neon")) {
    const strip = new THREE.Mesh(
      new THREE.BoxGeometry(span * 0.86, 0.035, 0.045),
      new THREE.MeshStandardMaterial({
        color: "#d7fbff",
        emissive: "#3ad7ff",
        emissiveIntensity: 2,
        roughness: 0.2,
      }),
    );
    strip.position.set(0, roof + 0.03, rear - 0.03);
    g.add(strip);
  }
  if (ids.includes("lamp")) {
    const z = bounds.min.z + size.z * 0.32;
    const bar = new THREE.Mesh(new THREE.BoxGeometry(span * 0.55, 0.04, 0.06), metal);
    bar.position.set(0, roof + 0.045, z);
    const bulbMat = new THREE.MeshStandardMaterial({ color: "#fff6d0", emissive: "#ffe7a3", emissiveIntensity: 1.6 });
    const left = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), bulbMat);
    left.position.set(-span * 0.16, roof + 0.05, z - 0.05);
    const right = left.clone();
    right.position.x = span * 0.16;
    g.add(bar, left, right);
  }
  if (ids.includes("beads")) {
    const bead = new THREE.MeshStandardMaterial({ color: "#1f7a45", roughness: 0.35 });
    const top = roof - 0.02;
    for (let i = 0; i < 9; i++) {
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 6), bead);
      ball.position.set(span * 0.06, top - i * 0.046, rear + 0.015);
      g.add(ball);
    }
  }
  return g;
}

function buildPlayer(kind: VehicleId, hex: string) {
  const g = new THREE.Group();
  g.rotation.order = "YXZ";
  const paint = new THREE.MeshPhysicalMaterial({
    color: hex,
    roughness: 0.34,
    metalness: 0.06,
    clearcoat: 0.55,
    clearcoatRoughness: 0.28,
  });
  const glass = new THREE.MeshPhysicalMaterial({
    color: "#b7dbe3",
    roughness: 0.06,
    metalness: 0.05,
    transparent: true,
    opacity: 0.72,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
  });
  const dark = new THREE.MeshStandardMaterial({ color: "#17191d", roughness: 0.62 });
  const tail = new THREE.MeshStandardMaterial({
    color: "#ff3b3b",
    emissive: "#ff2020",
    emissiveIntensity: 0.9,
  });
  const head = new THREE.MeshStandardMaterial({
    color: "#fff6d8",
    emissive: "#ffe7a8",
    emissiveIntensity: 0.35,
  });
  const wheels: THREE.Mesh[] = [];
  const put = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    g.add(m);
    return m;
  };
  const addWheels = (x: number, z: number, r: number) => {
    const geo = new THREE.CylinderGeometry(r, r, r * 0.7, 12);
    geo.rotateZ(Math.PI / 2);
    for (const sx of [-1, 1]) {
      const m = new THREE.Mesh(geo, dark);
      m.position.set(sx * x, r, z);
      g.add(m);
      wheels.push(m);
    }
  };

  if (kind === "micro") {
    put(new THREE.BoxGeometry(2.05, 1.15, 4.9), paint, 0, 1.05, 0.05);
    put(new THREE.BoxGeometry(1.9, 0.48, 1.35), glass, 0, 1.78, -0.95);
    put(new THREE.BoxGeometry(1.75, 0.4, 2.1), glass, 0, 1.72, 0.9);
    put(new THREE.BoxGeometry(0.22, 0.26, 0.08), tail, -0.72, 0.95, 2.52);
    put(new THREE.BoxGeometry(0.22, 0.26, 0.08), tail, 0.72, 0.95, 2.52);
    put(new THREE.BoxGeometry(0.42, 0.22, 0.08), head, -0.65, 0.95, -2.42);
    put(new THREE.BoxGeometry(0.42, 0.22, 0.08), head, 0.65, 0.95, -2.42);
    addWheels(1.02, -1.55, 0.38);
    addWheels(1.02, 1.5, 0.38);
  } else if (kind === "tuktuk") {
    // Realistic Egyptian Bajaj-style tuk-tuk (open cabin, canopy, chrome details)
    const black = dark;
    const chrome = new THREE.MeshStandardMaterial({ color: "#b8c0c8", roughness: 0.22, metalness: 0.88 });
    const canopyMat = new THREE.MeshStandardMaterial({ color: hex, roughness: 0.55, metalness: 0.06 });
    const seatMat = new THREE.MeshStandardMaterial({ color: "#2a2e35", roughness: 0.78 });
    // front floor / engine cover
    put(new THREE.BoxGeometry(1.02, 0.2, 0.88), black, 0, 0.4, -0.98);
    put(new THREE.BoxGeometry(0.95, 0.12, 0.55), black, 0, 0.78, -1.05);
    // main body / passenger cabin
    put(new THREE.BoxGeometry(1.34, 0.52, 1.38), paint, 0, 0.7, 0.28);
    // side body panels (lower)
    put(new THREE.BoxGeometry(0.07, 0.38, 1.32), black, -0.68, 0.52, 0.25);
    put(new THREE.BoxGeometry(0.07, 0.38, 1.32), black, 0.68, 0.52, 0.25);
    // rear passenger bench + backrest
    put(new THREE.BoxGeometry(1.24, 0.16, 0.48), seatMat, 0, 0.82, 0.78);
    put(new THREE.BoxGeometry(1.2, 0.36, 0.1), seatMat, 0, 1.02, 0.95);
    // roof canopy (layered for thickness)
    put(new THREE.BoxGeometry(1.44, 0.055, 1.62), canopyMat, 0, 1.46, 0.15);
    put(new THREE.BoxGeometry(1.5, 0.035, 1.68), black, 0, 1.52, 0.15);
    // canopy support posts
    put(new THREE.BoxGeometry(0.05, 0.55, 0.05), black, -0.66, 1.18, -0.55);
    put(new THREE.BoxGeometry(0.05, 0.55, 0.05), black, 0.66, 1.18, -0.55);
    put(new THREE.BoxGeometry(0.05, 0.55, 0.05), black, -0.66, 1.18, 0.85);
    put(new THREE.BoxGeometry(0.05, 0.55, 0.05), black, 0.66, 1.18, 0.85);
    // front windshield + frame
    put(new THREE.BoxGeometry(1.18, 0.5, 0.04), glass, 0, 1.12, -0.45);
    put(new THREE.BoxGeometry(0.06, 0.52, 0.06), black, -0.59, 1.12, -0.45);
    put(new THREE.BoxGeometry(0.06, 0.52, 0.06), black, 0.59, 1.12, -0.45);
    put(new THREE.BoxGeometry(1.22, 0.05, 0.05), black, 0, 1.38, -0.45);
    // open side frames (characteristic of Egyptian tuk-tuks)
    put(new THREE.BoxGeometry(0.04, 0.45, 0.95), black, -0.69, 1.15, 0.12);
    put(new THREE.BoxGeometry(0.04, 0.45, 0.95), black, 0.69, 1.15, 0.12);
    // steering column + handlebar
    put(new THREE.BoxGeometry(0.07, 0.07, 0.58), chrome, 0, 0.92, -0.78);
    put(new THREE.BoxGeometry(0.58, 0.05, 0.05), chrome, 0, 1.02, -1.05);
    // front round headlights
    const lampGeo = new THREE.SphereGeometry(0.095, 12, 10);
    const lampL = new THREE.Mesh(lampGeo, head);
    lampL.position.set(-0.28, 0.55, -1.32);
    const lampR = new THREE.Mesh(lampGeo, head);
    lampR.position.set(0.28, 0.55, -1.32);
    g.add(lampL, lampR);
    // rear lights
    put(new THREE.BoxGeometry(0.15, 0.1, 0.06), tail, -0.48, 0.62, 0.98);
    put(new THREE.BoxGeometry(0.15, 0.1, 0.06), tail, 0.48, 0.62, 0.98);
    // side mirrors
    put(new THREE.BoxGeometry(0.12, 0.07, 0.05), chrome, -0.78, 1.12, -0.38);
    put(new THREE.BoxGeometry(0.12, 0.07, 0.05), chrome, 0.78, 1.12, -0.38);
    // rear dual wheels
    addWheels(0.62, 0.52, 0.26);
    // single front wheel
    const geo = new THREE.CylinderGeometry(0.26, 0.26, 0.14, 14);
    geo.rotateZ(Math.PI / 2);
    const m = new THREE.Mesh(geo, dark);
    m.position.set(0, 0.26, -1.08);
    g.add(m);
    wheels.push(m);
    // exhaust pipe (side)
    put(new THREE.BoxGeometry(0.06, 0.06, 0.45), chrome, -0.55, 0.35, -0.55);
    put(new THREE.BoxGeometry(0.08, 0.08, 0.12), black, -0.55, 0.35, -0.8);
    // Rear district plate.
    const plateCanvas = paintEgyptianPlate("tuktuk", 1, "dar", "none", true);
    const plateMat = new THREE.MeshStandardMaterial({ color: "#f5f5f0", roughness: 0.45 });
    const ptex = new THREE.CanvasTexture(plateCanvas);
    ptex.colorSpace = THREE.SRGBColorSpace;
    plateMat.map = ptex;
    put(new THREE.BoxGeometry(0.42, 0.204, 0.02), plateMat, 0, 0.55, 0.99);
    const sideCanvas = document.createElement("canvas");
    sideCanvas.width = 256;
    sideCanvas.height = 96;
    const sg = sideCanvas.getContext("2d");
    if (sg) {
      sg.fillStyle = hex;
      sg.fillRect(0, 0, 256, 96);
      sg.fillStyle = "#17191d";
      sg.fillRect(0, 72, 256, 24);
      sg.fillStyle = "#1c1406";
      sg.font = "800 36px Tajawal, sans-serif";
      sg.textAlign = "center";
      sg.direction = "rtl";
      sg.fillText("توكتوك دار السلام", 128, 48);
      const stex = new THREE.CanvasTexture(sideCanvas);
      stex.colorSpace = THREE.SRGBColorSpace;
      const sideMat = new THREE.MeshStandardMaterial({ map: stex, roughness: 0.5 });
      put(new THREE.BoxGeometry(0.02, 0.28, 0.72), sideMat, -0.68, 0.82, 0.22);
      put(new THREE.BoxGeometry(0.02, 0.28, 0.72), sideMat, 0.68, 0.82, 0.22);
    }
    // small stickers / decals on side
    put(new THREE.BoxGeometry(0.18, 0.12, 0.01), new THREE.MeshStandardMaterial({ color: "#c0392b", roughness: 0.5 }), -0.68, 0.85, 0.1);
    put(new THREE.BoxGeometry(0.14, 0.1, 0.01), new THREE.MeshStandardMaterial({ color: "#1a5276", roughness: 0.5 }), 0.68, 0.85, 0.15);
    // driver figure (seated)
    const skin = new THREE.MeshStandardMaterial({ color: "#c49a78", roughness: 0.62 });
    const shirt = new THREE.MeshStandardMaterial({ color: "#1e3a5f", roughness: 0.75 });
    const driver = new THREE.Mesh(new THREE.CapsuleGeometry(0.115, 0.2, 3, 6), shirt);
    driver.position.set(0.04, 0.92, -0.18);
    const hd = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), skin);
    hd.position.set(0.04, 1.18, -0.22);
    g.add(driver, hd);
  } else if (kind === "truck") {
    put(new THREE.BoxGeometry(2.4, 1.45, 7.1), paint, 0, 1.2, 1.4);
    put(new THREE.BoxGeometry(2.15, 1.55, 2.35), paint, 0, 1.4, -3.1);
    put(new THREE.BoxGeometry(1.85, 0.5, 0.85), glass, 0, 1.9, -3.5);
    put(new THREE.BoxGeometry(0.24, 0.18, 0.08), tail, -0.85, 0.8, 4.95);
    put(new THREE.BoxGeometry(0.24, 0.18, 0.08), tail, 0.85, 0.8, 4.95);
    put(new THREE.BoxGeometry(0.3, 0.18, 0.08), head, -0.7, 0.85, -4.25);
    put(new THREE.BoxGeometry(0.3, 0.18, 0.08), head, 0.7, 0.85, -4.25);
    addWheels(1.15, -3.25, 0.42);
    addWheels(1.15, 1.15, 0.42);
    addWheels(1.15, 3.45, 0.42);
  } else {
    put(new THREE.BoxGeometry(1.72, 0.46, 4.3), paint, 0, 0.62, 0);
    put(new THREE.BoxGeometry(1.52, 0.4, 1.9), paint, 0, 1.02, 0.32);
    put(new THREE.BoxGeometry(1.35, 0.34, 1.05), glass, 0, 1.05, -0.2);
    if (kind === "taxi") {
      const lamp = new THREE.MeshStandardMaterial({
        color: "#f0b429",
        emissive: "#f0b429",
        emissiveIntensity: 0.8,
      });
      put(new THREE.BoxGeometry(0.28, 0.14, 0.28), lamp, 0, 1.32, 0.15);
    }
    put(new THREE.BoxGeometry(0.24, 0.14, 0.06), tail, -0.6, 0.7, 2.16);
    put(new THREE.BoxGeometry(0.24, 0.14, 0.06), tail, 0.6, 0.7, 2.16);
    put(new THREE.BoxGeometry(0.32, 0.14, 0.06), head, -0.55, 0.62, -2.16);
    put(new THREE.BoxGeometry(0.32, 0.14, 0.06), head, 0.55, 0.62, -2.16);
    addWheels(0.78, -1.32, 0.32);
    addWheels(0.78, 1.28, 0.32);
  }

  const spotL = new THREE.SpotLight("#fff1cc", 0, 46, Math.PI / 8, 0.45, 1);
  spotL.position.set(-0.45, 0.9, -1.6);
  const spotR = new THREE.SpotLight("#fff1cc", 0, 46, Math.PI / 8, 0.45, 1);
  spotR.position.set(0.45, 0.9, -1.6);
  const target = new THREE.Object3D();
  target.position.set(0, 0.4, -18);
  g.add(spotL, spotR, target);
  spotL.target = target;
  spotR.target = target;

  const rider = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.2, 0.38, 3, 8),
    new THREE.MeshStandardMaterial({ color: "#1d3557", roughness: 0.7 }),
  );
  rider.name = "player-rider";
  rider.position.set(0.02, 1.22, 0.28);
  rider.visible = false;
  g.add(rider);

  g.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
  });

  return { group: g, wheels, paint, spots: [spotL, spotR], rider };
}

function signTexture(title: string, sub: string) {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 256;
  const g = c.getContext("2d");
  if (!g) return null;
  g.fillStyle = "#163e86";
  g.fillRect(0, 0, 512, 256);
  g.fillStyle = "#f0b429";
  g.fillRect(0, 0, 512, 10);
  g.fillStyle = "#f6f1e7";
  g.direction = "rtl";
  g.textAlign = "center";
  g.font = "800 72px Tajawal, sans-serif";
  g.fillText(title, 256, 120);
  g.font = "500 36px Tajawal, sans-serif";
  g.fillStyle = "#d6e4ff";
  g.fillText(sub, 256, 185);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

class Sfx {
  ctx: AudioContext | null = null;
  gain: GainNode | null = null;
  osc: OscillatorNode | null = null;
  filter: BiquadFilterNode | null = null;
  on = true;

  unlock() {
    if (!this.ctx) {
      const ctx = new AudioContext();
      const gain = ctx.createGain();
      gain.gain.value = 0.0001;
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 240;
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = 46;
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      this.ctx = ctx;
      this.gain = gain;
      this.osc = osc;
      this.filter = filter;
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  engine(speed: number, throttle: number) {
    if (!this.ctx || !this.osc || !this.gain || !this.filter || !this.on) {
      if (this.gain) this.gain.gain.value = 0.0001;
      return;
    }
    const k = Math.abs(speed);
    this.osc.frequency.value = 42 + k * 3.1 + throttle * 18;
    this.filter.frequency.value = 180 + k * 18;
    this.gain.gain.value = 0.018 + Math.min(0.04, k * 0.0015);
  }

  blip(freq: number, dur: number, type: OscillatorType, vol: number) {
    if (!this.ctx || !this.on) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.value = vol;
    o.connect(g);
    g.connect(this.ctx.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + dur);
    o.stop(this.ctx.currentTime + dur + 0.02);
  }

  horn() {
    this.blip(340, 0.18, "square", 0.05);
    setTimeout(() => this.blip(280, 0.16, "square", 0.04), 90);
  }

  cash() {
    this.blip(660, 0.08, "sine", 0.05);
    setTimeout(() => this.blip(880, 0.1, "sine", 0.04), 70);
  }

  crash() {
    this.blip(90, 0.22, "sawtooth", 0.07);
  }

  radar() {
    this.blip(980, 0.12, "square", 0.05);
  }

  stop() {
    if (this.gain) this.gain.gain.value = 0.0001;
    void this.ctx?.close();
    this.ctx = null;
  }
}

const defaultCfg: PreviewCfg = {
  mode: "shift",
  vehicle: "tuktuk",
  night: false,
  density: 1,
  paint: "#f0b429",
  sound: true,
};

export function mountGame(
  canvas: HTMLCanvasElement,
  map: HTMLCanvasElement,
  onHud: (h: Hud) => void,
): GameHandle {
  const track = buildTrack();
  const save = loadSave();
  const sfx = new Sfx();
  sfx.on = save.sound;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.18;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setClearColor("#6eb4ea");
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog("#c5d8e6", 80, 360);
  const camera = new THREE.PerspectiveCamera(68, 1, 0.12, 900);

  const hemi = new THREE.HemisphereLight("#f7f0e6", "#9a8468", 0.95);
  const sun = new THREE.DirectionalLight("#ffe8c4", 1.85);
  sun.position.set(-110, 140, 55);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.near = 2;
  sun.shadow.camera.far = 80;
  sun.shadow.camera.left = -24;
  sun.shadow.camera.right = 24;
  sun.shadow.camera.top = 24;
  sun.shadow.camera.bottom = -24;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  scene.add(hemi, sun, sun.target);

  const streetGlow = new THREE.PointLight("#ffc48a", 0, 22, 1.5);
  scene.add(streetGlow);

  const dome = skyDome();
  scene.add(dome.mesh);

  const ground = new THREE.Mesh(new THREE.CircleGeometry(980, 48), dirtMaterial());
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.08;
  ground.receiveShadow = true;
  scene.add(ground);

  buildRoad(scene, track);
  const buildings = buildCity(scene, track);
  const lamps = buildLamps(scene, track);
  buildPosts(scene, track);
  buildLandmarks(scene, track);
  dressFayoum(scene, track);
  dressStreet(scene, track);
  placeDogs(scene, track);
  placeBikes(scene, track);
  placeBridgeWalls(scene, track);
  placeMetroRun(scene, track);
  const signs: THREE.Mesh[] = [];

  const pools = new Map<VehicleId, { body: THREE.InstancedMesh; glass: THREE.InstancedMesh; wheels: THREE.InstancedMesh; lights: THREE.InstancedMesh }>();
  const POOL = 56;
  const glassMat = new THREE.MeshStandardMaterial({ color: "#1c3c48", roughness: 0.18, metalness: 0.2 });
  const wheelMat = new THREE.MeshStandardMaterial({ color: "#16181c", roughness: 0.7 });
  const lightMat = new THREE.MeshStandardMaterial({ color: "#ff3030", emissive: "#ff2020", emissiveIntensity: 0.85 });
  for (const kind of KINDS) {
    const ge = trafficGeoms(kind);
    const bodyMat = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.55, metalness: 0.08 });
    const mk = (geo: THREE.BufferGeometry, mat: THREE.Material) => {
      const m = new THREE.InstancedMesh(geo, mat, POOL);
      m.frustumCulled = false;
      m.count = 0;
      m.visible = false;
      scene.add(m);
      return m;
    };
    pools.set(kind, {
      body: mk(ge.body, bodyMat),
      glass: mk(ge.glass, glassMat),
      wheels: mk(ge.wheels, wheelMat),
      lights: mk(ge.lights, lightMat),
    });
  }

  const dummy = new THREE.Object3D();
  const PEOPLE = 64;
  const people = new THREE.InstancedMesh(
    new THREE.CapsuleGeometry(0.22, 0.48, 3, 6),
    new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.78 }),
    PEOPLE,
  );
  people.frustumCulled = false;
  people.visible = false;
  people.count = 0;
  scene.add(people);
  const hideAll = () => {
    dummy.position.set(0, -20, 0);
    dummy.scale.set(0, 0, 0);
    dummy.updateMatrix();
    for (const p of pools.values()) {
      for (let i = 0; i < POOL; i++) {
        p.body.setMatrixAt(i, dummy.matrix);
        p.glass.setMatrixAt(i, dummy.matrix);
        p.wheels.setMatrixAt(i, dummy.matrix);
        p.lights.setMatrixAt(i, dummy.matrix);
      }
    }
  };
  hideAll();

  const playerMesh = buildPlayer("tuktuk", save.paint);
  playerMesh.group.visible = false;
  scene.add(playerMesh.group);

  function dropNamed(name: string) {
    const prev = playerMesh.group.getObjectByName(name);
    if (!prev) return;
    playerMesh.group.remove(prev);
    prev.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry?.dispose();
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of mats) {
        const std = mat as THREE.MeshStandardMaterial;
        std.map?.dispose();
        std.dispose();
      }
    });
  }

  function restylePlayer() {
    dropNamed("eg-plate");
    dropNamed("workshop-kit");
    tintPlayer(save.paint);
    attachRearMark(playerMesh.group, "tuktuk", {
      slogan: save.slogan,
      sticker: save.sticker,
      seed: save.plateNo,
    });
    playerMesh.group.add(makeKit(localBodyBox(playerMesh.group), save.accessories));
  }
  restylePlayer();
  void document.fonts?.load("800 80px Tajawal").then(() => restylePlayer());

  const gltfLoader = streetLoader();
  const modelCache = new Map<string, THREE.Group>();
  function loadFitted(
    url: string,
    opts: { length?: number; height?: number; nose?: boolean; compact?: boolean },
  ): Promise<THREE.Group> {
    const key = `${url}|${opts.length ?? ""}|${opts.height ?? ""}|${opts.nose ? 1 : 0}|${opts.compact === false ? 0 : 1}`;
    const hit = modelCache.get(key);
    if (hit) return Promise.resolve(cloneModel(hit));
    return new Promise((resolve) => {
      gltfLoader.load(
        url,
        (gltf) => {
          const fitted = fitProp(gltf.scene, opts);
          modelCache.set(key, fitted);
          resolve(cloneModel(fitted));
        },
        undefined,
        () => resolve(new THREE.Group()),
      );
    });
  }

  function tintPlayer(hex: string) {
    const color = new THREE.Color(hex);
    playerMesh.group.traverse((obj) => {
      let skip: THREE.Object3D | null = obj;
      while (skip) {
        if (skip.name === "workshop-kit" || skip.name === "eg-plate") return;
        skip = skip.parent;
      }
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh || !mesh.material) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of mats) {
        const std = mat as THREE.MeshStandardMaterial;
        if (!std.color) continue;
        if (std.emissive && std.emissive.r > 0.25 && std.emissive.g < 0.2) continue;
        const hsl = { h: 0, s: 0, l: 0 };
        std.color.getHSL(hsl);
        if (hsl.l < 0.2 || hsl.l > 0.78) continue;
        std.color.copy(color);
      }
    });
  }

  loadFitted("/models/low_poly_autorickshaw_aka_tuktuk.glb", { length: 2.55, nose: true, compact: false }).then((model) => {
    model.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh || !mesh.material) return;
      mesh.castShadow = true;
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map((m) => m.clone()) : mesh.material.clone();
    });
    const old = playerMesh.group;
    const rider = playerMesh.rider;
    old.remove(rider);
    for (const spot of playerMesh.spots) {
      const target = spot.target;
      old.remove(spot);
      if (target) old.remove(target);
      model.add(spot);
      if (target && target.parent !== model) model.add(target);
    }
    rider.position.set(0, 1.15, 0.05);
    model.add(rider);
    scene.remove(old);
    playerMesh.group = model;
    playerMesh.wheels = [];
    restylePlayer();
    playerMesh.group.visible = true;
    if (phase === "menu") player.speed = 11;
    scene.add(playerMesh.group);
    (window as unknown as { __tukReady?: boolean }).__tukReady = true;
  });

  const trafficModels = new Map<VehicleId, THREE.Group[]>();
  const trafficUrls: Record<VehicleId, { url: string; length: number; nose: boolean }[]> = {
    // nose: extra 180°. Only models whose hood already points +Z need it; the rest already face −Z after the long-axis align.
    tuktuk: [{ url: "/models/low_poly_autorickshaw_aka_tuktuk.glb", length: 2.55, nose: true }],
    micro: [
      { url: "/models/2005_toyota_hiace.glb", length: 4.9, nose: false },
      { url: "/models/2018_toyota_hiace_version_2.glb", length: 5.15, nose: false },
    ],
    taxi: [
      { url: "/models/toyota_corolla.glb", length: 4.45, nose: true },
      { url: "/models/toyota_corola.glb", length: 4.4, nose: false },
      { url: "/models/toyota_caisor.glb", length: 4.5, nose: false },
    ],
    malaky: [
      { url: "/models/2013_mitsubishi_lancer_es5.glb", length: 4.55, nose: false },
      { url: "/models/toyota_corolla_egypt_2004.glb", length: 4.5, nose: true },
      { url: "/models/2014_nissan_ddsen.glb", length: 4.5, nose: false },
    ],
    truck: [
      { url: "/models/toyota_hilux.glb", length: 5.25, nose: false },
      { url: "/models/ud_quon.glb", length: 7.6, nose: false },
      { url: "/models/thaco_auman.glb", length: 8.1, nose: false },
    ],
  };
  Promise.all(
    Object.entries(trafficUrls).flatMap(([kind, items]) =>
      items.map((item) =>
        loadFitted(item.url, { length: item.length, nose: item.nose }).then((m) => ({ kind: kind as VehicleId, m })),
      ),
    ),
  ).then((loaded) => {
    for (const { kind, m } of loaded) {
      if (!m.children.length) continue;
      if (!trafficModels.has(kind)) trafficModels.set(kind, []);
      trafficModels.get(kind)!.push(m);
    }
    (window as unknown as { __streetReady?: boolean }).__streetReady = true;
    parkAlongCurb();
  });

  const peopleModels: THREE.Object3D[] = [];
  let streetPeople: THREE.Object3D[] = [];
  let peopleStamp = -1;
  loadFitted("/models/arab_female_with_abaya.glb", { height: 1.66, nose: true }).then((m) => {
    if (m.children.length) peopleModels.push(m);
  });
  loadFitted("/models/woman_hijab.glb", { height: 1.66, nose: true }).then((m) => {
    if (m.children.length) peopleModels.push(m);
  });

  const realTraffic: { kind: VehicleId; mesh: THREE.Group; used: boolean }[] = [];
  function getRealMesh(kind: VehicleId): THREE.Group | null {
    const pool = trafficModels.get(kind);
    if (!pool || !pool.length) return null;
    const free = realTraffic.find((r) => r.kind === kind && !r.used);
    if (free) {
      free.used = true;
      return free.mesh;
    }
    const src = pool[Math.floor(Math.random() * pool.length)];
    const mesh = cloneModel(src);
    attachRearMark(mesh, kind);
    mesh.visible = false;
    scene.add(mesh);
    realTraffic.push({ kind, mesh, used: true });
    return mesh;
  }
  function releaseReal() {
    for (const r of realTraffic) {
      r.used = false;
      r.mesh.visible = false;
    }
  }

  function parkAlongCurb() {
    const kinds: VehicleId[] = ["malaky", "taxi", "micro", "malaky", "taxi"];
    const pts = track.pts;
    let n = 0;
    for (let i = 12; i < pts.length && n < 24; i += 16) {
      const p = pts[i];
      if (p.s < 22 || (p.s > 145 && p.s < 335)) continue;
      const nxt = pts[(i + 6) % pts.length];
      const bend = Math.abs(((nxt.yaw - p.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (bend > 0.18) continue;
      const kind = kinds[n % kinds.length];
      const pool = trafficModels.get(kind);
      if (!pool?.length) continue;
      const mesh = cloneModel(pool[n % pool.length]);
      attachRearMark(mesh, kind);
      const side = n % 2 === 0 ? 1 : -1;
      const rx = Math.cos(p.yaw);
      const rz = -Math.sin(p.yaw);
      mesh.position.set(p.x + rx * side * 7.5, 0, p.z + rz * side * 7.5);
      mesh.rotation.y = p.yaw + (side > 0 ? Math.PI : 0);
      scene.add(mesh);
      n += 1;
    }
  }

  const sparkGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
  const sparkMat = new THREE.MeshBasicMaterial({ color: "#f0b429" });
  const sparks: { m: THREE.Mesh; v: THREE.Vector3; life: number }[] = [];
  for (let i = 0; i < 18; i++) {
    const m = new THREE.Mesh(sparkGeo, sparkMat);
    m.visible = false;
    scene.add(m);
    sparks.push({ m, v: new THREE.Vector3(), life: 0 });
  }
  const dustN = 28;
  const dustArr = new Float32Array(dustN * 3);
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute("position", new THREE.BufferAttribute(dustArr, 3));
  const dustMat = new THREE.PointsMaterial({
    color: "#cbb89a",
    size: 0.16,
    transparent: true,
    opacity: 0.05,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const dust = new THREE.Points(dustGeo, dustMat);
  dust.frustumCulled = false;
  scene.add(dust);

  const keys = new Set<string>();
  let probeKeys: Set<string> | null = null;
  let probeSteer: number | null = null;
  const touch = { steer: 0, throttle: 0, brake: 0 };

  const player = {
    x: 0,
    z: 0,
    yaw: 0,
    speed: 0,
    hint: 0,
    spin: 0,
  };

  let cfg: PreviewCfg = { ...defaultCfg, sound: save.sound };
  let phase: Phase = "menu";
  let money = 0;
  let km = 0;
  let time = 0;
  let crashes = 0;
  let pax: Pax[] = [];
  let waiting = track.stops.map(() => 2 + Math.floor(Math.random() * 4));
  let serviced = -1;
  let message = "";
  let messageT = 0;
  let alert: Hud["alert"] = null;
  let alertT = 0;
  let hitCd = 0;
  let hornCd = 0;
  let radarCd = 0;
  let tollLatch = false;
  let camMode = 1;
  let shake = 0;
  let steerVis = 0;
  let wheelSpin = 0;
  let saveTick = 0;
  const npcs: Npc[] = [];
  const peds: Ped[] = [];
  let fuel = 100;
  let gasLatch = false;
  let fuelWarned = false;
  let halfWarned = false;
  let bumpCd = 0;
  let fuelBeep = 0;
  let hitstop = 0;
  let jobs: number[] = [];
  let jobIndex = 0;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const camPos = new THREE.Vector3(0, 8, 20);
  const look = new THREE.Vector3();
  const desired = new THREE.Vector3();
  let last = performance.now();
  let acc = 0;
  let hudAcc = 0;
  let raf = 0;
  let running = true;

  const placeOn = (s: number, lane: number) => {
    const sm = track.sample(s);
    const rx = Math.cos(sm.yaw);
    const rz = -Math.sin(sm.yaw);
    const lat = laneLat(lane);
    player.x = sm.x + rx * lat;
    player.z = sm.z + rz * lat;
    player.yaw = sm.yaw;
    player.hint = 0;
    player.speed = 0;
  };

  const bootCinematic = () => {
    placeOn(track.stops[0].s, 2);
    player.speed = 0;
  };
  bootCinematic();

  function densityCount() {
    return cfg.density === 0 ? 16 : cfg.density === 2 ? 40 : 28;
  }

  function wrapS(s: number) {
    let x = s % track.total;
    if (x < 0) x += track.total;
    return x;
  }

  function onBridge(s: number) {
    return s > 150 && s < 330;
  }

  function freeSlot(base: number, lane: number, dir: 1 | -1, self: Npc | null) {
    let s = wrapS(base);
    for (let k = 0; k < 6; k++) {
      const blocked = npcs.some(
        (o) =>
          o !== self &&
          o.dir === dir &&
          Math.abs(o.lane - lane) < 0.65 &&
          Math.abs(wrapDelta(o.s, s, track.total)) < 11,
      );
      if (!blocked) return s;
      s = wrapS(s + 14);
    }
    return s;
  }

  function spawnTraffic(around: number) {
    npcs.length = 0;
    const n = densityCount();
    const weights: VehicleId[] = ["tuktuk", "micro", "taxi", "malaky", "tuktuk", "truck", "malaky", "tuktuk"];
    const paints = ["#f4f1ea", "#cfd3d8", "#24527e", "#c45c3e", "#e6c27a", "#3d6b62", "#8d939c"];
    const same = Math.ceil(n * 0.55);
    const pushCar = (dir: 1 | -1, i: number, count: number) => {
      const kind = weights[(i + (dir < 0 ? 2 : 0)) % weights.length];
      const spec = vehicleById(kind);
      const curb = dir > 0 ? 3 : 0;
      const inner = dir > 0 ? 2 : 1;
      const lane = kind === "truck" ? curb : i % 2 === 0 ? inner : curb;
      const col = new THREE.Color(paints[(i + (dir < 0 ? 3 : 0)) % paints.length]);
      if (kind === "taxi") col.set("#f0d56a");
      if (kind === "tuktuk") col.set(["#f0b429", "#17191d", "#e23b2b", "#f4f1ea"][i % 4]);
      if (kind === "micro") col.set(["#f4f4f1", "#e4e2da", "#d5dde3"][i % 3]);
      const cruise = spec.max * (kind === "tuktuk" ? 0.46 : kind === "truck" ? 0.4 : 0.36) * (0.86 + (i % 4) * 0.05);
      const s = freeSlot(around + 20 + (i * 230) / Math.max(1, count), lane, dir, null);
      npcs.push({
        alive: true,
        kind,
        s,
        lane,
        laneTarget: lane,
        speed: cruise * 0.85,
        cruise,
        brake: 0,
        color: col,
        nextLane: 1.2 + (i % 4) * 0.7,
        dir,
        laneVel: 0,
        heading: dir > 0 ? 0 : Math.PI,
      });
    };
    for (let i = 0; i < same; i++) pushCar(1, i, same);
    for (let i = 0; i < n - same; i++) pushCar(-1, i, n - same);
  }

  function spawnPeds() {
    peds.length = 0;
    const count = 132;
    for (let i = 0; i < count; i++) {
      const side: 1 | -1 = i % 2 === 0 ? 1 : -1;
      let s = wrapS((track.total * (i + 0.17)) / count);
      if (onBridge(s)) s = wrapS(s + 200);
      const extra = (i % 4) * 0.22;
      const dir: 1 | -1 = i % 3 === 0 ? -1 : 1;
      const face = track.sample(s).yaw + (dir > 0 ? 0 : Math.PI);
      peds.push({
        s,
        side,
        extra,
        dir,
        speed: 1.15 + (i % 5) * 0.08,
        mode: i % 14 === 0 ? "wait" : "walk",
        wait: 0.8 + (i % 4) * 0.5,
        lat: side * (ROAD_HALF + 1.45 + extra),
        phase: i * 1.7,
        face,
      });
    }
  }
  spawnTraffic(track.stops[0].s);
  spawnPeds();

  function burst(x: number, z: number) {
    for (const s of sparks) {
      if (s.life > 0) continue;
      s.life = 0.45;
      s.m.visible = true;
      s.m.position.set(x, 0.6, z);
      s.v.set((Math.random() - 0.5) * 8, 2 + Math.random() * 4, (Math.random() - 0.5) * 8);
    }
  }

  function say(text: string) {
    message = text;
    messageT = 2.4;
  }

  function flash(kind: Hud["alert"]) {
    alert = kind;
    alertT = 0.45;
  }

  function swapPlayer(_kind: VehicleId, hex: string) {
    tintPlayer(hex);
  }

  const topDay = new THREE.Color("#3d92d6");
  const topNight = new THREE.Color("#070b14");
  const horDay = new THREE.Color("#e7dcc4");
  const horNight = new THREE.Color("#1a140e");
  const skyDay = new THREE.Color("#6eb4ea");
  const skyNight = new THREE.Color("#060a12");
  const sky = new THREE.Color();
  const fogDay = new THREE.Color("#c5d8e6");
  const fogNight = new THREE.Color("#060a12");
  const fogC = new THREE.Color();
  const hemiDay = new THREE.Color("#f5efe4");
  const hemiNight = new THREE.Color("#2a3a50");
  const groundDay = new THREE.Color("#a89270");
  const groundNight = new THREE.Color("#15100c");

  function applyDusk(t: number) {
    const n = Math.max(0, Math.min(1, t));
    sky.copy(skyDay).lerp(skyNight, n);
    fogC.copy(fogDay).lerp(fogNight, n);
    renderer.setClearColor(sky);
    const fog = scene.fog as THREE.Fog;
    fog.color.copy(fogC);
    fog.near = 80 - n * 28;
    fog.far = 360 - n * 100;
    hemi.color.copy(hemiDay).lerp(hemiNight, n);
    hemi.groundColor.copy(groundDay).lerp(groundNight, n);
    hemi.intensity = 0.95 - n * 0.72;
    sun.intensity = 2.15 - n * 1.85;
    dome.uniforms.topColor.value.copy(topDay).lerp(topNight, n);
    dome.uniforms.horizonColor.value.copy(horDay).lerp(horNight, n);
    dome.uniforms.sunDir.value.set(-0.45, 0.55 - n * 0.95, 0.28).normalize();
    for (const mat of buildings) mat.emissiveIntensity = n * 0.22;
    lamps.emissiveIntensity = 0.06 + n * 1.5;
    streetGlow.intensity = n * 14;
    const spot = 0.15 + n * 8.5;
    for (const spotL of playerMesh.spots) spotL.intensity = spot;
  }

  function duskNow() {
    if (phase !== "play" && phase !== "pause" && phase !== "summary") return cfg.night ? 0.92 : 0.02;
    if (cfg.night) return Math.min(1, 0.78 + time / 500);
    if (cfg.mode === "shift") return Math.min(1, time / (SHIFT_SECONDS * 0.92));
    return 0.22;
  }
  applyDusk(cfg.night ? 0.92 : 0.18);

  function drawSigns() {
    for (const s of signs) {
      scene.remove(s);
      s.geometry.dispose();
      (s.material as THREE.Material).dispose();
    }
    signs.length = 0;
    for (const stop of track.stops) {
      const tex = signTexture(stop.name, "المسار");
      if (!tex) continue;
      const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 });
      const sm = track.sample(stop.s - 70);
      const rx = Math.cos(sm.yaw);
      const rz = -Math.sin(sm.yaw);
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 3.6), mat);
      mesh.position.set(sm.x + rx * 11.2, 3.3, sm.z + rz * 11.2);
      mesh.rotation.y = sm.yaw;
      scene.add(mesh);
      signs.push(mesh);
    }
    const gasTex = signTexture("بنزينة", "اهدى يمين");
    if (gasTex) {
      const mat = new THREE.MeshStandardMaterial({ map: gasTex, roughness: 0.55 });
      const sm = track.sample(track.gasS - 36);
      const rx = Math.cos(sm.yaw);
      const rz = -Math.sin(sm.yaw);
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 3.2), mat);
      mesh.position.set(sm.x + rx * 10.4, 3.1, sm.z + rz * 10.4);
      mesh.rotation.y = sm.yaw;
      scene.add(mesh);
      signs.push(mesh);
    }
  }
  void document.fonts?.ready.then(() => {
    drawSigns();
    placeShopSigns(scene, track);
    placeLocalSigns(scene, track);
  });

  function persist() {
    if (money > save.bestMoney) save.bestMoney = money;
    if (km > save.bestKm) save.bestKm = km;
    save.sound = sfx.on;
    writeSave(save);
  }

  function specNow() {
    const base = vehicleById("tuktuk");
    const u = save.upgrades;
    return {
      ...base,
      max: base.max + u.motor * 1.65,
      accel: base.accel + u.motor * 1.1,
      turn: base.turn + u.tires * 0.18,
      fare: base.fare * (1 + u.seats * 0.22),
      name: "توكتوك",
    };
  }

  function pay(cost: number) {
    if (money >= cost) {
      money -= cost;
      return true;
    }
    if (money + save.wallet >= cost) {
      save.wallet -= cost - money;
      money = 0;
      return true;
    }
    return false;
  }

  function rollJobs(fromStop: number) {
    jobs = [];
    let i = fromStop;
    for (let k = 0; k < JOBS_NEED; k++) {
      const hop = 2 + Math.floor(Math.random() * 3);
      i = (i + hop) % track.stops.length;
      jobs.push(i);
    }
    jobIndex = 0;
  }

  function resetRun(startS: number) {
    money = 0;
    km = 0;
    time = 0;
    crashes = 0;
    fuel = 100;
    gasLatch = false;
    fuelWarned = false;
    halfWarned = false;
    bumpCd = 0;
    pax = [];
    waiting = track.stops.map(() => 1 + Math.floor(Math.random() * 4));
    serviced = -1;
    hitCd = 0;
    radarCd = 0;
    tollLatch = false;
    message = "";
    alert = null;
    placeOn(startS, 2);
    spawnTraffic(startS);
    const here = track.stops.reduce((best, stop, i) => {
      const d = Math.abs(stop.s - startS);
      return d < best.d ? { d, i } : best;
    }, { d: Infinity, i: 0 }).i;
    rollJobs(here);
    if (cfg.mode === "shift") say("المسار من مدرسة المعمارية لحد محطة أبو طالب");
    else if (cfg.mode === "rush") say(`أول توصيلة: ${track.stops[jobs[0]].name}`);
    else say("امشي المسار لحد محطة أبو طالب، خلي بالك من البنزين");
  }

  function settle() {
    if (money > save.bestMoney) save.bestMoney = money;
    if (km > save.bestKm) save.bestKm = km;
    if (cfg.mode === "shift") {
      if (money >= RENT) {
        save.wallet += money - RENT;
        say("الإيجار اتسدد");
        sfx.cash();
      } else if (save.wallet >= RENT - money) {
        save.wallet -= RENT - money;
        say("كمّلت الإيجار من المحفظة");
      } else {
        say(`فاضل ${RENT - money - save.wallet} ج على الإيجار`);
      }
    } else if (cfg.mode === "rush") {
      save.wallet += money;
      if (jobIndex >= JOBS_NEED) {
        if (save.bestTrial == null || time < save.bestTrial) {
          save.bestTrial = time;
          say("رقم جديد في التوصيلات");
        } else say("خلّصت الأربع توصيلات");
        sfx.cash();
      } else say("وقفت التوصيلات");
    } else {
      save.wallet += Math.max(0, money);
      say("خلّصت اللفة");
    }
    persist();
  }

  function start(next: PreviewCfg) {
    cfg = { ...next, vehicle: "tuktuk" };
    sfx.on = cfg.sound;
    swapPlayer("tuktuk", cfg.paint);
    phase = "play";
    const startS = track.stops[0].s + 18;
    resetRun(startS);
    sfx.unlock();
    publish();
  }

  function forwardDist(targetS: number, fromS: number) {
    let d = targetS - fromS;
    while (d < 0) d += track.total;
    while (d >= track.total) d -= track.total;
    return d;
  }

  function hud(): Hud {
    const spec = specNow();
    const proj = track.project(player.x, player.z, player.hint);
    let bestI = 0;
    let bestD = Infinity;
    for (let i = 0; i < track.stops.length; i++) {
      const d = forwardDist(track.stops[i].s, proj.s);
      if (d < bestD) {
        bestD = d;
        bestI = i;
      }
    }
    let targetI = bestI;
    let targetD = bestD;
    if (cfg.mode === "rush" && jobs[jobIndex] != null) {
      targetI = jobs[jobIndex];
      targetD = forwardDist(track.stops[targetI].s, proj.s);
    }
    const stop = track.stops[targetI];
    let hint = "";
    if (phase === "play") {
      const gasD = Math.abs(wrapDelta(track.gasS, proj.s, track.total));
      const speeding = Math.abs(player.speed) > RADAR_LIMIT;
      const nearRadar = track.radarS.some((rs) => Math.abs(wrapDelta(rs, proj.s, track.total)) < 42);
      const crossing = peds.some(
        (c) =>
          c.mode === "cross" &&
          Math.abs(c.lat) < ROAD_HALF - 0.3 &&
          Math.abs(wrapDelta(c.s, proj.s, track.total)) < 16 &&
          Math.abs(c.lat - proj.lat) < 4.2,
      );
      const bridgeD = Math.abs(wrapDelta(track.stops[0].s, proj.s, track.total));
      if (crossing) hint = "حد بيعدّي قدامك";
      else if (fuel < 22 && gasD < 90) hint = "البنزينة على اليمين";
      else if (speeding && nearRadar) hint = "هدّي، فيه رادار قدام";
      else if (cfg.mode === "rush") {
        if (targetD < 80 && proj.lat < 3.2) hint = "اهدى يمين عند المحطة";
        else if (targetD < 35) hint = "المحطة قدامك — هدّي";
      } else {
        const relevant = waiting[targetI] > 0 || pax.some((person) => person.dest === targetI);
        if (relevant && targetD < 90 && proj.lat < 3.2) hint = "خش يمين وهدّي";
        else if (relevant && targetD < 40 && player.speed > 4.5) hint = "هدّي عند المحطة";
        else if (Math.abs(player.speed) > 12 && proj.lat > 2.8) hint = "الرصيف مليان إشغالات";
      }
      if (!hint && bridgeD < 55 && targetI < 3) hint = "لسه في أول المسار";
      if (!hint && proj.lat < -0.8 && Math.abs(player.speed) > 2) hint = "يمينك، إنت في حارة عكسك";
    }
    const legCue = ROUTE[targetI]?.cue ?? "";
    return {
      phase,
      speed: Math.round(Math.abs(player.speed) * 3.6),
      money: Math.round(money),
      km: Math.round(km * 10) / 10,
      time,
      crashes,
      passengers: pax.map((person) => ({ dest: track.stops[person.dest].name })),
      seats: spec.seats,
      stopName: stop?.name ?? "",
      stopDist: Math.max(0, Math.round(targetD)),
      legCue,
      hint,
      mode: cfg.mode,
      vehicleName: spec.name,
      message: messageT > 0 ? message : "",
      alert: alertT > 0 ? alert : null,
      fuel: Math.max(0, Math.min(100, fuel)),
      rent: RENT,
      shiftLeft: Math.max(0, SHIFT_SECONDS - time),
      wallet: save.wallet,
      upgrades: save.upgrades,
      lowFuel: fuel <= 18,
      jobsDone: jobIndex,
      jobsNeed: JOBS_NEED,
      jobName: jobs[jobIndex] != null ? track.stops[jobs[jobIndex]].name : "خلّصت",
      bestMoney: Math.round(save.bestMoney),
      bestKm: Math.round(save.bestKm * 10) / 10,
      bestTrial: save.bestTrial,
      night: cfg.night,
      sound: sfx.on,
      progress: proj.s / track.total,
      workshop: workshopState(),
    };
  }

  function workshopState(): Workshop {
    return {
      paint: save.paint,
      slogan: save.slogan,
      sticker: save.sticker,
      accessories: save.accessories,
      ownedPaints: save.ownedPaints,
      ownedSlogans: save.ownedSlogans,
      ownedStickers: save.ownedStickers,
      ownedAccessories: save.ownedAccessories,
    };
  }

  function publish() {
    onHud(hud());
  }

  function step(dt: number) {
    const spec = specNow();
    const down = (code: string) => (probeKeys ? probeKeys.has(code) : keys.has(code));

    let steer = 0;
    let throttle = 0;
    let brake = 0;
    if (phase === "play") {
      if (probeSteer != null) steer = probeSteer;
      else {
        if (down("KeyA") || down("ArrowLeft")) steer += 1;
        if (down("KeyD") || down("ArrowRight")) steer -= 1;
        steer += touch.steer;
      }
      if (down("KeyW") || down("ArrowUp")) throttle = 1;
      if (down("KeyS") || down("ArrowDown")) brake = 1;
      throttle = Math.max(throttle, touch.throttle);
      brake = Math.max(brake, touch.brake);
      steer = Math.max(-1, Math.min(1, steer));
    } else if (phase === "menu") {
      throttle = 0.62;
      const proj0 = track.project(player.x, player.z, player.hint);
      const want = laneLat(2);
      const err = want - proj0.lat;
      const dy = wrapAngle(proj0.yaw - player.yaw);
      steer = Math.max(-1, Math.min(1, err * 0.18 + dy * 1.4));
    }

    steerVis = steer;

    if (phase === "play" || phase === "menu") {
      if (throttle > 0 && brake === 0) player.speed += spec.accel * throttle * dt;
      else if (brake > 0) {
        if (player.speed > 0.5) player.speed -= spec.brake * dt;
        else player.speed -= spec.accel * 0.45 * dt;
      } else {
        const sign = Math.sign(player.speed);
        const mag = Math.max(0, Math.abs(player.speed) - 3.2 * dt);
        player.speed = sign * mag;
      }
      const cap = phase === "play" && fuel <= 0 ? 3.3 : spec.max;
      player.speed = Math.max(-6, Math.min(cap, player.speed));

      const sp = Math.min(1, Math.abs(player.speed) / 7);
      const reverse = player.speed < -0.5 ? -1 : 1;
      const turnMul = 0.35 + 0.65 * sp;
      player.yaw += steer * spec.turn * turnMul * reverse * dt;

      const fx = -Math.sin(player.yaw);
      const fz = -Math.cos(player.yaw);
      player.x += fx * player.speed * dt;
      player.z += fz * player.speed * dt;

      const proj = track.project(player.x, player.z, player.hint);
      player.hint = proj.i;
      const limit = 6.55 - spec.width * 0.5;
      if (Math.abs(proj.lat) > limit) {
        const clamped = Math.sign(proj.lat) * limit;
        const rx = Math.cos(proj.yaw);
        const rz = -Math.sin(proj.yaw);
        player.x = proj.x + rx * clamped;
        player.z = proj.z + rz * clamped;
        const impact = Math.abs(proj.lat) - limit;
        if (impact > 0.08) {
          player.speed *= 0.9;
          shake = Math.max(shake, 0.12);
        }
      }

      const along = (() => {
        const tx = -Math.sin(proj.yaw);
        const tz = -Math.cos(proj.yaw);
        return (fx * tx + fz * tz) * player.speed;
      })();

      if (phase === "play") {
        if (along > 0) km += (along * dt) / 1000;
        time += dt;
        const eff = 1 - save.upgrades.fuel * 0.18;
        const moving = Math.abs(player.speed) > 0.35 ? 1 : 0.15;
        fuel -= (0.38 * moving + throttle * 0.72) * eff * dt;
        if (fuel < 0) fuel = 0;
        const bridgeD = Math.abs(wrapDelta(track.stops[0].s, proj.s, track.total));
        if (bridgeD < 78 && player.speed > 9) {
          player.speed += (9 - player.speed) * Math.min(1, dt * 2.4);
        }
        if (hitCd <= 0) {
          for (const occ of OCCUPATIONS) {
            if (Math.abs(wrapDelta(occ.s, proj.s, track.total)) < 2.1 && Math.abs(proj.lat - occ.lat) < 1.2) {
              player.speed *= 0.42;
              shake = Math.max(shake, 0.22);
              hitCd = 0.75;
              if (messageT <= 0) say("إشغال في الحارة — خد جنبك");
              sfx.blip(90, 0.05, "square", 0.03);
              break;
            }
          }
        }
        fuelBeep = Math.max(0, fuelBeep - dt);
        if (fuel < 12 && fuelBeep <= 0) {
          fuelBeep = 3.2;
          sfx.blip(540, 0.05, "square", 0.028);
        }
      }
    }

    hitCd = Math.max(0, hitCd - dt);
    hornCd = Math.max(0, hornCd - dt);
    radarCd = Math.max(0, radarCd - dt);
    bumpCd = Math.max(0, bumpCd - dt);
    messageT = Math.max(0, messageT - dt);
    alertT = Math.max(0, alertT - dt);
    shake = Math.max(0, shake - dt);

    updateNpcs(dt, spec.length);
    updatePeds(dt);
    if (phase === "play") gameplay();

    sfx.engine(player.speed, throttle);
    saveTick += dt;
    if (saveTick > 1.2) {
      saveTick = 0;
      if (money > save.bestMoney) save.bestMoney = money;
      if (km > save.bestKm) save.bestKm = km;
      writeSave(save);
    }
  }

  function updateNpcs(dt: number, _len: number) {
    for (const n of npcs) {
      if (!n.alive) continue;
      const spec = vehicleById(n.kind);
      let target = n.cruise;
      if (onBridge(n.s)) target = Math.min(target, 7.2);

      const curb = n.dir > 0 ? 3 : 0;
      const inner = n.dir > 0 ? 2 : 1;
      if (n.kind === "micro") {
        if (n.brake > 0) {
          n.brake = Math.max(0, n.brake - dt);
          target = 0;
        } else {
          if (n.brake < 0) n.brake = Math.min(0, n.brake + dt);
          if (n.brake === 0 && Math.abs(n.lane - curb) < 0.85) {
            for (const stop of track.stops) {
              if (onBridge(stop.s)) continue;
              const d = wrapDelta(stop.s, n.s, track.total) * n.dir;
              if (d > 0 && d < 24) target = Math.min(target, d < 8 ? 2.1 : 4.4);
              if (d > 0 && d < 3.6 && n.speed < 2.5) n.brake = 2.5;
            }
          }
        }
      }

      let aheadGap = Infinity;
      for (const o of npcs) {
        if (o === n || !o.alive || o.dir !== n.dir) continue;
        if (Math.abs(o.lane - n.lane) > 0.7) continue;
        const gap = wrapDelta(o.s, n.s, track.total) * n.dir;
        if (gap <= 0.3 || gap >= aheadGap) continue;
        aheadGap = gap;
        const need = 5.2 + spec.length * 0.42 + vehicleById(o.kind).length * 0.38;
        if (gap < need) target = Math.min(target, gap < need * 0.42 ? 0 : o.speed * 0.9);
      }

      const rate = target < n.speed ? 3.4 : 1.6;
      n.speed += (target - n.speed) * Math.min(1, dt * rate);
      n.speed = Math.max(0, Math.min(spec.max * 0.9, n.speed));
      n.s = wrapS(n.s + n.dir * n.speed * dt);

      n.nextLane -= dt;
      if (n.nextLane <= 0) {
        n.nextLane = 2.2 + Math.random() * 3.4;
        const other = Math.abs(n.lane - inner) < Math.abs(n.lane - curb) ? curb : inner;
        const crowded = aheadGap < 18;
        const clear = !npcs.some((o) => {
          if (o === n || !o.alive || o.dir !== n.dir) return false;
          if (Math.abs(o.lane - other) > 0.6) return false;
          const gap = wrapDelta(o.s, n.s, track.total) * n.dir;
          return gap > -7 && gap < 12;
        });
        if (clear && (crowded || n.kind === "tuktuk")) n.laneTarget = other;
      }
      n.laneTarget = Math.max(Math.min(inner, curb), Math.min(Math.max(inner, curb), n.laneTarget));

      const before = n.lane;
      const diff = n.laneTarget - n.lane;
      if (Math.abs(diff) > 0.03) {
        const blocked = npcs.some((o) => {
          if (o === n || !o.alive || o.dir !== n.dir) return false;
          if (Math.abs(o.lane - n.laneTarget) > 0.45 && Math.abs(o.lane - n.lane) > 0.45) return false;
          const gap = wrapDelta(o.s, n.s, track.total) * n.dir;
          return gap > -5.5 && gap < 6.5 && Math.abs(o.lane - n.lane) > 0.35;
        });
        if (!blocked) n.lane += Math.max(-1, Math.min(1, diff)) * dt * 0.95;
      }
      n.lane = Math.max(Math.min(inner, curb), Math.min(Math.max(inner, curb), n.lane));
      n.laneVel = (n.lane - before) / Math.max(dt, 1e-4);

      const directionHeading = n.dir > 0 ? 0 : Math.PI;
      const laneChangeHeading = trafficHeadingOffset({
        direction: n.dir,
        laneVelocity: n.laneVel,
        speed: n.speed,
      });
      n.heading = smoothTrafficHeadingOffset(n.heading, directionHeading + laneChangeHeading, dt);
    }

    for (let pass = 0; pass < 2; pass++) {
      for (const n of npcs) {
        const spec = vehicleById(n.kind);
        for (const o of npcs) {
          if (o === n || o.dir !== n.dir) continue;
          if (Math.abs(o.lane - n.lane) > 0.55) continue;
          const gap = wrapDelta(o.s, n.s, track.total) * n.dir;
          const minGap = 3.1 + spec.length * 0.32;
          if (gap > 0 && gap < minGap) {
            n.s = wrapS(n.s - n.dir * (minGap - gap) * 0.7);
            n.speed = Math.min(n.speed, Math.max(0, o.speed * 0.92));
          }
        }
      }
    }

    const proj = track.project(player.x, player.z, player.hint);
    for (const n of npcs) {
      const rel = wrapDelta(n.s, proj.s, track.total);
      if (rel < -42) {
        n.s = freeSlot(proj.s + 220 + Math.random() * 60, Math.round(n.lane), n.dir, n);
        n.speed = n.cruise;
        n.brake = n.kind === "micro" ? -1.5 : 0;
        n.heading = n.dir > 0 ? 0 : Math.PI;
      }
    }
  }

  function pedWantYaw(p: Ped) {
    if (p.mode === "cross") {
      const goal = -p.side * (ROAD_HALF + 1.45 + p.extra);
      return smYaw(p.s) + (p.lat < goal ? -Math.PI / 2 : Math.PI / 2);
    }
    const along = smYaw(p.s) + (p.dir > 0 ? 0 : Math.PI);
    if (p.mode === "wait") return along + Math.sin(p.phase * 0.35) * 0.22;
    return along;
  }

  function updatePeds(dt: number) {
    const proj = track.project(player.x, player.z, player.hint);
    let crossing = 0;
    for (const p of peds) if (p.mode === "cross") crossing += 1;

    for (const p of peds) {
      const moving = p.mode !== "wait";
      p.phase += dt * (moving ? 7.4 : 1.1);
      p.face += wrapAngle(pedWantYaw(p) - p.face) * Math.min(1, dt * (p.mode === "cross" ? 6 : 4));
      const near = Math.abs(wrapDelta(p.s, proj.s, track.total)) < 75;
      if (!near) {
        if (p.mode === "cross") p.mode = "walk";
        if (p.mode !== "wait") {
          p.s = wrapS(p.s + p.dir * p.speed * dt);
          if (onBridge(p.s)) {
            p.dir = (p.dir * -1) as 1 | -1;
            p.s = wrapS(p.s + p.dir * 4);
          }
        } else if ((p.wait -= dt) <= 0) p.mode = "walk";
        continue;
      }

      if (p.mode === "wait") {
        p.wait -= dt;
        p.lat = p.side * (ROAD_HALF + 1.45 + p.extra);
        if (p.wait <= 0) p.mode = "walk";
        continue;
      }

      if (p.mode === "cross") {
        const goal = -p.side * (ROAD_HALF + 1.45 + p.extra);
        const step = Math.sign(goal - p.lat) * 1.35 * dt;
        if (Math.abs(goal - p.lat) <= Math.abs(step) + 0.001) {
          p.lat = goal;
          p.side = (p.side * -1) as 1 | -1;
          p.mode = "wait";
          p.wait = 0.5 + Math.random() * 1.1;
          crossing = Math.max(0, crossing - 1);
        } else p.lat += step;

        if (phase === "play" && hitCd <= 0 && Math.abs(player.speed) > 2.2) {
          if (Math.abs(wrapDelta(p.s, proj.s, track.total)) < 1.55 && Math.abs(p.lat - proj.lat) < 1.05) {
            player.speed *= 0.42;
            shake = Math.max(shake, 0.28);
            hitCd = 0.9;
            crashes += 1;
            if (cfg.mode === "rush") {
              time += 1;
              say("حد بيعدّي +١ ث");
            } else if (cfg.mode === "shift") {
              money = Math.max(0, money - 20);
              say("خد بالك، فيه ناس بتعدّي — ٢٠ ج");
            } else say("حد بيعدّي — هدّي");
            flash("crash");
            sfx.blip(170, 0.08, "square", 0.045);
          }
        }
        continue;
      }

      p.s = wrapS(p.s + p.dir * p.speed * dt);
      if (onBridge(p.s)) {
        p.dir = (p.dir * -1) as 1 | -1;
        p.s = wrapS(p.s + p.dir * 3);
      }
      p.lat = p.side * (ROAD_HALF + 1.45 + p.extra);

      for (const o of peds) {
        if (o === p || o.mode === "cross" || o.side !== p.side || o.dir !== p.dir) continue;
        const gap = wrapDelta(o.s, p.s, track.total) * p.dir;
        if (gap > 0 && gap < 0.85) p.s = wrapS(p.s - p.dir * (0.85 - gap));
      }

      if (Math.random() < dt * 0.012) {
        p.mode = "wait";
        p.wait = 0.7 + Math.random() * 1.6;
        if (Math.random() < 0.12) p.dir = (p.dir * -1) as 1 | -1;
        continue;
      }

      if (crossing < 3 && Math.random() < dt * 0.12) {
        for (const stop of track.stops) {
          if (onBridge(stop.s)) continue;
          if (Math.abs(wrapDelta(p.s, stop.s, track.total)) < 4) {
            p.mode = "cross";
            crossing += 1;
            break;
          }
        }
      }
    }
  }

  function collide(dist: number, dx: number, dz: number, otherSpeed: number) {
    const d = Math.max(0.001, dist);
    const push = 0.8;
    player.x += (dx / d) * push;
    player.z += (dz / d) * push;
    const rel = Math.abs(player.speed - otherSpeed);
    player.speed *= 0.62;
    hitCd = 0.65;
    shake = 0.35;
    if (rel > 5 && phase === "play") {
      crashes += 1;
      player.yaw += (Math.random() - 0.5) * 0.35;
      if (cfg.mode === "shift") {
        money = Math.max(0, money - 40);
        if (pax.length) {
          pax.pop();
          say("راكب نزل غصب — غرامة");
        } else say("خبطة! غرامة ٤٠ ج");
      } else if (cfg.mode === "rush") {
        time += 2;
        say("خبطة +٢ ث");
      } else say("خبطة! خد بالك");
      flash("crash");
      hitstop = reduceMotion ? 0 : 0.06;
      sfx.crash();
      burst(player.x, player.z);
    }
  }

  function gameplay() {
    const spec = specNow();
    const proj = track.project(player.x, player.z, player.hint);
    for (const n of npcs) {
      if (!n.alive || hitCd > 0) continue;
      const sm = track.sample(n.s);
      const rx = Math.cos(sm.yaw);
      const rz = -Math.sin(sm.yaw);
      const lat = laneLat(n.lane);
      const x = sm.x + rx * lat;
      const z = sm.z + rz * lat;
      const reach = spec.length * 0.42 + vehicleById(n.kind).length * 0.4;
      const d = Math.hypot(player.x - x, player.z - z);
      if (d < reach) {
        n.speed *= 0.75;
        collide(d, player.x - x, player.z - z, n.dir * n.speed);
        break;
      }
    }

    if (hornCd > 0.15) {
      for (const n of npcs) {
        if (n.dir < 0) continue;
        const gap = wrapDelta(n.s, proj.s, track.total);
        if (gap > 0 && gap < 18 && Math.abs(laneLat(n.lane) - proj.lat) < 3.4) {
          const curb = 3;
          const inner = 2;
          n.laneTarget = proj.lat > laneLat(n.lane) ? inner : curb;
        }
      }
    }

    const nearStop = (index: number) => {
      const d = Math.abs(wrapDelta(track.stops[index].s, proj.s, track.total));
      return d < 20 && proj.lat > 3.05 && Math.abs(player.speed) < 4.6;
    };

    if (serviced >= 0) {
      const away = Math.abs(wrapDelta(track.stops[serviced].s, proj.s, track.total));
      if (away > 36) {
        if (waiting[serviced] <= 0) waiting[serviced] = 1 + Math.floor(Math.random() * 5);
        serviced = -1;
      }
    }

    if (cfg.mode !== "rush" && spec.seats > 0) {
      for (let i = 0; i < track.stops.length; i++) {
        if (!nearStop(i) || serviced === i) continue;
        const dropping = pax.filter((person) => person.dest === i);
        if (dropping.length) {
          const earned = Math.round(dropping.length * 36 * spec.fare);
          money += earned;
          pax = pax.filter((person) => person.dest !== i);
          say(`نزلوا — +${earned} ج`);
          flash("cash");
          sfx.cash();
        }
        const free = spec.seats - pax.length;
        if (free > 0 && waiting[i] > 0) {
          const n = Math.min(free, waiting[i]);
          let lastDest = i;
          for (let k = 0; k < n; k++) {
            const hop = 2 + Math.floor(Math.random() * 3);
            lastDest = (i + hop) % track.stops.length;
            pax.push({ dest: lastDest });
          }
          waiting[i] -= n;
          say(`ركّبت ${n} · ${track.stops[lastDest].name}`);
          sfx.cash();
        }
        serviced = i;
      }
    }

    if (cfg.mode === "rush" && phase === "play" && jobs[jobIndex] != null && nearStop(jobs[jobIndex])) {
      jobIndex += 1;
      money += 45;
      flash("cash");
      sfx.cash();
      if (jobIndex >= JOBS_NEED) {
        phase = "summary";
        settle();
        publish();
        return;
      }
      say(`وصلت — الجاية ${track.stops[jobs[jobIndex]].name}`);
    }

    if (radarCd <= 0) {
      for (const rs of track.radarS) {
        if (Math.abs(wrapDelta(rs, proj.s, track.total)) < 16 && Math.abs(player.speed) > RADAR_LIMIT) {
          radarCd = 8;
          flash("radar");
          sfx.radar();
          const which = track.radarS.indexOf(rs);
          if (cfg.mode === "rush") {
            time += 1.5;
            say(which === 1 ? "كمين +١.٥ ث" : "رادار +١.٥ ث");
          } else {
            money = Math.max(0, money - 70);
            say(which === 1 ? "كمين! غرامة ٧٠ ج" : "رادار! غرامة ٧٠ ج");
          }
          break;
        }
      }
    }

    const tollD = wrapDelta(track.tollS, proj.s, track.total);
    if (tollD > -8 && tollD < 16) {
      if (!tollLatch && player.speed > TOLL_LIMIT) {
        tollLatch = true;
        player.speed = Math.min(player.speed, TOLL_LIMIT);
        if (cfg.mode === "rush") {
          time += 1;
          say("الكوبري عايز تهدية");
        } else {
          money = Math.max(0, money - 15);
          say("نقطة مرور الكوبري — ١٥ ج");
        }
      }
    } else if (Math.abs(tollD) > 40) tollLatch = false;

    const gasD = Math.abs(wrapDelta(track.gasS, proj.s, track.total));
    if (gasD < 16 && proj.lat > 2.5 && Math.abs(player.speed) < 3.8 && fuel < 96) {
      if (!gasLatch) {
        if (pay(GAS_COST)) {
          fuel = 100;
          fuelWarned = false;
          gasLatch = true;
          say(`تملى التانك — ${GAS_COST} ج`);
          flash("cash");
          sfx.cash();
        } else {
          gasLatch = true;
          say("الفلوس مش مكفية البنزين");
        }
      }
    } else if (gasD > 30) gasLatch = false;

    if (bumpCd <= 0) {
      for (const b of track.bumps) {
        if (Math.abs(wrapDelta(b, proj.s, track.total)) < 2.5 && Math.abs(player.speed) > 8) {
          bumpCd = 1.15;
          player.speed *= 0.55;
          shake = Math.max(shake, reduceMotion ? 0 : 0.3);
          if (messageT <= 0) say("مطب!");
          sfx.blip(120, 0.07, "triangle", 0.04);
          burst(player.x, player.z);
          break;
        }
      }
    }

    if (phase === "play" && fuel <= 0 && !fuelWarned) {
      fuelWarned = true;
      say("البنزين خلّص — دور على البنزينة");
      flash("fuel");
    }
    if (phase === "play" && cfg.mode === "shift" && !halfWarned && time >= SHIFT_SECONDS - 30) {
      halfWarned = true;
      say("فاضل نص دقيقة");
    }
    if (phase === "play" && cfg.mode === "shift" && time >= SHIFT_SECONDS) {
      phase = "summary";
      settle();
      publish();
      return;
    }

    if (alongWrong(proj) && messageT <= 0) say("إنت عكس الاتجاه");
  }

  function alongWrong(proj: { yaw: number }) {
    const fx = -Math.sin(player.yaw);
    const fz = -Math.cos(player.yaw);
    const tx = -Math.sin(proj.yaw);
    const tz = -Math.cos(proj.yaw);
    return fx * tx + fz * tz < -0.45 && Math.abs(player.speed) > 3;
  }

  function drawPeople() {
    if (peopleModels.length > 0 && peopleModels.length !== peopleStamp) {
      for (const old of streetPeople) scene.remove(old);
      streetPeople = [];
      const light: THREE.Object3D[] = [];
      const heavy: THREE.Object3D[] = [];
      for (const src of peopleModels) {
        let tris = 0;
        src.traverse((obj) => {
          const mesh = obj as THREE.Mesh;
          if (!mesh.isMesh || !mesh.geometry) return;
          const g = mesh.geometry;
          tris += g.index ? g.index.count / 3 : (g.attributes.position?.count ?? 0) / 3;
        });
        (tris > 12000 ? heavy : light).push(src);
      }
      const roster = light.length ? light : peopleModels;
      const poolN = Math.min(36, Math.max(roster.length, 16));
      for (let k = 0; k < poolN; k++) {
        const mesh = cloneModel(roster[k % roster.length]);
        enableGait(mesh);
        mesh.visible = false;
        scene.add(mesh);
        streetPeople.push(mesh);
      }
      peopleStamp = peopleModels.length;
    }
    for (const rp of streetPeople) {
      rp.visible = false;
      rp.rotation.x = 0;
      rp.rotation.z = 0;
    }

    let ri = 0;
    const placeReal = (x: number, y: number, z: number, yaw: number, moving: boolean, phase: number) => {
      if (ri >= streetPeople.length) return false;
      const rp = streetPeople[ri++];
      const step = Math.sin(phase);
      const bob = moving ? Math.abs(step) * 0.035 : 0;
      rp.position.set(x, y + bob, z);
      rp.rotation.set(0, yaw, 0);
      rp.visible = true;
      const gaits = rp.userData.gaits as GaitUniform[] | undefined;
      if (gaits) {
        const stride = moving ? 0.85 : 0;
        for (const g of gaits) {
          g.uWalk.value = stride;
          g.uGait.value = phase;
        }
      }
      return true;
    };

    let i = 0;
    const here = track.project(player.x, player.z, player.hint);
    const ranked = peds
      .map((p) => ({ p, d: Math.abs(wrapDelta(p.s, here.s, track.total)) }))
      .sort((a, b) => a.d - b.d);

    const paintPed = (s: number, lat: number, yaw: number, moving: boolean, phase: number) => {
      const sm = track.sample(s);
      const rx = Math.cos(sm.yaw);
      const rz = -Math.sin(sm.yaw);
      const x = sm.x + rx * lat;
      const z = sm.z + rz * lat;
      const bob = 0;
      if (!placeReal(x, bob, z, yaw, moving, phase)) return;
    };

    for (const { p, d } of ranked) {
      if (d > 58) continue;
      paintPed(p.s, p.lat, p.face, p.mode !== "wait", p.phase);
    }

    for (let sIdx = 0; sIdx < track.stops.length; sIdx++) {
      const n = Math.min(3, waiting[sIdx] ?? 0);
      const sm = track.sample(track.stops[sIdx].s);
      for (let k = 0; k < n; k++) {
        const lat = 7.35 + k * 0.15;
        const along = (k - 1) * 0.7;
        const fx = -Math.sin(sm.yaw);
        const fz = -Math.cos(sm.yaw);
        const rx = Math.cos(sm.yaw);
        const rz = -Math.sin(sm.yaw);
        const x = sm.x + rx * lat + fx * along;
        const z = sm.z + rz * lat + fz * along;
        const yaw = sm.yaw + Math.PI / 2 + Math.sin(performance.now() / 2400 + k) * 0.12;
        const bob = Math.sin(performance.now() / 900 + sIdx + k) * 0.008;
        if (placeReal(x, bob, z, yaw, false, performance.now() / 900 + k)) continue;
        continue;
      }
    }

    dummy.scale.set(0, 0, 0);
    dummy.position.set(0, -24, 0);
    dummy.updateMatrix();
    for (; i < PEOPLE; i++) people.setMatrixAt(i, dummy.matrix);
    people.instanceMatrix.needsUpdate = true;
    if (people.instanceColor) people.instanceColor.needsUpdate = true;
  }

  function smYaw(s: number) {
    return track.sample(s).yaw;
  }

  function render(dt: number) {
    applyDusk(duskNow());
    const fwX = -Math.sin(player.yaw);
    const fwZ = -Math.cos(player.yaw);
    const dist = camMode === 0 ? 5.8 : camMode === 2 ? 14 : camMode === 3 ? 0.2 : 8.2;
    const height = camMode === 3 ? 1.35 : camMode === 2 ? 4.2 : 2.2 + camMode * 0.18;
    const back = camMode === 3 ? -1.15 : dist;
    desired.set(player.x - fwX * back, height, player.z - fwZ * back);
    if (shake > 0 && !reduceMotion) {
      desired.x += (Math.random() - 0.5) * shake * 1.4;
      desired.y += (Math.random() - 0.5) * shake;
    }
    const k = 1 - Math.exp(-5 * dt);
    camPos.lerp(desired, phase === "menu" ? Math.min(1, k * 1.2) : k);
    camera.position.copy(camPos);
    const lookAhead = camMode === 3 ? 14 : 9;
    look.set(player.x + fwX * lookAhead, camMode === 3 ? 1.1 : 1.85, player.z + fwZ * lookAhead);
    camera.lookAt(look);
    sun.position.set(player.x - 28, 42, player.z + 16);
    sun.target.position.set(player.x, 0, player.z);
    streetGlow.position.set(player.x, 4.2, player.z);
    const base = camMode === 3 ? 74 : 56;
    camera.fov = base + Math.min(1, Math.abs(player.speed) / 30) * 8;
    camera.updateProjectionMatrix();

    playerMesh.group.position.set(player.x, 0, player.z);
    playerMesh.group.rotation.y = player.yaw;
    playerMesh.group.rotation.z = steerVis * -0.045;
    playerMesh.group.rotation.x = (player.speed > 1 ? -0.02 : 0.03) * Math.min(1, Math.abs(player.speed) / 20);
    wheelSpin += player.speed * dt * 2.2;
    for (const w of playerMesh.wheels) w.rotation.x = wheelSpin;
    const kick = Math.min(1, Math.abs(player.speed) / 14);
    dustMat.opacity = 0.02 + kick * 0.42;
    for (let i = 0; i < dustN; i++) {
      const a = (i / dustN + (wheelSpin % 6) / 6) % 1;
      const back = 0.35 + a * 2.4;
      const side = (i % 2 === 0 ? -0.48 : 0.48) + Math.sin(i * 1.7 + wheelSpin) * 0.12;
      const rx = Math.cos(player.yaw);
      const rz = -Math.sin(player.yaw);
      dustArr[i * 3] = player.x - fwX * back + rx * side;
      dustArr[i * 3 + 1] = 0.12 + a * 0.7 * kick;
      dustArr[i * 3 + 2] = player.z - fwZ * back + rz * side;
    }
    dustGeo.attributes.position.needsUpdate = true;
    playerMesh.rider.visible = pax.length > 0 && phase !== "menu";

    releaseReal();
    const cursors: Record<VehicleId, number> = {
      malaky: 0,
      taxi: 0,
      micro: 0,
      tuktuk: 0,
      truck: 0,
    };

    const paintNpc = (kind: VehicleId, s: number, yaw: number, lat: number, color?: THREE.Color) => {
      const real = getRealMesh(kind);
      if (!real) return;
      const sm = track.sample(s);
      const rx = Math.cos(sm.yaw);
      const rz = -Math.sin(sm.yaw);
      real.position.set(sm.x + rx * lat, 0, sm.z + rz * lat);
      real.rotation.y = yaw;
      real.visible = true;
      void color;
    };

    for (const n of npcs) {
      if (!n.alive) continue;
      const sm = track.sample(n.s);
      paintNpc(n.kind, n.s, sm.yaw + n.heading, laneLat(n.lane), n.color);
    }
    dummy.scale.set(0, 0, 0);
    dummy.position.set(0, -30, 0);
    dummy.updateMatrix();
    for (const kind of KINDS) {
      const pool = pools.get(kind)!;
      for (let i = cursors[kind]; i < POOL; i++) {
        pool.body.setMatrixAt(i, dummy.matrix);
        pool.glass.setMatrixAt(i, dummy.matrix);
        pool.wheels.setMatrixAt(i, dummy.matrix);
        pool.lights.setMatrixAt(i, dummy.matrix);
      }
      pool.body.instanceMatrix.needsUpdate = true;
      pool.glass.instanceMatrix.needsUpdate = true;
      pool.wheels.instanceMatrix.needsUpdate = true;
      pool.lights.instanceMatrix.needsUpdate = true;
      if (pool.body.instanceColor) pool.body.instanceColor.needsUpdate = true;
    }

    drawPeople();
    nudgeDogs(dt);

    for (const spark of sparks) {
      if (spark.life <= 0) continue;
      spark.life -= dt;
      spark.v.y -= 9 * dt;
      spark.m.position.addScaledVector(spark.v, dt);
      if (spark.life <= 0) spark.m.visible = false;
    }

    drawMap();
    renderer.render(scene, camera);
  }

  const mapPts = track.pts.filter((_, i) => i % 2 === 0);
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of mapPts) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  }

  const streetDogs: THREE.Object3D[] = [];
  let dogsReady = false;
  function nudgeDogs(dt: number) {
    if (!dogsReady) {
      scene.traverse((obj) => {
        if (obj.name === "street-dog") streetDogs.push(obj);
      });
      if (!streetDogs.length) return;
      dogsReady = true;
    }
    for (const dog of streetDogs) {
      const u = dog.userData as { s: number; side: number; dir: number; speed: number; phase: number };
      u.phase += dt * 9;
      u.s = wrapS(u.s + u.dir * u.speed * dt);
      if (onBridge(u.s)) {
        u.dir *= -1;
        u.s = wrapS(u.s + u.dir * 4);
      }
      const sm = track.sample(u.s);
      const rx = Math.cos(sm.yaw);
      const rz = -Math.sin(sm.yaw);
      const lat = u.side * (ROAD_HALF + 1.85);
      dog.position.set(sm.x + rx * lat, Math.abs(Math.sin(u.phase)) * 0.05, sm.z + rz * lat);
      dog.rotation.y = sm.yaw + (u.dir > 0 ? 0 : Math.PI);
    }
  }

  function drawMap() {
    const ctx = map.getContext("2d");
    if (!ctx) return;
    const w = map.width;
    const h = map.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "rgba(20,24,30,0.72)";
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, w / 2 - 2, 0, Math.PI * 2);
    ctx.fill();
    const pad = 16;
    const sx = (w - pad * 2) / (maxX - minX || 1);
    const sy = (h - pad * 2) / (maxZ - minZ || 1);
    const sc = Math.min(sx, sy);
    const ox = w / 2 - ((minX + maxX) / 2) * sc;
    const oy = h / 2 - ((minZ + maxZ) / 2) * sc;
    const px = (x: number, z: number) => [ox + x * sc, oy + z * sc] as const;
    ctx.beginPath();
    mapPts.forEach((p, i) => {
      const [x, y] = px(p.x, p.z);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.strokeStyle = "#f0b429";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = "#1aa6a6";
    track.stops.forEach((stop, i) => {
      const sm = track.sample(stop.s);
      const [x, y] = px(sm.x, sm.z);
      const hot = cfg.mode === "rush" ? jobs[jobIndex] === i : false;
      ctx.fillStyle = hot ? "#f0b429" : "#1aa6a6";
      ctx.fillRect(x - (hot ? 3 : 1.6), y - (hot ? 3 : 1.6), hot ? 6 : 3.2, hot ? 6 : 3.2);
    });
    const gas = track.sample(track.gasS);
    const [gx, gy] = px(gas.x, gas.z);
    ctx.fillStyle = "#f0b429";
    ctx.beginPath();
    ctx.arc(gx, gy, 3.2, 0, Math.PI * 2);
    ctx.fill();
    const [x, y] = px(player.x, player.z);
    ctx.fillStyle = "#f6f1e7";
    ctx.beginPath();
    ctx.arc(x, y, 3.5, 0, Math.PI * 2);
    ctx.fill();
    const fx = -Math.sin(player.yaw);
    const fz = -Math.cos(player.yaw);
    const [hx, hy] = px(player.x + fx * 22, player.z + fz * 22);
    ctx.strokeStyle = "#f6f1e7";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(hx, hy);
    ctx.stroke();
  }

  function frame(now: number) {
    if (!running) return;
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    acc = Math.min(0.12, Math.max(0, acc + dt));
    let steps = 0;
    while (acc >= 1 / 60 && steps < 5) {
      if (hitstop > 0) hitstop = Math.max(0, hitstop - 1 / 60);
      else if (phase !== "pause" && phase !== "summary") step(1 / 60);
      acc -= 1 / 60;
      steps++;
    }
    render(dt);
    hudAcc += dt;
    if (hudAcc > 0.12) {
      hudAcc = 0;
      if (phase === "play" || phase === "summary" || phase === "pause") publish();
    }
    raf = requestAnimationFrame(frame);
  }

  function resize() {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.6);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  const ro = new ResizeObserver(() => resize());
  ro.observe(canvas);

  const onDown = (e: KeyboardEvent) => {
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
    keys.add(e.code);
    if (e.repeat) return;
    if (e.code === "Space" || e.code === "KeyH") honk();
    if (e.code === "KeyC") cycleCam();
    if (e.code === "Escape") {
      if (phase === "play") phase = "pause";
      else if (phase === "pause") phase = "play";
      publish();
    }
  };
  const onUp = (e: KeyboardEvent) => keys.delete(e.code);
  const onBlur = () => keys.clear();
  window.addEventListener("keydown", onDown);
  window.addEventListener("keyup", onUp);
  window.addEventListener("blur", onBlur);

  function honk() {
    if (hornCd > 0) return;
    hornCd = 0.85;
    sfx.unlock();
    sfx.horn();
  }

  function cycleCam() {
    camMode = (camMode + 1) % 4;
  }

  window.__controlsTest = {
    getYaw: () => player.yaw,
    getSpeed: () => player.speed,
    getGait: () =>
      streetPeople
        .filter((p) => p.visible)
        .slice(0, 6)
        .map((p) => {
          const g = (p.userData.gaits as GaitUniform[] | undefined)?.[0];
          return { n: (p.userData.gaits as GaitUniform[] | undefined)?.length ?? 0, walk: g?.uWalk.value ?? null, gait: g ? +g.uGait.value.toFixed(2) : null };
        }),
    setKeys: (codes: string[]) => {
      probeKeys = codes.length ? new Set(codes) : null;
      if (probeKeys && phase !== "play") start(cfg);
    },
    setSteer: (v: number) => {
      probeSteer = v;
    },
    getPose: () => {
      playerMesh.group.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(playerMesh.group);
      const size = box.getSize(new THREE.Vector3());
      let meshes = 0;
      playerMesh.group.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) meshes += 1;
      });
      return {
        meshes,
        size: size.toArray().map((n) => +n.toFixed(2)),
        cam: [camera.position.x, camera.position.y, camera.position.z].map((n) => +n.toFixed(1)),
        pos: [+player.x.toFixed(1), +player.z.toFixed(1)],
        fov: +camera.fov.toFixed(1),
      };
    },
    getFlow: () => {
      const proj = track.project(player.x, player.z, player.hint);
      return {
        playerLane: +proj.lat.toFixed(2),
        phase,
        speed: +player.speed.toFixed(2),
        cars: npcs.slice(0, 6).map((n) => ({
          dir: n.dir,
          kind: n.kind,
          lane: +n.lane.toFixed(2),
          spd: +n.speed.toFixed(1),
          head: +n.heading.toFixed(2),
          gap: +wrapDelta(n.s, proj.s, track.total).toFixed(1),
        })),
        oncoming: npcs.filter((n) => n.dir < 0).slice(0, 3).map((n) => ({
          lane: +n.lane.toFixed(2),
          head: +n.heading.toFixed(2),
          gap: +wrapDelta(n.s, proj.s, track.total).toFixed(1),
          spd: +n.speed.toFixed(1),
        })),
        peds: {
          walk: peds.filter((p) => p.mode === "walk").length,
          wait: peds.filter((p) => p.mode === "wait").length,
          cross: peds.filter((p) => p.mode === "cross").length,
          near: peds
            .filter((p) => Math.abs(wrapDelta(p.s, proj.s, track.total)) < 25)
            .slice(0, 4)
            .map((p) => ({
              mode: p.mode,
              side: p.side,
              lat: +p.lat.toFixed(1),
              dir: p.dir,
              s: +p.s.toFixed(2),
            })),
        },
      };
    },
  };

  publish();
  raf = requestAnimationFrame(frame);

  return {
    getHud: hud,
    setPreview: (next) => {
      const paintChanged = next.paint !== cfg.paint;
      const nightChanged = next.night !== cfg.night;
      cfg = { ...next, vehicle: "tuktuk" };
      sfx.on = cfg.sound;
      save.sound = cfg.sound;
      writeSave(save);
      if (paintChanged && phase === "menu") swapPlayer("tuktuk", cfg.paint);
      if (nightChanged) applyDusk(duskNow());
      if (phase === "menu") publish();
    },
    start,
    pause: () => {
      if (phase === "play") {
        phase = "pause";
        publish();
      }
    },
    resume: () => {
      if (phase === "pause") {
        phase = "play";
        publish();
      }
    },
    quit: () => {
      persist();
      phase = "menu";
      probeKeys = null;
      bootCinematic();
      if (playerMesh.group.visible) player.speed = 11;
      spawnTraffic(track.stops[0].s);
      publish();
    },
    finish: () => {
      if (phase !== "play") return;
      phase = "summary";
      settle();
      publish();
    },
    buy: (id: UpgradeId) => {
      const def = UPGRADES.find((u) => u.id === id);
      if (!def) return;
      const lvl = save.upgrades[id];
      if (lvl >= def.max) return;
      const cost = def.costs[lvl];
      if (save.wallet < cost) return;
      save.wallet -= cost;
      save.upgrades[id] = lvl + 1;
      writeSave(save);
      sfx.unlock();
      sfx.cash();
      publish();
    },
  buyCosmetic: (slot: CosmeticSlot, id: string) => {
      const spend = (price: number, owned: string[]) => {
        if (owned.includes(id)) return true;
        if (save.wallet < price) return false;
        save.wallet -= price;
        owned.push(id);
        return true;
      };
      if (slot === "paint") {
        const item = PAINTS.find((paint) => paint.hex === id);
        if (!item || !spend(item.price, save.ownedPaints)) return false;
        save.paint = item.hex;
      } else if (slot === "slogan") {
        const item = SLOGANS.find((slogan) => slogan.id === id);
        if (!item || !spend(item.price, save.ownedSlogans as string[])) return false;
        save.slogan = item.id;
      } else if (slot === "sticker") {
        const item = STICKERS.find((sticker) => sticker.id === id);
        if (!item || !spend(item.price, save.ownedStickers as string[])) return false;
        save.sticker = item.id;
      } else {
        const item = ACCESSORIES.find((acc) => acc.id === id);
        if (!item || !spend(item.price, save.ownedAccessories as string[])) return false;
        const acc = item.id;
        save.accessories = save.accessories.includes(acc)
          ? save.accessories.filter((have) => have !== acc)
          : [...save.accessories, acc];
      }
      writeSave(save);
      restylePlayer();
      sfx.unlock();
      sfx.cash();
      publish();
      return true;
    },
    setTouch: (t) => {
      touch.steer = t.steer;
      touch.throttle = t.throttle;
      touch.brake = t.brake;
    },
    horn: honk,
    cycleCam,
    toggleSound: () => {
      sfx.on = !sfx.on;
      cfg.sound = sfx.on;
      save.sound = sfx.on;
      writeSave(save);
      if (sfx.on) sfx.unlock();
      publish();
    },
    dispose: () => {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", onBlur);
      if (window.__controlsTest) {
        delete window.__controlsTest;
      }
      sfx.stop();
      renderer.dispose();
    },
  };
}

function buildRoad(scene: THREE.Scene, track: Track) {
  const pts = track.pts;
  const half = ROAD_HALF;
  const positions: number[] = [];
  const uvs: number[] = [];
  const n = pts.length;
  const edge = (i: number, lat: number) => {
    const p = pts[i];
    const rx = Math.cos(p.yaw);
    const rz = -Math.sin(p.yaw);
    return [p.x + rx * lat, 0.02, p.z + rz * lat] as const;
  };
  let distAcc = 0;
  for (let i = 0; i < n; i++) {
    const a = edge(i, -half);
    const b = edge(i, half);
    const c = edge((i + 1) % n, -half);
    const d = edge((i + 1) % n, half);
    positions.push(...a, ...b, ...d, ...a, ...d, ...c);
    const v0 = distAcc / 8;
    const v1 = (distAcc + pts[i].len) / 8;
    uvs.push(0, v0, 1, v0, 1, v1, 0, v0, 1, v1, 0, v1);
    distAcc += pts[i].len;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.computeVertexNormals();
  const mat = roadMaterial();
  const road = new THREE.Mesh(geo, mat);
  road.receiveShadow = true;
  scene.add(road);

  const dashes: THREE.Matrix4[] = [];
  const dash = new THREE.Object3D();
  for (let i = 0; i < n; i += 12) {
    const p = pts[i];
    const rx = Math.cos(p.yaw);
    const rz = -Math.sin(p.yaw);
    for (const lat of [-LANE_W, LANE_W]) {
      dash.position.set(p.x + rx * lat, 0.04, p.z + rz * lat);
      dash.rotation.set(0, p.yaw, 0);
      dash.scale.set(1, 1, 1);
      dash.updateMatrix();
      dashes.push(dash.matrix.clone());
    }
  }
  const dashMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.1, 0.015, 1.6),
    new THREE.MeshStandardMaterial({ color: "#e4d7c0", roughness: 0.82 }),
    Math.max(1, dashes.length),
  );
  dashes.forEach((m, i) => dashMesh.setMatrixAt(i, m));
  scene.add(dashMesh);

  const center: THREE.Matrix4[] = [];
  const mid = new THREE.Object3D();
  for (let i = 0; i < n; i += 3) {
    const p = pts[i];
    const rx = Math.cos(p.yaw);
    const rz = -Math.sin(p.yaw);
    for (const lat of [-0.16, 0.16]) {
      mid.position.set(p.x + rx * lat, 0.045, p.z + rz * lat);
      mid.rotation.set(0, p.yaw, 0);
      mid.scale.set(1, 1, 1);
      mid.updateMatrix();
      center.push(mid.matrix.clone());
    }
  }
  const centerMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.09, 0.016, 9.4),
    new THREE.MeshStandardMaterial({ color: "#c6a85a", roughness: 0.78 }),
    center.length,
  );
  center.forEach((m, i) => centerMesh.setMatrixAt(i, m));
  scene.add(centerMesh);

  const edges: THREE.Matrix4[] = [];
  const edgeMark = new THREE.Object3D();
  for (let i = 0; i < n; i += 2) {
    const p = pts[i];
    const rx = Math.cos(p.yaw);
    const rz = -Math.sin(p.yaw);
    for (const side of [-1, 1]) {
      edgeMark.position.set(p.x + rx * side * (half - 0.42), 0.05, p.z + rz * side * (half - 0.42));
      edgeMark.rotation.set(0, p.yaw, 0);
      edgeMark.scale.set(1, 1, 1);
      edgeMark.updateMatrix();
      edges.push(edgeMark.matrix.clone());
    }
  }
  const edgeMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.1, 0.02, 7.1),
    new THREE.MeshStandardMaterial({ color: "#efe6d2", roughness: 0.65 }),
    edges.length,
  );
  edges.forEach((m, i) => edgeMesh.setMatrixAt(i, m));
  scene.add(edgeMesh);

  const curbs: THREE.Matrix4[] = [];
  const walks: THREE.Matrix4[] = [];
  const curb = new THREE.Object3D();
  for (let i = 0; i < n; i += 2) {
    const p = pts[i];
    const rx = Math.cos(p.yaw);
    const rz = -Math.sin(p.yaw);
    for (const side of [-1, 1]) {
      curb.position.set(p.x + rx * side * (half + 0.35), 0.12, p.z + rz * side * (half + 0.35));
      curb.rotation.set(0, p.yaw, 0);
      curb.scale.set(1, 1, 1);
      curb.updateMatrix();
      curbs.push(curb.matrix.clone());
      curb.position.set(p.x + rx * side * (half + 1.55), 0.05, p.z + rz * side * (half + 1.55));
      curb.updateMatrix();
      walks.push(curb.matrix.clone());
    }
  }
  const curbMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.28, 0.18, 7.2),
    new THREE.MeshStandardMaterial({ color: "#cfc6b6", roughness: 0.88 }),
    curbs.length,
  );
  curbs.forEach((m, i) => curbMesh.setMatrixAt(i, m));
  curbMesh.receiveShadow = true;
  curbMesh.castShadow = true;
  const walkMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(2.15, 0.07, 7.2),
    walkMaterial(),
    walks.length,
  );
  walks.forEach((m, i) => walkMesh.setMatrixAt(i, m));
  walkMesh.receiveShadow = true;
  scene.add(curbMesh, walkMesh);
}

function buildCity(scene: THREE.Scene, track: Track) {
  const kit = buildingKit();
  const mats = kit.facadeMats;
  const meshes: THREE.InstancedMesh[] = [];
  kit.sets.forEach((set) => {
    const mesh = new THREE.InstancedMesh(kit.box, set, 140);
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    meshes.push(mesh);
  });
  const counts = kit.sets.map(() => 0);
  const dummy = new THREE.Object3D();
  const tanks: THREE.Matrix4[] = [];
  const tankO = new THREE.Object3D();
  const balconies: THREE.Matrix4[] = [];
  const rails: THREE.Matrix4[] = [];
  const shops: THREE.Matrix4[] = [];
  const bO = new THREE.Object3D();
  const pts = track.pts;
  for (let i = 0; i < pts.length; i += 3) {
    const p = pts[i];
    const nxt = pts[(i + 8) % pts.length];
    const rx = Math.cos(p.yaw);
    const rz = -Math.sin(p.yaw);
    const hsh = Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1;
    const bending = Math.abs(wrapAngle(nxt.yaw - p.yaw)) > 0.28;
    const nearS = (s: number, pad: number) => {
      let d = Math.abs(p.s - s);
      if (d > track.total * 0.5) d = track.total - d;
      return d < pad;
    };
    if (track.stops.some((stop) => nearS(stop.s, 16)) || nearS(track.gasS, 12)) continue;
    const outward = Math.sign(p.x * rx + p.z * rz) || 1;
    const sides = bending ? [outward] : [-1, 1];
    for (const side of sides) {
      const floors = 6 + Math.floor(hsh * 4);
      const height = floors * 3.05;
      const width = 6.8 + hsh * 1.3;
      const along = 9.05 + hsh * 0.5;
      const face = 11.05;
      const lateral = face + width * 0.5;
      const idx = (i + (side > 0 ? 1 : 0)) % meshes.length;
      if (counts[idx] >= 140) continue;
      dummy.position.set(p.x + rx * side * lateral, height / 2, p.z + rz * side * lateral);
      dummy.rotation.set(0, p.yaw, 0);
      dummy.scale.set(width, height, along);
      dummy.updateMatrix();
      meshes[idx].setMatrixAt(counts[idx]++, dummy.matrix);
      bO.position.set(p.x + rx * side * (face - 0.1), 1.18, p.z + rz * side * (face - 0.1));
      bO.rotation.set(0, p.yaw, 0);
      bO.scale.set(0.2, 2.2, along * 0.7);
      bO.updateMatrix();
      shops.push(bO.matrix.clone());
      for (let fl = 2; fl < floors && balconies.length < 1600; fl += 2) {
        const y = fl * 3.05 + 0.04;
        const depth = 0.78;
        const lip = face - depth * 0.5;
        bO.position.set(p.x + rx * side * lip, y, p.z + rz * side * lip);
        bO.scale.set(depth, 0.1, along * 0.84);
        bO.updateMatrix();
        balconies.push(bO.matrix.clone());
        const railLat = face - depth + 0.04;
        bO.position.set(p.x + rx * side * railLat, y + 0.42, p.z + rz * side * railLat);
        bO.scale.set(0.045, 0.055, along * 0.84);
        bO.updateMatrix();
        rails.push(bO.matrix.clone());
      }
      if (hsh > 0.42) {
        tankO.position.set(p.x + rx * side * lateral, height + 0.7, p.z + rz * side * lateral);
        tankO.rotation.set(0, hsh * 4, 0);
        tankO.scale.set(1.1, 1, 1.1);
        tankO.updateMatrix();
        tanks.push(tankO.matrix.clone());
      }
    }
  }
  meshes.forEach((m, i) => {
    m.count = counts[i];
    m.instanceMatrix.needsUpdate = true;
  });
  if (tanks.length) {
    const tankMesh = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.85, 0.85, 1.35, 8),
      new THREE.MeshStandardMaterial({ color: "#b7bcc2", roughness: 0.45, metalness: 0.35 }),
      tanks.length,
    );
    tankMesh.frustumCulled = false;
    tanks.forEach((m, i) => tankMesh.setMatrixAt(i, m));
    scene.add(tankMesh);
  }
  if (shops.length) {
    const shopMesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: "#161410", roughness: 0.9 }),
      shops.length,
    );
    shopMesh.frustumCulled = false;
    shops.forEach((m, i) => shopMesh.setMatrixAt(i, m));
    scene.add(shopMesh);
  }
  if (balconies.length) {
    const slab = new THREE.MeshStandardMaterial({ color: "#cfc3b0", roughness: 0.84 });
    const railMat = new THREE.MeshStandardMaterial({ color: "#8d9298", roughness: 0.45, metalness: 0.35 });
    const slabMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), slab, balconies.length);
    const railMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), railMat, rails.length);
    slabMesh.frustumCulled = false;
    railMesh.frustumCulled = false;
    balconies.forEach((m, i) => slabMesh.setMatrixAt(i, m));
    rails.forEach((m, i) => railMesh.setMatrixAt(i, m));
    scene.add(slabMesh, railMesh);
  }
  return mats;
}

function buildLamps(scene: THREE.Scene, track: Track) {
  const poles: THREE.Matrix4[] = [];
  const arms: THREE.Matrix4[] = [];
  const heads: THREE.Matrix4[] = [];
  const o = new THREE.Object3D();
  const pts = track.pts;
  const poleH = 9.2;
  const armLen = 3.4;
  for (let i = 2; i < pts.length; i += 10) {
    const p = pts[i];
    const nxt = pts[(i + 8) % pts.length];
    if (Math.abs(wrapAngle(nxt.yaw - p.yaw)) > 0.45) continue;
    const rx = Math.cos(p.yaw);
    const rz = -Math.sin(p.yaw);
    const side = i % 20 === 2 ? 1 : -1;
    const lat = side * 9.65;
    o.position.set(p.x + rx * lat, poleH / 2, p.z + rz * lat);
    o.rotation.set(0, p.yaw, 0);
    o.scale.set(1, 1, 1);
    o.updateMatrix();
    poles.push(o.matrix.clone());
    const armLat = lat - side * (armLen / 2);
    o.position.set(p.x + rx * armLat, poleH - 0.12, p.z + rz * armLat);
    o.updateMatrix();
    arms.push(o.matrix.clone());
    const headLat = lat - side * armLen;
    o.position.set(p.x + rx * headLat, poleH - 0.32, p.z + rz * headLat);
    o.updateMatrix();
    heads.push(o.matrix.clone());
  }
  const silver = new THREE.MeshStandardMaterial({ color: "#d5dbe2", roughness: 0.32, metalness: 0.48 });
  const pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.11, poleH, 7), silver, Math.max(1, poles.length));
  pole.frustumCulled = false;
  pole.castShadow = true;
  poles.forEach((m, i) => pole.setMatrixAt(i, m));
  const arm = new THREE.InstancedMesh(new THREE.BoxGeometry(armLen, 0.07, 0.07), silver, Math.max(1, arms.length));
  arm.frustumCulled = false;
  arms.forEach((m, i) => arm.setMatrixAt(i, m));
  const bulbMat = new THREE.MeshStandardMaterial({
    color: "#fff1cc",
    emissive: "#ffd78a",
    emissiveIntensity: 0.05,
  });
  const bulbs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.62, 0.14, 0.32), bulbMat, Math.max(1, heads.length));
  bulbs.frustumCulled = false;
  heads.forEach((m, i) => bulbs.setMatrixAt(i, m));
  scene.add(pole, arm, bulbs);
  return bulbMat;
}


declare global {
  interface Window {
    __controlsTest?: {
      getYaw: () => number;
      getSpeed: () => number;
      setKeys?: (codes: string[]) => void;
      setSteer?: (v: number) => void;
      getPose?: () => unknown;
      getFlow?: () => unknown;
      getGait?: () => unknown;
    };
  }
}
