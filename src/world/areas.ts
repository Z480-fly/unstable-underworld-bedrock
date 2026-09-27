/**
 * Landmark builders — orchestration layer.
 */
import type { World } from "./world.ts";
import {
  buildBreach,
  buildCenter,
  buildFields,
  buildCitadel,
  buildVoidCastles,
  buildGraveyard,
  buildRuins,
  buildMazeValley,
} from "./areas_a.ts";
import {
  buildVillage,
  buildFrostPocket,
  buildTomb,
  buildAshenReaches,
  buildRuinedCastle,
  buildGlassworks,
  buildPortalField,
  buildPortalLobby,
} from "./areas_b.ts";
import { buildEndRuin } from "./end_ruin.ts";
import { buildGlassGrove } from "./glass_grove.ts";
import { buildCathedral } from "./glass_cathedral.ts";
import { buildSplice } from "./splice.ts";
import { buildAncientCity, buildWardenArena } from "./ancient_city.ts";
import { buildSkyCanopy } from "./sky_canopy.ts";
import { buildVeilCastle } from "./veil_castle.ts";
import { buildBeacons } from "./beacons.ts";

export function buildAllAreas(world: World): void {
  buildBreach(world);
  buildCenter(world);
  buildFields(world);
  buildCitadel(world);
  buildVoidCastles(world);
  buildGraveyard(world);
  buildRuins(world);
  buildMazeValley(world);
  buildVillage(world);
  buildFrostPocket(world);
  buildTomb(world);
  buildAshenReaches(world);
  buildRuinedCastle(world);
  buildPortalLobby(world);
  buildGlassworks(world);
  buildPortalField(world);
  buildEndRuin(world);
  buildGlassGrove(world);
  buildCathedral(world);
  buildSplice(world);
  buildWardenArena(world);
  buildAncientCity(world);
  buildVeilCastle(world);
  // The canopy is the last word in the sky over the *landmarks*, so nothing
  // that runs before it can put a roof through a sheet. It hangs at y92-116,
  // above every landmark, so it cannot fight the ground either.
  buildSkyCanopy(world);
  // ...and then the beacons cut straight through it. They have to: a mast whose
  // top is behind a sheet of sky glass is not a beacon. See beacons.ts.
  buildBeacons(world);
}

export {
  buildBreach,
  buildCenter,
  buildFields,
  buildCitadel,
  buildVoidCastles,
  buildGraveyard,
  buildRuins,
  buildMazeValley,
} from "./areas_a.ts";
export {
  buildVillage,
  buildFrostPocket,
  buildTomb,
  buildAshenReaches,
  buildRuinedCastle,
  buildGlassworks,
  buildPortalField,
  buildPortalLobby,
} from "./areas_b.ts";
export { buildEndRuin } from "./end_ruin.ts";
export { buildGlassGrove } from "./glass_grove.ts";
export { buildCathedral } from "./glass_cathedral.ts";
export { buildSplice } from "./splice.ts";
export { buildAncientCity, buildWardenArena } from "./ancient_city.ts";
export { buildSkyCanopy, canopyCoverage, CANOPY_BAND } from "./sky_canopy.ts";
export { buildVeilCastle, VEIL_COURT } from "./veil_castle.ts";
export { buildBeacons, beaconMast, BEACON_COLOURS, BEACON_CROWN_Y } from "./beacons.ts";
