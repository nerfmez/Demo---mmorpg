# City cohesion — local review only

Parent baseline: `cd9b144bdbdfa179faf11d1ff348f2111d23ecb8` (approved V3 city, PR46 fullscreen and PR47 journal). No publication is authorized for this revision.

The approved residential/civic/warehouse/shipyard geometry, street polygons, native coastline, native leafy tree positions, NPC anchors and original GLB bytes stay intact. EXP, Job, skill-tree, UI and save content are unchanged.

Paving uses small low-contrast warm/neutral setts. The existing source roads and unique market plaza retain their hierarchy. A once-baked surface mask makes actual soil openings at native trees; narrow continuous stone rims are cosmetic and low enough to step over. Inland fringes share native earth/grass pigments; coastal quay paving stays clear.

All eleven piers use the original native articulated plank, rope-cap and post style. The imported timber file remains in the source archive but is not loaded. Three crossjoins are removed. Piers6/7/8 are complete revised assemblies at the east quay; every landward timber edge is clipped to the source shore segment, with its posts on the water side. `shoreCut` describes that flush render end; the enclosing walking box and source stone support an actor's footprint together. Nine existing boats use explicit berths and static mooring lines. The conservative hull envelope clears both source land and timber.

The fountain retains its stone tiers and solid basin collider. Cosmetic water consists of three animated pools, one merged flow/cascade draw and one bounded splash-point draw. It uses shared render time, fixed buffers and distance-limited ripple/splash detail, with no CPU particles allocated per frame. It never blocks movement or adds a gameplay system.

Five existing fish trays are moved onto stall counters. Four existing crate/barrel pairs are grouped beside their facilities, through exact node offsets; no prop copies or gallery imports are added.

Buildings use black game-rendered feature contours. Open imported gables use feature lines rather than inverted black hulls, which would expose large black faces. Other materials, ground and shadows keep their colors.

Focused checks: city/world/harbor and boat/seam checks; actual Chromium/WebKit gameplay/UI checks; matched player-camera sector review; shader/buffer stability; matched calls, triangles, bytes, load and GPU-barrier timings. Software renderer timings and offline game-clock motion capture are not physical-device FPS measurements. Lint/type scripts are absent.

Original review photos could not be materialized in this executor: `library file transfer failed: download failed`. Supplied parent observations were used alongside actual game pixels and GLB source inspection; local original-photo inspection is not claimed.
