import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";

const SPEC = "KHR_materials_pbrSpecularGlossiness";

type MatDef = {
  extensions?: Record<string, Record<string, unknown>>;
};

type ParserLike = {
  json: { materials?: MatDef[] };
  assignTexture: (
    params: Record<string, unknown>,
    name: string,
    def: unknown,
    colorSpace?: string,
  ) => Promise<unknown>;
};

/** Three r167+ dropped spec/gloss. The Lancer file is spec/gloss only, so without this it loads as black metal. */
class SpecularGlossinessExt {
  parser: ParserLike;
  name = SPEC;
  constructor(parser: ParserLike) {
    this.parser = parser;
  }
  getMaterialType(materialIndex: number) {
    const ext = this.parser.json.materials?.[materialIndex]?.extensions?.[SPEC];
    return ext ? THREE.MeshStandardMaterial : null;
  }
  extendMaterialParams(materialIndex: number, materialParams: Record<string, unknown>) {
    const ext = this.parser.json.materials?.[materialIndex]?.extensions?.[SPEC];
    if (!ext) return Promise.resolve();
    const pending: Promise<unknown>[] = [];
    const factor = ext.diffuseFactor as number[] | undefined;
    if (factor) {
      const color = (materialParams.color as THREE.Color) ?? new THREE.Color();
      color.setRGB(factor[0], factor[1], factor[2], THREE.LinearSRGBColorSpace);
      materialParams.color = color;
      if (factor.length > 3) materialParams.opacity = factor[3];
    }
    const gloss = typeof ext.glossinessFactor === "number" ? ext.glossinessFactor : 0;
    materialParams.roughness = 1 - THREE.MathUtils.clamp(gloss, 0, 1);
    const spec = ext.specularFactor as number[] | undefined;
    const specAvg = spec ? (spec[0] + spec[1] + spec[2]) / 3 : 0.04;
    materialParams.metalness = specAvg > 0.55 ? 0.72 : specAvg > 0.2 ? 0.22 : 0.04;
    if (ext.diffuseTexture) {
      pending.push(this.parser.assignTexture(materialParams, "map", ext.diffuseTexture, THREE.SRGBColorSpace));
    }
    return Promise.all(pending);
  }
}

let loader: GLTFLoader | null = null;

export function streetLoader() {
  if (!loader) {
    loader = new GLTFLoader();
    loader.register((parser) => new SpecularGlossinessExt(parser as unknown as ParserLike));
  }
  return loader;
}

/** Object3D.clone() leaves SkinnedMesh bones on the original, so the van stays glued at the origin. */
export function cloneModel<T extends THREE.Object3D>(source: T): T {
  const copy = cloneSkinned(source) as T;
  copy.traverse((obj) => {
    obj.matrixAutoUpdate = true;
    obj.matrixWorldAutoUpdate = true;
  });
  return copy;
}
