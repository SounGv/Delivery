/** Haversine distance in km between two WGS84 points. */
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const x = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function normPlate(s) {
  return String(s || '').replace(/[\s\-]/g, '').toUpperCase();
}

function tsOf(p) {
  return p.Timestamp || p.timestamp || '';
}

function eventOf(p) {
  return p.EventType || p.event_type || '';
}

function coordOf(p) {
  return { lat: +p.Latitude, lng: +p.Longitude };
}

function isCartrackEvent(ev) {
  return String(ev || '').startsWith('CARTRACK:');
}

function cartrackRegFromEvent(ev) {
  const m = String(ev || '').match(/^CARTRACK:(.+)$/);
  return m ? normPlate(m[1]) : '';
}

function byTime(a, b) {
  return new Date(tsOf(a)) - new Date(tsOf(b));
}

/** Dedupe GPS rows — Cartrack sync ~1 นาที/ครั้ง */
function dedupeTrackPoints(points) {
  const out = [];
  for (const p of (points || []).slice().sort(byTime)) {
    const t = tsOf(p);
    if (!t || !Number.isFinite(+p.Latitude) || !Number.isFinite(+p.Longitude)) continue;
    const last = out[out.length - 1];
    if (last && tsOf(last) === t) continue;
    if (last) {
      const dtSec = (new Date(t) - new Date(tsOf(last))) / 1000;
      const leg = haversine(+last.Latitude, +last.Longitude, +p.Latitude, +p.Longitude);
      if (dtSec < 15 && leg * 1000 < 20) continue;
    }
    out.push(p);
  }
  return out;
}

/**
 * เลือก track สำหรับคำนวณระยะทาง — ให้ Cartrack มาก่อน (GPS ติดรถ แม่นกว่ามือถือ)
 */
function pickRouteTrack(route, linkedPoints, cartrackPoints) {
  const plate = normPlate(route && (route.LicensePlate || route.license_plate));
  const linked = linkedPoints || [];
  const linkedCt = linked.filter((p) => isCartrackEvent(eventOf(p)));
  const linkedDrv = linked.filter((p) => !isCartrackEvent(eventOf(p)));
  let orphanCt = (cartrackPoints || []).slice();
  if (plate) {
    orphanCt = orphanCt.filter((p) => cartrackRegFromEvent(eventOf(p)) === plate);
  }
  const allCt = dedupeTrackPoints([...linkedCt, ...orphanCt]);
  if (allCt.length >= 2) {
    return { track: allCt, source: 'cartrack' };
  }
  const drv = dedupeTrackPoints(linkedDrv);
  if (drv.length >= 2) {
    return { track: drv, source: 'driver' };
  }
  const mixed = dedupeTrackPoints([...allCt, ...drv]);
  return { track: mixed, source: mixed.length ? 'mixed' : 'none' };
}

/**
 * Sum driven distance from a GPS track (gps_logs rows).
 * Filters obvious GPS glitches and duplicate stationary pings.
 */
function routeMetricsFromGps(points, opts) {
  opts = opts || {};
  const maxJumpKm = opts.maxJumpKm ?? 2;
  const minDtSec = opts.minDtSec ?? (opts.cartrack ? 45 : 20);
  const minMoveM = opts.minMoveM ?? (opts.cartrack ? 15 : 25);

  const pts = (points || [])
    .map(p => ({ ...p, ...coordOf(p), t: tsOf(p) }))
    .filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng) && p.t)
    .sort((a, b) => new Date(a.t) - new Date(b.t));

  if (!pts.length) {
    return { distanceKm: 0, durationMin: 0, pointCount: 0, startedAt: null, endedAt: null };
  }
  if (pts.length === 1) {
    return { distanceKm: 0, durationMin: 0, pointCount: 1, startedAt: pts[0].t, endedAt: pts[0].t };
  }

  let dist = 0;
  let prev = pts[0];
  for (let i = 1; i < pts.length; i++) {
    const cur = pts[i];
    const leg = haversine(prev.lat, prev.lng, cur.lat, cur.lng);
    const dtSec = (new Date(cur.t) - new Date(prev.t)) / 1000;
    if (leg > maxJumpKm && dtSec < 60) continue;
    if (leg * 1000 < minMoveM && dtSec < minDtSec) continue;
    dist += leg;
    prev = cur;
  }

  const startedAt = pts[0].t;
  const endedAt = pts[pts.length - 1].t;
  const durationMin = Math.max(0, Math.round((new Date(endedAt) - new Date(startedAt)) / 60000));

  return {
    distanceKm: +dist.toFixed(1),
    durationMin,
    pointCount: pts.length,
    startedAt,
    endedAt,
  };
}

function metricsForTrack(track, source) {
  const cartrack = source === 'cartrack' || (source === 'mixed' && (track || []).some((p) => isCartrackEvent(eventOf(p))));
  return routeMetricsFromGps(track, { cartrack });
}

module.exports = {
  haversine, normPlate, isCartrackEvent, cartrackRegFromEvent,
  pickRouteTrack, dedupeTrackPoints, routeMetricsFromGps, metricsForTrack,
};
