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
var CACHE_VERSION_ = 'v18';
// Was 90s. The sheets this reads have grown a lot (55k+ row stock-move log, months
// of order-report history, ...) so a real cache-miss rebuild now takes ~80s — too
// close to a 90s TTL, meaning most real visits (more than 90s apart) paid that full
// rebuild cost. Raised to 6 minutes and paired with warmDashboardCache_ (see below)
// on a 5-minute time trigger (Apps Script only allows 1/5/10/15/30), so the cache
// always gets refreshed with a full extra minute of slack before it could expire.
// Now 12 minutes, paired with a 10-minute trigger that only runs 07:00-22:00 (see
// warmDashboardCache_): this script is owned by a consumer Google account, whose
// triggers get ~90 min/day of runtime, and a 5-minute trigger over all four parts
// would use ~6.8 h/day.
var CACHE_TTL_SECONDS_ = 720;
// Stay safely under CacheService's ~100KB-per-key limit when splitting the payload.
var CACHE_CHUNK_SIZE_ = 90000;

/**
 * The payload is served in independently cached parts so a page only pays
 * for the data it shows (the single 6 MB payload made every page wait on the
 * 55k-row stock-move log and the returns DB; the DB_RETURN_CURRENT part was removed
 * once the returns page followed the gv-returns-sync count instead):
 *   ?path=core            production, sales, store report, issues, ...   (the light part)
 *   ?path=workPerformance BigSeller work performance + stock-move log
 *   ?path=cancelled       cancelled-order scan log   (gv-returns-sync workbook)
 *   ?path=focus           "งานค้าง": the 6 backlog queues (gv-returns-sync, tab โฟกัสทีม-งานค้าง)
 *   ?path=restock         "สินค้าตีกลับ" as gv-returns-sync counts it (tab cn-restock)
 * Each part has its own cache key, so a slow heavy part never delays the core.
 *
 * ?path=dashboard is the legacy single payload (all four parts merged) kept only
 * so a web build that predates the split keeps working; drop it once no deployed
 * web build calls it.
 */
var PAYLOAD_PARTS_ = {
  core: 'core',
  workPerformance: 'workPerformance',
  cancelled: 'cancelled',
  focus: 'focus',
  restock: 'restock'
};

/** One part's payload: from cache, else built (and cached, best-effort). */
function payloadPart_(part) {
  var cached = null;
  try { cached = cachedDashboardPayload_(part); } catch (cacheReadErr) { cached = null; }
  if (cached) return cached;
  var built = buildDashboardPayload_(part);
  try { setCachedDashboardPayload_(part, built); } catch (cacheWriteErr) { /* caching is best-effort */ }
  return built;
}

function cachedDashboardPayload_(part) {
  var cache = CacheService.getScriptCache();
  var prefix = CACHE_VERSION_ + '_' + part;
  var metaRaw = cache.get(prefix + '_meta');
  if (!metaRaw) return null;
  var meta;
  try { meta = JSON.parse(metaRaw); } catch (e) { return null; }
  var parts = [];
  for (var i = 0; i < meta.chunks; i++) {
    var chunk = cache.get(prefix + '_' + i);
    if (chunk === null) return null; // a chunk expired/was evicted — treat as a full miss
    parts.push(chunk);
  }
  try {
    return JSON.parse(parts.join(''));
  } catch (e2) {
    return null;
  }
}

function setCachedDashboardPayload_(part, payload) {
  var json = JSON.stringify(payload);
  var cache = CacheService.getScriptCache();
  var prefix = CACHE_VERSION_ + '_' + part;
  var puts = {};
  var chunkCount = 0;
  for (var i = 0; i < json.length; i += CACHE_CHUNK_SIZE_) {
    puts[prefix + '_' + chunkCount] = json.slice(i, i + CACHE_CHUNK_SIZE_);
    chunkCount++;
  }
  puts[prefix + '_meta'] = JSON.stringify({ chunks: chunkCount });
  cache.putAll(puts, CACHE_TTL_SECONDS_);
}

// Parts the warming trigger keeps fresh. workPerformance is left out on purpose: no
// web page requests it any more and it is the slowest part (~48 s to rebuild), which
// alone would push the trigger past the daily runtime quota. It is still built on
// demand by doGet when something asks for it.
var WARMED_PARTS_ = ['core', 'cancelled', 'focus', 'restock'];
var WARM_FROM_HOUR_ = 7;  // Asia/Bangkok, inclusive
var WARM_TO_HOUR_ = 22;   // Asia/Bangkok, exclusive

/**
 * Rebuilds the warmed payload parts and refreshes their cache proactively, so real
 * visitors (almost) never land on a cold cache and pay the rebuild cost
 * themselves. Wired to a time-driven trigger — see installCacheWarmingTrigger_
 * below; run that ONCE from the editor (Run button), not on every deploy.
 * One part failing does not stop the others.
 */
function warmDashboardCache_() {
  // Nobody enters data or looks at the dashboard overnight; skipping those runs keeps
  // the trigger inside its daily runtime quota (~52 min/day at 10-minute spacing).
  var hour = Number(Utilities.formatDate(new Date(), 'Asia/Bangkok', 'H'));
  if (hour < WARM_FROM_HOUR_ || hour >= WARM_TO_HOUR_) return;
  WARMED_PARTS_.forEach(function (path) {
    try {
      var part = PAYLOAD_PARTS_[path];
      setCachedDashboardPayload_(part, buildDashboardPayload_(part));
    } catch (err) {
      Logger.log('warm ' + path + ' failed: ' + err);
    }
  });
}

/**
 * One-time setup: run this once from the Apps Script editor (select it in the
 * function dropdown, click Run) to install a trigger that calls
 * warmDashboardCache_ every 10 minutes (Apps Script only allows 1/5/10/15/30) —
 * inside the 12-minute CACHE_TTL_SECONDS_ window, so the cache does not expire
 * between runs in working hours. Safe to re-run: it removes any existing
 * warmDashboardCache_ trigger first, so it never creates duplicates.
 */
function installCacheWarmingTrigger_() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'warmDashboardCache_') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('warmDashboardCache_').timeBased().everyMinutes(10).create();
}

/**
 * Same as installCacheWarmingTrigger_, under a name the editor's Run menu will
 * list: that menu hides every function whose name ends in an underscore, so the
 * private version above cannot be picked there. Pick THIS one to install the
 * trigger.
 */
function installCacheWarmingTrigger() {
  installCacheWarmingTrigger_();
}

function doGet(e) {
  var path = (e && e.parameter && e.parameter.path) || 'dashboard';
  var output;
  try {
    if (path === 'dashboard') {
      output = payloadPart_('core');
      ['workPerformance', 'cancelled'].forEach(function (name) {
        var extra = payloadPart_(name);
        Object.keys(extra).forEach(function (k) {
          if (k !== 'generatedAt' && k !== 'todayDate') output[k] = extra[k];
        });
      });
    } else if (PAYLOAD_PARTS_[path]) {
      output = payloadPart_(PAYLOAD_PARTS_[path]);
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
