# Approved six-monster identity integration

The owner approved the displayed PR106 portrait/material/name batch on
2026-10-07 and requested integration after PR106 merges. This independent
recovery branch was based on actual post-PR106 main
`3225b3cdc8bff2909b4ce6297f683f4e01f899b1` and now includes post-PR109 main
`11e1f3020500a8236de215fa342a96e49f8fbd6e`. It cherry-picks the existing approved
patch `7f58c19efcb3f38ed6f6b5196196c547ba5f9095` without conflicts, retaining
PR106's model/concept dependency `867147209c520c05c8f32b7b5dfb5710ec1a899d`.
The original integration branch remains untouched. Its remote head was still
`7f58c19` and no PR was found when recovery began on 2026-10-07 after 15:55 UTC.

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
and core/render/layout source files are unchanged. Historical save fixtures
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

Production build passes with the existing large-bundle warning. The focused
Atlas, raster, live data, quest journey and save tests pass: 50 tests total.
Browser verification and pixel review are recorded separately in `REVIEW.md`
and `browser-report.json`. Browser fixtures seed only fresh,
local review state; they never alter production content or an owner's save.

PR106 merged at 14:31 UTC on 2026-10-07, satisfying the requested merge dependency.
The focused checks and actual UI captures are repeated on the recovered patch
with those models present. Only the port guide overlaps the intervening changes;
Git retained both the PR106 model notes and this patch's UI notes automatically.
All model, weapon, core/render, recipe and CI workflow files remain byte-identical
to post-PR109 main. The CI follow-up registers the existing identity test in both
engines; its ownership/routing checks are recorded in `REVIEW.md`.
Release CI owns the required premerge checks, including WebKit;
PR109's merged browser setup and GPU checks are retained without modification.
Do not merge or deploy this draft. No physical iPad, Safari or FPS claim is made
by the local Chromium/SwiftShader review.
