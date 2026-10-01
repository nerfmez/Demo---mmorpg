# SEEKER — clean field HUD (29 September 2026)

Implements the owner's approved gameplay-HUD reference, not the older paper/ornamented
combat mock-ups. Navy translucent panels, restrained silver outlines, original full-colour skill
illustrations and gold reserved for quest/Job accents. The scene, camera, live hero portrait,
monsters, saved character and gameplay rules are unchanged.

## Layout

- Upper left: small SEEKER wordmark above the live character portrait, name, HP/MP,
  level and gold/status row. HP/barrier/MP still read the real player values.
- Upper right: real minimap with north marker and location, narrow inventory/skills/menu
  shortcuts, and a compact tracked quest plus one other active quest when room permits.
  Quest text/progress comes from actual state. Opening the tracker opens the quest journal.
- Lower left: quiet translucent floating joystick. Input zone, drag and cancellation stay
  the same; the decorative arrows are non-interactive.
- Lower right on both mouse and touch: large basic attack, THREE other real combat slots,
  and a separate movement action. The reference's potion/lock buttons are NOT invented;
  there is no new consumable or persistent-lock mechanic in this presentation change.
  Skill names, MP cost, cooldown number/sector, stat-inactive state, empty slots and movement
  charges still work. Mouse shortcuts remain visible, touch does not show keyboard labels.
- Bottom edge: independent thin EXP (blue) and Job EXP (gold) tracks with readable labels
  outside the fills. At each level cap the relevant track reads MAX, not misleading 0%.

Short landscape moves the compact quest under the player card and reduces controls;
portrait also uses a single compact quest row. Menus and the full-screen travel-journal
passive tree retain their existing behavior and remain above the EXP strip.

## Source / performance

`fieldhud.css` is scoped to the gameplay HUD, loaded after previous skins.
`fieldhud.js` contains only stateless presentation helpers and small inline SVG symbols.
No new textures, web requests, sprite sheets or changes to core combat/passive code.
Only two small panels use a 4px backdrop blur; no full-screen blur during play.
Progress writes are cached until values change; icons rebuild only when a slot changes.

## Verification

`npm test`, `npm run build`, `npm run test:browser`, `npm run test:ux`, and
`node tests/browser/fieldhud.mjs` (also `BROWSER=webkit`) exercise the real app.
The dedicated HUD suite captures all four viewports, checks actual hit testing and
non-overlap, opens skills/map/fullscreen passive journal, and exercises empty slots,
cooldown and insufficient-MP visuals. Review fixtures use never-saved `?fresh=1` sessions.
Screenshots under `tests/browser/out/fieldhud-*` are real rendered game captures.
Browser touch emulation is not a physical iPad or a device-FPS measurement.

### Bottom-edge correction and surface polish (30 September 2026)

The previous EXP dock was 40px high on tablets/desktops and centered the actual
tracks within it. Checking only the dock's bounding box missed the visible space
below the tracks. The dock is now 24px plus the device's bottom safe inset, with
two equal-width tracks, labels above them, and a 2px bottom margin. The tracks
are 4px high at every supported viewport; promotional mottos are removed.

The HUD reserves the safe inset once. Combat controls and the joystick input zone
no longer add the same inset a second time. This keeps the controls lower without
placing them over the iOS home indicator. Percentages, independent progression,
MAX state, original skill illustrations and slot actions retain their behavior.

Player/quest frames, minimap rim, combat rims and menu surfaces now share a navy
palette, fine silver/ivory keylines and restrained warm accents. HP/MP fills have
quieter highlights; names and selected navigation receive clearer hierarchy.
While a panel is open, gameplay HUD siblings and EXP are hidden so their shapes
do not show through the translucent menu. Closing restores the same live HUD.

`fieldhud.mjs` now checks the actual tracks' distance from the viewport edge,
a synthetic 34px bottom inset, viewport-height changes, one-time safe-area
reservation, and HUD visibility while opening/closing menus. It also captures
the iPad safe-inset state and skill panel alongside its existing four-viewport
hit-testing, original artwork, cooldown and empty-slot checks.

Local review uses Chromium at iPad, desktop, phone landscape and phone portrait
sizes. WebKit binaries can be downloaded here but cannot launch without the
missing GTK4/GStreamer and related system libraries. The existing Field HUD
GitHub Actions matrix installs dependencies and runs both engines on this PR.
Neither browser emulation nor a passing technical check substitutes for the
owner's visual review or a physical iPad check.

### Empty-slot navigation and touch click-through
Opening an empty combat slot is committed on the native click after a valid tap,
not on pointerup. Otherwise the newly opened menu can receive the same touch's
compatibility click and select the wrong loadout slot on a short landscape screen.
Combat casts still execute on release; drag/cancel never opens the menu. Keyboard
activation remains supported. Both the focused HUD check and the legacy UX suite
assert the exact selected fourth slot after a real tap.

### Original skill artwork restored before merge
Combat and movement buttons call the existing art('skill', id) renderer, the same
illustrations used in skill menus. The alternate field-skill glyphs are removed.
The new HUD layout, control sizes, button frames and functionality remain unchanged.
Only modifier item art uses the approved engraved-gem treatment. No skill art, gem
art, core rule, gameplay VFX, model or save file is rewritten by this restoration.
The HUD browser suite checks every combat/movement illustration against art.js at
all four viewports and checks that no icon recolouring filter or clipping is added.
