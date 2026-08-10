const { toFrontend, toFrontendList } = require('../serialize');
const { settingValue } = require('./reads');

const DRIVER_SESSION_TTL_MS = 6 * 3600 * 1000; // 6h sliding expiry, same as the old CacheService TTL

// Byte-for-byte the same algorithm as the old Apps Script hashPin(), so
// existing PINHash values carried over from the Sheets migration keep
// working without forcing every driver to re-set their PIN. Uses the
// standard Web Crypto API (crypto.subtle) rather than Node's `crypto`
// module — available in the Workers runtime with no compatibility flag.
async function hashPin(employeeId, pin) {
  const bytes = new TextEncoder().encode(String(employeeId) + ':' + String(pin));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function setDriverPin(env, b) {
  const pin = String(b.pin || '').trim();
  if (!/^\d{4,6}$/.test(pin)) throw new Error('PIN ต้องเป็นเลข 4-6 หลัก');
  const username = String(b.username || '').trim();
  if (!username) throw new Error('กรอก Username ก่อน');
  const now = new Date().toISOString();
  const pinHash = await hashPin(b.id, pin);
  await env.DB.batch([
    env.DB.prepare('update employees set username = ?1, updated_at = ?2 where employee_id = ?3').bind(username, now, b.id),
    env.DB.prepare(
      `insert into employee_credentials (employee_id, pin_hash, updated_at) values (?1,?2,?3)
       on conflict(employee_id) do update set pin_hash = ?2, updated_at = ?3`
    ).bind(b.id, pinHash, now),
  ]);
  const row = await env.DB.prepare('select * from employees where employee_id = ?1').bind(b.id).first();
  return toFrontend('employees', row);
}

async function driverLogin(env, b) {
  const username = String(b.username || '').trim().toLowerCase();
  const emp = await env.DB.prepare('select * from employees where lower(username) = ?1 and is_deleted = 0').bind(username).first();
  if (!emp) throw new Error('ไม่พบ Username นี้');
  const cred = await env.DB.prepare('select pin_hash from employee_credentials where employee_id = ?1').bind(emp.employee_id).first();
  const pinHash = await hashPin(emp.employee_id, b.pin);
  if (!cred || pinHash !== cred.pin_hash) throw new Error('PIN ไม่ถูกต้อง');
  const token = crypto.randomUUID();
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + DRIVER_SESSION_TTL_MS).toISOString();
  await env.DB.batch([
    env.DB.prepare('insert into driver_sessions (token, employee_id, created_at, expires_at) values (?1,?2,?3,?4)')
      .bind(token, emp.employee_id, now, expiresAt),
    env.DB.prepare('insert into activity_logs (action, reference_id, description, user_name, timestamp) values (?1,?2,?3,?4,?5)')
      .bind('DRIVER_LOGIN', emp.employee_id, 'คนขับเข้าสู่ระบบ', emp.employee_name, now),
  ]);
  return { token, employee: { EmployeeID: emp.employee_id, EmployeeName: emp.employee_name, Phone: emp.phone } };
}

// Fleet is small enough (a few known drivers) that the dispatcher already
// decides who gets which route — logging in is just "which of you is this
// phone", not an access-control gate. Skips the PIN check entirely: creates
// a session straight from employeeId so the driver taps their name instead
// of typing credentials, while still keeping a real session/employee_id so
// "my jobs" and completeDelivery/checkIn stay attributed to a specific person.
async function driverSelect(env, b) {
  const emp = await env.DB.prepare('select * from employees where employee_id = ?1 and is_deleted = 0').bind(b.employeeId).first();
  if (!emp) throw new Error('ไม่พบพนักงาน');
  const token = crypto.randomUUID();
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + DRIVER_SESSION_TTL_MS).toISOString();
  await env.DB.batch([
    env.DB.prepare('insert into driver_sessions (token, employee_id, created_at, expires_at) values (?1,?2,?3,?4)')
      .bind(token, emp.employee_id, now, expiresAt),
    env.DB.prepare('insert into activity_logs (action, reference_id, description, user_name, timestamp) values (?1,?2,?3,?4,?5)')
      .bind('DRIVER_LOGIN', emp.employee_id, 'คนขับเข้าสู่ระบบ (เลือกชื่อ)', emp.employee_name, now),
  ]);
  return { token, employee: { EmployeeID: emp.employee_id, EmployeeName: emp.employee_name, Phone: emp.phone } };
}

async function driverLogout(env, b) {
  if (b.token) await env.DB.prepare('delete from driver_sessions where token = ?1').bind(b.token).run();
  return { ok: true };
}

// Resolves employeeId from an opaque token and slides the expiry forward —
// direct port of requireDriver()'s CacheService sliding-TTL behavior.
async function requireDriver(env, b) {
  const token = b.token;
  if (!token) throw new Error('ไม่พบ session — กรุณาเข้าสู่ระบบ');
  const row = await env.DB.prepare('select employee_id, expires_at from driver_sessions where token = ?1').bind(token).first();
  if (!row || new Date(row.expires_at).getTime() < Date.now()) throw new Error('เซสชันหมดอายุ — กรุณาเข้าสู่ระบบใหม่');
  await env.DB.prepare('update driver_sessions set expires_at = ?1 where token = ?2')
    .bind(new Date(Date.now() + DRIVER_SESSION_TTL_MS).toISOString(), token).run();
  return row.employee_id;
}

// Admin dashboard calls carry no token and bypass this check entirely
// (unchanged from the original — flagged as a known trust gap in the plan,
// not something this migration silently tightens).
async function assertRouteOwnerIfToken(env, b) {
  if (!b.token) return;
  const employeeId = await requireDriver(env, b);
  const route = await env.DB.prepare('select driver_employee_id from routes where route_id = ?1').bind(b.routeId).first();
  if (route && route.driver_employee_id && String(route.driver_employee_id) !== String(employeeId)) {
    throw new Error('Route นี้ไม่ได้มอบหมายให้คุณ');
  }
}

async function getMyRoutes(env, b) {
  const employeeId = await requireDriver(env, b);
  const conds = ['is_deleted = 0', 'driver_employee_id = ?1']; const args = [employeeId];
  if (b.date) { conds.push('delivery_date = ?' + (args.length + 1)); args.push(b.date); }
  const { results } = await env.DB.prepare(`select * from routes where ${conds.join(' and ')}`).bind(...args).all();
  return toFrontendList('routes', results);
}

// Unassigned route pool a driver can browse and pick up themselves — gated
// by requireDriver just to confirm the caller is logged in (the list itself
// isn't caller-specific). External-provider routes are excluded since those
// drivers never log into this app.
async function getAvailableRoutes(env, b) {
  await requireDriver(env, b);
  const conds = ["is_deleted = 0", "route_type = 'COMPANY_VEHICLE'", "status = 'Planned'", "(driver_employee_id is null or driver_employee_id = '')"];
  const args = [];
  if (b.date) { conds.push('delivery_date = ?' + (args.length + 1)); args.push(b.date); }
  const { results } = await env.DB.prepare(`select * from routes where ${conds.join(' and ')}`).bind(...args).all();
  return toFrontendList('routes', results);
}

// Claim an unassigned route: attach the calling driver, then delegate into
// startRoute() to flip it to 'In Progress' with the same GPS/activity log
// entries a pre-assigned "accept" already writes — one tap does both.
async function claimRoute(env, b) {
  const employeeId = await requireDriver(env, b);
  const route = await env.DB.prepare('select driver_employee_id from routes where route_id = ?1 and is_deleted = 0').bind(b.routeId).first();
  if (!route) throw new Error('ไม่พบ Route นี้');
  if (route.driver_employee_id) throw new Error('งานนี้มีคนขับแล้ว — โหลดหน้าใหม่แล้วลองอีกครั้ง');
  await env.DB.prepare('update routes set driver_employee_id = ?1, updated_at = ?2 where route_id = ?3')
    .bind(employeeId, new Date().toISOString(), b.routeId).run();
  return startRoute(env, b);
}

async function logGPS(env, data) {
  await env.DB.prepare('insert into gps_logs (route_id, delivery_id, latitude, longitude, accuracy, timestamp, event_type) values (?1,?2,?3,?4,?5,?6,?7)')
    .bind(data.RouteID || null, data.DeliveryID || null, data.Latitude || null, data.Longitude || null, data.Accuracy || null, new Date().toISOString(), data.EventType || null).run();
}

// Continuous position beacon while a route is active (unlike the discrete
// single-shot logGPS calls at start/checkin/complete/fail) — this is what
// lets the live tracking page show a phone-GPS vehicle's *current* position
// instead of only historical event markers. Requires a token (always sent
// by the driver-mode beacon) so it can resolve the caller's assigned
// vehicle via employees.vehicle_id and update that vehicle's live position,
// the same fields Cartrack sync already writes.
async function driverPing(env, b) {
  const employeeId = await requireDriver(env, b);
  const now = new Date().toISOString();
  await logGPS(env, { RouteID: b.routeId, Latitude: b.lat, Longitude: b.lng, Accuracy: b.accuracy, EventType: 'BEACON' });
  const emp = await env.DB.prepare('select vehicle_id from employees where employee_id = ?1').bind(employeeId).first();
  if (emp && emp.vehicle_id) {
    await env.DB.prepare(
      'update vehicles set current_latitude = ?1, current_longitude = ?2, current_speed = ?3, current_heading = ?4, last_position_time = ?5, updated_at = ?5 where vehicle_id = ?6'
    ).bind(b.lat || null, b.lng || null, b.speed || 0, b.heading || null, now, emp.vehicle_id).run();
  }
  return { ok: true };
}

async function startRoute(env, b) {
  await assertRouteOwnerIfToken(env, b);
  await env.DB.prepare('update routes set status = ?1, updated_at = ?2 where route_id = ?3').bind('In Progress', new Date().toISOString(), b.routeId).run();
  await logGPS(env, { RouteID: b.routeId, Latitude: b.lat, Longitude: b.lng, EventType: 'START_ROUTE' });
  await env.DB.prepare('insert into activity_logs (action, reference_id, description, user_name, timestamp) values (?1,?2,?3,?4,?5)')
    .bind('START_ROUTE', b.routeId, 'เริ่มรอบส่ง', b.user || '', new Date().toISOString()).run();
  return { ok: true };
}

async function proximity(env, m) {
  const green = Number(await settingValue(env.DB, 'PROXIMITY_GREEN_M', 100));
  const yellow = Number(await settingValue(env.DB, 'PROXIMITY_YELLOW_M', 500));
  m = Number(m) || 9999;
  return m <= green ? 'GREEN' : (m <= yellow ? 'YELLOW' : 'RED');
}

async function updateStop(env, routeId, stopOrder, patch) {
  const cols = Object.keys(patch);
  const setClause = cols.map((c, i) => `${c} = ?${i + 1}`).join(',');
  await env.DB.prepare(`update route_stops set ${setClause} where route_id = ?${cols.length + 1} and stop_order = ?${cols.length + 2}`)
    .bind(...cols.map((c) => patch[c]), routeId, stopOrder).run();
}

async function checkIn(env, b) {
  await assertRouteOwnerIfToken(env, b);
  await logGPS(env, { RouteID: b.routeId, DeliveryID: b.deliveryId, Latitude: b.lat, Longitude: b.lng, Accuracy: b.accuracy, EventType: 'CHECK_IN' });
  await updateStop(env, b.routeId, b.stopOrder, {
    check_in_latitude: b.lat, check_in_longitude: b.lng, check_in_accuracy: b.accuracy,
    check_in_time: new Date().toISOString(), status: 'Checked In',
  });
  return { proximity: await proximity(env, b.distanceMeters) };
}

async function completeDelivery(env, b) {
  await assertRouteOwnerIfToken(env, b);
  const patch = { delivery_completed_time: new Date().toISOString(), status: 'Completed' };
  if (b.photoUrl) patch.photo_url = b.photoUrl;
  await updateStop(env, b.routeId, b.stopOrder, patch);
  if (b.deliveryId) await env.DB.prepare('update deliveries set status = ?1, updated_at = ?2 where delivery_id = ?3').bind('Completed', new Date().toISOString(), b.deliveryId).run();
  await logGPS(env, { RouteID: b.routeId, DeliveryID: b.deliveryId, Latitude: b.lat, Longitude: b.lng, EventType: 'DELIVERY_COMPLETE' });
  await env.DB.prepare('insert into activity_logs (action, reference_id, description, user_name, timestamp) values (?1,?2,?3,?4,?5)')
    .bind('COMPLETE_DELIVERY', b.deliveryId || b.routeId, 'ส่งสินค้าเสร็จสิ้น', b.user || '', new Date().toISOString()).run();
  return { ok: true };
}

async function failDelivery(env, b) {
  await assertRouteOwnerIfToken(env, b);
  const patch = { status: 'Failed' };
  if (b.photoUrl) patch.photo_url = b.photoUrl;
  await updateStop(env, b.routeId, b.stopOrder, patch);
  if (b.deliveryId) await env.DB.prepare('update deliveries set status = ?1, note = ?2, updated_at = ?3 where delivery_id = ?4').bind('Failed', b.reason || '', new Date().toISOString(), b.deliveryId).run();
  await logGPS(env, { RouteID: b.routeId, DeliveryID: b.deliveryId, EventType: 'FAILED_DELIVERY' });
  await env.DB.prepare('insert into activity_logs (action, reference_id, description, user_name, timestamp) values (?1,?2,?3,?4,?5)')
    .bind('FAILED_DELIVERY', b.deliveryId || b.routeId, 'ส่งไม่สำเร็จ: ' + (b.reason || ''), b.user || '', new Date().toISOString()).run();
  return { ok: true };
}

module.exports = {
  hashPin, setDriverPin, driverLogin, driverSelect, driverLogout, getMyRoutes, getAvailableRoutes, claimRoute,
  startRoute, checkIn, completeDelivery, failDelivery, logGPS, driverPing,
};
