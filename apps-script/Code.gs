/*───────────────────────────────────────────────────────────────────
  DELIVERY DISPATCH & ROUTE CONTROL CENTER
  Google Apps Script API + Google Sheets Database
  ───────────────────────────────────────────────────────────────────
  สถาปัตยกรรม:
     FRONTEND (index.html)
        ↓  fetch ?action=...
     GOOGLE APPS SCRIPT (ไฟล์นี้)  ← Single gateway
        ↓
     GOOGLE SHEETS (ฐานข้อมูล)
     และ
     GOOGLE APPS SCRIPT
        ↓  UrlFetchApp + Basic Auth
     CARTRACK FLEET API

  SECURITY:
     Cartrack credentials (username / token / base url) เก็บใน
     PropertiesService (Script Properties) เท่านั้น — ไม่ส่งให้ frontend
     Frontend เห็นแค่สถานะ (connected / last sync / count)

  ติดตั้ง:
     1) สร้าง Google Sheet ใหม่ 1 ไฟล์
     2) Extensions → Apps Script → วางโค้ดนี้
     3) รัน setupDatabase() หนึ่งครั้ง  (สร้างชีต + ข้อมูลทดสอบ)
     4) (ถ้าใช้ Cartrack) รัน setupCartrackCredentials() หลังแก้ค่าด้านล่าง
     5) Deploy → New deployment → Web app
          Execute as: Me   |   Who has access: Anyone
     6) คัดลอก Web app URL ไปวางในหน้าเว็บ (Settings → แหล่งข้อมูล)
───────────────────────────────────────────────────────────────────*/

/* ==================================================================
   1. SCHEMA — คอลัมน์ของแต่ละชีต
   ================================================================== */
const SCHEMA = {
  Deliveries: ['DeliveryID','DeliveryDate','CustomerName','BranchName','InvoiceNo',
    'Address','Latitude','Longitude','BoxQty','Priority','Note','RouteID','Status',
    'CreatedAt','UpdatedAt','CreatedBy','UpdatedBy','Version','IsDeleted'],

  Customers: ['CustomerID','CustomerName','BranchName','Address','Latitude','Longitude',
    'Phone','ContactPerson','Note','Status','CreatedAt','UpdatedAt','IsDeleted'],

  Employees: ['EmployeeID','EmployeeName','Phone','Role','VehicleID','Status',
    'CreatedAt','UpdatedAt','IsDeleted'],

  Routes: ['RouteID','DeliveryDate','RouteType','DriverName','DriverPhone','VehicleType',
    'VehicleName','LicensePlate','ProviderName','TotalStops','TotalBoxes','TotalDistance',
    'EstimatedDuration','EstimatedFuelCost','EstimatedTollCost','EstimatedParkingCost',
    'EstimatedExternalCost','EstimatedOtherCost','EstimatedTotalCost','ActualFuelCost',
    'ActualTollCost','ActualParkingCost','ActualExternalCost','ActualOtherCost',
    'ActualTotalCost','CostPerStop','CostPerBox','Status',
    'CreatedAt','UpdatedAt','CreatedBy','UpdatedBy','IsDeleted'],

  RouteStops: ['RouteID','StopOrder','DeliveryID','CustomerName','BranchName','Address',
    'Latitude','Longitude','BoxQty','DistanceFromPrevious','EstimatedArrival','ActualArrival',
    'CheckInLatitude','CheckInLongitude','CheckInAccuracy','CheckInTime',
    'DeliveryCompletedTime','Status'],

  Vehicles: ['VehicleID','VehicleName','LicensePlate','VehicleType','CapacityBox',
    'FuelCostPerKm','CurrentDriver','VehicleStatus',
    'CartrackVehicleID','CartrackRegistration','CurrentLatitude','CurrentLongitude',
    'CurrentSpeed','CurrentHeading','CurrentOdometer','LastPositionTime','LastSyncAt',
    'CreatedAt','UpdatedAt','IsDeleted'],

  ExternalProviders: ['ProviderID','ProviderName','ContactPerson','Phone','VehicleType',
    'DefaultRate','RateType','Note','Status','CreatedAt','UpdatedAt','IsDeleted'],

  ExternalVehicles: ['ExternalVehicleID','ProviderID','ProviderName','DriverName',
    'DriverPhone','VehicleType','LicensePlate','CapacityBox','Rate','RateType','Status',
    'CreatedAt','UpdatedAt','IsDeleted'],

  CartrackVehicles: ['CartrackVehicleID','Registration','Latitude','Longitude','Speed',
    'Heading','Odometer','CurrentDriver','VehicleStatus','LastPositionTime','FetchedAt'],

  CartrackLogs: ['LogID','SyncAt','Fetched','Matched','Status','Message'],

  GPSLogs: ['LogID','RouteID','DeliveryID','Latitude','Longitude','Accuracy',
    'Timestamp','EventType'],

  Expenses: ['ExpenseID','RouteID','DeliveryID','ExpenseDate','ExpenseType','Amount',
    'Description','ReceiptImageURL','CreatedAt','CreatedBy','IsDeleted'],

  ExpenseClaims: ['ClaimID','RouteID','DriverName','AdvanceAmount','ActualExpense',
    'RefundAmount','AdditionalAmount','Balance','Status','CreatedAt','UpdatedAt','IsDeleted'],

  Settings: ['Key','Value','Group','Label','UpdatedAt'],

  ActivityLogs: ['LogID','Action','ReferenceID','Description','User','Timestamp']
};

/* ==================================================================
   2. SETUP — สร้างชีต + ข้อมูลทดสอบ (รันครั้งเดียว)
   ================================================================== */
function setupDatabase() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(SCHEMA).forEach(name => {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    sh.clear();
    const headers = SCHEMA[name];
    sh.getRange(1, 1, 1, headers.length).setValues([headers])
      .setFontWeight('bold').setBackground('#0B1220').setFontColor('#FFFFFF');
    sh.setFrozenRows(1);
  });
  const def = ss.getSheetByName('Sheet1');
  if (def && ss.getSheets().length > 1) ss.deleteSheet(def);
  seedTestData();
  seedSettings();
  try { ss.toast('สร้างฐานข้อมูล + ข้อมูลทดสอบเรียบร้อย'); } catch (e) {}
}

function seedTestData() {
  const now = new Date().toISOString();
  const D = '2026-07-20';

  writeSeed('Vehicles', [
    ['V-01','รถกระบะ 01','1กก-1234','PICKUP',100,3.50,'นายสมชาย ใจดี','Available',
      '','1กก-1234',13.6912,100.5262,0,0,45210,now,now,now,now,false],
    ['V-02','รถกระบะ 02','2กก-5678','PICKUP',150,3.90,'นายวิชัย กล้าแกร่ง','Available',
      '','2กก-5678',13.6888,100.5241,0,0,88120,now,now,now,now,false],
    ['V-03','รถหกล้อ 03','3กก-9012','TRUCK',300,6.20,'','Offline',
      '','3กก-9012',13.6921,100.5233,0,0,152300,now,now,now,now,false]
  ]);

  writeSeed('Employees', [
    ['EMP-01','นายสมชาย ใจดี','081-111-1111','DRIVER','V-01','Active',now,now,false],
    ['EMP-02','นายวิชัย กล้าแกร่ง','082-222-2222','DRIVER','V-02','Active',now,now,false],
    ['EMP-03','นายมานะ อดทน','083-333-3333','DRIVER','V-03','Active',now,now,false]
  ]);

  writeSeed('ExternalProviders', [
    ['EP-01','ABC Transport','คุณเอ','089-999-9999','TRUCK',1500,'PER_TRIP','','Active',now,now,false],
    ['EP-02','Speed Cargo','คุณบี','088-888-8888','PICKUP',18,'PER_KM','','Active',now,now,false]
  ]);
  writeSeed('ExternalVehicles', [
    ['EV-01','EP-01','ABC Transport','นายเอกชัย','086-888-8888','TRUCK','9กก-9999',200,1500,'PER_TRIP','Available',now,now,false],
    ['EV-02','EP-02','Speed Cargo','นายสุรชัย','087-777-7777','PICKUP','8กก-8888',120,18,'PER_KM','Available',now,now,false]
  ]);

  writeSeed('Customers', [
    ['CUS-01','JIB','Mega Bangna','Mega Bangna, บางนา',13.6510,100.6300,'02-100-1000','ฝ่ายรับสินค้า','','Active',now,now,false],
    ['CUS-02','Advice','Central World','Central World, ปทุมวัน',13.7466,100.5390,'02-200-2000','ฝ่ายคลัง','','Active',now,now,false],
    ['CUS-03','IT City','Terminal 21','Terminal 21, อโศก',13.7373,100.5601,'02-300-3000','ฝ่ายรับสินค้า','','Active',now,now,false],
    ['CUS-04','คอม 7','The Mall Bangkapi','The Mall Bangkapi, บางกะปิ',13.7658,100.6430,'02-400-4000','ฝ่ายคลัง','','Active',now,now,false],
    ['CUS-05','Power Buy','Terminal 21','Terminal 21, อโศก',13.7375,100.5605,'02-500-5000','ฝ่ายรับสินค้า','','Active',now,now,false],
    ['CUS-06','Banana','Mega Bangna','Mega Bangna, บางนา',13.6515,100.6295,'02-600-6000','ฝ่ายคลัง','','Active',now,now,false]
  ]);

  writeSeed('Deliveries', [
    ['DEL-001',D,'JIB','Mega Bangna','INV-2026-001','Mega Bangna, บางนา',13.6510,100.6300,60,'HIGH','','','Draft',now,now,'seed','seed',1,false],
    ['DEL-002',D,'Advice','Central World','INV-2026-002','Central World, ปทุมวัน',13.7466,100.5390,50,'NORMAL','','','Draft',now,now,'seed','seed',1,false],
    ['DEL-003',D,'IT City','Terminal 21','INV-2026-003','Terminal 21, อโศก',13.7373,100.5601,30,'NORMAL','','','Draft',now,now,'seed','seed',1,false],
    ['DEL-004',D,'คอม 7','The Mall Bangkapi','INV-2026-004','The Mall Bangkapi, บางกะปิ',13.7658,100.6430,40,'NORMAL','','','Draft',now,now,'seed','seed',1,false],
    ['DEL-005',D,'Power Buy','Terminal 21','INV-2026-005','Terminal 21, อโศก',13.7375,100.5605,30,'NORMAL','','','Draft',now,now,'seed','seed',1,false],
    ['DEL-006',D,'Banana','Mega Bangna','INV-2026-006','Mega Bangna, บางนา',13.6515,100.6295,60,'HIGH','','','Draft',now,now,'seed','seed',1,false]
  ]);

  logActivity('SEED', '-', 'ใส่ข้อมูลทดสอบเริ่มต้น', 'system');
}

function seedSettings(){
  const now = new Date().toISOString();
  writeSeed('Settings', [
    ['COMPANY_NAME','บริษัท แก็ดเจ็ต วิลล่า จำกัด','company','ชื่อบริษัท',now],
    ['WAREHOUSE_NAME','คลัง แก็ดเจ็ต วิลล่า (รัชดาฯ)','company','ชื่อคลังสินค้า',now],
    ['WAREHOUSE_ADDRESS','729/28-37 ถ.รัชดาภิเษก แขวงบางโพงพาง เขตยานนาวา กรุงเทพฯ 10120','company','ที่อยู่คลังสินค้า',now],
    ['WAREHOUSE_LAT','13.6900321','company','พิกัดคลัง (Latitude)',now],
    ['WAREHOUSE_LNG','100.5251873','company','พิกัดคลัง (Longitude)',now],
    ['FUEL_COST_PER_KM','3.50','cost','ค่าน้ำมันต่อกิโลเมตร (บาท)',now],
    ['AVG_SPEED_KMH','30','cost','ความเร็วเฉลี่ย (กม./ชม.)',now],
    ['DEFAULT_TOLL','300','cost','ค่าทางด่วนเริ่มต้น (บาท)',now],
    ['DEFAULT_PARKING','130','cost','ค่าจอดรถเริ่มต้น (บาท)',now],
    ['PROXIMITY_GREEN_M','100','tracking','ระยะ Check-in สีเขียว (เมตร)',now],
    ['PROXIMITY_YELLOW_M','500','tracking','ระยะ Check-in สีเหลือง (เมตร)',now],
    // สถานะ Cartrack เท่านั้น (ไม่มี secret) — secret อยู่ใน PropertiesService
    ['CARTRACK_ENABLED','false','cartrack','เปิดใช้งานการซิงก์ Cartrack',now],
    ['CARTRACK_LAST_SYNC','','cartrack','เวลาซิงก์ Cartrack ล่าสุด',now]
  ]);
}

function writeSeed(name, rows) {
  const sh = sheet(name);
  if (rows.length) sh.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
}

/* ==================================================================
   3. WEB APP ENTRYPOINTS
   ================================================================== */
function doGet(e) {
  const action = (e.parameter.action || 'getDashboardData');
  try {
    const map = {
      getBootstrap, getDashboardData, getDeliveries, getRoutes, getRouteStops,
      getCustomers, getEmployees, getVehicles, getExternalProviders, getExternalVehicles,
      getCartrackVehicles, getLiveVehicleStatus, getExpenses, getClaims, getRouteCosts,
      getReports, getSettings, getRealtime, getCartrackStatus, geocode, ping
    };
    if (!map[action]) return json({ ok:false, error:'unknown action: '+action });
    return json({ ok:true, data: map[action](e.parameter) });
  } catch (err) {
    return json({ ok:false, error:String(err) });
  }
}

function doPost(e) {
  let body = {};
  try { body = JSON.parse(e.postData.contents || '{}'); } catch (x) {}
  const action = body.action || (e.parameter && e.parameter.action);
  try {
    const map = {
      createDelivery, updateDelivery, deleteDelivery,
      createCustomer, updateCustomer,
      createRoute, createExternalRoute, updateRoute, updateRouteStop, confirmRoute,
      createVehicle, updateVehicle,
      createExternalVehicle, updateExternalVehicle,
      createExpense, updateExpense, createClaim, updateClaim,
      updateSetting, syncCartrack,
      logGPS, checkIn, startRoute, completeDelivery, failDelivery
    };
    if (!map[action]) return json({ ok:false, error:'unknown action: '+action });
    return json({ ok:true, data: map[action](body) });
  } catch (err) {
    return json({ ok:false, error:String(err) });
  }
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
function ping(){ return { pong:true, time:new Date().toISOString() }; }

/* GEOCODE — แปลงที่อยู่ → พิกัด ด้วย Google Geocoder (built-in Maps service, ไม่ต้องมี API key)
   frontend เรียก ?action=geocode&q=<ที่อยู่> */
function geocode(p){
  const addr = (p && (p.q || p.address)) ? String(p.q || p.address) : '';
  if (!addr) return { lat:'', lng:'', status:'NO_ADDRESS' };
  try {
    const res = Maps.newGeocoder().setRegion('th').setLanguage('th').geocode(addr);
    if (res && res.status === 'OK' && res.results.length) {
      const loc = res.results[0].geometry.location;
      return { lat:loc.lat, lng:loc.lng, display:res.results[0].formatted_address, status:'OK' };
    }
    return { lat:'', lng:'', status: res ? res.status : 'ERROR' };
  } catch (e) { return { lat:'', lng:'', status:'ERROR', error:String(e) }; }
}
// เติมพิกัดอัตโนมัติถ้ายังไม่มี แต่มีที่อยู่
function autoGeocode(rec){
  if (rec && rec.Address && (!rec.Latitude || !rec.Longitude)) {
    const g = geocode({ q: rec.Address });
    if (g.status === 'OK') { rec.Latitude = g.lat; rec.Longitude = g.lng; }
  }
  return rec;
}

/* ==================================================================
   4. CORE HELPERS — read / write / soft-delete
   ================================================================== */
function sheet(name){ return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name); }

// คอลัมน์ที่เป็น "วันที่อย่างเดียว" — Google Sheets มักแปลงเป็นเซลล์ Date
// ทำให้ค่ากลายเป็น ISO (เช่น 2026-07-19T17:00:00Z ตามเขต +7) → normalize เป็น yyyy-MM-dd
const DATE_COLS = ['DeliveryDate','ExpenseDate'];
function dkey(v){
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const s = String(v||'');
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return Utilities.formatDate(new Date(s), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return s.slice(0,10);
}

function readAll(name, includeDeleted) {
  const sh = sheet(name);
  if (!sh) return [];
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0];
  const rows = values.slice(1).map(r => {
    const o = {}; headers.forEach((h, i) => o[h] = (DATE_COLS.indexOf(h) > -1 && r[i] !== '' && r[i] != null) ? dkey(r[i]) : r[i]); return o;
  });
  if (!includeDeleted && headers.indexOf('IsDeleted') > -1)
    return rows.filter(r => r.IsDeleted !== true && String(r.IsDeleted).toUpperCase() !== 'TRUE');
  return rows;
}

function appendRow(name, obj) {
  const sh = sheet(name);
  const headers = SCHEMA[name];
  const row = headers.map(h => obj[h] !== undefined ? obj[h] : '');
  sh.appendRow(row);
  return obj;
}

function updateById(name, idValue, patch) {
  const sh = sheet(name);
  const values = sh.getDataRange().getValues();
  const headers = values[0];
  for (let r = 1; r < values.length; r++) {
    if (String(values[r][0]) === String(idValue)) {
      headers.forEach((h, c) => { if (patch[h] !== undefined) values[r][c] = patch[h]; });
      const uAt = headers.indexOf('UpdatedAt'); if (uAt > -1) values[r][uAt] = new Date().toISOString();
      const ver = headers.indexOf('Version'); if (ver > -1) values[r][ver] = (Number(values[r][ver])||0) + 1;
      sh.getRange(r + 1, 1, 1, headers.length).setValues([values[r]]);
      const o = {}; headers.forEach((h,i)=>o[h]=values[r][i]); return o;
    }
  }
  throw new Error(name + ': ไม่พบ id ' + idValue);
}

function softDelete(name, idValue) { return updateById(name, idValue, { IsDeleted: true }); }

function nextId(name, prefix) {
  const rows = readAll(name, true);
  let max = 0;
  rows.forEach(r => {
    const id = String(r[SCHEMA[name][0]] || '');
    const m = id.match(/(\d+)\s*$/);
    if (m) max = Math.max(max, Number(m[1]));
  });
  return prefix + '-' + String(max + 1).padStart(3, '0');
}

function logActivity(action, refId, desc, user) {
  appendRow('ActivityLogs', {
    LogID: 'LOG-' + Date.now() + '-' + Math.floor(Math.random()*1000),
    Action: action, ReferenceID: refId, Description: desc,
    User: user || 'ผู้จัดการระบบ', Timestamp: new Date().toISOString()
  });
}

function todayStr(){
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}
function num(x){ const n = Number(x); return isNaN(n) ? '' : n; }

/* ==================================================================
   5. GET ENDPOINTS
   ================================================================== */
// โหลดทุก master data ในครั้งเดียว (frontend เรียกตอนเปิดแอป)
function getBootstrap(p){
  const date = (p && p.date) || todayStr();
  return {
    serverTime: new Date().toISOString(),
    date: date,
    settings: readAll('Settings'),
    customers: readAll('Customers'),
    employees: readAll('Employees'),
    vehicles: readAll('Vehicles'),
    externalProviders: readAll('ExternalProviders'),
    externalVehicles: readAll('ExternalVehicles'),
    dashboard: getDashboardData({ date: date }),
    deliveries: readAll('Deliveries').filter(r => String(r.DeliveryDate) === date),
    routes: readAll('Routes').filter(r => String(r.DeliveryDate) === date),
    cartrack: getCartrackStatus()
  };
}

function getDeliveries(p){
  let rows = readAll('Deliveries');
  if (p && p.date)    rows = rows.filter(r => String(r.DeliveryDate) === p.date);
  if (p && p.status)  rows = rows.filter(r => r.Status === p.status);
  if (p && p.routeId) rows = rows.filter(r => r.RouteID === p.routeId);
  return rows;
}
function getRoutes(p){
  let rows = readAll('Routes');
  if (p && p.date) rows = rows.filter(r => String(r.DeliveryDate) === p.date);
  return rows;
}
function getRouteStops(p){
  let rows = readAll('RouteStops');
  if (p && p.routeId) rows = rows.filter(r => r.RouteID === p.routeId);
  return rows.sort((a,b)=> (a.StopOrder||0)-(b.StopOrder||0));
}
function getCustomers(){ return readAll('Customers'); }
function getEmployees(){ return readAll('Employees'); }
function getVehicles(){ return readAll('Vehicles'); }
function getExternalProviders(){ return readAll('ExternalProviders'); }
function getExternalVehicles(){ return readAll('ExternalVehicles'); }
function getCartrackVehicles(){ return readAll('CartrackVehicles'); }
function getExpenses(p){
  let rows = readAll('Expenses');
  if (p && p.routeId) rows = rows.filter(r => r.RouteID === p.routeId);
  if (p && p.date)    rows = rows.filter(r => String(r.ExpenseDate) === p.date);
  return rows;
}
function getClaims(){ return readAll('ExpenseClaims'); }
function getRouteCosts(p){ return getRoutes(p); }
function getSettings(p){
  let rows = readAll('Settings');
  if (p && p.group) rows = rows.filter(r => r.Group === p.group);
  return rows;
}

// Dashboard KPI + cost summary
function getDashboardData(p){
  const date = (p && p.date) || todayStr();
  const dels = readAll('Deliveries').filter(r => String(r.DeliveryDate) === date);
  const routes = readAll('Routes').filter(r => String(r.DeliveryDate) === date);
  const expenses = readAll('Expenses').filter(r => String(r.ExpenseDate) === date);
  const vehicles = readAll('Vehicles');

  const countBy = s => dels.filter(d => d.Status === s);
  const boxes = list => list.reduce((n,d)=> n + (Number(d.BoxQty)||0), 0);
  const stat = s => ({ count: countBy(s).length, boxes: boxes(countBy(s)) });

  const kpi = {
    total:      { count: dels.length, boxes: boxes(dels) },
    draft:      stat('Draft'),
    planned:    stat('Planned'),
    assigned:   stat('Assigned'),
    inProgress: stat('In Progress'),
    completed:  stat('Completed'),
    failed:     stat('Failed'),
    stops:      routes.reduce((n,r)=> n + (Number(r.TotalStops)||0), 0)
  };

  const est = routes.reduce((n,r)=> n + (Number(r.EstimatedTotalCost)||0), 0);
  const companyCost  = routes.filter(r=>r.RouteType==='COMPANY_VEHICLE').reduce((n,r)=> n + (Number(r.EstimatedTotalCost)||0), 0);
  const externalCost = routes.filter(r=>r.RouteType==='EXTERNAL_VEHICLE').reduce((n,r)=> n + (Number(r.EstimatedTotalCost)||0), 0);
  const otherCost = routes.reduce((n,r)=> n + (Number(r.EstimatedOtherCost)||0), 0)
                  + expenses.filter(e=>e.ExpenseType==='OTHER').reduce((n,e)=> n + (Number(e.Amount)||0), 0);
  const totalStops = kpi.stops;
  const totalBoxes = routes.reduce((n,r)=> n + (Number(r.TotalBoxes)||0), 0);

  const cost = {
    total: est, company: companyCost, external: externalCost, other: otherCost,
    avgPerRoute: routes.length ? est / routes.length : 0,
    avgPerStop:  totalStops ? est / totalStops : 0,
    avgPerBox:   totalBoxes ? est / totalBoxes : 0
  };

  const fleet = {
    available: vehicles.filter(v=>v.VehicleStatus==='Available').length,
    inUse:     vehicles.filter(v=>v.VehicleStatus==='In Use').length,
    offline:   vehicles.filter(v=>v.VehicleStatus==='Offline'||v.VehicleStatus==='Stopped').length,
    total:     vehicles.length
  };

  return { date, kpi, cost, fleet, routes, activities: recentActivities(20) };
}

function getReports(p){
  const from = p && p.from, to = p && p.to;
  const inRange = d => (!from || String(d) >= from) && (!to || String(d) <= to);
  let dels = readAll('Deliveries').filter(r => inRange(r.DeliveryDate));
  let routes = readAll('Routes').filter(r => inRange(r.DeliveryDate));
  let expenses = readAll('Expenses').filter(r => inRange(r.ExpenseDate));
  if (p && p.routeId){ routes = routes.filter(r=>r.RouteID===p.routeId); }
  if (p && p.driver){ routes = routes.filter(r=>r.DriverName===p.driver); }
  return { deliveries: dels, routes: routes, expenses: expenses };
}

function getRealtime(p){
  const date = (p && p.date) || todayStr();
  const dash = getDashboardData({ date: date });
  const routes = readAll('Routes').filter(r => String(r.DeliveryDate) === date);
  const routeIds = routes.map(r => r.RouteID);
  const stops = readAll('RouteStops')
    .filter(s => routeIds.indexOf(s.RouteID) > -1)
    .sort((a,b)=> (a.StopOrder||0)-(b.StopOrder||0));
  return {
    serverTime: new Date().toISOString(), date: date,
    kpi: dash.kpi, cost: dash.cost, fleet: dash.fleet,
    routes: routes, stops: stops,
    vehicles: getLiveVehicleStatus(),
    cartrack: getCartrackStatus(),
    activities: dash.activities
  };
}

function recentActivities(n){
  return readAll('ActivityLogs')
    .sort((a,b)=> new Date(b.Timestamp) - new Date(a.Timestamp))
    .slice(0, n);
}

/* ==================================================================
   6. CREATE / UPDATE ENDPOINTS
   ================================================================== */
function createCustomer(b){
  const now = new Date().toISOString();
  const id = nextId('Customers','CUS');
  autoGeocode(b.data);
  const rec = appendRow('Customers', Object.assign({ CustomerID:id, Status:'Active',
    CreatedAt:now, UpdatedAt:now, IsDeleted:false }, b.data));
  logActivity('CREATE_CUSTOMER', id, 'เพิ่มลูกค้า ' + (b.data.CustomerName||''), b.user);
  return rec;
}
function updateCustomer(b){ autoGeocode(b.data); return updateById('Customers', b.id, b.data); }

function createDelivery(b){
  const now = new Date().toISOString();
  const id = nextId('Deliveries','DEL');
  autoGeocode(b.data);
  const rec = appendRow('Deliveries', Object.assign({
    DeliveryID:id, Status:'Draft', CreatedAt:now, UpdatedAt:now,
    CreatedBy:b.user||'', UpdatedBy:b.user||'', Version:1, IsDeleted:false
  }, b.data));
  logActivity('CREATE_DELIVERY', id, 'สร้างงานส่ง ' + (b.data.CustomerName||''), b.user);
  return rec;
}
function updateDelivery(b){ return updateById('Deliveries', b.id, b.data); }
function deleteDelivery(b){ logActivity('DELETE_DELIVERY', b.id, 'ลบงานส่ง (soft)', b.user); return softDelete('Deliveries', b.id); }

function createVehicle(b){
  const now = new Date().toISOString();
  const id = nextId('Vehicles','V');
  const rec = appendRow('Vehicles', Object.assign({ VehicleID:id, VehicleStatus:'Available',
    CreatedAt:now, UpdatedAt:now, IsDeleted:false }, b.data));
  logActivity('CREATE_VEHICLE', id, 'เพิ่มรถบริษัท ' + (b.data.VehicleName||''), b.user);
  return rec;
}
function updateVehicle(b){ return updateById('Vehicles', b.id, b.data); }

function createExternalVehicle(b){
  const now = new Date().toISOString();
  const id = nextId('ExternalVehicles','EV');
  const rec = appendRow('ExternalVehicles', Object.assign({ ExternalVehicleID:id, Status:'Available',
    CreatedAt:now, UpdatedAt:now, IsDeleted:false }, b.data));
  logActivity('CREATE_EXT_VEHICLE', id, 'เพิ่มรถภายนอก ' + (b.data.ProviderName||''), b.user);
  return rec;
}
function updateExternalVehicle(b){ return updateById('ExternalVehicles', b.id, b.data); }

/* --- ROUTES --- */
function createRoute(b){
  const now = new Date().toISOString();
  const id = nextId('Routes','ROUTE');
  const d = Object.assign({}, b.data);
  computeRouteCost(d);
  d.RouteID = id;
  d.RouteType = d.RouteType || 'COMPANY_VEHICLE';
  d.Status = d.Status || 'Planned';
  d.CreatedAt = now; d.UpdatedAt = now; d.CreatedBy = b.user||''; d.IsDeleted = false;
  const rec = appendRow('Routes', d);

  (b.stops || []).forEach((s, i) => {
    appendRow('RouteStops', Object.assign({ RouteID:id, StopOrder:i+1, Status:'Pending' }, s));
    if (s.DeliveryID) updateById('Deliveries', s.DeliveryID, { Status:'Planned', RouteID:id });
  });
  logActivity('CREATE_ROUTE', id, 'สร้าง Route (' + d.RouteType + ') · ' + (d.TotalStops||0) + ' จุด', b.user);
  return rec;
}
function createExternalRoute(b){
  b.data = Object.assign({ RouteType:'EXTERNAL_VEHICLE' }, b.data);
  return createRoute(b);
}
function confirmRoute(b){ return createRoute(b); }  // alias จากหน้า Route Planning
function updateRoute(b){
  const d = Object.assign({}, b.data);
  if (d.recompute) { computeRouteCost(d); delete d.recompute; }
  return updateById('Routes', b.id, d);
}
function updateRouteStop(b){
  const sh = sheet('RouteStops');
  const values = sh.getDataRange().getValues();
  const H = values[0];
  const ri = H.indexOf('RouteID'), so = H.indexOf('StopOrder');
  for (let r=1;r<values.length;r++){
    if (String(values[r][ri])===String(b.routeId) && String(values[r][so])===String(b.stopOrder)){
      H.forEach((h,c)=>{ if (b.data[h]!==undefined) values[r][c]=b.data[h]; });
      sh.getRange(r+1,1,1,H.length).setValues([values[r]]);
      const o={}; H.forEach((h,i)=>o[h]=values[r][i]); return o;
    }
  }
  throw new Error('RouteStops: ไม่พบ '+b.routeId+'/'+b.stopOrder);
}

/* --- EXPENSES / CLAIMS --- */
function createExpense(b){
  const id = nextId('Expenses','EXP');
  const rec = appendRow('Expenses', Object.assign({ ExpenseID:id,
    CreatedAt:new Date().toISOString(), CreatedBy:b.user||'', IsDeleted:false }, b.data));
  logActivity('CREATE_EXPENSE', b.data.RouteID||id, 'บันทึกค่าใช้จ่าย ' + (b.data.ExpenseType||''), b.user);
  return rec;
}
function updateExpense(b){ return updateById('Expenses', b.id, b.data); }

function createClaim(b){
  const id = nextId('ExpenseClaims','CLM');
  const advance = Number(b.data.AdvanceAmount)||0;
  const actual  = Number(b.data.ActualExpense)||0;
  const refund     = advance > actual ? advance - actual : 0;
  const additional = actual > advance ? actual - advance : 0;
  const now = new Date().toISOString();
  const rec = appendRow('ExpenseClaims', Object.assign({
    ClaimID:id, RefundAmount:refund, AdditionalAmount:additional, Balance:advance-actual,
    Status:'Pending', CreatedAt:now, UpdatedAt:now, IsDeleted:false
  }, b.data));
  logActivity('CREATE_CLAIM', id, 'เคลียร์เงิน คืน ' + refund + ' / เพิ่ม ' + additional, b.user);
  return rec;
}
function updateClaim(b){ return updateById('ExpenseClaims', b.id, b.data); }

function updateSetting(b){
  const key = b.key || (b.data && b.data.Key);
  const sh = sheet('Settings');
  const values = sh.getDataRange().getValues();
  const H = values[0];
  for (let r=1;r<values.length;r++){
    if (String(values[r][0]) === String(key)){
      values[r][H.indexOf('Value')] = b.value;
      values[r][H.indexOf('UpdatedAt')] = new Date().toISOString();
      sh.getRange(r+1,1,1,H.length).setValues([values[r]]);
      logActivity('UPDATE_SETTING', key, 'แก้ไขค่า ' + key, b.user);
      const o={}; H.forEach((h,i)=>o[h]=values[r][i]); return o;
    }
  }
  return appendRow('Settings', { Key:key, Value:b.value, Group:b.group||'custom',
    Label:b.label||key, UpdatedAt:new Date().toISOString() });
}
function settingValue(key, fallback){
  const row = readAll('Settings').filter(r => r.Key === key)[0];
  return row && row.Value !== '' ? row.Value : (fallback !== undefined ? fallback : '');
}

/* ==================================================================
   7. MOBILE / GPS ENDPOINTS
   ================================================================== */
function logGPS(b){
  return appendRow('GPSLogs', Object.assign({
    LogID:'GPS-'+Date.now(), Timestamp:new Date().toISOString()
  }, b.data));
}
function startRoute(b){
  updateById('Routes', b.routeId, { Status:'In Progress' });
  logGPS({ data:{ RouteID:b.routeId, Latitude:b.lat, Longitude:b.lng, EventType:'START_ROUTE' }});
  logActivity('START_ROUTE', b.routeId, 'เริ่มรอบส่ง', b.user);
  return { ok:true };
}
function checkIn(b){
  logGPS({ data:{ RouteID:b.routeId, DeliveryID:b.deliveryId, Latitude:b.lat,
    Longitude:b.lng, Accuracy:b.accuracy, EventType:'CHECK_IN' }});
  updateRouteStop({ routeId:b.routeId, stopOrder:b.stopOrder, data:{
    CheckInLatitude:b.lat, CheckInLongitude:b.lng, CheckInAccuracy:b.accuracy,
    CheckInTime:new Date().toISOString(), Status:'Checked In' }});
  return { proximity: proximity(b.distanceMeters) };
}
function proximity(m){
  const green = Number(settingValue('PROXIMITY_GREEN_M',100));
  const yellow = Number(settingValue('PROXIMITY_YELLOW_M',500));
  m=Number(m)||9999; return m<=green?'GREEN':(m<=yellow?'YELLOW':'RED');
}
function completeDelivery(b){
  updateRouteStop({ routeId:b.routeId, stopOrder:b.stopOrder, data:{
    DeliveryCompletedTime:new Date().toISOString(), Status:'Completed' }});
  if (b.deliveryId) updateById('Deliveries', b.deliveryId, { Status:'Completed' });
  logGPS({ data:{ RouteID:b.routeId, DeliveryID:b.deliveryId, Latitude:b.lat,
    Longitude:b.lng, EventType:'DELIVERY_COMPLETE' }});
  logActivity('COMPLETE_DELIVERY', b.deliveryId||b.routeId, 'ส่งสินค้าเสร็จสิ้น', b.user);
  return { ok:true };
}
function failDelivery(b){
  updateRouteStop({ routeId:b.routeId, stopOrder:b.stopOrder, data:{ Status:'Failed' }});
  if (b.deliveryId) updateById('Deliveries', b.deliveryId, { Status:'Failed', Note:b.reason||'' });
  logGPS({ data:{ RouteID:b.routeId, DeliveryID:b.deliveryId, EventType:'FAILED_DELIVERY' }});
  logActivity('FAILED_DELIVERY', b.deliveryId||b.routeId, 'ส่งไม่สำเร็จ: '+(b.reason||''), b.user);
  return { ok:true };
}

/* ==================================================================
   8. COST FORMULA
   Total = Fuel + Toll + Parking + External + Other
   ================================================================== */
function computeRouteCost(d){
  const fuel = Number(d.EstimatedFuelCost)||0;
  const toll = Number(d.EstimatedTollCost)||0;
  const park = Number(d.EstimatedParkingCost)||0;
  const ext  = Number(d.EstimatedExternalCost)||0;
  const other= Number(d.EstimatedOtherCost)||0;
  const total = fuel + toll + park + ext + other;
  const stops = Number(d.TotalStops)||0;
  const boxes = Number(d.TotalBoxes)||0;
  d.EstimatedTotalCost = total;
  d.CostPerStop = stops ? +(total/stops).toFixed(2) : 0;
  d.CostPerBox  = boxes ? +(total/boxes).toFixed(2) : 0;
  return d;
}

/* ==================================================================
   9. CARTRACK FLEET API
   ------------------------------------------------------------------
   Credentials เก็บใน PropertiesService (Script Properties) เท่านั้น
   Keys: CARTRACK_BASE_URL / CARTRACK_USERNAME / CARTRACK_API_TOKEN
   ================================================================== */

// >>> แก้ค่า 3 บรรทัดนี้แล้วรัน setupCartrackCredentials() หนึ่งครั้ง <<<
function setupCartrackCredentials(){
  const props = PropertiesService.getScriptProperties();
  props.setProperties({
    CARTRACK_BASE_URL : 'https://fleetapi-th.cartrack.com/rest',
    CARTRACK_USERNAME : 'YOUR_CARTRACK_USERNAME',
    CARTRACK_API_TOKEN: 'YOUR_CARTRACK_API_TOKEN'
  }, true);
  updateSetting({ key:'CARTRACK_ENABLED', value:'true' });
  return 'บันทึก Cartrack credentials ลง Script Properties เรียบร้อย (frontend มองไม่เห็น)';
}
function secret(key, fallback){
  const v = PropertiesService.getScriptProperties().getProperty(key);
  return (v !== null && v !== '') ? v : (fallback !== undefined ? fallback : '');
}

// ดึงสถานะรถทั้งหมดจาก Cartrack → อัปเดต Vehicles + CartrackVehicles + GPSLogs
function syncCartrack(){
  const enabled = String(settingValue('CARTRACK_ENABLED','false')).toLowerCase() === 'true';
  if (!enabled) return { ok:false, skipped:true, message:'CARTRACK_ENABLED = false' };

  const base  = secret('CARTRACK_BASE_URL','https://fleetapi-th.cartrack.com/rest');
  const user  = secret('CARTRACK_USERNAME');
  const token = secret('CARTRACK_API_TOKEN');
  if (!user || !token) throw new Error('ยังไม่ได้ตั้งค่า Cartrack credentials — รัน setupCartrackCredentials()');

  const url = base.replace(/\/+$/,'') + '/vehicles/status';
  const res = UrlFetchApp.fetch(url, {
    method:'get',
    headers:{ 'Accept':'application/json',
      'Authorization':'Basic ' + Utilities.base64Encode(user + ':' + token) },
    muteHttpExceptions:true
  });
  const code = res.getResponseCode();
  if (code === 401 || code === 403) throw new Error('Cartrack auth ล้มเหลว ('+code+')');
  if (code >= 400) throw new Error('Cartrack API error ' + code);

  const body = JSON.parse(res.getContentText() || '{}');
  const list = body.data || body.vehicles || (Array.isArray(body) ? body : []);
  const now = new Date().toISOString();
  const vehicles = readAll('Vehicles', true);

  // ล้าง CartrackVehicles snapshot
  const ctSh = sheet('CartrackVehicles');
  if (ctSh.getLastRow() > 1) ctSh.deleteRows(2, ctSh.getLastRow()-1);

  let matched = 0;
  list.forEach(v => {
    const reg  = v.registration || v.vehicle_registration || v.plate || '';
    const lat  = num(v.latitude || (v.location && v.location.latitude));
    const lng  = num(v.longitude || (v.location && v.location.longitude));
    const spd  = num(v.speed);
    const head = num(v.heading || v.bearing);
    const odo  = num(v.odometer);
    const drv  = v.driver_name || v.current_driver || '';
    const stat = v.status || v.ignition || '';
    const posT = v.event_ts || v.position_time || v.gps_time || now;
    const ctId = v.vehicle_id || v.id || reg;

    appendRow('CartrackVehicles', { CartrackVehicleID:ctId, Registration:reg,
      Latitude:lat, Longitude:lng, Speed:spd, Heading:head, Odometer:odo,
      CurrentDriver:drv, VehicleStatus:stat, LastPositionTime:posT, FetchedAt:now });

    const match = vehicles.filter(x =>
      (x.CartrackVehicleID && String(x.CartrackVehicleID)===String(ctId)) ||
      (x.CartrackRegistration && x.CartrackRegistration===reg) ||
      (x.LicensePlate && x.LicensePlate===reg))[0];
    if (match){
      const vstat = (Number(spd)>3) ? 'In Use' : (stat ? 'Stopped' : 'Available');
      updateById('Vehicles', match.VehicleID, {
        CurrentLatitude:lat, CurrentLongitude:lng, CurrentSpeed:spd, CurrentHeading:head,
        CurrentOdometer:odo, CurrentDriver:drv||match.CurrentDriver,
        LastPositionTime:posT, LastSyncAt:now, VehicleStatus:vstat });
      matched++;
    }
    if (lat && lng) appendRow('GPSLogs', {
      LogID:'CT-'+Date.now()+'-'+(reg||Math.random().toString(36).slice(2,6)),
      Latitude:lat, Longitude:lng, Timestamp:posT, EventType:'CARTRACK:'+(reg||'?') });
  });

  updateSetting({ key:'CARTRACK_LAST_SYNC', value:now });
  appendRow('CartrackLogs', { LogID:'CTL-'+Date.now(), SyncAt:now,
    Fetched:list.length, Matched:matched, Status:'OK', Message:'sync ok' });
  logActivity('SYNC_CARTRACK', '-', 'ซิงก์ Cartrack ' + list.length + ' คัน · แมตช์ ' + matched, 'system');
  return { ok:true, fetched:list.length, matched:matched, at:now };
}

// ทดสอบ/ตรวจโครงสร้าง response จาก Cartrack — รันจาก editor แล้วดู Logs
// เพื่อ map ชื่อฟิลด์จริงให้ตรง (docs ไม่ได้ระบุชื่อฟิลด์)
function testCartrackRaw(){
  const base  = secret('CARTRACK_BASE_URL','https://fleetapi-th.cartrack.com/rest');
  const user  = secret('CARTRACK_USERNAME');
  const token = secret('CARTRACK_API_TOKEN');
  if (!user || !token) return 'ยังไม่ได้ตั้งค่า credentials — รัน setupCartrackCredentials() ก่อน';
  const url = base.replace(/\/+$/,'') + '/vehicles/status';
  const res = UrlFetchApp.fetch(url, {
    method:'get',
    headers:{ 'Accept':'application/json',
      'Authorization':'Basic ' + Utilities.base64Encode(user + ':' + token) },
    muteHttpExceptions:true
  });
  const code = res.getResponseCode();
  const text = res.getContentText() || '';
  let keys = [], sample = null;
  try {
    const body = JSON.parse(text);
    const list = body.data || body.vehicles || (Array.isArray(body) ? body : []);
    if (list.length) { sample = list[0]; keys = Object.keys(list[0]); }
  } catch (e) {}
  const out = { httpCode:code, count:(keys.length?'(มีข้อมูล)':'?'), fieldKeys:keys,
    firstVehicle:sample, rawPreview:text.slice(0,1500) };
  Logger.log(JSON.stringify(out, null, 2));   // ดูที่ View → Logs
  return out;
}

// frontend เรียกดูสถานะ (ไม่มี secret) — connected/ lastSync / counts + พิกัดล่าสุด
function getCartrackStatus(){
  const enabled = String(settingValue('CARTRACK_ENABLED','false')).toLowerCase() === 'true';
  const hasCreds = !!secret('CARTRACK_USERNAME') && !!secret('CARTRACK_API_TOKEN');
  const lastSync = settingValue('CARTRACK_LAST_SYNC','');
  const ct = readAll('CartrackVehicles');
  const vehicles = readAll('Vehicles');
  const matched = vehicles.filter(v => v.LastSyncAt).length;
  // stale ถ้าซิงก์ล่าสุด > 90 วินาที
  const stale = lastSync ? (Date.now() - new Date(lastSync).getTime() > 90000) : true;
  return {
    enabled: enabled, connected: enabled && hasCreds && !!lastSync,
    hasCredentials: hasCreds, lastSync: lastSync, stale: stale,
    found: ct.length, matched: matched
  };
}

// พิกัดสดของรถบริษัท (อ่านจาก Vehicles — frontend ไม่ยิง Cartrack ตรง)
function getLiveVehicleStatus(){
  return readAll('Vehicles').map(v => ({
    VehicleID:v.VehicleID, VehicleName:v.VehicleName, LicensePlate:v.LicensePlate,
    VehicleType:v.VehicleType, CapacityBox:v.CapacityBox, CurrentDriver:v.CurrentDriver,
    VehicleStatus:v.VehicleStatus, lat:v.CurrentLatitude, lng:v.CurrentLongitude,
    speed:v.CurrentSpeed, heading:v.CurrentHeading, odometer:v.CurrentOdometer,
    lastPositionTime:v.LastPositionTime, lastSyncAt:v.LastSyncAt
  }));
}

// ติดตั้ง trigger ซิงก์อัตโนมัติทุก 1 นาที (Apps Script ขั้นต่ำ) — รันครั้งเดียว
function installCartrackTrigger(){
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'syncCartrack')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('syncCartrack').timeBased().everyMinutes(1).create();
  return 'ติดตั้ง trigger syncCartrack ทุก 1 นาที เรียบร้อย';
}
