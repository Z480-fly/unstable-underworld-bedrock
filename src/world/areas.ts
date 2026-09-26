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
