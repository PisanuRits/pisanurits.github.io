# Bar Cut List – โครงสร้างข้อมูล (ร่าง v1)

หน่วยภายใน: **มม.** เสมอ (หน่วยแสดงผลเลือกได้ใน project.units: mm / cm / m แปลงเฉพาะตอนแสดง/กรอก) · ความยาวช่วง = **center–center** ของ Support · L ที่ใช้คิดสัดส่วน (L/4, L/3, L/2) = **ระยะหน้า Support ถึงหน้า Support (clear span)**

ข้อมูลแบ่ง 3 ชั้น ชั้นล่างสร้างจากชั้นบนโดยอัตโนมัติ ไม่ต้องกรอกซ้ำ

```
[1] project  (กฎโครงการ ตั้งครั้งเดียว)
      │
[2] beam     (สิ่งที่ user กรอกในหน้า Model คาน)
      │  ── คำนวณ ──▶
[3] derived  (bar runs → pieces → cut list)   ← ไม่เก็บ คำนวณใหม่ทุกครั้ง
```

---

## [1] project – กฎโครงการ

```jsonc
{
  "version": 1,
  "project": {
    "name": "ตัวอย่างบ้าน 2 ชั้น",
    "units": "mm",                             // หน่วยแสดงผล mm | cm | m
    "cover": 25,                               // ระยะหุ้มคอนกรีต (มม.)

    // เหล็กเส้นที่ซื้อ
    "stock": {
      "lengths": [10000, 12000],               // ความยาวที่มีขาย
      "default": 10000,                        // ใช้ค่านี้ถ้าไม่ระบุต่อขนาด
      "bySize": { "DB20": 12000, "DB25": 12000 }
    },

    // ความยาวทาบ (lap)  → mode "factor" = n·d  หรือ "table" = ระบุเองต่อขนาด
    "lap": { "mode": "factor", "factor": 40,
             "table": { "DB12": 480, "DB16": 640 } },

    // ความยาวงอปลาย
    "hook": {
      "main90":    { "mode": "factor", "factor": 12, "min": 150 },  // งอฉากเหล็กแกน
      "stirrup135":{ "mode": "factor", "factor": 6,  "min": 75  }   // ขอปลอก 135°
    },

    // โซนที่อนุญาตให้ต่อเหล็ก
    "splice": {
      "top":    { "zone": "midspan", "fraction": 0.333 },   // กลางช่วง กว้าง L/3
      "bottom": { "zone": "support", "fraction": 0.25  },   // ภายใน L/4 จากหน้า Support
      "stagger": true, "staggerFactor": 1.3              // ต่อเหลื่อมเส้นคู่/คี่
    },

    // ค่าเริ่มต้นของปลอก
    "stirrup": { "firstSpacing": 50, "legs": 2 },

    // ค่าเริ่มต้นการจบปลายเหล็กแกน (user แก้ทับรายจุดได้ใน beam)
    "endDefaults": {
      "edgeSupport":   { "mode": "hook" },                  // Support ตัวริม → งอฉาก
      "sameDepth":     { "mode": "continuous" },            // h เท่ากัน → ต่อเนื่อง
      "shallowToDeep": { "mode": "extend", "factorD": 40 },  // ตื้น→ลึก ยื่นเข้า 40d
      "deepToShallow": { "mode": "hook" }                   // ลึก→ตื้น งอฉากใน Support
    }
  }
}
```

ตารางเหล็กมาตรฐาน (ฝังในโปรแกรม): RB6, RB9, DB10, DB12, DB16, DB20, DB25 — เก็บ d (มม.) และน้ำหนัก kg/m สำหรับสรุปน้ำหนัก

---

## [2] beam – ข้อมูลคานที่ user กรอก

```jsonc
{
  "beam": {
    "name": "B1",
    "supports": [ { "width": 250 }, { "width": 250 }, { "width": 250 }, { "width": 250 } ],  // n+1 ตัว
    "spans": [
      {
        "L": 4500, "b": 250, "h": 500,                 // L = center–center

        "top": { "n": 2, "bar": "DB16",
                 "left":  { "mode": "auto" },           // การจบปลายซ้าย/ขวา (ดูด้านล่าง)
                 "right": { "mode": "auto" } },
        "bot": { "n": 3, "bar": "DB16",
                 "left":  { "mode": "auto" },
                 "right": { "mode": "auto" } },

        "extraTop": { "on": true,  "n": 2, "bar": "DB16", "frac": "L/4" },   // "L/4" | "L/3"
        "extraBot": { "on": false, "n": 2, "bar": "DB12",
                      "len": { "mode": "frac", "value": "L/2" } },           // frac: L/2 | 2L/3 | L  หรือ custom: มม.

        "stir": { "bar": "RB6", "sEnd": 100, "endLen": 1000, "sMid": 200 }
      }
      // … สูงสุด 6 ช่วง
    ],

    // จุดต่อที่ user บังคับ/แก้ทับ (ว่าง = ให้โปรแกรมคำนวณเอง)
    "spliceOverrides": [
      // { "run": "top", "x": 7200 }   // x = ระยะจากศูนย์ Support ตัวแรก
    ]
  }
}
```

### การจบปลายเหล็กแกน (`left` / `right`)

| mode | ความหมาย | ค่าเพิ่ม |
|---|---|---|
| `auto` | ให้โปรแกรมเลือกตาม `endDefaults` (ค่าเริ่มต้น) | – |
| `continuous` | ต่อเนื่องกับเหล็กช่วงถัดไปเป็นเส้นเดียว (ต้องระดับเท่ากัน) | – |
| `extend` | วิ่งตรงยื่นเลย Support เข้าช่วงถัดไป | `value` มม. หรือ `factorD` |
| `hook` | หยุดใน Support + งอฉาก 90° | `hookLen` (ว่าง = ใช้ project.hook.main90) |
| `stop` | หยุดใน Support ไม่งอ | `embed` มม. (ระยะฝังเข้า Support) |

---

## [3] derived – สิ่งที่โปรแกรมคำนวณ (ไม่เก็บ)

**3.1 Bar runs** – รวมเหล็กที่ `continuous` ต่อกันเป็น "เส้นเดียว" รู้พิกัดเริ่ม-จบ (x จากศูนย์ Support แรก) และความยาวรวม (รวมยื่น/งอ)

```jsonc
{ "id": "TOP-1", "kind": "top", "bar": "DB16", "n": 2,
  "x0": -100, "x1": 14600, "hookStart": 190, "hookEnd": 190, "length": 15080 }
```

**3.2 Pieces** – ตัด run ที่ยาวเกิน stock เป็นท่อน โดยวางจุดต่อในโซนที่อนุญาต + บวกทาบ

```jsonc
{ "runId": "TOP-1", "piece": 1, "x0": -100, "x1": 7400, "cutLength": 7690, "spliceAt": 7400, "lap": 640, "ok": true }
```
`ok:false` = หาโซนต่อไม่ได้ → แสดงเตือนสีแดงในรูป

**3.3 Stirrups** – ต่อช่วง: ความยาวตัดต่อตัว = 2(b−2c) + 2(h−2c) + 2·hook135 ; จำนวน = โซนหัวเสา ×2 + กลางคาน

**3.4 Bar schedule** – รวมทุก piece/ปลอก เป็นรายการ `{ bar, shape, cutLength, qty }`

**3.5 Cut list** – จัด bar schedule ลง stock แต่ละขนาดเหล็ก (1D bin packing) → รายการ "เหล็กเส้นที่ i ตัดเป็น …" + เศษ + น้ำหนักรวม

---

## สิ่งที่ยังเปิดให้ตัดสินใจ

1. ความยาวทาบ/งอ ใช้สูตร n·d เป็นค่าเริ่มต้น — ตัวคูณ 40d / 12d / 6d ตรงกับที่ใช้งานจริงหรือไม่
2. เหล็กพิเศษบน/ล่าง — ให้มีการจบปลาย (`hook/extend`) แบบเหล็กแกนด้วย หรือใช้กฎตายตัว (ยื่นเข้า Support ตามระยะฝัง)
3. `stagger` (ต่อเหลื่อม) — เปิดเป็นค่าเริ่มต้น หรือปิดไว้ก่อน
4. Support แต่ละตัวกว้างต่างกันได้ (ตามร่างนี้) หรือใช้ค่าเดียวทั้งคาน
5. รองรับ **คานยื่น (cantilever)** ที่ปลายหรือไม่ — ถ้าใช่ ต้องเพิ่มใน v1 เลย เพราะกระทบโครงสร้าง `spans`

---

## เพิ่มเติม v2 (รอบที่ 4)

- `span.name` ชื่อคานของแต่ละช่วง (พิมพ์ที่ป้ายเหนือคาน) · `beam.name` = ชื่อ **ชุดคาน** (ใช้ในหน้าสรุป)
- `supports[k].on = false` ได้เฉพาะตัวริม (k = 0 หรือ k = n) = **คานยื่น**: ความกว้าง 0, L ของช่วงนั้นวัดถึงปลายยื่น, ปลายเหล็กแกนงอฉากเต็มความลึก (h − 2·cover), เหล็กพิเศษบนยาวเต็มช่วง, ห้ามต่อเหล็กในช่วงนี้
- `stir = { bar, s, endOn, sEnd, endLen }` — `s` ระยะปกติทั้งช่วง; `endOn` = หัวเสาถี่กว่า (ใช้ `sEnd`, `endLen` เฉพาะฝั่งที่มี Support)
- `project.members[]` รายการชิ้นส่วนที่ "ส่งไป Bar Cut List" แล้ว: `{ type: 'beam'|'column'|'slab'|'footing', name, sentAt, data, rows:[{bar, qty, length, label}] }` — หน้าสรุป/cut list อ่านจาก `rows` ของทุกชิ้นส่วน
- รายการปลอกใน schedule: 1 รายการต่อช่วง (`zones[]` แยกโซนไว้แสดงผล: `count-RB6@0.10 m.`)

## เพิ่มเติม v2.1
- `span.web = { on, n, bar, left, right }` เหล็กข้าง (skin/web bar) จำนวนรวมทั้งสองข้าง วาดที่กลางความลึก ต่อเหล็กได้ทั้งช่วง (ยกเว้นคานยื่น)
- การต่อเนื่องข้าม Support **จำนวนต่างกันได้**: เส้นจำนวนน้อยสุด (ฐาน) ต่อเนื่องตลอด เส้นที่เกินเป็น run แยก (layer ≥ 1) จบด้วยงอฉากที่หัวเสา — เงื่อนไขคงเหลือ: ขนาดเหล็กเท่ากัน และ (ล่าง/ข้าง) ความลึกเท่ากัน
- เตือนเมื่อจำนวนเส้น (รวมพิเศษ) เกินที่เรียงชั้นเดียวได้: cap = floor((b − 2c − 2d_ปลอก + s) / (d + s)), s = max(25, d)
- สัดส่วนเพิ่ม: พิเศษบน L/5, พิเศษล่าง 3L/5

- `top.layers` / `bot.layers` = จำนวนเส้นแต่ละชั้น เช่น `[3, 2]` (ไม่มี = ชั้นเดียว `n` เส้น); `n` = ผลรวมเสมอ แต่ละชั้นสร้าง run แยก วาดห่างกัน d + 25 มม.

## เพิ่มเติม v3.0 (ฐานราก + ค่าหักการงอ)
- `project.bend = { on, f90, f135, f180 }` — ค่าหักต่อการงอ 1 ครั้ง = f × d; ความยาวตัด = รวมระยะนอก–นอก − Σ ค่าหัก
  - นับการงอ: ขอเหล็กแกน 1 ปลาย = 90°×1 · ปลอกขอ 135° = 90°×3 + 135°×2 · ปลอกขอ 90° / รัดรอบ = 90°×5 · ตะแกรงขางอ = 90°×2 (+2 ถ้าพับปลาย) · เหล็กยืนงอฉาก = 90°×1
  - หักตอนรวมรายการ (`collectRows`) ทุกชิ้นส่วน → แถวมี `sum` (นอก–นอก), `deduct`, `length` (ตัด)
- `state.footing` — ฐานที่กำลังแก้ (มม., ระดับเป็น ม.): `name, count, type: pile|spread, shape: rect|tri, pile{nx,ny,d,s,emb,edge}, B, L, t, cover, ped{b,l,lvTop,lvCol,cover,bar,n,emb: hook|str,leg,top: lap|flush,lap}, tie{bar,s,hook: 90|135,leg}, bx/by/tm/top.x/top.y = {bar, mode: s|n, val}, botLeg, botLip, tri{bar,n}, top{on,leg,lip}, side{on,bar,n,pos: out|in,leg}, ovr{}`
  - `ovr[key] = { a, leg, lip, w, h, hook }` ระยะที่ผู้ใช้แก้บนรูปทรง (key = ชื่อรายการ|ขนาดเหล็ก)
- member ฐานราก: `{ type: 'footing', name, sentAt, data: footing, rows: [{ key, label, note, bar, shape, perFooting, qty (= ต่อฐาน × จำนวนฐาน), length }] }`
  - `shape.k`: C (ขางอ + พับปลาย, `up`) | L | I | S (`deg` 90/135) | R (รัดรอบ ขาที่มุม) — รหัสใบตัด: C, L0, L1, L2, S1, S2, R1
