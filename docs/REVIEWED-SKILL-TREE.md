# Reviewed skill tree in the main game

Source: local graph commit `0171f34de70fdd5021ec4504a639587eddb09c24`.
The main journal has one shared six-node first page (free origin), two later
paths with six paid skills each, then three paths with six paid skills each.
Major icons navigate for free. All named prerequisites are required; section
investment gates remain 0/3/7. Paid entrance skills are included in each six.
One complete ordinary route costs 15 Job Points; including the entire first
page costs 17. The trial's three starting points are not granted in the game.

`data/jobtree.json` owns the graph, effects, directed `requires`, sections and
`presentation.stages/groups`. The journal and layout consume these definitions.
`core/character.js` owns eligibility and synchronous allocation. Only successful
allocations draw dashed ink; restore, inspection and rejected/repeated clicks
do not replay motion. Reduced motion skips the route and paper animations.

This is additive save compatibility: existing revision, old IDs, definitions,
bonuses, profession choices and Job Points remain. Existing learned entries are
searchable as retained notes. Existing legacy core adjacency/choice rules stay
intact; new skills use ALL directed parents. No save-shape change or reset.
Gold respec still uses canonical fees and requires being in town in the UI.

EXP/Job curves and runtime rewards are unchanged. Neither budget `c889a19` nor
the superseded heavy curve `273fdbf` is integrated. No city, combat VFX or lab
changes are part of this integration. PR46 fullscreen/modal control is retained.

Validation: focused tree/save/core checks, real input and responsive journal
checks, actual saved-character Continue/purchase/reload, and fullscreen/modal
regression. PR CI runs core/build, Chromium/WebKit smoke/UX and focused UI
checks. Published verification compares live built assets with the merge build
and the successful Pages workflow head SHA, then exercises the published tree.
