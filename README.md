# DELIVERY DISPATCH & ROUTE CONTROL CENTER

ศูนย์ควบคุมการจัดส่งและวางแผนเส้นทางแบบใช้งานจริง — บันทึกงานส่ง วางแผน Route
จัดลำดับจุดส่ง บริหารรถบริษัท/รถจ้างภายนอก ติดตาม GPS ผ่าน Cartrack คำนวณต้นทุน
บริหารเงินทดรอง และรายงานย้อนหลัง

```
FRONTEND (index.html)  →  GOOGLE APPS SCRIPT (Code.gs)  →  GOOGLE SHEETS (ฐานข้อมูล)
                                     │
                                     └────────────────────→  CARTRACK FLEET API
```

> **ความปลอดภัย:** Frontend ไม่เก็บ/ไม่เห็น Cartrack credentials หรือ token ใดๆ
> ทั้งสิ้น — เก็บไว้ใน **Apps Script → PropertiesService** และ Apps Script เป็น
> ผู้เรียก Cartrack API เท่านั้น (เลี่ยง CORS + ปลอดภัยกว่า)

---

## โครงสร้างไฟล์

| ไฟล์ | หน้าที่ |
|---|---|
| `index.html` | โครงหน้าเว็บ + โหลด CSS/JS/CDN |
| `styles.css` | Design system (sidebar navy, KPI, tables, modal, toast, map, responsive) |
| `app.js` | State, API client + **Mock DB** (ทำงานออฟไลน์ได้), router, Planner, Map, Chart, Export |
| `app.pages.js` | ทุกหน้า: Dashboard, งานส่ง, วางแผนเส้นทาง, รอบส่ง, แผนที่ติดตาม, รถบริษัท, รถภายนอก, ค่าใช้จ่าย, เงินทดรอง, ต้นทุน Route, ลูกค้า, พนักงาน, รายงาน, ตั้งค่า, Cartrack, โหมดคนขับ |
| `apps-script/Code.gs` | Backend Apps Script — ทุก API + สร้างฐานข้อมูล + Cartrack sync |

CDN ที่ใช้ (ต้องมีอินเทอร์เน็ต): IBM Plex Sans Thai (Google Fonts), Lucide icons, Leaflet (แผนที่)

---

## ใช้งานทันที (โหมดทดลอง)

เปิด `index.html` ผ่านเว็บเซิร์ฟเวอร์ใดก็ได้ ระบบจะรันด้วย **ข้อมูลทดลอง (Mock)**
โดยไม่ต้องต่อ backend — ทดลองจัด Route / คำนวณต้นทุน / ดูรายงานได้ครบ

```bash
cd dispatch-center
python -m http.server 8777
# เปิด http://localhost:8777
```

---

## เชื่อมต่อฐานข้อมูลจริง (Google Sheets)

1. สร้าง **Google Sheet** ใหม่ 1 ไฟล์
2. เมนู **Extensions → Apps Script** วางเนื้อหาไฟล์ `apps-script/Code.gs` ทั้งหมด
3. รันฟังก์ชัน **`setupDatabase()`** หนึ่งครั้ง (สร้าง 15 ชีต + ข้อมูลทดสอบ)
   - อนุญาตสิทธิ์ (Authorize) ตามที่ Google ขอ
4. **Deploy → New deployment → Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
   - คัดลอก **Web app URL** (`https://script.google.com/macros/s/XXXX/exec`)
5. เปิดเว็บ → เมนู **ตั้งค่าระบบ** → วาง Web app URL → กด **เชื่อมต่อ & โหลดข้อมูล**
   - ปุ่ม **ทดสอบการเชื่อมต่อ** จะยิง `?action=ping`

Frontend เก็บเฉพาะ **Web app URL** (ไม่ใช่ความลับ) ไว้ใน localStorage เท่านั้น

### ชีตในฐานข้อมูล (15 ชีต)
`Deliveries` · `Customers` · `Employees` · `Routes` · `RouteStops` · `Vehicles` ·
`ExternalProviders` · `ExternalVehicles` · `CartrackVehicles` · `CartrackLogs` ·
`GPSLogs` · `Expenses` · `ExpenseClaims` · `Settings` · `ActivityLogs`

ทุกตารางหลักมี `CreatedAt / UpdatedAt / IsDeleted` — **ไม่ลบข้อมูลจริง** ใช้ soft-delete (`IsDeleted = TRUE`)

---

## เชื่อมต่อ Cartrack Fleet API (ติดตามรถ GPS สด)

1. ขอ API credentials จาก `https://fleetweb-th.cartrack.com/settings/api-settings`
2. ใน Apps Script แก้ค่า 3 บรรทัดในฟังก์ชัน **`setupCartrackCredentials()`**
   แล้ว **รันหนึ่งครั้ง** — ค่าจะถูกเก็บใน Script Properties (Frontend มองไม่เห็น):
   ```js
   CARTRACK_BASE_URL  : 'https://fleetapi-th.cartrack.com/rest'
   CARTRACK_USERNAME  : 'ชื่อผู้ใช้ของคุณ'
   CARTRACK_API_TOKEN : 'token ของคุณ'
   ```
3. รัน **`installCartrackTrigger()`** หนึ่งครั้ง → Backend จะ `syncCartrack()` อัตโนมัติ **ทุก 1 นาที**
4. Frontend รีเฟรชสถานะทุก 8 วินาที (หน้า Dashboard / แผนที่ติดตาม)
   - 🟢 Connected · 🟡 ข้อมูลอาจไม่ใหม่ (>90 วิ) · 🔴 Cartrack Offline

การจับคู่รถ: ใช้ `CartrackVehicleID` หรือ `CartrackRegistration`/`LicensePlate`
→ อัปเดตพิกัดสดลงชีต `Vehicles` (`CurrentLatitude/Longitude/Speed/...`)

---

## API (Google Apps Script)

**GET** `?action=<name>&date=YYYY-MM-DD`
`getBootstrap` `getDashboardData` `getDeliveries` `getRoutes` `getRouteStops`
`getCustomers` `getEmployees` `getVehicles` `getExternalProviders` `getExternalVehicles`
`getCartrackVehicles` `getLiveVehicleStatus` `getExpenses` `getClaims` `getRouteCosts`
`getReports` `getSettings` `getRealtime` `getCartrackStatus` `ping`

**POST** `{ "action":"<name>", ... }` (Content-Type: text/plain — เลี่ยง CORS preflight)
`createDelivery` `updateDelivery` `deleteDelivery` `createCustomer` `updateCustomer`
`confirmRoute` `createRoute` `updateRoute` `updateRouteStop` `createVehicle` `updateVehicle`
`createExternalVehicle` `updateExternalVehicle` `createExpense` `createClaim` `updateClaim`
`updateSetting` `syncCartrack` `startRoute` `checkIn` `completeDelivery` `failDelivery`

รูปแบบตอบกลับ: `{ ok:true, data:... }` หรือ `{ ok:false, error:"..." }`

---

## การวางแผน Route อัตโนมัติ (Route Decision Center)

กด **วางแผน Route อัตโนมัติ** ระบบจะ:
1. อ่านพิกัดคลัง + จุดส่งที่เลือก + ตำแหน่ง/สถานะรถ
2. จัดลำดับจุดส่งด้วย **Nearest-Neighbour + ถ่วงน้ำหนัก Priority** (ลดการย้อนเส้นทาง)
3. คำนวณระยะทาง (Haversine) + เวลาเดินทาง (ความเร็วเฉลี่ย + เวลาบริการต่อจุด)
4. ตรวจความจุ + แนะนำรถ (⭐ RECOMMENDED VEHICLE)
5. สร้าง **3 ทางเลือก**:
   - **A** รถบริษัทเท่านั้น (แจ้งเตือนถ้าความจุไม่พอ)
   - **B** รถบริษัท + รถภายนอก (รองรับงานทั้งหมด)
   - **C** แบ่งเป็น 2 Route
6. คำนวณต้นทุน: `รวม = น้ำมัน + ทางด่วน + จอดรถ + รถภายนอก + อื่นๆ`
   พร้อม **ต้นทุนต่อจุด / ต่อกล่อง**
7. กด **ยืนยัน Route** → สร้าง Route + RouteStops + เปลี่ยนสถานะงานเป็น Planned + บันทึก Activity Log

---

## Deploy หน้าเว็บ (ตัวเลือก)

เป็นไฟล์ static ล้วน — อัปโหลด 4 ไฟล์ (`index.html`, `styles.css`, `app.js`,
`app.pages.js`) ขึ้น Netlify / GitHub Pages / Cloud Storage ใดก็ได้ แล้วตั้ง Web app URL
ในหน้า **ตั้งค่าระบบ**

---

## หมายเหตุ

- แผนที่ใช้ **Leaflet + CARTO tiles** (ฟรี ไม่ต้องมี API key) แทน Google Maps
  เพื่อให้ deploy ได้ทันทีโดยไม่ต้องผูกบัตร/คีย์
- Export: **CSV** (native) และ **Excel (.xls)** รองรับภาษาไทย (UTF-8 BOM)
- โหมดคนขับ (`#/driver`) ใช้ GPS จริงของอุปกรณ์ตอน Check-in (≤100 ม. 🟢 / ≤500 ม. 🟡 / เกิน 🔴)
