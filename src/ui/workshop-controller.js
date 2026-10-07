// One-shot cosmetic feedback, owned by this Panels instance. No game-loop or save-schema changes.
import { executeWorkshop, WORKSHOP_OPERATIONS, workshopReason } from './workshop-model.js';
const DURATION = 900;

export function createWorkshopController(ui, { schedule = setTimeout, cancel = clearTimeout, reducedMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches } = {}) {
  let timer = null, token = 0, busy = false, receipt = null, error = '';
  const finish = () => {
    if (timer !== null) cancel(timer);
    timer = null; token++; busy = false;
  };
  const api = {
    get busy() { return busy; }, get receipt() { return receipt; }, get error() { return error; },
    finish() { finish(); if (['craft', 'forge'].includes(ui.tab)) ui.render(); },
    close() { finish(); }, // a committed item survives closing, it is never rerolled
    clear() { finish(); receipt = null; error = ''; },
    run(action, args) {
      if (busy) return { ok: false, reason: 'busy' };
      busy = true; error = ''; receipt = null;
      const sequence = ++token;
      let result;
      try {
        result = executeWorkshop(ui.game, action, args);
        if (!result.ok) {
          busy = false; error = workshopReason(result.reason); ui.render(); return result;
        }
        receipt = result;
        if (result.recipeId) {
          ui.sel.craftRecipe = result.recipeId;
          if (result.kind === 'gear') ui.recordCraft(result.recipeId, result.items, result.spent, action === 'craft-batch' ? result.reason : 'single');
        }
        ui.lastResult = null;
        // Model and normal autosave callback are updated NOW, before any cosmetic timer.
        ui.changed();
        if (token === sequence && busy) timer = schedule(() => {
          if (token !== sequence) return;
          timer = null; busy = false;
          if (['craft', 'forge'].includes(ui.tab)) ui.render();
        }, reducedMotion() ? 80 : DURATION);
        return result;
      } catch (err) {
        finish();
        // Do not turn a real rule/save error into a fake success or retry/duplicate the command.
        throw err;
      }
    },
    handle(element) {
      const { act, id, uid, mode } = element.dataset;
      if (act === 'forge-open') {
        api.clear(); ui.sel.forgeUid = Number(uid); ui.sel.forgeMode = mode === 'grade' ? 'grade' : 'upgrade';
        ui.sel.forgeSlot = 'all'; ui.sel.forgeSearch = ''; ui.open('forge'); return true;
      }
      if (act === 'workshop-page') {
        if (!['craft', 'upgrade', 'grade'].includes(id)) return true;
        api.clear();
        if (id === 'craft') ui.open('craft');
        else { ui.sel.forgeMode = id === 'grade' ? 'grade' : 'upgrade'; ui.open('forge'); }
        return true;
      }
      if (act === 'workshop-skip') { api.finish(); return true; }
      if (act === 'forge-item') {
        if (busy) return true;
        if (!ui.game.ch.gear.some(it => it.uid === Number(uid))) return true;
        api.clear(); ui.sel.forgeUid = Number(uid); ui.render();
        ui.body.querySelector('[data-forge-detail]')?.scrollIntoView({ block: 'nearest' }); return true;
      }
      if (act === 'forge-filter') {
        if (busy) return true;
        api.clear(); ui.sel.forgeSlot = id; ui.sel.forgeUid = null; ui.render(); return true;
      }
      if (WORKSHOP_OPERATIONS.has(act)) {
        // Compatibility for old bag shortcuts: inspection first, no hidden payment in the bag.
        if ((act === 'gear-up' || act === 'gear-grade') && ui.tab !== 'forge') {
          return api.handle({ dataset: { act: 'forge-open', uid, mode: act === 'gear-grade' ? 'grade' : 'upgrade' } });
        }
        const goal = ui.sel.craftGoals?.[id] || { attempts: 5, grade: 'A', option: '', quality: 0 };
        api.run(act, { id, uid, goal: { ...goal, grade: goal.grade || null, option: goal.option || null } });
        return true;
      }
      return false;
    },
  };
  // Delegate on the persistent body: never replace the search input while a Thai IME is composing.
  ui.body?.addEventListener('input', event => {
    const input = event.target;
    const craft = input.matches?.('[data-craft-search]'), forge = input.matches?.('[data-forge-search]');
    if (!craft && !forge) return;
    const query = input.value.normalize('NFKC').toLocaleLowerCase('th').trim().split(/\s+/).filter(Boolean);
    ui.sel[craft ? 'craftSearch' : 'forgeSearch'] = input.value;
    const cards = [...ui.body.querySelectorAll(craft ? '[data-recipe-id]' : '[data-forge-choice]')];
    for (const card of cards) card.hidden = !query.every(term => (card.dataset.recipeSearch || card.dataset.forgeSearch || '').includes(term));
    for (const group of ui.body.querySelectorAll('[data-craft-group]')) group.hidden = !cards.some(card => !card.hidden && card.dataset.craftStage === group.dataset.craftGroup);
    const empty = ui.body.querySelector(craft ? '[data-craft-empty]' : '[data-forge-empty]');
    if (empty) empty.hidden = cards.some(card => !card.hidden);
  });
  return api;
}
