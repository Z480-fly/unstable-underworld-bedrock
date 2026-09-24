/**
 * Renders the world icon (`world_icon.jpeg`) straight from the generated map,
 * with a simple hill-shade so the plate, the chasms and the lava lake read at a
 * glance. The same bitmap is written to `docs/map-preview.jpg` as a build
 * artefact, which doubles as a visual check of the layout.
 */

import jpeg from "jpeg-js";
import { WORLD_MAX_X, WORLD_MAX_Z, WORLD_MIN_X, WORLD_MIN_Z } from "./config.ts";
import { colorAt } from "./decorate.ts";
import type { World } from "./world.ts";

export function renderMapImage(world: World, size = 768): Buffer {
  const spanX = WORLD_MAX_X - WORLD_MIN_X;
  const spanZ = WORLD_MAX_Z - WORLD_MIN_Z;
  const data = Buffer.alloc(size * size * 4);
  const scale = Math.max(spanX, spanZ) / (size - 1);

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const x = Math.round(WORLD_MIN_X + px * scale);
      const z = Math.round(WORLD_MIN_Z + py * scale);
      const offset = (py * size + px) * 4;
      if (!world.inRealm(x, z)) {
        data[offset] = 0;
        data[offset + 1] = 0;
        data[offset + 2] = 0;
        data[offset + 3] = 255;
        continue;
      }
      let [r, g, b] = colorAt(world, x, z);
      // Hill shade from the terrain slope so elevation reads on the icon.
      const here = world.surfaceAt(x, z);
      const east = world.surfaceAt(Math.min(WORLD_MAX_X, x + 3), z);
      const south = world.surfaceAt(x, Math.min(WORLD_MAX_Z, z + 3));
      const slope = (here - east) + (here - south);
      const shade = Math.max(-0.45, Math.min(0.45, slope * 0.035));
      r = Math.max(0, Math.min(255, Math.round(r * (1 + shade))));
      g = Math.max(0, Math.min(255, Math.round(g * (1 + shade))));
      b = Math.max(0, Math.min(255, Math.round(b * (1 + shade))));
      data[offset] = r;
      data[offset + 1] = g;
      data[offset + 2] = b;
      data[offset + 3] = 255;
    }
  }

  const encoded = jpeg.encode({ data, width: size, height: size }, 88);
  return Buffer.from(encoded.data);
}
