# HairSample base body in the game

The default player now uses the approved live Character Studio V6
`HairSample_Male-beta` master with its complete underlying skin. Face, hair,
skin attributes, inverse-bind matrices and retained texture bytes are unchanged.
Default customizer controls are scale 1, shoulder width 0 and torso width 0.
The user's browser-local presets were not recovered.

The default GLB scene contains the base skin, protected scalp, face, hair and
rig. Its 7,112-triangle skin has no hoodie/pants/shoe primitives. Optional garment
geometry is in a separate `RuntimeWardrobe` scene and is attached independently
to the cloned body's skeleton. The game selects garment palettes from the
existing look and gear; existing raised armour, boots, helms, scarf, charms and
weapon geometry remain controlled by the equipment system. Hiding the wardrobe
does not remove the torso or limbs.

`HumanoidAnimator`, gait tables and action keys/timing remain unchanged. Existing
movement speed drives the existing walk/run blend, including analog joystick
motion; no sprint input or movement rule was added. Grip fitting changes only
the attachment/rest basis of the native right hand. The weapon +Z socket still
drives existing aiming, cast effects and trails. NPCs, procedural/loading
fallbacks and the existing opt-in `?hero=vrm` path remain available.

Save version 4 and appearance/equipment fields are unchanged. Native face/hair
use the approved fixed HairSample geometry; legacy hairstyle fields remain in
saves. Female source is preserved in the recovered source bundle; no new gender
selector or Character Studio changes are included.

## Source and reproducibility

Live source: https://hairsample-character-studio.ballboy-lnw.chatgpt.site,
V6 commit `c268df7782d4ec05779e87eb8a14bc784b49921a`.

Authorized recovery ZIP:
https://drive.google.com/file/d/1EttBZYEjw6jQl-qj3p823ATdXhCmmfEc/view
SHA256 `3b3ad9276542acbcb257ecd4488b85d13c7544ac9fc868ee094de849cafe0478`.

Male original SHA256:
`4af2194f90ba846f3b13c00b50b14262419062d2171d17de922bcce2f89979c7`.
Actual generated live female SHA256:
`7c2c7df754b5ccc6982ac0dc9f598383927dc9f026de5672f8de488b08cbfba5`.
Both original files and all recovery-manifest payloads were verified.

Rebuild:
`node scripts/prep-hairsample.mjs /path/HairSample_Male.vrm public/models/hairsample-male.glb`.
The exact neutral source module and mapping are in `assets/hairsample/`.
The preparation step drops unused face-expression data/images and batches
identical-material index lists; it does not resample textures or reconstruct
geometry. The game GLB is 13,652,740 bytes, 24,858 triangles including all optional
garments, 15 primitives. Its SHA256 is
`c85fe5847d23cf2028974c01413b76f2ec074c2c77e0558e1346e5bb2fc5cec7`.
`assets/hairsample/derivative-proof.json` records the source comparison.
VRoid master metadata declares CC0; the earlier Quaternius label refers to a
casting motion donor and is not this character's provenance.

The approved V4D cast and accepted Fireball sources remain preserved in their
original Drive inputs and STOP checkpoint, for later work. New locomotion
authoring is stopped; no experimental motion code is included.

## Review and limits

Early actual-game captures verified complete body, attached hair, separated
wardrobe, existing movement and cast, and finite weapon transforms. A two-scene
GLTFLoader association issue was found and fixed by resolving the native stable
bone/face names when scene associations omit them.

Focused final captures use `scripts/model-only-review.mjs` (desktop and 844×390
landscape touch emulation) and `scripts/hairsample-equipment-review.mjs`
(unclothed front/side, staff, bow, sword and armour changes). Fixture camera zoom
is temporary for review; production camera code is unchanged. Frames are sampled
from the actual game at normal simulation speed, then encoded at 15 fps.

Inspect the exact final captures separately from tests. Agent visual inspection
uses sequential stills; continuous playback and physical-phone performance are
not verified. The legacy `favicon.ico` 404 is recorded separately. CI owns full
desktop/iPad Chromium and WebKit smoke checks. This document does not imply
owner approval, merge or deployment.
