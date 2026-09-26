# Purgatory source data

`db/` holds the LevelDB tables of the **Purgatory Simulator** world the user
supplied (a Bedrock 1.26 world export, originally `Purgatory Simulator (1).mcworld`).
Only the `.ldb` sorted tables are kept, because that is all the reader needs;
the world has been compacted on export so nothing lives in the write-ahead log.

The world is a 544 x 608 block build (34 x 38 chunks, `cx 0..33`, `cz -3..34`)
whose solid blocks span `y 26..273`. It is transplanted into this project's
Overworld as the region that continues west of the Underworld - see
`src/world/purgatory.ts`, which applies the world offset and substitutes the few
gravity blocks before the blocks are re-emitted into the LevelDB.

These tables use the same LevelDB format Bedrock writes (zlib/raw-deflate block
compression and an internal 8-byte key suffix), which `classic-level` cannot
read back; `src/bedrock/leveldb-reader.ts` decodes them directly.
