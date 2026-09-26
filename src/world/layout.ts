/**
 * The map plan: where every landmark of the Underworld sits, and how the paths
 * connect them.
 *
 * The layout is reconstructed from the public references (see README):
 *
 *  - Wemmbu + Boosfer fall in through a void trap under the Nether and land in
 *    a wasteland; they find a tower with brewing stands, then a giant castle
 *    with cages in front and a laggy gold block in its middle ("The Center").
 *  - Parrot wanders out to a tower ringed by a wheat field, crosses a ravine and
 *    a valley between two mountains that opens into a labyrinth, reaches an
 *    abandoned village with a castle, then a gate into a cave with a statue
 *    lined pit (the tomb of the Mage of the Deep), a powder-snow pocket, a
 *    nether-like lava reach with a huge lava lake and a strider island, and
 *    finally a destroyed castle that hides the way out.
 *  - Spoke walks *west* past the broken structures into the void castles (escape
 *    rooms linked by glass bridges, darkening toward the End) and ends at the
 *    Citadel - the great library at the far west.
 *
 * Axes: +X = east, +Z = south. The realm is 384x384 blocks centred on 0,0.
 */

export interface Point {
  x: number;
  z: number;
}

export interface Rect {
  x1: number;
  z1: number;
  x2: number;
  z2: number;
}

export interface CircleRegion {
  kind: "circle";
  x: number;
  z: number;
  radius: number;
}

export interface RectRegion {
  kind: "rect";
  x1: number;
  z1: number;
  x2: number;
  z2: number;
}

export interface Landmark {
  id: string;
  name: string;
  /** Approximate centre, used for signs of life, roads and documentation. */
  center: Point;
  /** Bounding area the structure claims (kept clear of terrain noise). */
  footprint: RectRegion;
  /** Canon reference this landmark reconstructs. */
  source: string;
}

export const LANDMARKS = {
  breach: {
    id: "breach",
    name: "The Breach (spawn)",
    center: { x: 0, z: 152 },
    footprint: { kind: "rect", x1: -34, z1: 118, x2: 34, z2: 182 },
    source: "Wemmbu & Boosfer fall through the Nether void trap and land here.",
  },
  ruinedCastle: {
    id: "ruinedCastle",
    name: "The Ruined Castle (exit)",
    center: { x: 68, z: 146 },
    footprint: { kind: "rect", x1: 40, z1: 120, x2: 96, z2: 172 },
    source: "Parrot's destroyed castle: two pressure plates reveal the Nether portal out.",
  },
  fields: {
    id: "fields",
    name: "The Fields & the Brewing Tower",
    center: { x: 112, z: 20 },
    footprint: { kind: "rect", x1: 62, z1: -30, x2: 162, z2: 74 },
    source: "Wemmbu's brewing tower; Parrot's tower ringed by a wheat field behind a wall.",
  },
  ashenReaches: {
    id: "ashenReaches",
    name: "The Ashen Reaches (lava lake & strider island)",
    center: { x: 120, z: 132 },
    footprint: { kind: "rect", x1: 66, z1: 82, x2: 176, z2: 186 },
    source: "Parrot crosses a lava lake on a stolen boat; three striders on an island.",
  },
  center: {
    id: "center",
    name: "The Center - Withered Castle & Gold Block",
    center: { x: 0, z: 40 },
    footprint: { kind: "rect", x1: -54, z1: -14, x2: 54, z2: 94 },
    source: "The giant castle with cages in front; the gold block in its middle is 'The Center'.",
  },
  graveyard: {
    id: "graveyard",
    name: "The Graveyard",
    center: { x: -58, z: -78 },
    footprint: { kind: "rect", x1: -96, z1: -116, x2: -20, z2: -40 },
    source: "'Home to several locations including a castle, a graveyard, and partially destroyed bridges.'",
  },
  ruins: {
    id: "ruins",
    name: "The Ruins & Broken Viaduct",
    center: { x: 40, z: -60 },
    footprint: { kind: "rect", x1: 6, z1: -92, x2: 74, z2: -28 },
    source: "The broken structures Spoke passes on the endless plain.",
  },
  mazeValley: {
    id: "mazeValley",
    name: "Maze Valley & the Crossroads",
    center: { x: 120, z: -128 },
    footprint: { kind: "rect", x1: 84, z1: -172, x2: 158, z2: -84 },
    source: "Parrot's valley between two large mountains, opening into a labyrinth of dead ends.",
  },
  village: {
    id: "village",
    name: "The Abandoned Village",
    center: { x: 118, z: -178 },
    footprint: { kind: "rect", x1: 84, z1: -192, x2: 154, z2: -150 },
    source: "Abandoned village with multiple houses and a castle; the crew shelters here.",
  },
  frostPocket: {
    id: "frostPocket",
    name: "The Frost Pocket",
    center: { x: -64, z: 168 },
    footprint: { kind: "rect", x1: -100, z1: 136, x2: -28, z2: 200 },
    source: "The powder-snow pocket Parrot's crew sinks into after the secret entrance.",
  },
  tomb: {
    id: "tomb",
    name: "The Pit & Tomb of the Mage of the Deep",
    center: { x: -158, z: -70 },
    footprint: { kind: "rect", x1: -194, z1: -104, x2: -122, z2: -36 },
    source: "Cave gate, statue-lined dark pit, sculk sensor room and the warden tomb.",
  },
  dungeonChain: {
    id: "dungeonChain",
    name: "The Void Castles & Glass Bridges",
    center: { x: -92, z: 40 },
    footprint: { kind: "rect", x1: -122, z1: 4, x2: -62, z2: 76 },
    source: "Escape-room castles linked by glass bridges, the sky darkening toward the End.",
  },
  citadel: {
    id: "citadel",
    name: "The Citadel",
    center: { x: -158, z: 40 },
    footprint: { kind: "rect", x1: -189, z1: 9, x2: -127, z2: 71 },
    source: "The massive library holding the knowledge of everything that happened on Unstable.",
  },
  portalLobby: {
    id: "portalLobby",
    name: "The Nether Portal Lobby",
    center: { x: -158, z: 140 },
    footprint: { kind: "rect", x1: -182, z1: 118, x2: -134, z2: 162 },
    source: "Twenty portals connecting the Underworld to the Far Lands in every direction.",
  },
} as const satisfies Record<string, Landmark>;

export type LandmarkId = keyof typeof LANDMARKS;

/**
 * Floating void-castle islands inside the western gulf, west to east. Each is a
 * separate island with its own escape room, linked only by glass bridges - the
 * sequence Spoke works through on the way to the Citadel, with the light and
 * palette darkening as he goes.
 */
export const VOID_CASTLE_ISLANDS: Array<{ x: number; z: number; radius: number; escapeRoom: string }> = [
  // Repositioned to sit cleanly inside the narrowed void gulf (-108..-72).
  { x: -78, z: 40, radius: 7, escapeRoom: "redstone lamps & dripstone" },
  { x: -90, z: 36, radius: 7, escapeRoom: "flooded maze" },
  { x: -102, z: 42, radius: 7, escapeRoom: "copper bulbs & slime" },
];

/** Terrain modifiers: each region reshapes the wasteland before it is painted. */
export interface TerrainRegion {
  id: string;
  shape: CircleRegion | RectRegion;
  /** Added to the base surface height. */
  heightDelta?: number;
  /** Extra relief amplitude multiplier. */
  relief?: number;
  /** Adds a ridge/spine (mountains). */
  ridged?: boolean;
}

export const TERRAIN_REGIONS: TerrainRegion[] = [
  // The void gulf west of the Center: nothing but void islands live here.
  // Kept in sync with CONFIG.terrain.voidGulf so the plate stays continuous.
  { id: "gulf", shape: { kind: "rect", x1: -110, z1: -192, x2: -70, z2: 191 } },
  // Two great mountains flanking the maze valley (canon: "two large mountains").
  // Height deltas reduced so pads and roads still sit cleanly.
  { id: "mountainNorth", shape: { kind: "circle", x: 104, z: -106, radius: 34 }, heightDelta: 18, relief: 1.3, ridged: true },
  { id: "mountainEast", shape: { kind: "circle", x: 152, z: -140, radius: 28 }, heightDelta: 14, relief: 1.25, ridged: true },
  // Lava mountains around the ashen reaches.
  { id: "lavaMountains", shape: { kind: "rect", x1: 64, z1: 80, x2: 178, z2: 188 }, heightDelta: 6, relief: 1.15, ridged: true },
  // The Citadel reach: a raised, flattened plateau that the library stands on.
  { id: "citadelPlateau", shape: { kind: "rect", x1: -192, z1: 0, x2: -112, z2: 82 }, heightDelta: 10, relief: 0.35 },
  // The Pit is sunk into the west reach.
  { id: "tombHollow", shape: { kind: "circle", x: -158, z: -70, radius: 40 }, heightDelta: -6, relief: 0.5 },
  // Frost pocket: a shallow bowl on the south-west of the main plate.
  { id: "frostBowl", shape: { kind: "circle", x: -64, z: 168, radius: 42 }, heightDelta: -4, relief: 0.4 },
  // Graveyard plateau sits a little above the plain.
  { id: "graveyardMound", shape: { kind: "circle", x: -58, z: -78, radius: 46 }, heightDelta: 7, relief: 0.6 },
  // The Center is deliberately flat: a plain for the castle.
  { id: "centerPlain", shape: { kind: "rect", x1: -66, z1: -22, x2: 66, z2: 102 }, relief: 0.25 },
  // Hamlet ground for the abandoned village.
  { id: "villageFlat", shape: { kind: "rect", x1: 82, z1: -192, x2: 156, z2: -148 }, relief: 0.3 },
  // Extra wasteland relief east of Breach.
  { id: "eastWastes", shape: { kind: "circle", x: 80, z: 100, radius: 36 }, heightDelta: 4, relief: 1.2 },
  // Slight rise west of Ruins for more silhouette against the void gulf.
  { id: "ruinsRidge", shape: { kind: "circle", x: 20, z: -40, radius: 28 }, heightDelta: 5, relief: 1.15, ridged: true },
];

export interface RoadPath {
  id: string;
  from: Point;
  to: Point;
  via?: Point[];
  /** Half-width in blocks. */
  width: number;
  /** 'main' = fully paved, 'path' = worn trail, 'bridge' = crosses void/lava. */
  style: "main" | "path" | "broken";
}

/**
 * Road network. "The Long Walk West" is the map's spine: Fields -> Center ->
 * across the gulf of void castles (glass bridges) -> Citadel.
 */
export const ROADS: RoadPath[] = [
  {
    id: "breachRoad",
    from: LANDMARKS.breach.center,
    to: { x: 0, z: 94 },
    via: [{ x: 0, z: 128 }],
    width: 2,
    style: "main",
  },
  {
    id: "centerNorthRoad",
    from: { x: 0, z: -14 },
    to: LANDMARKS.graveyard.center,
    via: [{ x: -12, z: -46 }],
    width: 2,
    style: "main",
  },
  {
    id: "longWalkWest",
    from: { x: 158, z: 40 },
    to: { x: -128, z: 40 },
    via: [],
    width: 2,
    style: "main",
  },
  {
    id: "fieldsSpur",
    from: { x: 112, z: 40 },
    to: LANDMARKS.fields.center,
    via: [],
    width: 1,
    style: "path",
  },
  {
    id: "ashenSpur",
    from: { x: 150, z: 74 },
    to: { x: 120, z: 116 },
    via: [],
    width: 2,
    style: "main",
  },
  {
    id: "ruinsSpur",
    from: { x: 0, z: -14 },
    to: LANDMARKS.ruins.center,
    via: [{ x: 20, z: -40 }],
    width: 1,
    style: "path",
  },
  {
    id: "mazeApproach",
    from: LANDMARKS.ruins.center,
    to: { x: 112, z: -96 },
    via: [{ x: 70, z: -80 }, { x: 96, z: -88 }],
    width: 1,
    style: "path",
  },
  {
    id: "villageRoad",
    from: { x: 120, z: -84 },
    to: LANDMARKS.village.center,
    via: [{ x: 122, z: -140 }],
    width: 1,
    style: "path",
  },
  {
    id: "exitRoad",
    from: LANDMARKS.breach.center,
    to: LANDMARKS.ruinedCastle.center,
    via: [{ x: 34, z: 158 }],
    width: 1,
    style: "broken",
  },
  {
    id: "fieldsNorthRoad",
    from: { x: 112, z: 40 },
    to: { x: 112, z: -60 },
    via: [],
    width: 1,
    style: "path",
  },
  {
    id: "tombRoad",
    from: { x: -158, z: 6 },
    to: { x: -158, z: -36 },
    via: [],
    width: 1,
    style: "path",
  },
  {
    id: "lobbyRoad",
    from: { x: -158, z: 74 },
    to: { x: -158, z: 116 },
    via: [],
    width: 1,
    style: "path",
  },
  {
    id: "frostBreachRoad",
    from: { x: -28, z: 170 },
    to: { x: -8, z: 160 },
    via: [],
    width: 1,
    style: "path",
  },
  {
    id: "southRimRoad",
    from: { x: -28, z: 176 },
    to: { x: 100, z: 152 },
    via: [{ x: 30, z: 180 }],
    width: 1,
    style: "path",
  },
];

/** Where the player starts: at the Breach, on the road north. */
export const SPAWN = { x: 0.5, y: 62, z: 148.5 };

export function rectCenter(rect: RectRegion): Point {
  return { x: Math.round((rect.x1 + rect.x2) / 2), z: Math.round((rect.z1 + rect.z2) / 2) };
}

export function inRect(rect: RectRegion, x: number, z: number): boolean {
  return x >= rect.x1 && x <= rect.x2 && z >= rect.z1 && z <= rect.z2;
}

export function inCircle(circle: CircleRegion, x: number, z: number): boolean {
  const dx = x - circle.x;
  const dz = z - circle.z;
  return dx * dx + dz * dz <= circle.radius * circle.radius;
}
