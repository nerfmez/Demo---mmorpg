# Hero base body (Meshy)

Bare body for a skinned hero. Hair, face, clothes and gear will be added by code (see
docs/HANDOFF.md). The game does not use it yet.

- `concept_tpose.png`: T-pose concept from `docs/reference/hero-character-sheet.png`
  (Meshy image-to-image nano-banana, task 01a0e743-cc84-74f7-8490-12e6277fa939).
- `base_rigged.glb`: Meshy 7 image-to-3d, no texture, T-pose, remeshed to 6,289 tris
  (task 01a0e745-4bf5-7769-a5e4-583f6480a5e3), then Meshy auto-rig at 1.75 m
  (task 01a0e746-d8ad-721b-b174-cc1992231854). 24 bones, Mixamo-like names: Hips, Spine,
  Spine01, Spine02, neck, Head, Left/Right Shoulder, Arm, ForeArm, Hand, UpLeg, Leg, Foot,
  ToeBase. Bone positions are in centimetres under the armature's 0.01 scale.
- `walk_armature.glb`, `run_armature.glb`: the free walk and run clips from the rig task.
- `pose_test.png`: rest, walk, run and a hand-bent pose rendered with the game's toon ramp.
