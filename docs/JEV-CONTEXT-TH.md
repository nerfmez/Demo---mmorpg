# ใช้ Jev ร่วมกับ ChatGPT และ Claude

Jev เป็นตัวคัดบริบทสำหรับเริ่มงาน ไล่บั๊ก ตรวจผลกระทบ และวางแผนระบบที่เกี่ยวข้องกัน ไม่ใช่โมเดลเขียนโค้ดหรือผู้อนุมัติอาร์ต ระบบนี้อยู่ในเครื่องมือพัฒนาเท่านั้น ไม่รวมอยู่ในเกมหรือหน้า GitHub Pages

## ใช้จากแชทตามปกติ

หลังเก็บ `TYPESAFE_API_KEY` เป็น repository Secret แล้ว ผู้ใช้สั่งงานกับ ChatGPT หรือ Claude ตามปกติ เมื่อมีปัญหาค้นหา source ที่ Jev ช่วยได้ Agent เป็นผู้ส่งคำขอและอ่านผลกลับเอง ไม่ต้องให้ผู้ใช้เปิด Actions กด Run workflow หรือคัดลอกรายงาน คีย์อยู่ใน GitHub ตลอด

`AGENTS.md` กำหนดขั้นตอนร่วมกัน และ `CLAUDE.md` นำเข้าไฟล์นี้ ฝั่ง client ต้องมีเครื่องมือ GitHub ที่เขียน branch/file และอ่าน Actions ได้ หรือใช้ Git credentials ปกติ การมีเอกสารอย่างเดียวไม่ได้เพิ่มสิทธิ์ให้ client ที่ไม่มีเครื่องมือดังกล่าว

## ช่องทางเรียกสำหรับ agent

1. อ่าน SHA ของ source ที่จะทำงานให้เป็น commit 40 ตัวอักษร และ SHA ของ `main` ล่าสุดสำหรับสร้าง branch คำขอ
2. สร้าง branch ใหม่ `jev/request/<id>` จาก main โดย id เป็นตัวอักษรเล็ก ตัวเลข หรือขีด ความยาวไม่เกิน 80 ตัว และไม่ซ้ำ
3. commit ไฟล์ `jev-request.json` ที่ root ของ branch นี้เท่านั้น ตัวอย่าง:

```json
{
  "version": 1,
  "id": "chatgpt-shrubs-20260930",
  "agent": "chatgpt",
  "task": "ปรับพุ่มไม้ให้ทรงไม่เหมือนใบไม้เรียงกัน รักษาสีเดิม",
  "keywords": "foliage bush nature leafpaint",
  "source_commit": "ใส่ SHA จริง 40 ตัวอักษรของ source"
}
```

`agent` ใช้ `chatgpt` หรือ `claude`; task ไม่เกิน 2,400 UTF-8 bytes และ keywords ไม่เกิน 1,200 bytes ไม่รับ field อื่น ไม่ใส่คีย์หรือข้อมูลลับ เพราะ repo นี้เป็น public ไม่ merge branch คำขอเข้า main

4. push/commit ผ่าน GitHub connector หรือ GitHub App/PAT ที่ใช้อยู่ การเปลี่ยนไฟล์นี้เรียก **Jev Context** อัตโนมัติ CI เกมจะไม่รันบน branch คำขอ ห้ามใช้ `GITHUB_TOKEN` ของ Actions เพื่อ push แล้วคาดหวัง workflow รอบใหม่
5. อ่านรอบจาก `GET /repos/nerfmez/Demo---mmorpg/actions/runs?head_sha=<SHA ของ commit คำขอ>&per_page=20` และเลือกชื่อ Jev Context ต้องเป็นรายการ push runs ไม่ใช่ wrapper ที่กรองเฉพาะ PR
6. เมื่อรอบจบ อ่าน log ของ context job ขั้น **Rank relevant source with Jev** ซึ่งมี `context.md` เต็ม หรืออ่าน artifact `jev-context-<run id>-<attempt>` ที่มี `context.md`/`context.json` Agent อ่านเองและตรวจ sourceCommit, task และสถานะก่อนใช้งาน

Workflow อ่านคำขอเป็นข้อมูลและเรียกสคริปต์จาก main ที่ตรวจแล้ว ตรวจ schema ก่อน checkout source SHA ไม่รันโค้ดเกมที่แนบมาใน branch คำขอ หากไม่มีเครื่องมือเขียน GitHub ให้ agent แจ้งข้อจำกัดตรงนั้นและค้นแบบ offline โดยไม่อ้างว่าใช้ Jev

GitHub concurrency เก็บได้หนึ่งรอบกำลังรันและหนึ่งรอบรอ รอบรอเก่าอาจถูกยกเลิกเมื่อมีคำขอเพิ่ม Agent ต้องตรวจสถานะและส่งใหม่ด้วย id ใหม่เมื่อจำเป็น ไม่มีการ retry API อัตโนมัติ

Manual **Actions → Jev Context → Run workflow** ยังใช้ตรวจปัญหาได้ โดยเลือกเครื่องมือจาก main และกรอก task, keywords, target_ref แต่ไม่ใช่ขั้นตอนที่ผู้ใช้ต้องทำในการทำงานจากแชท

API reference: https://docs.typesafe.ai/api
Pricing/model/input limits: https://docs.typesafe.ai/models

## เลือกใช้เมื่อยังค้นหา source ที่เกี่ยวข้องไม่ครบ

เริ่มจาก `rg` และอ่านไฟล์ที่ทราบก่อน จำนวนไฟล์ไม่ใช่เหตุผลบังคับเรียก Jev งานเอกสาร วางแผน หรือแก้เล็กที่รู้ contract แล้วไม่ต้องเรียก ใช้ตารางนี้เมื่อยังมีปัญหาค้นหา source ที่การจัดอันดับช่วยได้ โดยใช้ schema version 1 เดิม:

| งาน | ข้อมูลที่ใส่ใน task / keywords | สิ่งที่ agent ต้องตรวจต่อ |
|---|---|---|
| ไล่บั๊ก | วิธีทำซ้ำ ผลที่ควรได้/ผลจริง อุปกรณ์และ browser/engine ข้อความ error สั้น ๆ ที่ลบข้อมูลลับแล้ว; ชื่อไฟล์ ฟังก์ชัน และ test | ทำให้เกิดปัญหาจริง อ่าน implementation/callers เต็ม และยืนยันสาเหตุด้วยการทดสอบที่เกี่ยวข้อง |
| ตรวจผลกระทบก่อนส่งงาน | สรุป diff, path/symbol/content ID ที่เปลี่ยน และ consumers ที่สงสัย | ใช้ `rg` ตาม references ตรวจ data/core/render/UI/save migration/tests และเอกสารพอร์ตที่ได้รับผลกระทบ แก้จุดตกหล่นก่อนส่ง |
| วางแผนฟีเจอร์หลายระบบหรือพอร์ต Godot | เป้าหมาย ขอบเขต ข้อจำกัด และระบบที่ต้องเชื่อมกัน; ชื่อ contract/event/schema ที่รู้แล้ว | อ่านสัญญาและ extension points จริง วางลำดับ data/core/render/UI/save/tests พร้อมอัปเดต `docs/GODOT-PORT.md` เมื่อกติกาเปลี่ยน |

ตัวอย่างด้านล่างเป็นคู่ `task` / `keywords` สำหรับใส่ในคำขอเต็มตาม schema ข้างต้น เลือกเฉพาะอาการและชื่อที่เกี่ยวกับงานจริง แล้วกำหนด id ใหม่และ source_commit จริงของงานนั้น:

ไล่บั๊กจากอาการสัมผัส:

```json
{
  "task": "Investigate touch click-through: on iPad/WebKit, tapping an empty combat slot opens the skills menu and selects an item with the same tap. Expected: only open the menu. Locate input handlers and relevant tests; verify the cause before fixing.",
  "keywords": "src/ui/fieldhud.js pointerup click empty slot touch tests/browser/fieldhud.mjs"
}
```

ตรวจ references หลังเพิ่มมอนและวัตถุดิบ:

```json
{
  "task": "Locate consumers and verification for monster, material and recipe changes before delivery: check spawns, part drops, crafting uses, render/UI artwork, quests and saved content IDs. Return candidate source to inspect; do not assume the list is complete.",
  "keywords": "data/monsters.json data/items.json data/recipes.json src/ui/art.js monsters material recipe tests/core/data.test.js tests/core/presentation.test.js"
}
```

วางแผนระบบร่วมและพอร์ต:

```json
{
  "task": "Plan a Godot-portable quest feature spanning data, core events, UI and character saves. Locate current quest contracts, seeded rules, save migration and test examples. Preserve core independence from DOM/Three and document the verified port boundaries.",
  "keywords": "quest game.events src/core migrateCharacter version character save tests/core docs/GODOT-PORT.md"
}
```

เริ่มด้วยคำขอเดียวที่รวมคำถามเกี่ยวข้องกัน ก่อนส่งงานให้ตรวจ diff และผลกระทบเสมอ หากบริบทแรกครอบคลุมแล้วไม่ต้องเรียกซ้ำทุกไฟล์/ทุกการแก้ เพิ่มคำขอเฉพาะเมื่อเจอ failure ใหม่ ขอบเขตหรือ source เปลี่ยน หรือหลักฐานยังขาด โดยยังใช้เพดานงบเดิม

การตรวจหลังแก้ต้องอ้าง commit snapshot ที่ push ขึ้น GitHub แล้วด้วย SHA จริง Jev ไม่เห็น diff ที่ยังไม่ commit หรือไฟล์ untracked ระหว่างแก้ให้ใช้ `git diff`, `rg` และอ่าน source โดยตรง ห้ามอ้างว่ารายงานจาก commit ก่อนหน้าได้ตรวจโค้ดใหม่แล้ว

ข้อความ error ใน task เป็นข้อมูลย่อที่ agent เลือกเอง ไม่ใช่ระบบส่ง/คัด raw logs อัตโนมัติ คำขออยู่ใน public repo จึงต้องลบคีย์ token ข้อมูลส่วนตัว และไม่แนบ log ทั้งก้อน Jev เพียงจัดอันดับ source ที่เกี่ยวข้อง ไม่วิเคราะห์สาเหตุ ไม่สร้าง dependency graph และไม่รับรองความครบถ้วนหรือความถูกต้องของแผน

## ส่งต่อให้ agent ถัดไป

บันทึกใน PR description หรือ handoff ของงานนั้น:

- source SHA ที่รายงานอ่าน พร้อม task และ keywords ที่ส่งจริง
- ลิงก์ request branch และ Actions run; status, cache hit และ API usage/cost estimate ตามรายงาน ถ้ามี
- ไฟล์เต็มที่เปิดตรวจจริง และ references ที่ยืนยันแล้ว แยกจาก shortlist ที่ยังไม่ได้ตรวจ
- ผลกระทบหรือข้อสงสัยที่ยังเหลือ ขั้นตอนทำซ้ำ และข้อจำกัดของสภาพแวดล้อม
- คำสั่งทดสอบและผลจริง รวมภาพที่ตรวจ/สถานะ owner review เมื่องานมีการเปลี่ยนภาพ

agent ถัดไปเริ่มจาก [AGENTS.md](../AGENTS.md) และ [HANDOFF.md](HANDOFF.md), fetch source ล่าสุด และเทียบ SHA/task/keywords ก่อนใช้รายงาน หาก source หรืองานต่างกันห้ามอ้างว่ารายงานเก่าตรวจงานใหม่แล้ว ใช้ diff/search ตรงกับส่วนที่เปลี่ยนก่อน เรียกใหม่เฉพาะเมื่อยังขาดบริบทและ Jev ช่วยได้ อย่าใช้เพียงชื่อ branch ตัดสินว่า cache ใช้ได้

## ลำดับทำงาน

- ค้นจากไฟล์ที่ Git ติดตามใน `src/`, `data/`, `docs/`, `tests/core/`, `tests/browser/` และเอกสารหลักที่อนุญาต ไม่มีไฟล์ `.env`, รูปภาพ, binary, output หรือ untracked files; `scripts/`, `tests/tools/`, workflows และ `docs/JEV-CONTEXT-TH.md` ไม่อยู่ใน index ปัจจุบัน งานเครื่องมือ/คำขอ Jev จึงต้องอ่านไฟล์เหล่านี้โดยตรง
- ใช้คำค้นและคำเทียบไทย/อังกฤษสร้าง shortlist ไม่เกิน 12 ช่วงข้อความ และไม่เกิน 2 ช่วงต่อไฟล์
- ส่งข้อความที่คัดแล้วให้ `jev-1.13.0` ประเมินความเกี่ยวข้องของแต่ละช่วงด้วย Noul หลายคำถามใน request เดียว ไม่ให้สร้างสรุปหรือโค้ด
- คำตอบเลือกข้อความต้นฉบับสูงสุด 6 ช่วง โดยยังแสดงผู้สมัครที่เหลือ ข้อกำหนด `AGENTS.md` รวมครบเสมอ
- รายงานระบุ source commit, line ranges, file hashes, model, API usage และสถานะ ต้องเปิดไฟล์เต็มและ dependencies ก่อนแก้โค้ด
- cache ตรงกับ task, keywords, source commit, เนื้อหา และเวอร์ชันสคริปต์เท่านั้น ใช้ซ้ำได้โดยไม่เสียค่า Jev เพิ่ม ไม่ใช้ผลจาก branch/commit อื่นแทน

## งบทดลอง $10/เดือน

- workflow กันงบไว้ $0.01 ต่อ run attempt รวมรอบที่ล้มเหลว รอบที่ใช้ cache และการ rerun อย่างระมัดระวัง และหยุดก่อนยอดกันงบถึง $8 ต่อเดือน UTC เหลือ $2 สำรอง
- ใช้ metadata ของ Actions ชื่อ `Jev Context` ทุกรอบ รวม PR, branch และรอบเก่าที่ rerun เดือนนี้ ถ้าอ่านประวัติไม่ครบหรือจำนวนประวัติรวมเกิน 2,000 รอบ จะหยุดก่อนเรียก API
- concurrency ให้รันทีละรอบ ไม่มีการ retry API อัตโนมัติ อนุญาต request เดียวไม่เกิน 24,000 UTF-8 bytes ต่อรอบ
- ค่า API ประเมินจาก `usage.input_tokens × $0.042 / 1,000,000` ตามราคาที่ตรวจวันที่ 30 กันยายน 2026 output ฟรี ตรวจราคาใหม่ก่อนเปลี่ยนโมเดล
- ยอดกันงบไม่ใช่ยอดเรียกเก็บจริงของผู้ให้บริการ ราคา/การ tokenize/ค่าธรรมเนียมขึ้นกับผู้ให้บริการ หน้าบิล TypeSafe เป็นแหล่งอ้างอิงสุดท้าย
- การเรียกนอก workflow นี้และการเปลี่ยนชื่อ workflow ไม่อยู่ในตัวนับนี้ อย่าเรียกคีย์เดียวกันจากระบบอื่นโดยไม่ติดตามงบรวม
- ไม่มีค่า API ของ ChatGPT/Claude เพิ่มจาก workflow นี้ ทั้งสอง agent ใช้ช่องทางเดิมของผู้ใช้ GitHub runner/cache/artifact billing เป็นคนละส่วน

## สถานะและข้อจำกัด

- `jev`: ได้คะแนนจาก API หรือ cache ที่ตรงกัน
- `offline`: เลือกด้วยคำค้นอย่างเดียว ไม่มีการเรียก API
- `fallback`: API/Secret/budget/response มีปัญหา มีบริบทจากคำค้นให้ตรวจ แต่ workflow จบเป็น failure เพื่อไม่อ้างว่า Jev ทำงานสำเร็จ
- `no-candidates`: ค้นไม่พบ เพิ่ม keywords หรือใช้การค้นปกติ
- `low-signal`: คะแนนไม่มีสัญญาณความเกี่ยวข้องที่ชัด ต้องค้นเพิ่ม ไม่ใช้ผลนี้อนุมัติการแก้

shortlist อาจตกหล่นไฟล์สำคัญ และคะแนนยังไม่ได้ปรับเทียบกับงานเกมเรา ห้ามตีความว่าไฟล์ที่ไม่ถูกเลือกไม่เกี่ยวข้อง อย่าเปลี่ยนเกณฑ์ทดสอบหรือข้ามการตรวจภาพตามคะแนน Jev

Jev รับข้อความเท่านั้น งานภาพต้องเปิดดูภาพจากเกมจริง เลือก focused capture ตามส่วนที่เปลี่ยน; Dreamloop/ภาพทั่วแมพใช้เมื่อผลกระทบกว้างหรือมีหลักฐานจำเป็นตาม AGENTS.md ส่ง draft/ภาพให้ผู้ใช้ตรวจได้ก่อนชุดเต็ม แต่ต้องผ่าน checks ที่เกี่ยวข้องก่อน merge

## การทดสอบและการพัฒนาต่อ

`npm run test:tools` ทดสอบการคัดบริบท การกันไฟล์ลับ path escape, payload limit, cache invalidation, malformed responses และ monthly allowance โดยไม่ใช้คีย์หรือเครือข่าย

PR ที่แก้เครื่องมือนี้รันทดสอบแบบไม่เสียเงินเสมอ เฉพาะ branch ภายในชื่อขึ้นต้น `codex/jev-` มี live setup check หนึ่ง request เพื่อยืนยัน Secret/API กับโจทย์ HUD ตัวอย่าง ไม่ส่ง Secret ให้ fork

ทดลอง 30 งาน เทียบ keyword search อย่างเดียวกับ keyword search + Jev วัดเวลารวม จำนวนรอบค้นเพิ่ม ปริมาณบริบทที่โมเดลใหญ่ต้องอ่าน และข้อกำหนดตกหล่น รายงาน excerpt bytes เป็นเพียงปริมาณข้อความ ไม่ใช่เปอร์เซ็นต์ประหยัด token ทั้ง session หรือโควตาสมาชิก

เป้าหมายทดลอง: ลดบริบท 30% ลดเวลารวม 20% โดยไม่เพิ่มงานแก้ซ้ำ ยังไม่ได้ยืนยันผลนี้ ตัวคัด raw logs อัตโนมัติและการตรวจความหมายคอนเทนต์เป็นงานถัดไป ไม่รวมอยู่ในเวอร์ชันนี้ การเพิ่มแนวทางสามงานข้างต้นใช้ตัวค้น source เดิม ไม่ได้เพิ่มความสามารถเหล่านั้น

## รันบนเครื่องของ agent

ใช้ clean checkout ที่ commit แล้ว และตั้ง `TYPESAFE_API_KEY` ใน environment โดยผู้ใช้เอง:

```sh
JEV_TASK='ปรับพุ่มไม้ รักษาสีเดิม' JEV_KEYWORDS='foliage bush nature leafpaint' npm run jev:context
```

ทดสอบการค้นหาโดยไม่เรียก API:

```sh
JEV_TASK='Fix EXP and Job EXP HUD' npm run jev:context -- --offline
```

การรันบนเครื่องไม่ผ่านตัวนับงบ GitHub จึงต้องติดตามค่าใช้จ่ายแยก หากไม่มีคีย์ให้ใช้ `--offline` และระบุชัดว่าไม่ได้ใช้ Jev
