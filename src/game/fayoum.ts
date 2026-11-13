import * as THREE from "three";
import { ROAD_HALF, type Track } from "./track";
import { fitProp } from "./fit";
import { cloneModel, streetLoader } from "./gltf";
import { facadeMaterial } from "./surfaces";

const plasters = ["#d4c4a8", "#c8b89a", "#e0d0b8", "#b8a888", "#d0c0a0"];
const signBands = ["#c0392b", "#1a5276", "#1e8449", "#b7950b", "#6c3483"];
const shopCategories = ["ميني ماركت", "مخبز", "صيدلية", "كوافير", "لحوم", "خضروات", "أدوات منزلية", "كافيه"];

function texOf(c: HTMLCanvasElement) {
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function _pair(seed: number) {
  const face = document.createElement("canvas");
  face.width = 512;
  face.height = 1024;
  const glow = document.createElement("canvas");
  glow.width = 512;
  glow.height = 1024;
  const g = face.getContext("2d");
  const e = glow.getContext("2d");
  if (!g || !e) return null;
  const plaster = plasters[seed % plasters.length];
  g.fillStyle = plaster;
  g.fillRect(0, 0, 512, 1024);
  e.fillStyle = "#000";
  e.fillRect(0, 0, 512, 1024);

  // heavy weathering & dirt streaks
  for (let i = 0; i < 220; i++) {
    const a = 0.02 + (i % 7) * 0.01;
    g.fillStyle = `rgba(55,40,25,${a})`;
    g.fillRect((i * 53) % 512, (i * 97) % 820, 12 + (i % 40), 6 + (i % 22));
  }
  // vertical dirt streaks from AC / rain
  for (let i = 0; i < 18; i++) {
    const x = 20 + ((i * 97) % 470);
    g.fillStyle = `rgba(40,30,20,${0.08 + (i % 4) * 0.03})`;
    g.fillRect(x, 80 + (i % 5) * 40, 3 + (i % 3), 180 + (i % 6) * 50);
  }

  // brick / concrete top band
  g.fillStyle = "#9a4f3a";
  g.fillRect(0, 0, 512, 90);
  for (let y = 4; y < 86; y += 14) {
    g.fillStyle = y % 28 === 4 ? "#7e3e2e" : "#b05a45";
    g.fillRect(0, y, 512, 9);
    g.fillStyle = "#5e3024";
    g.fillRect(0, y + 9, 512, 3);
    // brick offsets
    for (let x = (y % 28 === 4 ? 0 : 28); x < 512; x += 56) {
      g.fillStyle = "rgba(0,0,0,0.12)";
      g.fillRect(x, y, 2, 12);
    }
  }

  const floorH = 100;
  for (let f = 0; f < 8; f++) {
    const y = 100 + f * floorH;
    // balcony slab
    g.fillStyle = "rgba(55,48,40,0.55)";
    g.fillRect(8, y + 68, 496, 10);
    g.fillStyle = "#4a535a";
    g.fillRect(10, y + 42, 492, 3);
    for (let x = 16; x < 500; x += 10) g.fillRect(x, y + 42, 3, 26);

    for (let w = 0; w < 4; w++) {
      const x = 28 + w * 120;
      const wave = Math.sin(seed * 2.1 + f * 1.7 + w * 2.4);
      const lit = wave > 0.2;
      const open = wave < -0.5;
      // window frame
      g.fillStyle = "#e8e0d2";
      g.fillRect(x - 4, y + 4, 72, 58);
      // glass
      g.fillStyle = open ? "#4a6a78" : lit ? "#f5d9a8" : "#7a93a0";
      g.fillRect(x, y + 8, 64, 50);
      if (!open) {
        g.strokeStyle = "rgba(255,255,255,0.35)";
        g.lineWidth = 1.5;
        g.beginPath();
        g.moveTo(x + 32, y + 8);
        g.lineTo(x + 32, y + 58);
        g.moveTo(x, y + 33);
        g.lineTo(x + 64, y + 33);
        g.stroke();
      }
      if (lit && !open) {
        e.fillStyle = "#ffcc77";
        e.fillRect(x, y + 8, 64, 50);
      }
      // AC unit
      if ((f + w + seed) % 3 === 0) {
        g.fillStyle = "#f0ebe3";
        g.fillRect(x + 68, y + 14, 28, 22);
        g.fillStyle = "#a8b0b8";
        g.fillRect(x + 70, y + 22, 24, 4);
        g.fillStyle = "rgba(0,0,0,0.25)";
        g.fillRect(x + 72, y + 16, 20, 3);
      }
      // laundry / hanging clothes on balcony
      if ((f * 3 + w + seed) % 4 === 0) {
        const cloth = ["#c45c3e", "#1d4e89", "#f4f1ea", "#2f6b3a", "#222", "#d4a017"];
        g.fillStyle = cloth[(f + w) % cloth.length];
        g.fillRect(x + 4, y + 62, 16, 28);
        g.fillStyle = cloth[(f + w + 2) % cloth.length];
        g.fillRect(x + 24, y + 64, 14, 24);
        g.fillStyle = cloth[(f + w + 1) % cloth.length];
        g.fillRect(x + 42, y + 60, 12, 30);
      }
      // window dirt / reflection variation
      g.fillStyle = `rgba(20,15,10,${0.04 + (seed + f + w) % 3 * 0.02})`;
      g.fillRect(x + 4, y + 12, 56, 18);
    }
  }

  // roof water tanks / parapet details (Egyptian rooftops)
  g.fillStyle = "#8a7a68";
  g.fillRect(0, 0, 512, 18);
  for (let i = 0; i < 4; i++) {
    const tx = 40 + i * 120 + (seed % 30);
    g.fillStyle = "#c8c2b8";
    g.fillRect(tx, 8, 36, 28);
    g.fillStyle = "#9a948a";
    g.fillRect(tx + 4, 12, 28, 8);
    g.fillStyle = "#6a655c";
    g.fillRect(tx + 8, 28, 20, 6);
  }

  // commercial ground floor band
  g.fillStyle = signBands[seed % signBands.length];
  g.fillRect(0, 820, 512, 48);
  // simple Arabic-looking shop name bars
  g.fillStyle = "#f5f0e6";
  g.font = "bold 22px Tajawal, Arial";
  g.textAlign = "center";
  g.fillText(shopCategories[seed % shopCategories.length], 256, 852);

  // dark shop front
  g.fillStyle = "#161412";
  g.fillRect(0, 868, 512, 156);
  // metal shutter
  const shutter = seed % 2 === 0 ? "#1a5c42" : "#3a4650";
  g.fillStyle = shutter;
  g.fillRect(24, 880, 210, 120);
  for (let y = 880; y < 1000; y += 8) {
    g.fillStyle = "rgba(0,0,0,0.3)";
    g.fillRect(24, y, 210, 2);
  }
  // door
  g.fillStyle = "#0a0a0a";
  g.fillRect(90, 910, 70, 90);
  e.fillStyle = "#ffb15a";
  e.globalAlpha = 0.8;
  e.fillRect(100, 922, 50, 60);
  e.globalAlpha = 1;
  // goods / crates in shop window
  const goods = ["#e07a2f", "#f2c14e", "#d35400", "#8d6e63", "#27ae60", "#c0392b"];
  goods.forEach((hex, i) => {
    g.fillStyle = hex;
    g.fillRect(260 + i * 38, 900 + (i % 2) * 16, 32, 48 - (i % 2) * 10);
  });
  // extra AC units on lower floors for density
  for (let i = 0; i < 5; i++) {
    const ax = 30 + ((i * 97 + seed * 13) % 420);
    const ay = 200 + ((i * 53) % 500);
    g.fillStyle = "#e8e4dc";
    g.fillRect(ax, ay, 32, 24);
    g.fillStyle = "#a0a8b0";
    g.fillRect(ax + 3, ay + 10, 26, 5);
    g.fillStyle = "rgba(0,0,0,0.2)";
    g.fillRect(ax + 5, ay + 4, 22, 3);
  }
  // more weathering on lower walls
  for (let i = 0; i < 55; i++) {
    g.fillStyle = `rgba(30,22,15,${0.05 + (i % 5) * 0.02})`;
    g.fillRect((i * 41) % 500, 860 + (i % 8) * 12, 18 + (i % 15), 7);
  }
  // random graffiti / stickers
  for (let i = 0; i < 6; i++) {
    g.fillStyle = `rgba(${40 + (i % 3) * 30},${30 + i * 10},${20},${0.35})`;
    g.fillRect(20 + ((i * 83) % 460), 750 + (i % 4) * 20, 40 + (i % 3) * 15, 8 + (i % 2) * 4);
  }

  const map = texOf(face);
  map.anisotropy = 16;
  const emissiveMap = texOf(glow);
  return { map, emissiveMap };
}

export type BuildingKit = {
  box: THREE.BoxGeometry;
  facadeMats: THREE.MeshStandardMaterial[];
  sets: THREE.Material[][];
};

let kit: BuildingKit | null = null;

const BAY_TINTS = ["#e8dcc8", "#dcc8b0", "#e4d4c0", "#d0c0a8", "#e0d0b8"];

export function buildingKit(): BuildingKit {
  if (kit) return kit;
  const box = new THREE.BoxGeometry(1, 1, 1);
  const roof = new THREE.MeshStandardMaterial({ color: "#5e564c", roughness: 0.96, metalness: 0.02 });
  const facadeMats: THREE.MeshStandardMaterial[] = [];
  const sets: THREE.Material[][] = [];
  for (let i = 0; i < 5; i++) {
    const facade = facadeMaterial(i + 1);
    facade.color.set(BAY_TINTS[i]);
    facadeMats.push(facade);
    sets.push([facade, facade, roof, roof, facade, facade]);
  }
  kit = { box, facadeMats, sets };
  return kit;
}

export function asphaltTexture() {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 512;
  const g = c.getContext("2d");
  if (!g) return null;
  // base worn asphalt
  g.fillStyle = "#c4b49a";
  g.fillRect(0, 0, 512, 512);
  // noise grain
  for (let i = 0; i < 3200; i++) {
    const v = 70 + ((i * 17) % 55);
    g.fillStyle = `rgba(${v},${v - 3},${v - 6},0.32)`;
    g.fillRect((i * 13) % 512, (i * 29) % 512, 2 + (i % 2), 2);
  }
  // dark oil / tire patches
  for (let i = 0; i < 28; i++) {
    g.fillStyle = `rgba(45,40,35,${0.22 + (i % 5) * 0.06})`;
    g.beginPath();
    g.ellipse(30 + ((i * 97) % 450), 25 + ((i * 61) % 460), 35 + (i % 6) * 14, 12 + (i % 4) * 8, i * 0.4, 0, Math.PI * 2);
    g.fill();
  }
  // faded lane marks
  g.strokeStyle = "rgba(200,190,160,0.18)";
  g.lineWidth = 3;
  for (let i = 0; i < 9; i++) {
    g.beginPath();
    g.moveTo((i * 55) % 512, 0);
    g.lineTo(((i * 55) % 512) + 25, 512);
    g.stroke();
  }
  // repair patches (lighter / darker rectangles)
  for (let i = 0; i < 12; i++) {
    const x = (i * 137) % 420;
    const y = (i * 89) % 430;
    g.fillStyle = i % 2 === 0 ? "rgba(95,90,82,0.55)" : "rgba(55,50,45,0.5)";
    g.fillRect(x, y, 55 + (i % 4) * 20, 28 + (i % 3) * 12);
  }
  // small pothole-ish dark spots
  for (let i = 0; i < 9; i++) {
    g.fillStyle = "rgba(30,28,25,0.65)";
    g.beginPath();
    g.ellipse(80 + ((i * 53) % 350), 60 + ((i * 71) % 380), 8 + (i % 3) * 4, 5 + (i % 2) * 3, 0, 0, Math.PI * 2);
    g.fill();
  }
  const map = texOf(c);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  return map;
}

export function sidewalkTexture() {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const g = c.getContext("2d");
  if (!g) return null;
  g.fillStyle = "#b8aa96";
  g.fillRect(0, 0, 256, 256);
  // broken tiles
  g.strokeStyle = "rgba(70,58,45,0.45)";
  g.lineWidth = 2;
  for (let y = 0; y < 256; y += 64) {
    for (let x = 0; x < 256; x += 64) {
      g.strokeRect(x + 1, y + 1, 62, 62);
      if ((x + y) % 128 === 0) {
        g.fillStyle = "rgba(80,65,48,0.22)";
        g.fillRect(x + 6, y + 6, 52, 52);
      }
      // cracks
      if ((x * y) % 3 === 0) {
        g.strokeStyle = "rgba(50,40,30,0.35)";
        g.beginPath();
        g.moveTo(x + 10, y + 15);
        g.lineTo(x + 45, y + 50);
        g.stroke();
      }
    }
  }
  // dirt patches
  for (let i = 0; i < 18; i++) {
    g.fillStyle = `rgba(90,75,55,${0.15 + (i % 4) * 0.05})`;
    g.beginPath();
    g.ellipse((i * 47) % 240, (i * 73) % 240, 12 + (i % 4) * 6, 8 + (i % 3) * 4, 0, 0, Math.PI * 2);
    g.fill();
  }
  const map = texOf(c);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  return map;
}

export function bumpTexture() {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 32;
  const g = c.getContext("2d");
  if (!g) return null;
  for (let x = 0; x < 128; x += 16) {
    g.fillStyle = (x / 16) % 2 === 0 ? "#f0b429" : "#161616";
    g.fillRect(x, 0, 16, 32);
  }
  const map = texOf(c);
  map.wrapS = THREE.RepeatWrapping;
  map.repeat.set(8, 1);
  return map;
}

function stamp(list: THREE.Matrix4[], o: THREE.Object3D) {
  o.updateMatrix();
  list.push(o.matrix.clone());
}

function addInstances(
  scene: THREE.Scene,
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  mats: THREE.Matrix4[],
  colors?: THREE.Color[],
) {
  if (!mats.length) return;
  const mesh = new THREE.InstancedMesh(geo, mat, mats.length);
  mesh.frustumCulled = false;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mats.forEach((m, i) => mesh.setMatrixAt(i, m));
  if (colors) colors.forEach((c, i) => mesh.setColorAt(i, c));
  scene.add(mesh);
}

function sideOf(p: { x: number; z: number; yaw: number }, lat: number, y: number) {
  const rx = Math.cos(p.yaw);
  const rz = -Math.sin(p.yaw);
  return { x: p.x + rx * lat, y, z: p.z + rz * lat };
}

export function dressFayoum(scene: THREE.Scene, track: Track) {
  const kit = buildingKit();
  const dummy = new THREE.Object3D();
  const pts = track.pts;

  const scatter = (lateral: number, cap: number) => {
    const meshes = kit.sets.map((mats) => {
      const mesh = new THREE.InstancedMesh(kit.box, mats, cap);
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
      return mesh;
    });
    const counts = kit.sets.map(() => 0);
    return { meshes, counts };
  };

  const outer = scatter(0, 110);
  const median = scatter(0, 90);

  const awnings: THREE.Matrix4[] = [];
  const awningCols: THREE.Color[] = [];
  const crates: THREE.Matrix4[] = [];
  const crateCols: THREE.Color[] = [];
  const bikes: THREE.Matrix4[] = [];
  const dishes: THREE.Matrix4[] = [];
  const acs: THREE.Matrix4[] = [];
  const laundry: THREE.Matrix4[] = [];
  const laundryCols: THREE.Color[] = [];
  const holes: THREE.Matrix4[] = [];
  const wires: number[] = [];

  const cloth = ["#c45c3e", "#1aa6a6", "#f0b429", "#1f6b4a", "#24527e", "#f4f1ea"].map((h) => new THREE.Color(h));
  const woods = ["#c9842a", "#a86b32", "#d35400", "#e6c27a"].map((h) => new THREE.Color(h));
  const o = new THREE.Object3D();

  for (let i = 0; i < pts.length; i += 4) {
    const p = pts[i];
    const nxt = pts[(i + 8) % pts.length];
    const bend = Math.abs(((nxt.yaw - p.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    if (bend > 0.22) continue;
    const hsh = Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1;
    const rx = Math.cos(p.yaw);
    const rz = -Math.sin(p.yaw);
    const outward = Math.sign(p.x * rx + p.z * rz) || 1;
    for (const side of [-1, 1]) {
      const idx = (i + (side > 0 ? 1 : 0)) % 5;
      if (outer.counts[idx] < 80 && i % 8 === 0 && side === outward) {
        const floors = 15 + Math.floor(hsh * 4);
        const height = floors * 3.05;
        const depth = 8;
        const width = 7.2;
        const lat = 30 + hsh * 2;
        dummy.position.set(p.x + rx * side * lat, height / 2, p.z + rz * side * lat);
        dummy.rotation.set(0, p.yaw, 0);
        dummy.scale.set(width, height, depth);
        dummy.updateMatrix();
        outer.meshes[idx].setMatrixAt(outer.counts[idx]++, dummy.matrix);
      }
      if (i % 8 === 0) {
        const at = sideOf(p, side * 10.05, 2.72);
        o.position.set(at.x, at.y, at.z);
        o.rotation.set(0, p.yaw, 0);
        o.scale.set(1.65, 0.06, 4.35);
        stamp(awnings, o);
        awningCols.push(cloth[(i + (side > 0 ? 1 : 3)) % cloth.length]);
      }
      if (i % 5 === 0) {
        const at = sideOf(p, side * (ROAD_HALF + 1.55), 0.28);
        o.position.set(at.x, 0.28, at.z);
        o.rotation.set(0, p.yaw + (hsh - 0.5) * 0.4, 0);
        o.scale.set(0.65 + hsh * 0.45, 0.5 + hsh * 0.2, 0.5 + hsh * 0.25);
        stamp(crates, o);
        crateCols.push(woods[(i + side) & 3]);
        // stack second crate sometimes
        if (hsh > 0.6) {
          o.position.y = 0.7;
          o.scale.set(0.55, 0.45, 0.5);
          stamp(crates, o);
          crateCols.push(woods[(i + 1) & 3]);
        }
      }
      if (i % 16 === 4) {
        const at = sideOf(p, side * (ROAD_HALF + 0.85), 0.42);
        o.position.set(at.x, 0.42, at.z);
        o.rotation.set(0, p.yaw + 0.4, 0);
        o.scale.set(1, 1, 1);
        stamp(bikes, o);
      }
      if (hsh > 0.55 && i % 8 === 0) {
        const at = sideOf(p, side * 14.6, 20 + hsh * 10);
        o.position.set(at.x, at.y, at.z);
        o.rotation.set(0.9, p.yaw, 0);
        o.scale.set(1, 1, 1);
        stamp(dishes, o);
      }
      if (i % 6 === 2 || i % 6 === 5) {
        const at = sideOf(p, side * 10.72, 5.4 + (i % 5) * 3.1);
        o.position.set(at.x, at.y, at.z);
        o.rotation.set(0, p.yaw, 0);
        o.scale.set(0.34, 0.26, 0.52);
        stamp(acs, o);
        const line = sideOf(p, side * 10.22, at.y - 0.15);
        o.position.set(line.x, line.y, line.z);
        o.rotation.set(0, p.yaw + side * 0.55, 0);
        o.scale.set(0.05, 0.72, 0.85);
        stamp(laundry, o);
        laundryCols.push(cloth[(i + 2) % cloth.length]);
        o.position.y -= 0.15;
        o.rotation.y += 0.35;
        o.scale.set(0.05, 0.55, 0.62);
        stamp(laundry, o);
        laundryCols.push(cloth[(i + 4) % cloth.length]);
        o.rotation.set(0, p.yaw, 0);
      }
    }
    if (i % 54 === 0 && hsh > 0.32) {
      o.position.set(p.x, 0.03, p.z);
      o.rotation.set(0, p.yaw, 0);
      o.scale.set(1, 1, 1);
      stamp(holes, o);
    }
  }

  outer.meshes.forEach((m, i) => {
    m.count = outer.counts[i];
    m.instanceMatrix.needsUpdate = true;
  });
  median.meshes.forEach((m, i) => {
    m.count = median.counts[i];
    m.instanceMatrix.needsUpdate = true;
  });

  const awningMat = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.7 });
  addInstances(scene, new THREE.BoxGeometry(1, 1, 1), awningMat, awnings, awningCols);
  const crateMat = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.86 });
  addInstances(scene, new THREE.BoxGeometry(1, 1, 1), crateMat, crates, crateCols);
  const bikeGeo = new THREE.BoxGeometry(0.35, 0.7, 1.5);
  bikeGeo.translate(0, 0.45, 0);
  addInstances(
    scene,
    bikeGeo,
    new THREE.MeshStandardMaterial({ color: "#1b1e24", roughness: 0.6, metalness: 0.2 }),
    bikes,
  );
  const dishGeo = new THREE.SphereGeometry(0.55, 8, 6);
  dishGeo.scale(1, 0.28, 1);
  addInstances(
    scene,
    dishGeo,
    new THREE.MeshStandardMaterial({ color: "#d5d8dc", roughness: 0.4, metalness: 0.45 }),
    dishes,
  );
  addInstances(
    scene,
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: "#f4f1ea", roughness: 0.5 }),
    acs,
  );
  const clothMat = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.8 });
  addInstances(scene, new THREE.BoxGeometry(1, 1, 1), clothMat, laundry, laundryCols);
  const holeGeo = new THREE.CircleGeometry(0.2, 8);
  holeGeo.rotateX(-Math.PI / 2);
  addInstances(
    scene,
    holeGeo,
    new THREE.MeshStandardMaterial({ color: "#5c554a", roughness: 0.94 }),
    holes,
  );

  for (let i = 0; i < pts.length; i += 8) {
    const a = pts[i];
    const b = pts[(i + 8) % pts.length];
    if (a.s > 140 && a.s < 330) continue;
    if (Math.abs(a.x) < 20 || Math.abs(b.x) < 20) continue;
    for (const side of [-1, 1]) {
      const ra = Math.cos(a.yaw);
      const rza = -Math.sin(a.yaw);
      const rb = Math.cos(b.yaw);
      const rzb = -Math.sin(b.yaw);
      const ax = a.x + ra * side * 10.2;
      const az = a.z + rza * side * 10.2;
      const bx = b.x + rb * side * 10.2;
      const bz = b.z + rzb * side * 10.2;
      const sag = 0.7;
      const y = 12.4;
      wires.push(ax, y, az, (ax + bx) / 2, y - sag, (az + bz) / 2);
      wires.push((ax + bx) / 2, y - sag, (az + bz) / 2, bx, y, bz);
    }
    if (i % 24 === 0) {
      const rx = Math.cos(a.yaw);
      const rz = -Math.sin(a.yaw);
      const y = 16.2;
      wires.push(a.x + rx * -9.2, y, a.z + rz * -9.2, a.x, y - 2.6, a.z);
      wires.push(a.x, y - 2.6, a.z, a.x + rx * 9.2, y, a.z + rz * 9.2);
    }
  }
  if (wires.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(wires, 3));
    scene.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: "#2c3036" })));
  }

  const trunks: THREE.Matrix4[] = [];
  const crowns: THREE.Matrix4[] = [];
  for (let i = 8; i < pts.length; i += 5) {
    const p = pts[i];
    const nxt = pts[(i + 6) % pts.length];
    const bend = Math.abs(((nxt.yaw - p.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    if (bend > 0.2) continue;
    if (p.s > 150 && p.s < 320) continue;
    const side = i % 10 < 7 ? 1 : -1;
    const at = sideOf(p, side * (ROAD_HALF + 2.15), 0);
    o.position.set(at.x, 1.15, at.z);
    o.rotation.set(0, p.yaw, 0);
    o.scale.set(0.18, 2.3, 0.18);
    stamp(trunks, o);
    o.position.y = 3.15;
    o.scale.set(2.15, 1.45, 2.15);
    stamp(crowns, o);
  }
  addInstances(
    scene,
    new THREE.CylinderGeometry(1, 1.15, 1, 6),
    new THREE.MeshStandardMaterial({ color: "#6b4a32", roughness: 0.9 }),
    trunks,
  );
  addInstances(
    scene,
    new THREE.SphereGeometry(1, 8, 6),
    new THREE.MeshStandardMaterial({ color: "#2f6b3a", roughness: 0.86 }),
    crowns,
  );
}

type ShopSign = { name: string; sub: string; bg: string; fg: string };

const genericShopSigns: ShopSign[] = shopCategories.map((name, i) => ({
  name,
  sub: "",
  bg: signBands[i % signBands.length],
  fg: "#ffffff",
}));

const verifiedShopSigns: ShopSign[] = [
  { name: "El Doctor", sub: "34 A · شارع الفيوم", bg: "#5a493a", fg: "#f5f0e6" },
  { name: "المليجي دار السلام", sub: "فرع شارع الفيوم", bg: "#5a493a", fg: "#f5f0e6" },
];

function shopTex(name: string, sub: string, bg: string, fg: string) {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 160;
  const g = c.getContext("2d");
  if (!g) return null;
  g.fillStyle = bg;
  g.fillRect(0, 0, 512, 160);
  g.fillStyle = fg;
  g.fillRect(0, 0, 512, 8);
  g.direction = "rtl";
  g.textAlign = "center";
  g.fillStyle = fg;
  g.font = `800 ${name.length > 14 ? 44 : 64}px Tajawal, 'DejaVu Sans', sans-serif`;
  g.fillText(name, 256, 78);
  if (sub) {
    g.font = "500 32px Tajawal, 'DejaVu Sans', sans-serif";
    g.globalAlpha = 0.85;
    g.fillText(sub, 256, 128);
  }
  return texOf(c);
}

export function placeShopSigns(scene: THREE.Scene, track: Track) {
  const buckets = genericShopSigns.map(() => [] as THREE.Matrix4[]);
  const o = new THREE.Object3D();
  const pts = track.pts;
  const signMatrixAt = (distance: number, side: number) => {
    const p = track.sample(distance);
    const at = sideOf(p, side * 10.62, 3.48);
    o.position.set(at.x, at.y, at.z);
    o.rotation.set(0, p.yaw + Math.PI / 2, 0);
    o.scale.set(1, 1, 1);
    o.updateMatrix();
    return o.matrix.clone();
  };
  for (let i = 6; i < pts.length; i += 5) {
    const p = pts[i];
    const nxt = pts[(i + 6) % pts.length];
    const bend = Math.abs(((nxt.yaw - p.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    if (bend > 0.2) continue;
    const side = i % 10 < 5 ? 1 : -1;
    buckets[i % genericShopSigns.length].push(signMatrixAt(p.s, side));
  }
  const addSign = (shop: ShopSign, matrices: THREE.Matrix4[]) => {
    if (!matrices.length) return;
    const map = shopTex(shop.name, shop.sub, shop.bg, shop.fg);
    if (!map) return;
    const mat = new THREE.MeshStandardMaterial({ map, roughness: 0.65, side: THREE.DoubleSide });
    addInstances(scene, new THREE.PlaneGeometry(4.4, 1.35), mat, matrices);
  };
  genericShopSigns.forEach((shop, i) => addSign(shop, buckets[i]));

  // Listings lack map pins, so show each verified name once at an approximate position.
  const placements = [
    { shop: verifiedShopSigns[0], progress: 0.14, side: 1 },
    { shop: verifiedShopSigns[1], progress: 0.64, side: -1 },
  ];
  placements.forEach(({ shop, progress, side }) => {
    addSign(shop, [signMatrixAt(track.total * progress, side)]);
  });
}

function flagTex() {
  const c = document.createElement("canvas");
  c.width = 96;
  c.height = 64;
  const g = c.getContext("2d");
  if (!g) return null;
  g.fillStyle = "#ce1126";
  g.fillRect(0, 0, 96, 21);
  g.fillStyle = "#ffffff";
  g.fillRect(0, 21, 96, 22);
  g.fillStyle = "#111111";
  g.fillRect(0, 43, 96, 21);
  g.fillStyle = "#c5a15a";
  g.beginPath();
  g.arc(48, 32, 8, 0, Math.PI * 2);
  g.fill();
  return texOf(c);
}

export function buildLandmarks(scene: THREE.Scene, track: Track) {
  const stone = new THREE.MeshStandardMaterial({ color: "#e7dcc8", roughness: 0.9 });
  const concrete = new THREE.MeshStandardMaterial({ color: "#b7b1a8", roughness: 0.84 });
  const yellow = new THREE.MeshStandardMaterial({ color: "#e6c56a", roughness: 0.62 });
  const white = new THREE.MeshStandardMaterial({ color: "#f4f0e6", roughness: 0.7 });
  const green = new THREE.MeshStandardMaterial({ color: "#1f6b4a", roughness: 0.55 });
  const red = new THREE.MeshStandardMaterial({ color: "#b3392b", roughness: 0.6 });
  const teal = new THREE.MeshStandardMaterial({ color: "#1a7a78", roughness: 0.55 });
  const dark = new THREE.MeshStandardMaterial({ color: "#2a3138", roughness: 0.5, metalness: 0.2 });
  const flagMat = new THREE.MeshStandardMaterial({ map: flagTex() ?? undefined, roughness: 0.6, side: THREE.DoubleSide });

  const spot = (dist: number, lat: number) => {
    const sm = track.sample(dist);
    const rx = Math.cos(sm.yaw);
    const rz = -Math.sin(sm.yaw);
    return { x: sm.x + rx * lat, z: sm.z + rz * lat, yaw: sm.yaw };
  };
  const put = (index: number, lat: number, build: (g: THREE.Group) => void, ahead = 0) => {
    const p = spot(track.stops[index].s + ahead, lat);
    const g = new THREE.Group();
    g.position.set(p.x, 0, p.z);
    g.rotation.y = p.yaw;
    build(g);
    scene.add(g);
  };

  put(0, 0, (g) => {
    const deck = new THREE.Mesh(new THREE.BoxGeometry(30, 0.5, 9), concrete);
    deck.position.y = 6.3;
    const railL = new THREE.Mesh(new THREE.BoxGeometry(30, 0.85, 0.16), dark);
    railL.position.set(0, 6.9, 4.2);
    const railR = railL.clone();
    railR.position.z = -4.2;
    for (const x of [-13, 13]) {
      for (const z of [-3.2, 3.2]) {
        const col = new THREE.Mesh(new THREE.BoxGeometry(0.85, 6.3, 0.85), concrete);
        col.position.set(x, 3.15, z);
        g.add(col);
      }
    }
    ["#f4f1ea", "#c0392b", "#1a365d", "#f0b429", "#2c3e50", "#95a5a6", "#e6c27a"].forEach((hex, i) => {
      const car = new THREE.Mesh(
        new THREE.BoxGeometry(1.65, 1.2, 3.6),
        new THREE.MeshStandardMaterial({ color: hex, roughness: 0.5 }),
      );
      car.position.set(-9.2 + i * 3.05, 7.15, i % 2 === 0 ? 1.6 : -1.6);
      g.add(car);
    });
    g.add(deck, railL, railR);
  }, 430);

  put(1, 10.6, (g) => {
    ["#f7f7f4", "#e7e4dc", "#d5dde2", "#f4f1ea"].forEach((hex, i) => {
      const bus = new THREE.Mesh(
        new THREE.BoxGeometry(2.05, 2.15, 4.8),
        new THREE.MeshStandardMaterial({ color: hex, roughness: 0.55 }),
      );
      bus.position.set((i % 2) * 2.4, 1.15, (i - 1.5) * 5.6);
      const glass = new THREE.Mesh(
        new THREE.BoxGeometry(1.9, 0.45, 1.3),
        new THREE.MeshStandardMaterial({ color: "#9fd0d8", roughness: 0.15, metalness: 0.2 }),
      );
      glass.position.set((i % 2) * 2.4, 1.85, (i - 1.5) * 5.6 - 1.4);
      g.add(bus, glass);
    });
  });

  put(2, 13.4, (g) => {
    const block = new THREE.Mesh(new THREE.BoxGeometry(8, 18, 7), concrete);
    block.position.y = 9;
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 6, 6), dark);
    mast.position.set(0, 21, 0);
    const dish = new THREE.Mesh(
      new THREE.SphereGeometry(1.2, 10, 8),
      new THREE.MeshStandardMaterial({ color: "#dfe3e6", metalness: 0.45, roughness: 0.35 }),
    );
    dish.scale.set(1, 0.22, 1);
    dish.position.set(2.4, 14.5, 2.8);
    dish.rotation.x = 0.9;
    g.add(block, mast, dish);
  });

  put(3, 13.2, (g) => {
    const block = new THREE.Mesh(new THREE.BoxGeometry(16, 8, 9), stone);
    block.position.y = 4;
    const band = new THREE.Mesh(new THREE.BoxGeometry(16.2, 0.4, 9.2), teal);
    band.position.y = 6.4;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 6, 6), dark);
    pole.position.set(-6.5, 7.2, 4.2);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.15), flagMat);
    flag.position.set(-5.4, 9.4, 4.2);
    g.add(block, band, pole, flag);
  });

  put(4, 13.4, (g) => {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(22, 3.2, 0.4), yellow);
    wall.position.set(0, 1.6, -2);
    const school = new THREE.Mesh(new THREE.BoxGeometry(16, 7, 8), yellow);
    school.position.set(0, 3.5, -6);
    const gate = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.6, 0.3), dark);
    gate.position.set(0, 1.3, -1.8);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 5, 6), dark);
    pole.position.set(6, 5.2, -1.5);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.1), flagMat);
    flag.position.set(7.1, 7.1, -1.5);
    g.add(wall, school, gate, pole, flag);
  });

  put(5, 13.6, (g) => {
    const school = new THREE.Mesh(new THREE.BoxGeometry(14, 6.5, 7), yellow);
    school.position.y = 3.25;
    const band = new THREE.Mesh(new THREE.BoxGeometry(14.2, 0.35, 7.2), green);
    band.position.y = 5.4;
    const gate = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.4, 0.25), dark);
    gate.position.set(0, 1.2, 3.6);
    g.add(school, band, gate);
  });

  put(6, 12.2, (g) => {
    const stair = new THREE.Mesh(new THREE.BoxGeometry(6.5, 0.4, 4.2), concrete);
    stair.position.set(0, 0.5, -1.2);
    stair.rotation.x = 0.18;
    const head = new THREE.Mesh(new THREE.BoxGeometry(7.2, 2.4, 1.2), red);
    head.position.set(0, 3.2, -3.2);
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 1.5, 0.12),
      new THREE.MeshStandardMaterial({ color: "#f6f1e7", roughness: 0.4 }),
    );
    m.position.set(0, 3.25, -2.5);
    g.add(stair, head, m);
  });

  put(7, 12.6, (g) => {
    const clinic = new THREE.Mesh(new THREE.BoxGeometry(9, 5.5, 6), white);
    clinic.position.y = 2.75;
    const cross = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.5, 0.08), red);
    cross.position.set(0, 3.4, 3.05);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.35, 0.08), red);
    bar.position.set(0, 3.4, 3.08);
    g.add(clinic, cross, bar);
  });

  put(8, 12.4, (g) => {
    const post = new THREE.Mesh(new THREE.BoxGeometry(8, 4.2, 5), yellow);
    post.position.y = 2.1;
    const band = new THREE.Mesh(new THREE.BoxGeometry(8.1, 0.7, 5.1), teal);
    band.position.y = 3.5;
    g.add(post, band);
  });

  put(9, 11.8, (g) => {
    const shop = new THREE.Mesh(new THREE.BoxGeometry(6.4, 3.2, 4.4), stone);
    shop.position.y = 1.6;
    const oven = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, 2.4, 8), red);
    oven.position.set(2.1, 4.2, 0);
    const awn = new THREE.Mesh(new THREE.BoxGeometry(6.8, 0.1, 1.6), yellow);
    awn.position.set(0, 3.15, 2.4);
    g.add(shop, oven, awn);
  });

  put(10, 12.2, (g) => {
    const cafe = new THREE.Mesh(new THREE.BoxGeometry(7.2, 3.1, 4), stone);
    cafe.position.y = 1.55;
    const shade = new THREE.Mesh(new THREE.BoxGeometry(8, 0.1, 3.4), teal);
    shade.position.set(0, 3.2, 2.2);
    for (const x of [-2.2, 0, 2.2]) {
      const chair = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.08, 0.55), white);
      chair.position.set(x, 0.48, 2.5);
      g.add(chair);
    }
    g.add(cafe, shade);
  });

  put(11, 11.6, (g) => {
    const cols = [red, teal, yellow, green, dark];
    cols.forEach((mat, i) => {
      const boardM = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.6, 2.4), mat);
      boardM.position.set(0, 3.1, (i - 2) * 2.8);
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.6, 0.12), dark);
      post.position.set(0, 1.3, (i - 2) * 2.8);
      g.add(boardM, post);
    });
  });

  {
    const p = spot(track.gasS, 11.2);
    const g = new THREE.Group();
    g.position.set(p.x, 0, p.z);
    g.rotation.y = p.yaw;
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.22, 5.4), red);
    canopy.position.y = 3.6;
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.12, 1.1), white);
    stripe.position.y = 3.48;
    [-3, 3].forEach((x) => {
      const col = new THREE.Mesh(new THREE.BoxGeometry(0.28, 3.5, 0.28), white);
      col.position.set(x, 1.75, -2);
      g.add(col);
    });
    const pump = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.45, 0.35), dark);
    pump.position.set(0, 0.75, 0.2);
    g.add(canopy, stripe, pump);
    scene.add(g);
  }

  {
    const sm = track.sample(track.total * 0.22);
    const rx = Math.cos(sm.yaw);
    const rz = -Math.sin(sm.yaw);
    const outward = Math.sign(sm.x * rx + sm.z * rz) || 1;
    const g = new THREE.Group();
    g.position.set(sm.x - rx * outward * 28, 0, sm.z - rz * outward * 28);
    const base = new THREE.Mesh(new THREE.BoxGeometry(11, 6, 10), stone);
    base.position.y = 3;
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(3.6, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: "#d9c7a4", roughness: 0.7 }),
    );
    dome.position.y = 6;
    const minaret = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.95, 16, 8), stone);
    minaret.position.set(5.2, 8, 1.5);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(1.1, 2.2, 8), green);
    cap.position.set(5.2, 16.8, 1.5);
    g.add(base, dome, minaret, cap);
    scene.add(g);
  }

  const bumpMat = new THREE.MeshStandardMaterial({ map: bumpTexture() ?? undefined, roughness: 0.55 });
  for (const b of track.bumps) {
    const sm = track.sample(b);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(13.5, 0.16, 0.9), bumpMat);
    mesh.position.set(sm.x, 0.09, sm.z);
    mesh.rotation.y = sm.yaw;
    scene.add(mesh);
  }

  // broadleaf canopies on the sidewalk — denser on the right, clear on the bridge
  const trunks: THREE.Matrix4[] = [];
  const crowns: THREE.Matrix4[] = [];
  const crownCols: THREE.Color[] = [];
  const greens = [new THREE.Color("#1b522c"), new THREE.Color("#246338"), new THREE.Color("#143f22"), new THREE.Color("#2d6d3e")];
  const tree = new THREE.Object3D();
  for (let i = 3; i < track.pts.length; i += 2) {
    const p = track.pts[i];
    if (p.s > 125 && p.s < 325) continue;
    const nxt = track.pts[(i + 6) % track.pts.length];
    const bend = Math.abs(((nxt.yaw - p.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    if (bend > 0.22) continue;
    const hsh = Math.abs(Math.sin(i * 9.17) * 43758.5453) % 1;
    const sides: number[] = [1];
    if (i % 6 === 3) sides.push(-1);
    for (const side of sides) {
      const lat = side * (9.05 + hsh * 0.2);
      const rx = Math.cos(p.yaw);
      const rz = -Math.sin(p.yaw);
      const fx = -Math.sin(p.yaw);
      const fz = -Math.cos(p.yaw);
      const x = p.x + rx * lat;
      const z = p.z + rz * lat;
      const h = 4.4 + hsh * 1.8;
      tree.position.set(x, h / 2, z);
      tree.rotation.set(0, hsh * 6, 0);
      tree.scale.set(1, h, 1);
      tree.updateMatrix();
      trunks.push(tree.matrix.clone());
      const crownY = h * 0.72;
      const spread = 2.05 + hsh * 0.55;
      const blobs: [number, number, number, number][] = [
        [0, 0.15, 0, 1],
        [-side * 0.55, 0.35, 0.4, 0.72],
        [side * 0.15, -0.05, -0.55, 0.64],
      ];
      for (const [ox, oy, oz, sc] of blobs) {
        tree.position.set(x + rx * ox + fx * oz, crownY + oy, z + rz * ox + fz * oz);
        tree.scale.set(spread * sc, 0.62 * sc, spread * 0.9 * sc);
        tree.updateMatrix();
        crowns.push(tree.matrix.clone());
        crownCols.push(greens[(i + Math.round(sc * 3)) % greens.length]);
      }
    }
  }
  if (trunks.length) {
    const trunkMesh = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.11, 0.18, 1, 6),
      new THREE.MeshStandardMaterial({ color: "#6b4a2b", roughness: 0.9 }),
      trunks.length,
    );
    trunkMesh.frustumCulled = false;
    trunkMesh.castShadow = true;
    trunks.forEach((m, i) => trunkMesh.setMatrixAt(i, m));
    const crownMesh = new THREE.InstancedMesh(
      new THREE.SphereGeometry(1, 7, 5),
      new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.78 }),
      crowns.length,
    );
    crownMesh.frustumCulled = false;
    crownMesh.castShadow = true;
    crowns.forEach((m, i) => {
      crownMesh.setMatrixAt(i, m);
      crownMesh.setColorAt(i, crownCols[i]);
    });
    scene.add(trunkMesh, crownMesh);
  }
}

export function buildPosts(scene: THREE.Scene, track: Track) {
  const metal = new THREE.MeshStandardMaterial({ color: "#c5ccd3", roughness: 0.45, metalness: 0.25 });
  const cam = new THREE.MeshStandardMaterial({ color: "#f0b429", emissive: "#f0b429", emissiveIntensity: 0.35 });
  const boothMat = new THREE.MeshStandardMaterial({ color: "#1d4e89", roughness: 0.6 });
  const addCam = (s: number) => {
    const sm = track.sample(s);
    const rx = Math.cos(sm.yaw);
    const rz = -Math.sin(sm.yaw);
    const g = new THREE.Group();
    g.position.set(sm.x + rx * 10.6, 0, sm.z + rz * 10.6);
    g.rotation.y = sm.yaw;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 4.4, 6), metal);
    pole.position.y = 2.2;
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.22, 0.45), cam);
    eye.position.set(-0.2, 4.2, 0);
    g.add(pole, eye);
    scene.add(g);
  };
  for (const s of track.radarS) addCam(s);
  const sm = track.sample(track.tollS);
  const rx = Math.cos(sm.yaw);
  const rz = -Math.sin(sm.yaw);
  const booth = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.2, 1.6), boothMat);
  booth.position.set(sm.x + rx * 9.4, 1.1, sm.z + rz * 9.4);
  booth.rotation.y = sm.yaw;
  scene.add(booth);
}

/** More realistic low-poly Egyptian pedestrians with arms, variety & density */
export function placePeople(scene: THREE.Scene, track: Track) {
  const skins = ["#c49a78", "#a87b5c", "#d4b48c", "#8d6e4a", "#b08968", "#e0b896"].map(
    (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.68 }),
  );
  const shirts = [
    "#1e3a5f", "#2d5a3d", "#8b3a2a", "#3a3a4a", "#c45c3e", "#1aa6a6",
    "#f0b429", "#ffffff", "#e8e0d2", "#4a6741", "#6b2d5c", "#2c3e50",
  ].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.72 }));
  const pants = ["#2a2e35", "#3d4450", "#1a1e24", "#4a3f35", "#5c4033", "#1c2833"].map(
    (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 }),
  );

  const bodyGeo = new THREE.CapsuleGeometry(0.17, 0.42, 4, 6);
  const headGeo = new THREE.SphereGeometry(0.125, 8, 6);
  const legGeo = new THREE.CapsuleGeometry(0.065, 0.38, 3, 5);
  const armGeo = new THREE.CapsuleGeometry(0.045, 0.28, 3, 5);

  // denser placement along the track
  for (let i = 0; i < track.pts.length; i += 4) {
    const p = track.pts[i];
    const hsh = Math.abs(Math.sin(i * 7.13 + 1.7) * 43758.5453) % 1;
    if (hsh < 0.22) continue;
    if (p.s > 145 && p.s < 330) continue;

    const side = hsh > 0.48 ? 1 : -1;
    const rx = Math.cos(p.yaw);
    const rz = -Math.sin(p.yaw);
    const lateral = ROAD_HALF + 1.05 + (hsh % 0.4) * 0.85;
    const g = new THREE.Group();
    g.position.set(p.x + rx * side * lateral, 0, p.z + rz * side * lateral);
    // face along or against traffic randomly
    g.rotation.y = p.yaw + (hsh - 0.5) * 0.9 + (side > 0 ? Math.PI : 0) + (hsh > 0.75 ? Math.PI * 0.5 : 0);

    const scale = 0.88 + (hsh % 0.25); // height variation
    g.scale.set(scale, scale, scale);

    const skin = skins[i % skins.length];
    const shirt = shirts[i % shirts.length];
    const pant = pants[i % pants.length];

    // torso
    const torso = new THREE.Mesh(bodyGeo, shirt);
    torso.position.y = 1.02;
    // head
    const head = new THREE.Mesh(headGeo, skin);
    head.position.y = 1.48;
    g.add(torso, head);
    if (hsh > 0.46) {
      const scarfMat = shirts[(i + 3) % shirts.length];
      const scarf = new THREE.Mesh(new THREE.SphereGeometry(0.145, 8, 6), scarfMat);
      scarf.scale.set(1.05, 0.72, 1.12);
      scarf.position.set(0, 1.52, -0.01);
      const drape = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.28, 0.06), scarfMat);
      drape.position.set(hsh > 0.7 ? 0.1 : -0.08, 1.32, 0.02);
      g.add(scarf, drape);
    }
    // legs slightly apart / walking pose
    const legL = new THREE.Mesh(legGeo, pant);
    legL.position.set(-0.09, 0.38, hsh > 0.5 ? 0.06 : -0.04);
    legL.rotation.x = hsh > 0.5 ? 0.15 : -0.12;
    const legR = new THREE.Mesh(legGeo, pant);
    legR.position.set(0.09, 0.38, hsh > 0.5 ? -0.05 : 0.05);
    legR.rotation.x = hsh > 0.5 ? -0.12 : 0.15;
    // arms
    const armL = new THREE.Mesh(armGeo, shirt);
    armL.position.set(-0.26, 1.05, 0);
    armL.rotation.z = 0.35 + (hsh % 0.3);
    armL.rotation.x = (hsh - 0.5) * 0.4;
    const armR = new THREE.Mesh(armGeo, shirt);
    armR.position.set(0.26, 1.05, 0);
    armR.rotation.z = -0.35 - (hsh % 0.25);
    armR.rotation.x = (0.5 - hsh) * 0.4;

    g.add(legL, legR, armL, armR);
    scene.add(g);

    // occasional second person nearby (group / talking)
    if (hsh > 0.82 && i % 3 === 0) {
      const g2 = g.clone();
      g2.position.x += rx * side * 0.7 + rz * 0.55;
      g2.position.z += rz * side * 0.7 - rx * 0.55;
      g2.rotation.y += 0.6;
      g2.scale.setScalar(0.92 + (hsh % 0.15));
      scene.add(g2);
    }
  }
}

// Dogs on the street
export function placeDogs(scene: THREE.Scene, track: Track) {
  streetLoader().load("/models/dog_3d_model.glb", (gltf) => {
    const proto = fitProp(gltf.scene, { height: 0.62 });
    let placed = 0;
    for (let i = 6; i < track.pts.length && placed < 4; i += 36) {
      const p = track.pts[i];
      const dog = cloneModel(proto);
      const side = i % 2 === 0 ? 1 : -1;
      const rx = Math.cos(p.yaw);
      const rz = -Math.sin(p.yaw);
      dog.position.set(p.x + rx * side * (ROAD_HALF + 1.8), 0, p.z + rz * side * (ROAD_HALF + 1.8));
      dog.rotation.y = p.yaw + (side > 0 ? 0 : Math.PI);
      dog.name = "street-dog";
      dog.userData.s = p.s;
      dog.userData.side = side;
      dog.userData.dir = side > 0 ? 1 : -1;
      dog.userData.speed = 0.75 + (placed % 3) * 0.15;
      dog.userData.phase = placed;
      scene.add(dog);
      placed += 1;
    }
  });
}

export function placeBikes(scene: THREE.Scene, track: Track) {
  streetLoader().load("/models/lowpoly_motorbikes.glb", (gltf) => {
    const holder = gltf.scene.getObjectByName("Root") ?? gltf.scene;
    const arms = holder.children.filter((child) => /^Armature\d*$/.test(child.name));
    const sources = arms.length ? arms : [gltf.scene];
    const protos = sources.map((src) => fitProp(src, { length: 1.85, nose: true }));
    for (let i = 0; i < 6; i++) {
      const p = track.sample((track.total * (i + 0.35)) / 8);
      const bike = cloneModel(protos[i % protos.length]);
      const side = i % 2 === 0 ? 1 : -1;
      const rx = Math.cos(p.yaw);
      const rz = -Math.sin(p.yaw);
      bike.position.set(p.x + rx * side * (ROAD_HALF + 0.95), 0, p.z + rz * side * (ROAD_HALF + 0.95));
      bike.rotation.y = p.yaw + side * 0.15;
      scene.add(bike);
    }
  });
}
