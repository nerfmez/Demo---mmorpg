# Unified resident world

Azure Coast, Greenhollow Frontier and Moonroot Grove share one fixed coordinate space. Region IDs remain namespaces for authored content, discovery and native-coordinate v13 saves. Walking across an old boundary changes metadata; it does not reload, shift actors, reset combat or construct another scene.

## Preparation and frame work

- All three native scenes, imported landmarks, grass and static GPU buffers are prepared behind the initial loading screen. Preparation includes gameplay shadow-receiving/output shader variants. A failed import or grass job keeps that screen opaque.
- GPU preparation uploads complete buffers with one primitive per material group and one instance per draw. Original draw ranges, material groups, instance counts and renderer state restore before each yield, so gameplay geometry is unchanged. An empty private draw advances Three's frame cache after packing, and sorting stays disabled during shortened draws to preserve full-instance bounds. This does not establish that every custom shadow-caster variant is precompiled.
- Private uploads retain gameplay shadow receivers while freezing shadow updates; missing light maps use the safe shadow-off upload fallback. Paint blur retains the original arithmetic and color bytes with bounded row/column slices. GPU color reads retain their original fence plus at most one recovery fence, preserving the earlier completion point and the 5-second bound. The fullscreen backdrop stops sampling the animated opaque loading card until world readiness restores its existing 12 px blur.
- Static renderables occupy conservative cells. Only camera cells and shadow-casting cells required by the directional light attach to the scene. Hidden cells keep prepared buffers but leave both drawing and recursive matrix traversal.
- Each attached static drawable also tests its padded world-space box against the camera and shadow frusta. This avoids submitting a long offscreen batch just because its enclosing sphere intersects the view. Boxes retain the wind, water and outline envelope, follow region transforms, and restore on quality changes/disposal; authored culling overrides keep their original hierarchy and behaviour.
- NPCs, monster poses, trails, markers, drops and ambient emitters skip off-camera visual work. Idle monster simulation uses a conservative 58 m envelope; active combat continues so visibility never changes combat outcomes.
- Static unit colors/masks and normals use normalized 16-bit storage. Positions, UVs, topology, textures and scenery density remain unchanged. Grass snapshot buffers and dynamic/non-unit attributes are excluded.
- Automatic resolution stays at 95–100% of the selected preset in each dimension: at most 9.75% fewer pixels. This is a measurable resolution bound, not a mathematical measure of subjective image quality. No automatic geometry, texture or preset downgrade was added.
- Adjacent gate road paint continues and fades through the existing seam band. Native gameplay roads, collider data, planting positions and heightfields stay unchanged.
- Exterior backdrop trees are omitted wherever their centres fall inside an adjacent region's complete playable rectangle. This covers corners outside the old seam spans and stops the Grove's border forest covering the Frontier settlement. Native trees/colliders are unchanged; valid outer backdrop trees remain.

## Save and gameplay contracts

Snapshots retain v13 `worldId` and map-local `pos`; loading can choose a different scene origin without changing the absolute atlas position. Native worlds remain immutable renderer/layout sources. Discovery stays map-qualified. Kills, collected totals and boss kills keep their existing global lifetime meaning; quest notifications and drop tables carry the originating region. Actors, summons, areas, projectiles, drops and spawn homes persist across boundaries.

Waypoint, minimap, atlas and quest destinations convert between native, scene and atlas coordinates explicitly. A remote quest route continues into its destination region and ends at a clear standing point within interaction reach, rather than stopping at the old gate. Zone, bridge and dock queries return stable objects in scene coordinates. Both native navigation and unified gameplay query every collider grid cell touched by the actor radius.

## Verification and limits

The focused checks cover physical boundaries, grid-edge collision clearance, water clearance, persistent actors, source-region loot/respawn, repeated saves/reloads, navigation, spatial bounds/restoration, resource ownership, integer precision, sleeping rigs, translated NPC scarves and opaque startup readiness. The browser case walks all three joins using native input with combat/readiness guards forced to refuse, verifies no scene build steps, and exercises real Chromium touch press/move/release. Screenshots cover phone, iPad-size and desktop layouts and both towns at High.

This design trades a longer first preparation and retained all-world buffers for eliminating terrain streaming during play. Compaction reduces the buffers for the same three resident scenes; it does **not** establish lower total RAM than the old one-region residency policy. Browser software-GPU timings do not establish real iPad FPS, battery use or peak device memory. WebKit/device validation and required CI gates remain necessary before merge.

Exact captured-build identity, measurements, image review and test results are recorded in [the delivery review](../review/unified-world/README.md).
The subsequent [camp/Medium review](../review/camp-medium/README.md) records the exterior-tree correction and lower camera/shadow submissions with the same Medium preset.
