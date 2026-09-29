# สถานะเทียบกับเอกสารออกแบบ

อ้างอิงหัวข้อใน [`DESIGN-SUMMARY-TH.txt`](DESIGN-SUMMARY-TH.txt)
✅ = ทำแล้วใน Demo · 🟡 = มีแบบพื้นฐาน / ใช้ค่าชั่วคราว · ⬜ = ยังไม่ทำ (ตั้งใจเลื่อนไว้)

| # | หัวข้อ | สถานะ | อยู่ที่ไหน / หมายเหตุ |
|---|---|---|---|
| 2 | มุมกล้อง 3/4, รองรับ PC + มือถือ | ✅ | `render/view.js` (กล้องสูงแบบ ARPG), `ui/input.js` (เมาส์/คีย์บอร์ด + จอย/ปุ่มสัมผัส) |
| 3 | Soft Targeting | ✅ | `core/targeting.js` + `game.js`: การโจมตีแบบกด/แตะอัตโนมัติเลือกศัตรูที่ใกล้ที่สุดซึ่งอยู่ในระยะจริงของสกิล โดยไม่สนทิศที่ตัวละครหันหรือกำลังเดิน; การเล็งด้วยเมาส์/ลากสกิลเป็น manual override และตัวละครไม่วิ่งตามเป้า |
| 4 | Basic Attack เป็นสกิลที่ถอดได้ | ✅ | Slash อยู่ในช่องสกิลปกติ ปล่อยช่องว่างได้ |
| 5 | Movement Skill แยกช่อง ใช้ชาร์จ | ✅ | Dash (2 ชาร์จ), Roll (อมตะ), Blink และ Leap Slam (เรียนที่โต๊ะคราฟต์) |
| 6 | รองรับหลายสาย | ✅ | ประชิด (รวม Whirl Blade) / กระสุน (ธนู, ลูกไฟ) / สายฟ้าโซ่ / เวทวงกว้าง / DoT (ไฟ, บึงพิษ) / คำสาป (Hex) / แท็งก์-การ์ด / ฮีล / คุม (Frost Nova, taunt) / Buff (War Cry) / Summon (Spirit Wolf) · ยังไม่มี Aura ถาวร |
| 6 | Party / Build ที่เล่นร่วมกัน | 🟡 | Ward และ Healing Spring ออกแบบให้มีผลกับทุกคนในวงแล้ว แต่ Demo ยังเล่นคนเดียว ยังไม่มีเพื่อนร่วมทีม |
| 7 | Skill Core + Mod ตาม Tag | ✅ | `data/mods.json`, `core/skills.js` · มี 15 Mod รวม Trigger (Cast on Dodge), Multistrike, Knockback, Pack Leader |
| 8 | อัป Skill/Mod ด้วยของจากโลก | ✅ | อัปสกิลใช้ Material ตามสาย อัป Mod ใช้ Ruin Shard + Glow Dust (ที่โต๊ะคราฟต์) · ยังไม่มี Mastery (ตั้งใจเลื่อนไว้) |
| 9 | Character Level → Stat Points, Stat เป็นเงื่อนไข | ✅ | STR/AGI/VIT/INT/DEX · สกิล Mod และอาวุธบางชิ้นต้องมี Stat ถึง · ตัวเลขยังเป็นค่าชั่วคราว |
| 10 | Job Level → Job Points → Job Tree | ✅ | `data/jobtree.json` 87 โหนด · หน้ารวม 10 บทธีมการเดินทาง · ภายในแต่ละบทแบ่งเป็นขั้น I–IV โดยขั้นลึกขึ้นต้องลงทุน Job Points ในขั้นก่อนหน้าของบทนั้นให้ถึงจำนวนที่กำหนด ไม่บังคับเส้นเดียว · อาชีพหลัก 4 สาย (Vanguard, Arcanist, Ranger, Warden) |
| 11 | เลือก Job ทีหลัง | ✅ | โหนด Job เปิดที่ Job Lv.5 เลือกได้สายเดียว |
| 12 | Respec ด้วยเงินในเกม | ✅ | รีแต้ม Stat และ Job ในนิคม ใช้ Gold อย่างเดียว |
| 13 | มอนดรอป Material ของตัวเอง | ✅ | รูปร่างมอนบอกของที่ดรอป (งา, กระดอง, แกนเรืองแสง, เขา) · มี test ยืนยันว่า Material ทุกชิ้นมีที่ใช้ |
| 14 | Craft ได้ Grade สุ่ม + Option / ตีบวกแยก | ✅ | อุปกรณ์ 5 ช่อง (อาวุธ เกราะ หมวก รองเท้า เครื่องราง) กว่า 30 แบบ · อาวุธ 7 ประเภทมีโบนัสในตัว · Grade C/B/A/S, Option pool ตามสูตร, ตีบวก +1..+5 · ยังไม่มีสำเร็จ/ล้มเหลว |
| 15 | Economy loop | 🟡 | ฟาร์ม → Material → คราฟต์/อัป/ขาย NPC · ยังไม่มีเทรดระหว่างผู้เล่น (ต้องมี server) |
| 16 | Theme "Fantasy Frontier" | ✅ | นิคมชายแดนที่ธรรมชาติยึดคืน ซากอารยธรรมเก่า |
| 17 | Demo 1 แมพที่มี Journey | ✅ | แมพ 448×352 ม. มีเนิน ที่ราบสูง หน้าผา ทางลาด · 9 พื้นที่ รวมชายฝั่งติดทะเล · หินวาร์ป 8 จุด · มอน ~280 ตัว · ภารกิจหลัก 7 + รอง 9 (`data/quests.json`, `core/quests.js`) · มินิบอส Greyfang และบอส Horned Warden |
| — | หน้าแรก สร้างตัวละคร เซฟ/ความคืบหน้า | ✅ | `ui/menu.js`, `save.js` · 3 ช่องเซฟ โค้ดย้ายเครื่อง บันทึกตำแหน่ง/เควส/หินวาร์ป/เวลาเล่น · ปรับหน้าตาได้ ไม่ต้องเลือก Job ตอนสร้าง |
| 18 | Art direction (อนิเมะ cel-shade, 6–7 หัว, กล้องสูง) | 🟡 | ใช้โมเดลที่สร้างจากโค้ด (สัดส่วนและสีตามภาพอ้างอิง) เป็นงานร่าง ควรแทนด้วยโมเดลจริงก่อนเปิดตัว |
| — | MMO online / Party จริง / Trade / Guild / PvP / Raid | ⬜ | นอกขอบเขต Demo ตามเอกสาร |

## ค่าที่ยังเป็นค่าชั่วคราว (ปรับได้ใน `data/`)

- ตัวเลขดาเมจ/HP/EXP, จำนวนแต้มต่อเลเวล และเลเวลสูงสุด อยู่ใน `progression.json`
- จำนวนช่อง Mod ต่อสกิล (ตอนนี้ 2) อยู่ใน `mods.json` → `maxModsPerSkill`
- น้ำหนักการสุ่ม Grade และจำนวน Option อยู่ใน `items.json` → `grades`
- ชื่อแมพ ชื่อ Job และชื่อมอน ทั้งหมดเป็นชื่อชั่วคราว

## อาร์ตและการใช้งาน · 28 กันยายน 2026

- ภาพเฉพาะ 187 แบบ: อุปกรณ์ 34, วัตถุดิบ 17, สกิลรวมเคลื่อนที่ 17, ม็อด 15, มอน 9, พื้นที่ 8 และโหนดพาสซีฟ 87 (`ui/art.js`, `ui/jobart.js`)
- รูปทรงแยกตามชื่อ/ชนิด; ของฐานเดียวกันต่างเกรดใช้ภาพเดียวกัน แสดงเกรดและตีบวกแยกจากภาพ
- กระเป๋าใช้ตารางรูปใหญ่และรายละเอียดพร้อมปุ่มใช้งาน; มือถือเปิดรายละเอียดเป็นหน้าเดียวพร้อมปุ่มกลับ
- สกิลเลือกจากภาพ, ม็อดมีภาพพฤติกรรมเฉพาะ, ช่องเคลื่อนที่แยก; อาชีพแสดงเป็นเครือข่าย ลาก/ซูมได้ และมีเส้นทางร่วม
- แผนที่วาดจากตำแหน่งจริง พร้อมข้อมูลมอน/ของดรอปประจำพื้นที่; เลือกจุดก่อนกดเดินทาง
- รูปวัตถุดิบบนพื้นตรงกับกระเป๋า; อุปกรณ์ชื่อใหม่มีรูปทรงตอนสวมต่างกันด้วย (`render/equipment.js`)
- ดูสูตรคราฟต์ได้ทุกที่ แต่คราฟต์/อัปเกรดได้เมื่ออยู่ใกล้โต๊ะตามเดิม
- เซฟยังเป็น version 2; เพิ่มเครือข่ายร่วมและโหนดเฉพาะอาชีพ โดยเก็บ ID/ผลของโหนดเดิม

## เครือข่ายและงานฉาก · Dreamloop

- เลือกโหนดเพื่อดูข้อมูล แสดงเส้นทาง/จำนวนแต้มที่ต้องใช้; กดลงแต้มแยก ปุ่มลัดพาไปแต่ละอาชีพ
- ลากและสองนิ้วซูมเครือข่ายได้; จุดเริ่ม/ดูทั้งหมด/บวก/ลบใช้ได้ทั้งเมาส์และสัมผัส
- สายร่วมเพิ่มพิษ อัญเชิญ และการผสมบทบาท; เลือก Job หลักได้หนึ่งสาย โหนดเฉพาะต้องมี Job นั้น
- พุ่มใบไม้และสนใช้ภาพใบโปร่งใสที่วาดใน Canvas ครั้งเดียวร่วมกับโมเดลกิ่ง; หญ้า/กลีบดอก/มอส/ผิวดิน/ปูหิน/น้ำปรับใหม่
- ตรวจภาพจุดเดิม 7 จุด ร่วมกับการลงแต้ม/ซูม/ยกเลิกสัมผัส และตรวจ WebKit บน URL จริงหลังเผยแพร่

## Seeker UI workspaces · September 2026

- Combat loadout, modifier management, movement and material upgrades are separate pages.
- Passive presentation: ten categories and four specialization subviews; 87 total nodes (61 preserved + 26 optional additions).
- Native skill tags are always visible; mod all/any/excluded rules, missing stats, slot capacity and current assignment are shown.
- New lasting-field damage/duration and control-duration passives are implemented; unsupported DoT/on-hit combinations are explicitly excluded.
- See `UI-WORKSPACES.md` for source references, exact effect scope, save compatibility and the test commands.


## Fullscreen travel journal, passive stages and engraved modifier gems (2026-09-29)

The passive UI is an edge-to-edge paper/ink travel journal. Chapter names are travel-themed and each chapter mixes several useful effects. The 87 passive nodes now also have stage metadata: later stages unlock by the number of Job Points already invested in earlier stages of that same chapter, rather than forcing one exact branch. Profession stages count inside their own oath only. All fifteen modifier items use shared faceted gems with monochrome engravings. See `docs/UI-WORKSPACES.md` and the browser/core tests.

## Clean field HUD — 29 September 2026

The approved navy/silver gameplay reference is implemented by `ui/fieldhud.css` and
`ui/fieldhud.js`: compact status/minimap/quests, white/cyan symbols, right-hand combat
controls on both input modes, and separate bottom EXP/Job tracks. No scene/camera/model
or combat/passive-rule changes. The four combat slots and separate movement slot remain
functional; no fake potion or persistent-lock controls. See `COMBAT-HUD.md`.
