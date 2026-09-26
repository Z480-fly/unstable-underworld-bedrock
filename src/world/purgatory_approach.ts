/**
 * The land bridge that physically joins the Underworld to Purgatory.
 *
 * Purgatory is transplanted west of the realm edge (`x = -352`), but the
 * Underworld island's west coast stops around `x = -306`, leaving a strip of
 * void between the two. Without a connector the two places would be separate
 * floating slabs with a gulf between them, which is exactly the "separate
 * dimension" feeling the merge is meant to avoid.
 *
 * For every z-row inside Purgatory's footprint this walks east from the realm
 * edge to the first column the island already occupies and fills the void in
 * between, so the plateau always meets the coast and never overwrites existing
 * Underworld terrain (the fill only ever touches columns `isLand` reports as
 * void). Rows with no coast within reach are left as void - those sit outside
 * the island silhouette and outside Purgatory's footprint anyway.
 *
 * The plateau's top is placed one block below Purgatory's floor (y 42) so the
 * seam steps down into the imported region rather than floating above it.
 */

import { WORLD_MAX_X } from "./config.ts";
import { P } from "./blocks.ts";
import type { World } from "./world.ts";

/** West edge of the realm: Purgatory starts one block further west. */
const EDGE_X = -352;
/** Purgatory's world-Z footprint (`cz -19..18`). */
const MIN_Z = -304;
const MAX_Z = 303;
/** Purgatory's floor height in world Y (local y 26 + offset 16). */
const TOP_Y = 42;
/** Deepest block of the plateau body. */
const BASE_Y = 18;
/** How far east the bridge will reach trying to find the island coast. */
const MAX_REACH = 96;

export interface ApproachStats {
  columns: number;
  minX: number;
  maxX: number;
}

export function buildPurgatoryApproach(world: World): ApproachStats {
  let columns = 0;
  let minX = Infinity;
  let maxX = -Infinity;

  for (let z = MIN_Z; z <= MAX_Z; z++) {
    // Find the island's west coast for this row.
    let coastX = EDGE_X;
    let reach = 0;
    while (coastX <= WORLD_MAX_X && reach < MAX_REACH && !world.isLand(coastX, z)) {
      coastX++;
      reach++;
    }
    if (reach >= MAX_REACH) continue; // no coast in range: leave this row as void

    // Ramp the plateau from Purgatory's floor up (or down) to the coast height,
    // so the seam is a walkable slope rather than a cliff in either direction.
    const coastY = world.surfaceAt(coastX, z);
    const span = coastX - EDGE_X;
    for (let x = EDGE_X; x < coastX; x++) {
      // Never touch a column the island already claims.
      if (world.isLand(x, z)) continue;
      const t = span > 0 ? (x - EDGE_X + 1) / span : 1;
      const capY = Math.round(TOP_Y + t * (coastY - TOP_Y));
      for (let y = BASE_Y; y < capY; y++) world.set(x, y, z, P.deepslate);
      // Tiled cap with a scattering of darker and cracked tiles.
      const cap = (x * 3 + z * 7) % 17 === 0 ? P.crackedDeepslateTiles : P.deepslateTiles;
      world.set(x, capY, z, cap);
      world.setSurface(x, z, capY);
      world.setLand(x, z, true);
      world.protect(x, z, 1);
      columns++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
    }
  }

  return { columns, minX: columns ? minX : 0, maxX: columns ? maxX : 0 };
}
