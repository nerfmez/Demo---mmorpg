# Approved raster icons and mod coins

Final integration base: `8778cebd9c526e3f4f629c255411a8dea4bfd533` (current main fetched 2026-10-03, including city release PR52). Reviewed locally in `icon-raster-review`. The earlier preparation checkout remains `/workspace/icon-raster-prep`, based on301ac85. Main's city changes do not overlap the icon overlay. The owner approved this bounded icon release on 2026-10-04 UTC. Release checks and Pages verification are recorded in the PR; the unrelated UI prototype is excluded.

## Complete delivery

All76 supplied PNG illustrations are registered:37 gear (13 weapons,6 armor,6 helmets,5 boots,7 charms),22 materials,13 combat skills and4 movement skills. Nine authenticated Drive ZIPs and every PNG were verified against the supplied SHA256 manifests. All76 image hashes are unique, all images are512×512, and all59 gear/material images retain transparency. Delivered PNG bytes are unchanged, totaling17,197,804 bytes. Original1254 PNGs were not downloaded locally; artist-provided full-resolution hashes and Library IDs are retained as provenance in `icon-assets-manifest.json`. Source ZIPs remain outside deployment under `/workspace/scratch/icon-incoming/verified-drive`.

All15 mods use physical metal coins with distinct semantic engravings. Confirmed groups: red attack=concentrated; green support=life_leech,spiked_ward,pack_leader; blue mechanics=the other11. Only the engraving and narrow rim are colored. Existing names, eligibility and effects remain unchanged.

`art()` now emits an image inside its existing wrapper for registered IDs. It retains classes, data attributes and decorative accessibility behavior. Ground loot uses the same URLs. Existing SVG illustrations remain as fallback for unregistered content; monsters,zones and Skill Tree sigils retain their current artwork. No gameplay,data,save,VFX,3D model,HUD layout or accepted Skill Tree behavior changed. No rejected UI prototype is included. Compact Tree stats and atomic same-group route purchases are untouched.

## Validation

- Full `npm test`:173 passed,0 failed on the final current-main checkout.
- The final coverage test was then tightened to require all76 registered IDs, exact512px dimensions,76 unique hashes and zero pending assets; its4 tests passed.
- `npm run build`:passed; `git diff --check`:passed.
- Focused Chromium test `tests/browser/raster-icons.mjs`:inventory gear/material/mod tabs; all5 equipment categories and details; skill slots/library; mods; movement; upgrades; all6 crafting categories plus recipe ingredients/results; quest rewards and Atlas;17 combat/movement HUD images with decoded512px/bounds checks; phone844×390 HUD and skill menu.
- All22 ground textures decoded.44 sprites reused exactly22 materials/textures. Removal cleared all scene drop entries, and subsequent sprites reused the cache. No page errors or icon HTTP failures in the main matrix.
- Additional actual title→new-character flow decoded all3 starting kit icons. Atlas creature-drop view was separately captured after scrolling to its existing section.
- The complete76-icon sheet and15-coin sheet were rendered using the actual registry/art function and inspected. Actual bag,mods,skills,movement,upgrades,craft detail/results,quests,charm details,HUD and ground-loot screenshots were also inspected. Screenshots use disposable browser fixtures; no user save is written by the main matrix.

## Performance and limits

No per-instance textures, blanket preload or new hot-path allocations were introduced. Cache/resource ownership is unchanged, so a long leak run was not required by AGENTS.md. This is resource-sharing/cleanup evidence, not a hardware FPS benchmark.512px loot textures are larger than the previous128px SVG textures: all22 resident RGBA textures with mipmaps are approximately29.3MiB uncompressed. Keep this cost visible during device review; supplied pixels were not downsampled again.

Local WebKit is unavailable. Repository CI supplies automated WebKit checks; physical iPad/Safari behavior and FPS remain unverified. Existing narrow-screen menu scrolling/overflow remains outside this icon-only change. PR CI supplies Chromium/WebKit smoke and UI checks before merge.

## Review artifacts

The review ZIP contains an icon-only source overlay, exact base commit, all76 PNGs, provenance manifest, focused browser script, test/build logs and actual screenshots. Apply overlay to the stated base; omit node_modules and browser output from a production commit. Shared Tree `sigils.js`, all core/data and VFX files are absent from the overlay. Direct source tracing covered art callers in menu,inventory,skillview,craftview,panels,input,atlas,dropart and the existing drop cleanup path. No unresolved source discovery required Jev.
