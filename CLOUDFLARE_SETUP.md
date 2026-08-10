# ย้ายระบบ: Google Apps Script + Sheets → Cloudflare (Pages Functions + D1) + Google Drive (รูป POD)

โค้ดฝั่ง Cloudflare เขียนไว้ครบแล้ว (ดูรายละเอียดสถาปัตยกรรมที่
`C:\Users\Gadgetvilla\.claude\plans\bubbly-yawning-shannon.md`) แต่ **เว็บจริงตอนนี้ยังใช้ Apps Script
เดิมอยู่** — ต้องทำขั้นตอนต่อไปนี้ด้วยตัวเอง (ต้องใช้บัญชี/ข้อมูลลับของคุณ ผมเข้าไม่ถึง) ก่อนจะให้ผมรันขั้นที่เหลือให้

ไฟล์ที่เพิ่งสร้าง:
```
d1/schema.sql               -- schema ทั้งหมด (15 ตาราง + id_counters/employee_credentials/driver_sessions/request_log)
lib/                          -- โค้ด API ทั้งหมด (Node/Workers runtime, ไม่มี build step)
functions/api/gas.js          -- endpoint หลัก (แทน Apps Script) — Cloudflare Pages Function
cartrack-sync-worker/         -- Worker แยก ซิงก์ Cartrack ทุก 1 นาที (Cron Trigger)
wrangler.toml                -- ตั้งค่า D1 binding สำหรับ Pages project
scripts/migrate.js            -- ดึงข้อมูลจริงจาก Sheets เข้า D1
```

**เปลี่ยนแผนจากตอนแรก**: รูป POD (หลักฐานส่งของ) ยังคงเก็บที่ **Google Drive ผ่าน Apps Script เดิม**
(action `uploadPOD` ตัวเดิม) ไม่ได้ย้ายไป Cloudflare R2 — เพราะ R2 ต้องผูก billing subscription กับบัญชี
Cloudflare ก่อนจะสร้าง bucket ได้ (แม้จะฟรีถ้าไม่เกิน 10GB/เดือน ก็ตาม) ผู้ใช้เลือกข้ามขั้นนี้ไป ข้อมูลอื่นทั้งหมด
(ลูกค้า/พนักงาน/งานส่ง/route ฯลฯ) ย้ายไป D1 ตามแผนเดิม — Apps Script deployment เดิมจึงยังต้องเก็บไว้ใช้
เฉพาะ `uploadPOD` เท่านั้น (ไม่ต้องลบทิ้ง)

## ทำไมถึงง่ายกว่าตอนย้าย Supabase/Vercel

รอบก่อนติดที่ `DATABASE_URL` (connection string) copy/paste ผิดหลายรอบ — รหัสผ่านมี `&`
ทำให้ parse พัง, UI ของ Supabase ทำให้ copy ผิดช่องหลายครั้ง เสียเวลาไปมาก

รอบนี้ **D1 ไม่มี connection string เลย** — เข้าถึงผ่าน "binding" ที่ตั้งใน `wrangler.toml`
(`env.DB`) ไม่มีอะไรให้ copy/paste ผิด และ token ตัวเดียวกับที่ใช้ deploy
Cloudflare Pages อยู่แล้ว ใช้สร้าง/รัน D1 ได้เลย (แค่ต้องขยายสิทธิ์ token ก่อน) —
**ผมรันขั้นสร้างฐานข้อมูล + ย้ายข้อมูลให้เองได้เกือบทั้งหมด**

## สถานะปัจจุบัน

- ✅ ขยายสิทธิ์ token แล้ว (`dispatch-center-full` — D1/R2/Workers Scripts/Workers KV/Pages, ทั้งหมด Edit)
- ✅ สร้าง D1 database แล้ว (`dispatch-center-db`, id ใส่ใน `wrangler.toml` ทั้งสองไฟล์แล้ว)
- ⬜ รัน schema (`d1/schema.sql`) เข้า D1
- ⬜ ตั้งค่า Cartrack secrets (ขั้นที่ 1 ด้านล่าง)
- ⬜ ตั้งค่า Google Maps API key + `APPS_SCRIPT_POD_URL` (ขั้นที่ 2)
- ⬜ export + migrate ข้อมูลจริงจาก Sheets เข้า D1
- ⬜ deploy Pages + cartrack-sync-worker แล้วทดสอบผ่าน `?api=`

## ขั้นที่ 1 — Cartrack secrets (ทำเอง, ต้องพิมพ์แบบ interactive)

```bash
cd cartrack-sync-worker
npx wrangler secret put CARTRACK_USERNAME
npx wrangler secret put CARTRACK_API_TOKEN
```
(ใช้ค่าเดิมที่ตั้งไว้ใน Apps Script Script Properties — คนละชุดกับ Cloudflare API token)

## ขั้นที่ 2 — Environment variables ของ Pages project (ทำเอง)

dash.cloudflare.com → Workers & Pages → โปรเจกต์ `gadgetvilla-delivery` → Settings → Environment variables
(Production + Preview) เพิ่ม:

| ชื่อ | ค่า |
|---|---|
| `APPS_SCRIPT_POD_URL` | URL Apps Script เดิม (`https://script.google.com/macros/s/AKfycbww.../exec`) — ไม่ใช่ secret ก็จริง แต่ตั้งเป็น env var ไว้เผื่อเปลี่ยน URL ในอนาคต |
| `GOOGLE_MAPS_API_KEY` | สร้างจาก Google Cloud Console (เปิด Geocoding API) — Apps Script เดิมใช้ `Maps.newGeocoder()` ในตัว (ไม่ต้องมี key) แต่ฝั่ง Cloudflare ต้องเรียก Geocoding API ตรง มีค่าใช้จ่ายเกิน free tier ควรจับตาปริมาณการเรียกหลังสลับจริง |

## ขั้นที่ 3 — ทดสอบก่อนสลับจริง (ยังไม่กระทบเว็บจริง)

หลังผมรัน schema + migrate + deploy ให้แล้ว เปิดเว็บที่ deploy แล้วต่อ URL ด้วย `?api=` เพื่อทดสอบ backend
ใหม่โดยไม่กระทบผู้ใช้จริง:
```
https://<เว็บจริงของคุณ>/?api=/api/gas
```
ทดสอบให้ครบ: หน้าหลัก, เพิ่ม/แก้งานส่ง, วางแผน+ยืนยัน Route, ล็อกอินโหมดคนขับ, check-in, ถ่ายรูป POD (ยิงไป Drive), ตั้งค่า, ซิงก์ Cartrack

## ขั้นที่ 4 — สลับจริง

บอกผม **"สลับไป Cloudflare D1 ให้"** เมื่อทดสอบขั้นที่ 3 ผ่านหมดแล้ว — ผมจะแก้ `DEFAULT_API_URL` ใน `app.js`
เป็น `/api/gas` (same-origin — ไม่ต้องมี URL เต็มเพราะอยู่โปรเจกต์เดียวกันกับหน้าเว็บ), ลดค่า timeout/retry
ที่เดิมตั้งไว้รองรับความช้าของ Apps Script ให้เหมาะกับ backend ใหม่ (เร็วกว่ามาก) แล้ว deploy ให้

หลังสลับแล้วเสถียรดีสัก 2-3 วัน ค่อยไปลบ Cartrack trigger เดิมใน Apps Script (`installCartrackTrigger` ที่ติดตั้งไว้)
เพื่อไม่ให้ซิงก์ซ้อนกัน 2 ระบบ (แต่**ต้องเก็บ Apps Script deployment ไว้ใช้งาน `uploadPOD` ต่อ**) แล้ว archive
Google Sheet เก็บไว้เป็นข้อมูลย้อนหลัง (ไม่ต้องลบ)
