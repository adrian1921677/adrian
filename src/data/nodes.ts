/**
 * CONTRACT between the Blender scene (public/models/room.glb) and the app.
 * Every name below is an object name in Blender, which becomes the node name
 * in the glTF and is found with `scene.getObjectByName(name)`.
 *
 * Coordinate facts (three.js space, after the glTF Y-up conversion):
 *  - Floor is the plane y = 0, roughly x ∈ [-3, 3], z ∈ [-3, 3].
 *  - The two walls stand at x = -3 and z = -3; the room is open toward +x/+z,
 *    so the camera always sits somewhere around direction (1, 0.8, 1).
 *  - Character parts have identity rotation and unit scale relative to their
 *    parent, so you can set scale/rotation directly (base scale is 1,1,1).
 *  - The character's front is local +Z, up is +Y, its own left side is +X.
 *    `Char_Root.rotation.y` turns the whole character (yaw = atan2(dx, dz)).
 *  - Character is ~1.1 units tall.
 */

export const TOPIC_IDS = ['about', 'journey', 'work', 'skills', 'education', 'hobbies', 'contact'] as const;
export type TopicId = (typeof TOPIC_IDS)[number];

export const NODES = {
  /** Empty at floor level; move/rotate this to walk/turn. */
  charRoot: 'Char_Root',
  /** Body blob. Origin at its bottom, so scaling it squashes/stretches in place. Face parts are its children. */
  body: 'Char_Body',
  /** Empty above the head — project to screen to anchor the speech bubble. Child of Char_Body. */
  bubbleAnchor: 'Char_BubbleAnchor',
  /** Eyes; origin at eye centre. Blink = scale.y → ~0.1 and back. Each has a *_Shine child highlight. */
  eyeL: 'Char_EyeL',
  eyeR: 'Char_EyeR',
  /** Mouth; origin at its centre. Talk = scale.y between ~0.35 (closed) and ~1.6 (open). */
  mouth: 'Char_Mouth',
  /** Arms; origin at the shoulder joint, hanging down. Rotate around local Z to raise sideways, X to swing. */
  armL: 'Char_ArmL',
  armR: 'Char_ArmR',
  /** Feet; children of Char_Root (not the body). Translate y/z to step. */
  footL: 'Char_FootL',
  footR: 'Char_FootR',
  /** Antenna; origin at its base on the head. Rotate X/Z for a springy wiggle. */
  antenna: 'Char_Antenna',
  /** Glowing ball at the antenna tip (emissive material) — pulse while talking. */
  antennaTip: 'Char_AntennaTip',
  /** Small round ears; origin at the base. */
  earL: 'Char_EarL',
  earR: 'Char_EarR',

  /** Monitor screen plane with 0–1 UVs, upright. Use a CanvasTexture with flipY = false. */
  screen: 'Desk_Screen',
  /** Empties marking where to put realtime lights. */
  lampLight: 'Light_Lamp',
  windowLight: 'Light_Window',

  /** Where the character stands when not talking about a topic. */
  homeSpot: 'Spot_Home',
} as const;

/**
 * Each topic has a furniture cluster (`hotspot`, an empty whose children are
 * the meshes; origin at the cluster's floor/wall base) and a floor marker
 * (`spot`) where the character stands while talking about it. Straight-line
 * walks between Spot_Home and any spot are obstacle-free; spot→spot walks
 * should route via Spot_Home.
 */
export const TOPIC_NODES: Record<TopicId, { hotspot: string; spot: string }> = {
  about: { hotspot: 'Hotspot_About', spot: 'Spot_About' }, // bed + window + photo frame
  journey: { hotspot: 'Hotspot_Journey', spot: 'Spot_Journey' }, // stage spotlight, gamepad, box, switch + rack, traceroute poster
  work: { hotspot: 'Hotspot_Work', spot: 'Spot_Work' }, // desk + monitor + chair + lamp
  skills: { hotspot: 'Hotspot_Skills', spot: 'Spot_Skills' }, // pinboard + dresser with trophies
  education: { hotspot: 'Hotspot_Education', spot: 'Spot_Education' }, // bookshelf
  hobbies: { hotspot: 'Hotspot_Hobbies', spot: 'Spot_Hobbies' }, // beanbag + controller + handheld, football, volleyball, drone
  contact: { hotspot: 'Hotspot_Contact', spot: 'Spot_Contact' }, // side table + retro phone + paper planes
};

export const MODEL_URL = '/models/room.glb';
