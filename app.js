/* ================================================================
   DELIVERY DISPATCH & ROUTE CONTROL CENTER — Frontend App (vanilla)
   Frontend → Google Apps Script → Google Sheets   |  Mock fallback
   ================================================================ */
'use strict';

/* ---------------- CONSTANTS ---------------- */
const LS_URL = 'ddc_api_url';
const DATA_DATE = '2026-07-20';           // วันที่ของชุดข้อมูลทดลอง

const PRIORITY = {
  HIGH:   { label:'ด่วน',        cls:'b-red',   rank:0, w:0.62, color:'#EF4444' },
  NORMAL: { label:'ปกติ',        cls:'b-amber', rank:1, w:1.0,  color:'#F59E0B' },
  LOW:    { label:'ไม่เร่งด่วน',  cls:'b-green', rank:2, w:1.35, color:'#10B981' }
};
const DSTATUS = {
  Draft:        { label:'ร่าง',        cls:'b-gray'   },
  Planned:      { label:'วางแผนแล้ว',  cls:'b-violet' },
  Assigned:     { label:'มอบหมายแล้ว', cls:'b-blue'   },
  'In Progress':{ label:'กำลังส่ง',    cls:'b-blue'   },
  Completed:    { label:'ส่งสำเร็จ',   cls:'b-green'  },
  Failed:       { label:'ไม่สำเร็จ',   cls:'b-red'    },
  Cancelled:    { label:'ยกเลิก',      cls:'b-gray'   }
};
const VSTATUS = {
  Available:{ label:'พร้อมใช้งาน', cls:'b-green', dot:'#10B981' },
  'In Use': { label:'กำลังใช้งาน', cls:'b-blue',  dot:'#2563EB' },
  Stopped:  { label:'จอดอยู่',     cls:'b-amber', dot:'#F59E0B' },
  Offline:  { label:'ออฟไลน์',     cls:'b-gray',  dot:'#9AA3B2' },
  Unknown:  { label:'ไม่ทราบ',     cls:'b-gray',  dot:'#9AA3B2' }
};
const RATE_TYPE = { PER_TRIP:'ต่อเที่ยว', PER_KM:'ต่อกิโลเมตร', PER_DAY:'ต่อวัน', CUSTOM:'กำหนดเอง' };

const NAV = [
  { group:'OPERATIONS', items:[
    { id:'dashboard', label:'Dashboard', icon:'layout-dashboard' },
    { id:'deliveries', label:'งานส่งสินค้า', icon:'package' },
    { id:'planning', label:'วางแผนเส้นทาง', icon:'route' },
    { id:'rounds', label:'รอบส่งสินค้า', icon:'list-checks' },
    { id:'tracking', label:'ติดตามพัสดุ', icon:'package-search' },
    { id:'livemap', label:'แผนที่ติดตาม', icon:'map-pin' },
  ]},
  { group:'FLEET', items:[
    { id:'vehicles', label:'รถบริษัท', icon:'truck' },
    { id:'external', label:'รถจ้างภายนอก', icon:'truck-electric' },
  ]},
  { group:'FINANCE', items:[
    { id:'expenses', label:'ค่าใช้จ่าย', icon:'receipt' },
    { id:'advance', label:'เงินทดรองจ่าย', icon:'hand-coins' },
    { id:'routecost', label:'ต้นทุนต่อ Route', icon:'calculator' },
  ]},
  { group:'MASTER DATA', items:[
    { id:'customers', label:'ลูกค้า / สาขา', icon:'store' },
    { id:'employees', label:'พนักงานส่งสินค้า', icon:'users' },
  ]},
  { group:'REPORTS', items:[
    { id:'reports', label:'รายงาน', icon:'bar-chart-3' },
  ]},
];
const NAV_FOOT = [
  { id:'settings', label:'ตั้งค่าระบบ', icon:'settings' },
  { id:'cartrack', label:'Cartrack Integration', icon:'satellite-dish' },
];

/* ---------------- STATE ---------------- */
const Store = {
  date: DATA_DATE,
  page: 'dashboard',
  loading: false,
  error: null,
  live: false,          // connected to Apps Script?
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
function ago(iso){ if(!iso) return '—'; const s=(Date.now()-new Date(iso).getTime())/1000; if(s<60) return `${Math.round(s)} วินาทีที่แล้ว`; if(s<3600) return `${Math.round(s/60)} นาทีที่แล้ว`; return timeShort(iso); }
function haversine(a,b,c,d){ const R=6371,rad=Math.PI/180; const dLat=(c-a)*rad,dLng=(d-b)*rad; const x=Math.sin(dLat/2)**2+Math.cos(a*rad)*Math.cos(c*rad)*Math.sin(dLng/2)**2; return R*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x)); }
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
      k('AVG_SPEED_KMH','30','cost','ความเร็วเฉลี่ย (กม./ชม.)'),
      k('DEFAULT_TOLL','300','cost','ค่าทางด่วนเริ่มต้น (บาท)'),
      k('DEFAULT_PARKING','130','cost','ค่าจอดรถเริ่มต้น (บาท)'),
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
      { EmployeeID:'EMP-01', EmployeeName:'นายสมชาย ใจดี', Phone:'081-111-1111', Role:'DRIVER', VehicleID:'V-01', Status:'Active' },
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
    seq: { DEL:6, CUS:6, V:3, EV:2, ROUTE:0, EXP:0, CLM:0 }
  };
  function k(K,V,G,L){ return { Key:K, Value:V, Group:G, Label:L, UpdatedAt:now() }; }
  function c(id,name,br,addr,lat,lng,ph){ return { CustomerID:id, CustomerName:name, BranchName:br, Address:addr, Latitude:lat, Longitude:lng, Phone:ph, ContactPerson:'', Status:'Active' }; }
  function v(id,nm,pl,tp,cap,fr,drv,st,lat,lng,sp,odo){ return { VehicleID:id, VehicleName:nm, LicensePlate:pl, VehicleType:tp, CapacityBox:cap, FuelCostPerKm:fr, CurrentDriver:drv, VehicleStatus:st, CartrackVehicleID:'', CartrackRegistration:pl, CurrentLatitude:lat, CurrentLongitude:lng, CurrentSpeed:sp, CurrentHeading:0, CurrentOdometer:odo, LastPositionTime:now(), LastSyncAt:'' }; }
  function d(id,cust,br,inv,lat,lng,box,pri){ return { DeliveryID:id, DeliveryDate:DATA_DATE, CustomerName:cust, BranchName:br, InvoiceNo:inv, Address:br, Latitude:lat, Longitude:lng, BoxQty:box, Priority:pri, Note:'', RouteID:'', Status:'Draft', CreatedAt:now(), UpdatedAt:now(), Version:1, IsDeleted:false }; }
  function nid(pre){ db.seq[pre]=(db.seq[pre]||0)+1; return pre+'-'+String(db.seq[pre]).padStart(3,'0'); }
  function log(a,ref,desc){ db.activities.unshift({ LogID:'LOG-'+Date.now(), Action:a, ReferenceID:ref, Description:desc, User:'ผู้จัดการระบบ', Timestamp:now() }); }

  function dashboard(date){
    const dels = db.deliveries.filter(x=>x.DeliveryDate===date && !x.IsDeleted);
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
      case 'getBootstrap': return { serverTime:now(), date, settings:db.settings, customers:live(db.customers),
        employees:live(db.employees), vehicles:live(db.vehicles), externalProviders:live(db.externalProviders),
        externalVehicles:live(db.externalVehicles), dashboard:dashboard(date),
        deliveries:db.deliveries.filter(x=>x.DeliveryDate===date&&!x.IsDeleted), routes:db.routes.filter(x=>x.DeliveryDate===date&&!x.IsDeleted), cartrack:cartrackStatus() };
      case 'getDashboardData': return dashboard(date);
      case 'getDeliveries': { let r=db.deliveries.filter(x=>!x.IsDeleted); if(p.date)r=r.filter(x=>x.DeliveryDate===p.date); if(p.status)r=r.filter(x=>x.Status===p.status); return r; }
      case 'getRoutes': { let r=db.routes.filter(x=>!x.IsDeleted); if(p.date)r=r.filter(x=>x.DeliveryDate===p.date); return r; }
      case 'getRouteStops': return db.routeStops.filter(s=>!p.routeId||s.RouteID===p.routeId).sort((a,b)=>a.StopOrder-b.StopOrder);
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
      case 'getReports': { const f=p.from,t=p.to,inR=x=>(!f||x>=f)&&(!t||x<=t);
        return { deliveries:db.deliveries.filter(x=>!x.IsDeleted&&inR(x.DeliveryDate)), routes:db.routes.filter(x=>!x.IsDeleted&&inR(x.DeliveryDate)), expenses:db.expenses.filter(x=>!x.IsDeleted&&inR(x.ExpenseDate)) }; }
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
      case 'startRoute': { patch(db.routes,'RouteID',p.routeId,{Status:'In Progress'}); log('START_ROUTE',p.routeId,'เริ่มรอบส่ง'); return {ok:true}; }
      case 'checkIn': { const m=Number(p.distanceMeters)||9999; return { proximity: m<=100?'GREEN':(m<=500?'YELLOW':'RED') }; }
      case 'completeDelivery': { if(p.deliveryId)patch(db.deliveries,'DeliveryID',p.deliveryId,{Status:'Completed'}); const s=db.routeStops.find(x=>x.RouteID===p.routeId&&x.StopOrder==p.stopOrder); if(s)s.Status='Completed'; log('COMPLETE_DELIVERY',p.deliveryId||p.routeId,'ส่งสินค้าเสร็จ'); return {ok:true}; }
      case 'failDelivery': { if(p.deliveryId)patch(db.deliveries,'DeliveryID',p.deliveryId,{Status:'Failed'}); log('FAILED_DELIVERY',p.deliveryId||p.routeId,'ส่งไม่สำเร็จ'); return {ok:true}; }
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
  url(){ return localStorage.getItem(LS_URL) || ''; },
  setUrl(u){ if(u) localStorage.setItem(LS_URL,u); else localStorage.removeItem(LS_URL); },
  configured(){ return !!this.url(); },
  async get(action, params={}){
    if(!this.configured()) return simulate(()=>Mock.handle(action, Object.assign({date:Store.date}, params)));
    const q = new URLSearchParams(Object.assign({action}, params)).toString();
    const res = await fetch(this.url()+'?'+q, { method:'GET', redirect:'follow' });
    const j = await res.json();
    if(!j.ok) throw new Error(j.error||'API error');
    return j.data;
  },
  async post(action, body={}){
    if(!this.configured()) return simulate(()=>Mock.handle(action, Object.assign({date:Store.date}, body)));
    const res = await fetch(this.url(), { method:'POST', redirect:'follow',
      headers:{'Content-Type':'text/plain;charset=utf-8'},
      body: JSON.stringify(Object.assign({action}, body)) });
    const j = await res.json();
    if(!j.ok) throw new Error(j.error||'API error');
    return j.data;
  }
};
function simulate(fn){ return new Promise(r=>setTimeout(()=>r(fn()), 180)); }

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
      const valid = (points||[]).filter(p=>p && p.lat && p.lng);
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
function toast(msg, type='info', title){
  const wrap = el('toasts');
  const t = document.createElement('div');
  t.className = 'toast '+type;
  const ic = {ok:'check-circle-2',err:'x-circle',warn:'alert-triangle',info:'info'}[type]||'info';
  t.innerHTML = `<i data-lucide="${ic}"></i><div><div class="t-title">${esc(title|| ({ok:'สำเร็จ',err:'เกิดข้อผิดพลาด',warn:'แจ้งเตือน',info:'ข้อมูล'}[type]))}</div><div class="t-msg">${esc(msg)}</div></div>`;
  wrap.appendChild(t); icons();
  setTimeout(()=>{ t.style.transition='opacity .3s,transform .3s'; t.style.opacity='0'; t.style.transform='translateX(20px)'; setTimeout(()=>t.remove(),300); }, 3400);
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

/* ================================================================
   SHELL — sidebar / topbar / sync
   ================================================================ */
function buildNav(){
  const nav = el('nav');
  let html='';
  NAV.forEach(g=>{
    html += `<div class="nav-group">${g.group}</div>`;
    g.items.forEach(it=>{ html += navLink(it); });
  });
  nav.innerHTML = html;
  // footer links live in sidebar-foot area — inject settings/cartrack above sync
  const foot = $('.sidebar-foot');
  if(!$('#footLinks')){
    const div = document.createElement('div'); div.id='footLinks'; div.style.marginBottom='8px';
    div.innerHTML = NAV_FOOT.map(navLink).join('');
    foot.insertBefore(div, foot.firstChild);
  } else { $('#footLinks').innerHTML = NAV_FOOT.map(navLink).join(''); }
  // mobile bottom nav
  const m = el('mnav');
  const mItems = [ {id:'dashboard',icon:'layout-dashboard',label:'หน้าหลัก'},{id:'deliveries',icon:'package',label:'งานส่ง'},
    {id:'planning',icon:'route',label:'จัด Route'},{id:'livemap',icon:'map-pin',label:'แผนที่'},{id:'driver',icon:'smartphone',label:'คนขับ'} ];
  m.innerHTML = mItems.map(it=>`<a href="#/${it.id}" class="${Store.page===it.id?'active':''}"><i data-lucide="${it.icon}"></i>${it.label}</a>`).join('');
  icons();
}
function navLink(it){ return `<a href="#/${it.id}" class="nav-item ${Store.page===it.id?'active':''}" data-nav="${it.id}"><i data-lucide="${it.icon}"></i><span>${esc(it.label)}</span>${it.id==='dashboard'?'<i data-lucide="chevron-right" class="chev"></i>':''}</a>`; }

function updateSync(){
  const live = API.configured() && Store.live;
  const dot = live ? '#10B981' : (API.configured()? '#EF4444':'#F59E0B');
  const txt = live ? 'เชื่อมต่อแล้ว' : (API.configured()? 'เชื่อมต่อไม่ได้' : 'โหมดทดลอง (Mock)');
  ['syncDot','syncDot2'].forEach(id=>{ if(el(id)) el(id).style.background=dot; });
  ['syncText','syncText2'].forEach(id=>{ if(el(id)) el(id).textContent=txt; });
  if(el('syncSub')) el('syncSub').textContent = Store.lastSync ? ('อัพเดท '+ago(Store.lastSync)) : '—';
  const badge = el('bellBadge'); if(badge){ const n=(Store.data.dashboard&&Store.data.dashboard.kpi)?Store.data.dashboard.kpi.draft.count:0; badge.textContent=n; badge.style.display=n?'flex':'none'; }
}
function setDateLabel(){ if(el('dateLabel')) el('dateLabel').textContent = thDate(Store.date); }

/* ================================================================
   BOOTSTRAP / REFRESH
   ================================================================ */
async function loadBootstrap(){
  try{
    Store.loading = true;
    const data = await API.get('getBootstrap', { date: Store.date });
    Store.data = data;
    Store.live = API.configured();
    Store.lastSync = new Date().toISOString();
    Store.error = null;
  }catch(e){
    Store.live = false; Store.error = e.message;
    // fallback to mock so app still works
    Store.data = Mock.handle('getBootstrap', { date: Store.date });
    toast('เชื่อมต่อ Apps Script ไม่ได้ — ใช้ข้อมูลทดลองแทน ('+e.message+')','warn');
  }finally{ Store.loading=false; updateSync(); }
}

/* ================================================================
   ROUTER
   ================================================================ */
const ROUTES = {}; // filled below
function currentRoute(){ const h = location.hash.replace(/^#\//,''); return h || 'dashboard'; }
async function render(){
  const page = currentRoute();
  Store.page = page;
  buildNav(); setDateLabel(); updateSync();
  const view = el('view');
  if(page==='driver'){ view.classList.add('driver'); } else { view.classList.remove('driver'); }
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

/* ================================================================
   PLANNER — route optimization + options + cost
   ================================================================ */
const Planner = {
  fuelPerKm(){ return Number(setting('FUEL_COST_PER_KM',3.5)); },
  speed(){ return Number(setting('AVG_SPEED_KMH',30)); },
  toll(){ return Number(setting('DEFAULT_TOLL',300)); },
  parking(){ return Number(setting('DEFAULT_PARKING',130)); },

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
  // total distance incl return to warehouse (Haversine straight-line — instant, offline)
  metrics(seq){
    const wh = warehouse();
    let dist = 0; let cur = wh;
    seq.forEach(s=>{ dist += haversine(cur.lat,cur.lng,+s.Latitude,+s.Longitude); cur={lat:+s.Latitude,lng:+s.Longitude}; });
    dist += haversine(cur.lat,cur.lng,wh.lat,wh.lng); // return
    const boxes = seq.reduce((n,s)=>n+(Number(s.BoxQty)||0),0);
    const serviceMin = seq.length*12;
    const durationMin = Math.round(dist/this.speed()*60 + serviceMin);
    return { distance:+dist.toFixed(1), boxes, stops:seq.length, durationMin, source:'straight' };
  },
  // ระยะทางตามถนนจริงผ่าน OSRM (async) — คืน null ถ้าล่ม (ให้ fallback ไป metrics())
  async roadMetrics(seq){
    const wh = warehouse();
    const pts = [{lat:wh.lat,lng:wh.lng}, ...seq.map(s=>({lat:+s.Latitude,lng:+s.Longitude})), {lat:wh.lat,lng:wh.lng}];
    const r = await Geo.route(pts);
    if(!r) return null;
    // legsKm[i] = ระยะจากจุดก่อนหน้าถึง seq[i]  (leg 0 = คลัง→จุด1)
    if(r.legsKm && r.legsKm.length){ seq.forEach((s,i)=>{ s._distPrev = r.legsKm[i]; }); }
    const boxes = seq.reduce((n,s)=>n+(Number(s.BoxQty)||0),0);
    return { distance:r.distance, boxes, stops:seq.length, durationMin:r.durationMin + seq.length*12, geometry:r.geometry, source:'osrm' };
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

  // recommend single best company vehicle that fits all boxes & is nearest to warehouse
  recommendVehicle(totalBoxes){
    const wh = warehouse();
    const fit = this.availableVehicles().filter(v=>Number(v.CapacityBox)>=totalBoxes)
      .sort((a,b)=> (Number(a.CapacityBox)-Number(b.CapacityBox)) ||
        (haversine(wh.lat,wh.lng,+a.CurrentLatitude,+a.CurrentLongitude)-haversine(wh.lat,wh.lng,+b.CurrentLatitude,+b.CurrentLongitude)));
    if(fit.length){ const v=fit[0]; v._distWh=+haversine(wh.lat,wh.lng,+v.CurrentLatitude,+v.CurrentLongitude).toFixed(1); return v; }
    return null;
  },

  // build 3 options
  options(seq, override){
    const m = this.metrics(seq);
    if(override){ m.distance=override.distance; m.durationMin=override.durationMin; m.geometry=override.geometry; m.source=override.source; }
    const wh = warehouse();
    const avail = this.availableVehicles();
    const totalCap = avail.reduce((n,v)=>n+(Number(v.CapacityBox)||0),0);
    const opts = [];

    // OPTION A — company only
    const rec = this.recommendVehicle(m.boxes);
    if(rec){
      const cost = this.companyCost(m.distance, rec);
      opts.push({ id:'A', name:'รถบริษัทเท่านั้น', feasible:true, recommended:true,
        vehicles:[rec], distance:m.distance, duration:m.durationMin, boxes:m.boxes, stops:m.stops, cost,
        note:`ใช้ ${rec.VehicleName} (${rec.CapacityBox} กล่อง) เพียงคันเดียว` });
    } else if(totalCap>=m.boxes && avail.length>=2){
      // combine company vehicles
      const sorted = avail.slice().sort((a,b)=>Number(b.CapacityBox)-Number(a.CapacityBox));
      const use=[]; let cap=0; for(const v of sorted){ use.push(v); cap+=Number(v.CapacityBox)||0; if(cap>=m.boxes)break; }
      const cost = this.companyCost(m.distance*1.05, use[0]);
      cost.total = +(cost.fuel+cost.toll*use.length+cost.parking).toFixed(2); cost.toll=cost.toll*use.length;
      opts.push({ id:'A', name:'รถบริษัทหลายคัน', feasible:true, recommended:true, vehicles:use,
        distance:m.distance, duration:m.durationMin, boxes:m.boxes, stops:m.stops, cost, note:`รวม ${use.length} คัน · ความจุ ${cap} กล่อง` });
    } else {
      const short = m.boxes - totalCap;
      opts.push({ id:'A', name:'รถบริษัทเท่านั้น', feasible:false, vehicles:avail,
        distance:m.distance, duration:m.durationMin, boxes:m.boxes, stops:m.stops,
        cost:this.companyCost(m.distance), shortage:short,
        note:`ความจุรวม ${totalCap} กล่อง · งาน ${m.boxes} กล่อง · ขาด ${short} กล่อง` });
    }

    // OPTION B — company + external
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
        note:`รองรับงานทั้งหมด — เสริมด้วย ${ext.ProviderName} (${ext.CapacityBox} กล่อง)` });
    }

    // OPTION C — split into 2 routes (company vehicles)
    if(avail.length>=2){
      const mid = Math.ceil(seq.length/2);
      const g1=seq.slice(0,mid), g2=seq.slice(mid);
      const m1=this.metrics(g1), m2=this.metrics(g2);
      const c1=this.companyCost(m1.distance,avail[0]), c2=this.companyCost(m2.distance,avail[1]);
      opts.push({ id:'C', name:'แบ่งเป็น 2 Route', feasible:true, split:[{seq:g1,m:m1,v:avail[0],cost:c1},{seq:g2,m:m2,v:avail[1],cost:c2}],
        vehicles:[avail[0],avail[1]], distance:+(m1.distance+m2.distance).toFixed(1), duration:Math.max(m1.durationMin,m2.durationMin),
        boxes:m.boxes, stops:m.stops, cost:{ fuel:+(c1.fuel+c2.fuel).toFixed(2), toll:c1.toll+c2.toll, parking:c1.parking+c2.parking, external:0, other:0, total:+(c1.total+c2.total).toFixed(2) },
        note:`Route 1: ${g1.length} จุด · Route 2: ${g2.length} จุด (ส่งพร้อมกัน 2 คัน)` });
    }
    return { metrics:m, options:opts };
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
    const st=VSTATUS[v.VehicleStatus]||VSTATUS.Unknown;
    return L.marker([+v.lat,+v.lng], { icon:L.divIcon({ className:'veh-pin', html:`<div class="veh-ring" style="background:${st.dot}"></div><div class="veh-dot" style="background:${st.dot}"><i data-lucide="truck"></i></div>`, iconSize:[30,30], iconAnchor:[15,15] }) }).addTo(map).bindPopup(`<b>${esc(v.VehicleName)}</b> · ${esc(v.LicensePlate)}<br>${st.label} · ${int(v.speed)} กม./ชม.<br>${esc(v.CurrentDriver||'')}`);
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
  // เปิดหน้าต่างพิมพ์: title, ขนาด (A4/A5), เนื้อหา html (ไม่รวม header)
  open(title, size, bodyHtml){
    const c = this.company();
    const logo = location.origin + location.pathname.replace(/[^/]*$/,'') + 'logo.png';
    const w = window.open('', '_blank', 'width=900,height=1000');
    if(!w){ toast('เบราว์เซอร์บล็อกป๊อปอัพ — อนุญาตป๊อปอัพแล้วลองใหม่','warn'); return; }
    w.document.write(`<!DOCTYPE html><html lang="th"><head><meta charset="utf-8"><title>${esc(title)}</title>
      <link href="https://fonts.googleapis.com/css2?family=Prompt:wght@300;400;500;600;700&display=swap" rel="stylesheet">
      <style>
        @page{ size:${size}; margin:12mm; }
        *{box-sizing:border-box;} body{font-family:'Prompt',sans-serif;color:#0B1220;margin:0;padding:0;font-size:${size==='A5'?'11px':'12.5px'};}
        .doc{padding:0;}
        .hd{display:flex;align-items:center;gap:14px;border-bottom:3px solid #B4DC00;padding-bottom:12px;margin-bottom:14px;}
        .hd img{height:${size==='A5'?'44px':'56px'};width:auto;}
        .hd .co{font-size:${size==='A5'?'15px':'18px'};font-weight:700;color:#0B1220;}
        .hd .ad{font-size:${size==='A5'?'9.5px':'11px'};color:#555;margin-top:2px;max-width:420px;line-height:1.4;}
        .hd .rt{margin-left:auto;text-align:right;}
        .hd .rt .t{font-size:${size==='A5'?'16px':'20px'};font-weight:700;letter-spacing:.02em;}
        .hd .rt .n{font-size:11px;color:#666;margin-top:2px;}
        table{width:100%;border-collapse:collapse;margin:8px 0;}
        th,td{border:1px solid #d0d5dd;padding:6px 8px;text-align:left;font-size:inherit;}
        th{background:#0B1220;color:#fff;font-weight:600;}
        .r{text-align:right;} .c{text-align:center;}
        .kv{display:flex;flex-wrap:wrap;gap:6px 26px;margin:10px 0;}
        .kv div{font-size:inherit;} .kv b{color:#0B1220;} .kv span{color:#555;}
        .sec-title{font-weight:700;font-size:${size==='A5'?'12px':'14px'};margin:14px 0 6px;color:#0B1220;}
        .sign{display:flex;justify-content:space-between;margin-top:${size==='A5'?'26px':'46px'};gap:30px;}
        .sign div{flex:1;text-align:center;border-top:1px solid #999;padding-top:6px;font-size:11px;color:#555;}
        .muted{color:#777;} .foot{margin-top:16px;font-size:10px;color:#999;text-align:center;}
        @media print{ .noprint{display:none;} }
        .noprint{position:fixed;top:8px;right:8px;display:flex;gap:8px;}
        .noprint button{font-family:'Prompt',sans-serif;border:none;border-radius:7px;padding:9px 16px;font-weight:600;cursor:pointer;font-size:13px;}
        .noprint .p{background:#B4DC00;color:#152400;} .noprint .c{background:#eee;color:#333;}
      </style></head><body>
      <div class="noprint"><button class="p" onclick="window.print()">🖨️ พิมพ์</button><button class="c" onclick="window.close()">ปิด</button></div>
      <div class="doc">
        <div class="hd">
          <img src="${logo}" onerror="this.style.display='none'">
          <div><div class="co">${esc(c.name)}</div><div class="ad">${esc(c.addr)}</div></div>
          <div class="rt"><div class="t">${esc(title)}</div><div class="n">พิมพ์ ${new Date().toLocaleString('th-TH')}</div></div>
        </div>
        ${bodyHtml}
        <div class="foot">เอกสารนี้พิมพ์จากระบบ DELIVERY DISPATCH & ROUTE CONTROL CENTER · Gadget Villa</div>
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
  el('globalSearch').addEventListener('input', e=>{ Store.search=e.target.value.trim().toLowerCase(); if(['deliveries','rounds','customers'].includes(Store.page)) render(); });
}
function openDatePicker(){
  const m = modal({ title:'เลือกวันที่', body:`
    <div class="field"><label class="label">วันที่จัดส่ง</label><input type="date" class="input" id="pkDate" value="${Store.date}"></div>
    <div class="flex gap8 wrap">
      <button class="btn btn-sm" data-quick="today">วันนี้</button>
      <button class="btn btn-sm" data-quick="data">ข้อมูลทดลอง (20 ก.ค. 2569)</button>
    </div>`, foot:`<button class="btn" id="pkCancel">ยกเลิก</button><button class="btn btn-primary" id="pkOk"><i data-lucide="check"></i>เลือก</button>` });
  $$('[data-quick]').forEach(b=>b.onclick=()=>{ el('pkDate').value = b.dataset.quick==='today'? new Date().toISOString().slice(0,10) : DATA_DATE; });
  el('pkCancel').onclick = m.close;
  el('pkOk').onclick = async ()=>{ Store.date = el('pkDate').value; m.close(); await loadBootstrap(); render(); };
}

/* ================================================================
   PAGES  (defined in app.pages.js via ROUTES)
   ================================================================ */
/* ROUTES are registered in app.pages.js */

/* ================================================================
   INIT
   ================================================================ */
async function init(){
  // รองรับ ?api=<AppsScriptURL> เพื่อ auto-connect (สะดวกตอน deploy/แชร์ให้ทีม)
  try{ const qp=new URLSearchParams(location.search).get('api'); if(qp){ API.setUrl(qp); history.replaceState(null,'',location.pathname+location.hash); } }catch(e){}
  Store.date = API.configured() ? new Date().toISOString().slice(0,10) : DATA_DATE;
  buildNav(); bindShell(); setDateLabel(); updateSync();
  await loadBootstrap();
  if(!location.hash) location.hash = '#/dashboard';
  render();
  // realtime polling every 8s on live map / dashboard
  Store.pollTimer = setInterval(async ()=>{
    if(!['dashboard','livemap'].includes(Store.page)) return;
    try{ const rt = await API.get('getRealtime',{date:Store.date}); Store.data.dashboard = { date:rt.date, kpi:rt.kpi, cost:rt.cost, fleet:rt.fleet, routes:rt.routes, activities:rt.activities }; Store.data.cartrack=rt.cartrack; Store._live={stops:rt.stops, vehicles:rt.vehicles}; Store.lastSync=new Date().toISOString(); updateSync(); if(window._onRealtime) window._onRealtime(rt); }catch(e){}
  }, 8000);
}
document.addEventListener('DOMContentLoaded', init);
