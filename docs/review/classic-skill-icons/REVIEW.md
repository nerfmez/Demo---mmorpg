# Classic A skill icons — integration review, 2026-10-22

Owner instruction: replace the in-game skill icons with the reviewed Classic A
delivery and fill the skill slots in the latest clean UI. Integrated UI base:
`d055bfe8aa638c16af605e61c53948b9be96747b` (merged UI redesign #141).
The final delivery ZIP SHA-256 is
`98b1777aeb0302161d8ad87a9e5b05fe3c209dfd1831dbe6f9d5ea8495a23b31`.
Per-image identities are in `docs/icon-assets-manifest.json`; the retained square
and round PNG masters under `assets-source/skills/classic-a/` are byte-identical
to their public exports.

## Acceptance and preservation

- All 27 combat and 4 movement skills use their corresponding supplied art in
  the shared UI resolver, including the loadout, crafting, growth and combat HUD.
- Fine pointers use square artwork in the clean UI's rounded square hotbar.
  Coarse pointers use the transparent round artwork in the round touch controls.
  Every skill's artwork viewport fills the slot interior, up to the border,
  and clips at that boundary rather than overflowing into adjacent controls.
- Round exports have transparent delivery gutters: the 29 new circles span
  466px of their 512px canvas; the approved originals span about 455px. Clipped
  CSS scaling removes those empty margins in the HUD without editing the PNGs
  or changing the artwork's aspect ratio. Library/detail thumbnails retain
  their existing layout and fill their dedicated artwork holders.
- Slash retains its approved pixels. Firebolt uses its approved design with the
  decorative star removed. This integration does not regenerate either icon.
- New artwork comes only from the final 31-skill delivery. Earlier discarded
  design studies are excluded. Other item artwork, skill IDs, gameplay, input
  bindings and save structure are unchanged.

## Actual runtime inspection

Inspected the following PNGs from the built game in Chromium, using the existing
`tests/browser/icon-consumers.mjs` capture. SHA-256 identities are in
[`captures.json`](captures.json).

| Capture | Viewport | Inspected result |
| --- | --- | --- |
| [desktop-skills-top.png](desktop-skills-top.png) | 1600 × 900, mouse | Square icons in equipped slots, library and detail panel; readable and contained. |
| [desktop-hud.png](desktop-hud.png) | 1600 × 900, mouse | Approved Slash/Firebolt plus Chain Spark, Ward and Dash fill the clean UI hotbar slots; key/cost chips stay visible. |
| [ipad-skills-top.png](ipad-skills-top.png) | 1180 × 820, touch | Round variants have clear exteriors and fit the same library/detail layout. |
| [ipad-hud.png](ipad-hud.png) | 1180 × 820, touch | Round art fills the touch control frames; cost chips, potion row and joystick remain in place. |

The captured views pass the icon-specific visual criteria. The inherited 12%
icon inset and the round exports' transparent gutters made the art too small;
both are corrected in the HUD. No major visible icon defects remain in the
inspected views. Stills were reviewed at their native
viewport sizes, with the completed world backdrop paused by the existing test.
These are browser simulations, not physical iPad or frame-rate measurements.

## Technical evidence and limits

- Prior artwork integration (`c6228fa`): core 587/587 and focused
  raster/presentation 11/11 passed; CI core/build also passed. This follow-up
  merges the UI redesign and changes presentation/tests only; its CI reruns the
  current core/build and browser gates.
- `npm run build` after merging the clean UI and correcting the fit: passed.
- Export script: copies both variants without pixel changes; all 62 public PNGs
  were independently compared against the final reviewed delivery and matched.
- Chromium actual-consumer checks against the clean UI passed desktop and iPad:
  all 31 HUD images decoded, filled their slot interiors and selected the
  correct `currentSrc` variant; artwork viewports are clipped at their boundaries;
  shared consumers loaded without page errors. The same focused suite also
  covers both phone orientations in the repository CI.
- The prior CI HUD comparison failed because it normalized `img.src` but not
  the new responsive `source.srcset`. Both relative URLs are now normalized;
  image identity comparisons and fit assertions remain enforced.
- The existing identity-image check selected a hidden ingredient in the new
  recipe list. Its ingredient checks and capture now target the visible
  `.pg-craft-detail` column, keeping the image/name checks against the actual UI.
  The corrected check passed locally in Chromium for desktop and iPad, covering
  map/boss portraits, material details, crafting costs and quest labels.
- A local dedicated HUD run timed out during initial world startup (60s),
  before reaching its assertions. The focused actual-consumer capture above
  completed successfully; no host or unrelated game changes were made.
- WebKit host libraries are unavailable locally. The clean-UI artwork head
  `17c5b01` passed the Chromium and WebKit icon checks, including all 31 full-slot
  viewports. The identity-test compatibility follow-up still requires its own
  complete repository CI result before publication.

Direct source tracing covered the shared art resolver, combat/movement input,
loadout workspace and crafting consumers, asset export, manifest and affected
tests. No unresolved core/save/port contract change was found; Jev retrieval was
not needed for these known paths.
