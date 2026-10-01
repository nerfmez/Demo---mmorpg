# Skill Lab

Open `lab.html` locally or `/lab/lab.html` on the published site. The Lab uses the real hero and Vfx renderer on a flat floor; it simulates replay timing and projectiles, not combat damage or game progression.

## Owner workflow

1. Tap **ปรับเอฟเฟกต์** and choose a skill in the shared inspector.
2. Choose **ทั้งหมด**, **ชาร์จ**, **พุ่ง** or **ปะทะ**. Only authored phases are offered.
3. Change sliders, numeric values or colours. **ปรับแล้วลองอัตโนมัติ** restarts the selected preview after the input settles; turn it off to edit a few values before tapping **ลองช่วงนี้**. Existing pause, frame-step, slow-motion and automatic-loop controls also work.
4. Expand a phase to edit its parameters. **คืนค่าช่วงนี้** resets only that section; **คืนค่าทั้งสกิล** resets all values of the selected skill.
5. Values are remembered per skill in this browser. **ส่งออกค่าปรับ** downloads a JSON patch; **คัดลอกค่าปรับ** copies it, and **นำเข้าค่า** restores a patch. These changes affect the Lab only. Applying an approved patch to the game's data is a separate code change.

The inspector docks on the right on wide screens and below the scene on portrait/smaller screens. It keeps the action centered in the remaining space. Storage failures are reported in the panel; exporting remains available. When a skill's authored baseline changes, older cached overrides for that skill are ignored so an update shows its current defaults; exported patches can still be imported safely.

## Add a skill without building another menu

- Skill timing comes from `data/skills.json`. Add/wire a replay adapter by `kind` when needed. Currently `projectile` is wired (Firebolt and Hunter's Shot); other kinds remain disabled rather than pretending to replay them.
- Authored effects go in `data/combat-fx.json.skills.<id>`. Its nested numeric, hex-colour and boolean leaves automatically become controls, grouped by phase/object. Numeric arrays become individual controls. Shared field labels/ranges are in `lab/editor.js` and `lab/tuning.js`; unknown field names still appear automatically.
- Projectiles without their own authored profile use `projectileDefaults`, which exposes scale/glow/trail and impact parameters used by the existing generic renderer. The Lab copies that profile per skill so edits do not affect another skill. No per-skill HTML/form is needed.
- Vfx accepts an optional `{ config }` third argument. The Lab injects an isolated copy; the game uses the original imported configuration. Firebolt meshes read that copy on creation; its bounded particle pool refreshes palette/width without rebuilding GPU resources. Generic projectiles and impacts read the same data controls in the real renderer.
- A preview restart disposes prior cast/projectile/impact meshes using `disposeObject`, retains shared geometry, clears delayed releases and empties existing particle pools. It does not construct another renderer or Vfx instance for every slider change.
- Lab replay speed, cast time, range and collision size overrides are kept separate from authored game rules. Import/storage loaders accept only existing editable paths and valid types; dimensions/timing/speed stay positive, counts and fractions are bounded. Unknown/prototype paths, invalid colours and non-finite values do not reach the shaders.

## Checks and publishing

`node --test tests/core/lab-tuning.test.js` checks isolation, generated controls, import safety, reset/export and persistence/baseline handling. `npm run build && node tests/browser/lab-editor.mjs` checks actual shader uniforms and arrow scale through the UI, isolated impact, per-skill switching/reload, export/import, section/all resets and portrait layout. Repeat with `BROWSER=webkit` for the owner's Safari engine. Review screenshots in `tests/browser/out/lab-editor/`.

`tests/browser/firebolt-lab.mjs` remains the focused visual sequence and cleanup probe. `lab-preview.yml` runs both suites in Chromium/WebKit and publishes its `lab-dist` artifact. Pages publishes the main game at the root and this effects branch under `/lab/`. `lab-source.json` identifies the exact branch/SHA served; verify it before sharing a live review link.
