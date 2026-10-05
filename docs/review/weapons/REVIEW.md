# Held weapon runtime review

Final runtime source: `50658ef` (subsequent changes only proof/tests/docs). Source GLB hashes and exact revisions: [provenance](../../WEAPON-MODEL-PROVENANCE.json). Measurements: [all 19 and repeated switching](weapon-models-measurements.json), [loading, grip and largest completed light pair](weapon-loading-measurements.json).

Inspected actual Chromium software-rendered pixels, not Blender previews: all 19 desktop equip closeups at 1180×820 (460×460 crop, zoom 0.3, facing 0.6), Tusk Blade/Fang Dagger dual wield and Beetle Maul/Tower Shield; priority iPad/mobile viewport frames; Rusty/Tusk Greatblade/Tide authored hit phases; and Fang Bow phases. Individual views and labeled contact sheets were inspected. The first curated closeups came from `47941b6`; their single-hand geometry/materials remain identical. After attachment changes, final full-frame captures at 1024×768 were inspected for zero-origin Fang Bow native hit, Spore Staff arriving during an active cast, and Wolfbite/Spore Wand right/left palm seats. Complete capture output is produced by the CI browser fixture.

Criteria: exported geometry intact; handle meets hand; complete silhouette; no detached handle/parts, giant scale or excessive body clipping; readable material colors/edges. Sampled views pass. Imported bows needed removal of the procedural 13 cm seat offset; imported offhands needed the existing mirrored palm center. Final measured grip-origin distance is below 2e-14 m. This measures the authored attachment origin; pixels additionally confirm handle placement. Large authored greatblades remain large. Staff/bow heads can overlap the upper body in front-oblique carry views. Decorative spores remain present. No mesh corrections or reductions were necessary. Some closeup swing-tip crops exclude the tip at the crop boundary; full-frame integration checks do not report game clipping.

Functional Chromium suites pass equip/unequip/switch/reload, valid capped-level save compatibility, ammo-consuming bow shot, melee phases, walk/stop, offhands and desktop/iPad/mobile viewport checks. Delayed completion preserves the active animator/action/progress, obsolete completion retains current rig UUID, and missing/failed models retain fallback without repeated fetches. Three warm switch rounds stabilize at 130 geometries/59 textures/72 programs. Largest completed light pair carries 67,712 source triangles (135,424 with opaque outline passes); the sampled whole scene has 222,286 triangles/69 draws. Cold start fetches one starter weapon, 1,335,312 bytes. These are fixture measurements, not physical-device performance.

Limits: still-image and sampled-phase inspection; no continuous normal-speed video review or physical iPad/phone FPS test. Local WebKit lacks host libraries; CI engine results and required premerge checks are separate. Source materials use game toon lighting rather than Blender PBR. Parent approval remains required before merge/deploy.

## Curated artifact identities

| PNG | SHA-256 |
| --- | --- |
| `bow-zero-origin-native-hit.png` | `ab288f48a5287afe3e2aa0197b4b3a75ff7da99110ec1050157a8442a99b7165` |
| `dual-wield.png` | `0f0065edef6e7d36edca4dbf507df63d4c44359dacd5d82e80e67bd801b11db6` |
| `fang-dagger-r4.png` | `cb6c55e8326e21d3faba4002e0289c3fb6c9cd0988a51a250ef5ffd1b9447323` |
| `frontier-kris-r1.png` | `87e05d1788dad59c96dc10f4e7de48e71d7c1de6411691951e01e94157144922` |
| `largest-completed-light-pair.png` | `734563c5296b24b44201785fb489e88b3938b0298dcff8fc93785765b68cba61` |
| `maul-shield.png` | `dc9cfeda9780a76c1a6c6379ba2f80df892550c63d91632bbca2140541f2c5d1` |
| `rusty-remake-r1.png` | `f93b2db99e39fec2ac9ac99c6b629698ca1464c0b8eb3be5461bbcb66e656da4` |
| `staff-load-preserves-active-cast.png` | `3b064c4e9ca39af74faf9167cc3c2702b2dd74adb527c94e574757d06a960f77` |
| `tide-remake-r1.png` | `b5a531e0264411cb5e1fa007227c444d3d7232a28e1d4a766c6a93cbf325c6c9` |
| `tusk-greatblade-r4.png` | `ae366e1b3829c8637334488bd451fba1b7db1b8bda027d656dd8aaa55e2e08d9` |
| `wolfbite-r4.png` | `b103634debee4c993c4fe07c92dc44c4631ffa3f95657e53650b6e9698b86db2` |

## Owner bug-fix bundle after `b577765`

Inspected the exact new game frames below: iPad 1180×820 and phone 844×390 equipment details show a reachable top Close, stone/gold names and owned/required counts. The initial native scrolling/action test used the isolated Game/Panels harness, including repeated bag/equipped/workbench entry; it omitted the main entry point's document touch guard. See the live finding below. The potion frame is an actual native two-finger drink while moving; the result JSON records unchanged joystick identity/vector and one consumed item.

Apprentice Staff's unchanged source GLB is seated at its local Z +0.585 m midpoint through a per-instance −0.585 m translation. Inspected actual game full-body idle, walk and cast frames: hand grips the shaft approximately centrally, all parts remain attached and no excessive clipping/giant scale appears. Ordinary body depth overlap remains in the oblique camera. Tide/Spore already have central origins and were not shifted. The pose/IK/timing data and source GLB bytes are unchanged. Review covers sampled frames, not continuous playback or physical-device FPS.

Both user-supplied Library JPEG transfers failed; these results do not claim a match to an unseen picture. Criteria come from the owner's explicit text requirement and observable game interactions.

| New PNG | SHA-256 |
| --- | --- |
| `details-touch-ipad.png` | `63cb9e61933023d9e3795e00cc78658266ea694e8499dd9e0e0e63d656afd619` |
| `details-touch-phone.png` | `578dccbdd49c2f7d6821f3480663c502cb4d02cfebb9810c49797c976f6d700d` |
| `potions-two-finger.png` | `38284d26809ad788eaab1bd9c047dd994da6fa090a67bd9fe6a683474de41611` |
| `apprentice-midpoint-idle.png` | `c8ecadb2e41e6e6f5ef437ca0f315e792f866b4f7c55827ffab4a5b131942bf5` |
| `apprentice-midpoint-walk.png` | `12d4e7109b0a7db5120b43ccabff97bd9305f00a2d8a93fd528dd3036ce950e1` |
| `apprentice-midpoint-cast.png` | `7791c8994627169d4c26077b8873bbbe38ab426cf666dc6604515c1523129169` |

## Published release and document touch guard

PR75 merged as `8b69319647aeb24ec8d775ad9b39e6462315576b` after all 11 exact-head checks passed. [Pages run 37343801793](https://github.com/nerfmez/Demo---mmorpg/actions/runs/37343801793) succeeded, including the published WebKit Dreamloop and route purchase/reload checks. All 19 published GLBs match the provenance byte counts and SHA-256 values (35,498,552 bytes total). Actual published Chromium checks passed all 19 geometry/equip paths, offhands, authored attacks, bow shots, save/reload, midpoint grip, cached requests and three warm resource rounds; the native two-finger potion check also passed. These probes used isolated fresh saves and this execution environment's configured proxy; they are not physical-device performance measurements.

The actual published details swipe stayed at scrollTop 0 despite correct descendant CSS. `main.js`'s document `touchmove` handler still cancelled gestures outside its legacy scroll-container allowlist. The narrow follow-up adds `.atelier-dialog` to that allowlist; multi-touch remains blocked. `details-game-touch.mjs` loads the actual built entry point and tests this handler, native Chromium swipes, visible Close, owned/required costs and real upgrade payment at both viewports. WebKit uses the document-event cancellation contract plus DOM scrolling and actual taps; it does not claim native WebKit touch swipes.
