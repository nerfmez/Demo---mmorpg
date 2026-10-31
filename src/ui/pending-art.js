// Skills that do not have their picture yet (owner, 2026-10-26: "write that it has no picture yet so
// pictures are easy to pick"). Each shows a dashed stand-in with its Thai name and "ยังไม่มีรูป" until
// a PNG is supplied (docs/SKILL-ICONS-PENDING-TH.md). Keep in step with `iconPending` in data/skills.json
// (tests/core/pending-art.test.js).
export const PENDING_SKILL_ICONS = Object.freeze({
  sky_shatter: 'งัดพสุธา',
  earth_rend: 'แผ่นดินแยก',
  iron_body: 'กายเหล็ก',
  cross_cut: 'ฟันไขว้',
  backstab: 'แทงหลัง',
  blade_storm: 'พายุมีด',
  rally: 'ปลุกใจ',
  frenzy_roar: 'คำรามคลั่ง',
  stand_firm: 'ยืนหยัด',
  team_stand: 'ยืนหยัดทีม',
  blessing: 'พรแห่งแสง',
  rapid_volley: 'ยิงรัว',
  killing_arrow: 'ศรสังหาร',
  meteor: 'อุกกาบาต',
  blizzard: 'พายุหิมะ',
  thunderstorm: 'พายุฟ้าคะนอง',
  holy_bell: 'ระฆังศักดิ์สิทธิ์',
  light_chain: 'โซ่แสง',
  spell_wave: 'คลื่นดาบเวท',
  draw_cut: 'ชักดาบพริบตา',
  shield_rush: 'ทลายแนว',
  shield_fort: 'ป้อมโล่',
  faith_wall: 'กำแพงแห่งศรัทธา',
  provoke: 'ยั่วยุ',
  blood_boil: 'เลือดเดือด',
  fighting_spirit: 'ขวัญนักสู้',
  berserk: 'คลั่ง',
  stealth: 'ซ่อนตัว',
  steal: 'ขโมย',
  decoy: 'ร่างแยกหลอก',
});

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
/** Dashed round stand-in: the skill's name and the words "ยังไม่มีรูป" (no picture yet). */
export function pendingSkillArt(nameTh) {
  const fit = nameTh.length > 7 ? ' textLength="104" lengthAdjust="spacingAndGlyphs"' : '';
  return '<circle cx="64" cy="64" r="56" fill="#2b3442" stroke="#a9b6c4" stroke-width="3" stroke-dasharray="9 6"/>'
    + '<text x="64" y="62" text-anchor="middle" font-size="19" font-family="Kanit, Mitr, sans-serif" fill="#f3f5f7"' + fit + '>' + esc(nameTh) + '</text>'
    + '<text x="64" y="86" text-anchor="middle" font-size="13" font-family="Kanit, Mitr, sans-serif" fill="#ffd27a">ยังไม่มีรูป</text>';
}
