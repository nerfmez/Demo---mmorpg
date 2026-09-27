# สถานะเทียบกับเอกสารออกแบบ

อ้างอิงหัวข้อใน [`DESIGN-SUMMARY-TH.txt`](DESIGN-SUMMARY-TH.txt)
✅ = ทำแล้วใน Demo · 🟡 = มีแบบพื้นฐาน / ใช้ค่าชั่วคราว · ⬜ = ยังไม่ทำ (ตั้งใจเลื่อนไว้)

| # | หัวข้อ | สถานะ | อยู่ที่ไหน / หมายเหตุ |
|---|---|---|---|
| 2 | มุมกล้อง 3/4, รองรับ PC + มือถือ | ✅ | `render/view.js` (กล้องสูงแบบ ARPG), `ui/input.js` (เมาส์/คีย์บอร์ด + จอย/ปุ่มสัมผัส) |
| 3 | Soft Targeting | ✅ | `core/targeting.js` + test ใน `tests/core/sim.test.js` ตัวละครไม่วิ่งตามเป้า สกิลวงกว้างเล็งพื้นได้ |
| 4 | Basic Attack เป็นสกิลที่ถอดได้ | ✅ | Slash อยู่ในช่องสกิลปกติ ปล่อยช่องว่างได้ |
| 5 | Movement Skill แยกช่อง ใช้ชาร์จ | ✅ | Dash (2 ชาร์จ), Roll (อมตะ), Blink (เรียนที่โต๊ะคราฟต์) |
| 6 | รองรับหลายสาย | 🟡 | ประชิด / กระสุน / เวทวงกว้าง / DoT (ไฟ, พิษ) / แท็งก์-การ์ด (Ward + Spiked Ward) / ฮีล / คุม (Frost slow, taunt) · ยังไม่มี Summon และ Buff/Aura เต็มรูป |
| 6 | Party / Build ที่เล่นร่วมกัน | 🟡 | Ward และ Healing Spring ออกแบบให้มีผลกับทุกคนในวงแล้ว แต่ Demo ยังเล่นคนเดียว ยังไม่มีเพื่อนร่วมทีม |
| 7 | Skill Core + Mod ตาม Tag | ✅ | `data/mods.json`, `core/skills.js` · มี 9 Mod รวม Trigger (Cast on Dodge) |
| 8 | อัป Skill/Mod ด้วยของจากโลก | ✅ | อัปสกิลใช้ Material ตามสาย อัป Mod ใช้ Ruin Shard + Glow Dust (ที่โต๊ะคราฟต์) · ยังไม่มี Mastery (ตั้งใจเลื่อนไว้) |
| 9 | Character Level → Stat Points, Stat เป็นเงื่อนไข | ✅ | STR/AGI/VIT/INT/DEX · สกิล Mod และอาวุธบางชิ้นต้องมี Stat ถึง · ตัวเลขยังเป็นค่าชั่วคราว |
| 10 | Job Level → Job Points → Job Tree | ✅ | `data/jobtree.json` 4 สาย (Vanguard, Arcanist, Ranger, Warden) |
| 11 | เลือก Job ทีหลัง | ✅ | โหนด Job เปิดที่ Job Lv.5 เลือกได้สายเดียว |
| 12 | Respec ด้วยเงินในเกม | ✅ | รีแต้ม Stat และ Job ในนิคม ใช้ Gold อย่างเดียว |
| 13 | มอนดรอป Material ของตัวเอง | ✅ | รูปร่างมอนบอกของที่ดรอป (งา, กระดอง, แกนเรืองแสง, เขา) · มี test ยืนยันว่า Material ทุกชิ้นมีที่ใช้ |
| 14 | Craft ได้ Grade สุ่ม + Option / ตีบวกแยก | ✅ | Grade C/B/A/S, Option pool ตามสูตร, ตีบวก +1..+5 ด้วย Ruin Shard · ยังไม่มีสำเร็จ/ล้มเหลว |
| 15 | Economy loop | 🟡 | ฟาร์ม → Material → คราฟต์/อัป/ขาย NPC · ยังไม่มีเทรดระหว่างผู้เล่น (ต้องมี server) |
| 16 | Theme "Fantasy Frontier" | ✅ | นิคมชายแดนที่ธรรมชาติยึดคืน ซากอารยธรรมเก่า |
| 17 | Demo 1 แมพที่มี Journey | ✅ | เมือง → ทุ่งหญ้า → ป่า → แม่น้ำ/ที่ชุ่มน้ำ → ซาก → บอส |
| 18 | Art direction (อนิเมะ cel-shade, 6–7 หัว, กล้องสูง) | 🟡 | ใช้โมเดลที่สร้างจากโค้ด (สัดส่วนและสีตามภาพอ้างอิง) เป็นงานร่าง ควรแทนด้วยโมเดลจริงก่อนเปิดตัว |
| — | MMO online / Party จริง / Trade / Guild / PvP / Raid | ⬜ | นอกขอบเขต Demo ตามเอกสาร |

## ค่าที่ยังเป็นค่าชั่วคราว (ปรับได้ใน `data/`)

- ตัวเลขดาเมจ/HP/EXP, จำนวนแต้มต่อเลเวล และเลเวลสูงสุด อยู่ใน `progression.json`
- จำนวนช่อง Mod ต่อสกิล (ตอนนี้ 2) อยู่ใน `mods.json` → `maxModsPerSkill`
- น้ำหนักการสุ่ม Grade และจำนวน Option อยู่ใน `items.json` → `grades`
- ชื่อแมพ ชื่อ Job และชื่อมอน ทั้งหมดเป็นชื่อชั่วคราว
