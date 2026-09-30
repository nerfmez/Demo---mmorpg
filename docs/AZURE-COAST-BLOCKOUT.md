# Azure Coast — U-bay blockout review

Base: `88e2a2bc0a8d288909b05b86d6e9d1d394362f00` (main, including coastal attack PR #20). The owner approved the exterior layout on 30 September 2026 and authorized continuing with the market-to-pier style slice. No merge or deployment is authorized.

The 320 × 240 m map keeps the reference's U-shaped bay opening south. Residential loop lanes occupy the west; market, craft table, trainer and town stone sit north of the bay; a six-metre road leads north to existing hunting content; warehouses and their loading lane occupy the east; the repair shed and rotated slipway sit southeast; lighthouse and short breakwater sit southwest. Four short piers point inward without obstructing the bay mouth. Primary roads are 5.5–6 m and lanes 3.5–4 m. Building boxes use authored dimensions, 3.6–6 m heights and per-building roof colors. Most districts remain review volumes. Four market buildings now have finished exteriors for style review.

`shoreZ(x)` and the existing water system remain. Nearest shoreline distance follows side coasts, and segment edge types separate sand, quay, breakwater and repair frontage. Rotated dock ramps sample and interpolate in dock-local Z; rendered deck vertices use the same slope without changing their XZ footprint. Clearance supports adjoining deck seams and blocks the exposed outer sides.

Combat, skills, mods, crafting recipes, touch controls, quest IDs and rewards are unchanged. All seven main steps remain. Services, stones, safe arrival road and hunting rectangles move with the layout. The optional character `worldLayoutRevision` relocates old coordinates once while retaining levels, gear, inventory, skills, unlocked stones and quest records. Save envelopes remain version 2.

Validation for this draft:

- Build passed; existing bundle-size warning remains.
- 25 targeted world/harbor/save checks passed: continuous movement on every road, dry buildings and spawn points, rotated piers and repair slipway, outer water blocking, starter quest/crafting progression, and old-save preservation.
- Focused Chromium run opened the actual game with no runtime, asset or shader errors. Native touch joystick produced movement input. Walking from arrival to the town stone unlocked it and completed the real first quest.
- Four screenshots: U-bay overview with review labels, original gameplay camera at the market, market-to-pier connection, and rotated repair slipway. Overview changes the camera only inside the capture harness. Production camera and lighting remain unchanged.
- Hardware iPad FPS has not been measured. Browser viewport/touch checks do not establish 60 FPS on iPad. WebKit and full smoke are left to PR CI/premerge review; no local stress/leak session was needed.

Known review points: overall walking distances, spacing between market and docks, residential density, shipyard working space and the low quay silhouette. No interiors, ship driving or new fishing system. The layout is approved; the market-to-pier style slice now awaits owner review before expansion.

Direct source reads covered world/terrain/math, character migration/game spawning and checkpoints, harbor/environment/ground renderers, map UI, quests, layout export, port contracts and affected captures/tests. No unresolved source discovery required Jev; no Jev request was made. CI status must be checked on the draft PR and is not inferred from local checks.

## Market-to-pier style review (30 September 2026)

The owner requested natural road and other edges before proceeding. Existing road corners now curve inside their approved corridors, and monotone coast samples soften the U-bay without replacing the water system. Worn road shoulders, irregular paving margins and soft dirt/grass transitions replace ruler-straight painted boundaries. The breakwater approach retains its original deck joining points.

The fish hall has a low hipped terracotta roof; the workshop has a brown gable and small chimney; the provision shop has a gray roof; the inn has two low storeys and a muted blue roof. Windows, timber trim, signs and potted plants stay within the authored base footprints. Roof courses and small joints use the original cel materials, lighting and gameplay camera. Four awning stalls group fish on the west and provisions on the east. Coiled rope, a hanging net and floats sit at the two market pier edges; low curved quay coping leaves open pier approaches. Other neighborhoods remain blockout. No interiors, boat control or fishing system were added.

Static market pieces are batched per color within each building/prop group. No extra animation callbacks or texture assets were introduced. This does not establish an iPad FPS result.

Validation: 25 targeted world/harbor/save checks passed after the curved layout and coast lookup changes. Build passed. Focused Chromium checks passed with native touch input, safe arrival/first quest and real movement from the market square through the aisle onto the west market pier. Actual gameplay images cover the fish hall, workshop, inn and pier, plus an overview and repair-slipway regression view; runtime/asset/shader errors were empty. Hardware iPad performance remains unmeasured; CI status is reported separately on the draft. No merge or deployment.

## Self-review corrections

Reviewed the actual original-camera shots again at the owner's request. The previous style pass had a straight grass seam across the paved apron, excessive beach-like foam on the quay, terrain-following port water that produced angled sheets, oversize gaps in coping at pier entrances, generic repeated frontages and a high continuous foundation at doors. Decorative boats still looked like closed ellipsoids, and the east boat partly overlapped the pier.

Corrections retain the approved layout: contiguous worn paving; flat, quieter port water while preserving beach swash; exact dock-local clipping and a stone face joined to its coping; low recessed thresholds and authored wall colors; distinct fish trays, workshop cladding, provision shelves and an inn bed sign. The two market fishing boats now have open working decks, closed floors, folded sails and static mooring ropes. The east boat moves two metres away from its old overlapping placement. Board courses are 0.32 m instead of metre-wide slabs. Other neighborhoods remain review boxes.

After corrections: build passed; 25 harbor/world/save tests passed; actual mesh bounds fit all four building colliders and both fishing boats clear pier footprints; focused Chromium arrival/quest, market-to-pier walking, native touch and runtime/asset/shader checks passed. Original gameplay-camera views inspect all four frontages, the quay/pier entrance and the working berth; the overview and repair slipway remain regression views. No production camera/lighting/game-rule change, no deployment/merge, no long stress/leak run and no claim of hardware iPad FPS. CI for the new head is reported separately.
