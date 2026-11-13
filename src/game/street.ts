import * as THREE from "three";
import { ROAD_HALF, type Track } from "./track";

/** Sidewalk spill into the right lane — checked by the sim. */
export const OCCUPATIONS: { s: number; lat: number }[] = [];

function texOf(c: HTMLCanvasElement) {
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function board(lines: string[], bg: string, fg: string, h = 320) {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = h;
  const g = c.getContext("2d");
  if (!g) return null;
  g.fillStyle = bg;
  g.fillRect(0, 0, 512, h);
  g.fillStyle = "#f0b429";
  g.fillRect(0, 0, 512, 14);
  g.direction = "rtl";
  g.textAlign = "center";
  g.fillStyle = fg;
  const step = Math.min(64, (h - 40) / lines.length);
  lines.forEach((line, i) => {
    g.font = i === 0 ? "800 54px Tajawal, 'DejaVu Sans', sans-serif" : "700 36px Tajawal, 'DejaVu Sans', sans-serif";
    g.fillText(line, 256, 70 + i * step);
  });
  return texOf(c);
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
  if (!mats.length) return null;
  const mesh = new THREE.InstancedMesh(geo, mat, mats.length);
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mats.forEach((m, i) => mesh.setMatrixAt(i, m));
  if (colors) colors.forEach((c, i) => mesh.setColorAt(i, c));
  scene.add(mesh);
  return mesh;
}

function side(p: { x: number; z: number; yaw: number }, lat: number, y: number) {
  const rx = Math.cos(p.yaw);
  const rz = -Math.sin(p.yaw);
  return { x: p.x + rx * lat, y, z: p.z + rz * lat };
}

/** Props that make Fayoum Street read as Dar El Salam: vendors, gallons, racks, crosswalks, footbridge, dust. */
export function dressStreet(scene: THREE.Scene, track: Track) {
  OCCUPATIONS.length = 0;
  const o = new THREE.Object3D();
  const racks: THREE.Matrix4[] = [];
  const cloth: THREE.Matrix4[] = [];
  const clothCols: THREE.Color[] = [];
  const gallons: THREE.Matrix4[] = [];
  const chairs: THREE.Matrix4[] = [];
  const produce: THREE.Matrix4[] = [];
  const produceCols: THREE.Color[] = [];
  const carts: THREE.Matrix4[] = [];
  const umbrellas: THREE.Matrix4[] = [];
  const umbrellaCols: THREE.Color[] = [];
  const poles: THREE.Matrix4[] = [];
  const stripes: THREE.Matrix4[] = [];
  const cones: THREE.Matrix4[] = [];
  const colors = ["#c45c3e", "#1d4e89", "#f4f1ea", "#2f6b3a", "#111", "#e6c27a", "#6b3a5d"].map(
    (h) => new THREE.Color(h),
  );
  const veg = ["#2f6b3a", "#c0392b", "#e67e22", "#f4d03f", "#8e44ad"].map((h) => new THREE.Color(h));

  const pts = track.pts;
  for (let i = 6; i < pts.length; i += 5) {
    const p = pts[i];
    const nxt = pts[(i + 6) % pts.length];
    const bend = Math.abs(((nxt.yaw - p.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    if (bend > 0.18) continue;
    const hsh = Math.abs(Math.sin(i * 9.17) * 43758.5453) % 1;
    // right sidewalk spill (Egypt drives on the right)
    if (i % 14 === 8) {
      const lat = 5.55 + hsh * 0.7;
      const at = side(p, lat, 0.55);
      o.position.set(at.x, 0.55, at.z);
      o.rotation.set(0, p.yaw, 0);
      o.scale.set(1.1, 0.9, 0.7);
      stamp(carts, o);
      OCCUPATIONS.push({ s: p.s, lat });
      o.position.set(at.x, 2.05, at.z);
      o.rotation.set(0, p.yaw + hsh, 0);
      o.scale.set(1.55, 1, 1.55);
      stamp(umbrellas, o);
      umbrellaCols.push(colors[(i + 2) % colors.length]);
      o.position.set(at.x, 1.05, at.z);
      o.rotation.set(0, 0, 0);
      o.scale.set(1, 1, 1);
      stamp(poles, o);
      for (let k = 0; k < 3; k++) {
        const vegAt = side(p, lat - 0.15, 1.05);
        o.position.set(vegAt.x, 1.05 + k * 0.02, vegAt.z);
        o.scale.set(0.28, 0.22, 0.28);
        stamp(produce, o);
        produceCols.push(veg[(i + k) % veg.length]);
      }
    }
    if (i % 11 === 1) {
      const at = side(p, ROAD_HALF + 2.4, 0.7);
      o.position.set(at.x, 0.7, at.z);
      o.rotation.set(0, p.yaw, 0);
      o.scale.set(1.4, 1.15, 0.35);
      stamp(racks, o);
      for (let k = 0; k < 4; k++) {
        o.position.set(at.x, 0.85, at.z);
        o.scale.set(0.22, 0.55, 0.08);
        o.position.x += Math.cos(p.yaw) * (k - 1.5) * 0.28;
        o.position.z += -Math.sin(p.yaw) * (k - 1.5) * 0.28;
        stamp(cloth, o);
        clothCols.push(colors[(i + k) % colors.length]);
      }
    }
    if (i % 9 === 4) {
      const at = side(p, ROAD_HALF + 1.7, 0.22);
      for (let k = 0; k < 3; k++) {
        o.position.set(at.x, 0.18 + k * 0.28, at.z);
        o.rotation.set(0, p.yaw + k, 0);
        o.scale.set(0.32, 0.42, 0.32);
        stamp(gallons, o);
      }
    }
    if (i % 13 === 2) {
      const at = side(p, ROAD_HALF + 2.1, 0.42);
      o.position.set(at.x, 0.42, at.z);
      o.rotation.set(0, p.yaw + 0.4, 0);
      o.scale.set(0.42, 0.08, 0.42);
      stamp(chairs, o);
    }
  }

  for (const stop of track.stops) {
    for (let k = -3; k <= 3; k++) {
      const sm = track.sample(stop.s + k * 1.15);
      o.position.set(sm.x, 0.05, sm.z);
      o.rotation.set(0, sm.yaw, 0);
      o.scale.set(7.2, 1, 0.38);
      stamp(stripes, o);
    }
  }

  const kamin = track.radarS[1] ?? track.total * 0.41;
  for (let k = 0; k < 6; k++) {
    const sm = track.sample(kamin - 6 + k * 2.2);
    const rx = Math.cos(sm.yaw);
    const rz = -Math.sin(sm.yaw);
    const lat = k % 2 === 0 ? 2.2 : 5.4;
    o.position.set(sm.x + rx * lat, 0.35, sm.z + rz * lat);
    o.rotation.set(0, sm.yaw, 0);
    o.scale.set(1, 1, 1);
    stamp(cones, o);
  }

  const metal = new THREE.MeshStandardMaterial({ color: "#8d949c", roughness: 0.45, metalness: 0.35 });
  addInstances(scene, new THREE.BoxGeometry(1, 1, 1), metal, racks);
  addInstances(
    scene,
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.8 }),
    cloth,
    clothCols,
  );
  addInstances(
    scene,
    new THREE.CylinderGeometry(0.5, 0.5, 1, 8),
    new THREE.MeshStandardMaterial({ color: "#d5ebe8", roughness: 0.4 }),
    gallons,
  );
  addInstances(
    scene,
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: "#f4f1ea", roughness: 0.7 }),
    chairs,
  );
  addInstances(
    scene,
    new THREE.SphereGeometry(0.5, 6, 5),
    new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.7 }),
    produce,
    produceCols,
  );
  addInstances(
    scene,
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: "#6b4a2b", roughness: 0.85 }),
    carts,
  );
  const shade = new THREE.ConeGeometry(0.95, 0.42, 8);
  shade.translate(0, 0.12, 0);
  addInstances(
    scene,
    shade,
    new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.72, side: THREE.DoubleSide }),
    umbrellas,
    umbrellaCols,
  );
  const poleGeo = new THREE.CylinderGeometry(0.045, 0.045, 1.7, 6);
  poleGeo.translate(0, 0.85, 0);
  addInstances(
    scene,
    poleGeo,
    new THREE.MeshStandardMaterial({ color: "#3a4148", roughness: 0.55, metalness: 0.25 }),
    poles,
  );
  addInstances(
    scene,
    new THREE.BoxGeometry(1, 0.02, 1),
    new THREE.MeshStandardMaterial({ color: "#f4f0e4", roughness: 0.6 }),
    stripes,
  );
  const coneGeo = new THREE.ConeGeometry(0.22, 0.7, 7);
  coneGeo.translate(0, 0.35, 0);
  addInstances(
    scene,
    coneGeo,
    new THREE.MeshStandardMaterial({ color: "#e23b2b", roughness: 0.55 }),
    cones,
  );

  footbridge(scene, track, track.total * 0.5);
  dust(scene, track);
}

function footbridge(scene: THREE.Scene, track: Track, dist: number) {
  const sm = track.sample(dist);
  const g = new THREE.Group();
  g.position.set(sm.x, 0, sm.z);
  g.rotation.y = sm.yaw;
  const concrete = new THREE.MeshStandardMaterial({ color: "#c8c2b6", roughness: 0.86 });
  const rail = new THREE.MeshStandardMaterial({ color: "#3d4650", roughness: 0.5, metalness: 0.2 });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(24, 0.16, 1.8), concrete);
  deck.position.y = 4.7;
  const r1 = new THREE.Mesh(new THREE.BoxGeometry(24, 0.9, 0.08), rail);
  r1.position.set(0, 5.2, 0.85);
  const r2 = r1.clone();
  r2.position.z = -0.85;
  for (const sideX of [-11.2, 11.2]) {
    const stair = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.14, 5.2), concrete);
    stair.position.set(sideX, 2.4, 3.2);
    stair.rotation.x = -0.72;
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.28, 4.7, 0.28), concrete);
    post.position.set(sideX, 2.35, 0);
    g.add(stair, post);
  }
  g.add(deck, r1, r2);
  scene.add(g);
}

function dust(scene: THREE.Scene, track: Track) {
  const n = 280;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const sm = track.sample((i / n) * track.total);
    const rx = Math.cos(sm.yaw);
    const rz = -Math.sin(sm.yaw);
    const lat = (i % 2 === 0 ? 1 : -1) * (4 + (i % 9));
    pos[i * 3] = sm.x + rx * lat;
    pos[i * 3 + 1] = 1.2 + (i % 7) * 0.7;
    pos[i * 3 + 2] = sm.z + rz * lat;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(
    geo,
    new THREE.PointsMaterial({
      color: "#cbb89a",
      size: 0.22,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
      sizeAttenuation: true,
    }),
  );
  pts.frustumCulled = false;
  const base = pos.slice(0);
  pts.onBeforeRender = () => {
    const t = performance.now() * 0.00015;
    const arr = geo.attributes.position.array as Float32Array;
    for (let i = 0; i < n; i++) {
      arr[i * 3] = base[i * 3] + Math.sin(t + i) * 0.35;
      arr[i * 3 + 1] = base[i * 3 + 1] + Math.sin(t * 2 + i * 0.7) * 0.2;
    }
    geo.attributes.position.needsUpdate = true;
  };
  scene.add(pts);
}

export function placeLocalSigns(scene: THREE.Scene, track: Track) {
  const hang = (dist: number, lat: number, lines: string[], bg: string, fg = "#f6f1e7", w = 4.2, h = 2.4) => {
    const map = board(lines, bg, fg, Math.round(256 * (h / 2.2)));
    if (!map) return;
    const sm = track.sample(dist);
    const rx = Math.cos(sm.yaw);
    const rz = -Math.sin(sm.yaw);
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshStandardMaterial({ map, roughness: 0.6, side: THREE.DoubleSide }),
    );
    mesh.position.set(sm.x + rx * lat, 3.4, sm.z + rz * lat);
    mesh.rotation.y = sm.yaw + Math.PI / 2;
    scene.add(mesh);
  };

  hang(track.stops[0].s + 10, 12, ["مدرسة المعمارية", "بداية المسار"], "#1e8449", "#ffffff", 4.6, 1.8);

  for (const stop of track.stops) {
    const side = Math.floor(stop.s / 40) % 2 === 0 ? 11 : -10.6;
    hang(stop.s - 4, side, [stop.name], "#16324f", "#f6f1e7", 4.8, 1.55);
  }

  const find = (name: string) => track.stops.find((stop) => stop.name === name);
  const wall = find("سور المترو · شارع ٩");
  const metro = find("مترو دار السلام");
  const bridge = find("كوبري المترو");
  const turn = find("يمين عند الكوبري");
  const end = find("محطة أبو طالب");
  const koshary = find("كشري أبو حنفي");
  if (koshary) hang(koshary.s + 6, -11.2, ["كشري أبو حنفي", "عدّي من هنا"], "#c0392b", "#ffffff", 4.2, 1.6);
  if (wall) hang(wall.s, -12.2, ["سور المترو", "على شمالك"], "#1c2833", "#f0b429", 4.4, 1.8);
  if (metro) hang(metro.s + 8, 11.6, ["مترو دار السلام", "الخط الأول · على شمالك"], "#c0392b", "#ffffff", 4.8, 1.8);
  if (bridge) hang(bridge.s, 12, ["الكوبري قدامك", "معدّي فوق المترو"], "#16324f", "#f0b429", 4.6, 1.8);
  if (turn) hang(turn.s, -11.4, ["واحد يمين", "الكوبري على شمالك"], "#0b3a82", "#ffffff", 4.4, 1.8);
  if (end) hang(end.s + 6, 11.2, ["محطة أبو طالب", "آخر المسار"], "#0b3a82", "#ffffff", 4.6, 1.8);
}

// Add realistic speed bumps (مطبات) common on Faiyum Street
export function placeSpeedBumps(scene: THREE.Scene, track: Track) {
  const bumpMat = new THREE.MeshStandardMaterial({ color: "#f4d03f", roughness: 0.6, metalness: 0.1 });
  const bumpGeo = new THREE.BoxGeometry(4.2, 0.12, 0.35);
  for (let i = 15; i < track.pts.length; i += 18) {
    const p = track.pts[i];
    const bump = new THREE.Mesh(bumpGeo, bumpMat);
    bump.position.set(p.x, 0.06, p.z);
    bump.rotation.y = p.yaw;
    bump.castShadow = true;
    bump.receiveShadow = true;
    scene.add(bump);
  }
}

// Thin median was a center curb; the real street is open lanes, so this stays unused.
export function placeMedian(scene: THREE.Scene, track: Track) {
  void scene;
  void track;
}

/** Parked cars along both curbs, outside the driving lanes. */
export function placeCurbCars(scene: THREE.Scene, track: Track) {
  const bodyGeo = new THREE.BoxGeometry(1.62, 0.46, 4.05);
  bodyGeo.translate(0, 0.34, 0);
  const cabGeo = new THREE.BoxGeometry(1.42, 0.4, 1.85);
  cabGeo.translate(0, 0.78, -0.22);
  const paints = ["#f4f1ea", "#1c1e22", "#c5ccd4", "#b23b3b", "#2a4d8f", "#d9c7a2", "#3d4a3a"].map(
    (hex) => new THREE.Color(hex),
  );
  const bodies: THREE.Matrix4[] = [];
  const cols: THREE.Color[] = [];
  const cabs: THREE.Matrix4[] = [];
  const o = new THREE.Object3D();
  const pts = track.pts;
  const nearStop = (s: number) =>
    track.stops.some((stop) => {
      let d = Math.abs(s - stop.s);
      if (d > track.total * 0.5) d = track.total - d;
      return d < 16;
    });
  for (let i = 8; i < pts.length; i += 2) {
    const p = pts[i];
    if (p.s < 22 || (p.s > 145 && p.s < 335)) continue;
    if (nearStop(p.s)) continue;
    const nxt = pts[(i + 6) % pts.length];
    const bend = Math.abs(((nxt.yaw - p.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    if (bend > 0.16) continue;
    const hsh = Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1;
    if (hsh < 0.08) continue;
    const rx = Math.cos(p.yaw);
    const rz = -Math.sin(p.yaw);
    for (const side of [-1, 1] as const) {
      if (side < 0 && hsh > 0.9) continue;
      const lat = side * 7.42;
      o.position.set(p.x + rx * lat, 0, p.z + rz * lat);
      o.rotation.set(0, p.yaw + (side > 0 ? Math.PI : 0), 0);
      o.scale.set(1, 0.92 + (hsh % 0.16), 0.92 + ((1 - hsh) % 0.14));
      o.updateMatrix();
      bodies.push(o.matrix.clone());
      cabs.push(o.matrix.clone());
      cols.push(paints[(i + (side > 0 ? 2 : 0)) % paints.length]);
    }
  }
  if (!bodies.length) return;
  const bodyMat = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.52, metalness: 0.16 });
  const body = new THREE.InstancedMesh(bodyGeo, bodyMat, bodies.length);
  body.frustumCulled = false;
  body.castShadow = true;
  body.receiveShadow = true;
  bodies.forEach((m, i) => {
    body.setMatrixAt(i, m);
    body.setColorAt(i, cols[i]);
  });
  const cabMat = new THREE.MeshStandardMaterial({ color: "#9ec3cf", roughness: 0.12, metalness: 0.28 });
  const cab = new THREE.InstancedMesh(cabGeo, cabMat, cabs.length);
  cab.frustumCulled = false;
  cabs.forEach((m, i) => cab.setMatrixAt(i, m));
  scene.add(body, cab);
}

/** Jersey barrier and rail on the elevated stretch, like the Faiyum overpass. */
export function placeBridgeWalls(scene: THREE.Scene, track: Track) {
  const walls: THREE.Matrix4[] = [];
  const rails: THREE.Matrix4[] = [];
  const posts: THREE.Matrix4[] = [];
  const o = new THREE.Object3D();
  const pts = track.pts;
  for (let i = 0; i < pts.length; i += 1) {
    const p = pts[i];
    if (p.s < 155 || p.s > 335) continue;
    const rx = Math.cos(p.yaw);
    const rz = -Math.sin(p.yaw);
    for (const side of [-1, 1] as const) {
      o.position.set(p.x + rx * side * 8.32, 0.4, p.z + rz * side * 8.32);
      o.rotation.set(0, p.yaw, 0);
      o.scale.set(1, 1, 1);
      o.updateMatrix();
      walls.push(o.matrix.clone());
      o.position.y = 1.02;
      o.updateMatrix();
      rails.push(o.matrix.clone());
      if (i % 4 === 0) {
        o.position.y = 0.7;
        o.updateMatrix();
        posts.push(o.matrix.clone());
      }
    }
  }
  if (!walls.length) return;
  const concrete = new THREE.MeshStandardMaterial({ color: "#d5d0c6", roughness: 0.86 });
  const metal = new THREE.MeshStandardMaterial({ color: "#c5ccd3", roughness: 0.38, metalness: 0.55 });
  const wall = new THREE.InstancedMesh(new THREE.BoxGeometry(0.46, 0.8, 3.75), concrete, walls.length);
  wall.frustumCulled = false;
  wall.castShadow = true;
  wall.receiveShadow = true;
  walls.forEach((m, i) => wall.setMatrixAt(i, m));
  const rail = new THREE.InstancedMesh(new THREE.BoxGeometry(0.08, 0.08, 3.75), metal, rails.length);
  rail.frustumCulled = false;
  rails.forEach((m, i) => rail.setMatrixAt(i, m));
  const post = new THREE.InstancedMesh(new THREE.BoxGeometry(0.06, 0.7, 0.06), metal, Math.max(1, posts.length));
  post.frustumCulled = false;
  posts.forEach((m, i) => post.setMatrixAt(i, m));
  scene.add(wall, rail, post);
}

/** Concrete metro viaduct on the left through the agreed end of the route. */
export function placeMetroRun(scene: THREE.Scene, track: Track) {
  const from = track.stops.find((stop) => stop.name.startsWith("حسنين"));
  const to = track.stops.find((stop) => stop.name === "محطة أبو طالب");
  if (!from || !to) return;
  let span = to.s - from.s;
  if (span <= 0) span += track.total;
  const wall: THREE.Matrix4[] = [];
  const stripe: THREE.Matrix4[] = [];
  const o = new THREE.Object3D();
  const steps = Math.max(14, Math.floor(span / 6));
  for (let i = 0; i <= steps; i++) {
    const sm = track.sample(from.s + (span * i) / steps);
    const rx = Math.cos(sm.yaw);
    const rz = -Math.sin(sm.yaw);
    const lat = ROAD_HALF + 1.2;
    o.position.set(sm.x + rx * lat, 2.35, sm.z + rz * lat);
    o.rotation.set(0, sm.yaw, 0);
    o.scale.set(0.42, 4.7, 6.4);
    o.updateMatrix();
    wall.push(o.matrix.clone());
    o.position.y = 4.5;
    o.scale.set(0.5, 0.22, 6.4);
    o.updateMatrix();
    stripe.push(o.matrix.clone());
  }
  const concrete = new THREE.MeshStandardMaterial({ color: "#b7b2a6", roughness: 0.92 });
  const warn = new THREE.MeshStandardMaterial({ color: "#d7a400", roughness: 0.55 });
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), concrete, wall.length);
  mesh.frustumCulled = false;
  wall.forEach((m, i) => mesh.setMatrixAt(i, m));
  const band = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), warn, stripe.length);
  band.frustumCulled = false;
  stripe.forEach((m, i) => band.setMatrixAt(i, m));
  scene.add(mesh, band);

  const bridge = track.stops.find((stop) => stop.name === "كوبري المترو");
  if (!bridge) return;
  const sm = track.sample(bridge.s);
  const deck = new THREE.Mesh(
    new THREE.BoxGeometry(ROAD_HALF * 2 + 8, 0.42, 2.6),
    new THREE.MeshStandardMaterial({ color: "#c9c4b8", roughness: 0.82 }),
  );
  deck.position.set(sm.x, 5.5, sm.z);
  deck.rotation.y = sm.yaw;
  scene.add(deck);
}


// Street lights like in the video
export function placeStreetLights(scene: THREE.Scene, track: Track) {
  const poleMat = new THREE.MeshStandardMaterial({ color: "#c5ccd3", roughness: 0.4, metalness: 0.3 });
  const lampMat = new THREE.MeshStandardMaterial({ color: "#f4f1ea", emissive: "#fff8e7", emissiveIntensity: 0.3 });
  for (let i = 0; i < track.pts.length; i += 12) {
    const p = track.pts[i];
    const rx = Math.cos(p.yaw);
    const rz = -Math.sin(p.yaw);
    for (const side of [-1, 1]) {
      const g = new THREE.Group();
      g.position.set(p.x + rx * side * 9.5, 0, p.z + rz * side * 9.5);
      g.rotation.y = p.yaw;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 6.5, 6), poleMat);
      pole.position.y = 3.25;
      const arm = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.06, 0.06), poleMat);
      arm.position.set(side * 0.5, 6.2, 0);
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.25), lampMat);
      lamp.position.set(side * 1.1, 6.15, 0);
      g.add(pole, arm, lamp);
      scene.add(g);
    }
  }
}
