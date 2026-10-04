// Reference hero vs the average monster of its level, every kit and level (core/balance.js).
// Prints time-to-kill, time-to-die, minutes per level and hours to the monster cap.
import { loadData } from '../src/core/data-node.js';
import { balanceReport } from '../src/core/balance.js';
const { rows, hours } = balanceReport(loadData());
const levels = new Set([1, 3, 5, 8, 10, 13, 15, 18, 20, 22, 24, 25]);
console.log('kit    lv  il rank   dps    ttk   ttd   min/lv');
for (const r of rows) if (levels.has(r.level)) console.log(`${r.kit.padEnd(6)} ${String(r.level).padStart(2)} ${String(r.itemLevel).padStart(3)} ${String(r.rank).padStart(4)} ${String(r.dps).padStart(6)} ${String(r.ttk).padStart(6)} ${String(r.ttd).padStart(5)} ${String(r.minutes).padStart(7)}`);
console.log('hours to cap', JSON.stringify(hours));
