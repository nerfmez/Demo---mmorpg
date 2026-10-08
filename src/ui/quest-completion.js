// Receipts are paid and persisted by core. This dialog only reads and dismisses them.
import { dismissQuestCompletion } from '../core/quests.js';
import { rewardText } from './hud.js';
import './quest-completion.css';
const esc = s => String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export class QuestCompletion {
  constructor(game, { save, reset }) {
    Object.assign(this, { game, save, reset });
    this.el = document.createElement('dialog');
    this.el.className = 'quest-completion';
    this.el.setAttribute('aria-labelledby', 'completed-quest-title');
    document.body.append(this.el);
    this.el.addEventListener('cancel', e => { e.preventDefault(); this.dismiss(); });
    this.el.addEventListener('click', e => { const button = e.target.closest('[data-dismiss-quest]'); if (button) this.dismiss(button.dataset.dismissQuest); });
    this.el.addEventListener('keydown', e => e.stopPropagation());
  }
  get isOpen() { return this.el.open; }
  update(blocked = false) {
    const queue = this.game.ch.progress.questJournal.completions, receipt = queue[0];
    if (!receipt || blocked) return;
    if (this.current === receipt.id && this.isOpen) return;
    this.current = receipt.id;
    this.el.innerHTML = `<article><div class="completion-kicker">✓ ภารกิจสำเร็จ <span>${queue.length > 1 ? `เหลือ ${queue.length} ภารกิจ` : ''}</span></div>
      <h2 id="completed-quest-title">${esc(receipt.nameTh)}</h2><p>${esc(receipt.descTh)}</p>
      <ul>${receipt.objectives.map(o => `<li><span>✓ ${esc(o.labelTh)}</span><b>${esc(o.count)} / ${esc(o.count)}</b></li>`).join('')}</ul>
      <section><h3>รางวัลที่ได้รับแล้ว</h3><p class="completion-reward">${esc(rewardText(this.game.data, receipt.reward) || 'ไม่มีรางวัลเพิ่มเติม')}</p></section>
      <p class="completion-error" role="status"></p>
      <button data-dismiss-quest="${esc(receipt.id)}">${queue.length > 1 ? 'ดูภารกิจถัดไป' : 'กลับไปผจญภัย'}</button></article>`;
    this.reset();
    if (!this.isOpen) { this.returnFocus = document.activeElement; this.el.showModal(); }
    this.el.querySelector('button').focus({ preventScroll: true });
  }
  dismiss(id = this.current) {
    const queue = this.game.ch.progress.questJournal.completions, receipt = queue[0];
    if (!this.isOpen || !receipt || id !== this.current || !dismissQuestCompletion(this.game.ch, id)) return;
    if (this.save() === false) {
      queue.unshift(receipt);
      this.el.querySelector('.completion-error').textContent = 'บันทึกเซฟไม่ได้ กรุณาลองอีกครั้ง';
      return;
    }
    this.current = null;
    this.reset();
    if (queue.length) this.update();
    else { this.el.close(); if (this.returnFocus?.isConnected) this.returnFocus.focus({ preventScroll: true }); }
  }
}
