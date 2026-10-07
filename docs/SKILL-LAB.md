# Skill Lab

Open `lab.html` locally or `/lab/lab.html` on the published site. The Lab uses the real hero and Vfx renderer on a flat floor; it simulates replay timing and projectiles, not combat damage or game progression.

## Owner workflow

1. Tap **ปรับเอฟเฟกต์** and choose a skill in the shared inspector.
2. Choose **ทั้งหมด**, **เตรียม / ชาร์จ**, **ฟัน / พุ่ง** or **ปะทะ**. Only authored phases are offered.
3. Change sliders, numeric values or colours. **ปรับแล้วลองอัตโนมัติ** restarts the selected preview after the input settles; turn it off to edit a few values before tapping **ลองช่วงนี้**. Existing pause, frame-step, slow-motion and automatic-loop controls also work.
4. Expand a phase to edit its parameters. **คืนค่าช่วงนี้** resets only that section; **คืนค่าทั้งสกิล** resets all values of the selected skill.
5. Values are remembered per skill in this browser. **ส่งออกค่าปรับ** downloads a JSON patch; **คัดลอกค่าปรับ** copies it, and **นำเข้าค่า** restores a patch. These changes affect the Lab only. Applying an approved patch to the game's data is a separate code change.

The inspector docks on the right on wide screens and below the scene on portrait/smaller screens. It keeps the action centered in the remaining space. Storage failures are reported in the panel; exporting remains available. When a skill's authored baseline changes, older cached overrides for that skill are ignored so an update shows its current defaults; exported patches can still be imported safely.

## Add a skill without building another menu

- Skill timing comes from `data/skills.json`. Add/wire a replay adapter by `kind` when needed. Currently `projectile` (Firebolt and Hunter's Shot), `melee_arc` (Slash) , `melee_nova` (Whirl Blade), `ground_area` (Stone Burst) and `summon` (Spirit Wolf) are wired. Other kinds remain disabled.
- Authored effects go in `data/combat-fx.json.skills.<id>`. Its nested numeric, hex-colour and boolean leaves automatically become controls, grouped by phase/object. Numeric arrays become individual controls. Shared field labels/ranges are in `lab/editor.js` and `lab/tuning.js`; unknown field names still appear automatically.
- Projectiles without their own authored profile use `projectileDefaults`, which exposes scale/glow/trail and impact parameters used by the existing generic renderer. The Lab copies that profile per skill so edits do not affect another skill. No per-skill HTML/form is needed.
- Vfx accepts an optional `{ config }` third argument. The Lab injects an isolated copy; the game uses the original imported configuration. Firebolt meshes read that copy on creation; its bounded particle pool refreshes palette/width without rebuilding GPU resources. Generic projectiles and impacts read the same data controls in the real renderer.
- A preview restart disposes prior cast/projectile/impact meshes using `disposeObject`, retains shared geometry, clears delayed releases and empties existing particle pools. It does not construct another renderer or Vfx instance for every slider change.
- Lab replay speed, cast time, range and collision size overrides are kept separate from authored game rules. Import/storage loaders accept only existing editable paths and valid types; dimensions/timing/speed stay positive, counts and fractions are bounded. Unknown/prototype paths, invalid colours and non-finite values do not reach the shaders.

## Checks and publishing

`node --test tests/core/lab-tuning.test.js` checks isolation, generated controls, import safety, reset/export and persistence/baseline handling. `npm run build && node tests/browser/lab-editor.mjs` checks actual shader uniforms and arrow scale through the UI, isolated impact, per-skill switching/reload, export/import, section/all resets and portrait layout. Repeat with `BROWSER=webkit` for the owner's Safari engine. Review screenshots in `tests/browser/out/lab-editor/`.

`tests/browser/firebolt-lab.mjs` remains the focused visual sequence and cleanup probe. `lab-preview.yml` runs both suites in Chromium/WebKit and publishes its `lab-dist` artifact. Pages publishes the main game at the root and this effects branch under `/lab/`. `lab-source.json` identifies the exact branch/SHA served; verify it before sharing a live review link.

## Physical attack replay

Melee skills copy `meleeDefaults` per skill, including `_labPhases` display labels. The same generated inspector exposes prepare, swing and impact controls without a skill-specific menu. Slash supports automatic 1–2–3 combo or a chosen step; Whirl Blade uses the nova adapter. Contact occurs at `castTime`, checks the dummy against range plus its radius and the authored arc, and appears once per replay. Misses retain the swing but have no contact. Browser tuning remains Lab-only until an approved exported patch is authored in game data.

`render/melee.js` creates original tapered traveling cut ribbons and a fixed-capacity contact-shard pool. `BladeTrail` follows the real posed weapon endpoints. Clearing/changing previews cancels pending contacts and clears trail history. Mesh geometry is shared; per-cut materials are disposed. Physical hit events carry optional cosmetic `skill`/`attackKind` metadata, and melee contact shake/hit-stop reads the profile in both Lab and game.

`node tests/browser/melee-lab.mjs` captures the real rig in Chromium; repeat with `BROWSER=webkit`. It checks authored timing, combo direction/weight, range/arc misses, isolated phases, shader controls, portrait layout, trail visibility, particle lifetime and geometry stabilization. Physical effects branches run this focused capture and the shared editor checks; other effects branches retain the Firebolt capture.

## Remaining physical skills

All five physical-element skills have data profiles and shared generated controls. `hunter_shot` uses the `arrow` renderer: a real wood/metal arrow, a narrow procedural speed streak, a short bow-draw line and a directional surface contact. Its `impact` event carries `vx/vz`; `hitSpark` skips the duplicate arrow contact. Scale and conversion/multiple-projectile behaviour remain supported.

Stone Burst uses the existing cast time plus area delay. Its terrain-conformed warning reveals radial cracks within the real radius; the impact pops solid faceted stones, then bounded reused chips and a little short dust. The Lab's ground adapter keeps the marker and cosmetic burst separate from contact. Spirit Wolf reuses one real monster rig in Lab, previews summoning, pursuit, the existing .25 s bite wind-up, one bite and fade. It runs presentation only, with no damage or persistent summon AI. Clearing cancels the pending ground burst and hides/reset the summon. Core `allyStrike` is emitted only after an actual ally bite hit; optional hit metadata uses the ally's source position.

`tests/browser/physical-lab.mjs` covers bow draw/flight/contact, area timing and footprint, generated stone controls, real summon contact, isolated phases, portrait layout and cleanup for each adapter. It records renderer screenshots/sequences; repeat with `BROWSER=webkit`. The physical Lab workflow runs this alongside melee and the shared editor checks. Slash's authored profile preserves every value from the owner's `skill-lab-slash.json`; other skills have their own profiles.


## New skill/mod prototypes

Open `lab.html?skill=charged_shot` for hold/release bow charging, or select any of the
14 new skills under settings. New prototypes run the actual pure combat rules on an
isolated flat floor; existing accepted skills retain their presentation adapters.
Pick up to two compatible owned trial mods in the Lab, remove a chip to change it,
and use pause/frame step as supporting inspection. Counter Stance also has a simulated
incoming hit button. Wall preview places the wall in front of the dummy, never inside it.

The **ทดลองในเกม · ไม่บันทึก** link opens `?fresh=1&skillSandbox=1&quality=low`.
A trial-only selector changes skill slot 1 and its required weapon/shield; the skill
book contains all skills, movement skills and 34 mod coins. Slot movement mods under
**เคลื่อนที่**. This character has no save slot and does not grant permanent unlocks.
Crafting recipes and normal progression acquisition are intentionally undecided.

New visuals are interim authored prototypes. Their footprints, timing and cancellation
are reviewable; they have not received owner approval as final animation/VFX.
`tests/browser/frontier-content.mjs` uses the production build to capture Lab and the
actual game at desktop, iPad-sized touch and landscape phone sizes. Run build first.
