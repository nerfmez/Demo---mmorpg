import test from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../../src/core/data-node.js';
import { Game } from '../../src/core/game.js';
import { modUpgradeState, upgradeMod, upgradeSkill } from '../../src/core/crafting.js';
import { growthWorkspace } from '../../src/ui/skillview.js';

const data = loadData();
const game = new Game(data, { seed: 7 });
const town = data.world.town;
const services = [town.workbench, town.trainer, ...town.skillUpgradeStations];
const place = pos => { [game.player.x, game.player.z] = pos; };
function screenshotState() {
  game.ch.gold = 1213;
  game.ch.materials = { skill_crystal: 3 };
  game.ch.stats.DEX = 8;
  game.ch.stats.VIT = 5;
  game.ch.mods = [{ uid: 901, id: 'multistrike', level: 1 }, { uid: 902, id: 'life_leech', level: 1 }];
}
const markup = () => growthWorkspace({ game, sel: { growthKind: 'mod' } }, { costHtml: () => '', describeSkill: () => '' });
const card = (html, uid) => html.split('<section class="card">').find(part => part.includes(`data-uid="${uid}"`));
const button = (html, uid) => card(html, uid)?.match(/<button[^>]*data-act="mod-up"[^>]*>/)?.[0];

test('only real upgrade services are accepted, independently of the safe-town flag', () => {
  const workshop = data.world.city.entries.find(entry => entry.id === 'AC_Craft_Workshop_050');
  assert.deepEqual(town.skillUpgradeStations, [[workshop.x, workshop.z]], 'anchor follows the actual approved workshop entrance');
  for (const pos of services) {
    place(pos);
    assert.equal(game.nearby().skillUpgrade, true);
  }
  place(town.trainer);
  assert.equal(game.nearby().workbench, false, 'trainer does not broaden equipment/crafting availability');
  place(town.skillUpgradeStations[0]);
  assert.equal(game.nearby().workbench, false, 'extra workshop is skill/mod-only');
  const decorativeTable = data.world.city.dressing.placements.find(item => item.asset === 'AC_Work_Table');
  for (const pos of [town.centre, data.world.playerSpawn, [decorativeTable.x, decorativeTable.z]]) {
    place(pos);
    assert.equal(game.nearby().inTown, true, 'negative case really is safe');
    assert.equal(game.nearby().skillUpgrade, false, 'safe area and decorative tables are not upgrade services');
  }
  place([town.workbench[0] - 3.61, town.workbench[1]]);
  assert.equal(game.nearby().skillUpgrade, false, 'outside the existing interaction radius is refused');
  place([town.workbench[0] - 3.5, town.workbench[1]]);
  assert.equal(game.nearby().skillUpgrade, true);
});

test('Repeat Slash screenshot state has matching ready status and enabled button at every service', () => {
  for (const pos of services) {
    screenshotState();
    place(pos);
    const html = markup();
    assert.match(card(html, 901), /class="ok" data-growth-status>พร้อมอัปเกรด/);
    assert.doesNotMatch(button(html, 901), /disabled/);
    assert.match(card(html, 902), /ต้องมี VIT 7/);
    assert.match(button(html, 902), /disabled/);
    assert.ok(upgradeMod(game.ch, data, 901).ok);
    assert.equal(game.ch.mods[0].level, 2);
    assert.equal(game.ch.materials.skill_crystal, 1);
    assert.equal(game.ch.gold, 1173);
    const paid = JSON.stringify(game.ch);
    assert.equal(upgradeMod(game.ch, data, 901).ok, false, 'repeat cannot pay a second rank');
    assert.equal(JSON.stringify(game.ch), paid);
  }
});

test('outside services, the card explains why a funded mod button is disabled', () => {
  screenshotState();
  place(town.centre);
  assert.ok(modUpgradeState(game.ch, data, game.ch.mods[0]).ok);
  const before = JSON.stringify(game.ch), html = markup();
  assert.match(card(html, 901), /class="no" data-growth-status>ต้องอยู่ใกล้จุดคราฟต์หรือครูฝึก/);
  assert.doesNotMatch(card(html, 901), /พร้อมอัปเกรด/);
  assert.match(button(html, 901), /disabled/);
  assert.equal(JSON.stringify(game.ch), before, 'inspection never spends');
});

test('stat, gold, crystal and max-rank rules remain atomic', () => {
  place(town.trainer);
  for (const change of [() => { game.ch.stats.DEX = 7; }, () => { game.ch.gold = 39; }, () => { game.ch.materials.skill_crystal = 1; }]) {
    screenshotState(); change();
    const before = JSON.stringify(game.ch), html = markup();
    assert.match(button(html, 901), /disabled/);
    assert.equal(upgradeMod(game.ch, data, 901).ok, false);
    assert.equal(JSON.stringify(game.ch), before);
  }
  screenshotState(); game.ch.mods[0].level = data.progression.modUpgrade.maxLevel;
  assert.equal(button(markup(), 901), undefined);
  const before = JSON.stringify(game.ch);
  assert.equal(upgradeMod(game.ch, data, 901).reason, 'max');
  assert.equal(JSON.stringify(game.ch), before);
  game.ch.stats.STR = 5; game.ch.skills.slash = 1;
  assert.ok(upgradeSkill(game.ch, data, 'slash').ok);
  assert.equal(game.ch.skills.slash, 2);
});

test('the Frontier retains its existing workbench and trainer without extra station data', () => {
  const frontier = data.maps['frontier-wilds-v1'];
  assert.equal(frontier.town.skillUpgradeStations, undefined);
  const original = data.world; data.world = frontier;
  try {
    for (const pos of [frontier.town.workbench, frontier.town.trainer]) {
      place(pos); assert.equal(game.nearby().skillUpgrade, true);
    }
  } finally { data.world = original; }
});
