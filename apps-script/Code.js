/**
 * Web app entry point. Deploy this container-bound script (Extensions > Apps
 * Script from inside the target Google Sheet) as a Web App:
 *   Execute as: Me
 *   Who has access: Anyone
 *
 * GET {deployedUrl}?path=dashboard -> JSON payload for the dashboard page.
 *
 * No response caching here on purpose: CacheService's cache is shared at the
 * script-project level across ALL deployments (old and new), so if more than
 * one deployment URL is ever live at once, one can silently serve a cached
 * response computed by the other's (possibly older) code. Always recomputing
 * from the sheet avoids that cross-deployment staleness entirely.
 */

function doGet(e) {
  var path = (e && e.parameter && e.parameter.path) || 'dashboard';
  var output;
  try {
    if (path === 'dashboard') {
      output = buildDashboardPayload_();
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
