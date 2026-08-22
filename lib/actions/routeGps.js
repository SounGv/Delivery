const { normPlate, pickRouteTrack, metricsForTrack, isCartrackEvent } = require('../util/gps');

function rowToPoint(row) {
  return {
    RouteID: row.route_id,
    Latitude: row.latitude,
    Longitude: row.longitude,
    Timestamp: row.timestamp,
    EventType: row.event_type,
  };
}

async function routeGpsTimeBounds(DB, routeId, routeRow, linkedRows) {
  const { results: acts } = await DB.prepare(
    `select timestamp from activity_logs where reference_id = ?1 and action in ('START_ROUTE') order by timestamp asc limit 1`
  ).bind(routeId).all();
  let start = (acts && acts[0] && acts[0].timestamp) || routeRow.created_at || routeRow.delivery_date;
  let end = routeRow.status === 'Completed' ? (routeRow.updated_at || new Date().toISOString()) : new Date().toISOString();
  for (const row of linkedRows || []) {
    const t = row.timestamp;
    if (!t) continue;
    if (!start || new Date(t) < new Date(start)) start = t;
    if (!end || new Date(t) > new Date(end)) end = t;
  }
  if (routeRow.delivery_date) {
    const dayStart = routeRow.delivery_date + 'T00:00:00+07:00';
    const dayEnd = routeRow.delivery_date + 'T23:59:59+07:00';
    if (!start || new Date(start) < new Date(dayStart)) start = dayStart;
    if (new Date(end) > new Date(dayEnd) && routeRow.status !== 'In Progress') end = dayEnd;
  }
  return { start, end };
}

async function fetchCartrackPointsForRoute(DB, routeRow, linkedRows) {
  const plate = normPlate(routeRow.license_plate);
  if (!plate) return [];
  const { start, end } = await routeGpsTimeBounds(DB, routeRow.route_id, routeRow, linkedRows);
  const { results } = await DB.prepare(
    `select route_id, latitude, longitude, timestamp, event_type from gps_logs
     where event_type like 'CARTRACK:%' and timestamp >= ?1 and timestamp <= ?2
     order by timestamp asc`
  ).bind(start, end).all();
  return (results || []).filter((r) => normPlate(String(r.event_type || '').replace(/^CARTRACK:/, '')) === plate);
}

async function buildRouteGpsMetrics(DB, routeRow) {
  const routeId = routeRow.route_id;
  const { results: linked } = await DB.prepare(
    'select route_id, latitude, longitude, timestamp, event_type from gps_logs where route_id = ?1 order by timestamp asc'
  ).bind(routeId).all();
  const linkedPts = (linked || []).map(rowToPoint);
  const ctRows = await fetchCartrackPointsForRoute(DB, routeRow, linked || []);
  const ctPts = ctRows.map(rowToPoint);
  const picked = pickRouteTrack(
    { LicensePlate: routeRow.license_plate },
    linkedPts,
    ctPts
  );
  const m = metricsForTrack(picked.track, picked.source);
  return {
    track: picked.track,
    source: picked.source,
    distanceKm: m.distanceKm,
    durationMin: m.durationMin,
    startedAt: m.startedAt,
    endedAt: m.endedAt,
    pointCount: m.pointCount,
  };
}

async function attachGpsActualsToRoutes(DB, routesFe) {
  if (!routesFe.length) return routesFe;
  const ids = routesFe.map((r) => r.RouteID);
  const ph = ids.map((_, i) => `?${i + 1}`).join(',');
  const { results: routeRows } = await DB.prepare(
    `select route_id, license_plate, delivery_date, status, created_at, updated_at from routes where route_id in (${ph})`
  ).bind(...ids).all();
  const rowById = {};
  for (const row of routeRows || []) rowById[row.route_id] = row;

  for (const r of routesFe) {
    const row = rowById[r.RouteID];
    if (!row) continue;
    const g = await buildRouteGpsMetrics(DB, row);
    r.GpsDistanceKm = g.distanceKm;
    r.GpsDurationMin = g.durationMin;
    r.GpsStartedAt = g.startedAt;
    r.GpsEndedAt = g.endedAt;
    r.GpsPointCount = g.pointCount;
    r.GpsSource = g.source;
  }
  return routesFe;
}

module.exports = {
  buildRouteGpsMetrics, attachGpsActualsToRoutes, fetchCartrackPointsForRoute, routeGpsTimeBounds,
};
