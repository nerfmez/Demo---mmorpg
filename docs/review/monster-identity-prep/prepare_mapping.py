"""Reproduce a read-only content audit and proposed labels. Never edits game data."""
import hashlib
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parent
MAIN = '0e2d9fd58b7e6e10b6226158130e642d366c301a'
PR = '867147209c520c05c8f32b7b5dfb5710ec1a899d'
IDS = ['salt_slime', 'tusk_boar', 'thornback_wolf', 'greyfang', 'reed_viper', 'marsh_wisp']
NAMES = {
    'salt_slime': ('Tidal Slime', 'สไลม์คลื่นทะเล'),
    'tusk_boar': ('Boarbull', 'หมูกระทิง'),
    'thornback_wolf': ('Maskfang Wolf', 'หมาป่าหน้ากาก'),
    'greyfang': ('Greyfang Alpha', 'เกรย์แฟง จ่าฝูง'),
    'reed_viper': ('Reedblade Viper', 'งูใบกกพิษ'),
    'marsh_wisp': ('Lostlight Wisp', 'ภูตแสงหลงทาง'),
}
MAT_NAMES = {
    'boar_hide': ('Boarbull Hide', 'หนังหมูกระทิง'),
    'boar_tusk': ('Boarbull Horn', 'เขาหมูกระทิง'),
    'wolf_pelt': ('Maskfang Pelt', 'หนังหมาป่าหน้ากาก'),
    'viper_scale': ('Reedblade Scale', 'เกล็ดใบกก'),
    'wisp_core': ('Lostlight Core', 'แกนภูตแสงหลงทาง'),
}
VISUALS = {
    'salt_slime': 'Cyan curling wave body, white foam crest, narrow eyes, white salt crystals at its base.',
    'tusk_boar': 'Heavy rust-orange boar, tan chest, pink snout, broad ivory bull horns plus smaller tusks.',
    'thornback_wolf': 'Charcoal-grey wolf, cream mask and cheek blades, amber eyes; no green thorns.',
    'greyfang': 'Same masked wolf family, larger layered silver/cream mane and broader boss silhouette.',
    'reed_viper': 'Coiled olive snake, cream segmented belly, amber eye, dark green reed blades edged gold.',
    'marsh_wisp': 'Curling cyan/blue flames, dark face with pale eyes, large faceted golden core.',
}
REUSE_NOTES = {
    'salt_gel': 'Existing cyan wave gel with white salt crystals matches the redesign; retain approved bytes.',
    'boar_hide': 'Existing rust-orange hide matches Boarbull fur; retain approved bytes.',
    'boar_tusk': 'Existing wide curved ivory horn with brown root matches the horn in the concept; retain bytes. Display noun becomes horn; stable ID stays boar_tusk. Do not create the extra tusk/horn shown on the sheet as another drop.',
    'wolf_pelt': 'Existing grey pelt matches both new wolves; retain bytes. Remove obsolete Thorn Pelt wording.',
    'wolf_fang': 'Existing ivory fang is shared by normal wolf and boss; keep generic label and bytes.',
    'greyfang_mane': 'Existing silver-grey mane matches the new alpha; keep label and bytes.',
    'viper_scale': 'New candidate required: a dark green pointed reed blade edged gold, from the actual v4 drop drawing.',
    'venom_gland': 'Existing green gland matches viper drop and is also used by unchanged moss_beetle; retain generic name and bytes.',
    'wisp_core': 'New candidate required: golden crystal in cyan flame, replacing a cyan spiral with no gold core.',
    'glow_dust': 'Existing blue-white dust matches wisp drop and is shared by sporecap/salt_slime; retain generic name and bytes.',
}

def read_at(path):
    return json.loads(subprocess.check_output(['git', 'show', MAIN + ':' + path], cwd=ROOT))

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

monsters = read_at('data/monsters.json')['monsters']
items = read_at('data/items.json')
recipes = read_at('data/recipes.json')['recipes']
quests = read_at('data/quests.json')['quests']
provenance = {x['key']: x for x in read_at('docs/icon-assets-manifest.json')['verified_assets']}
mat_ids = list(dict.fromkeys(d['item'] for k in IDS for d in monsters[k]['drops'] if d['item'] != 'gold'))
labels = []
def propose(file, pointer, before, after, reason, optional=False):
    if before != after:
        labels.append(dict(file=file, pointer=pointer, before=before, proposed=after,
                           reason=reason, optional=optional, approved=False))

audit = dict(status='OWNER REVIEW CANDIDATE; not applied to runtime', main_sha=MAIN,
             pr106_sha=PR, pr106_url='https://github.com/nerfmez/Demo---mmorpg/pull/106',
             monsters=[], materials=[], recipes=[], quests=[], grade_promotion_costs=items['gradeUpgrade']['cost'])
for k in IDS:
    old = monsters[k]
    f = k + '_concept_' + ('v4' if k == 'reed_viper' else 'v2') + '.jpg'
    entry = dict(id=k, current_name=old['name'], current_nameTh=old['nameTh'],
                 reference_name=NAMES[k][0], proposed_nameTh=NAMES[k][1],
                 thai_status='existing' if k == 'greyfang' else 'proposed; owner review pending',
                 observed_identity=VISUALS[k], drops=old['drops'],
                 source_path='assets/meshy/monsters/' + f, source_sha=PR,
                 local_reference='references/' + f, source_sha256=sha(OUT / 'references' / f),
                 source_url=f'https://github.com/nerfmez/Demo---mmorpg/blob/{PR}/assets/meshy/monsters/{f}',
                 current_portrait='public/assets/icons/monster/' + k + '.png',
                 current_portrait_sha256=sha(ROOT / 'public/assets/icons/monster' / (k + '.png')),
                 model_path='public/models/monsters/' + k + '.glb')
    audit['monsters'].append(entry)
    for field, value in zip(['name', 'nameTh'], NAMES[k]):
        propose('data/monsters.json', '/monsters/' + k + '/' + field, old[field], value, 'Match PR106 concept title/identity')

for k in mat_ids:
    old = items['materials'][k]
    pair = MAT_NAMES.get(k, (old['name'], old['nameTh']))
    source = provenance['material/' + k]
    consumers = [r for r, v in recipes.items() if k in v.get('cost', {})]
    sources = [m for m, v in monsters.items() if any(d['item'] == k for d in v['drops'])]
    audit['materials'].append(dict(id=k, current_name=old['name'], current_nameTh=old['nameTh'],
        proposed_name=pair[0], proposed_nameTh=pair[1], artwork='candidate' if k in ['viper_scale', 'wisp_core'] else 'reuse approved bytes',
        reason=REUSE_NOTES[k], current_path='public/' + source['path'], current_sha256=source['sha256'],
        source_library_file_id=source.get('source_library_file_id'), source_archive=source.get('source_archive'),
        source_monsters=sources, recipe_ids=consumers,
        legacy_upgradeMaterial_gear=[g for g,v in items['gearBases'].items() if v.get('upgradeMaterial') == k]))
    for field, value in zip(['name', 'nameTh'], pair):
        propose('data/items.json', '/materials/' + k + '/' + field, old[field], value, 'Consistent display label; stable ID preserved')

for k, v in recipes.items():
    hit = {a: n for a, n in v.get('cost', {}).items() if a in mat_ids}
    if hit:
        audit['recipes'].append(dict(id=k, type=v['type'], result=v['result'], affected_cost=hit,
                                     full_cost=v['cost'], label_sync='dynamic from material definitions; no recipe mutation'))

replacements = {'สไลม์น้ำเค็ม': 'สไลม์คลื่นทะเล', 'หมูป่างาแหลม': 'หมูกระทิง',
                'หมาป่าหลังหนาม': 'หมาป่าหน้ากาก'}
for k, v in quests.items():
    relevant = (v.get('target') in IDS or any(o.get('target') in IDS for o in v.get('objectives', []))
                or any(a in mat_ids for a in v.get('reward', {}).get('items', {})))
    if not relevant:
        continue
    audit['quests'].append(dict(id=k, current=v, label_sync='literal text changes below; reward labels read items dynamically'))
    for field in ['name', 'nameTh', 'descTh', 'objectiveTextTh']:
        if field not in v:
            continue
        after = v[field]
        for before, new in replacements.items():
            after = after.replace(before, new)
        if k == 'm_boars' and field == 'descTh':
            after = after.replace('หนังกับเขี้ยว', 'หนังกับเขา')
        propose('data/quests.json', '/quests/' + k + '/' + field, v[field], after, 'Literal quest name sync; counts/targets/rewards preserved')
    for n, o in enumerate(v.get('objectives', [])):
        before = o.get('labelTh', '')
        after = before
        for a,b in replacements.items():
            after = after.replace(a,b)
        propose('data/quests.json', f'/quests/{k}/objectives/{n}/labelTh', before, after, 'Literal objective label sync')

# These are dependent label options, not a redesign of the approved PR104 weapons.
gear_labels = {
    'tusk_blade': ('Boarbull Hornblade', 'ดาบเขาหมูกระทิง'),
    'tusk_club': ('Boarbull Horn Club', 'กระบองเขาหมูกระทิง'),
    'tusk_greatblade': ('Boarbull Greatblade', 'ดาบใหญ่เขาหมูกระทิง'),
    'hide_vest': ('Boarbull Hide Vest', 'เสื้อหนังหมูกระทิง'),
    'hide_gloves': ('Boarbull Hide Gloves', 'ถุงมือหนังหมูกระทิง'),
    'wisp_staff': ('Lostlight Staff', 'คทาภูตแสงหลงทาง'),
    'wisp_slippers': ('Lostlight Slippers', 'รองเท้าภูตแสงหลงทาง'),
    'wisp_pendant': ('Lostlight Pendant', 'จี้ภูตแสงหลงทาง'),
}
for k, pair in gear_labels.items():
    for field, value in zip(['name', 'nameTh'], pair):
        propose('data/items.json', '/gearBases/' + k + '/' + field, items['gearBases'][k][field], value,
                'Dependent old species/element wording; label-only option; existing art/models unchanged', True)

(OUT/'mapping.json').write_text(json.dumps(audit, ensure_ascii=False, indent=2) + '\n')
(OUT/'proposed-labels.json').write_text(json.dumps(dict(status='proposed, not applied; not authorization to rename IDs', labels=labels),ensure_ascii=False,indent=2)+'\n')
lines = ['# Six-monster identity preparation', '', '**Owner review candidate — no runtime changes, merge or deployment.**', '',
         f'Main inspected: `{MAIN}`. PR106 inspected: `{PR}` ([PR106](https://github.com/nerfmez/Demo---mmorpg/pull/106)).', '',
         'The six exact concept sheets were inspected as pixels, including their drop drawings. English identities come from sheet titles and PR106 provenance; Thai translations below are proposed except existing Greyfang. No additional conversation design files were provided to this task.', '',
         '## Monster old → new mapping', '', '| Stable ID | Current stored name / Thai | Reference name / Thai proposal | Exact source |', '|---|---|---|---|']
for v in audit['monsters']:
    lines.append(f"| `{v['id']}` | {v['current_name']} / {v['current_nameTh']} | {v['reference_name']} / {v['proposed_nameTh']} | [{Path(v['source_path']).name}]({v['source_url']}) |")
lines += ['', '## Material old → new mapping', '', '| Stable ID | Current English / Thai | Proposed English / Thai | Art decision | Source Library file ID |', '|---|---|---|---|---|']
for v in audit['materials']:
    lines.append(f"| `{v['id']}` | {v['current_name']} / {v['current_nameTh']} | {v['proposed_name']} / {v['proposed_nameTh']} | {v['artwork']} | `{v['source_library_file_id']}` |")
lines += ['', 'Only the two missing matching material designs receive new candidate art. Eight approved icons are reused byte-for-byte. This does not add the extra salt crystal or separate tusk shown on the concepts as loot.', '',
          'Shared items retain their generic names: venom_gland also comes from moss_beetle; glow_dust also comes from sporecap and salt_slime; wolf_fang/wolf_pelt are shared by both wolves. See mapping.json for exact source/archive IDs, SHA256 hashes and unchanged drop odds/amounts.', '',
          '## Recipe and quest references', '', f"{len(audit['recipes'])} recipes use these materials. Their ingredient labels resolve through data/items.json; preserve every cost, recipe ID, result and optionPool. Exact IDs and costs are in mapping.json.", '',
          'Literal text edits: h_slimes, m_boars and s_wolves (descTh, objectiveTextTh and objectives[].labelTh); m_boars also says horns instead of tusks. m_greyfang already says Greyfang and remains valid; no count/reward changes. h_crabs and archived m_craft reuse renamed/reviewed material labels dynamically.', '',
          'data/items.json gradeUpgrade B/A costs use wisp_core and glow_dust; keep exact costs. gearBases upgradeMaterial fields remain stable legacy metadata. Enhancement uses enhancement_stone; no rebalance.', '',
          'proposed-labels.json records each exact JSON pointer and before → proposed value. Eight dependent gear label options are included separately for owner review; no PR104 weapon art or models are changed.', '',
          '## UI / source references to synchronize after approval', '',
          '- data/monsters.json name/nameTh: Atlas entries, encounter pin titles, inventory source text, boss bar, target display and quest navigation use these definitions.',
          '- data/items.json materials name/nameTh: inventory, ingredient seeker, all recipe ingredient/reward text, grade promotion costs, salvage output and loot toasts use central labels.',
          '- public/assets/icons/monster/<id>.png + MONSTER_PORTRAITS in src/ui/raster-icons.js: 50px field-guide/Atlas portraits.',
          "- src/ui/atlas.js boss markers and src/ui/inventory.js material-source portraits call art('monster',id). They still resolve old SVGs. Introduce a scoped registry for these six approved images in art()/RASTER_ICONS; retain other SVGs. A portrait-only PNG replacement would miss these consumers.",
          '- src/ui/quest-journal.js receives the same art resolver; verify kill quest pictures at 44/54px as part of eventual integration.',
          '- public/assets/icons/material/{viper_scale,wisp_core}.png and RASTER_ICONS: existing registry paths already cover bag, crafting and src/render/dropart.js ground-loot textures. No new drop geometry or rules.',
          '- assets/atlas-journal/manifest.json, assets/atlas-monsters/manifest.json and scripts/split-atlas-journal.py: use a six-ID override batch so rebuilding old sheets cannot overwrite approved replacements; retain historical sheets/cells. Update source identity and output hashes only for these six.',
          '- docs/icon-assets-manifest.json: preserve old provenance, append candidate source/edit/export lineage and final hashes for the two material replacements.', '',
          '## Preservation / pending work', '',
          'Stable monster/material/recipe/quest/gear IDs, save v7, drop odds/amounts, counts/rewards, recipes, stats, item values and balance remain untouched. Candidate names/art are confined to this review folder. PR106, PR102/103/104 and other proposals are not modified.', '',
          'No paid Meshy call. No new zone/mole/accessory/beetle work. No live-site/art acceptance or hardware iPad claim. Final integration requires owner art/name review, then focused UI/browser checks against the merged model revision.']
(OUT/'MAPPING.md').write_text('\n'.join(lines)+'\n')
print(f'Audited {len(IDS)} monsters, {len(mat_ids)} materials, {len(audit["recipes"])} recipes; {len(labels)} proposed label fields. No game-data edits.')
