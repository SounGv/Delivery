const { settingValue, getLiveVehicleStatus } = require('./reads');
const { normPlate } = require('../util/gps');

async function updateSettingValue(DB, key, value) {
  const existing = await DB.prepare('select key from settings where key = ?1').bind(key).first();
  const now = new Date().toISOString();
  if (existing) {
    await DB.prepare('update settings set value = ?1, updated_at = ?2 where key = ?3').bind(value, now, key).run();
  } else {
    await DB.prepare('insert into settings (key, value, group_name, label, updated_at) values (?1,?2,?3,?4,?5)').bind(key, value, 'cartrack', key, now).run();
  }
}

// Shared by the cron Worker (full sync, once a minute) and the frontend's
// light-poll POST action (position-only, skips GPSLogs/CartrackLogs bloat).
async function syncCartrack(env, b) {
  const DB = env.DB;
  const light = !!(b && b.light);
  const enabled = String(await settingValue(DB, 'CARTRACK_ENABLED', 'false')).toLowerCase() === 'true';
  if (!enabled) return { ok: false, skipped: true, message: 'CARTRACK_ENABLED = false' };

  const base = env.CARTRACK_BASE_URL || 'https://fleetapi-th.cartrack.com/rest';
  const user = env.CARTRACK_USERNAME;
  const token = env.CARTRACK_API_TOKEN;
  if (!user || !token) throw new Error('ยังไม่ได้ตั้งค่า Cartrack credentials (Worker/Pages secrets)');

  const url = base.replace(/\/+$/, '') + '/vehicles/status';
  const res = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json', Authorization: 'Basic ' + btoa(user + ':' + token) },
  });
  if (res.status === 401 || res.status === 403) throw new Error(`Cartrack auth ล้มเหลว (${res.status})`);
  if (res.status >= 400) throw new Error('Cartrack API error ' + res.status);

  const body = await res.json().catch(() => ({}));
  const list = body.data || body.vehicles || (Array.isArray(body) ? body : []);
  const now = new Date().toISOString();
  const { results: vehicles } = await DB.prepare('select * from vehicles').all();
  const { results: activeRoutes } = await DB.prepare(
    "select route_id, license_plate from routes where is_deleted = 0 and status = 'In Progress'"
  ).all();
  const routeByPlate = new Map();
  for (const r of activeRoutes || []) {
    const p = normPlate(r.license_plate);
    if (p) routeByPlate.set(p, r.route_id);
  }

  let matched = 0;
  const ctRows = [];
  const gpsRows = [];
  const vehicleUpdates = [];
  for (const v of list) {
    const reg = v.registration || v.vehicle_registration || v.plate || '';
    const lat = num(v.latitude || (v.location && v.location.latitude));
    const lng = num(v.longitude || (v.location && v.location.longitude));
    const spd = num(v.speed);
    const head = num(v.heading || v.bearing);
    const odo = num(v.odometer);
    const drv = v.driver_name || v.current_driver || '';
    const stat = v.status || v.ignition || '';
    const posT = v.event_ts || v.position_time || v.gps_time || now;
    const ctId = v.vehicle_id || v.id || reg;

    ctRows.push({
      cartrack_vehicle_id: ctId, registration: reg, latitude: lat, longitude: lng,
      speed: spd, heading: head, odometer: odo, current_driver: drv, vehicle_status: stat,
      last_position_time: posT, fetched_at: now,
    });

    const norm = (s) => String(s || '').replace(/[\s\-]/g, '').toUpperCase();
    const regN = norm(reg);
    const match = (vehicles || []).find((x) =>
      (x.cartrack_vehicle_id && String(x.cartrack_vehicle_id) === String(ctId)) ||
      (x.cartrack_registration && norm(x.cartrack_registration) === regN) ||
      (x.license_plate && norm(x.license_plate) === regN));
    if (match) {
      const vstat = Number(spd) > 3 ? 'In Use' : (stat ? 'Stopped' : 'Available');
      // Normalize Cartrack's "YYYY-MM-DD HH:mm:ss+07" so browsers parse age correctly.
      const posIso = normalizeTs(posT) || now;
      vehicleUpdates.push({
        vehicle_id: match.vehicle_id,
        ctId: String(ctId),
        reg,
        lat, lng, spd, head, odo,
        drv: drv || match.current_driver,
        posT: posIso,
        vstat,
      });
      matched++;
    }
    if (!light && lat && lng) {
      const posIso = normalizeTs(posT) || now;
      gpsRows.push({
        route_id: routeByPlate.get(regN) || null,
        latitude: lat, longitude: lng, timestamp: posIso,
        event_type: 'CARTRACK:' + (reg || '?'),
      });
    }
  }

  // wipe + reload the CartrackVehicles snapshot, plus every matched Vehicles
  // update, in one batch (atomic) — replaces the old Sheets deleteRows loop.
  const stmts = [DB.prepare('delete from cartrack_vehicles')];
  ctRows.forEach((r) => {
    stmts.push(DB.prepare(
      'insert into cartrack_vehicles (cartrack_vehicle_id, registration, latitude, longitude, speed, heading, odometer, current_driver, vehicle_status, last_position_time, fetched_at) values (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)'
    ).bind(r.cartrack_vehicle_id, r.registration, r.latitude, r.longitude, r.speed, r.heading, r.odometer, r.current_driver, r.vehicle_status, r.last_position_time, r.fetched_at));
  });
  vehicleUpdates.forEach((u) => {
    stmts.push(DB.prepare(
      'update vehicles set current_latitude=?1, current_longitude=?2, current_speed=?3, current_heading=?4, current_odometer=?5, current_driver=?6, last_position_time=?7, last_sync_at=?8, vehicle_status=?9, cartrack_vehicle_id=?10, cartrack_registration=?11 where vehicle_id=?12'
    ).bind(u.lat, u.lng, u.spd, u.head, u.odo, u.drv, u.posT, now, u.vstat, u.ctId, u.reg, u.vehicle_id));
  });
  gpsRows.forEach((g) => {
    stmts.push(DB.prepare('insert into gps_logs (route_id, latitude, longitude, timestamp, event_type) values (?1,?2,?3,?4,?5)')
      .bind(g.route_id, g.latitude, g.longitude, g.timestamp, g.event_type));
  });
  if (stmts.length > 1 || ctRows.length === 0) await DB.batch(stmts);

  await updateSettingValue(DB, 'CARTRACK_LAST_SYNC', now);
  if (!light) {
    await DB.prepare('insert into cartrack_logs (sync_at, fetched, matched, status, message) values (?1,?2,?3,?4,?5)')
      .bind(now, list.length, matched, 'OK', 'sync ok').run();
    await DB.prepare('insert into activity_logs (action, reference_id, description, user_name, timestamp) values (?1,?2,?3,?4,?5)')
      .bind('SYNC_CARTRACK', '-', `ซิงก์ Cartrack ${list.length} คัน · แมตช์ ${matched}`, 'system', now).run();
  }
  return { ok: true, fetched: list.length, matched, at: now, vehicles: await getLiveVehicleStatus(env) };
}

function num(x) { const n = Number(x); return isNaN(n) ? '' : n; }

function normalizeTs(t) {
  if (t == null || t === '') return '';
  const s = String(t).trim();
  if (!s) return '';
  // Already ISO-ish
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? s : d.toISOString();
  }
  // Cartrack: "2026-08-11 10:35:54+07" → ISO
  const m = s.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})([+-]\d{2})(:?\d{2})?$/);
  if (m) {
    const tz = m[3] + (m[4] ? (m[4].startsWith(':') ? m[4] : ':' + m[4]) : ':00');
    const d = new Date(`${m[1]}T${m[2]}${tz}`);
    return isNaN(d.getTime()) ? s : d.toISOString();
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? s : d.toISOString();
}

module.exports = { syncCartrack };
