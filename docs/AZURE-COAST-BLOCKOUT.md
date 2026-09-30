# Azure Coast — U-bay blockout review

Base: `88e2a2bc0a8d288909b05b86d6e9d1d394362f00` (main, including coastal attack PR #20). This draft stops at the exterior layout. No merge or deployment is authorized.

The 320 × 240 m map keeps the reference's U-shaped bay opening south. Residential loop lanes occupy the west; market, craft table, trainer and town stone sit north of the bay; a six-metre road leads north to existing hunting content; warehouses and their loading lane occupy the east; the repair shed and rotated slipway sit southeast; lighthouse and short breakwater sit southwest. Four short piers point inward without obstructing the bay mouth. Primary roads are 5.5–6 m and lanes 3.5–4 m. Building boxes use authored dimensions, 3.6–6 m heights and per-building roof colors. These are review volumes, not finished buildings.

`shoreZ(x)` and the existing water system remain. Nearest shoreline distance follows side coasts, and segment edge types separate sand, quay, breakwater and repair frontage. Rotated dock ramps sample and interpolate in dock-local Z; rendered deck vertices use the same slope without changing their XZ footprint. Clearance supports adjoining deck seams and blocks the exposed outer sides.

Combat, skills, mods, crafting recipes, touch controls, quest IDs and rewards are unchanged. All seven main steps remain. Services, stones, safe arrival road and hunting rectangles move with the layout. The optional character `worldLayoutRevision` relocates old coordinates once while retaining levels, gear, inventory, skills, unlocked stones and quest records. Save envelopes remain version 2.

Validation for this draft:

- Build passed; existing bundle-size warning remains.
- 25 targeted world/harbor/save checks passed: continuous movement on every road, dry buildings and spawn points, rotated piers and repair slipway, outer water blocking, starter quest/crafting progression, and old-save preservation.
- Focused Chromium run opened the actual game with no runtime, asset or shader errors. Native touch joystick produced movement input. Walking from arrival to the town stone unlocked it and completed the real first quest.
- Four screenshots: U-bay overview with review labels, original gameplay camera at the market, market-to-pier connection, and rotated repair slipway. Overview changes the camera only inside the capture harness. Production camera and lighting remain unchanged.
- Hardware iPad FPS has not been measured. Browser viewport/touch checks do not establish 60 FPS on iPad. WebKit and full smoke are left to PR CI/premerge review; no local stress/leak session was needed.

Known review points: overall walking distances, spacing between market and docks, residential density, shipyard working space and the low quay silhouette. No interiors, ship driving or new fishing system. After owner approval, dress one market-to-pier slice and request style review before expanding.

Direct source reads covered world/terrain/math, character migration/game spawning and checkpoints, harbor/environment/ground renderers, map UI, quests, layout export, port contracts and affected captures/tests. No unresolved source discovery required Jev; no Jev request was made. CI status must be checked on the draft PR and is not inferred from local checks.
