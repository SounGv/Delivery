const { toFrontendList } = require('../serialize');
const { attachGpsActualsToRoutes, buildRouteGpsMetrics } = require('./routeGps');

// Pages Functions run in UTC; the business is in Thailand (UTC+7).
// "Today" must be computed in that timezone, matching Session.getScriptTimeZone()
// in the old Apps Script backend (Asia/Bangkok).
function todayStr() {
  const d = new Date(Date.now() + 7 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}

function addDays(iso, n) {
  const d = new Date(String(iso).slice(0, 10) + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** จำนวนวันระหว่างสองวันที่ (YYYY-MM-DD) — บวก = b หลัง a */
function daysBetween(a, b) {
  const aa = String(a || '').slice(0, 10);
  const bb = String(b || '').slice(0, 10);
  if (!aa || !bb) return 0;
  return Math.round((Date.parse(bb + 'T12:00:00Z') - Date.parse(aa + 'T12:00:00Z')) / 864e5);
}

function normInvoiceNo(v) { return String(v || '').trim().toLowerCase(); }

/** คะแนนเลือกแถวที่ "ดีกว่า" เมื่อเลขบิลซ้ำ — เก็บที่ผูกรอบ/มีพิกัด/มีมูลค่า */
function deliveryRowRank(r) {
  let s = 0;
  if (r.route_id || r.RouteID) s += 100;
  const st = r.status || r.Status || '';
  if (st && st !== 'Draft' && st !== 'Pending' && st !== '') s += 50;
  if ((r.latitude || r.Latitude) && (r.longitude || r.Longitude)) s += 10;
  const amt = Number(r.amount ?? r.Amount);
  if (Number.isFinite(amt) && amt > 0) s += 5;
  if (r.address || r.Address) s += 3;
  s += String(r.updated_at || r.UpdatedAt || '').length * 0.001;
  return s;
}

/** แถวขยะ — ไม่มีเลขบิล/PO/มูลค่า ไม่ผูกรอบ → ไม่ควรค้างในคิว (ทำให้ user งง) */
function isGhostDeliveryRow(r) {
  if (r.route_id || r.RouteID) return false;
  const st = r.status || r.Status || '';
  if (['Planned', 'Assigned', 'In Progress'].includes(st)) return false;
  const inv = normInvoiceNo(r.invoice_no || r.InvoiceNo);
  if (inv) return false;
  const amt = Number(r.amount ?? r.Amount);
  if (Number.isFinite(amt) && amt > 0) return false;
  const po = String(r.po_no || r.PoNo || '').trim();
  if (po) return false;
  return true;
}

/** บิลเดียวกัน (invoice_no) อาจถูก sync ซ้ำ → แสดงแค่ 1 แถว */
function dedupeDeliveryRows(rows) {
  const byInv = new Map();
  const noInv = [];
  const seenId = new Set();
  for (const r of rows || []) {
    if (isGhostDeliveryRow(r)) continue;
    const id = r.delivery_id || r.DeliveryID;
    if (id && seenId.has(id)) continue;
    if (id) seenId.add(id);
    const inv = normInvoiceNo(r.invoice_no || r.InvoiceNo);
    if (!inv) {
      noInv.push(r);
      continue;
    }
    const prev = byInv.get(inv);
    if (!prev || deliveryRowRank(r) > deliveryRowRank(prev)) byInv.set(inv, r);
  }
  return [...byInv.values(), ...noInv];
}

/** สถานะที่ยังต้องจัดส่ง — งานค้างจากวันก่อนต้องโผล่ในวันทำงาน */
const OPEN_WORK_STATUSES = ['Draft', 'Pending', 'Planned', 'Assigned', 'In Progress'];

/** เลื่อน Draft ได้แค่ช่วงสั้น (เสาร์→จันทร์) — ของเก่าที่ค้างนานถือว่าส่งเสร็จแล้ว */
const CARRY_OPEN_DAYS = 2;

/**
 * งานของวันทำงาน + งานค้าง (delivery_date เก่ากว่า แต่ยังไม่จบ)
 * promoteDraft: เลื่อนวันที่ของ Draft/Pending ที่ยังไม่ผูกรอบ → วันทำงาน (ให้รายงานตรงกับหน้างาน)
 * งานค้างเกิน CARRY_OPEN_DAYS → ปิดเป็น Completed (ไม่ดึงมาสกปรกคิววันนี้)
 */
async function deliveriesForWorkDate(DB, date, { promoteDraft = true, lookbackDays = 14 } = {}) {
  const from = addDays(date, -Math.max(1, lookbackDays));
  const { results: exact } = await DB.prepare(
    'select * from deliveries where delivery_date = ?1 and is_deleted = 0'
  ).bind(date).all();
  const { results: overdue } = await DB.prepare(
    `select * from deliveries where is_deleted = 0
      and delivery_date < ?1 and delivery_date >= ?2
      and status in (${OPEN_WORK_STATUSES.map((_, i) => '?' + (i + 3)).join(',')})`
  ).bind(date, from, ...OPEN_WORK_STATUSES).all();

  const byId = new Map();
  for (const r of exact || []) byId.set(r.delivery_id, r);
  for (const r of overdue || []) {
    if (!byId.has(r.delivery_id)) byId.set(r.delivery_id, r);
  }

  let promoted = 0;
  let autoCompleted = 0;
  let ghostsPurged = 0;
  if (promoteDraft) {
    const now = new Date().toISOString();
    const ghostStmts = [];
    for (const r of byId.values()) {
      if (!isGhostDeliveryRow(r)) continue;
      ghostStmts.push(DB.prepare(
        `update deliveries set is_deleted = 1, updated_at = ?1, updated_by = 'ghost-purge',
         version = coalesce(version,0) + 1
         where delivery_id = ?2 and is_deleted = 0`
      ).bind(now, r.delivery_id));
      byId.delete(r.delivery_id);
      ghostsPurged++;
    }
    if (ghostStmts.length) await DB.batch(ghostStmts);
    const toPromote = [];
    const toComplete = [];
    for (const r of byId.values()) {
      const st = r.status || '';
      const openDraft = st === 'Draft' || st === 'Pending' || st === '';
      const noRoute = !r.route_id;
      if (!(openDraft && noRoute && r.delivery_date && r.delivery_date < date)) continue;
      const anchor = (r.due_date || r.document_date || r.delivery_date || '').slice(0, 10);
      if (anchor && daysBetween(anchor, date) > CARRY_OPEN_DAYS) toComplete.push(r);
      else toPromote.push(r);
    }
    if (toComplete.length) {
      const stmts = toComplete.map((r) => {
        const keep = (r.due_date && r.due_date !== '0000-00-00' ? r.due_date : '')
          || r.document_date || r.delivery_date;
        return DB.prepare(
          `update deliveries set status = 'Completed', delivery_date = ?1, updated_at = ?2,
           updated_by = 'auto-complete-past', version = coalesce(version,0) + 1
           where delivery_id = ?3 and is_deleted = 0`
        ).bind(keep, now, r.delivery_id);
      });
      await DB.batch(stmts);
      for (const r of toComplete) {
        byId.delete(r.delivery_id); // ไม่โชว์ในคิววันนี้
        autoCompleted++;
      }
    }
    if (toPromote.length) {
      const stmts = toPromote.map((r) => DB.prepare(
        'update deliveries set delivery_date = ?1, updated_at = ?2, version = coalesce(version,0) + 1 where delivery_id = ?3 and is_deleted = 0'
      ).bind(date, now, r.delivery_id));
      await DB.batch(stmts);
      for (const r of toPromote) { r.delivery_date = date; promoted++; }
    }
  }
  return { rows: dedupeDeliveryRows(Array.from(byId.values())), promoted, autoCompleted, ghostsPurged };
}

async function recentActivities(DB, n) {
  const { results } = await DB.prepare('select * from activity_logs order by timestamp desc limit ?1').bind(n).all();
  return toFrontendList('activity_logs', results);
}

async function getDashboardData(env, p) {
  const DB = env.DB;
  const date = (p && p.date) || todayStr();
  const promote = p && p.promoteDraft !== false;
  const [delPack, routes, expenses, vehicles] = await Promise.all([
    deliveriesForWorkDate(DB, date, { promoteDraft: promote }),
    DB.prepare('select * from routes where delivery_date = ?1 and is_deleted = 0').bind(date).all().then((r) => r.results),
    DB.prepare('select * from expenses where expense_date = ?1 and is_deleted = 0').bind(date).all().then((r) => r.results),
    DB.prepare('select * from vehicles where is_deleted = 0').all().then((r) => r.results),
  ]);
  const d = delPack.rows || [], r = routes || [], e = expenses || [], v = vehicles || [];

  const boxes = (list) => list.reduce((n, x) => n + (Number(x.box_qty) || 0), 0);
  const countBy = (s) => d.filter((x) => x.status === s);
  const stat = (s) => ({ count: countBy(s).length, boxes: boxes(countBy(s)) });

  const kpi = {
    total: { count: d.length, boxes: boxes(d) },
    draft: stat('Draft'), planned: stat('Planned'), assigned: stat('Assigned'),
    inProgress: stat('In Progress'), completed: stat('Completed'), failed: stat('Failed'),
    stops: r.reduce((n, x) => n + (Number(x.total_stops) || 0), 0),
  };

  const est = r.reduce((n, x) => n + (Number(x.estimated_total_cost) || 0), 0);
  const companyCost = r.filter((x) => x.route_type === 'COMPANY_VEHICLE').reduce((n, x) => n + (Number(x.estimated_total_cost) || 0), 0);
  const externalCost = r.filter((x) => x.route_type === 'EXTERNAL_VEHICLE').reduce((n, x) => n + (Number(x.estimated_total_cost) || 0), 0);
  const otherCost = r.reduce((n, x) => n + (Number(x.estimated_other_cost) || 0), 0)
    + e.filter((x) => x.expense_type === 'OTHER').reduce((n, x) => n + (Number(x.amount) || 0), 0);
  const totalStops = kpi.stops;
  const totalBoxes = r.reduce((n, x) => n + (Number(x.total_boxes) || 0), 0);

  const cost = {
    total: est, company: companyCost, external: externalCost, other: otherCost,
    avgPerRoute: r.length ? est / r.length : 0,
    avgPerStop: totalStops ? est / totalStops : 0,
    avgPerBox: totalBoxes ? est / totalBoxes : 0,
  };

  const fleet = {
    available: v.filter((x) => x.vehicle_status === 'Available').length,
    inUse: v.filter((x) => x.vehicle_status === 'In Use').length,
    offline: v.filter((x) => x.vehicle_status === 'Offline' || x.vehicle_status === 'Stopped').length,
    total: v.length,
  };

  return { date, kpi, cost, fleet, routes: toFrontendList('routes', r), activities: await recentActivities(DB, 20) };
}

async function stripEmployeeSecretsSelect(DB) {
  // Column-level: employees never had a pin_hash column to begin with
  // (it lives in employee_credentials), so a plain select is already safe.
  const { results } = await DB.prepare('select * from employees where is_deleted = 0').all();
  return toFrontendList('employees', results);
}

async function getBootstrap(env, p) {
  const DB = env.DB;
  const date = (p && p.date) || todayStr();
  // เลื่อน Draft ค้าง → วันทำงาน ก่อนคำนวณ dashboard/รายการ (รายงานวันนั้นจะตรงกัน)
  const delPack = await deliveriesForWorkDate(DB, date, { promoteDraft: true });
  const mergedDel = new Map((delPack.rows || []).map((r) => [r.delivery_id, r]));
  try {
    const { results: doneToday } = await DB.prepare(
      `select * from deliveries where is_deleted = 0 and status = 'Completed'
       and substr(updated_at, 1, 10) = ?1`
    ).bind(date).all();
    for (const r of doneToday || []) mergedDel.set(r.delivery_id, r);
  } catch (_) { /* optional */ }
  const deliveryRows = dedupeDeliveryRows(Array.from(mergedDel.values()));
  const [settings, customers, employees, vehicles, providers, extVehicles, dashboard, routes, cartrack] = await Promise.all([
    DB.prepare('select * from settings').all().then((r) => toFrontendList('settings', r.results)),
    DB.prepare('select * from customers where is_deleted = 0').all().then((r) => toFrontendList('customers', r.results)),
    stripEmployeeSecretsSelect(DB),
    DB.prepare('select * from vehicles where is_deleted = 0').all().then((r) => toFrontendList('vehicles', r.results)),
    DB.prepare('select * from external_providers where is_deleted = 0').all().then((r) => toFrontendList('external_providers', r.results)),
    DB.prepare('select * from external_vehicles where is_deleted = 0').all().then((r) => toFrontendList('external_vehicles', r.results)),
    getDashboardData(env, { date, promoteDraft: false }),
    DB.prepare('select * from routes where delivery_date = ?1 and is_deleted = 0').bind(date).all().then((r) => toFrontendList('routes', r.results)),
    getCartrackStatus(env),
  ]);
  return {
    serverTime: new Date().toISOString(), date, settings, customers, employees, vehicles,
    externalProviders: providers, externalVehicles: extVehicles, dashboard,
    deliveries: toFrontendList('deliveries', deliveryRows),
    routes, cartrack,
    carriedOver: delPack.promoted,
    ghostsPurged: delPack.ghostsPurged || 0,
  };
}

async function getDeliveries(env, p) {
  if (p && p.date && !p.routeId && !p.exactDate) {
    const pack = await deliveriesForWorkDate(env.DB, p.date, {
      promoteDraft: p.promoteDraft !== false,
      lookbackDays: Number(p.lookbackDays) || 14,
    });
    let rows = pack.rows;
    if (p.status) rows = rows.filter((x) => x.status === p.status);
    return toFrontendList('deliveries', rows);
  }
  const conds = ['is_deleted = 0']; const args = [];
  if (p && p.date) { conds.push('delivery_date = ?' + (args.length + 1)); args.push(p.date); }
  if (p && p.status) { conds.push('status = ?' + (args.length + 1)); args.push(p.status); }
  if (p && p.routeId) { conds.push('route_id = ?' + (args.length + 1)); args.push(p.routeId); }
  const { results } = await env.DB.prepare(`select * from deliveries where ${conds.join(' and ')}`).bind(...args).all();
  return toFrontendList('deliveries', results);
}

async function getRoutes(env, p) {
  const conds = ['is_deleted = 0']; const args = [];
  if (p && p.date) { conds.push('delivery_date = ?' + (args.length + 1)); args.push(p.date); }
  const { results } = await env.DB.prepare(`select * from routes where ${conds.join(' and ')}`).bind(...args).all();
  return toFrontendList('routes', results);
}

async function getRouteStops(env, p) {
  let sql = 'select * from route_stops';
  const args = [];
  if (p && p.routeId) { sql += ' where route_id = ?1'; args.push(p.routeId); }
  sql += ' order by stop_order asc';
  const { results } = await env.DB.prepare(sql).bind(...args).all();
  return toFrontendList('route_stops', results);
}

// Raw GPS history for a route — used to draw the "actual route" polyline
// and derive stop dwell-time, alongside the planned route (route_stops in
// stop_order). Written by driverPing/logGPS, never read back until now.
async function getRouteGpsTrack(env, p) {
  if (!p || !p.routeId) return [];
  const row = await env.DB.prepare(
    'select route_id, license_plate, delivery_date, status, created_at, updated_at from routes where route_id = ?1'
  ).bind(p.routeId).first();
  if (!row) return [];
  const g = await buildRouteGpsMetrics(env.DB, row);
  return g.track.map((pt) => ({
    RouteID: p.routeId,
    Latitude: pt.Latitude,
    Longitude: pt.Longitude,
    Timestamp: pt.Timestamp,
    EventType: pt.EventType,
    GpsSource: g.source,
  }));
}

async function getCustomers(env) {
  const { results } = await env.DB.prepare('select * from customers where is_deleted = 0').all();
  return toFrontendList('customers', results);
}
async function getEmployees(env) { return stripEmployeeSecretsSelect(env.DB); }
async function getVehicles(env) {
  const { results } = await env.DB.prepare('select * from vehicles where is_deleted = 0').all();
  return toFrontendList('vehicles', results);
}
async function getExternalProviders(env) {
  const { results } = await env.DB.prepare('select * from external_providers where is_deleted = 0').all();
  return toFrontendList('external_providers', results);
}
async function getExternalVehicles(env) {
  const { results } = await env.DB.prepare('select * from external_vehicles where is_deleted = 0').all();
  return toFrontendList('external_vehicles', results);
}
async function getCartrackVehicles(env) {
  const { results } = await env.DB.prepare('select * from cartrack_vehicles').all();
  return toFrontendList('cartrack_vehicles', results);
}

async function getLiveVehicleStatus(env) {
  const { results } = await env.DB.prepare('select * from vehicles where is_deleted = 0').all();
  return (results || []).map((v) => ({
    VehicleID: v.vehicle_id, VehicleName: v.vehicle_name, LicensePlate: v.license_plate,
    VehicleType: v.vehicle_type, CapacityBox: v.capacity_box, CurrentDriver: v.current_driver,
    VehicleStatus: v.vehicle_status, lat: v.current_latitude, lng: v.current_longitude,
    speed: v.current_speed, heading: v.current_heading, odometer: v.current_odometer,
    lastPositionTime: v.last_position_time, lastSyncAt: v.last_sync_at,
  }));
}

async function getExpenses(env, p) {
  const conds = ['is_deleted = 0']; const args = [];
  if (p && p.routeId) { conds.push('route_id = ?' + (args.length + 1)); args.push(p.routeId); }
  if (p && p.date) { conds.push('expense_date = ?' + (args.length + 1)); args.push(p.date); }
  const { results } = await env.DB.prepare(`select * from expenses where ${conds.join(' and ')}`).bind(...args).all();
  return toFrontendList('expenses', results);
}
async function getClaims(env) {
  const { results } = await env.DB.prepare('select * from expense_claims where is_deleted = 0').all();
  return toFrontendList('expense_claims', results);
}
async function getRouteCosts(env, p) { return getRoutes(env, p); }

async function getReports(env, p) {
  const from = p && p.from, to = p && p.to;
  const build = (base, dateCol, extra) => {
    const conds = ['is_deleted = 0']; const args = [];
    if (from) { conds.push(`${dateCol} >= ?${args.length + 1}`); args.push(from); }
    if (to) { conds.push(`${dateCol} <= ?${args.length + 1}`); args.push(to); }
    if (extra) { extra.forEach(([col, val]) => { conds.push(`${col} = ?${args.length + 1}`); args.push(val); }); }
    const sql = base + ' where ' + conds.join(' and ');
    return env.DB.prepare(sql).bind(...args).all().then((r) => r.results);
  };
  const routeExtra = [];
  if (p && p.routeId) routeExtra.push(['route_id', p.routeId]);
  if (p && p.driver) routeExtra.push(['driver_name', p.driver]);
  const [delsInRange, routes, expenses] = await Promise.all([
    build('select * from deliveries', 'delivery_date'),
    build('select * from routes', 'delivery_date', routeExtra),
    build('select * from expenses', 'expense_date'),
  ]);

  // ให้ตรงหน้าวันนี้/งานส่ง: งานค้างก่อนช่วง (ยังไม่จบ) นับรวมที่ปลายช่วง `to`
  let dels = delsInRange || [];
  if (to) {
    const pack = await deliveriesForWorkDate(env.DB, to, { promoteDraft: false, lookbackDays: 14 });
    const seen = new Set(dels.map((d) => d.delivery_id));
    for (const row of pack.rows) {
      if (seen.has(row.delivery_id)) continue;
      // เฉพาะที่อยู่นอกช่วงรายงาน (ค้างก่อน from) — กันนับซ้ำ
      if (from && row.delivery_date >= from && row.delivery_date <= to) continue;
      if (from && row.delivery_date >= from) continue;
      dels.push(row);
      seen.add(row.delivery_id);
    }
  }

  const routesFe = toFrontendList('routes', routes);
  const expensesFe = toFrontendList('expenses', expenses);

  await attachGpsActualsToRoutes(env.DB, routesFe);
  const fuelExpByRoute = {};
  for (const e of expensesFe) {
    if (e.ExpenseType === 'FUEL' && e.RouteID) {
      fuelExpByRoute[e.RouteID] = (fuelExpByRoute[e.RouteID] || 0) + (Number(e.Amount) || 0);
    }
  }
  for (const r of routesFe) {
    r.ActualFuelExpense = +(fuelExpByRoute[r.RouteID] || 0).toFixed(2);
  }

  return {
    deliveries: toFrontendList('deliveries', dels),
    routes: routesFe,
    expenses: expensesFe,
  };
}

async function getSettings(env, p) {
  let sql = 'select * from settings'; const args = [];
  if (p && p.group) { sql += ' where group_name = ?1'; args.push(p.group); }
  const { results } = await env.DB.prepare(sql).bind(...args).all();
  return toFrontendList('settings', results);
}

async function getCartrackStatus(env) {
  const enabled = String(await settingValue(env.DB, 'CARTRACK_ENABLED', 'false')).toLowerCase() === 'true';
  const lastSync = await settingValue(env.DB, 'CARTRACK_LAST_SYNC', '');
  // The real CARTRACK_USERNAME/CARTRACK_API_TOKEN secrets live only on the
  // separate cartrack-sync-worker (this Pages Function never sees them) —
  // a completed sync is proof the worker's credentials actually work,
  // which is a more meaningful signal than "a value happens to be set".
  const hasCreds = !!lastSync;
  const [ctRow, vehiclesRes] = await Promise.all([
    env.DB.prepare('select count(*) as n from cartrack_vehicles').first(),
    env.DB.prepare('select last_sync_at from vehicles where is_deleted = 0').all(),
  ]);
  const matched = (vehiclesRes.results || []).filter((v) => v.last_sync_at).length;
  const stale = lastSync ? (Date.now() - new Date(lastSync).getTime() > 90000) : true;
  return {
    enabled, connected: enabled && hasCreds && !!lastSync, hasCredentials: hasCreds,
    lastSync, stale, found: (ctRow && ctRow.n) || 0, matched,
  };
}

async function settingValue(DB, key, fallback) {
  const row = await DB.prepare('select value from settings where key = ?1').bind(key).first();
  return row && row.value !== '' && row.value != null ? row.value : (fallback !== undefined ? fallback : '');
}

async function getRealtime(env, p) {
  const date = (p && p.date) || todayStr();
  const dash = await getDashboardData(env, { date });
  const { results: routes } = await env.DB.prepare('select * from routes where delivery_date = ?1 and is_deleted = 0').bind(date).all();
  const routeIds = (routes || []).map((r) => r.route_id);
  let stops = [];
  if (routeIds.length) {
    const placeholders = routeIds.map((_, i) => '?' + (i + 1)).join(',');
    const { results } = await env.DB.prepare(`select * from route_stops where route_id in (${placeholders}) order by stop_order asc`).bind(...routeIds).all();
    stops = results || [];
  }
  return {
    serverTime: new Date().toISOString(), date,
    kpi: dash.kpi, cost: dash.cost, fleet: dash.fleet,
    routes: toFrontendList('routes', routes), stops: toFrontendList('route_stops', stops),
    vehicles: await getLiveVehicleStatus(env),
    cartrack: await getCartrackStatus(env),
    activities: dash.activities,
  };
}

// Proxies through the existing Apps Script deployment's own `geocode` action
// (Maps.newGeocoder(), free/built-in) rather than calling the Google Maps
// Geocoding API directly — that API needs a Google Cloud billing account
// attached even for free-tier usage, the same kind of friction R2 hit, which
// the user opted to avoid for photos too. Reuses APPS_SCRIPT_POD_URL (the
// same Apps Script base URL already configured for uploadPOD — dual-purpose
// now, not just POD).
async function geocode(env, p) {
  const addr = (p && (p.q || p.address)) ? String(p.q || p.address) : '';
  if (!addr) return { lat: '', lng: '', status: 'NO_ADDRESS' };
  const base = env.APPS_SCRIPT_POD_URL;
  if (!base) return { lat: '', lng: '', status: 'ERROR', error: 'APPS_SCRIPT_POD_URL not configured' };
  try {
    const url = `${base}?action=geocode&q=${encodeURIComponent(addr)}`;
    const res = await fetch(url);
    const body = await res.json();
    if (!body.ok) return { lat: '', lng: '', status: 'ERROR', error: body.error };
    return body.data;
  } catch (e) {
    return { lat: '', lng: '', status: 'ERROR', error: String(e) };
  }
}

function ping() { return { pong: true, time: new Date().toISOString() }; }

module.exports = {
  todayStr, addDays, daysBetween, deliveriesForWorkDate, OPEN_WORK_STATUSES, CARRY_OPEN_DAYS,
  normInvoiceNo, dedupeDeliveryRows, deliveryRowRank, isGhostDeliveryRow,
  getBootstrap, getDashboardData, getDeliveries, getRoutes, getRouteStops, getRouteGpsTrack,
  getCustomers, getEmployees, getVehicles, getExternalProviders, getExternalVehicles,
  getCartrackVehicles, getLiveVehicleStatus, getExpenses, getClaims, getRouteCosts,
  getReports, getSettings, getCartrackStatus, getRealtime, geocode, ping, settingValue,
};
