import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { cloneModel } from "./gltf";

export type ModelForward = "negative-z" | "positive-z";

export type VehicleOrientation = {
  sourceForward: ModelForward;
  yawOffset: number;
  longAxis: "x" | "z" | "auto";
};

type FitOptions = {
  length?: number;
  height?: number;
  /** Direction of the model's hood after the long axis is aligned to local Z. */
  forward?: ModelForward;
  /** Fine yaw correction in radians, applied after the forward-axis correction. */
  yawOffset?: number;
  /** Explicitly select source model's long axis; auto preserves legacy bounds behavior. */
  longAxis?: "x" | "z";
  /** @deprecated Legacy equivalent of `forward: "positive-z"`. */
  nose?: boolean;
  compact?: boolean;
};

/**
 * Ground and scale a GLB subtree to street size. The game movement basis uses
 * local −Z as forward. Supply `forward` per asset when its hood faces +Z; do not
 * apply direction corrections to the shared source/model cache.
 */
export function fitProp(source: THREE.Object3D, opts: FitOptions): THREE.Group {
  source.updateWorldMatrix(true, true);
  const baked = cloneModel(source);
  baked.matrix.copy(source.matrixWorld);
  baked.matrix.decompose(baked.position, baked.quaternion, baked.scale);
  baked.matrixAutoUpdate = true;

  const inner = new THREE.Group();
  inner.add(baked);
  inner.updateMatrixWorld(true);

  let bounds = new THREE.Box3().setFromObject(inner);
  const size = new THREE.Vector3();
  bounds.getSize(size);
  const rotateLongAxis =
    opts.length != null &&
    (opts.longAxis === "x" || (opts.longAxis !== "z" && size.x > size.z * 1.15));
  if (rotateLongAxis) {
    baked.rotateY(Math.PI / 2);
    inner.updateMatrixWorld(true);
    bounds = new THREE.Box3().setFromObject(inner);
    bounds.getSize(size);
  }

  if (bounds.isEmpty() || !Number.isFinite(size.x + size.y + size.z)) return new THREE.Group();

  const center = bounds.getCenter(new THREE.Vector3());
  baked.position.x -= center.x;
  baked.position.z -= center.z;
  baked.position.y -= bounds.min.y;

  const basis = opts.height ? Math.max(size.y, 1e-4) : Math.max(size.x, size.z, 1e-4);
  const target = opts.height ?? opts.length ?? basis;
  inner.scale.setScalar(target / basis);

  // Corrections are on an instance wrapper, never the source GLTF/cache. For the
  // game convention, the corrected model nose must point along local −Z.
  const sourceForward = opts.forward ?? (opts.nose ? "positive-z" : "negative-z");
  const yawOffset = Number.isFinite(opts.yawOffset) ? (opts.yawOffset ?? 0) : 0;
  const facing = new THREE.Group();
  facing.rotation.y = (sourceForward === "positive-z" ? Math.PI : 0) + yawOffset;
  facing.add(inner);

  const root = new THREE.Group();
  root.add(facing);
  root.userData.vehicleOrientation = {
    sourceForward,
    yawOffset,
    longAxis: opts.longAxis ?? "auto",
    longAxisRotated: rotateLongAxis,
    correctedForward: new THREE.Vector3(0, 0, -1).applyEuler(facing.rotation).toArray(),
  } satisfies VehicleOrientation & { longAxisRotated: boolean; correctedForward: number[] };

  root.updateMatrixWorld(true);
  if (opts.compact !== false) compactStatic(root);
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.frustumCulled = !(mesh as THREE.SkinnedMesh).isSkinnedMesh;
  });
  return root;
}

function materialOf(mesh: THREE.Mesh) {
  return (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshStandardMaterial;
}

function prepGeo(geo: THREE.BufferGeometry, world: THREE.Matrix4, uv: boolean) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  g.applyMatrix4(world);
  if (!g.getAttribute("normal")) g.computeVertexNormals();
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", g.getAttribute("position"));
  out.setAttribute("normal", g.getAttribute("normal"));
  if (uv) {
    const existing = g.getAttribute("uv");
    if (existing) out.setAttribute("uv", existing);
    else out.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(g.getAttribute("position").count * 2), 2));
  }
  return out;
}

/** Collapse dozens of paint shells into one draw. Skinned parts (wheels on the HiAce) stay. */
function compactStatic(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const toLocal = new THREE.Matrix4();
  const solids: THREE.BufferGeometry[] = [];
  const buckets = new Map<string, { mat: THREE.Material; geos: THREE.BufferGeometry[] }>();
  const drop: THREE.Mesh[] = [];

  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || (mesh as THREE.SkinnedMesh).isSkinnedMesh || !mesh.geometry) return;
    const mat = materialOf(mesh);
    if (!mat) return;
    toLocal.copy(inv).multiply(mesh.matrixWorld);
    const textured = Boolean(mat.map);
    const clear = mat.transparent || mat.opacity < 0.98;
    if (!textured && !clear && mat.color) {
      const g = prepGeo(mesh.geometry, toLocal, false);
      const count = g.getAttribute("position").count;
      const colors = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        colors[i * 3] = mat.color.r;
        colors[i * 3 + 1] = mat.color.g;
        colors[i * 3 + 2] = mat.color.b;
      }
      g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      solids.push(g);
      drop.push(mesh);
      return;
    }
    const key = `${mat.uuid}|${textured ? 1 : 0}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { mat, geos: [] };
      buckets.set(key, bucket);
    }
    bucket.geos.push(prepGeo(mesh.geometry, toLocal, textured));
    drop.push(mesh);
  });

  const addMerged = (geos: THREE.BufferGeometry[], mat: THREE.Material) => {
    if (!geos.length) return;
    if (geos.length === 1) {
      root.attach(new THREE.Mesh(geos[0], mat));
      return;
    }
    const merged = mergeGeometries(geos, false);
    if (!merged) {
      for (const g of geos) root.attach(new THREE.Mesh(g, mat));
      return;
    }
    for (const g of geos) g.dispose();
    root.attach(new THREE.Mesh(merged, mat));
  };

  if (solids.length) {
    addMerged(
      solids,
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0.04 }),
    );
  }
  for (const bucket of buckets.values()) {
    if (bucket.geos.length < 2) {
      if (bucket.geos.length === 1) root.attach(new THREE.Mesh(bucket.geos[0], bucket.mat));
      continue;
    }
    addMerged(bucket.geos, bucket.mat);
  }
  for (const mesh of drop) mesh.parent?.remove(mesh);
}
