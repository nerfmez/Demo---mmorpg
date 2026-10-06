// Filter existing ordered cards without replacing the input or interrupting Thai IME.
import { craftQueryMatches } from '../core/craft-order.js';
const mounted = new WeakSet();
export function bindCraftSearch(ui) {
  const root = ui.body;
  if (!root?.addEventListener || mounted.has(root)) return;
  root.addEventListener('input', event => {
    if (!event.target.matches('[data-craft-search]')) return;
    ui.sel.craftSearch = event.target.value;
    const cards = [...root.querySelectorAll('[data-recipe-id]')];
    for (const card of cards) {
      const visible = craftQueryMatches(card.dataset.recipeSearch, ui.sel.craftSearch);
      card.hidden = !visible; card.style.display = visible ? '' : 'none';
    }
    for (const group of root.querySelectorAll('[data-craft-group]')) {
      const visible = cards.some(card => !card.hidden && card.dataset.craftStage === group.dataset.craftGroup);
      group.hidden = !visible; group.style.display = visible ? '' : 'none';
    }
    const empty = root.querySelector('[data-craft-empty]');
    if (empty) { const visible = !cards.some(card => !card.hidden); empty.hidden = !visible; empty.style.display = visible ? '' : 'none'; }
  });
  mounted.add(root);
}
