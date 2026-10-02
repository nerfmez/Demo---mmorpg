AZURE COAST HARBOR V4 — SOFT BOAT MOORING ROPE

Narrow art revision of the approved V3 lived-in harbor. V3 remains preserved separately.

Only the boat mooring rope was replaced: 36 mm diameter main rope (previously 54 mm), gently sagged catenary-like profile, snug post turns, bow lashing and short tail. Six-sided tube cross-section; smooth shading. Existing ivory rope material reused. No new textures or materials.

Every one of the 1,149 other mesh objects retains identical geometry, world transform, group and material assignment, checked by SHA-256. Boat, pier, wear, fishing gear, other ropes, buildings, props, ground and water are unchanged. Ground remains non-final review context. No game integration, collision/navmesh validation or FPS claims.

FILES
Azure_Coast_Harbor_V4_Soft_Rope.blend: full editable scene and review cameras.
Azure_Coast_Harbor_V4_Segmented.glb: full context export, semantic mesh groups.
Azure_Coast_Pier_V4.glb: independent pier in original world coordinates.
Azure_Coast_Fishing_Boat_V4.glb: independent boat with the full mooring rope in original world coordinates.
01_Pier_Boat_V4_Soft_Rope.png: same review camera as V3.
02_Mooring_Rope_V4_Detail.png: close view of rope and attachments.
validation_stats.json: triangle costs, protected hashes and fresh-import checks.
soften_rope.py: reproducible V3-to-V4 revision script (expects existing V3 source folder).

PLACEMENT
Use either the whole-zone GLB or independent assets, not both in the same location. The entire boat mooring rope, including the post wraps, belongs to Boat only and is not duplicated in the Pier export. If relocating the boat independently, edit/remove/re-anchor its mooring rope. Prototype landscape trees remain excluded from GLB export.

COSTS
Rope: 704 triangles (previously 32), net +672. Zone: 35,813 triangles. Independent pier: 5,548. Independent boat: 1,775. All three GLBs successfully freshly imported with matching triangle totals.
