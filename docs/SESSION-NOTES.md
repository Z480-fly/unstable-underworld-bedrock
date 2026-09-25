# Session notes — Underworld Bedrock on iOS (2026-09-24/25)

## Goal
Playable Unstable Underworld reconstruction on **Minecraft Bedrock 1.26.51 iPhone**.

## Timeline

1. User shared freebuff world video (Google Drive) — sparse plate, floating scraps.
2. Repo inspected: terrain gulf/chasms, pad foundations, landmarks in TypeScript.
3. Terrain tweaks (narrower gulf, softer chasms, stronger pad) — user still saw broken/empty map.
4. LevelDB inspection showed **blocks were written** (~2594 subchunks) but phone showed nothing.
5. Added **Data3D + Data2D** for all chunks — still failed on device.
6. User could not upload zip in chat; shared **phone-native world** via Drive.
7. Diff vs phone export found real format gaps (see `docs/IOS-1.26-FINDINGS.md`).

## Files saved this session

| Path | Purpose |
|------|--------|
| `docs/IOS-1.26-FINDINGS.md` | Phone vs generator format comparison |
| `src/bedrock/data3d.ts` | Data3D/Data2D serializers |
| `src/bedrock/world-writer.ts` | putData3D / putData2D |
| `src/build.ts` | Writes biomes for every chunk |
| `src/world/config.ts` | chunkVersion **42**, InventoryVersion **1.26.51**, networkVersion **2193** |
| `src/bedrock/leveldat.ts` | NetworkVersion, Platform, ClassicFlat layers, 1.26 version lists |

## Confirmed phone facts

- Chunk version byte: **42**
- Data3D ~**5252** bytes (ours still ~637 stub — main remaining bug)
- NetworkVersion **2193**
- InventoryVersion **1.26.51**
- Extra tags **0x3F / 0x40 / 0x41** per chunk

## Still broken for player

iOS still does not show buildings until Data3D matches phone size/layout and likely extra tags.

## Handoff

```
Read docs/IOS-1.26-FINDINGS.md and docs/SESSION-NOTES.md
Repo: Z480-fly/unstable-underworld-bedrock
Priority: rewrite Data3D to ~5KB phone format; chunk v42 already set; then rebuild .mcworld
```

---

## Follow-up (later the same day): main repaired, CI added

The saved commits did not compile (138 TypeScript errors): `structures.ts` was deleted and
replaced by a 3-function stub, `config.ts` lost the exports its callers import (`CONFIG.terrain`,
`WORLD_MIN_X` …), and `leveldat.ts` was pointed at an `nbt-le.ts` API that does not exist.
`bun run build:map` could not run at all, so the `.mcworld` in `dist/` was stale.

Fix: restored `structures.ts` (all 18 builders, plus the improved `pad()`), restored the
`config.ts` shape while keeping the 1.26.51 stamps, and restored `leveldat.ts` on
`prismarine-nbt` (re-adding `parseLevelDat`) with the phone's version fields. The terrain
softening and the Data3D/Data2D writers from the earlier session were kept, so the map was
rebuilt from the repaired source.

Current state: `bun run check` green (16 tests, palette OK, 745 chunks / 2 275 subchunks, 23/23
checks) and `.github/workflows/ci.yml` runs that gate on every push and pull request. See the
follow-up section of `docs/IOS-1.26-FINDINGS.md` for the file-by-file detail and the reasoning for
keeping `FlatWorldLayers` air-only.
