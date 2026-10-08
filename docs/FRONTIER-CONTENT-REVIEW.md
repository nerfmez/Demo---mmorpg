> Historical prototype review below (old PR102 head). For the current crafting integration and validation, see [PR102 integration review](FRONTIER-INTEGRATION-REVIEW.md) and [acquisition table](FRONTIER-ACQUISITION.md).

# Skill/mod prototype delivery review — 2026-10-07

Status: playable prototype for owner review; crafting recipes and final balance are deferred.
No merge or shared deployment is claimed. This expansion is separate from equipment PR #101.

Base: `4d1ce5c75a03a037a18df206f3eac224ded005b0`, tree
`adb4a70337282f3068bd0eaa9026478eefe95819` (local parent has that same tree).
Runtime patch SHA-256: `dacd9476e3c36b7e4f7037fb3cc5b4eb5b45c6d87b0df043506ca3c5174f571c`. Reproduce by hashing sorted changed/new `src/`
and `data/` paths, each followed by NUL, file bytes and NUL, against that base tree.

## Scope and criteria

14 new combat skills and 19 mods; four existing movement skills unchanged except for the
optional separate movement mod. New content is marked prototype and available in an
unsaved sandbox/Skill Lab. No recipes, drops or starter progression grants were added.

Criteria: hold/release is explicit and shows progress; charge cannot survive cancel,
menu, death, movement or refresh; resources are paid once on release. Skill/mod gates
and typed conflicts are understandable; shields must be active. Movement shows actual
range and maximum charges, and remains legible on landscape phone. Areas, line, rain,
wall and sustained fire have finite, readable footprints and end correctly. Coin IDs,
ownership and combat loadout survive the v9 movement-socket migration.

## Technical evidence

- Full core: **412 passed**. Final focused frontier tests: **19 passed** after the
  missing-shield failure label/ground-owner follow-up. JSON import/UI affected tests:
  **28 passed**. Build and whitespace diff check passed.
- Production runtime: desktop 1440×900, iPad-sized Chromium touch 1180×820, landscape
  phone 844×390. All 14 Lab prototypes replay and all sandbox weapon/shield selections
  meet active requirements; real input handlers hold/release charge and movement-mod
  controls socket the coin. Final phone presentation is checked again after the compact
  movement-page fix. These are emulated dimensions/pointers, not a physical iPad.
- Movement trial: Dash 6 m / 2 charges becomes 3 m / 3 charges; recharge remains 3 s.
  All four movement contracts, inactivity/recovery and max rank 1 are covered in core.
- Relevant GPU probe: three cast/clear cycles with actual RAF renders. Final cleared
  geometry counts stabilize at 38/38/38 (desktop), 35/35/35 (tablet/phone); no long leak
  session was necessary. No hardware FPS inference from software GL.
- GitHub required checks/WebKit remain separate premerge gates. The prototype has not
  been merged around branch protection. No CI/repository configuration changed.

## Visual research and inspection

Studied multiple public Cartoon FX Remaster gallery clips for fire breath, flamethrower,
magic aura and ice impact, then inspected anticipation/sustain/contact/fade phase frames.
Reference: https://www.jeanmoreno.com/unity/cartoonfxremaster_gallery/
New geometry/shaders are original; no paid assets were copied.

Reviewed actual runtime stills for charging, line/guard footprint, wall, rain, healing,
aura, summon and movement socket. Also sampled live 1× RAF runs (not continuous visual
playback): bow hold around 0.80 s; flame sustain around 0.8 s and release; rain around
0.7 s; wall rise around 0.8 s. Exact times are saved in the focused capture's motion.json.
Final bow pose retains its draw when late model loading rebuilds the preview rig.

Faults found/fixed: Thai missing font in Lab; occupied dummy placement prevented the
wall preview; sustained fire initially appeared as a solid sector; late model arrivals
cancelled held poses; sandbox bar overlapped workspace navigation; phone combat cards
were compressed by the new movement socket. Lab now supplies the local Thai font and
wall offset, a directional animated fire pattern, preserved pose, hidden sandbox bar
in menus, and a dedicated compact phone movement page. Normal gameplay gates/resource
checks are separate evidence from these visual judgements.

## Remaining limits

Visuals are interim. Several new skills borrow existing poses/contact art; Stone Guardian
borrows crag_golem, and sustained fire is still a flat stylized prototype rather than
final layered flame art. Owner feel/animation approval remains outstanding. Battle Aura
currently restores the player's MP because current allies have no MP. Crafting recipes,
normal acquisition and numerical balance remain undecided by explicit user instruction.

Direct impact trace covered data IDs, pure executors, target/damage/status paths, input
cleanup, active gear gates, migration/UID assignment, current and legacy UI consumers,
renderer ownership/world switch, Lab adapters and the Godot port contract. No unresolved
source discovery required Jev. CI status is reported on the PR, never inferred from local
Chromium. UI evidence below is the exact inspected output saved for review.

## Artifacts

- [ipad-movement.png](review/frontier/ipad-movement.png) — SHA-256 `9b87aab76816782234a1fdafa15a53c89c36c4e222699298ff6e47bc34d12ea5`
- [lab-charge.png](review/frontier/lab-charge.png) — SHA-256 `60d05e3399c50abc14f723eaf6b26e583c1858883f214d84d14f674471970d23`
- [lab-wall.png](review/frontier/lab-wall.png) — SHA-256 `09afa31ad2d1cb2d7e356e8b3416cc7f1021fe63a4da0547c28f020af64b5cdf`
- [phone-movement.png](review/frontier/phone-movement.png) — SHA-256 `50072de807d2e841eade07930d9c1a270ea122a5517d690ccc3db3a695a8fe00`
