# Approved six-monster identity integration

The owner approved the displayed PR106 portrait/material/name batch on
2026-10-07 and requested integration after PR106 merges. This independent
branch was prepared on main `0e2d9fd58b7e6e10b6226158130e642d366c301a`, then
reconciled onto PR106 merge `3225b3cdc8bff2909b4ce6297f683f4e01f899b1`
(2026-10-07 14:31:23 UTC). The original model/concept dependency was PR106 head
`867147209c520c05c8f32b7b5dfb5710ec1a899d`. This patch imports no models of
its own and inherits PR105 CI and PR104 weapons unchanged.

## Change and preservation

Six 256px portraits replace the active journal art and serve the shared map
boss pin, quest picture and material-source consumers. Two 512px material
images replace `viper_scale` and `wisp_core`. Five material display-name pairs,
six monster identities and three quests' literal descriptions/objective labels
follow the approved batch: exactly 30 JSON field changes. Other material images
are reused. Stable IDs, recipes, quantities, stats, rewards, save schema,
models, world geometry and other art remain unchanged.

`integration.json` records every old/new field and asset SHA. `preservation.json`
compares the entire three JSON objects with their baseline after reverting only
the approved labels in memory, checks all eight approved asset hashes, and
verifies all 168 other icon files are byte-identical. Recipes/model definitions
and core/render/CI/layout source files are unchanged against the merged main. Historical save fixtures
retain their historical labels. The eight optional equipment-name proposals
were outside the displayed preview and are not applied.

Approved individual monster masters are retained in
`assets/atlas-journal/identity-20261007/`, and material masters in
`assets-source/materials/identity-20261007/`. The journal splitter verifies and
copies those exports without repainting or recutting them. Old portrait cells
and both previous material provenance records remain retained. No paid
Meshy generation, new sharing, duplicate Library export, merge or deploy.

## Approved source delivery

Preview commit: `0e782d8d4d7a8aa7498c8a79c899bdd5734f5dc9` on
`codex/monster-identity-prep-20261007`. The complete mapping, concepts and
pixel/alpha review are retained there.

- Preview Library ID: `libfile_9c65741e721c819197c3ec667a5216d4`
- Preview File ID: `file_000000007444822fa3b016ceec878ad6`
- Archive Library ID: `libfile_0e93e09fcb9c81918251205699783280`
- Archive File ID, version 1: `file_00000000a124820ca53eab574f866f23`
- Archive SHA256: `b0c2f6adb918f73d7316103cb3a5d67ec9b5a2485beaaf992e38891dabd7a34f`

## Validation and release gate

Production build passes with the existing large-bundle warning. The full core suite passes (395 tests), and all CI tool tests pass (151 tests).
This includes the scoped Atlas, raster, live data, quest journey and save checks.
Browser verification and pixel review are recorded separately in `REVIEW.md`
and `browser-report.json` once complete. Browser fixtures seed only fresh,
local review state; they never alter production content or an owner's save.

The initial preparation waited for PR106. It is now merged and the branch is
reconciled onto the actual main above, preserving PR105 CI changes. The follow-up
PR still requires its exact-candidate CI/release checks, including WebKit. The
parent owns merge after those checks; this agent performs no merge or deploy.
No physical iPad, Safari or FPS claim is made by the local Chromium/SwiftShader
review.
