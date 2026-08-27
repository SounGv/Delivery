// Single catch-all route mirroring the old Apps Script doGet/doPost — same
// ?action=X GET / {action:X,...} POST contract, same {ok:true,data}/
// {ok:false,error} response shape, so app.js's API.get/API.post need no
// changes beyond the base URL. Cloudflare Pages Functions route this file
// at /api/gas via onRequestGet/onRequestPost (the ESM export convention
// the Functions runtime looks for); it freely requires() the CommonJS
// lib/ modules below — esbuild (wrangler's bundler) resolves that at
// deploy time into one bundle, same as it would for a Node build.
const reads = require('../../lib/actions/reads');
const writes = require('../../lib/actions/writes');
const driver = require('../../lib/actions/driver');
const pod = require('../../lib/actions/pod');
const trcloud = require('../../lib/actions/trcloud');

// Temporary — lets me inspect the real shape of TRCloud's SO search response
// before writing the actual field-mapping/import logic. Remove once that's
// built and verified.
async function debugTrcloudSearch(env, p) {
  return trcloud.searchOrders(env, { dateFrom: p.dateFrom, dateTo: p.dateTo, status: p.status, limit: p.limit, companyFormat: p.companyFormat });
}
async function debugTrcloudRead(env, p) {
  return trcloud.readOrder(env, p.id);
}

// The Cartrack username/token secrets live only on the separate
// cartrack-sync-worker (never on this Pages project), so the frontend's
// manual "Sync" button proxies over to it via a plain fetch instead of
// running lib/actions/cartrack.js's syncCartrack directly here — that
// avoids asking for the same credentials a second time.
async function syncCartrackViaWorker(env, b) {
  const base = env.CARTRACK_SYNC_WORKER_URL;
  if (!base) throw new Error('CARTRACK_SYNC_WORKER_URL ยังไม่ได้ตั้งค่า (Pages environment variable)');
  const url = b && b.light ? `${base}/?light=1` : base;
  const res = await fetch(url);
  const body = await res.json();
  if (!body.ok) throw new Error(body.error || 'sync ล้มเหลว');
  return body.data;
}

const GET_ACTIONS = {
  getBootstrap: reads.getBootstrap,
  getDashboardData: reads.getDashboardData,
  getDeliveries: reads.getDeliveries,
  searchDeliveries: reads.searchDeliveries,
  getRoutes: reads.getRoutes,
  getRouteStops: reads.getRouteStops,
  getRouteGpsTrack: reads.getRouteGpsTrack,
  getCustomers: reads.getCustomers,
  getEmployees: reads.getEmployees,
  getVehicles: reads.getVehicles,
  getExternalProviders: reads.getExternalProviders,
  getExternalVehicles: reads.getExternalVehicles,
  getCartrackVehicles: reads.getCartrackVehicles,
  getLiveVehicleStatus: reads.getLiveVehicleStatus,
  getExpenses: reads.getExpenses,
  getClaims: reads.getClaims,
  getRouteCosts: reads.getRouteCosts,
  getReports: reads.getReports,
  getSettings: reads.getSettings,
  getRealtime: reads.getRealtime,
  getCartrackStatus: reads.getCartrackStatus,
  getTrcloudStatus: (env) => trcloud.getTrcloudStatus(env),
  getSaleOrderPrint: (env, p) => trcloud.getSaleOrderPrint(env, p),
  getSaleOrdersPrint: (env, p) => trcloud.getSaleOrdersPrint(env, p),
  geocode: reads.geocode,
  ping: async () => reads.ping(),
  debugTrcloudSearch, debugTrcloudRead,
  debugTrcloudUpdateProbe: (env, p) => require('../../lib/actions/trcloud').debugUpdateProbe(env, p),
  debugTrcloudIvSearch: (env, p) => require('../../lib/actions/trcloud').searchInvoices(env, {
    dateFrom: p.dateFrom, dateTo: p.dateTo, limit: p.limit, companyFormat: p.companyFormat, keyword: p.keyword,
  }),
};

const POST_ACTIONS = {
  createDelivery: writes.createDelivery, updateDelivery: writes.updateDelivery, deleteDelivery: writes.deleteDelivery,
  bulkImportDeliveries: writes.bulkImportDeliveries,
  createCustomer: writes.createCustomer, updateCustomer: writes.updateCustomer,
  createEmployee: writes.createEmployee, updateEmployee: writes.updateEmployee,
  bulkImportCustomers: writes.bulkImportCustomers, bulkImportEmployees: writes.bulkImportEmployees,
  createRoute: writes.createRoute, createExternalRoute: writes.createExternalRoute,
  updateRoute: writes.updateRoute, updateRouteStop: writes.updateRouteStop, confirmRoute: writes.confirmRoute,
  createVehicle: writes.createVehicle, updateVehicle: writes.updateVehicle,
  createExternalVehicle: writes.createExternalVehicle, updateExternalVehicle: writes.updateExternalVehicle,
  createExpense: writes.createExpense, updateExpense: writes.updateExpense,
  createClaim: writes.createClaim, updateClaim: writes.updateClaim,
  updateSetting: writes.updateSetting,
  syncCartrack: syncCartrackViaWorker,
  syncTrcloudOrders: (env, b) => trcloud.syncOrders(env, Object.assign({}, b, b.data || {})),
  importTrcloudOrder: (env, b) => trcloud.importById(env, b.id || (b.data && b.data.id), { user: b.user || 'trcloud' }),
  pushTrcloudDelivered: (env, b) => trcloud.pushDeliveryCompleted(env, b.id || b.deliveryId || (b.data && (b.data.id || b.data.deliveryId))),
  logGPS: (env, b) => driver.logGPS(env, b.data || {}),
  driverPing: driver.driverPing,
  startRoute: driver.startRoute, checkIn: driver.checkIn,
  completeDelivery: driver.completeDelivery, failDelivery: driver.failDelivery,
  uploadPOD: pod.uploadPOD,
  setDriverPin: driver.setDriverPin, driverLogin: driver.driverLogin, driverSelect: driver.driverSelect, driverLogout: driver.driverLogout,
  getMyRoutes: driver.getMyRoutes, getAvailableRoutes: driver.getAvailableRoutes, claimRoute: driver.claimRoute,
};

// Same as Code.gs's NO_CACHE_BUST — kept only so the action list documents
// the same intent as the original; there is no bootstrap cache in this
// backend (D1 is already sub-second), so it is presently a no-op.
const NO_CACHE_BUST = { checkIn: 1, logGPS: 1, driverPing: 1, driverLogin: 1, driverSelect: 1, driverLogout: 1, getMyRoutes: 1 };

function json(obj) {
  return new Response(JSON.stringify(obj), { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const action = url.searchParams.get('action') || 'getDashboardData';
  const fn = GET_ACTIONS[action];
  if (!fn) return json({ ok: false, error: 'unknown action: ' + action });
  const params = Object.fromEntries(url.searchParams.entries());
  try {
    const data = await fn(context.env, params);
    return json({ ok: true, data });
  } catch (err) {
    return json({ ok: false, error: String((err && err.message) || err) });
  }
}

export async function onRequestPost(context) {
  // Frontend posts as text/plain (Apps Script CORS habit) — json() usually
  // still works, but fall back to text()+JSON.parse so actions like
  // driverSelect never surface as "unknown action" from an empty body.
  let body = {};
  try {
    body = await context.request.json();
  } catch (e) {
    try { body = JSON.parse(await context.request.text()); } catch (_) { body = {}; }
  }
  const action = body.action;
  const reqId = body.requestId || null;
  const DB = context.env.DB;

  if (reqId) {
    const cached = await DB.prepare('select response from request_log where request_id = ?1').bind(reqId).first();
    if (cached) return json(JSON.parse(cached.response));
  }

  const fn = POST_ACTIONS[action];
  if (!fn) return json({ ok: false, error: 'unknown action: ' + action });

  try {
    const out = await fn(context.env, body);
    const result = { ok: true, data: out };
    if (reqId && !NO_CACHE_BUST[action]) {
      await DB.prepare('insert into request_log (request_id, action, response, created_at) values (?1,?2,?3,?4)')
        .bind(reqId, action, JSON.stringify(result), new Date().toISOString()).run().catch(() => {});
    }
    return json(result);
  } catch (err) {
    return json({ ok: false, error: String((err && err.message) || err) });
  }
}
