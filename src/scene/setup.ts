import { Box3, Color, Matrix4, Vector3 } from 'three';
import type { Material, Mesh, Object3D } from 'three';
import { NODES, TOPIC_IDS, TOPIC_NODES } from '../data/nodes';
import type { TopicId } from '../data/nodes';
import { capturePart, hasEmissive, warnOnce } from './utils';
import type { EmissiveSlot, Part } from './utils';

/** Who owns a clickable mesh. */
export type Owner = TopicId | 'character';

export interface CharacterRig {
  root: Part;
  body: Part | null;
  bubbleAnchor: Object3D | null;
  eyeL: Part | null;
  eyeR: Part | null;
  mouth: Part | null;
  armL: Part | null;
  armR: Part | null;
  footL: Part | null;
  footR: Part | null;
  antenna: Part | null;
  earL: Part | null;
  earR: Part | null;
  /** Cloned antenna-tip materials (glow pulses while talking). */
  tipSlots: EmissiveSlot[];
  /** Hue of the tip glow (its own emissive hue, or a warm default). */
  tipGlow: Color;
  /** World → Char_Root parent space (the parent is static). */
  parentInverse: Matrix4;
}

export interface HotspotRig {
  topic: TopicId;
  base: Part;
  /** World-space bounds at load. */
  box: Box3;
  center: Vector3;
  slots: EmissiveSlot[];
}

export interface SceneRig {
  roomBox: Box3;
  character: CharacterRig | null;
  hotspots: HotspotRig[];
  hotspotByTopic: Partial<Record<TopicId, HotspotRig>>;
  /** World positions of Spot_* empties, by node name. */
  spots: Map<string, Vector3>;
  /** Camera framing box per topic: hotspot bounds ∪ character standing at its spot. */
  topicBoxes: Partial<Record<TopicId, Box3>>;
  lamp: Vector3 | null;
  window: Vector3 | null;
  screenMeshes: Mesh[];
  owners: Map<Object3D, Owner>;
}

/** Height/half-width used for the character when framing it at a spot. */
export const CHAR_FRAME_HEIGHT = 1.2;
const CHAR_FRAME_RADIUS = 0.35;

/** Meshes matching this only receive shadows (big flat room shells). */
const RECEIVE_ONLY = /floor|wall|rug|carpet|ground|ceiling|boden|teppich/i;
/** Anything outside this is not "the room" (guards the camera against stray giant meshes). */
const SANE_BOUNDS = new Box3(new Vector3(-8, -2, -8), new Vector3(8, 7, 8));
const FALLBACK_ROOM = new Box3(new Vector3(-3, 0, -3), new Vector3(3, 3, 3));
const DEFAULT_TIP_GLOW = new Color('#ffe39a');

const cache = new WeakMap<Object3D, SceneRig>();

/** Resolve a Blender object name; prefers the node itself over a same-named mesh. */
export function findNode(scene: Object3D, name: string): Object3D | null {
  let found: Object3D | null = null;
  scene.traverse((o) => {
    if (!found && o.userData.name === name) found = o;
  });
  return found ?? scene.getObjectByName(name) ?? null;
}

function isMesh(o: Object3D): o is Mesh {
  return (o as Mesh).isMesh === true;
}

function materialsOf(mesh: Mesh): Material[] {
  return Array.isArray(mesh.material) ? mesh.material : [mesh.material];
}

/** Clone every emissive-capable material under `root` so highlights never bleed through shared materials. */
function cloneEmissiveMaterials(root: Object3D, skip: Set<Object3D>, slots: EmissiveSlot[]): void {
  const clones = new Map<Material, Material>();
  const cloneOne = (m: Material): Material => {
    if (!hasEmissive(m)) return m;
    let c = clones.get(m);
    if (!c) {
      const clone = m.clone();
      if (hasEmissive(clone)) {
        const base = clone.emissive.clone().multiplyScalar(clone.emissiveIntensity);
        clone.emissive.copy(base);
        clone.emissiveIntensity = 1;
        slots.push({ material: clone, base });
      }
      c = clone;
      clones.set(m, c);
    }
    return c;
  };
  root.traverse((o) => {
    if (!isMesh(o) || skip.has(o)) return;
    o.material = Array.isArray(o.material) ? o.material.map(cloneOne) : cloneOne(o.material);
  });
}

function part(scene: Object3D, name: string): Part | null {
  const node = findNode(scene, name);
  if (!node) {
    warnOnce(`node:${name}`, `Node "${name}" not found in the GLB — skipping its animation.`);
    return null;
  }
  return capturePart(node);
}

function worldPos(scene: Object3D, name: string): Vector3 | null {
  const node = findNode(scene, name);
  if (!node) {
    warnOnce(`node:${name}`, `Node "${name}" not found in the GLB.`);
    return null;
  }
  return node.getWorldPosition(new Vector3());
}

function buildCharacter(scene: Object3D): CharacterRig | null {
  const rootNode = findNode(scene, NODES.charRoot);
  if (!rootNode) {
    warnOnce('node:Char_Root', `Node "${NODES.charRoot}" not found — the character is disabled.`);
    return null;
  }
  const tipSlots: EmissiveSlot[] = [];
  const tipNode = findNode(scene, NODES.antennaTip);
  if (tipNode) cloneEmissiveMaterials(tipNode, new Set(), tipSlots);
  else warnOnce('node:Char_AntennaTip', `Node "${NODES.antennaTip}" not found — no antenna glow.`);

  let tipGlow = DEFAULT_TIP_GLOW.clone();
  const tipBase = tipSlots[0]?.base;
  if (tipBase) {
    const peak = Math.max(tipBase.r, tipBase.g, tipBase.b);
    if (peak > 0.02) tipGlow = tipBase.clone().multiplyScalar(1 / peak);
  }

  const bubbleAnchor = findNode(scene, NODES.bubbleAnchor);
  if (!bubbleAnchor) {
    warnOnce('node:Char_BubbleAnchor', `Node "${NODES.bubbleAnchor}" not found — using an estimated bubble anchor.`);
  }

  const parentInverse = new Matrix4();
  if (rootNode.parent) parentInverse.copy(rootNode.parent.matrixWorld).invert();

  return {
    root: capturePart(rootNode),
    body: part(scene, NODES.body),
    bubbleAnchor,
    eyeL: part(scene, NODES.eyeL),
    eyeR: part(scene, NODES.eyeR),
    mouth: part(scene, NODES.mouth),
    armL: part(scene, NODES.armL),
    armR: part(scene, NODES.armR),
    footL: part(scene, NODES.footL),
    footR: part(scene, NODES.footR),
    antenna: part(scene, NODES.antenna),
    earL: part(scene, NODES.earL),
    earR: part(scene, NODES.earR),
    tipSlots,
    tipGlow,
    parentInverse,
  };
}

function isTransparent(mesh: Mesh): boolean {
  return materialsOf(mesh).some((m) => {
    const t = (m as Material & { transmission?: number }).transmission ?? 0;
    return (m.transparent && m.opacity < 0.9) || t > 0;
  });
}

/** One-time setup per loaded GLB scene (idempotent across remounts / HMR). */
export function getSceneRig(scene: Object3D): SceneRig {
  const cached = cache.get(scene);
  if (cached) return cached;

  scene.updateMatrixWorld(true);

  const character = buildCharacter(scene);
  const charRoot = character?.root.obj ?? null;

  // Monitor screen meshes (their material gets replaced by the canvas screen).
  const screenMeshes: Mesh[] = [];
  const screenNode = findNode(scene, NODES.screen);
  if (screenNode) screenNode.traverse((o) => isMesh(o) && screenMeshes.push(o));
  else warnOnce('node:Desk_Screen', `Node "${NODES.screen}" not found — no monitor screen.`);
  const screenSet = new Set<Object3D>(screenMeshes);

  // Hotspots.
  const hotspots: HotspotRig[] = [];
  const hotspotByTopic: Partial<Record<TopicId, HotspotRig>> = {};
  const hotspotNodes = new Map<Object3D, TopicId>();
  for (const topic of TOPIC_IDS) {
    const name = TOPIC_NODES[topic].hotspot;
    const node = findNode(scene, name);
    if (!node) {
      warnOnce(`node:${name}`, `Hotspot "${name}" not found — topic "${topic}" has no furniture.`);
      continue;
    }
    const slots: EmissiveSlot[] = [];
    cloneEmissiveMaterials(node, screenSet, slots);
    const box = new Box3().setFromObject(node);
    if (box.isEmpty()) box.setFromCenterAndSize(node.getWorldPosition(new Vector3()), new Vector3(0.5, 0.5, 0.5));
    const rig: HotspotRig = { topic, base: capturePart(node), box, center: box.getCenter(new Vector3()), slots };
    hotspots.push(rig);
    hotspotByTopic[topic] = rig;
    hotspotNodes.set(node, topic);
  }

  // Shadows, ownership and room bounds in one pass.
  const owners = new Map<Object3D, Owner>();
  const roomBox = new Box3();
  const meshBox = new Box3();
  scene.traverse((o) => {
    if (!isMesh(o)) return;
    let owner: Owner | null = null;
    for (let p: Object3D | null = o; p; p = p.parent) {
      if (p === charRoot) {
        owner = 'character';
        break;
      }
      const topic = hotspotNodes.get(p);
      if (topic) {
        owner = topic;
        break;
      }
    }
    if (owner) owners.set(o, owner);

    const flat = RECEIVE_ONLY.test(o.name) || RECEIVE_ONLY.test(o.parent?.name ?? '');
    o.receiveShadow = true;
    o.castShadow = owner === 'character' || (!flat && !isTransparent(o));

    if (owner !== 'character') {
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      if (o.geometry.boundingBox) roomBox.union(meshBox.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld));
    }
  });
  roomBox.intersect(SANE_BOUNDS);
  if (roomBox.isEmpty()) roomBox.copy(FALLBACK_ROOM);

  // Spots.
  const spots = new Map<string, Vector3>();
  const home = worldPos(scene, NODES.homeSpot);
  if (home) spots.set(NODES.homeSpot, home);
  const topicBoxes: Partial<Record<TopicId, Box3>> = {};
  for (const topic of TOPIC_IDS) {
    const spotName = TOPIC_NODES[topic].spot;
    const spot = worldPos(scene, spotName);
    if (spot) spots.set(spotName, spot);
    const hs = hotspotByTopic[topic];
    if (!hs) continue;
    const box = hs.box.clone();
    if (spot) {
      box.expandByPoint(meshBox.min.set(spot.x - CHAR_FRAME_RADIUS, spot.y, spot.z - CHAR_FRAME_RADIUS));
      box.expandByPoint(meshBox.max.set(spot.x + CHAR_FRAME_RADIUS, spot.y + CHAR_FRAME_HEIGHT, spot.z + CHAR_FRAME_RADIUS));
    }
    topicBoxes[topic] = box;
  }

  const rig: SceneRig = {
    roomBox,
    character,
    hotspots,
    hotspotByTopic,
    spots,
    topicBoxes,
    lamp: worldPos(scene, NODES.lampLight),
    window: worldPos(scene, NODES.windowLight),
    screenMeshes,
    owners,
  };
  cache.set(scene, rig);
  return rig;
}
