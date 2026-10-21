# Landscape implementation — review in progress

The approved concepts and coordinate plan remain in this directory. Runtime work is on `feat/layered-landscape-40deg-20261021`; this is an implementation checkpoint, not a merge or a live deployment.

The owner-selected 40° camera commit from PR #137 is included without its optional cel/frieren experiments. All 13 authored bands now use real terrain relief, upper planting, collidable outcrops and broken ruin masonry. Existing roads, services, water, city paving and shared seam bands remain protected. A3 is moved to the lower headland flank (`147,-76` through `201,-66`) because the concept centreline was entirely masked by the protected seam and shrine. Runtime data is the source of truth for that refinement.

Focused route/height/collision tests, saved-position recovery, unchanged scatter, resident attribute packing and owned resource disposal passed locally. The production build passed. Actual gameplay captures and visual review are in progress; no visual acceptance or hardware performance claim is made at this checkpoint.

Capture command: `npm run build && node tests/browser/landscape.mjs`. Use `BROWSER=webkit` for WebKit. `CHROMIUM_EXECUTABLE` and `CHROMIUM_EXTRA_ARGS` support an installed CI browser. Output is `tests/browser/out/landscape/`; `LANDSCAPE_LOCATIONS=beach,forest,ruins` restricts iterative views, `LANDSCAPE_CAPTURE_ONLY=1` skips interaction and device-size checks. Renderer draws are held between screenshots while the real frame/input loop keeps running; statistics count one complete original render including post-processing.
