---
state: provisional
gate: gate_pending
proposed_by: external_ai (via Codex)
confirmed_by: null
---
# Reused local art (provisional)

The existing approved GemTower eight-colour palette and shape fallback remain the visual vocabulary. PNGs in web/assets/sprites are byte-for-byte copies of the user's existing generated assets. No Blizzard art or raw game-data files are included. Existing art is provisionally mapped to unit roles; these are replacement graphics, not a claim of original Warcraft appearance or user visual acceptance.

- codex-asset-forge/examples/agentforge-starter: props crystal, animated slime, builder, stone tile. The source manifest identifies original built-in image generation and MIT-compatible licence intent; its original approval state is STARTER_PACK_NOT_ACCEPTED and has not been promoted here.
- ClaudeCraft/derived-source/world-of-claudecraft-renewed/public/sprites: crypt_shambler, tidebound_acolyte, bonechill_widow walk sheets and mire_lock_pearl. Frame data was checked against actual PNG dimensions; the pearl is 128 by 128 despite a stale 1024 manifest entry.
- The ClaudeCraft src/render/canvas.ts manifest/cache/Image/onload/onerror/atlas/drawImage flow was adapted to the existing Canvas viewport, without importing its game engine or dependencies. File source hashes and exact local locations are in the return packet asset-reuse.json.

The view applies cached palette composites and simulation-tick animation only. It never edits source art or gameplay state. The shape fallback remains usable on failed manifest/image loads or out-of-bounds atlas metadata. Actual observed move orders are drawn as a path; these strokes do not alter walkability, unit movement, buildability or map rules.


## GemTower field sheets B (2026-10-23)

The four supplied Web ChatGPT sheets were generated on 2026-10-23 and authorized for this field-art implementation in the user's Vault dispatch. They remain provisional; visual acceptance belongs to the user. No new image generation was performed here.

| Derived public atlas | Supplied source | Roles |
| --- | --- | --- |
| `sprites/gemtower-b1.png` | B1-terrain-alpha.png | Four grass interiors, dirt path segments, brass checkpoints, entrance and mine |
| `sprites/gemtower-b2.png` | B2-pedestals-alpha.png | Six normal/selected grades, stone, slate and placement preview |
| `sprites/gemtower-b3.png` | B3-monsters-alpha.png | Goblin, beetle, rat, bat, wisp and ogre; two frames each |
| `sprites/gemtower-b4.png` | B4-effect-icons-alpha.png | Eight source-effect icons, gold/life/combine feedback |

Generator, prompts, source sheets and inspection notes: `wiki/projects/design-aesthetic-returns/2026-10-23-gemtower-parts-b/README.md` and `prompts.txt` in the user's Vault. Exact source/derived hashes, crop boxes, frame stride, padding and alpha operations are recorded in `docs/assets/gemtower-b/parts/_boxes.json`; logical mappings are in `entries.json`. A missing southeast corner reuses the northeast crop rotated 90 degrees. Air bodies exclude the supplied purple ground ellipse; the view paints a black translucent shadow instead. Exterior connected magenta fringe was removed only in derivative alpha channels. Interior purple art and all original source files remain unchanged.
