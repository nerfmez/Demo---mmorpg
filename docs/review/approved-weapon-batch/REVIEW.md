# Approved weapon batch review

Game candidate: `83f9bd89ac02106f1b9758cd4fb4a43c67fd6934`, based on main `f19aee9f6625188cef1c89adf82d28a4a25b0cc5`. Follow-up changes contain review artifacts and a capture-only correction that lets portrait scenes render while suppressing repeated field draws. Asset identities and every source transform are recorded in `docs/WEAPON-MODEL-PROVENANCE.json`; all source GLBs remain byte-for-byte identical to the approved originals. The previous 19 are unchanged.

Criteria: approved geometry/colors/textures; correct base-ID binding; uniform game scale and source handle/midshaft seated in the palm; two-hand/offhand support; readability at the existing camera; equipment preview; no catalogue preload or repeated downloads.

Inspected on 2026-10-07: source gallery and all 19 additional models equipped at the actual camera angle; representative front/side views; idle, windup, hit and recovery frames for replacements, staff, bow, axe and wand; default game distance; Oathblade + Wisp Stiletto in both hands; equipment at 1180x820 and 1024x768 touch viewports. Screenshots were inspected directly and in the attached contact sheets. Capture rigs were positioned explicitly after model arrival; portrait draws remain enabled. Earlier blank harness captures were discarded.

Observed: preserved source silhouettes and color maps, no wrong-model/fallback substitutions in all 38 exact-geometry binding checks, and no detached grip in inspected views. The measured fitted source anchor meets the right palm within floating-point error; the Oathblade/Wisp offhand pair also meets the left palm. Source bows retain their original strings. Meshy diagonal/vertical sources are fitted once into the existing +Z shaft and Y bow-limb convention; no geometry, texture resolution or stats/save changes.

Validation: build, 393 pre-existing core tests, 124 tooling tests, and 26 focused final asset/hold/gear/save/transform tests passed. The browser catalogue check passed all 38 bindings and selected viewport/action/walk captures; its resource/save completion and required Chromium/WebKit CI status are reported in the PR. Do not interpret screenshots as a full browser-suite pass.

Asset budget: 165,372,244 bytes added, 200,870,796 bytes for all 38 weapons. Files retain embedded 2K maps and original triangles. Loading stays on demand: one starter GLB at cold start; equipment/portrait demand loads only selected hands, with cached reuse. This remains the existing toon shading contract: base color, normal and emissive are used; metallic/roughness-only source maps are not sampled. No quality-reducing conversion, generation or paid API was used.

Decision: ready for review within the sampled views. Normal-speed continuous playback and physical iPad performance were not inspected; action evidence is selected runtime frames. Required CI and parent-coordinated merge/deploy remain separate release gates. PRs #102/#103 are outside this branch.
