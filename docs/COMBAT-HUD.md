# SEEKER — clean field HUD (29 September 2026)

Implements the owner's approved gameplay-HUD reference, not the older paper/ornamented
combat mock-ups. Navy translucent panels, restrained silver outlines, white/cyan skill
symbols and gold reserved for quest/Job accents. The scene, camera, live hero portrait,
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
