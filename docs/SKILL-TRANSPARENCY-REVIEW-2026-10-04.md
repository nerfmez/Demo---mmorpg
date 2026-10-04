# Skill artwork transparency — local UI review

**Follow-up:** [local premerge WebKit review and 512px delivery exports](PREMERGE-WEBKIT-REVIEW-2026-10-04.md). The 1254px outputs below are retained masters; the later review changes delivery sizing and completes the browser-engine checks. This historical record preserves the earlier artifacts and their limits.

This follow-up changes only the 17 skill PNGs on `codex/ui-live-integration-20261004`, based on local UI commit `5b321e051458aafddbef1cd01bc5c7f339c603e7`. It is a local review delivery, without a push, merge or public deployment. The accepted Skill Tree source, gameplay, VFX, saves, HUD anchors, equipment/material art and UI layout code are unchanged by this follow-up.

## Findings and acceptance criteria

All 17 original skill files were fully opaque RGB 512×512 images. Their navy/purple square backgrounds were baked into the PNGs. The central `.art` wrapper has no background; the workspace deliberately retains its navy tile/card surfaces. Those tile surfaces are independent of the baked background.

Criteria: remove the baked square and its ambient texture; retain the actual illustrated subject, pose, composition, internal dark shading and deliberate VFX; preserve transparent gaps and soft edges; inspect on ivory and navy at large and actual game sizes; verify equipped slots, library, movement and HUD at 1440×900 desktop and 844×390 touch viewports. Preserve the two distinct windows, world gap, sockets, ownership/requires feedback and existing equipping behavior.

The first Slash proof was reviewed on navy, ivory and checkerboard before the other edits. Each original was visually inspected before editing. All 17 were edited through the supported `image_gen` reference-image tool with true transparent-background output. No scripted pixel removal, chroma-key or color-threshold mask was used. Generated original outputs were retained and copied unchanged into the local assets. The original 512px inputs are retained separately for reversal.

## Visual review

The full ten-image gallery compares each original with its transparent output on ivory/navy and shows 135, 46, 42 and 29px versions. It was inspected directly with image viewing tools, as were all twelve in-game screenshots: equipment, skills page 1, skills page 2, movement, mods and materials at both viewports. The final file/hash index identifies the exact delivery artifacts.

The squares are removed. Sword/arrow/boot/character silhouettes, the chained orbs, shield and impact, ice ring, spring basin, poison puddle/vapor, ghost wolf, Hex eye/sigil and Blink afterimage remain recognizable and in their original compositions. Detached shards, sparks and deliberate trails remain visible. Dark foreground armor and spell shading were retained. The new art composites on the workspace card surface without a separate opaque square. Attached coins and lines remain distinct, and the selected object/actions remain visible within the landscape viewport. No essential scrolling was introduced.

These are generative reference edits, not lossless foreground extraction: fine brush texture, tiny edge particles and glow treatment differ from the inputs. Fine native-resolution edges contain some speckled luminous pixels, particularly around dense frost/impact effects; no conspicuous boxed matte or major silhouette defect was seen at the reviewed UI sizes. Dense frost details and poison vapor lose detail at 29–42px. Existing small secondary text and the low-detail game avatar remain limitations of the UI/model, independent of the transparency fix. Locked/unmet images remain deliberately muted by the existing ownership/requires styling.

The final desktop MP4 is H.264, 1280×720, 30fps, 18.5s; the phone MP4 is H.264, 844×390, 30fps, 5.633333s. Both record the actual game controls with the edited PNGs. The desktop sequence includes insert, replacement, removal, incompatible-type feedback and a compatible but stat-inactive attachment. The phone sequence inserts and removes using CDP touchStart/touchEnd input with coarse-pointer emulation active. Its final state retains all 22 owned coins, returns to five attached coins and has zero unfinished flights.

Review method: inspected both native contact sheets and unobscured decoded frames at desktop 3.28s (insert flight), 8.92s (simultaneous outgoing/incoming replacement), 10.90s (remove flight), and phone 1.94s (insert flight), plus the final seated/removed states in the sheets. Coin travel, rotation, persistent sockets and activated connection lines are visibly represented in the sampled sequence; the artwork remains legible throughout those samples. The sheets contain diagnostic change rectangles; the actual MP4s and extracted frames do not. Continuous visual playback and physical-device review were not performed. Exact hashes appear in the delivery artifact index.

## Technical verification and limits

- All 17 outputs are RGBA PNGs, 1254×1254, with alpha range 0–255, fully transparent pixels and partially transparent edge pixels. `alpha-audit.json` records actual counts and pre/post hashes.
- The build copies the exact reviewed PNG bytes. All 59 gear/material files match their previous hashes.
- Four focused raster tests passed: complete 76-ID coverage, registered-only fallback/path rules, recorded native dimensions/RGBA skill contract and exact retained hashes. The existing browser decode helper now checks manifest dimensions instead of assuming every file is 512px.
- Production build and whitespace diff check passed. The focused actual-game capture verified all 17 skill IDs across library/movement views and all 17 in HUD buttons at both viewports. Phone pointer emulation was coarse/touch; desktop was fine. All images decoded within the unchanged HUD bounds, with no page errors or failed image requests. Normal HTTP 304 cache responses were corrected in the capture harness and the check rerun successfully.
- Previous interaction tests remain scoped evidence for the unchanged UI code; they were not rerun or relabelled as tests of this asset-only follow-up. No new core/data/save rule was introduced.

The supported editor returned 1254px outputs. The transparent skill set is 27,358,624 bytes, versus 6,199,062 bytes for the opaque inputs. If all 17 are decoded as RGBA simultaneously, their raw pixels total approximately 102MiB, compared with 17MiB at 512px, excluding browser overhead. There was no new preload or resource ownership change, but transfer/decode cost is materially larger. Actual iPad/Safari performance and the required premerge WebKit/device review remain pending. The high-resolution edited sources are delivered for review; they have not been claimed production-ready on hardware.

Drive is the authorized deliverable destination. Files are saved in a new subfolder under the prior live-UI review folder without overwriting earlier deliveries or changing share permissions. Folder membership and byte sizes are checked after upload; link access by other people is not asserted.
