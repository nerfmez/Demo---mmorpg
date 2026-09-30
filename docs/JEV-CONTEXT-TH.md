# ใช้ Jev ร่วมกับ ChatGPT และ Claude

Jev เป็นตัวคัดบริบทก่อนเริ่มงาน ไม่ใช่โมเดลเขียนโค้ดหรือผู้อนุมัติอาร์ต ระบบนี้อยู่ในเครื่องมือพัฒนาเท่านั้น ไม่รวมอยู่ในเกมหรือหน้า GitHub Pages

## ใช้จากแชทตามปกติ

หลังเก็บ `TYPESAFE_API_KEY` เป็น repository Secret แล้ว ผู้ใช้สั่งงานกับ ChatGPT หรือ Claude ตามปกติ Agent เป็นผู้ส่งคำขอ เรียก Jev และอ่านผลกลับเอง ไม่ต้องให้ผู้ใช้เปิด Actions กด Run workflow หรือคัดลอกรายงาน คีย์อยู่ใน GitHub ตลอด

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

## ลำดับทำงาน

- ค้นจากไฟล์ที่ Git ติดตามใน `src/`, `data/`, `docs/`, ชุดทดสอบ และเอกสารหลักที่อนุญาต ไม่มีไฟล์ `.env`, รูปภาพ, binary, output หรือ untracked files
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

Jev รับข้อความเท่านั้น งานรูปทรง ใบไม้ สี UI และเอฟเฟกต์ยังต้องใช้ Dreamloop และดูภาพจริง ผู้ใช้ต้องเห็นภาพก่อน merge งานภาพตามข้อตกลงเดิม

## การทดสอบและการพัฒนาต่อ

`npm run test:tools` ทดสอบการคัดบริบท การกันไฟล์ลับ path escape, payload limit, cache invalidation, malformed responses และ monthly allowance โดยไม่ใช้คีย์หรือเครือข่าย

PR ที่แก้เครื่องมือนี้รันทดสอบแบบไม่เสียเงินเสมอ เฉพาะ branch ภายในชื่อขึ้นต้น `codex/jev-` มี live setup check หนึ่ง request เพื่อยืนยัน Secret/API กับโจทย์ HUD ตัวอย่าง ไม่ส่ง Secret ให้ fork

ทดลอง 30 งาน เทียบ keyword search อย่างเดียวกับ keyword search + Jev วัดเวลารวม จำนวนรอบค้นเพิ่ม ปริมาณบริบทที่โมเดลใหญ่ต้องอ่าน และข้อกำหนดตกหล่น รายงาน excerpt bytes เป็นเพียงปริมาณข้อความ ไม่ใช่เปอร์เซ็นต์ประหยัด token ทั้ง session หรือโควตาสมาชิก

เป้าหมายทดลอง: ลดบริบท 30% ลดเวลารวม 20% โดยไม่เพิ่มงานแก้ซ้ำ ยังไม่ได้ยืนยันผลนี้ ตัวคัด log และการตรวจความหมายคอนเทนต์เป็นงานถัดไป ไม่รวมอยู่ในเวอร์ชันนี้

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
