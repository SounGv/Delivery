/**
 * Web app entry point. Deploy this container-bound script (Extensions > Apps
 * Script from inside the target Google Sheet) as a Web App:
 *   Execute as: Me
 *   Who has access: Anyone
 *
 * GET {deployedUrl}?path=dashboard -> JSON payload for the dashboard page.
 *
 * Short-TTL response cache: buildDashboardPayload_() re-reads every sheet in the
 * spreadsheet, which gets slower as the sheet grows (large tabs can push a single
 * call to tens of seconds). Caching the computed JSON for a short window means a
 * dashboard refresh (or a second person opening it) within that window is instant
 * instead of re-paying that cost.
 *
 * CacheService is shared at the script-project level across ALL deployments (old
 * and new) — the risk called out in the comment this replaces was that an old
 * deployment could silently serve a newer deployment's cached response (or vice
 * versa) if their payload shapes ever diverged. CACHE_VERSION_ fixes that: bump it
 * whenever the payload SHAPE changes (new/renamed top-level fields) so an old
 * deployment's cache entry is simply invisible to a new one (different key), never
 * misread as if it matched. Ordinary data changes (new rows in the sheet) don't need
 * a bump — they're only ever CACHE_TTL_SECONDS_ stale at most, an explicit and small
 * trade for going from tens-of-seconds to near-instant on every repeat load.
 */
var CACHE_VERSION_ = 'v1';
var CACHE_TTL_SECONDS_ = 90;
// Stay safely under CacheService's ~100KB-per-key limit when splitting the payload.
var CACHE_CHUNK_SIZE_ = 90000;

function cachedDashboardPayload_() {
  var cache = CacheService.getScriptCache();
  var metaRaw = cache.get(CACHE_VERSION_ + '_dash_meta');
  if (!metaRaw) return null;
  var meta;
  try { meta = JSON.parse(metaRaw); } catch (e) { return null; }
  var parts = [];
  for (var i = 0; i < meta.chunks; i++) {
    var part = cache.get(CACHE_VERSION_ + '_dash_' + i);
    if (part === null) return null; // a chunk expired/was evicted — treat as a full miss
    parts.push(part);
  }
  try {
    return JSON.parse(parts.join(''));
  } catch (e2) {
    return null;
  }
}

function setCachedDashboardPayload_(payload) {
  var json = JSON.stringify(payload);
  var cache = CacheService.getScriptCache();
  var puts = {};
  var chunkCount = 0;
  for (var i = 0; i < json.length; i += CACHE_CHUNK_SIZE_) {
    puts[CACHE_VERSION_ + '_dash_' + chunkCount] = json.slice(i, i + CACHE_CHUNK_SIZE_);
    chunkCount++;
  }
  puts[CACHE_VERSION_ + '_dash_meta'] = JSON.stringify({ chunks: chunkCount });
  cache.putAll(puts, CACHE_TTL_SECONDS_);
}

function doGet(e) {
  var path = (e && e.parameter && e.parameter.path) || 'dashboard';
  var output;
  try {
    if (path === 'dashboard') {
      var cached = null;
      try { cached = cachedDashboardPayload_(); } catch (cacheReadErr) { cached = null; }
      if (cached) {
        output = cached;
      } else {
        output = buildDashboardPayload_();
        try { setCachedDashboardPayload_(output); } catch (cacheWriteErr) { /* caching is best-effort */ }
      }
    } else {
      output = { error: 'Unknown path: ' + path };
    }
  } catch (err) {
    output = { error: err && err.message ? err.message : String(err) };
  }
  return ContentService
    .createTextOutput(JSON.stringify(output))
    .setMimeType(ContentService.MimeType.JSON);
}
