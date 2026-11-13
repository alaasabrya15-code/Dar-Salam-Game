import * as THREE from "three";

const BAY_W = 3.35;
const BAY_H = 3.05;

function hash(ix: number, iy: number) {
  const s = Math.sin(ix * 127.1 + iy * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function noise(x: number, y: number) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash(x0, y0);
  const b = hash(x0 + 1, y0);
  const c = hash(x0, y0 + 1);
  const d = hash(x0 + 1, y0 + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

function fbm(x: number, y: number) {
  let v = 0;
  let a = 0.55;
  let f = 1;
  for (let i = 0; i < 4; i++) {
    v += a * noise(x * f, y * f);
    a *= 0.5;
    f *= 2;
  }
  return v;
}

function linearTex(c: HTMLCanvasElement) {
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

function colorTex(c: HTMLCanvasElement) {
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

function normalsFrom(height: Float32Array, w: number, h: number, strength: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  if (!g) return null;
  const img = g.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const l = height[y * w + ((x - 1 + w) % w)];
      const r = height[y * w + ((x + 1) % w)];
      const u = height[((y - 1 + h) % h) * w + x];
      const d = height[((y + 1) % h) * w + x];
      const dx = (r - l) * strength;
      const dy = (d - u) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * w + x) * 4;
      img.data[i] = (-dx / len) * 127 + 128;
      img.data[i + 1] = (-dy / len) * 127 + 128;
      img.data[i + 2] = (1 / len) * 127 + 128;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return linearTex(c);
}

const PLASTER = ["#d7c2a4", "#e4d0b2", "#cbb09a", "#d5cdc0", "#e7d3ae"];

function paintBay(seed: number) {
  const w = 512;
  const h = 512;
  const face = document.createElement("canvas");
  face.width = w;
  face.height = h;
  const g = face.getContext("2d");
  if (!g) return null;
  const base = PLASTER[seed % PLASTER.length];
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);
  const img = g.getImageData(0, 0, w, h);
  const px = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const n = fbm(x / 90 + seed, y / 90);
      const stain = fbm(x / 28 + 4, y / 140) ;
      const i = (y * w + x) * 4;
      const grit = (n - 0.45) * 46 + (stain - 0.5) * 18;
      px[i] = Math.max(0, Math.min(255, px[i] + grit));
      px[i + 1] = Math.max(0, Math.min(255, px[i + 1] + grit * 0.92));
      px[i + 2] = Math.max(0, Math.min(255, px[i + 2] + grit * 0.75));
    }
  }
  g.putImageData(img, 0, 0);

  const height = new Float32Array(w * h);
  height.fill(0.45);
  const rough = document.createElement("canvas");
  rough.width = w;
  rough.height = h;
  const rg = rough.getContext("2d");
  const emit = document.createElement("canvas");
  emit.width = w;
  emit.height = h;
  const eg = emit.getContext("2d");
  if (!rg || !eg) return null;
  rg.fillStyle = "#d0d0d0";
  rg.fillRect(0, 0, w, h);
  eg.fillStyle = "#000";
  eg.fillRect(0, 0, w, h);

  const setH = (x0: number, y0: number, x1: number, y1: number, v: number) => {
    const xa = Math.max(0, x0);
    const ya = Math.max(0, y0);
    const xb = Math.min(w, x1);
    const yb = Math.min(h, y1);
    for (let y = ya; y < yb; y++) for (let x = xa; x < xb; x++) height[y * w + x] = v;
  };

  // soot band under the balcony of the floor above
  g.fillStyle = "rgba(40,30,22,0.28)";
  g.fillRect(0, 0, w, 36);
  setH(0, 0, w, 28, 0.3);

  const winX = 108 + (seed % 3) * 8;
  const winW = 250;
  const winY = 78;
  const winH = 210;
  g.fillStyle = "#f3eee6";
  g.fillRect(winX - 10, winY - 10, winW + 20, winH + 20);
  setH(winX - 10, winY - 10, winX + winW + 10, winY + winH + 10, 0.72);
  const lit = seed % 2 === 0;
  const glass = g.createLinearGradient(0, winY, 0, winY + winH);
  glass.addColorStop(0, lit ? "#c9dbe3" : "#6f8794");
  glass.addColorStop(0.45, lit ? "#8eafbc" : "#4c626c");
  glass.addColorStop(1, lit ? "#d5e4ea" : "#7d96a1");
  g.fillStyle = glass;
  g.fillRect(winX, winY, winW, winH);
  setH(winX, winY, winX + winW, winY + winH, 0.18);
  g.strokeStyle = "rgba(255,255,255,0.35)";
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(winX + winW / 2, winY);
  g.lineTo(winX + winW / 2, winY + winH);
  g.moveTo(winX, winY + winH * 0.42);
  g.lineTo(winX + winW, winY + winH * 0.42);
  g.stroke();
  // curtain
  g.fillStyle = "rgba(70,48,36,0.28)";
  g.fillRect(winX + 8, winY + winH * 0.45, winW * 0.42, winH * 0.55);
  eg.fillStyle = lit ? "#ffd19a" : "#3a2a18";
  eg.fillRect(winX + 6, winY + 6, winW - 12, winH - 12);
  rg.fillStyle = "#2a2a2a";
  rg.fillRect(winX, winY, winW, winH);

  // AC
  if (seed % 3 !== 2) {
    const ax = seed % 2 === 0 ? 36 : 400;
    g.fillStyle = "#eceae4";
    g.fillRect(ax, 150, 78, 58);
    g.fillStyle = "#b7c0c6";
    g.fillRect(ax + 6, 168, 66, 10);
    g.fillStyle = "#9aa3a8";
    g.fillRect(ax + 6, 184, 66, 8);
    setH(ax, 150, ax + 78, 208, 0.8);
  }

  // balcony slab
  g.fillStyle = "#b7aa9a";
  g.fillRect(0, 318, w, 28);
  g.fillStyle = "rgba(255,255,255,0.25)";
  g.fillRect(0, 318, w, 4);
  g.fillStyle = "rgba(0,0,0,0.25)";
  g.fillRect(0, 342, w, 8);
  setH(0, 318, w, 346, 0.92);

  // railing
  g.fillStyle = "#5c656c";
  g.fillRect(8, 300, w - 16, 6);
  for (let x = 16; x < w - 8; x += 14) {
    g.fillRect(x, 268, 4, 50);
    setH(x, 268, x + 4, 318, 0.84);
  }
  rg.fillStyle = "#6a6a6a";
  rg.fillRect(0, 268, w, 80);

  // laundry on some bays
  if (seed % 2 === 1) {
    g.fillStyle = "#c45c3e";
    g.fillRect(70, 286, 28, 46);
    g.fillStyle = "#1d4e89";
    g.fillRect(110, 292, 22, 40);
    g.fillStyle = "#f4f1ea";
    g.fillRect(148, 284, 18, 48);
  }

  // dirt at the slab nose
  g.fillStyle = "rgba(60,45,30,0.18)";
  g.fillRect(0, 430, w, 82);

  const normal = normalsFrom(height, w, h, 3.2);
  const map = colorTex(face);
  const roughnessMap = linearTex(rough);
  const emissiveMap = colorTex(emit);
  return { map, normal, roughnessMap, emissiveMap };
}

const FACADE_UV = /* glsl */ `
#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	vUv = vec3( uv, 1 ).xy;
#endif
#ifdef USE_INSTANCING
	vec3 facadeScale = vec3(
		length( instanceMatrix[0].xyz ),
		length( instanceMatrix[1].xyz ),
		length( instanceMatrix[2].xyz )
	);
	vec3 facadeN = abs( normalize( normal ) );
	float facadeU = facadeN.z > 0.5
		? ( position.x + 0.5 ) * facadeScale.x
		: ( position.z + 0.5 ) * facadeScale.z;
	float facadeV = ( position.y + 0.5 ) * facadeScale.y;
	vFacadeY = ( instanceMatrix * vec4( position, 1.0 ) ).y;
	vec2 facadeUv = vec2( facadeU / ${BAY_W.toFixed(2)}, facadeV / ${BAY_H.toFixed(2)} );
#else
	vFacadeY = position.y;
	vec2 facadeUv = uv;
#endif
#ifdef USE_MAP
	vMapUv = facadeUv;
#endif
#ifdef USE_NORMALMAP
	vNormalMapUv = facadeUv;
#endif
#ifdef USE_EMISSIVEMAP
	vEmissiveMapUv = facadeUv;
#endif
#ifdef USE_ROUGHNESSMAP
	vRoughnessMapUv = facadeUv;
#endif
`;

function hookFacade(mat: THREE.MeshStandardMaterial) {
  mat.customProgramCacheKey = () => "facade-bay-v1";
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying float vFacadeY;")
      .replace("#include <uv_vertex>", FACADE_UV);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vFacadeY;")
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
         diffuseColor.rgb *= mix(0.62, 1.0, smoothstep(0.15, 3.2, vFacadeY));
         diffuseColor.rgb *= mix(0.9, 1.0, smoothstep(0.0, 0.35, vFacadeY));`,
      );
  };
}

export function facadeMaterial(seed: number) {
  const maps = paintBay(seed);
  const mat = new THREE.MeshStandardMaterial({
    color: "#ffffff",
    map: maps?.map,
    normalMap: maps?.normal ?? undefined,
    roughnessMap: maps?.roughnessMap,
    emissiveMap: maps?.emissiveMap,
    emissive: "#ffc48a",
    emissiveIntensity: 0,
    roughness: 0.92,
    metalness: 0.02,
  });
  mat.normalScale.set(0.9, 0.9);
  hookFacade(mat);
  return mat;
}

function paintGround(kind: "asphalt" | "walk" | "dirt") {
  const w = 512;
  const h = 512;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  if (!g) return null;
  const base = kind === "asphalt" ? [186, 168, 126] : kind === "walk" ? [206, 196, 176] : [168, 142, 108];
  g.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`;
  g.fillRect(0, 0, w, h);
  const img = g.getImageData(0, 0, w, h);
  const height = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const n = fbm((x / 70) + (kind === "dirt" ? 3 : 0), y / 70);
      const n2 = fbm(x / 18 + 2, y / 18);
      const crack = Math.abs(fbm(x / 40, y / 12) - fbm(y / 40, x / 12));
      let shade = (n - 0.5) * 50 + (n2 - 0.5) * 22;
      let hv = 0.5 + (n2 - 0.5) * 0.25;
      if (kind === "asphalt" && crack < 0.045) {
        shade -= 28;
        hv -= 0.35;
      }
      if (kind === "walk" && (x % 86 < 2 || y % 86 < 2)) {
        shade -= 30;
        hv -= 0.2;
      }
      const i = (y * w + x) * 4;
      img.data[i] = Math.max(0, Math.min(255, base[0] + shade));
      img.data[i + 1] = Math.max(0, Math.min(255, base[1] + shade * 0.96));
      img.data[i + 2] = Math.max(0, Math.min(255, base[2] + shade * 0.88));
      height[y * w + x] = hv;
    }
  }
  g.putImageData(img, 0, 0);
  if (kind === "asphalt") {
    g.fillStyle = "rgba(40,36,32,0.45)";
    for (let i = 0; i < 14; i++) {
      g.beginPath();
      g.ellipse(40 + ((i * 97) % 430), 30 + ((i * 53) % 450), 28 + (i % 5) * 10, 12 + (i % 3) * 6, i, 0, Math.PI * 2);
      g.fill();
    }
  }
  const map = colorTex(c);
  const normal = normalsFrom(height, w, h, kind === "asphalt" ? 2.4 : 1.6);
  return { map, normal };
}

export function roadMaterial() {
  const maps = paintGround("asphalt");
  if (maps?.map) maps.map.repeat.set(4, 2);
  if (maps?.normal) maps.normal.repeat.set(4, 2);
  const mat = new THREE.MeshStandardMaterial({
    color: "#ffffff",
    map: maps?.map,
    normalMap: maps?.normal ?? undefined,
    roughness: 0.96,
    metalness: 0.04,
  });
  mat.normalScale.set(0.55, 0.55);
  return mat;
}

export function walkMaterial() {
  const maps = paintGround("walk");
  if (maps?.map) maps.map.repeat.set(2, 5);
  if (maps?.normal) maps.normal.repeat.set(2, 5);
  const mat = new THREE.MeshStandardMaterial({
    color: "#ffffff",
    map: maps?.map,
    normalMap: maps?.normal ?? undefined,
    roughness: 0.94,
    metalness: 0.02,
  });
  mat.normalScale.set(0.4, 0.4);
  return mat;
}

export function dirtMaterial() {
  const maps = paintGround("dirt");
  if (maps?.map) maps.map.repeat.set(48, 48);
  if (maps?.normal) maps.normal.repeat.set(48, 48);
  const mat = new THREE.MeshStandardMaterial({
    color: "#ffffff",
    map: maps?.map,
    normalMap: maps?.normal ?? undefined,
    roughness: 1,
    metalness: 0,
  });
  mat.normalScale.set(0.7, 0.7);
  return mat;
}

export function skyDome() {
  const geo = new THREE.SphereGeometry(780, 28, 16);
  const uniforms = {
    topColor: { value: new THREE.Color("#8eacbf") },
    horizonColor: { value: new THREE.Color("#e6d3b4") },
    sunDir: { value: new THREE.Vector3(-0.55, 0.42, 0.25).normalize() },
  };
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms,
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vDir;
      uniform vec3 topColor;
      uniform vec3 horizonColor;
      uniform vec3 sunDir;
      void main() {
        float h = clamp(vDir.y * 0.9 + 0.08, 0.0, 1.0);
        vec3 col = mix(horizonColor, topColor, smoothstep(0.0, 0.62, h));
        float sun = pow(max(dot(normalize(vDir), sunDir), 0.0), 64.0);
        col += vec3(1.0, 0.78, 0.45) * sun * 0.85;
        col = mix(col, horizonColor, pow(1.0 - h, 1.6) * 0.45);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return { mesh, uniforms };
}
