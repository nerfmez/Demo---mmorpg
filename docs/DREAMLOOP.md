# Dreamloop — network and anime terrain

The loop is: run the game → capture fixed locations and real interactions → inspect the
images → correct the concrete issue → rerun the affected check → CI → published-site audit.
Build success and screenshot existence are not visual approval.

```sh
npm test
npm run build
npm run test:browser
node tests/browser/capture.mjs
npm run test:ux
npm run test:dreamloop
# Safari's engine (CI installs its Linux dependencies):
BROWSER=webkit DREAMLOOP_PASS=webkit npm run test:dreamloop
# Public URL after Pages reports deployment complete:
DREAMLOOP_URL=https://nerfmez.github.io/Demo---mmorpg/ BROWSER=webkit DREAMLOOP_PASS=live-webkit npm run test:dreamloop
```

`tests/browser/out/dreamloop-<pass>/` holds ten matched locations, three surf phases, river-crossing and network screenshots
and `report.json`. Use `DREAMLOOP_PASS=before` to collect the terrain baseline; use a new
pass name after fixing an issue. `DREAMLOOP_NETWORK_ONLY=1` reruns graph interactions
without recapturing unchanged terrain. `DREAMLOOP_TERRAIN_ONLY=1` captures terrain/surf and
tests river traversal without rerunning the unchanged job network.
Add `DREAMLOOP_SURF_ONLY=1` for just the three surf phases and river traversal.

## Soft coast revision (2026-09-28)

- Compared the owner's seaside video with captures from current main, including both coast locations.
- Removed pines, removed meadow vegetation on sand, added two distinct shell shapes and
  a warm sand layer. Softer leaf colours, daylight and shadows reduce harsh contrast.
- Visual inspection caught oversized shells and a swash grid clipping into the sand.
  Reduced shell size and aligned the swash with the terrain grid; cull it in tiles.
- `surf-low`, `surf-runup`, `surf-return` use the same camera with a controlled GPU clock;
  inspect the foam edge advancing and retreating, not just scrolling water noise.
- A joystick gesture moves the player across both riverbanks away from a bridge. Chromium
  uses native touch events; WebKit uses the same pointer event handlers. Simulation uses
  fixed steps so software rendering speed does not change the traversal result.
- Core tests cross the stream at five non-bridge locations in both directions; deep sea
  and pond boundaries still block. Check that beach decoration contains no meadow plants.

## This revision's visual corrections

1. First comparison exposed polygonal/spiked canopy masses and excessive geometry.
   Replaced them with shared painted leaf/needle atlases on instanced foliage; shortened
   grass and rounded the flower petals. The world remains a real heightfield and colliders.
2. Pond streaks formed radial wedges because an angular coordinate was interpolated
   across triangle fans. Use world coordinates for the painted surface streaks instead.
3. Mobile zoom buttons covered graph nodes. Controls now occupy their own row; the
   selected-node pane shares the remaining screen height with the pannable network.
4. Preserve the existing camera, hero scale, core collision layout, saved node IDs/effects,
   and save version. The new route finder previews paths only; point spending stays explicit.

## Verification and fallback

- Exercise actual point allocation, one-job restriction, route previews, pointer drag,
  touch cancellation, native Chromium two-finger pinch, and responsive close/action buttons.
- Inspect forest, meadow, gate, bridge, stream, wetland, highlands, ruins and both coast views at identical positions.
- Inspect `capture.mjs` combat frames for ground-effect and character visibility.
- If full-page screenshot capture stalls, the runner tries the WebGL canvas with a longer
  timeout. If the local browser cannot render WebGL, run the same suite in GitHub Actions
  and inspect its uploaded PNGs. Do not substitute source-code checks for an art review.
- Triangle/draw-call counts are a relative rendering budget. Software-GL frame times are
  not iPad FPS measurements. Verify hardware performance on the actual device separately.
- PR CI no longer runs the dreamloop (it ran the smoke and UI suites in Chromium and WebKit
  side by side); run it locally with the commands above when terrain or the network changes.
  The deployment workflow still audits the live URL in WebKit and uploads `live-dreamloop`.
