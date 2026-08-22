// Idempotency for every action here is handled once, uniformly, by the
// top-level dispatcher (functions/api/gas.js) — exactly matching how the
// old Apps Script doPost() worked (one requestId check before dispatch, one
// cache write after). Individual action functions below don't do their own
// request_log bookkeeping, so there's exactly one place responses get
// cached and exactly one shape they're cached in.
const { toDb, toFrontend } = require('../serialize');
const { geocode } = require('./reads');

async function logActivity(env, action, refId, description, user) {
  await env.DB.prepare('insert into activity_logs (action, reference_id, description, user_name, timestamp) values (?1,?2,?3,?4,?5)')
    .bind(action, String(refId), description, user || '', new Date().toISOString()).run();
}
function logActivityStmt(DB, action, refId, description, user) {
  return DB.prepare('insert into activity_logs (action, reference_id, description, user_name, timestamp) values (?1,?2,?3,?4,?5)')
    .bind(action, String(refId), description, user || '', new Date().toISOString());
}

async function autoGeocode(env, data) {
  if (data && data.Address && (!data.Latitude || !data.Longitude)) {
    const g = await geocode(env, { q: data.Address });
    if (g.status === 'OK') { data.Latitude = g.lat; data.Longitude = g.lng; }
  }
  return data;
}

// Atomic on its own — a single UPDATE...RETURNING statement, same
// collision-safety guarantee the old Supabase next_code() RPC had, just
// without a surrounding multi-statement transaction (see confirmRoute for
// the one case that needs the ID and the row insert to be atomic together).
async function nextId(DB, prefix, pad) {
  const row = await DB.prepare(
    `insert into id_counters(prefix, next_value) values (?1, 2)
     on conflict(prefix) do update set next_value = id_counters.next_value + 1
     returning next_value - 1 as v`
  ).bind(prefix).first();
  return prefix + '-' + String(row.v).padStart(pad || 3, '0');
}

async function insertOne(DB, table, row) {
  const cols = Object.keys(row);
  const sql = `insert into ${table} (${cols.join(',')}) values (${cols.map((_, i) => '?' + (i + 1)).join(',')}) returning *`;
  const rec = await DB.prepare(sql).bind(...cols.map((c) => row[c])).first();
  return toFrontend(table, rec);
}

async function updateById(DB, table, idCol, idVal, patchFrontend, extra) {
  const patch = Object.assign({}, toDb(table, patchFrontend), extra || {});
  const cols = Object.keys(patch);
  if (!cols.length) {
    const row = await DB.prepare(`select * from ${table} where ${idCol} = ?1`).bind(idVal).first();
    if (!row) throw new Error(`${table}: ไม่พบ id ${idVal}`);
    return toFrontend(table, row);
  }
  const setClause = cols.map((c, i) => `${c} = ?${i + 1}`).join(',');
  const sql = `update ${table} set ${setClause} where ${idCol} = ?${cols.length + 1} returning *`;
  const row = await DB.prepare(sql).bind(...cols.map((c) => patch[c]), idVal).first();
  if (!row) throw new Error(`${table}: ไม่พบ id ${idVal}`);
  return toFrontend(table, row);
}

// ---------------- Customers ----------------
async function createCustomer(env, b) {
  await autoGeocode(env, b.data);
  const id = await nextId(env.DB, 'CUS');
  const now = new Date().toISOString();
  const row = Object.assign(toDb('customers', b.data), { customer_id: id, status: 'Active', created_at: now, updated_at: now });
  const rec = await insertOne(env.DB, 'customers', row);
  await logActivity(env, 'CREATE_CUSTOMER', id, 'เพิ่มลูกค้า ' + (b.data.CustomerName || ''), b.user);
  return rec;
}
async function updateCustomer(env, b) {
  await autoGeocode(env, b.data);
  return updateById(env.DB, 'customers', 'customer_id', b.id, b.data, { updated_at: new Date().toISOString() });
}

// ---------------- Employees ----------------
async function createEmployee(env, b) {
  const id = await nextId(env.DB, 'EMP');
  const now = new Date().toISOString();
  const row = Object.assign(toDb('employees', b.data), { employee_id: id, status: 'Active', created_at: now, updated_at: now });
  const rec = await insertOne(env.DB, 'employees', row);
  await logActivity(env, 'CREATE_EMPLOYEE', id, 'เพิ่มพนักงาน ' + (b.data.EmployeeName || ''), b.user);
  return rec;
}
async function updateEmployee(env, b) {
  return updateById(env.DB, 'employees', 'employee_id', b.id, b.data, { updated_at: new Date().toISOString() });
}

// Bulk import helpers share this: find the highest numeric suffix already
// used for a given ID prefix, so imported rows never collide with rows
// created through the normal nextId() counter (mirrors the old Sheets
// bulkImport*'s "scan existing IDs, start after the max" approach).
async function maxIdSuffix(DB, table, idCol, floor) {
  const row = await DB.prepare(
    `select max(cast(substr(${idCol}, instr(${idCol},'-')+1) as integer)) as m from ${table}`
  ).first();
  return Math.max(floor, (row && row.m) || 0);
}

async function bulkImportCustomers(env, b) {
  const list = b.rows || [];
  if (!list.length) return { ok: true, inserted: 0 };
  const now = new Date().toISOString();
  const seq = await maxIdSuffix(env.DB, 'customers', 'customer_id', 1000);
  const stmts = list.map((d, i) => {
    const row = Object.assign(toDb('customers', d), { customer_id: 'CUS-' + (seq + i + 1), status: 'Active', created_at: now, updated_at: now });
    const cols = Object.keys(row);
    return env.DB.prepare(`insert into customers (${cols.join(',')}) values (${cols.map((_, j) => '?' + (j + 1)).join(',')})`).bind(...cols.map((c) => row[c]));
  });
  await env.DB.batch(stmts);
  await logActivity(env, 'IMPORT_CUSTOMERS', '-', `นำเข้าลูกค้า ${list.length} ราย`, b.user);
  return { ok: true, inserted: list.length };
}

async function bulkImportEmployees(env, b) {
  const list = b.rows || [];
  if (!list.length) return { ok: true, inserted: 0 };
  const now = new Date().toISOString();
  const seq = await maxIdSuffix(env.DB, 'employees', 'employee_id', 1000);
  const stmts = list.map((d, i) => {
    const row = Object.assign(toDb('employees', d), { employee_id: 'EMP-' + (seq + i + 1), role: d.Role || 'DRIVER', status: 'Active', created_at: now, updated_at: now });
    const cols = Object.keys(row);
    return env.DB.prepare(`insert into employees (${cols.join(',')}) values (${cols.map((_, j) => '?' + (j + 1)).join(',')})`).bind(...cols.map((c) => row[c]));
  });
  await env.DB.batch(stmts);
  await logActivity(env, 'IMPORT_EMPLOYEES', '-', `นำเข้าพนักงาน ${list.length} คน`, b.user);
  return { ok: true, inserted: list.length };
}

// ---------------- Deliveries ----------------
async function createDelivery(env, b) {
  if (!b.skipGeocode) await autoGeocode(env, b.data);
  const id = await nextId(env.DB, 'DEL');
  const now = new Date().toISOString();
  const status = (b.data && b.data.Status) || 'Draft';
  const row = Object.assign(toDb('deliveries', b.data), {
    delivery_id: id, status, created_at: now, updated_at: now,
    created_by: b.user || '', updated_by: b.user || '', version: 1,
  });
  const rec = await insertOne(env.DB, 'deliveries', row);
  await logActivity(env, 'CREATE_DELIVERY', id, 'สร้างงานส่ง ' + (b.data.CustomerName || ''), b.user);
  return rec;
}
async function updateDelivery(env, b) {
  // Matches the planning page's own "แตะเพื่อเพิ่มที่อยู่ (ระบบหาพิกัดให้อัตโนมัติ)"
  // hint — editing the address on a delivery that still has no coordinates
  // should fill them in, the same way createDelivery already does.
  if (!b.skipGeocode) await autoGeocode(env, b.data);
  const cur = await env.DB.prepare('select version, status from deliveries where delivery_id = ?1').bind(b.id).first();
  const rec = await updateById(env.DB, 'deliveries', 'delivery_id', b.id, b.data, {
    updated_at: new Date().toISOString(),
    version: ((cur && cur.version) || 1) + 1,
  });
  // แอดมินเปลี่ยนสถานะเป็นส่งสำเร็จ → ส่งกลับ TRCloud เช่นกัน
  const newStatus = b.data && b.data.Status;
  if (newStatus === 'Completed' && (!cur || cur.status !== 'Completed')) {
    try {
      const trcloud = require('./trcloud');
      const push = await trcloud.pushDeliveryCompleted(env, b.id);
      if (push && push.ok) {
        await logActivity(env, 'TRCLOUD_DELIVERED', b.id, 'อัปเดต TRCloud ส่งสำเร็จ ' + (push.invoiceNo || ''), b.user);
      }
    } catch (_) {}
  }
  return rec;
}
// Bulk import: one batch insert, no geocoding, no per-row activity log —
// matches the old Sheets version's "single range write" fast path, since
// this is used for importing hundreds of historical rows at once.
async function bulkImportDeliveries(env, b) {
  const list = b.rows || b.data || [];
  if (!list.length) return { ok: true, inserted: 0 };
  const now = new Date().toISOString();
  const seq = await maxIdSuffix(env.DB, 'deliveries', 'delivery_id', 10000);
  const stmts = list.map((d, i) => {
    const row = Object.assign({
      branch_name: '', address: '', latitude: '', longitude: '', priority: 'NORMAL', status: 'Completed', route_id: '',
      created_at: now, updated_at: now, created_by: 'import', updated_by: 'import', version: 1,
    }, toDb('deliveries', d), { delivery_id: 'DEL-' + (seq + i + 1) });
    const cols = Object.keys(row);
    return env.DB.prepare(`insert into deliveries (${cols.join(',')}) values (${cols.map((_, j) => '?' + (j + 1)).join(',')})`).bind(...cols.map((c) => row[c]));
  });
  await env.DB.batch(stmts);
  await logActivity(env, 'IMPORT_DELIVERIES', '-', `นำเข้างานส่ง ${list.length} รายการ`, b.user);
  return { ok: true, inserted: list.length };
}
async function deleteDelivery(env, b) {
  await logActivity(env, 'DELETE_DELIVERY', b.id, 'ลบงานส่ง (soft)', b.user);
  return updateById(env.DB, 'deliveries', 'delivery_id', b.id, {}, { is_deleted: 1, updated_at: new Date().toISOString() });
}

// ---------------- Vehicles ----------------
async function createVehicle(env, b) {
  const id = await nextId(env.DB, 'V');
  const now = new Date().toISOString();
  const row = Object.assign(toDb('vehicles', b.data), { vehicle_id: id, vehicle_status: 'Available', created_at: now, updated_at: now });
  const rec = await insertOne(env.DB, 'vehicles', row);
  await logActivity(env, 'CREATE_VEHICLE', id, 'เพิ่มรถบริษัท ' + (b.data.VehicleName || ''), b.user);
  return rec;
}
async function updateVehicle(env, b) {
  return updateById(env.DB, 'vehicles', 'vehicle_id', b.id, b.data, { updated_at: new Date().toISOString() });
}

// ---------------- External vehicles ----------------
async function createExternalVehicle(env, b) {
  const id = await nextId(env.DB, 'EV');
  const now = new Date().toISOString();
  const row = Object.assign(toDb('external_vehicles', b.data), { external_vehicle_id: id, status: 'Available', created_at: now, updated_at: now });
  const rec = await insertOne(env.DB, 'external_vehicles', row);
  await logActivity(env, 'CREATE_EXT_VEHICLE', id, 'เพิ่มรถภายนอก ' + (b.data.ProviderName || ''), b.user);
  return rec;
}
async function updateExternalVehicle(env, b) {
  return updateById(env.DB, 'external_vehicles', 'external_vehicle_id', b.id, b.data, { updated_at: new Date().toISOString() });
}

// ---------------- Routes ----------------
function computeRouteCost(d) {
  const fuel = Number(d.EstimatedFuelCost) || 0;
  const toll = Number(d.EstimatedTollCost) || 0;
  const park = Number(d.EstimatedParkingCost) || 0;
  const ext = Number(d.EstimatedExternalCost) || 0;
  const other = Number(d.EstimatedOtherCost) || 0;
  const total = fuel + toll + park + ext + other;
  const stops = Number(d.TotalStops) || 0;
  const boxes = Number(d.TotalBoxes) || 0;
  d.EstimatedTotalCost = total;
  d.CostPerStop = stops ? +(total / stops).toFixed(2) : 0;
  d.CostPerBox = boxes ? +(total / boxes).toFixed(2) : 0;
  return d;
}

// The one action that genuinely needs to be atomic across multiple tables
// (Route + N RouteStops + N Delivery status patches) — built as a single
// DB.batch([...]) call, which D1 runs as one all-or-nothing transaction.
// This is the same correctness improvement the Postgres confirm_route RPC
// gave in the Supabase design, just expressed as a batch instead of a
// stored procedure. Idempotency dedup for it still happens exactly once,
// at the gas.js dispatcher layer, same as every other action.
async function confirmRoute(env, b) {
  const DB = env.DB;
  const data = Object.assign({}, b.data);
  computeRouteCost(data);
  data.RouteType = data.RouteType || 'COMPANY_VEHICLE';
  data.Status = data.Status || 'Planned';
  const routeId = await nextId(DB, 'ROUTE');
  const now = new Date().toISOString();
  const routeRow = Object.assign(toDb('routes', data), {
    route_id: routeId, created_at: now, updated_at: now, is_deleted: 0, created_by: b.user || '',
  });
  // Leaving the driver dropdown blank on the planning form sends '' rather
  // than null — normalize so unassigned routes are genuinely NULL, matching
  // getAvailableRoutes()'s pool query in driver.js.
  if (routeRow.driver_employee_id === '') routeRow.driver_employee_id = null;
  const routeCols = Object.keys(routeRow);
  const stmts = [
    DB.prepare(`insert into routes (${routeCols.join(',')}) values (${routeCols.map((_, i) => '?' + (i + 1)).join(',')}) returning *`)
      .bind(...routeCols.map((c) => routeRow[c])),
  ];

  const stops = b.stops || [];
  stops.forEach((s, i) => {
    const stopRow = Object.assign(toDb('route_stops', s), { route_id: routeId, stop_order: i + 1, status: 'Pending' });
    const cols = Object.keys(stopRow);
    stmts.push(DB.prepare(`insert into route_stops (${cols.join(',')}) values (${cols.map((_, j) => '?' + (j + 1)).join(',')})`)
      .bind(...cols.map((c) => stopRow[c])));
    if (s.DeliveryID) {
      stmts.push(DB.prepare('update deliveries set status = ?1, route_id = ?2, updated_at = ?3, version = coalesce(version,1) + 1 where delivery_id = ?4')
        .bind('Planned', routeId, now, s.DeliveryID));
    }
  });
  stmts.push(logActivityStmt(DB, 'CREATE_ROUTE', routeId, `สร้าง Route (${data.RouteType}) · ${data.TotalStops || 0} จุด`, b.user));

  const results = await DB.batch(stmts);
  const routeRecord = results[0] && results[0].results && results[0].results[0];
  return toFrontend('routes', routeRecord);
}
// createRoute/createExternalRoute/confirmRoute were all aliases of the same
// logic in Code.gs (confirmRoute is the one the frontend actually calls).
const createRoute = confirmRoute;
function createExternalRoute(env, b) {
  b.data = Object.assign({ RouteType: 'EXTERNAL_VEHICLE' }, b.data);
  return confirmRoute(env, b);
}

async function updateRoute(env, b) {
  const data = Object.assign({}, b.data);
  if (data.recompute) { computeRouteCost(data); delete data.recompute; }
  return updateById(env.DB, 'routes', 'route_id', b.id, data, { updated_at: new Date().toISOString() });
}

async function updateRouteStop(env, b) {
  const patch = toDb('route_stops', b.data);
  const cols = Object.keys(patch);
  if (!cols.length) throw new Error('updateRouteStop: no data');
  const setClause = cols.map((c, i) => `${c} = ?${i + 1}`).join(',');
  const sql = `update route_stops set ${setClause} where route_id = ?${cols.length + 1} and stop_order = ?${cols.length + 2} returning *`;
  const row = await env.DB.prepare(sql).bind(...cols.map((c) => patch[c]), b.routeId, b.stopOrder).first();
  if (!row) throw new Error(`RouteStops: ไม่พบ ${b.routeId}/${b.stopOrder}`);
  return toFrontend('route_stops', row);
}

// ---------------- Expenses / Claims ----------------
async function createExpense(env, b) {
  const id = await nextId(env.DB, 'EXP');
  const row = Object.assign(toDb('expenses', b.data), { expense_id: id, created_at: new Date().toISOString(), created_by: b.user || '' });
  const rec = await insertOne(env.DB, 'expenses', row);
  await logActivity(env, 'CREATE_EXPENSE', b.data.RouteID || id, 'บันทึกค่าใช้จ่าย ' + (b.data.ExpenseType || ''), b.user);
  return rec;
}
async function updateExpense(env, b) {
  return updateById(env.DB, 'expenses', 'expense_id', b.id, b.data);
}

async function createClaim(env, b) {
  const id = await nextId(env.DB, 'CLM');
  const advance = Number(b.data.AdvanceAmount) || 0;
  const actual = Number(b.data.ActualExpense) || 0;
  const refund = advance > actual ? advance - actual : 0;
  const additional = actual > advance ? actual - advance : 0;
  const now = new Date().toISOString();
  const row = Object.assign(toDb('expense_claims', b.data), {
    claim_id: id, refund_amount: refund, additional_amount: additional, balance: advance - actual,
    status: 'Pending', created_at: now, updated_at: now,
  });
  const rec = await insertOne(env.DB, 'expense_claims', row);
  await logActivity(env, 'CREATE_CLAIM', id, `เคลียร์เงิน คืน ${refund} / เพิ่ม ${additional}`, b.user);
  return rec;
}
async function updateClaim(env, b) {
  return updateById(env.DB, 'expense_claims', 'claim_id', b.id, b.data, { updated_at: new Date().toISOString() });
}

async function updateSetting(env, b) {
  const key = b.key || (b.data && b.data.Key);
  const existing = await env.DB.prepare('select key from settings where key = ?1').bind(key).first();
  if (existing) {
    const row = await env.DB.prepare('update settings set value = ?1, updated_at = ?2 where key = ?3 returning *')
      .bind(b.value, new Date().toISOString(), key).first();
    await logActivity(env, 'UPDATE_SETTING', key, `${key} = ${b.value}`, b.user);
    return toFrontend('settings', row);
  }
  const row = await env.DB.prepare('insert into settings (key, value, group_name, label, updated_at) values (?1,?2,?3,?4,?5) returning *')
    .bind(key, b.value, b.group || 'custom', b.label || key, new Date().toISOString()).first();
  return toFrontend('settings', row);
}

module.exports = {
  createCustomer, updateCustomer, createEmployee, updateEmployee,
  bulkImportCustomers, bulkImportEmployees,
  createDelivery, updateDelivery, deleteDelivery, bulkImportDeliveries,
  createVehicle, updateVehicle, createExternalVehicle, updateExternalVehicle,
  createRoute, createExternalRoute, confirmRoute, updateRoute, updateRouteStop,
  createExpense, updateExpense, createClaim, updateClaim, updateSetting,
};
