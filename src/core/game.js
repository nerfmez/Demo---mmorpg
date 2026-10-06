// Public simulation entry. Combat/save rules remain byte-for-byte in game-simulation.js.
import { Game as Simulation } from './game-simulation.js';
import { populateEncounters } from './encounters.js';

export class Game extends Simulation {
  spawnMonsters() {
    if (!populateEncounters(this)) super.spawnMonsters();
  }
}
