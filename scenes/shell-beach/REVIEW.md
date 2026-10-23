# Shell Beach revision review — 23 October 2026

**Decision: revised owner-review draft.** The owner requested closer conch-reference matching, a better path and more physical space. Runtime WebGL lighting, shadows, waves and touch playback remain unverified in this environment; this is not approval for game integration or merge.

## Artifact and reference

Built `shell-beach/index.html`, SHA-256 `72a7442f9706a2ee179695db54ccee92e3119ec0987090536c8c6ba5b817686c`. Reference: the repository's Singing Conch Coast concept at `8ce972eb90d58dedb25c8fcf3c019dc89025ff96`, retained as `concept.png`.

## Revisions and visual inspection

- Replaced the circular-ended horn with `conch.js`: expanding spire whorls, a body that sweeps upwards/right into the crest, and a non-planar lip traced from the reference. The outline includes the folded upper throat, outward wing, raised left columella and a long lower apron resting on the sand. A thick rim joins the exterior to a warm, off-centre inner chamber. Reduced oversized shoulder corrugations and added sparse weathering/lichen to the exterior.
- Actual scene geometry was inspected in successive software renders at the authored 40-degree camera, 1254 × 706. Found and corrected the exterior covering the aperture; moved its return behind the chamber. The final inspected view shows the cream body, smaller left spire and warm open cavity with its flared apron. This is a closer reference-led silhouette, not a claim of pixel-perfect or final material matching.
- Replaced the straight stair collision/height projection with one continuous curved ribbon (`path.js`) shared by terrain, paving, collision and vegetation clearance. Paving courses turn with the local tangent; `paving.js` forms stone banks where the ground is cut. Inspected the resulting connection from the sand through the S-shaped rise and upper landing. The surface now follows the visible bend instead of a straight underlying ramp.
- Corrected tree placement by finding the visible heightfield intersection instead of iterating a discontinuous height. The previous method put back-row trees in front of the conch/path. Moved trunks clear of the route and cleared the aperture's foliage.
- World scale 2.4 → 3.12 and camera distance 72 → 93.6: width and depth both increase 30%, total bounds 144 × 129.6 → 187.2 × 168.48 world units. Hero scale/speed stay unchanged. Retreating the left/right cliff edges also enlarges the central sandy apron. The 69% figure applies to total terrain bounds, not a measured 69% increase in navigable sand.
- Opening beach water equations, color/clarity, wash and foam are unchanged from the prior bay build. Reference comparison/wipe and tap-to-walk remain available. The ruins, approved beach and approved forest remain unchanged in this revision.

## Focused technical evidence

- Preparation and self-contained page assembly completed; generated JS passed `node --check`; diff checks passed.
- The actual Three scene and embedded hero GLB loaded in the geometry harness. All geometry attributes were finite; eight water-rock uniforms were populated.
- The real `walkTo` / `updateHero` code continuously reached 27 targets from the central sand through the left approach, stair foot, alternate rows and upper landing. Every target finished within 0.10 world units. All 48 row centers and samples at ±70% of their half-width were unblocked (144 points).
- No core, data, save or game renderer changes. No unrelated game suites or additional browser installation. PR remains a draft.

## Limits and remaining acceptance

Cloud browser WebGL creation had failed; the software fallback approximates paint/material shading, omits the real ground bake and shadows, and does not play waves or skin the hero. Palm inspection uses the actual pre-cut leaf texture because the local canvas backend exported its destination-out texture blank; browser production texture code is unchanged. These views establish geometry/composition evidence only, not WebGL screenshots, final lighting, animation quality or physical-device performance.

The final conch material, irregular rim/whorl appearance, path/stone-bank lighting and the enlarged area's feel still need owner comparison in the published WebGL page. A successful build or route check does not establish visual approval.
