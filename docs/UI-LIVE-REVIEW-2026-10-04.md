# Two-window live UI delivery review — 2026-10-04

Status: ready for owner review; no UI merge or deployment is authorized or performed. This is a visual opinion with explicit criteria and limits, separate from technical test results.

## Artifact identity and method

Runtime source: `2d11f1a`, branch `codex/ui-live-integration-20261004`, rebased onto merged icon release/main `62373780fac1a007f0939135497e91e2507536bc`. The isolated built review checkout has an identical tracked tree at `44844b7`. Full hashes and byte counts are in the delivered `artifact-manifest.json`.

Reference: the user's approved two-window prototype and 76 painted PNG package; crafted anime MMO framing, equipment left/bag right with visible world between, visual skill objects with real attached mod coins, compact details on demand, landscape through 844×390. No new generated images or invented mod/economy rules.

All eight final PNGs below were inspected at their actual desktop (1440×900) and phone-landscape (844×390) sizes. These are the actual game root, using a test-only character and the repository's existing paused-world capture helper. The final desktop clip is 20.7 seconds, H.264, 1280×720 at 30 fps. The phone clip is 5.9 seconds, H.264, 844×390 at 30 fps.

The clips preserve normal event timing. Review used extracted frames/contact sheets, not claimed continuous playback: desktop insertion 3.3–5.1 s, replacement and seating 8.5–11.5 s, return 11.2–14.0 s, inactive attachment at 19.2 s; phone frames sampled throughout at 6 fps, with enlarged frames at 2.15 s (flight) and 3.0 s (seated). No physical iPad or Safari session was observed.

| Delivered artifact | SHA-256 prefix |
|---|---|
| equipment-desktop.png | `f14ad67ac88eb640` |
| equipment-phone.png | `fbe9e5ef5e6b4257` |
| skills-desktop.png | `8854ad714a50b740` |
| skills-phone.png | `4a2f9ee3794eb865` |
| mods-desktop.png | `26cec065f7034eec` |
| mods-phone.png | `73a5f8cada9ef842` |
| materials-desktop.png | `96dff1b23e1e4471` |
| materials-phone.png | `ac2b7049927b3658` |
| equip-motion.mp4 | `a05841828b18a330` |
| equip-motion-phone.mp4 | `7f3b46935016c5c6` |

## Criteria and candid review

| Criterion | Review result |
|---|---|
| Distinct equipment/loadout and bag/library windows | Pass in inspected views. Independent edges and shadows, with an approximately 90 px desktop / 55 px phone world gap. They do not read as one joined table. |
| Avatar/art objects and selected action hold focus | Pass. The full-body avatar and equipment objects dominate the left equipment window; large painted skill art and attached coins dominate the loadout. Gold selection frames lead to the compact action shelf. Existing HUD remains peripheral. |
| Crafted materials and selective ornament | Pass for this brief. Navy textured metal headers, ivory interiors, restrained double edges and engraved coins give depth. This remains a UI opinion, not a guaranteed style approval. |
| Readable phone actions and no essential scroll | Pass in inspected 844×390 frames. Selected names/stats and actions are legible; library names move to the selection shelf. Small secondary labels remain a limitation. |
| Actual art, ownership, capacity and compatibility visible | Pass. Painted PNGs resolve. Library coin faces are 35 px on phone; seated coins are 31 px. Slot counts come from actual state. Red/blue/green mean power/mechanics/support. Type mismatch and unmet stats remain distinct. |
| Insertion, replacement and removal communicate attachment | Pass in sampled sequence. Library-to-socket travel rotates, the arriving socket hides its seated object until landing, and the connection activates. Replacement ejects the old coin and seats the new one; removal returns the coin to the library. Normal-speed feel still benefits from owner playback. |
| No major visible clipping or unintended obstruction | Pass in these final views. The selected phone shelf was enlarged after a button crossed its border. No essential action is clipped in the delivered screenshots. |

## Faults found and fixed

- Early phone review: 27 px library coins and dominant gold rims made engravings/role faces weak. Enlarged to 35 px, increased semantic face contrast and enlarged seated coins to 31 px.
- Earlier equipment review: character caption touched/overlapped the avatar's head. Reduced portrait framing height; removed tiny decorative captions on short landscape layouts.
- Enlarging selected phone text exposed a bottom action crossing the shelf border. Increased the shelf to 88 px and adjusted the skill windows' bottom inset, then recaptured and re-inspected.
- Initial phone recording was stretched into the recorder's stale desktop dimensions. Set the viewport through the native browser controller and re-recorded at exact 844×390. The stretched take is not a delivered artifact.
- A completed invalid-feedback shake remained in animation tracking and consumed the next Escape. Finished animations now leave the tracking list; the focused regression passes.
- Worn/external item selection could remain behind an incompatible filter or on the wrong page. Selecting a worn object clears the filter; external inspection opens its containing page. Opening skills now aligns the library with the selected equipped slot.

## Remaining limits

The avatar uses the existing low-detail game model, whose geometry/material finish is less polished than the painted item art; character refinement is outside this request. Secondary labels at 844×390 are small, and a coin's full name/details require selection. Fine engraving differences and motion feel need owner judgment on the intended device. The gold trail is relatively subtle on ivory surfaces. Browser tests establish behavior, not aesthetic approval or hardware performance.

Desktop and phone video review is frame-based; no continuous-playback claim is made. Physical iPad Safari/WebKit smoke and the owner's visual review remain before any UI merge. The persistent workflow reduces omissions when followed; it does not guarantee future quality.

## Separate technical evidence

Final combined build: pass. Actual-game Chromium touch/save/layout flow: 40 checks pass with no JavaScript/console errors. Targeted skills, crafting, save and workspace core checks: 32 pass. Temporary avatar resources stabilize at 234 geometries / 15 textures through six gear changes. Existing iPad UX smoke is recorded separately in `ux-tests.log`. Accepted SkillTree, core/data, renderer/VFX, HUD/input and icon-release assets/routing are unchanged from merged main; see `source-audit.json`.
