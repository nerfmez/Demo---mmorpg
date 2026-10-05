// The menu's structure (presentation only). Five groups; each page opens only when pressed.
// Panels draws the main menu (hub) and the group sidebar from this; the HUD button and the
// keyboard shortcuts open the hub or a page directly.
export const MENU_GROUPS = [
  { id: 'hero', title: 'นักผจญภัย', sub: 'ค่าสถานะและเส้นทางพาสซีฟ', icon: 'person', pages: ['char', 'job'] },
  { id: 'build', title: 'สกิลและม็อด', sub: 'จัดชุดการต่อสู้และอัปเกรด', icon: 'book', pages: ['skills', 'mods', 'movement', 'growth'] },
  { id: 'items', title: 'ของและร้านค้า', sub: 'อุปกรณ์ คราฟต์ ซื้อขาย', icon: 'bag', pages: ['bag', 'craft', 'shop'] },
  { id: 'world', title: 'การเดินทาง', sub: 'ภารกิจและแผนที่โลก', icon: 'scroll', pages: ['journal', 'map'] },
  { id: 'system', title: 'ระบบ', sub: 'ตั้งค่า บันทึก วิธีเล่น', icon: 'gear', pages: ['settings'] },
];

export const MENU_PAGES = {
  char: { label: 'ตัวละคร', desc: 'ค่าสถานะ แต้ม Stat', icon: 'person', key: 'C' },
  job: { label: 'เส้นทางพาสซีฟ', desc: 'Job Tree ใช้แต้ม Job', icon: 'tree', key: 'J' },
  skills: { label: 'ชุดสกิล', desc: 'ใส่สกิลลงช่องต่อสู้', icon: 'book', key: 'K' },
  mods: { label: 'ม็อด', desc: 'ใส่เหรียญม็อดในสกิล', icon: 'hex' },
  movement: { label: 'เคลื่อนที่', desc: 'สกิลพุ่งและหลบ', icon: 'dash' },
  growth: { label: 'อัปเลเวล', desc: 'อัปเกรดสกิลและม็อด', icon: 'spark' },
  bag: { label: 'กระเป๋า', desc: 'อุปกรณ์และวัตถุดิบ', icon: 'bag', key: 'I' },
  craft: { label: 'โต๊ะคราฟต์', desc: 'สร้างอาวุธ ชุด สกิล', icon: 'hammer' },
  shop: { label: 'ร้านค้า · ยา', desc: 'ซื้อขวดยา ตั้งช่องใช้', icon: 'heal' },
  journal: { label: 'ภารกิจ', desc: 'เรื่องหลักและงานรอง', icon: 'scroll', key: 'L' },
  map: { label: 'แผนที่', desc: 'แผนที่โลก วาร์ป', icon: 'map', key: 'M' },
  settings: { label: 'ตั้งค่า', desc: 'กราฟิก เซฟ วิธีเล่น', icon: 'gear', key: 'Esc' },
};

export const groupOf = (page) => MENU_GROUPS.find((g) => g.pages.includes(page));
