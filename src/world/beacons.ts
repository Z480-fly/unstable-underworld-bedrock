/**
 * Ground-level colour beacons.
 *
 * One real working beacon at the centre of every landmark, sitting on the
 * ground surface. The beam must be visible from the air, so a clear column
 * is cut upward through anything above it (including the glass canopy).
 *
 * Beam colour comes from stained glass placed around the beacon.
 * The pyramid itself is solid netherite so the game actually activates it
 * (power is recomputed from the blocks below on every chunk load; a 3x3 is
 * not enough — level 1 needs a complete 5x5).
 */
import { P, AIR, type BlockState } from "./blocks.ts";
import { CONFIG } from "./config.ts";
import { LANDMARKS, type LandmarkId } from "./layout.ts";
import type { World } from "./world.ts";

/** How many courses of clear air to force above the beacon for the beam. */
const BEAM_CLEARANCE = 40;

/**
 * Half-widths used by the Purgatory office beacon (tall internal mast).
 * Index 0 = beacon course neighbours, then downward.
 * Kept exported so purgatory.ts and tests stay in sync.
 */
export const BEACON_TIERS = [1, 1, 2, 3, 2] as const;

export const BEACON_CROWN_Y = 121;
export const BEACON_COLLAR = 5;

export interface BeaconColours {
  /** Stained glass that sets the beam colour. */
  glass: BlockState;
  /** Plain-language name for logs and docs. */
  label: string;
}

/**
 * One colour per landmark. Hand-assigned so neighbouring landmarks stay
 * distinguishable from the air.
 */
export const BEACON_COLOURS: Record<LandmarkId, BeaconColours> = {
  breach: { glass: P.redGlass, label: "red" },
  ruinedCastle: { glass: P.orangeGlass, label: "orange" },
  fields: { glass: P.yellowGlass, label: "yellow" },
  ashenReaches: { glass: P.redGlass, label: "ember red" },
  center: { glass: P.yellowGlass, label: "gold" },
  graveyard: { glass: P.grayGlass, label: "grey" },
  ruins: { glass: P.lightGrayGlass, label: "pale grey" },
  mazeValley: { glass: P.purpleGlass, label: "purple" },
  village: { glass: P.brownGlass, label: "brown" },
  frostPocket: { glass: P.lightBlueGlass, label: "ice blue" },
  tomb: { glass: P.blackGlass, label: "black" },
  dungeonChain: { glass: P.magentaGlass, label: "magenta" },
  citadel: { glass: P.limeGlass, label: "lime" },
  portalLobby: { glass: P.purpleGlass, label: "purple" },
  veilCastle: { glass: P.whiteGlass, label: "white" },
  glassworks: { glass: P.greenGlass, label: "green" },
  portalField: { glass: P.blueGlass, label: "blue" },
  splice: { glass: P.cyanGlass, label: "cyan" },
  cathedral: { glass: P.blueGlass, label: "blue" },
  glassGrove: { glass: P.limeGlass, label: "lime" },
  ancientCity: { glass: P.cyanGlass, label: "cyan" },
  wardenArena: { glass: P.blackGlass, label: "black" },
  endRuin: { glass: P.magentaGlass, label: "magenta" },
};

export interface BeaconPlacement {
  id: LandmarkId;
  x: number;
  z: number;
  /** Surface Y where the 5x5 netherite base sits. */
  baseY: number;
  /** Y of the beacon block itself. */
  beaconY: number;
  /** Alias used by older tests that still say crownY. */
  crownY: number;
  colours: BeaconColours;
}

const BUILT = new WeakMap<World, Map<LandmarkId, BeaconPlacement>>();

/** Where a landmark's ground-level beacon sits. */
export function beaconMast(world: World, id: LandmarkId): BeaconPlacement {
  const built = BUILT.get(world)?.get(id);
  if (built) return built;
  return measureBeacon(world, id);
}

function measureBeacon(world: World, id: LandmarkId): BeaconPlacement {
  const { x, z } = LANDMARKS[id].center;
  const surface = world.surfaceAt(x, z);
  const baseY = Math.max(surface, 8);
  const beaconY = baseY + 1;
  return {
    id,
    x,
    z,
    baseY,
    beaconY,
    crownY: beaconY,
    colours: BEACON_COLOURS[id],
  };
}

/**
 * Builds every ground-level beacon.
 *
 * Called after the canopy so the clear-air column can punch through glass.
 */
export function buildBeacons(world: World): BeaconPlacement[] {
  const built: BeaconPlacement[] = [];
  const record = new Map<LandmarkId, BeaconPlacement>();
  BUILT.set(world, record);

  for (const id of Object.keys(LANDMARKS) as LandmarkId[]) {
    const placement = measureBeacon(world, id);
    if (placement.beaconY + 2 >= CONFIG.maxY) continue;
    buildOneBeacon(world, placement);
    record.set(id, placement);
    built.push(placement);
  }
  return built;
}

/**
 * One ground-level beacon:
 *
 *   baseY     solid 5x5 netherite (powers level 1)
 *   beaconY   the beacon, coloured glass on edges, sea lanterns on corners
 *   above     clear air column so the beam is never blocked
 */
function buildOneBeacon(world: World, p: BeaconPlacement): void {
  const { x, z, baseY, beaconY, colours } = p;

  for (let dx = -2; dx <= 2; dx++) {
    for (let dz = -2; dz <= 2; dz++) {
      world.set(x + dx, baseY, z + dz, P.netheriteBlock);
    }
  }

  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      const middle = dx === 0 && dz === 0;
      const corner = Math.abs(dx) + Math.abs(dz) === 2;
      world.set(
        x + dx,
        beaconY,
        z + dz,
        middle ? P.litBeacon : corner ? P.seaLantern : colours.glass,
      );
    }
  }

  const top = Math.min(beaconY + BEAM_CLEARANCE, CONFIG.maxY - 1);
  for (let y = beaconY + 1; y <= top; y++) {
    world.set(x, y, z, AIR);
  }

  world.protect(x, z, 3);
}

/** Compatibility stub for older banding helpers. */
export function beaconCourse(_colours: BeaconColours, _course: number): BlockState {
  return P.netheriteBlock;
}
