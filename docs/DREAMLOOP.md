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

`tests/browser/out/dreamloop-<pass>/` holds seven matched locations, network screenshots
and `report.json`. Use `DREAMLOOP_PASS=before` to collect the terrain baseline; use a new
pass name after fixing an issue. `DREAMLOOP_NETWORK_ONLY=1` reruns graph interactions
without recapturing unchanged terrain.

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
- Inspect forest, meadow, gate, bridge, wetland, highlands and ruins at identical positions.
- Inspect `capture.mjs` combat frames for ground-effect and character visibility.
- If full-page screenshot capture stalls, the runner tries the WebGL canvas with a longer
  timeout. If the local browser cannot render WebGL, run the same suite in GitHub Actions
  and inspect its uploaded PNGs. Do not substitute source-code checks for an art review.
- Triangle/draw-call counts are a relative rendering budget. Software-GL frame times are
  not iPad FPS measurements. Verify hardware performance on the actual device separately.
- PR CI runs Chromium and WebKit. The deployment workflow audits the live URL in WebKit
  and uploads `live-dreamloop`, so the tested source and the published game can be compared.
