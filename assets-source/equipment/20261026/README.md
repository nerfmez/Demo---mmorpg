# Equipment turnaround archive — 2026-10-26

ภาพต้นแบบเครื่องแต่งกาย 13 ชุด มุมหน้า เฉียง ข้าง และหลัง บนตัวละครเบส สำหรับตรวจแบบต่อจาก PR #152

ไฟล์ 3 ชุดที่ผู้ใช้เลือกไว้ล่าสุดใช้ภาพแนบต้นฉบับโดยตรง ได้แก่ ชุดแสงวิญญาณ ชุดปีกกระจก และชุดก้าวเฟิร์น ซึ่งทั้งสามแบบมีกางเกงตามภาพที่เลือก ไม่มีการสร้างภาพใหม่ทับ

## ชุดและไฟล์ต้นแบบ

| ชุด | ภาพ 4 มุม | รายการชิ้น | ที่มา |
| --- | --- | --- | --- |
| ชุดเดินทาง | [travel](./turnarounds/travel-turnaround.png) | `travel_tunic`, `travel_cap`, `travel_gloves`, `travel_boots` | ภาพร่างที่สร้างในรอบนี้ |
| ชุดหนังหมูป่า | [boarhide](./turnarounds/boarhide-turnaround.png) | `hide_vest`, `leather_cap`, `hide_gloves`, `boarhide_boots` | ภาพร่างที่สร้างในรอบนี้ |
| ชุดกระดองด้วง | [beetle](./turnarounds/beetle-turnaround.png) | `shell_guard`, `beetle_helm`, `beetle_gloves`, `beetle_boots` | ภาพร่างที่สร้างในรอบนี้ |
| ชุดกระดองปู | [crabshell](./turnarounds/crabshell-turnaround.png) | `crabshell_vest`, `crabshell_helm`, `shell_mitts`, `tide_boots` | ภาพร่างที่สร้างในรอบนี้ |
| ชุดสปอร์ | [spore](./turnarounds/spore-turnaround.png) | `sporeweave_vest`, `spore_hood`, `sporeweave_gloves`, `sporeweave_boots` | ภาพร่างที่สร้างในรอบนี้ |
| ชุดพายุ | [storm](./turnarounds/storm-turnaround.png) | `storm_mantle`, `feather_circlet`, `storm_gloves`, `gale_boots` | ภาพร่างที่สร้างในรอบนี้ |
| ชุดพรานผู้พิทักษ์ | [wardenstalker](./turnarounds/wardenstalker-turnaround.png) | `wardenstalker_coat`, `wardenstalker_hood`, `wardenstalker_gloves`, `wardenstalker_boots` | ภาพร่างที่สร้างในรอบนี้ |
| ชุดหนังหมาป่า | [wolfpelt](./turnarounds/wolfpelt-turnaround.png) | `wolfpelt_coat`, `wolfpelt_hood`, `wolf_grips`, `wolf_boots` | ภาพร่างที่สร้างในรอบนี้ |
| ชุดใบจันทร์ | [moonleaf](./turnarounds/moonleaf-turnaround.png) | `moonleaf_robe`, `moonleaf_cowl`, `moonleaf_gloves`, `moonleaf_slippers`, `moonleaf_pendant` | ภาพร่างที่สร้างในรอบนี้ |
| ชุดผู้พิทักษ์โพรง | [burrowguard](./turnarounds/burrowguard-turnaround.png) | `burrowguard_armor`, `burrowguard_helm`, `burrowguard_gloves`, `burrowguard_boots` | ภาพร่างที่สร้างในรอบนี้ |
| ชุดแสงวิญญาณ | [wisp](./turnarounds/wisp-turnaround.jpeg) | `wisp_robe`, `wisp_hood`, `wisp_wraps`, `wisp_boots`, `wisp_pendant` | ภาพที่ผู้ใช้เลือกและแนบล่าสุด |
| ชุดปีกกระจก | [mirrorwing](./turnarounds/mirrorwing-turnaround.jpeg) | `mirrorwing_robe`, `mirrorwing_hood`, `mirrorwing_gloves`, `mirrorwing_boots` | ภาพที่ผู้ใช้เลือกและแนบล่าสุด |
| ชุดก้าวเฟิร์น | [fernstep](./turnarounds/fernstep-turnaround.jpeg) | `fernstep_coat`, `fernstep_cap`, `fernstep_gloves`, `fernstep_boots` | ภาพที่ผู้ใช้เลือกและแนบล่าสุด |

## แยกรายชื่อไอเทม

ดู [`item-index.json`](./item-index.json) สำหรับชื่อไทย รหัส ช่องสวมใส่ และสถานะใน `data/items.json` ของแต่ละชิ้น หรือดูไฟล์แยกที่ [`items/`](./items/) ตามรหัสไอเทม ภาพไอคอนแต่ละชิ้นอยู่ใน `assets-source/equipment/20261025/icons/` ซึ่งเพิ่มไว้ใน PR #152 ภาพ 4 มุมเป็นภาพรวมของชุดและไม่ได้แยกเลเยอร์เป็นชิ้นส่วน

สถานะ `proposed` หมายถึงมีรหัสและไอคอนอ้างอิง แต่ยังไม่มีนิยามในเกม ณ commit ฐาน `6a267082dd146aaf7a546941a7bf4f9b25e475b7` การเก็บต้นแบบนี้ไม่เพิ่มนิยามไอเทม โมเดล หรือการเชื่อมต่อเข้าตัวเกม

ดู [`provenance.json`](./provenance.json) สำหรับ SHA-256 ขนาดและที่มาของภาพ และ [`REVIEW.md`](./REVIEW.md) สำหรับขอบเขตการตรวจภาพ