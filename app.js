/* ================================================================
   DELIVERY DISPATCH & ROUTE CONTROL CENTER — Frontend App (vanilla)
   Frontend → Cloudflare Pages Functions (/api/gas) → D1   |  Mock fallback
   (POD photo upload + geocoding still proxy through the old Apps Script
   deployment on purpose — see lib/actions/pod.js / reads.js — to avoid
   new billing on R2 / Google Maps Geocoding API, not part of this URL)
   ================================================================ */
'use strict';

/* ---------------- CONSTANTS ---------------- */
const LS_URL = 'ddc_api_url';
// Same-origin Cloudflare Pages Function — see functions/api/gas.js.
// Migrated off the old Google Apps Script + Sheets backend (that's what
// caused the multi-second lag); D1 answers in well under a second.
const DEFAULT_API_URL = '/api/gas';
const DATA_DATE = '2026-07-20';           // วันที่ของชุดข้อมูลทดลอง (ใช้เฉพาะโหมด Mock)

const PRIORITY = {
  HIGH:   { label:'ด่วน',        cls:'b-red',   rank:0, w:0.62, color:'#EF4444' },
  NORMAL: { label:'ปกติ',        cls:'b-amber', rank:1, w:1.0,  color:'#F59E0B' },
  LOW:    { label:'ไม่เร่งด่วน',  cls:'b-green', rank:2, w:1.35, color:'#10B981' }
};
const DSTATUS = {
  Draft:        { label:'ยังไม่จัดรถ',  cls:'b-blue'   },
  Planned:      { label:'วางแผนแล้ว',  cls:'b-violet' },
  Assigned:     { label:'มอบหมายแล้ว', cls:'b-blue'   },
  'In Progress':{ label:'กำลังส่ง',    cls:'b-blue'   },
  Completed:    { label:'ส่งแล้ว',     cls:'b-green'  },
  Failed:       { label:'ไม่สำเร็จ',   cls:'b-red'    },
  Cancelled:    { label:'ยกเลิก',      cls:'b-gray'   }
};
const VSTATUS = {
  Available:{ label:'พร้อมใช้งาน', cls:'b-green', dot:'#10B981' },
  'In Use': { label:'กำลังวิ่ง',   cls:'b-blue',  dot:'#2563EB' },
  Stopped:  { label:'จอดอยู่',     cls:'b-amber', dot:'#F59E0B' },
  // "เชื่อมต่อ Cartrack/มือถือได้อยู่ แต่พิกัดล่าสุดเก่าเกินไป" — ตั้งใจแยกออกจาก
  // Offline (ไม่มีข้อมูลเลย/ไม่เคยเชื่อมต่อ) เพราะเดิมใช้ป้าย "ออฟไลน์" ร่วมกันทั้ง 2
  // แบบ ทำให้ดูขัดกับสถานะ "Cartrack เชื่อมต่อ" ที่โชว์อยู่ด้านบนพร้อมกัน
  Stale:    { label:'สัญญาณขาด',   cls:'b-red',   dot:'#F97316' },
  Offline:  { label:'ออฟไลน์',     cls:'b-gray',  dot:'#9AA3B2' },
  Unknown:  { label:'ไม่ทราบ',     cls:'b-gray',  dot:'#9AA3B2' }
};
// สถานะรถอัตโนมัติจากความเร็ว: มีพิกัด + วิ่ง(>3)=กำลังวิ่ง · หยุด=จอดอยู่ · ไม่มีพิกัดเลย=ออฟไลน์
// มีพิกัดแต่เก่าเกิน GPS_STALE_MIN = สัญญาณขาด — แต่ถ้ารถจอดและ Worker ยังซิงก์คันนี้สำเร็จอยู่
// (lastSyncAt สด) ไม่ถือว่าสัญญาณขาด เพราะอุปกรณ์ Cartrack มักไม่อัปเดตพิกัดตอนจอดนิ่ง
const GPS_STALE_MIN = 10;
const WORKER_FRESH_MIN = 3;
function parseTs(t){
  if(!t) return NaN;
  const s = String(t).trim();
  let d = new Date(s);
  if(!isNaN(d.getTime())) return d.getTime();
  // Cartrack-style "YYYY-MM-DD HH:mm:ss+07"
  const m = s.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})([+-]\d{2})(:?\d{2})?$/);
  if(m){
    const tz = m[3] + (m[4] ? (m[4].startsWith(':') ? m[4] : ':' + m[4]) : ':00');
    d = new Date(`${m[1]}T${m[2]}${tz}`);
    return d.getTime();
  }
  return NaN;
}
function deriveVehStatus(v){
  const sp = Number(v.speed!=null?v.speed:v.CurrentSpeed) || 0;
  const hasCoord = !!(v.lat||v.lng||v.CurrentLatitude||v.CurrentLongitude);
  const posMs = parseTs(v.lastPositionTime||v.LastPositionTime);
  const syncMs = parseTs(v.lastSyncAt||v.LastSyncAt);
  const lastMs = !isNaN(posMs) ? posMs : syncMs;
  if(!hasCoord || isNaN(lastMs)) return 'Offline';
  const posAgeMin = isNaN(posMs) ? Infinity : (Date.now()-posMs)/60000;
  const syncAgeMin = isNaN(syncMs) ? Infinity : (Date.now()-syncMs)/60000;
  if(sp > 3 && posAgeMin <= GPS_STALE_MIN) return 'In Use';
  // Worker ยังดึงคันนี้สำเร็จ → ถือว่าจอดอยู่ (ไม่ใช่สัญญาณขาด) แม้พิกัดจากเครื่องจะไม่อัปเดต
  if(syncAgeMin <= WORKER_FRESH_MIN) return sp > 3 ? 'In Use' : 'Stopped';
  if(posAgeMin > GPS_STALE_MIN) return 'Stale';
  return sp > 3 ? 'In Use' : 'Stopped';
}
// ช่วงที่รถ/คนขับหยุดนิ่ง (จุดจอด) จากพิกัด GPS ต่อเนื่อง — ไม่ต้องพึ่งความเร็วที่บันทึกไว้
// (gps_logs ไม่มีคอลัมน์ speed) ใช้ระยะห่างระหว่างจุดใกล้เคียงแทน
function deriveDwells(points, minMinutes, radiusM){
  minMinutes = minMinutes || 3; radiusM = radiusM || 60;
  const pts = (points||[]).filter(p=>p.Latitude&&p.Longitude).slice().sort((a,b)=>new Date(a.Timestamp)-new Date(b.Timestamp));
  const dwells = []; let i=0;
  while(i<pts.length){
    let j=i+1;
    while(j<pts.length && haversine(+pts[i].Latitude,+pts[i].Longitude,+pts[j].Latitude,+pts[j].Longitude)*1000 < radiusM) j++;
    const durMin = (new Date(pts[j-1].Timestamp)-new Date(pts[i].Timestamp))/60000;
    if(j-1>i && durMin>=minMinutes) dwells.push({ from:pts[i].Timestamp, to:pts[j-1].Timestamp, minutes:Math.round(durMin) });
    i = j>i ? j : i+1;
  }
  return dwells;
}
// ระยะทาง/เวลาจริงจาก GPS track (gps_logs) — Cartrack มาก่อน แล้วค่อยมือถือคนขับ
const GpsTrack = {
  normPlate(s){ return String(s||'').replace(/[\s\-]/g,'').toUpperCase(); },
  isCartrack(ev){ return String(ev||'').startsWith('CARTRACK:'); },
  cartrackReg(ev){ const m=String(ev||'').match(/^CARTRACK:(.+)$/); return m?this.normPlate(m[1]):''; },
  pickTrack(route, linked, cartrackOrphans){
    const plate = this.normPlate(route && route.LicensePlate);
    const linkedCt = (linked||[]).filter(p=>this.isCartrack(p.EventType));
    const linkedDrv = (linked||[]).filter(p=>!this.isCartrack(p.EventType));
    let ct = (cartrackOrphans||[]).slice();
    if(plate) ct = ct.filter(p=>this.cartrackReg(p.EventType)===plate);
    const allCt = [...linkedCt, ...ct].sort((a,b)=>new Date(a.Timestamp)-new Date(b.Timestamp));
    if(allCt.length>=2) return { track:allCt, source:'cartrack' };
    const drv = linkedDrv.slice().sort((a,b)=>new Date(a.Timestamp)-new Date(b.Timestamp));
    if(drv.length>=2) return { track:drv, source:'driver' };
    const mixed = [...allCt,...drv].sort((a,b)=>new Date(a.Timestamp)-new Date(b.Timestamp));
    return { track:mixed, source:mixed.length?'mixed':'none' };
  },
  metrics(points, opts){
    opts = opts || {};
    const cartrack = opts.cartrack;
    const maxJumpKm = opts.maxJumpKm ?? 2;
    const minDtSec = opts.minDtSec ?? (cartrack ? 45 : 20);
    const minMoveM = opts.minMoveM ?? (cartrack ? 15 : 25);
    const pts = (points||[])
      .filter(p => Number.isFinite(+p.Latitude) && Number.isFinite(+p.Longitude) && p.Timestamp)
      .slice().sort((a,b) => new Date(a.Timestamp) - new Date(b.Timestamp));
    if(!pts.length) return { distanceKm:0, durationMin:0, pointCount:0, startedAt:null, endedAt:null };
    if(pts.length === 1) return { distanceKm:0, durationMin:0, pointCount:1, startedAt:pts[0].Timestamp, endedAt:pts[0].Timestamp };
    let dist = 0; let prev = pts[0];
    for(let i=1;i<pts.length;i++){
      const cur = pts[i];
      const leg = haversine(+prev.Latitude,+prev.Longitude,+cur.Latitude,+cur.Longitude);
      const dtSec = (new Date(cur.Timestamp)-new Date(prev.Timestamp))/1000;
      if(leg>maxJumpKm && dtSec<60) continue;
      if(leg*1000<minMoveM && dtSec<minDtSec) continue;
      dist += leg; prev = cur;
    }
    const startedAt = pts[0].Timestamp;
    const endedAt = pts[pts.length-1].Timestamp;
    const durationMin = Math.max(0, Math.round((new Date(endedAt)-new Date(startedAt))/60000));
    return { distanceKm:+dist.toFixed(1), durationMin, pointCount:pts.length, startedAt, endedAt };
  },
  routeMetrics(route, linked, cartrackOrphans){
    const picked = this.pickTrack(route, linked, cartrackOrphans);
    const m = this.metrics(picked.track, { cartrack: picked.source==='cartrack' });
    return Object.assign(m, { source:picked.source, track:picked.track });
  },
  fuelEst(distanceKm, route){
    if(!distanceKm) return 0;
    const veh = (Store.data.vehicles||[]).find(v => v.LicensePlate && route.LicensePlate && v.LicensePlate === route.LicensePlate);
    return Planner.fuelCost(distanceKm, veh);
  },
};
// รายชื่อรถ+พิกัดปัจจุบัน ใช้ร่วมกันทั้งหน้า "วันนี้" และ "ติดตาม" — Store._live ถ้ามี (polling) ไม่งั้น fallback จาก bootstrap
function liveVehicles(){
  return Store._live ? Store._live.vehicles : (Store.data.vehicles||[]).map(v=>({VehicleID:v.VehicleID,VehicleName:v.VehicleName,LicensePlate:v.LicensePlate,VehicleType:v.VehicleType,CurrentDriver:v.CurrentDriver,VehicleStatus:v.VehicleStatus,CartrackVehicleID:v.CartrackVehicleID,lat:v.CurrentLatitude,lng:v.CurrentLongitude,speed:v.CurrentSpeed,heading:v.CurrentHeading,lastPositionTime:v.LastPositionTime,lastSyncAt:v.LastSyncAt}));
}
const RATE_TYPE = { PER_TRIP:'ต่อเที่ยว', PER_KM:'ต่อกิโลเมตร', PER_DAY:'ต่อวัน', CUSTOM:'กำหนดเอง' };

// เมนูแยกหมวด — งานประจำวัน + รายงาน/ระบบ (ไม่กระจายที่ footer)
const NAV = [
  { group:'งานประจำวัน', items:[
    { id:'dashboard',  label:'วันนี้',   icon:'home' },
    { id:'planning',   label:'จัดรถ',   icon:'route' },
    { id:'livemap',    label:'ติดตาม',   icon:'map-pin' },
  ]},
  { group:'อื่นๆ', items:[
    { id:'reports',  label:'รายงาน', icon:'bar-chart-3' },
  ]},
];

/* ---------------- STATE ---------------- */
const Store = {
  date: DATA_DATE,
  page: 'dashboard',
  loading: false,
  error: null,
  live: false,          // connected to Apps Script?
  connecting: false,    // กำลังเชื่อมต่อครั้งแรก / ลองใหม่
  lastSync: null,
  data: {},             // bootstrap payload
  search: '',
  pollTimer: null
};

/* ---------------- SMALL UTILS ---------------- */
const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
const el = id => document.getElementById(id);
const esc = s => String(s==null?'':s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = n => (Number(n)||0).toLocaleString('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2});
const int = n => (Number(n)||0).toLocaleString('th-TH');
const num1 = n => (Number(n)||0).toLocaleString('th-TH',{minimumFractionDigits:1,maximumFractionDigits:1});
const icons = () => { if (window.lucide) lucide.createIcons(); };
const THMONTH = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
function thDate(iso){ if(!iso) return '—'; const d=new Date(iso+(iso.length<=10?'T00:00:00':'')); if(isNaN(d)) return iso; return `${d.getDate()} ${THMONTH[d.getMonth()]} ${d.getFullYear()+543}`; }
function timeShort(iso){ if(!iso) return '—'; const d=new Date(iso); if(isNaN(d)) return String(iso); return d.toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'}); }
// เกิน 1 ชม. ต้องขึ้นวันที่ด้วยเสมอ — ไม่งั้นสัญญาณเก่าข้ามวัน (เช่น GPS ค้าง 2 วัน) จะโชว์เป็นเวลานาฬิกาเฉยๆ
// ดูเหมือนเพิ่งอัปเดตวันนี้ ทำให้เข้าใจผิดว่า "ออนไลน์" ทั้งที่จริงคือสัญญาณขาดไปนานแล้ว
function ago(iso){
  if(!iso) return '—';
  const d = new Date(iso); const s = Math.max(0, (Date.now()-d.getTime())/1000);
  if(s<60) return `${Math.round(s)} วินาทีที่แล้ว`;
  if(s<3600) return `${Math.round(s/60)} นาทีที่แล้ว`;
  const sameDay = d.toDateString()===new Date().toDateString();
  if(sameDay && s<86400) return `${Math.round(s/3600)} ชม.ที่แล้ว`;
  return `${thDate(iso)} ${timeShort(iso)}`;
}
function haversine(a,b,c,d){ const R=6371,rad=Math.PI/180; const dLat=(c-a)*rad,dLng=(d-b)*rad; const x=Math.sin(dLat/2)**2+Math.cos(a*rad)*Math.cos(c*rad)*Math.sin(dLng/2)**2; return R*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x)); }
// มุม (bearing) จากจุด (a,b) ไปจุด (c,d) — 0..360° ใช้จัดกลุ่มจุดส่งตามพื้นที่ (sweep algorithm)
function bearing(a,b,c,d){ const rad=Math.PI/180; const y=Math.sin((d-b)*rad)*Math.cos(c*rad); const x=Math.cos(a*rad)*Math.sin(c*rad)-Math.sin(a*rad)*Math.cos(c*rad)*Math.cos((d-b)*rad); return (Math.atan2(y,x)/rad+360)%360; }
function setting(key,fb){ const rows=Store.data.settings||[]; const r=rows.find(x=>x.Key===key); return r&&r.Value!==''&&r.Value!=null ? r.Value : (fb!==undefined?fb:''); }
function warehouse(){ return { lat:Number(setting('WAREHOUSE_LAT',13.6900321)), lng:Number(setting('WAREHOUSE_LNG',100.5251873)), name:setting('WAREHOUSE_NAME','คลัง แก็ดเจ็ต วิลล่า (รัชดาฯ)') }; }

/* ================================================================
   MOCK DATABASE — ทำงานได้จริงแบบออฟไลน์ (mirror ของ Google Sheets)
   ================================================================ */
const Mock = (() => {
  const now = () => new Date().toISOString();
  const db = {
    settings: [
      k('COMPANY_NAME','บริษัท แก็ดเจ็ต วิลล่า จำกัด','company','ชื่อบริษัท'),
      k('WAREHOUSE_NAME','คลัง แก็ดเจ็ต วิลล่า (รัชดาฯ)','company','ชื่อคลังสินค้า'),
      k('WAREHOUSE_ADDRESS','729/28-37 ถ.รัชดาภิเษก แขวงบางโพงพาง เขตยานนาวา กรุงเทพฯ 10120','company','ที่อยู่คลังสินค้า'),
      k('WAREHOUSE_LAT','13.6900321','company','พิกัดคลัง (Latitude)'),
      k('WAREHOUSE_LNG','100.5251873','company','พิกัดคลัง (Longitude)'),
      k('FUEL_COST_PER_KM','3.50','cost','ค่าน้ำมันต่อกิโลเมตร (บาท)'),
      k('FUEL_PRICE_PER_LITER','33','cost','ราคาน้ำมัน (บาท/ลิตร) ใช้คำนวณลิตรในรายงานย้อนหลัง'),
      k('AVG_SPEED_KMH','30','cost','ความเร็วเฉลี่ย (กม./ชม.)'),
      k('DEFAULT_TOLL','300','cost','ค่าทางด่วนเริ่มต้น (บาท)'),
      k('DEFAULT_PARKING','130','cost','ค่าจอดรถเริ่มต้น (บาท)'),
      k('WORK_START_HOUR','9','cost','เริ่มงาน (ชั่วโมง 0–23) เช่น 9 = 09:00'),
      k('WORK_END_HOUR','18','cost','เลิกงาน (ชั่วโมง 0–23) เช่น 18 = 18:00'),
      k('PROXIMITY_GREEN_M','100','tracking','ระยะ Check-in สีเขียว (เมตร)'),
      k('PROXIMITY_YELLOW_M','500','tracking','ระยะ Check-in สีเหลือง (เมตร)'),
      k('CARTRACK_ENABLED','false','cartrack','เปิดใช้งานการซิงก์ Cartrack'),
      k('CARTRACK_LAST_SYNC','','cartrack','เวลาซิงก์ Cartrack ล่าสุด'),
    ],
    customers: [
      c('CUS-01','JIB','Mega Bangna','Mega Bangna, บางนา',13.6510,100.6300,'02-100-1000'),
      c('CUS-02','Advice','Central World','Central World, ปทุมวัน',13.7466,100.5390,'02-200-2000'),
      c('CUS-03','IT City','Terminal 21','Terminal 21, อโศก',13.7373,100.5601,'02-300-3000'),
      c('CUS-04','คอม 7','The Mall Bangkapi','The Mall Bangkapi, บางกะปิ',13.7658,100.6430,'02-400-4000'),
      c('CUS-05','Power Buy','Terminal 21','Terminal 21, อโศก',13.7375,100.5605,'02-500-5000'),
      c('CUS-06','Banana','Mega Bangna','Mega Bangna, บางนา',13.6515,100.6295,'02-600-6000'),
    ],
    employees: [
      { EmployeeID:'EMP-01', EmployeeName:'นายสมชาย ใจดี', Phone:'081-111-1111', Role:'DRIVER', VehicleID:'V-01', Status:'Active', Username:'somchai', PINHash:mockHash('EMP-01','1234') },
      { EmployeeID:'EMP-02', EmployeeName:'นายวิชัย กล้าแกร่ง', Phone:'082-222-2222', Role:'DRIVER', VehicleID:'V-02', Status:'Active' },
      { EmployeeID:'EMP-03', EmployeeName:'นายมานะ อดทน', Phone:'083-333-3333', Role:'DRIVER', VehicleID:'V-03', Status:'Active' },
    ],
    vehicles: [
      v('V-01','รถกระบะ 01','1กก-1234','PICKUP',100,3.50,'นายสมชาย ใจดี','Available',13.6912,100.5262,0,45210),
      v('V-02','รถกระบะ 02','2กก-5678','PICKUP',150,3.90,'นายวิชัย กล้าแกร่ง','Available',13.6888,100.5241,0,88120),
      v('V-03','รถหกล้อ 03','3กก-9012','TRUCK',300,6.20,'','Offline',13.6921,100.5233,0,152300),
    ],
    externalProviders: [
      { ProviderID:'EP-01', ProviderName:'ABC Transport', ContactPerson:'คุณเอ', Phone:'089-999-9999', VehicleType:'TRUCK', DefaultRate:1500, RateType:'PER_TRIP', Status:'Active' },
      { ProviderID:'EP-02', ProviderName:'Speed Cargo', ContactPerson:'คุณบี', Phone:'088-888-8888', VehicleType:'PICKUP', DefaultRate:18, RateType:'PER_KM', Status:'Active' },
    ],
    externalVehicles: [
      { ExternalVehicleID:'EV-01', ProviderID:'EP-01', ProviderName:'ABC Transport', DriverName:'นายเอกชัย', DriverPhone:'086-888-8888', VehicleType:'TRUCK', LicensePlate:'9กก-9999', CapacityBox:200, Rate:1500, RateType:'PER_TRIP', Status:'Available' },
      { ExternalVehicleID:'EV-02', ProviderID:'EP-02', ProviderName:'Speed Cargo', DriverName:'นายสุรชัย', DriverPhone:'087-777-7777', VehicleType:'PICKUP', LicensePlate:'8กก-8888', CapacityBox:120, Rate:18, RateType:'PER_KM', Status:'Available' },
    ],
    deliveries: [
      d('DEL-001','JIB','Mega Bangna','INV-2026-001',13.6510,100.6300,60,'HIGH'),
      d('DEL-002','Advice','Central World','INV-2026-002',13.7466,100.5390,50,'NORMAL'),
      d('DEL-003','IT City','Terminal 21','INV-2026-003',13.7373,100.5601,30,'NORMAL'),
      d('DEL-004','คอม 7','The Mall Bangkapi','INV-2026-004',13.7658,100.6430,40,'NORMAL'),
      d('DEL-005','Power Buy','Terminal 21','INV-2026-005',13.7375,100.5605,30,'NORMAL'),
      d('DEL-006','Banana','Mega Bangna','INV-2026-006',13.6515,100.6295,60,'HIGH'),
    ],
    routes: [], routeStops: [], expenses: [], claims: [], gps: [], cartrackVehicles: [],
    activities: [ { LogID:'LOG-0', Action:'SEED', ReferenceID:'-', Description:'โหลดข้อมูลทดลอง', User:'system', Timestamp:now() } ],
    seq: { DEL:6, CUS:6, V:3, EV:2, ROUTE:0, EXP:0, CLM:0 }, driverTokens: {}
  };
  function k(K,V,G,L){ return { Key:K, Value:V, Group:G, Label:L, UpdatedAt:now() }; }
  function c(id,name,br,addr,lat,lng,ph){ return { CustomerID:id, CustomerName:name, BranchName:br, Address:addr, Latitude:lat, Longitude:lng, Phone:ph, ContactPerson:'', Status:'Active' }; }
  function v(id,nm,pl,tp,cap,fr,drv,st,lat,lng,sp,odo){ return { VehicleID:id, VehicleName:nm, LicensePlate:pl, VehicleType:tp, CapacityBox:cap, FuelCostPerKm:fr, CurrentDriver:drv, VehicleStatus:st, CartrackVehicleID:'', CartrackRegistration:pl, CurrentLatitude:lat, CurrentLongitude:lng, CurrentSpeed:sp, CurrentHeading:0, CurrentOdometer:odo, LastPositionTime:now(), LastSyncAt:'' }; }
  function d(id,cust,br,inv,lat,lng,box,pri){ return { DeliveryID:id, DeliveryDate:DATA_DATE, CustomerName:cust, BranchName:br, InvoiceNo:inv, Address:br, Latitude:lat, Longitude:lng, BoxQty:box, Priority:pri, Note:'', RouteID:'', Status:'Draft', CreatedAt:now(), UpdatedAt:now(), Version:1, IsDeleted:false }; }
  function nid(pre){ db.seq[pre]=(db.seq[pre]||0)+1; return pre+'-'+String(db.seq[pre]).padStart(3,'0'); }
  function log(a,ref,desc){ db.activities.unshift({ LogID:'LOG-'+Date.now(), Action:a, ReferenceID:ref, Description:desc, User:'ผู้จัดการระบบ', Timestamp:now() }); }
  // ---- driver auth (mock — ไม่ใช่ hash จริง แค่จำลองให้ทดสอบออฟไลน์ได้) ----
  function mockHash(id,pin){ return 'H:'+id+':'+pin; }
  function mockRequireDriver(p){
    if(!p.token) throw new Error('ไม่พบ session — กรุณาเข้าสู่ระบบ');
    const empId=db.driverTokens[p.token];
    if(!empId) throw new Error('เซสชันหมดอายุ — กรุณาเข้าสู่ระบบใหม่');
    return empId;
  }
  function mockAssertOwnerIfToken(p){
    if(!p.token) return;
    const empId=mockRequireDriver(p);
    const route=db.routes.find(x=>x.RouteID===p.routeId);
    if(route && route.DriverEmployeeID && String(route.DriverEmployeeID)!==String(empId)) throw new Error('Route นี้ไม่ได้มอบหมายให้คุณ');
  }

  const OPEN_WORK = ['Draft','Pending','Planned','Assigned','In Progress'];
  function deliveriesForWorkDateMock(date, promoteDraft){
    const from = new Date(date+'T12:00:00'); from.setDate(from.getDate()-14);
    const fromIso = from.toISOString().slice(0,10);
    const rows = db.deliveries.filter(x=>{
      if(x.IsDeleted) return false;
      if(x.DeliveryDate===date) return true;
      return x.DeliveryDate < date && x.DeliveryDate >= fromIso && OPEN_WORK.includes(x.Status);
    });
    if(promoteDraft){
      rows.forEach(x=>{
        if((x.Status==='Draft'||x.Status==='Pending'||!x.Status) && !x.RouteID && x.DeliveryDate < date){
          x.DeliveryDate = date; x.UpdatedAt = now();
        }
      });
    }
    return rows;
  }
  function dashboard(date){
    const dels = deliveriesForWorkDateMock(date, false);
    const routes = db.routes.filter(x=>x.DeliveryDate===date && !x.IsDeleted);
    const boxes = l => l.reduce((n,x)=>n+(Number(x.BoxQty)||0),0);
    const by = s => dels.filter(x=>x.Status===s);
    const st = s => ({ count:by(s).length, boxes:boxes(by(s)) });
    const kpi = { total:{count:dels.length,boxes:boxes(dels)}, draft:st('Draft'), planned:st('Planned'),
      assigned:st('Assigned'), inProgress:st('In Progress'), completed:st('Completed'), failed:st('Failed'),
      stops: routes.reduce((n,r)=>n+(Number(r.TotalStops)||0),0) };
    const est = routes.reduce((n,r)=>n+(Number(r.EstimatedTotalCost)||0),0);
    const company = routes.filter(r=>r.RouteType==='COMPANY_VEHICLE').reduce((n,r)=>n+(Number(r.EstimatedTotalCost)||0),0);
    const external = routes.filter(r=>r.RouteType==='EXTERNAL_VEHICLE').reduce((n,r)=>n+(Number(r.EstimatedTotalCost)||0),0);
    const other = routes.reduce((n,r)=>n+(Number(r.EstimatedOtherCost)||0),0);
    const tStops=kpi.stops, tBoxes=routes.reduce((n,r)=>n+(Number(r.TotalBoxes)||0),0);
    const cost = { total:est, company, external, other, avgPerRoute: routes.length?est/routes.length:0,
      avgPerStop: tStops?est/tStops:0, avgPerBox: tBoxes?est/tBoxes:0 };
    const fleet = { available:db.vehicles.filter(v=>v.VehicleStatus==='Available').length,
      inUse:db.vehicles.filter(v=>v.VehicleStatus==='In Use').length,
      offline:db.vehicles.filter(v=>['Offline','Stopped'].includes(v.VehicleStatus)).length, total:db.vehicles.length };
    return { date, kpi, cost, fleet, routes, activities: db.activities.slice(0,20) };
  }
  function cartrackStatus(){
    const en = String(setting('CARTRACK_ENABLED','false')).toLowerCase()==='true';
    const last = setting('CARTRACK_LAST_SYNC','');
    return { enabled:en, connected:false, hasCredentials:false, lastSync:last, stale:true,
      found:db.cartrackVehicles.length, matched:db.vehicles.filter(v=>v.LastSyncAt).length, mock:true };
  }
  function liveVehicles(){ return db.vehicles.map(v=>({ VehicleID:v.VehicleID, VehicleName:v.VehicleName, LicensePlate:v.LicensePlate, VehicleType:v.VehicleType, CapacityBox:v.CapacityBox, CurrentDriver:v.CurrentDriver, VehicleStatus:v.VehicleStatus, lat:v.CurrentLatitude, lng:v.CurrentLongitude, speed:v.CurrentSpeed, heading:v.CurrentHeading, odometer:v.CurrentOdometer, lastPositionTime:v.LastPositionTime, lastSyncAt:v.LastSyncAt })); }

  function handle(action, p){
    p = p || {};
    const date = p.date || Store.date;
    switch(action){
      case 'ping': return { pong:true, time:now(), mock:true };
      case 'getBootstrap': {
        const dels = deliveriesForWorkDateMock(date, true);
        return { serverTime:now(), date, settings:db.settings, customers:live(db.customers),
          employees:live(db.employees), vehicles:live(db.vehicles), externalProviders:live(db.externalProviders),
          externalVehicles:live(db.externalVehicles), dashboard:dashboard(date),
          deliveries:dels, routes:db.routes.filter(x=>x.DeliveryDate===date&&!x.IsDeleted), cartrack:cartrackStatus() };
      }
      case 'getDashboardData': return dashboard(date);
      case 'getDeliveries': {
        let r;
        if(p.date && !p.routeId && !p.exactDate) r = deliveriesForWorkDateMock(p.date, p.promoteDraft!==false);
        else { r=db.deliveries.filter(x=>!x.IsDeleted); if(p.date)r=r.filter(x=>x.DeliveryDate===p.date); }
        if(p.status)r=r.filter(x=>x.Status===p.status);
        return r;
      }
      case 'getRoutes': { let r=db.routes.filter(x=>!x.IsDeleted); if(p.date)r=r.filter(x=>x.DeliveryDate===p.date); return r; }
      case 'getRouteStops': return db.routeStops.filter(s=>!p.routeId||s.RouteID===p.routeId).sort((a,b)=>a.StopOrder-b.StopOrder);
      case 'getRouteGpsTrack': {
        const r = db.routes.find(x=>x.RouteID===p.routeId) || {};
        const linked = db.gps.filter(g=>g.RouteID===p.routeId);
        const orphans = db.gps.filter(g=>!g.RouteID && GpsTrack.isCartrack(g.EventType));
        const rm = GpsTrack.routeMetrics(r, linked, orphans);
        return rm.track;
      }
      case 'getCustomers': return live(db.customers);
      case 'getEmployees': return live(db.employees);
      case 'getVehicles': return live(db.vehicles);
      case 'getExternalProviders': return live(db.externalProviders);
      case 'getExternalVehicles': return live(db.externalVehicles);
      case 'getCartrackVehicles': return db.cartrackVehicles;
      case 'getLiveVehicleStatus': return liveVehicles();
      case 'getExpenses': { let r=db.expenses.filter(x=>!x.IsDeleted); if(p.routeId)r=r.filter(x=>x.RouteID===p.routeId); if(p.date)r=r.filter(x=>x.ExpenseDate===p.date); return r; }
      case 'getClaims': return db.claims.filter(x=>!x.IsDeleted);
      case 'getRouteCosts': return db.routes.filter(x=>!x.IsDeleted && (!p.date||x.DeliveryDate===p.date));
      case 'getReports': {
        const f=p.from,t=p.to,inR=x=>(!f||x>=f)&&(!t||x<=t);
        let deliveries=db.deliveries.filter(x=>!x.IsDeleted&&inR(x.DeliveryDate));
        if(t){
          const carry=deliveriesForWorkDateMock(t,false);
          const seen=new Set(deliveries.map(d=>d.DeliveryID));
          carry.forEach(d=>{
            if(seen.has(d.DeliveryID)) return;
            if(f && d.DeliveryDate>=f) return;
            deliveries.push(d); seen.add(d.DeliveryID);
          });
        }
        const routesList = db.routes.filter(x=>!x.IsDeleted&&inR(x.DeliveryDate));
        const fuelExp = {};
        db.expenses.filter(x=>!x.IsDeleted&&x.ExpenseType==='FUEL').forEach(e=>{
          if(e.RouteID) fuelExp[e.RouteID]=(fuelExp[e.RouteID]||0)+(Number(e.Amount)||0);
        });
        routesList.forEach(r=>{
          const linked = db.gps.filter(g=>g.RouteID===r.RouteID);
          const orphans = db.gps.filter(g=>!g.RouteID && GpsTrack.isCartrack(g.EventType));
          const rm = GpsTrack.routeMetrics(r, linked, orphans);
          r.GpsDistanceKm = rm.distanceKm;
          r.GpsDurationMin = rm.durationMin;
          r.GpsStartedAt = rm.startedAt;
          r.GpsEndedAt = rm.endedAt;
          r.GpsPointCount = rm.pointCount;
          r.GpsSource = rm.source;
          r.ActualFuelExpense = +(fuelExp[r.RouteID]||0).toFixed(2);
        });
        return { deliveries, routes:routesList, expenses:db.expenses.filter(x=>!x.IsDeleted&&inR(x.ExpenseDate)) };
      }
      case 'getSettings': return p.group?db.settings.filter(s=>s.Group===p.group):db.settings;
      case 'getCartrackStatus': return cartrackStatus();
      case 'getRealtime': { const dd=dashboard(date); const rs=db.routes.filter(x=>x.DeliveryDate===date&&!x.IsDeleted);
        const ids=rs.map(r=>r.RouteID); return { serverTime:now(), date, kpi:dd.kpi, cost:dd.cost, fleet:dd.fleet, routes:rs,
        stops:db.routeStops.filter(s=>ids.includes(s.RouteID)), vehicles:liveVehicles(), cartrack:cartrackStatus(), activities:dd.activities }; }

      /* ---- writes ---- */
      case 'createDelivery': { const id=nid('DEL'); const rec=Object.assign({ DeliveryID:id, DeliveryDate:date, Status:'Draft', RouteID:'', CreatedAt:now(), UpdatedAt:now(), Version:1, IsDeleted:false }, p.data); db.deliveries.push(rec); log('CREATE_DELIVERY',id,'สร้างงานส่ง '+(p.data.CustomerName||'')); return rec; }
      case 'updateDelivery': return patch(db.deliveries,'DeliveryID',p.id,p.data);
      case 'deleteDelivery': { log('DELETE_DELIVERY',p.id,'ลบงานส่ง'); return patch(db.deliveries,'DeliveryID',p.id,{IsDeleted:true}); }
      case 'createCustomer': { const id=nid('CUS'); const rec=Object.assign({ CustomerID:id, Status:'Active' }, p.data); db.customers.push(rec); log('CREATE_CUSTOMER',id,'เพิ่มลูกค้า '+(p.data.CustomerName||'')); return rec; }
      case 'updateCustomer': return patch(db.customers,'CustomerID',p.id,p.data);
      case 'createEmployee': { const id=nid('EMP'); const rec=Object.assign({ EmployeeID:id, Status:'Active', IsDeleted:false }, p.data); db.employees.push(rec); log('CREATE_EMPLOYEE',id,'เพิ่มพนักงาน '+(p.data.EmployeeName||'')); return rec; }
      case 'updateEmployee': return patch(db.employees,'EmployeeID',p.id,p.data);
      case 'createVehicle': { const id=nid('V'); const rec=Object.assign({ VehicleID:id, VehicleStatus:'Available', CurrentLatitude:warehouse().lat, CurrentLongitude:warehouse().lng }, p.data); db.vehicles.push(rec); log('CREATE_VEHICLE',id,'เพิ่มรถบริษัท '+(p.data.VehicleName||'')); return rec; }
      case 'updateVehicle': return patch(db.vehicles,'VehicleID',p.id,p.data);
      case 'createExternalVehicle': { const id=nid('EV'); const rec=Object.assign({ ExternalVehicleID:id, Status:'Available' }, p.data); db.externalVehicles.push(rec); log('CREATE_EXT_VEHICLE',id,'เพิ่มรถภายนอก'); return rec; }
      case 'updateExternalVehicle': return patch(db.externalVehicles,'ExternalVehicleID',p.id,p.data);
      case 'createRoute': case 'confirmRoute': case 'createExternalRoute': {
        const id=nid('ROUTE'); const dd=Object.assign({},p.data); computeCost(dd);
        dd.RouteID=id; dd.DeliveryDate=dd.DeliveryDate||date; dd.RouteType=dd.RouteType||'COMPANY_VEHICLE'; dd.Status=dd.Status||'Planned'; dd.CreatedAt=now(); dd.UpdatedAt=now(); dd.IsDeleted=false;
        db.routes.push(dd);
        (p.stops||[]).forEach((s,i)=>{ db.routeStops.push(Object.assign({ RouteID:id, StopOrder:i+1, Status:'Pending' }, s)); if(s.DeliveryID) patch(db.deliveries,'DeliveryID',s.DeliveryID,{Status:'Planned',RouteID:id}); });
        log('CREATE_ROUTE',id,'สร้าง Route ('+dd.RouteType+') · '+(dd.TotalStops||0)+' จุด'); return dd; }
      case 'updateRoute': { const dd=Object.assign({},p.data); if(dd.recompute){computeCost(dd);delete dd.recompute;} return patch(db.routes,'RouteID',p.id,dd); }
      case 'createExpense': { const id=nid('EXP'); const rec=Object.assign({ ExpenseID:id, ExpenseDate:date, CreatedAt:now(), IsDeleted:false }, p.data); db.expenses.push(rec); log('CREATE_EXPENSE',rec.RouteID||id,'บันทึกค่าใช้จ่าย '+(p.data.ExpenseType||'')); return rec; }
      case 'createClaim': { const id=nid('CLM'); const adv=Number(p.data.AdvanceAmount)||0, act=Number(p.data.ActualExpense)||0;
        const rec=Object.assign({ ClaimID:id, RefundAmount:adv>act?adv-act:0, AdditionalAmount:act>adv?act-adv:0, Balance:adv-act, Status:'Pending', CreatedAt:now(), IsDeleted:false }, p.data); db.claims.push(rec); log('CREATE_CLAIM',id,'เคลียร์เงิน'); return rec; }
      case 'updateClaim': return patch(db.claims,'ClaimID',p.id,p.data);
      case 'updateSetting': { const s=db.settings.find(x=>x.Key===p.key); if(s){s.Value=p.value;s.UpdatedAt=now();return s;} const rec={Key:p.key,Value:p.value,Group:p.group||'custom',Label:p.label||p.key,UpdatedAt:now()}; db.settings.push(rec); return rec; }
      case 'syncCartrack': { const en=String(setting('CARTRACK_ENABLED','false')).toLowerCase()==='true'; if(!en) return {ok:false,skipped:true,message:'โหมดทดลอง — Cartrack ปิดอยู่'}; return {ok:false,mock:true,message:'โหมดทดลองไม่เชื่อมต่อ Cartrack จริง'}; }
      case 'startRoute': { mockAssertOwnerIfToken(p); patch(db.routes,'RouteID',p.routeId,{Status:'In Progress'}); log('START_ROUTE',p.routeId,'เริ่มรอบส่ง'); return {ok:true}; }
      case 'checkIn': { mockAssertOwnerIfToken(p); const m=Number(p.distanceMeters)||9999; return { proximity: m<=100?'GREEN':(m<=500?'YELLOW':'RED') }; }
      case 'uploadPOD': return { ok:true, url:p.base64||'', viewUrl:p.base64||'', mock:true };
      case 'completeDelivery': { mockAssertOwnerIfToken(p); if(p.deliveryId)patch(db.deliveries,'DeliveryID',p.deliveryId,{Status:'Completed'}); const s=db.routeStops.find(x=>x.RouteID===p.routeId&&x.StopOrder==p.stopOrder); if(s){s.Status='Completed';s.DeliveryCompletedTime=now();if(p.photoUrl)s.PhotoURL=p.photoUrl;} log('COMPLETE_DELIVERY',p.deliveryId||p.routeId,'ส่งสินค้าเสร็จ'); return {ok:true}; }
      case 'failDelivery': { mockAssertOwnerIfToken(p); if(p.deliveryId)patch(db.deliveries,'DeliveryID',p.deliveryId,{Status:'Failed'}); const s=db.routeStops.find(x=>x.RouteID===p.routeId&&x.StopOrder==p.stopOrder); if(s){s.Status='Failed';if(p.photoUrl)s.PhotoURL=p.photoUrl;} log('FAILED_DELIVERY',p.deliveryId||p.routeId,'ส่งไม่สำเร็จ'); return {ok:true}; }
      case 'setDriverPin': { const emp=db.employees.find(x=>x.EmployeeID===p.id); if(!emp) throw new Error('ไม่พบพนักงาน');
        const pin=String(p.pin||''); if(!/^\d{4,6}$/.test(pin)) throw new Error('PIN ต้องเป็นเลข 4-6 หลัก');
        const username=String(p.username||'').trim(); if(!username) throw new Error('กรอก Username ก่อน');
        emp.Username=username; emp.PINHash=mockHash(emp.EmployeeID,pin); return emp; }
      case 'driverLogin': { const uname=String(p.username||'').trim().toLowerCase();
        const emp=db.employees.find(x=>String(x.Username||'').trim().toLowerCase()===uname);
        if(!emp) throw new Error('ไม่พบ Username นี้');
        if(!emp.PINHash || mockHash(emp.EmployeeID,p.pin)!==emp.PINHash) throw new Error('PIN ไม่ถูกต้อง');
        const token='MOCKTOKEN-'+emp.EmployeeID+'-'+Date.now(); db.driverTokens[token]=emp.EmployeeID;
        log('DRIVER_LOGIN',emp.EmployeeID,'คนขับเข้าสู่ระบบ');
        return { token, employee:{ EmployeeID:emp.EmployeeID, EmployeeName:emp.EmployeeName, Phone:emp.Phone } }; }
      case 'driverSelect': { const emp=db.employees.find(x=>x.EmployeeID===p.employeeId && !x.IsDeleted);
        if(!emp) throw new Error('ไม่พบพนักงาน');
        const token='MOCKTOKEN-'+emp.EmployeeID+'-'+Date.now(); db.driverTokens[token]=emp.EmployeeID;
        log('DRIVER_LOGIN',emp.EmployeeID,'คนขับเข้าสู่ระบบ (เลือกชื่อ)');
        return { token, employee:{ EmployeeID:emp.EmployeeID, EmployeeName:emp.EmployeeName, Phone:emp.Phone } }; }
      case 'driverLogout': { delete db.driverTokens[p.token]; return {ok:true}; }
      case 'getMyRoutes': { const empId=mockRequireDriver(p); let r=db.routes.filter(x=>!x.IsDeleted && String(x.DriverEmployeeID)===String(empId)); if(p.date) r=r.filter(x=>x.DeliveryDate===p.date); return r; }
      case 'getAvailableRoutes': { mockRequireDriver(p); let r=db.routes.filter(x=>!x.IsDeleted && x.RouteType==='COMPANY_VEHICLE' && x.Status==='Planned' && !x.DriverEmployeeID); if(p.date) r=r.filter(x=>x.DeliveryDate===p.date); return r; }
      case 'claimRoute': { const empId=mockRequireDriver(p); const r=db.routes.find(x=>x.RouteID===p.routeId); if(!r) throw new Error('ไม่พบ Route นี้'); if(r.DriverEmployeeID) throw new Error('งานนี้มีคนขับแล้ว'); r.DriverEmployeeID=empId; patch(db.routes,'RouteID',p.routeId,{Status:'In Progress'}); log('START_ROUTE',p.routeId,'เริ่มรอบส่ง'); return {ok:true}; }
      case 'driverPing': { const empId=mockRequireDriver(p); db.gps.push({RouteID:p.routeId||'',DeliveryID:'',Latitude:p.lat||'',Longitude:p.lng||'',Accuracy:p.accuracy||'',Timestamp:now(),EventType:'BEACON'});
        const emp=db.employees.find(x=>x.EmployeeID===empId); if(emp&&emp.VehicleID) patch(db.vehicles,'VehicleID',emp.VehicleID,{CurrentLatitude:p.lat||'',CurrentLongitude:p.lng||'',CurrentSpeed:p.speed||0,LastPositionTime:now()});
        return {ok:true}; }
      default: throw new Error('mock: unknown action '+action);
    }
  }
  function live(arr){ return arr.filter(x=>!x.IsDeleted); }
  function patch(arr,key,id,data){ const r=arr.find(x=>String(x[key])===String(id)); if(!r)throw new Error('ไม่พบ '+id); Object.assign(r,data,{UpdatedAt:now()}); return r; }
  function computeCost(d){ const f=+d.EstimatedFuelCost||0,t=+d.EstimatedTollCost||0,p=+d.EstimatedParkingCost||0,e=+d.EstimatedExternalCost||0,o=+d.EstimatedOtherCost||0; const tot=f+t+p+e+o; d.EstimatedTotalCost=tot; d.CostPerStop=d.TotalStops?+(tot/d.TotalStops).toFixed(2):0; d.CostPerBox=d.TotalBoxes?+(tot/d.TotalBoxes).toFixed(2):0; return d; }
  return { handle, db };
})();

/* ================================================================
   API LAYER
   ================================================================ */
const API = {
  url(){ const v=localStorage.getItem(LS_URL); if(v==='MOCK') return ''; return v || DEFAULT_API_URL; },
  setUrl(u){ if(u) localStorage.setItem(LS_URL,u); else localStorage.removeItem(LS_URL); },
  useMock(){ localStorage.setItem(LS_URL,'MOCK'); },
  configured(){ return !!this.url(); },
  // GET เป็น idempotent → retry ได้ปลอดภัย (ช่วยตอน Apps Script cold-start / เน็ตสะดุด)
  // หมายเหตุ: getBootstrap อ่านหลายชีต ใช้เวลา ~13 วิเป็นปกติ → ตั้ง timeout เผื่อไว้เยอะ
  // TODO(migration cutover): ค่า timeout/retry นี้ตั้งเผื่อความช้าของ Apps Script โดยเฉพาะ
  // พอย้ายไป Vercel+Postgres (ที่ควรตอบใน <1 วิ) ให้ลดลง (เช่น 10000ms, retry 1 ครั้ง)
  // เพื่อให้ error จริงโผล่เร็วขึ้น และลดช่วงเวลาที่ user อาจกดซ้ำจนข้อมูลซ้ำ
  async get(action, params={}, tries, timeoutMs){
    if(!this.configured()) return simulate(()=>Mock.handle(action, Object.assign({date:Store.date}, params)));
    const q = new URLSearchParams(Object.assign({action}, params)).toString();
    const n = tries!=null ? tries : 2;
    const ms = timeoutMs || 45000;
    let lastErr;
    for(let i=0;i<=n;i++){
      try{
        const res = await fetchWithTimeout(this.url()+'?'+q, { method:'GET', redirect:'follow' }, ms);
        return await parseApiResponse(res);
      }catch(e){ lastErr=e; if(i<n) await new Promise(r=>setTimeout(r, 800*(i+1))); }
    }
    throw lastErr;
  },
  // POST เป็น write → แนบ requestId คงที่ + retry ได้ 1 ครั้งถ้าเน็ตสะดุด (ไม่เขียนซ้ำ เพราะฝั่งเซิร์ฟเวอร์แคชผลลัพธ์ตาม requestId ไว้ให้)
  async post(action, body={}, timeoutMs){
    if(!this.configured()) return simulate(()=>Mock.handle(action, Object.assign({date:Store.date}, body)));
    const requestId = (crypto && crypto.randomUUID) ? crypto.randomUUID() : ('r'+Date.now()+Math.random().toString(36).slice(2));
    const payload = JSON.stringify(Object.assign({action, requestId}, body));
    const ms = timeoutMs || (action === 'syncTrcloudOrders' ? 90000 : 45000);
    let lastErr;
    for(let i=0;i<=1;i++){
      try{
        const res = await fetchWithTimeout(this.url(), { method:'POST', redirect:'follow',
          headers:{'Content-Type':'text/plain;charset=utf-8'}, body: payload }, ms);
        return await parseApiResponse(res);
      }catch(e){ lastErr=e; if(i===0) await new Promise(r=>setTimeout(r,800)); }
    }
    throw lastErr;
  }
};
function simulate(fn){ return new Promise(r=>setTimeout(()=>r(fn()), 60)); }
async function parseApiResponse(res){
  const text = await res.text();
  let j;
  try { j = JSON.parse(text); }
  catch (e) {
    if (res.status === 503 || res.status === 502 || res.status === 504) {
      throw new Error('เซิร์ฟเวอร์ไม่ว่างชั่วคราว (รหัส ' + res.status + ') — ลองกดอีกครั้งใน 10 วินาที');
    }
    if (res.status >= 400) {
      throw new Error('เซิร์ฟเวอร์ตอบผิดพลาด (รหัส ' + res.status + ')');
    }
    throw new Error('เซิร์ฟเวอร์ตอบไม่เป็น JSON — ลองรีเฟรชหน้า');
  }
  if (!j || j.ok === false) throw new Error((j && j.error) || ('API error ' + res.status));
  return j.data;
}
function fetchWithTimeout(url, opts, ms){
  const ctrl = new AbortController();
  const t = setTimeout(()=>ctrl.abort(), ms||45000);
  // cache:'no-store' บังคับเบราว์เซอร์ไม่ใช้ของแคชเก่าที่อาจค้างมาจากก่อนแก้ (ป้องกันเห็นพิกัด/สถานะเก่าเป็นวัน)
  return fetch(url, Object.assign({ signal:ctrl.signal, cache:'no-store' }, opts)).finally(()=>clearTimeout(t));
}

/* ================================================================
   LOCAL CACHE + OPTIMISTIC WRITES
   บันทึกแล้ว "สำเร็จทันที" — อัปเดตข้อมูลในเครื่องก่อน render เลย
   แล้วค่อยซิงก์ขึ้นเซิร์ฟเวอร์เบื้องหลัง (ถ้าพลาดจะย้อนกลับ + แจ้งเตือน)
   ================================================================ */
const KEY = { deliveries:'DeliveryID', customers:'CustomerID', employees:'EmployeeID',
  vehicles:'VehicleID', externalVehicles:'ExternalVehicleID', routes:'RouteID' };
function coll(name){ Store.data[name] = Store.data[name] || []; return Store.data[name]; }
let _tmpSeq = 0;
function tmpId(){ return 'TMP-' + (++_tmpSeq); }

// คำนวณตัวเลขสรุป (KPI/ต้นทุน/รถ) ใหม่จากข้อมูลในเครื่อง — ให้ Dashboard อัปเดตทันทีโดยไม่ต้องเรียกเซิร์ฟเวอร์
function recomputeDashboard(){
  const d = Store.data; if(!d) return;
  const dels = (d.deliveries||[]).filter(x=>!x.IsDeleted);
  const routes = (d.routes||[]).filter(x=>!x.IsDeleted);
  const boxes = l => l.reduce((n,x)=>n+(Number(x.BoxQty)||0),0);
  const by = s => dels.filter(x=>x.Status===s);
  const st = s => ({ count:by(s).length, boxes:boxes(by(s)) });
  const kpi = { total:{count:dels.length,boxes:boxes(dels)}, draft:st('Draft'), planned:st('Planned'),
    assigned:st('Assigned'), inProgress:st('In Progress'), completed:st('Completed'), failed:st('Failed'),
    stops: routes.reduce((n,r)=>n+(Number(r.TotalStops)||0),0) };
  const est = routes.reduce((n,r)=>n+(Number(r.EstimatedTotalCost)||0),0);
  const company = routes.filter(r=>r.RouteType==='COMPANY_VEHICLE').reduce((n,r)=>n+(Number(r.EstimatedTotalCost)||0),0);
  const external = routes.filter(r=>r.RouteType==='EXTERNAL_VEHICLE').reduce((n,r)=>n+(Number(r.EstimatedTotalCost)||0),0);
  const other = routes.reduce((n,r)=>n+(Number(r.EstimatedOtherCost)||0),0);
  const tStops = kpi.stops, tBoxes = routes.reduce((n,r)=>n+(Number(r.TotalBoxes)||0),0);
  const cost = { total:est, company, external, other, avgPerRoute: routes.length?est/routes.length:0,
    avgPerStop: tStops?est/tStops:0, avgPerBox: tBoxes?est/tBoxes:0 };
  const vs = s => (d.vehicles||[]).filter(v=>v.VehicleStatus===s).length;
  const fleet = { available:vs('Available'), inUse:vs('In Use'),
    offline:(d.vehicles||[]).filter(v=>['Offline','Stopped'].includes(v.VehicleStatus)).length, total:(d.vehicles||[]).length };
  d.dashboard = Object.assign({}, d.dashboard, { kpi, cost, fleet, routes });
}

// แกนกลาง optimistic: apply() แก้ข้อมูลในเครื่อง + คืน undo() · render ทันที · POST เบื้องหลัง
async function optimistic(apply, action, body, opts){
  opts = opts || {};
  Store.pending = (Store.pending||0) + 1;   // กัน background sync มาทับระหว่างรอเซิร์ฟเวอร์
  const undo = apply();
  recomputeDashboard();
  render();
  try{
    const r = await API.post(action, body);
    if(opts.reconcile) opts.reconcile(r);
    recomputeDashboard();
    Store.lastSync = new Date().toISOString(); Store._sig = dataSignature(Store.data); updateSync();
    render();
    return r;
  }catch(e){
    if(typeof undo==='function') undo();
    recomputeDashboard(); render();
    // timeout/network (AbortError, "Failed to fetch") ≠ server ปฏิเสธ — เซิร์ฟเวอร์อาจบันทึกสำเร็จไปแล้ว แค่ตอบช้ากว่า timeout
    // เตือนให้รีเฟรชเช็คก่อน ไม่ใช่บอกว่า "ไม่สำเร็จ" เฉยๆ เพราะจะชวนให้กดซ้ำจนข้อมูลซ้ำ (เจอเคสจริงกับหน้าพนักงาน)
    const isTimeout = e && (e.name==='AbortError' || /failed to fetch|network/i.test(e.message||''));
    if(isTimeout){
      toast('เซิร์ฟเวอร์ตอบช้าเกินไป (ไม่แน่ใจว่าบันทึกสำเร็จหรือไม่) — กด Ctrl+Shift+R รีเฟรชเช็คก่อนบันทึกซ้ำ','warn','ยังไม่ยืนยันผล', 15000);
    } else {
      toast('บันทึกไม่สำเร็จ: '+(e&&e.message||e)+' — ย้อนข้อมูลกลับแล้ว','err');
    }
    throw e;
  }finally{
    Store.pending = Math.max(0, (Store.pending||1) - 1);
  }
}
// ลายเซ็นข้อมูล — ใช้ตรวจว่ามีการเปลี่ยนแปลงจริงไหม ก่อน re-render (กันจอกระพริบ)
function dataSignature(d){
  if(!d) return '';
  const dels = (d.deliveries||[]).map(x=>x.DeliveryID+':'+x.Status+':'+x.RouteID).join('|');
  const rts  = (d.routes||[]).map(x=>x.RouteID+':'+x.Status).join('|');
  const veh  = (d.vehicles||[]).map(x=>x.VehicleID+':'+x.VehicleStatus).join('|');
  return dels+'#'+rts+'#'+veh;
}
// ซิงก์ข้อมูลเบื้องหลังอัตโนมัติ — ให้ผู้จ่ายงานเห็นสถานะที่คนขับอัปเดต โดยไม่ต้องรีเฟรชเอง
const SYNC_PAGES = ['dashboard','deliveries','rounds','vehicles','external','customers','employees','livemap'];
async function silentSync(){
  // Store._syncing กันรอบใหม่ยิงซ้อนรอบเก่าที่ยังไม่ตอบกลับ (Apps Script ตอบช้า 10-30+ วิ ถ้าซ้อนกันจะยิ่งอั้นคิว)
  if(!API.configured() || Store.pending || Store._syncing || (typeof document!=='undefined' && document.hidden)) return;
  Store._syncing = true;
  try{
    const data = await API.get('getBootstrap', { date: Store.date }, 0, 45000);
    if(Store.pending) return; // มีการแก้ไขแทรกระหว่างดึงข้อมูล → ทิ้งชุดนี้
    const sig = dataSignature(data);
    Store.data = applyDeliveryDedupe(data); Store.live = true; Store.lastSync = new Date().toISOString(); updateSync();
    if(sig !== Store._sig){ Store._sig = sig; if(SYNC_PAGES.includes(Store.page)) render(); }
  }catch(e){ Store.live = false; updateSync(); scheduleReconnect(); }
  finally{ Store._syncing = false; }
}
function createLocal(name, action, data, extra){
  const key = KEY[name], id = tmpId();
  const rec = Object.assign({ [key]:id, IsDeleted:false }, extra||{}, data, { __pending:true });
  return optimistic(()=>{ coll(name).unshift(rec); return ()=>{ const a=coll(name), i=a.indexOf(rec); if(i>=0)a.splice(i,1); }; },
    action, { data }, { reconcile:r=>{ const a=coll(name), i=a.indexOf(rec); if(i>=0){ if(r) a[i]=r; else { delete rec.__pending; } } } });
}
function updateLocal(name, action, id, data, bodyOverride){
  const key = KEY[name], a = coll(name);
  const rec = a.find(x=>String(x[key])===String(id));
  const prev = rec ? Object.assign({}, rec) : null;
  return optimistic(()=>{ if(rec) Object.assign(rec, data); return ()=>{ if(rec&&prev){ for(const k in rec) if(!(k in prev)) delete rec[k]; Object.assign(rec, prev); } }; },
    action, bodyOverride || { id, data }, { reconcile:r=>{ if(rec&&r) Object.assign(rec, r); } });
}
function deleteLocal(name, action, id, body){
  const key = KEY[name], a = coll(name);
  const i = a.findIndex(x=>String(x[key])===String(id)); const rec = a[i];
  return optimistic(()=>{ if(i>=0) a.splice(i,1); return ()=>{ if(rec) a.splice(Math.max(0,i),0,rec); }; },
    action, body || { id });
}
// เพิ่ม Route ที่เพิ่งสร้าง (จากผลลัพธ์ POST) เข้าแคชในเครื่อง + ตั้งงานที่เกี่ยวข้องเป็น "วางแผนแล้ว"
function localAddRoute(r, stops){
  if(!r) return;
  coll('routes').unshift(r);
  (stops||[]).forEach(s=>{ if(s.DeliveryID){ const d=(Store.data.deliveries||[]).find(x=>String(x.DeliveryID)===String(s.DeliveryID)); if(d){ d.Status='Planned'; d.RouteID=r.RouteID; } } });
  recomputeDashboard();
}
// สร้าง Route แบบ optimistic — ขึ้น Route ชั่วคราวในเครื่องทันที (ไม่ต้องรอ POST) แล้วค่อยสลับเป็นของจริงเมื่อเซิร์ฟเวอร์ตอบ
// ถ้าพลาด optimistic() จะย้อนกลับ (ลบ Route ชั่วคราว + คืนสถานะงานส่ง) ให้เอง
function createRouteOptimistic(action, data, stops){
  const tmp = Object.assign({ RouteID: tmpId(), IsDeleted:false, __pending:true }, data);
  const ids = (stops||[]).map(s=>s.DeliveryID).filter(Boolean);
  const stopRows = (stops||[]).map((s,i)=>Object.assign({}, s, { RouteID: tmp.RouteID, StopOrder: i + 1, Status: 'Pending' }));
  return optimistic(()=>{
    coll('routes').unshift(tmp);
    stopRows.forEach(s=>coll('routeStops').push(s));
    const prev = [];
    ids.forEach(id=>{ const d=(Store.data.deliveries||[]).find(x=>String(x.DeliveryID)===String(id)); if(d){ prev.push([d,d.Status,d.RouteID]); d.Status='Planned'; d.RouteID=tmp.RouteID; } });
    return ()=>{
      const a=coll('routes'), i=a.indexOf(tmp); if(i>=0) a.splice(i,1);
      const rs=coll('routeStops');
      for(let j=rs.length-1;j>=0;j--) if(rs[j].RouteID===tmp.RouteID) rs.splice(j,1);
      prev.forEach(([d,st,rid])=>{ d.Status=st; d.RouteID=rid; });
    };
  }, action, { data, stops },
  { reconcile:r=>{ if(!r) return; const a=coll('routes'), i=a.indexOf(tmp); if(i>=0) a[i]=r;
      coll('routeStops').forEach(s=>{ if(s.RouteID===tmp.RouteID) s.RouteID=r.RouteID; });
      ids.forEach(id=>{ const d=(Store.data.deliveries||[]).find(x=>String(x.DeliveryID)===String(id)); if(d && d.RouteID===tmp.RouteID) d.RouteID=r.RouteID; }); } });
}

/* ================================================================
   GEOCODING — แปลงที่อยู่ (ข้อความ) → พิกัด GPS อัตโนมัติ
   live: ใช้ Google Geocoder ผ่าน Apps Script (แม่นกับที่อยู่ไทย)
   fallback: OpenStreetMap Nominatim (ฟรี ไม่ต้องมี key)
   ================================================================ */
const Geo = {
  async geocode(address){
    address = String(address||'').trim();
    if(!address) return null;
    // 1) backend (Google) เมื่อเชื่อมต่อจริง
    if(API.configured()){
      try{ const r = await API.get('geocode',{ q:address }); if(r && r.lat) return { lat:+r.lat, lng:+r.lng, display:r.display||address, source:'google' }; }catch(e){}
    }
    // 2) fallback Nominatim
    try{
      const u='https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=th&q='+encodeURIComponent(address);
      const res = await fetch(u, { headers:{'Accept':'application/json'} });
      const a = await res.json();
      if(a && a[0]) return { lat:+a[0].lat, lng:+a[0].lon, display:a[0].display_name, source:'osm' };
    }catch(e){}
    return null;
  },
  // ระยะทาง/เวลา "ตามถนนจริง" + เส้นทางจริง ผ่าน OSRM (ฟรี ไม่ต้องมี key)
  // points = [{lat,lng}, ...] เรียงตามลำดับที่จะวิ่ง (คลัง → จุด1 → ... → คลัง)
  async route(points){
    try{
      const valid = (points||[]).map(p=>p && ({ lat:+p.lat, lng:+p.lng }))
        .filter(p=>p && Number.isFinite(p.lat) && Number.isFinite(p.lng));
      if(valid.length<2) return null;
      const coords = valid.map(p=>`${p.lng},${p.lat}`).join(';');
      const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`;
      const res = await fetch(url);
      const j = await res.json();
      if(j.code==='Ok' && j.routes && j.routes[0]){
        const r = j.routes[0];
        return {
          distance: +(r.distance/1000).toFixed(1),
          durationMin: Math.round(r.duration/60),
          legsKm: (r.legs||[]).map(l=>+(l.distance/1000).toFixed(1)),
          geometry: (r.geometry && r.geometry.coordinates || []).map(c=>[c[1],c[0]]),
          source:'osrm'
        };
      }
    }catch(e){}
    return null;
  }
};

/* ================================================================
   UI PRIMITIVES — toast / modal / states
   ================================================================ */
function toast(msg, type='info', title, durationMs){
  const wrap = el('toasts');
  const t = document.createElement('div');
  t.className = 'toast '+type;
  const ic = {ok:'check-circle-2',err:'x-circle',warn:'alert-triangle',info:'info'}[type]||'info';
  t.innerHTML = `<i data-lucide="${ic}"></i><div><div class="t-title">${esc(title|| ({ok:'สำเร็จ',err:'เกิดข้อผิดพลาด',warn:'แจ้งเตือน',info:'ข้อมูล'}[type]))}</div><div class="t-msg">${esc(msg)}</div></div><button class="toast-close" aria-label="ปิด" style="background:none;border:0;cursor:pointer;color:inherit;opacity:.6;flex-shrink:0"><i data-lucide="x" style="width:15px;height:15px"></i></button>`;
  wrap.appendChild(t); icons();
  const dismiss = ()=>{ t.style.transition='opacity .3s,transform .3s'; t.style.opacity='0'; t.style.transform='translateX(20px)'; setTimeout(()=>t.remove(),300); };
  const timer = setTimeout(dismiss, durationMs||3400);
  t.querySelector('.toast-close').onclick = ()=>{ clearTimeout(timer); dismiss(); };
}
function modal({title, body, foot, wide}){
  const root = el('modalRoot');
  root.innerHTML = `<div class="modal-back" id="mback"><div class="modal ${wide?'wide':''}">
    <div class="modal-head"><h3>${esc(title)}</h3><button class="icon-btn" id="mclose"><i data-lucide="x"></i></button></div>
    <div class="modal-body">${body}</div>${foot?`<div class="modal-foot">${foot}</div>`:''}</div></div>`;
  icons();
  const close = ()=>{ root.innerHTML=''; };
  el('mclose').onclick = close;
  el('mback').onclick = e=>{ if(e.target.id==='mback') close(); };
  return { close, root };
}
function closeModal(){ el('modalRoot').innerHTML=''; }
function confirmDialog(msg, onYes, {danger, yes='ยืนยัน'}={}){
  const m = modal({ title:'ยืนยันการทำรายการ', body:`<p style="font-size:14px;color:#3A4353;line-height:1.6;margin:0">${esc(msg)}</p>`,
    foot:`<button class="btn" id="cno">ยกเลิก</button><button class="btn ${danger?'btn-danger':'btn-primary'}" id="cyes">${esc(yes)}</button>` });
  el('cno').onclick = m.close;
  el('cyes').onclick = ()=>{ m.close(); onYes(); };
}
const loadingState = (t='กำลังโหลดข้อมูล…') => `<div class="state"><div class="spinner"></div><p style="margin-top:14px">${esc(t)}</p></div>`;
const emptyState = (t='ยังไม่มีข้อมูล', s='', act='') => `<div class="state"><div class="ic"><i data-lucide="inbox"></i></div><h3>${esc(t)}</h3><p>${esc(s)}</p>${act}</div>`;
const errorState = (msg, retry='render()') => `<div class="state"><div class="ic" style="background:#FEF2F2;color:#EF4444"><i data-lucide="alert-triangle"></i></div><h3>โหลดข้อมูลไม่สำเร็จ</h3><p>${esc(msg)}</p><button class="btn btn-primary" onclick="${retry}"><i data-lucide="refresh-cw"></i>ลองใหม่</button></div>`;

function badge(map, key){ const m=map[key]||{label:key||'—',cls:'b-gray'}; return `<span class="badge ${m.cls}">${esc(m.label)}</span>`; }
function priBadge(p){ return badge(PRIORITY,p); }
function dstatusBadge(s){ return badge(DSTATUS,s); }
function vstatusBadge(s){ const m=VSTATUS[s]||VSTATUS.Unknown; return `<span class="badge ${m.cls}"><span class="dot" style="background:${m.dot}"></span>${esc(m.label)}</span>`; }

/** แสดงชื่อรถสั้น — ทะเบียนเป็นหลัก (รุ่นรถเป็นรอง) */
function vehicleShortName(v){
  if(!v) return '—';
  const plate = v.LicensePlate || v.license_plate || '';
  const name = v.VehicleName || v.vehicle_name || '';
  return plate || name || '—';
}
function vehicleOptionLabel(v){
  if(!v) return '—';
  const plate = v.LicensePlate || '';
  const name = v.VehicleName || '';
  if(plate && name && name !== plate) return `${plate} · ${name}`;
  return plate || name || '—';
}
/** Tooltip สั้น — hover/focus */
function tip(text, inner){
  return `<span class="tip" tabindex="0"><span class="tip-trigger">${inner||'<i data-lucide="help-circle" style="width:14px;height:14px"></i>'}</span><span class="tip-bubble" role="tooltip">${esc(text)}</span></span>`;
}
function openDriverAccessModal(){
  const driverUrl = location.origin + location.pathname.replace(/\/?$/,'/') + '#/driver';
  const qr = 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' + encodeURIComponent(driverUrl);
  const m = modal({
    title: 'โหมดคนขับ',
    body: `<p class="small muted" style="margin:0 0 14px;line-height:1.55">ให้คนขับสแกน QR หรือเปิดลิงก์บนมือถือ แล้วแตะชื่อตัวเองเพื่อรับงาน</p>
      <div style="display:flex;flex-direction:column;align-items:center;gap:12px;padding:16px;background:var(--bg,#FAFBFC);border-radius:14px;border:1px solid var(--border)">
        <img src="${qr}" alt="QR โหมดคนขับ" width="200" height="200" style="border-radius:10px;background:#fff;padding:8px">
        <code class="small" style="word-break:break-all;text-align:center">${esc(driverUrl)}</code>
      </div>`,
    foot: `<button class="btn" id="drvQrCopy"><i data-lucide="copy"></i>คัดลอกลิงก์</button>
      <a class="btn btn-primary" href="#/driver" id="drvQrOpen"><i data-lucide="smartphone"></i>เปิดโหมดคนขับ</a>`
  });
  el('drvQrCopy').onclick = async ()=>{
    try{ await navigator.clipboard.writeText(driverUrl); toast('คัดลอกลิงก์แล้ว','ok'); }
    catch(e){ toast('คัดลอกไม่สำเร็จ — เปิดโหมดคนขับแทนได้','warn'); }
  };
  el('drvQrOpen').onclick = ()=> m.close();
}

/* ================================================================
   SHELL — sidebar / topbar / sync
   ================================================================ */
function buildNav(){
  const nav = el('nav');
  let html = '';
  NAV.forEach((g, gi) => {
    if (g.group) html += `<div class="nav-group${gi ? ' nav-group-sep' : ''}">${esc(g.group)}</div>`;
    g.items.forEach(it => { html += navLink(it); });
  });
  nav.innerHTML = html;
  // mobile bottom nav — 4 งานหลัก (รายงาน/คู่มือ เปิดจากเมนูซ้าย)
  const m = el('mnav');
  const mItems = [
    {id:'dashboard',icon:'home',label:'วันนี้'},
    {id:'planning',icon:'route',label:'จัดรถ'},
    {id:'livemap',icon:'map-pin',label:'ติดตาม'},
  ];
  m.innerHTML = mItems.map(it=>`<a href="#/${it.id}" class="${Store.page===it.id?'active':''}"><i data-lucide="${it.icon}"></i>${it.label}</a>`).join('');
  icons();
}
function navLink(it){
  if (it.external || it.href) {
    return `<a href="${esc(it.href || it.id)}" class="nav-item" target="_blank" rel="noopener"><i data-lucide="${it.icon}"></i><span>${esc(it.label)}</span></a>`;
  }
  return `<a href="#/${it.id}" class="nav-item ${Store.page===it.id?'active':''}" data-nav="${it.id}"><i data-lucide="${it.icon}"></i><span>${esc(it.label)}</span></a>`;
}

function updateSync(){
  const live = API.configured() && Store.live;
  const connecting = API.configured() && !Store.live && Store.connecting;
  const dot = live ? '#10B981' : (connecting ? '#F59E0B' : (API.configured()? '#F59E0B':'#F59E0B'));
  const txt = live ? 'เชื่อมต่อแล้ว' : (connecting ? 'กำลังเชื่อมต่อ…' : (API.configured()? 'กำลังลองเชื่อมต่อใหม่…' : 'โหมดทดลอง (Mock)'));
  ['syncDot'].forEach(id=>{ if(el(id)) el(id).style.background=dot; });
  ['syncText'].forEach(id=>{ if(el(id)) el(id).textContent=txt; });
  if(el('syncSub')) el('syncSub').textContent = Store.lastSync ? ('อัพเดท '+ago(Store.lastSync)) : '—';
}
function setDateLabel(){
  const lbl = el('dateLabel');
  if (!lbl) return;
  const today = new Date().toISOString().slice(0, 10);
  lbl.textContent = Store.date === today ? ('วันนี้ · ' + thDate(Store.date)) : thDate(Store.date);
}
function closeDatePop(){
  const pop = el('datePop');
  const btn = el('dateBtn');
  if (pop) pop.hidden = true;
  if (btn) btn.setAttribute('aria-expanded', 'false');
}
function openDatePicker(e){
  if (e) e.stopPropagation();
  const pop = el('datePop');
  const btn = el('dateBtn');
  if (!pop || !btn) return;
  if (!pop.hidden) { closeDatePop(); return; }

  const today = new Date().toISOString().slice(0, 10);
  const isToday = Store.date === today;
  const isMock = Store.date === DATA_DATE;
  pop.innerHTML = `
    <div class="date-pop-inner">
      <div class="date-pop-title">เลือกวันทำงาน</div>
      <input type="date" class="input" id="pkDate" value="${Store.date}">
      <div class="date-pick-preview" id="pkDateTh">${thDate(Store.date)}</div>
      <div class="date-pick-quick">
        <button class="btn btn-sm ${isToday ? 'btn-primary' : ''}" data-quick="today" type="button"><i data-lucide="calendar-check"></i>วันนี้</button>
        <button class="btn btn-sm ${isMock ? 'btn-primary' : ''}" data-quick="data" type="button"><i data-lucide="flask-conical"></i>ทดลอง</button>
      </div>
      <div class="small muted" style="margin:8px 0 10px">ทดลอง = ${thDate(DATA_DATE)}</div>
      <button class="btn btn-primary btn-block" id="pkOk" type="button"><i data-lucide="check"></i>ยืนยัน</button>
    </div>`;
  pop.hidden = false;
  btn.setAttribute('aria-expanded', 'true');
  icons();

  const refreshPreview = () => {
    const v = el('pkDate') && el('pkDate').value;
    const th = el('pkDateTh');
    if (th && v) th.textContent = thDate(v);
  };
  const pk = el('pkDate');
  if (pk) pk.onchange = refreshPreview;
  $$('[data-quick]', pop).forEach(b => b.onclick = () => {
    pk.value = b.dataset.quick === 'today' ? today : DATA_DATE;
    $$('[data-quick]', pop).forEach(x => x.classList.toggle('btn-primary', x === b));
    refreshPreview();
  });
  el('pkOk').onclick = async () => {
    Store.date = pk.value;
    closeDatePop();
    setDateLabel();
    await loadBootstrap();
    render();
  };

  if (!openDatePicker._bound) {
    openDatePicker._bound = true;
    document.addEventListener('click', ev => {
      if (!el('datePop') || el('datePop').hidden) return;
      if (ev.target.closest('#dateWrap')) return;
      closeDatePop();
    });
    document.addEventListener('keydown', ev => { if (ev.key === 'Escape') closeDatePop(); });
  }
}

/** บิลซ้ำในฐานข้อมูล (sync หลายรอบ) → แสดงแค่ 1 รายการต่อเลขบิล */
function normalizeDeliveries(list){
  if (!list || !list.length) return list || [];
  const rank = (d) => {
    let s = 0;
    if (d.RouteID) s += 100;
    const st = d.Status || '';
    if (st && st !== 'Draft' && st !== 'Pending' && st !== '') s += 50;
    if (d.Latitude && d.Longitude) s += 10;
    const amt = Number(d.Amount ?? d.GrandTotal ?? d.Total);
    if (Number.isFinite(amt) && amt > 0) s += 5;
    if (d.Address) s += 3;
    return s;
  };
  const byInv = new Map();
  const noInv = [];
  const seenId = new Set();
  for (const d of list) {
    const id = d.DeliveryID;
    if (id && seenId.has(id)) continue;
    if (id) seenId.add(id);
    const inv = String(d.InvoiceNo || '').trim().toLowerCase();
    if (!inv) { noInv.push(d); continue; }
    const prev = byInv.get(inv);
    if (!prev || rank(d) > rank(prev)) byInv.set(inv, d);
  }
  return [...byInv.values(), ...noInv];
}
function applyDeliveryDedupe(data){
  if (data && Array.isArray(data.deliveries)) data.deliveries = normalizeDeliveries(data.deliveries);
  return data;
}

/* ================================================================
   BOOTSTRAP / REFRESH
   ================================================================ */
async function loadBootstrap(){
  if(!API.configured()){
    Store.data = Mock.handle('getBootstrap', { date: Store.date });
    Store.live = false; Store.connecting = false; Store.error = null;
    Store.lastSync = new Date().toISOString(); updateSync(); return;
  }
  Store.loading = true; Store.connecting = true; updateSync();
  try{
    const data = await API.get('getBootstrap', { date: Store.date }, 2, 45000); // ลองได้ถึง 3 ครั้ง · timeout 45 วิ (bootstrap ~13 วิ)
    Store.data = applyDeliveryDedupe(data);
    Store.live = true;
    Store.lastSync = new Date().toISOString();
    Store._sig = dataSignature(data);
    Store.error = null;
    if (data.carriedOver > 0) {
      toast('ดึงงานค้าง ' + data.carriedOver + ' รายการมาวันที่ ' + thDate(Store.date) + ' แล้ว (รายงานวันนี้นับรวมด้วย)', 'ok');
    }
    if (data.ghostsPurged > 0) {
      toast('ลบแถวว่างค้าง ' + data.ghostsPurged + ' รายการ (ไม่มีบิล/PO/มูลค่า)', 'ok');
    }
  }catch(e){
    Store.live = false; Store.error = e.message;
    // ยังไม่มีข้อมูลเลย → ใช้ข้อมูลทดลองไปก่อนให้แอปใช้งานได้ แล้วลองเชื่อมใหม่อัตโนมัติ
    if(!Store.data || !Store.data.deliveries) Store.data = Mock.handle('getBootstrap', { date: Store.date });
    toast('เซิร์ฟเวอร์ตอบช้า — กำลังลองเชื่อมต่อใหม่อัตโนมัติ…','warn');
    scheduleReconnect();
  }finally{ Store.loading=false; Store.connecting=false; updateSync(); }
}
// พยายามเชื่อมต่อใหม่เบื้องหลังจนสำเร็จ (self-heal) — ผู้ใช้ไม่ต้องรีเฟรชเอง
let _reconnecting = false;
function scheduleReconnect(){
  if(_reconnecting || !API.configured()) return;
  _reconnecting = true;
  let attempt = 0;
  const tick = async ()=>{
    if(!API.configured()){ _reconnecting=false; return; }
    attempt++;
    try{
      const data = await API.get('getBootstrap', { date: Store.date }, 0);
      Store.data = applyDeliveryDedupe(data); Store.live = true; Store.error = null; Store.lastSync = new Date().toISOString();
      _reconnecting = false; updateSync(); render();
      toast('เชื่อมต่อเซิร์ฟเวอร์แล้ว ข้อมูลเป็นปัจจุบัน','ok');
    }catch(e){
      Store.live = false; updateSync();
      if(attempt < 30) setTimeout(tick, Math.min(15000, 2000*attempt));
      else _reconnecting = false;
    }
  };
  setTimeout(tick, 2500);
}

/* ================================================================
   ROUTER
   ================================================================ */
const ROUTES = {}; // filled below
function currentRoute(){
  const h = location.hash.replace(/^#\//,'') || 'dashboard';
  return h === 'deliveries' ? 'dashboard' : h;
}
async function render(){
  const page = currentRoute();
  Store.page = page;
  buildNav(); setDateLabel(); updateSync();
  const view = el('view');
  document.body.classList.toggle('driver-mode', page==='driver');
  document.body.classList.toggle('del-app-page', page==='dashboard' && window.innerWidth <= 720);
  if(page==='driver'){ view.classList.add('driver'); } else { view.classList.remove('driver'); el('dnav').innerHTML=''; }
  const fn = ROUTES[page] || ROUTES.dashboard;
  view.innerHTML = loadingState();
  try{
    await fn(view);
  }catch(e){
    console.error(e); view.innerHTML = errorState(e.message);
  }
  icons();
  view.scrollTop = 0;
}
window.render = render;
window.addEventListener('hashchange', render);
window.addEventListener('resize', () => {
  document.body.classList.toggle('del-app-page', currentRoute() === 'dashboard' && window.innerWidth <= 720);
});

/* ================================================================
   PLANNER — route optimization + options + cost
   ================================================================ */
const Planner = {
  fuelPerKm(){ return Number(setting('FUEL_COST_PER_KM',3.5)); },
  speed(){ return Number(setting('AVG_SPEED_KMH',30)); },
  toll(){ return Number(setting('DEFAULT_TOLL',300)); },
  parking(){ return Number(setting('DEFAULT_PARKING',130)); },
  // เวลาทำงานจริง 09:00–18:00 (540 นาที) — ใช้คำนวณจำนวนรถที่ต้องแบ่ง
  workStartHour(){ return Number(setting('WORK_START_HOUR',9)); },
  workEndHour(){ return Number(setting('WORK_END_HOUR',18)); },
  workDayMin(){ return Math.max(60, (this.workEndHour()-this.workStartHour())*60); },
  fmtDur(min){ min=Math.max(0,Math.round(min||0)); return Math.floor(min/60)+':'+String(min%60).padStart(2,'0')+' ชม.'; },
  // ทิศทางเฉลี่ยของกลุ่มจุด (จากคลัง) — ใช้ติดป้ายซ้าย/ขวา/ทิศ
  sectorLabel(seq){
    const wh=warehouse(); if(!seq||!seq.length) return '—';
    let sx=0,sy=0;
    seq.forEach(s=>{ const b=bearing(wh.lat,wh.lng,+s.Latitude,+s.Longitude)*Math.PI/180; sx+=Math.sin(b); sy+=Math.cos(b); });
    let deg=Math.atan2(sx,sy)*180/Math.PI; if(deg<0) deg+=360;
    const dirs=['เหนือ','ตะวันออกเฉียงเหนือ','ตะวันออก','ตะวันออกเฉียงใต้','ใต้','ตะวันตกเฉียงใต้','ตะวันตก','ตะวันตกเฉียงเหนือ'];
    return dirs[Math.round(deg/45)%8];
  },
  // ปลายทางเป็นห้าง/ศูนย์การค้า (มีค่าจอด) หรือไม่ — ตรวจจากชื่อ
  MALL_KW:['ห้าง','เซ็นทรัล','central','เดอะมอลล์','the mall','themall','เมกา','mega bangna','ซีคอน','seacon','เทอร์มินอล','terminal 21','terminal21','พารากอน','paragon','ไอคอนสยาม','iconsiam','เอ็มควอเทียร์','emquartier','เอ็มโพเรียม','emporium','ฟิวเจอร์','future park','futurepark','โรบินสัน','robinson','เกตเวย์','gateway','เมญ่า','maya','สเปลล์','spell','โชว์ ดีซี','show dc','ยูเนี่ยน','union mall'],
  isMall(s){ const t=((s.CustomerName||'')+' '+(s.BranchName||'')+' '+(s.Address||'')).toLowerCase(); return this.MALL_KW.some(k=>t.indexOf(k.toLowerCase())>-1); },
  // ค่าจอดรวม = จำนวนจุดที่เป็นห้าง × ค่าจอดต่อจุด (ร้านเดี่ยว = 0)
  autoParking(stops){ return (stops||[]).filter(s=>this.isMall(s)).length * this.parking(); },
  fuelCost(distanceKm, vehicle){ const rate=vehicle&&vehicle.FuelCostPerKm?Number(vehicle.FuelCostPerKm):this.fuelPerKm(); return +(distanceKm*rate).toFixed(2); },
  /** นาทีจอดส่งต่อจุด (ขึ้นของ + เซ็นรับ) — รวมในเวลาวิ่งทั้งรอบ */
  serviceMinPerStop(){ return Number(setting('SERVICE_MIN_PER_STOP', 12)) || 12; },
  driveMinForKm(km){ const sp = this.speed() || 30; return Math.max(0, (Number(km) || 0) / sp * 60); },
  /** ไทม์ไลน์ทีละจุด: ออกคลัง → ถึงจุด · กม. · จอด · ออกไปจุดถัดไป → กลับคลัง */
  buildStopTimeline(route, stops){
    const wh = warehouse();
    const seq = this.enrichStopCoords(stops || [], Store.data.deliveries, Store.data.customers)
      .slice()
      .sort((a, b) => (Number(a.StopOrder) || 0) - (Number(b.StopOrder) || 0));
    const dwell = this.serviceMinPerStop();
    let startMs;
    if (route && route.GpsStartedAt) {
      startMs = new Date(route.GpsStartedAt).getTime();
    } else {
      const day = String((route && route.DeliveryDate) || Store.date || '').slice(0, 10);
      const h = this.workStartHour();
      startMs = new Date(day + 'T' + String(h).padStart(2, '0') + ':00:00').getTime();
    }
    if (!Number.isFinite(startMs)) startMs = Date.now();
    const events = [];
    let t = startMs;
    let prev = { lat: wh.lat, lng: wh.lng };
    events.push({
      kind: 'depart_wh', label: 'ออกจากคลัง', place: wh.name || 'คลัง',
      at: t, km: 0, dwellMin: 0, leaveAt: t,
    });
    seq.forEach((s, i) => {
      let leg = Number(s._distPrev ?? s.DistanceFromPrevious);
      if (!Number.isFinite(leg) || leg < 0) {
        leg = this.hasCoords(s)
          ? haversine(prev.lat, prev.lng, +s.Latitude, +s.Longitude)
          : 0;
      }
      leg = +Number(leg).toFixed(1);
      // ระยะเกินจริงใน กทม./ปริมณฑล = พิกัดผิด ไม่นำไปคำนวณเวลา
      const badGeo = leg > 200;
      const useKm = badGeo ? 0 : leg;
      const driveMin = this.driveMinForKm(useKm);
      t += driveMin * 60000;
      const arriveAt = t;
      const leaveAt = arriveAt + dwell * 60000;
      events.push({
        kind: 'stop',
        order: Number(s.StopOrder) || (i + 1),
        label: 'จุด ' + (Number(s.StopOrder) || (i + 1)),
        place: s.CustomerName || '—',
        address: s.Address || '',
        deliveryId: s.DeliveryID,
        at: arriveAt,
        km: leg,
        badGeo,
        dwellMin: dwell,
        leaveAt,
      });
      t = leaveAt;
      if (this.hasCoords(s) && !badGeo) prev = { lat: +s.Latitude, lng: +s.Longitude };
    });
    let returnKm = +(haversine(prev.lat, prev.lng, wh.lat, wh.lng)).toFixed(1);
    const returnBad = returnKm > 200;
    if (returnBad) returnKm = 0;
    const returnDrive = this.driveMinForKm(returnKm);
    t += returnDrive * 60000;
    events.push({
      kind: 'return_wh', label: 'กลับถึงคลัง', place: wh.name || 'คลัง',
      at: t, km: returnBad ? null : returnKm, badGeo: returnBad, dwellMin: 0, leaveAt: t,
    });
    const totalKm = +(events.reduce((n, e) => n + (e.badGeo ? 0 : (Number(e.km) || 0)), 0)).toFixed(1);
    const totalMin = Math.round((t - startMs) / 60000);
    const hasBadGeo = events.some(e => e.badGeo);
    return {
      events, startMs, endMs: t, totalKm, totalMin, dwell,
      speed: this.speed(),
      startSource: route && route.GpsStartedAt ? 'gps' : 'plan',
      hasBadGeo,
    };
  },
  extAmount(v, distanceKm){ const rate=Number(v&&v.Rate)||0; return v&&v.RateType==='PER_KM' ? +(rate*distanceKm).toFixed(2) : +rate; },
  // เรียงรถว่างใกล้คลังก่อน (ไม่ใช้ความจุกล่อง)
  sortByWh(list){
    const wh=warehouse();
    return (list||[]).slice().sort((a,b)=>haversine(wh.lat,wh.lng,+a.CurrentLatitude||wh.lat,+a.CurrentLongitude||wh.lng)-haversine(wh.lat,wh.lng,+b.CurrentLatitude||wh.lat,+b.CurrentLongitude||wh.lng));
  },

  // nearest-neighbour with priority weighting, starting from warehouse
  order(stops, start){
    const wh = start || warehouse();
    const remain = stops.slice();
    const seq = []; let cur = wh;
    while(remain.length){
      let best=0, bestScore=Infinity;
      remain.forEach((s,i)=>{
        const dist = haversine(cur.lat,cur.lng,+s.Latitude,+s.Longitude);
        const w = (PRIORITY[s.Priority]||PRIORITY.NORMAL).w;
        const score = dist * w;
        if(score<bestScore){ bestScore=score; best=i; }
      });
      const pick = remain.splice(best,1)[0];
      pick._distPrev = haversine(cur.lat,cur.lng,+pick.Latitude,+pick.Longitude);
      seq.push(pick); cur = { lat:+pick.Latitude, lng:+pick.Longitude };
    }
    return seq;
  },
  // ระยะทางแสดงผล = ไป (คลัง→จุดส่ง) · ค่าน้ำมันใช้ไป-กลับ
  routeDisplayKm(m){ return m && m.outboundKm != null ? m.outboundKm : (m ? m.distance : 0); },
  fuelDistanceKm(m){ return m && m.distance != null ? m.distance : 0; },
  hasCoords(s){
    return !!(s && Number.isFinite(+s.Latitude) && Number.isFinite(+s.Longitude));
  },
  // เติมพิกัดจากงานส่ง / ลูกค้า — route_stops จาก DB มักไม่มี lat/lng แต่ deliveries มี
  enrichStopCoords(stops, deliveries, customers){
    const dels = deliveries || [];
    const custs = customers || [];
    const findDel = id => id && dels.find(x => String(x.DeliveryID) === String(id));
    const findCust = s => custs.find(c =>
      String(c.CustomerName || '').trim() === String(s.CustomerName || '').trim() &&
      (!String(s.BranchName || '').trim() || String(c.BranchName || '').trim() === String(s.BranchName || '').trim())
    );
    return (stops || []).map(s => {
      const copy = Object.assign({}, s);
      if (this.hasCoords(copy)) {
        copy.Latitude = +copy.Latitude;
        copy.Longitude = +copy.Longitude;
        return copy;
      }
      const d = findDel(copy.DeliveryID);
      if (d && this.hasCoords(d)) {
        copy.Latitude = +d.Latitude;
        copy.Longitude = +d.Longitude;
        return copy;
      }
      const c = findCust(copy);
      if (c && this.hasCoords(c)) {
        copy.Latitude = +c.Latitude;
        copy.Longitude = +c.Longitude;
      }
      return copy;
    });
  },
  // total distance incl return to warehouse (Haversine straight-line — instant, offline)
  metrics(seq){
    const wh = warehouse();
    let outbound = 0; let cur = wh;
    seq.forEach(s=>{
      const leg = haversine(cur.lat,cur.lng,+s.Latitude,+s.Longitude);
      s._distPrev = +leg.toFixed(1);
      outbound += leg;
      cur = { lat:+s.Latitude, lng:+s.Longitude };
    });
    const returnKm = haversine(cur.lat,cur.lng,wh.lat,wh.lng);
    const dist = outbound + returnKm;
    const boxes = seq.reduce((n,s)=>n+(Number(s.BoxQty)||0),0);
    const serviceMin = seq.length * this.serviceMinPerStop();
    const durationMin = Math.round(dist / this.speed() * 60 + serviceMin);
    return {
      distance:+dist.toFixed(1), outboundKm:+outbound.toFixed(1), returnKm:+returnKm.toFixed(1),
      boxes, stops:seq.length, durationMin, source:'straight'
    };
  },
  // ระยะทางตามถนนจริงผ่าน OSRM (async) — คืน null ถ้าล่ม (ให้ fallback ไป metrics())
  async roadMetrics(seq){
    const wh = warehouse();
    const pts = [{lat:wh.lat,lng:wh.lng}, ...seq.map(s=>({lat:+s.Latitude,lng:+s.Longitude})), {lat:wh.lat,lng:wh.lng}];
    const r = await Geo.route(pts);
    if(!r) return null;
    // legsKm[i] = ระยะจากจุดก่อนหน้าถึง seq[i]  (leg 0 = คลัง→จุด1)
    if(r.legsKm && r.legsKm.length){ seq.forEach((s,i)=>{ s._distPrev = r.legsKm[i]; }); }
    const outboundKm = r.legsKm && r.legsKm.length >= seq.length
      ? +(r.legsKm.slice(0, seq.length).reduce((n, km)=>n + km, 0)).toFixed(1)
      : r.distance;
    const returnKm = r.legsKm && r.legsKm.length > seq.length ? r.legsKm[seq.length] : 0;
    const boxes = seq.reduce((n,s)=>n+(Number(s.BoxQty)||0),0);
    return {
      distance:r.distance, outboundKm, returnKm,
      boxes, stops:seq.length, durationMin:r.durationMin + seq.length*this.serviceMinPerStop(),
      geometry:r.geometry, source:'osrm', legsKm:r.legsKm
    };
  },
  // คำนวณระยะทางตามแผนที่จากรายการจุดส่ง (ใช้ตอนพิมพ์ใบงาน)
  async metricsForStops(stops, deliveries, customers){
    const enriched = this.enrichStopCoords(stops, deliveries, customers);
    const ordered = enriched
      .filter(s => this.hasCoords(s))
      .sort((a,b)=>(Number(a.StopOrder)||0)-(Number(b.StopOrder)||0))
      .map(s => Object.assign({}, s, { Latitude:+s.Latitude, Longitude:+s.Longitude }));
    if(!ordered.length) return { metrics:null, seq:[], geoCount:0, totalCount:(stops||[]).length };
    const attachLegs = () => enriched.forEach(orig => {
      const calc = ordered.find(x =>
        (orig.DeliveryID && String(x.DeliveryID) === String(orig.DeliveryID)) ||
        x.StopOrder === orig.StopOrder
      );
      if(calc && calc._distPrev != null) orig._distPrev = calc._distPrev;
    });
    const road = await this.roadMetrics(ordered);
    if(road){ attachLegs(); return { metrics:road, seq:ordered, geoCount:ordered.length, totalCount:enriched.length }; }
    const straight = this.metrics(ordered);
    attachLegs();
    return { metrics:straight, seq:ordered, geoCount:ordered.length, totalCount:enriched.length };
  },
  companyCost(distanceKm, vehicle){
    const rate = vehicle && vehicle.FuelCostPerKm ? Number(vehicle.FuelCostPerKm) : this.fuelPerKm();
    const fuel = +(distanceKm*rate).toFixed(2);
    return { fuel, toll:this.toll(), parking:this.parking(), external:0, other:0, total:+(fuel+this.toll()+this.parking()).toFixed(2) };
  },
  externalCost(distanceKm, extVehicle){
    let ext = 0;
    const rate = Number(extVehicle.Rate)||0;
    switch(extVehicle.RateType){
      case 'PER_KM': ext = rate*distanceKm; break;
      case 'PER_TRIP': case 'PER_DAY': case 'CUSTOM': default: ext = rate; break;
    }
    ext = +ext.toFixed(2);
    return { fuel:0, toll:this.toll(), parking:this.parking(), external:ext, other:0, total:+(ext+this.toll()+this.parking()).toFixed(2) };
  },
  availableVehicles(){ return (Store.data.vehicles||[]).filter(v=>v.VehicleStatus==='Available'); },
  availableExternal(){ return (Store.data.externalVehicles||[]).filter(v=>v.Status==='Available'); },

  // รถบริษัทที่ว่าง + ใกล้คลังที่สุด (ไม่เช็กความจุกล่อง)
  recommendVehicle(){
    const wh = warehouse();
    const fit = this.sortByWh(this.availableVehicles());
    if(fit.length){ const v=fit[0]; v._distWh=+haversine(wh.lat,wh.lng,+v.CurrentLatitude||wh.lat,+v.CurrentLongitude||wh.lng).toFixed(1); return v; }
    return null;
  },

  // จำนวนคันแนะนำจากเวลาทำงานจริง (09:00–18:00) + จำนวนจุด
  suggestK(seq, metrics, availN){
    const work = this.workDayMin();
    const byTime = Math.max(1, Math.ceil((metrics.durationMin||0) / work));
    // อย่างน้อย 1 จุดต่อคัน — ไม่แบ่งเกินจำนวนจุดหรือจำนวนรถว่าง
    const k = Math.min(availN, Math.max(byTime, seq.length>=2 && availN>=2 ? 2 : 1), seq.length||1);
    return Math.max(1, k);
  },

  // build options — แบ่งตามเขต/ทิศทาง + เวลาทำงาน (ไม่ใช้ความจุกล่อง)
  options(seq, override){
    const m = this.metrics(seq);
    if(override){
      m.distance=override.distance; m.durationMin=override.durationMin; m.geometry=override.geometry; m.source=override.source;
      if(override.outboundKm != null) m.outboundKm=override.outboundKm;
      if(override.returnKm != null) m.returnKm=override.returnKm;
    }
    const avail = this.sortByWh(this.availableVehicles());
    const work = this.workDayMin();
    const workLbl = String(this.workStartHour()).padStart(2,'0')+':00–'+String(this.workEndHour()).padStart(2,'0')+':00';
    const opts = [];

    // OPTION A — รถบริษัทคันเดียว
    const rec = this.recommendVehicle();
    if(rec){
      const cost = this.companyCost(m.distance, rec);
      const over = m.durationMin > work;
      opts.push({ id:'A', name:'รถบริษัทคันเดียว', feasible:true, recommended:!over || avail.length<2,
        vehicles:[rec], distance:m.distance, duration:m.durationMin, boxes:m.boxes, stops:m.stops, cost, overtime:over,
        note: over
          ? `เวลาประมาณ ${this.fmtDur(m.durationMin)} เกินเวลาทำงาน ${workLbl} — แนะนำแบ่งหลายคัน`
          : `ใช้ ${vehicleShortName(rec)} · ใช้เวลา ~${this.fmtDur(m.durationMin)} (ภายใน ${workLbl})` });
    } else {
      opts.push({ id:'A', name:'รถบริษัทคันเดียว', feasible:false, vehicles:[],
        distance:m.distance, duration:m.durationMin, boxes:m.boxes, stops:m.stops,
        cost:this.companyCost(m.distance), note:'ไม่มีรถบริษัทว่าง' });
    }

    // OPTION B — รถบริษัท + รถภายนอก
    const ext = this.availableExternal()[0];
    if(ext){
      const compVeh = avail[0];
      const cCost = compVeh ? this.companyCost(m.distance*0.6, compVeh) : {fuel:0,toll:0,parking:0,external:0,total:0};
      const eCost = this.externalCost(m.distance*0.6, ext);
      const total = +(cCost.total + eCost.total).toFixed(2);
      opts.push({ id:'B', name:'รถบริษัท + รถภายนอก', feasible:true,
        vehicles:[compVeh,ext].filter(Boolean), external:ext,
        distance:m.distance, duration:m.durationMin, boxes:m.boxes, stops:m.stops,
        cost:{ fuel:cCost.fuel, toll:cCost.toll+eCost.toll, parking:cCost.parking+eCost.parking, external:eCost.external, other:0, total },
        note:`เสริมด้วย ${ext.ProviderName} · ${ext.LicensePlate||''}` });
    }

    // OPTION C — แบ่งตามเขต/ทิศทาง (ซ้าย–ขวา) + จับคู่รถ ตามเวลาทำงาน
    if(avail.length>=2 && seq.length>=2){
      let kRec = this.suggestK(seq, m, avail.length);
      if(kRec<2) kRec=2; // มี ≥2 คันและ ≥2 จุด → อย่างน้อยแบ่ง 2 ทิศ
      kRec = Math.min(kRec, avail.length, seq.length);
      const groups = this.autoSplit(seq, avail.slice(0,kRec));
      const totalDist = +groups.reduce((n,g)=>n+g.m.distance,0).toFixed(1);
      const cFuel=groups.reduce((n,g)=>n+g.cost.fuel,0), cToll=groups.reduce((n,g)=>n+g.cost.toll,0), cPark=groups.reduce((n,g)=>n+g.cost.parking,0);
      const anyOver = groups.some(g=>g.overtime);
      opts.push({ id:'C', name:`แบ่งตามเขต ${groups.length} คัน (ทิศทาง)`, feasible:true, recommended:m.durationMin>work || avail.length>=2,
        kRec, kMax:Math.min(avail.length, seq.length), split:groups,
        vehicles:groups.map(g=>g.v), distance:totalDist, duration:Math.max(...groups.map(g=>g.m.durationMin)),
        boxes:m.boxes, stops:m.stops, overtime:anyOver,
        cost:{ fuel:+cFuel.toFixed(2), toll:cToll, parking:cPark, external:0, other:0, total:+(cFuel+cToll+cPark).toFixed(2) },
        note: groups.map((g,i)=>`คัน ${i+1} ทิศ${g.sector}: ${g.seq.length} จุด · ${this.fmtDur(g.m.durationMin)}`).join(' · ') });
    }
    return { metrics:m, options:opts, workDayMin:work, workLabel:workLbl };
  },

  // แบ่งจุดส่งเป็น K กลุ่มตามทิศทาง (sweep bearing จากคลัง) — เท่า ๆ กันตามจำนวนจุด
  // แล้วปรับขอบเขตให้ระยะรวมสั้น — คืน {seq,m,v,cost,sector,overtime,bills}
  autoSplit(seq, vehicles){
    const wh = warehouse();
    const work = this.workDayMin();
    if(vehicles.length<=1){
      const s=this.order(seq.map(x=>Object.assign({},x))); const mm=this.metrics(s);
      return [{ seq:s, m:mm, v:vehicles[0], cost:this.companyCost(mm.distance, vehicles[0]),
        sector:this.sectorLabel(s), overtime:mm.durationMin>work, bills:s.map(x=>({invoice:x.InvoiceNo||'', customer:x.CustomerName||'', branch:x.BranchName||'', boxes:Number(x.BoxQty)||0, id:x.DeliveryID})) }];
    }
    const K = vehicles.length;
    // clone + เรียงตามมุมจากคลัง → กลุ่มติดกันเป็น “ซ้าย/ขวา” ตามพื้นที่
    const pts = seq.map(s=>Object.assign({},s)).sort((a,b)=>bearing(wh.lat,wh.lng,+a.Latitude,+a.Longitude)-bearing(wh.lat,wh.lng,+b.Latitude,+b.Longitude));
    const groups = Array.from({length:K},()=>[]);
    // แบ่งจำนวนจุดให้ใกล้เคียงกัน (ไม่ใช้ความจุกล่อง)
    const base = Math.floor(pts.length / K), rem = pts.length % K;
    let idx=0;
    for(let gi=0; gi<K; gi++){
      const take = base + (gi < rem ? 1 : 0);
      for(let t=0; t<take && idx<pts.length; t++) groups[gi].push(pts[idx++]);
    }

    const distOf = g => g.length ? this.metrics(this.order(g.map(x=>Object.assign({},x)))).distance : 0;
    for(let pass=0; pass<4; pass++){
      let improved=false;
      for(let i=0;i<K-1;i++){
        const A=groups[i], B=groups[i+1];
        if(!A.length || !B.length) continue;
        const baseD = distOf(A)+distOf(B);
        let bestCand=null, bestDist=baseD;
        if(A.length>1){
          const A2=A.slice(0,-1), B2=[A[A.length-1],...B];
          const d=distOf(A2)+distOf(B2); if(d<bestDist-0.05){ bestDist=d; bestCand=[A2,B2]; }
        }
        if(B.length>1){
          const B2=B.slice(1), A2=[...A,B[0]];
          const d=distOf(A2)+distOf(B2); if(d<bestDist-0.05){ bestDist=d; bestCand=[A2,B2]; }
        }
        if(bestCand){ groups[i]=bestCand[0]; groups[i+1]=bestCand[1]; improved=true; }
      }
      if(!improved) break;
    }
    return groups.map((g,i)=>{
      if(!g.length) return null;
      const s=this.order(g), mm=this.metrics(s), v=vehicles[i];
      return {
        seq:s, m:mm, v, cost:this.companyCost(mm.distance, v),
        sector:this.sectorLabel(s), overtime:mm.durationMin>work,
        bills:s.map(x=>({invoice:x.InvoiceNo||'', customer:x.CustomerName||'', branch:x.BranchName||'', boxes:Number(x.BoxQty)||0, id:x.DeliveryID}))
      };
    }).filter(Boolean);
  }
};

/* ================================================================
   MAP helper (Leaflet)
   ================================================================ */
const MapUtil = {
  make(id, center){
    const map = L.map(id, { zoomControl:true, attributionControl:false }).setView([center.lat,center.lng], 12);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { maxZoom:19, subdomains:'abcd' }).addTo(map);
    return map;
  },
  whMarker(map, wh){
    const m = L.marker([wh.lat,wh.lng], { zIndexOffset:1000, icon:L.divIcon({ className:'veh-pin',
      html:`<div class="wh-marker"><i data-lucide="warehouse"></i></div>`, iconSize:[42,42], iconAnchor:[21,21] }) }).addTo(map);
    m.bindTooltip('🏭 '+(wh.name||'คลังสินค้า'), { permanent:true, direction:'top', offset:[0,-22], className:'wh-tip' });
    m.bindPopup('<b>🏭 '+esc(wh.name||'คลังสินค้า')+'</b><br>จุดเริ่มต้น/สิ้นสุดเส้นทาง');
    return m;
  },
  stopMarker(map, s, n, color){
    return L.marker([+s.Latitude,+s.Longitude], { icon:L.divIcon({ className:'veh-pin', html:`<div class="stop-num" style="background:${color||'#2563EB'}">${n}</div>`, iconSize:[30,30], iconAnchor:[15,15] }) }).addTo(map).bindPopup(`<b>${esc(s.CustomerName||'')}</b><br>${esc(s.BranchName||'')}<br>${int(s.BoxQty)} กล่อง`);
  },
  vehMarker(map, v){
    const st=VSTATUS[deriveVehStatus(v)]||VSTATUS.Unknown;
    const moving = deriveVehStatus(v)==='In Use';
    return L.marker([+v.lat,+v.lng], { icon:L.divIcon({ className:'veh-pin', html:`${moving?`<div class="veh-ring" style="background:${st.dot}"></div>`:''}<div class="veh-dot" style="background:${st.dot}"><i data-lucide="truck"></i></div>`, iconSize:[30,30], iconAnchor:[15,15] }) }).addTo(map).bindPopup(`<b class="mono">${esc(vehicleShortName(v))}</b>${v.VehicleName&&v.LicensePlate&&v.VehicleName!==v.LicensePlate?' · '+esc(v.VehicleName):''}<br>${st.label} · ${int(v.speed)} กม./ชม.<br>${esc(v.CurrentDriver||'')}`);
  }
};

/* ================================================================
   EXPORT — CSV & Excel
   ================================================================ */
const Exporter = {
  csv(rows, filename){
    if(!rows||!rows.length){ toast('ไม่มีข้อมูลสำหรับ export','warn'); return; }
    const cols = Object.keys(rows[0]);
    const esc = v => { v = v==null?'':String(v); return /[",\n]/.test(v) ? '"'+v.replace(/"/g,'""')+'"' : v; };
    const csv = '﻿' + [cols.join(',')].concat(rows.map(r=>cols.map(c=>esc(r[c])).join(','))).join('\n');
    this.download(csv, filename+'.csv', 'text/csv;charset=utf-8');
  },
  excel(rows, filename, title){
    if(!rows||!rows.length){ toast('ไม่มีข้อมูลสำหรับ export','warn'); return; }
    const cols = Object.keys(rows[0]);
    const th = cols.map(c=>`<th style="background:#0B1220;color:#fff;padding:6px 10px">${c}</th>`).join('');
    const trs = rows.map(r=>`<tr>${cols.map(c=>`<td style="padding:5px 10px;border:1px solid #ccc">${r[c]==null?'':String(r[c])}</td>`).join('')}</tr>`).join('');
    const html = `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head><body><h3>${title||filename}</h3><table>${th?'<tr>'+th+'</tr>':''}${trs}</table></body></html>`;
    this.download('﻿'+html, filename+'.xls', 'application/vnd.ms-excel');
  },
  download(content, name, mime){
    const blob = new Blob([content], {type:mime});
    const a = document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href),1000);
    toast('ดาวน์โหลด '+name,'ok');
  }
};

/* ================================================================
   PRINT — เอกสาร A4/A5 พร้อมหัวโลโก้ Gadget Villa
   ================================================================ */
const Printer = {
  company(){
    return {
      name: setting('COMPANY_NAME','บริษัท แก็ดเจ็ต วิลล่า จำกัด'),
      addr: setting('WAREHOUSE_ADDRESS','729/28-37 ถ.รัชดาภิเษก แขวงบางโพงพาง เขตยานนาวา กรุงเทพฯ 10120'),
      wh: setting('WAREHOUSE_NAME','คลัง แก็ดเจ็ต วิลล่า')
    };
  },
  // เปิดหน้าต่างพิมพ์: title ("หัวไทย / English" แยกด้วย ' / '), ขนาด (A4/A5), เนื้อหา html
  open(title, size, bodyHtml){
    const c = this.company();
    const logo = location.origin + location.pathname.replace(/[^/]*$/,'') + 'logo.png';
    const A5 = size==='A5';
    const parts = String(title).split(' / ');
    const tMain = parts[0], tSub = parts.slice(1).join(' / ');
    const now = new Date().toLocaleString('th-TH', {dateStyle:'medium', timeStyle:'short'});
    const w = window.open('', '_blank', 'width=920,height=1040');
    if(!w){ toast('เบราว์เซอร์บล็อกป๊อปอัพ — อนุญาตป๊อปอัพแล้วลองใหม่','warn'); return; }
    w.document.write(`<!DOCTYPE html><html lang="th"><head><meta charset="utf-8"><title>${esc(tMain)}</title>
      <link href="https://fonts.googleapis.com/css2?family=Prompt:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
      <style>
        @page{ size:${size}; margin:${A5?'10mm':'14mm'}; }
        *{box-sizing:border-box;} html,body{margin:0;padding:0;}
        body{font-family:'Prompt',sans-serif;color:#0B1220;background:#e9edf2;font-size:${A5?'11px':'12.5px'};line-height:1.5;}
        .toolbar{position:sticky;top:0;z-index:9;display:flex;justify-content:flex-end;gap:8px;padding:10px 14px;background:#0B1220;}
        .toolbar button{font-family:'Prompt',sans-serif;border:none;border-radius:8px;padding:9px 18px;font-weight:700;cursor:pointer;font-size:13px;}
        .toolbar .p{background:#B4DC00;color:#152400;} .toolbar .c{background:#39424f;color:#fff;}
        .page{max-width:${A5?'560px':'800px'};margin:18px auto;background:#fff;padding:${A5?'20px 22px':'28px 30px'};box-shadow:0 6px 24px rgba(0,0,0,.14);border-radius:6px;}
        .hd{display:flex;align-items:flex-start;gap:16px;border-bottom:3px solid #B4DC00;padding-bottom:14px;margin-bottom:18px;}
        .hd .logo{height:${A5?'46px':'58px'};width:auto;flex-shrink:0;}
        .hd .co-wrap{flex:1;min-width:0;}
        .hd .co{font-size:${A5?'15px':'18px'};font-weight:800;color:#0B1220;line-height:1.2;}
        .hd .ad{font-size:${A5?'9.5px':'11px'};color:#555;margin-top:3px;line-height:1.45;}
        .hd .rt{text-align:right;flex-shrink:0;padding-left:16px;}
        .hd .rt .t{font-size:${A5?'19px':'24px'};font-weight:800;color:#0B1220;line-height:1.05;white-space:nowrap;}
        .hd .rt .sub{font-size:${A5?'9.5px':'11px'};color:#6f8a00;font-weight:700;letter-spacing:.14em;text-transform:uppercase;margin-top:2px;}
        .hd .rt .n{font-size:10px;color:#8a93a0;margin-top:6px;}
        table{width:100%;border-collapse:collapse;margin:8px 0;}
        th,td{border:1px solid #d6dbe2;padding:${A5?'6px 9px':'8px 11px'};text-align:left;font-size:inherit;vertical-align:middle;}
        td{line-height:1.4;}
        th{background:#0B1220;color:#fff;font-weight:600;text-align:center;}
        th.tl{text-align:left;}
        .slip-table th{white-space:normal;font-size:10px;line-height:1.3;padding:5px 6px;}
        .slip-table td{font-size:10.5px;padding:5px 6px;vertical-align:top;}
        .slip-table .mono{word-break:break-all;}
        td.addr{vertical-align:top;}
        tbody tr:nth-child(even) td{background:#f7f9f4;}
        tfoot th{background:#f0f5dd;color:#0B1220;}
        .r{text-align:right;} .c{text-align:center;}
        .kv{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px 22px;margin:6px 0 4px;padding:12px 16px;background:#f7f9f4;border:1px solid #e6ebd8;border-radius:9px;}
        .kv div{font-size:inherit;} .kv span{color:#667085;} .kv b{color:#0B1220;font-weight:600;}
        .sec-title{font-weight:700;font-size:${A5?'12.5px':'14.5px'};margin:16px 0 6px;color:#0B1220;padding-left:9px;border-left:3px solid #B4DC00;}
        .sign{display:flex;justify-content:space-between;margin-top:${A5?'30px':'52px'};gap:34px;}
        .sign div{flex:1;text-align:center;border-top:1px solid #333;padding-top:7px;font-size:11px;color:#555;}
        .muted{color:#8a93a0;} .foot{margin-top:20px;padding-top:10px;border-top:1px solid #eee;font-size:9.5px;color:#aab;text-align:center;}
        @media print{
          body{background:#fff;} .toolbar{display:none;}
          .page{max-width:none;margin:0;padding:0;box-shadow:none;border-radius:0;}
          tbody tr:nth-child(even) td{background:#f7f9f4 !important;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
          th{-webkit-print-color-adjust:exact;print-color-adjust:exact;}
        }
      </style></head><body>
      <div class="toolbar"><button class="p" onclick="window.print()">🖨️ พิมพ์</button><button class="c" onclick="window.close()">ปิด</button></div>
      <div class="page">
        <div class="hd">
          <img class="logo" src="${logo}" onerror="this.style.display='none'">
          <div class="co-wrap"><div class="co">${esc(c.name)}</div><div class="ad">${esc(c.addr)}</div></div>
          <div class="rt"><div class="t">${esc(tMain)}</div>${tSub?`<div class="sub">${esc(tSub)}</div>`:''}<div class="n">พิมพ์ ${now}</div></div>
        </div>
        ${bodyHtml}
        <div class="foot">เอกสารนี้พิมพ์จากระบบ DELIVERY DISPATCH &amp; ROUTE CONTROL CENTER · Gadget Villa</div>
      </div>
      <script>setTimeout(function(){try{window.focus();}catch(e){}},200);<\/script>
      </body></html>`);
    w.document.close();
  }
};

/* ================================================================
   CHARTS (hand-rolled SVG)
   ================================================================ */
const Chart = {
  bars(data, {h=180, color='#2563EB', money:m}={}){
    if(!data.length) return emptyState('ไม่มีข้อมูล');
    const max = Math.max(...data.map(d=>d.v), 1);
    const bw = 100/data.length;
    const bars = data.map((d,i)=>{ const bh=(d.v/max)*100; return `
      <g>
        <rect x="${i*bw+bw*0.18}%" y="${100-bh}%" width="${bw*0.64}%" height="${bh}%" rx="3" fill="${d.color||color}"></rect>
      </g>`; }).join('');
    const labels = data.map((d,i)=>`<div style="flex:1;text-align:center;font-size:10.5px;color:#9AA3B2;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(d.l)}</div>`).join('');
    const vals = data.map((d,i)=>`<div style="flex:1;text-align:center;font-size:11px;font-weight:600;color:#4B5363">${m?money(d.v):int(d.v)}</div>`).join('');
    return `<div style="display:flex;font-size:11px;margin-bottom:4px">${vals}</div>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" style="width:100%;height:${h}px;display:block">${bars}</svg>
      <div style="display:flex;margin-top:6px">${labels}</div>`;
  },
  donut(parts, {size=150}={}){
    const total = parts.reduce((n,p)=>n+p.v,0)||1;
    let acc=0; const R=60, C=2*Math.PI*R;
    const segs = parts.map(p=>{ const frac=p.v/total; const dash=frac*C; const seg=`<circle r="${R}" cx="80" cy="80" fill="none" stroke="${p.color}" stroke-width="26" stroke-dasharray="${dash} ${C-dash}" stroke-dashoffset="${-acc*C}" transform="rotate(-90 80 80)"></circle>`; acc+=frac; return seg; }).join('');
    const legend = parts.map(p=>`<div class="flex aic gap8" style="margin-bottom:6px"><span class="dot" style="background:${p.color};width:10px;height:10px"></span><span style="font-size:13px;color:#4B5363;flex:1">${esc(p.l)}</span><span class="mono strong" style="font-size:13px">${money(p.v)}</span></div>`).join('');
    return `<div class="flex aic gap12 wrap"><svg viewBox="0 0 160 160" style="width:${size}px;height:${size}px;flex-shrink:0">${segs}<text x="80" y="76" text-anchor="middle" font-size="13" fill="#9AA3B2">รวม</text><text x="80" y="96" text-anchor="middle" font-size="18" font-weight="700" fill="#0B1220" font-family="IBM Plex Mono">${int(total)}</text></svg><div style="flex:1;min-width:160px">${legend}</div></div>`;
  }
};

/* ---------------- EVENTS: shell ---------------- */
function bindShell(){
  el('menuBtn').onclick = ()=>{ el('sidebar').classList.toggle('open'); el('backdrop').classList.toggle('show'); };
  el('backdrop').onclick = ()=>{ el('sidebar').classList.remove('open'); el('backdrop').classList.remove('show'); };
  el('nav').addEventListener('click', ()=>{ el('sidebar').classList.remove('open'); el('backdrop').classList.remove('show'); });
  el('dateBtn').onclick = openDatePicker;
  const drvBtn = el('driverModeBtn');
  if(drvBtn) drvBtn.onclick = ()=> openDriverAccessModal();
  let _searchT;
  el('globalSearch').addEventListener('input', e=>{
    const v = e.target.value.trim().toLowerCase();
    clearTimeout(_searchT);
    _searchT = setTimeout(()=>{ Store.search=v; if(['deliveries','planning','customers'].includes(Store.page)) render(); }, 250);
  });
}
/* ROUTES are registered in app.pages.js */

/* ================================================================
   INIT
   ================================================================ */
async function init(){
  // รองรับ ?api=<AppsScriptURL> เพื่อ auto-connect (สะดวกตอน deploy/แชร์ให้ทีม)
  try{ const qp=new URLSearchParams(location.search).get('api'); if(qp){ API.setUrl(qp); history.replaceState(null,'',location.pathname+location.hash); } }catch(e){}
  // Cutover: ถ้า localStorage ยังจำ URL Apps Script เก่า (ไม่มี action ใหม่เช่น driverSelect)
  // ให้บังคับกลับไป /api/gas — ไม่งั้นโหมดคนขับจะขึ้น "unknown action: driverSelect"
  try{
    const savedApi = localStorage.getItem(LS_URL) || '';
    if(savedApi && /script\.google\.com/i.test(savedApi)){
      localStorage.removeItem(LS_URL);
      console.info('[API] migrated off Apps Script URL → /api/gas');
    }
  }catch(e){}
  Store.date = API.configured() ? new Date().toISOString().slice(0,10) : DATA_DATE;
  Store.data = Store.data || {};
  recomputeDashboard();   // เตรียมโครงสร้าง dashboard (ค่าเป็น 0) กันหน้าพังตอนยังไม่มีข้อมูล
  buildNav(); bindShell(); setDateLabel(); updateSync();
  if(!location.hash) location.hash = '#/dashboard';
  render();               // แสดงโครงหน้าทันที (ไม่ต้องรอเซิร์ฟเวอร์) ระหว่างกำลังเชื่อมต่อ
  await loadBootstrap();
  render();               // เติมข้อมูลจริงเมื่อเชื่อมต่อสำเร็จ
  // realtime polling ทุก 15 วิ — หน้าแผนที่/Cartrack/หน้าหลัก ดึงพิกัดสด (light)
  // Store._polling กันรอบใหม่ยิงซ้อนรอบเก่าที่ยังไม่ตอบกลับ
  Store.pollTimer = setInterval(async ()=>{
    const p = Store.page;
    if(!['dashboard','livemap','cartrack'].includes(p) || Store._polling) return;
    const ctOn = Store.data.cartrack && Store.data.cartrack.enabled;
    Store._polling = true;
    try{
      if((p==='livemap' || p==='cartrack') && ctOn && API.configured()){
        // เรียลไทม์: สั่งดึง Cartrack สด (โหมดเบา) แล้วอัปเดตตำแหน่งทันที
        const r = await API.post('syncCartrack',{light:true});
        if(r && r.vehicles){
          Store._live = Object.assign({}, Store._live||{}, { vehicles:r.vehicles });
          // merge เข้า Store.data.vehicles ด้วย เพื่อให้หน้า Cartrack ตารางสถานะขยับ
          const byId = new Map(r.vehicles.map(v=>[v.VehicleID, v]));
          if(Array.isArray(Store.data.vehicles)){
            Store.data.vehicles = Store.data.vehicles.map(v=>{
              const live = byId.get(v.VehicleID); if(!live) return v;
              return Object.assign({}, v, {
                CurrentLatitude: live.lat, CurrentLongitude: live.lng,
                CurrentSpeed: live.speed, CurrentHeading: live.heading,
                CurrentOdometer: live.odometer, LastPositionTime: live.lastPositionTime,
                LastSyncAt: live.lastSyncAt, VehicleStatus: live.VehicleStatus,
              });
            });
          }
          if(Store.data.cartrack){ Store.data.cartrack.lastSync=r.at; Store.data.cartrack.stale=false; Store.data.cartrack.matched=r.matched; Store.data.cartrack.connected=true; }
          Store.lastSync=new Date().toISOString(); updateSync();
          if(window._onRealtime) window._onRealtime({vehicles:r.vehicles});
          if(p==='cartrack') render();
        }
      } else {
        const rt = await API.get('getRealtime',{date:Store.date});
        Store.data.dashboard = { date:rt.date, kpi:rt.kpi, cost:rt.cost, fleet:rt.fleet, routes:rt.routes, activities:rt.activities };
        Store.data.cartrack=rt.cartrack; Store._live={stops:rt.stops, vehicles:rt.vehicles}; Store.lastSync=new Date().toISOString(); updateSync(); if(window._onRealtime) window._onRealtime(rt);
      }
    }catch(e){}
    finally{ Store._polling = false; }
  }, 15000);
  // ซิงก์ข้อมูลทั้งหมดเบื้องหลังทุก 120 วิ — สถานะที่คนขับ/เครื่องอื่นอัปเดต จะขึ้นเองอัตโนมัติ
  // (getBootstrap วัดจริงหน้างานช้าได้ถึง 20-35 วิ โดยเฉพาะตอนมีคนเปิดแอปพร้อมกันหลายคน จึงยืดรอบให้ห่างขึ้นเพื่อลดโอกาสซ้อนคิว)
  Store.syncTimer = setInterval(silentSync, 120000);
  // ดึง SO จาก TRCloud ทุก 3 นาที (ช่อง webhook SO ถูก gvtools ใช้อยู่ แก้ไม่ได้ — ใช้ poll แทน)
  // เบาลง — sync หนักทำให้ Worker 503/1102; ผู้ใช้กดดึงเองได้ที่หน้า TRCloud
  Store.trcloudTimer = setInterval(silentTrcloudSync, 600000);
  setTimeout(silentTrcloudSync, 30000);
}
async function silentTrcloudSync(){
  if(!API.configured() || Store._trcloudSyncing || Store.pending || (typeof document!=='undefined' && document.hidden)) return;
  Store._trcloudSyncing = true;
  try{
    const r = await API.post('syncTrcloudOrders', { dateTo: Store.date, workDate: Store.date, lookbackDays: 2, limit: 80 });
    if(r && ((r.imported|0) > 0 || (r.updated|0) > 0 || (r.ghostsPurged|0) > 0)){
      await silentSync();
      if(['deliveries','dashboard','trcloud'].includes(Store.page)) render();
    }
  }catch(e){}
  finally{ Store._trcloudSyncing = false; }
}
document.addEventListener('DOMContentLoaded', init);
