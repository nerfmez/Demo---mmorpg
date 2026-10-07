// Public simulation boundary: authored encounters and exactly-once quest rewards.
import { Game as Simulation } from './game-simulation.js';
import { populateEncounters } from './encounters.js';
import { claimQuestReward } from './quests.js';

export class Game extends Simulation {
  spawnMonsters() {
    if (!populateEncounters(this)) super.spawnMonsters();
  }

  completeQuests(ids) {
    // Claim one reward before the base payment can trigger a re-entrant level-up refresh.
    for (const id of new Set(ids)) if (claimQuestReward(this.ch, this.data, id)) super.completeQuests([id]);
  }
}
