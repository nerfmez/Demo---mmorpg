# Visual quality workflow

This project workflow applies to all visual, UI and animation work. It is an ordinary repository document linked from `AGENTS.md`, so an owner or future contributor can inspect and reuse it. Its effectiveness depends on contributors following it; the document does not guarantee the quality of a future result.

## Before implementation

Identify the relevant reference, user intent, target viewport/device and runtime context. Define observable acceptance criteria before building: what should draw attention, what must remain readable, how objects relate spatially, and what an animation should communicate at normal speed. Record preservation constraints, including accepted art, gameplay, timing, save behavior and HUD anchors. Resolve conflicting criteria explicitly.

## Prototype before integration

Make the smallest prototype that exposes the proposed visual behavior. Show it unobscured, at normal speed, with enough surrounding context to judge it. For animation, include the relevant start, sustained motion, transitions and stop. Slow motion and isolated still frames may support diagnosis but do not replace normal-speed review. Label an interim or specifically requested rough result honestly.

## Separate creation from visual review

After creating an artifact, perform a candid visual review of the actual output against the criteria. Do not treat passing tests, preserved hashes, unchanged channels, implementation effort or a score as aesthetic approval. Name visible faults with precise screenshots, frames or timestamps where possible. Review hierarchy, spacing, focus, silhouette, readability, material/edge treatment, object visibility, fit and motion as applicable.

Major visible defects block a completion claim even if technical checks pass. Fix them or clearly deliver a labelled interim result with the unresolved defect. A subjective score can summarize an opinion; it is neither a substitute for explicit pass/fail criteria nor a guaranteed quality threshold.

## Review the integrated result again

Re-review in the actual runtime after integration, and after changes to timing, input, layout, compositing or the surrounding scene. Check the intended device sizes and normal interaction pace. Preserve technical checks as separate evidence for behavior and safety. A good prototype does not establish the quality of its integrated version.

Inspect the exact final artifacts that will be delivered, after the last relevant change. Record their identity so a later reviewer can distinguish them from earlier captures. Disclose what was actually inspected: sampled frames, a contact sheet, normal-speed playback or physical device review. Never imply continuous visual playback or device testing that did not occur.

## Per-delivery review record

Save a short human-readable review record with:

- Source revision and exact artifact filenames, preferably hashes.
- The reference and observable acceptance criteria.
- Views, viewports and animation frames/timestamps inspected, plus the review method.
- Faults found, what was fixed, and whether each criterion passes or remains unresolved.
- Remaining visual and technical limits, and an honest final/interim status.

## Concrete lesson: BodyX

An upright idle fix did not cure BodyX's crouched gait, backward stiff torso, weak weight transfer or stop-induced pelvis rise. Testing and channel/hash preservation established some technical properties; they did not establish motion quality. Review the whole relevant movement sequence at normal speed, including gait, torso response, weight transfer and stopping. Do not infer a corrected sequence from a corrected idle pose.
