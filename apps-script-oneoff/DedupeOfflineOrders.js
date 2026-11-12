/**
 * One-off cleanup for "รายงานคำสั่งซื้อ ออฟไลน์" — the sheet has ~4,700 exact-
 * duplicate rows (same platform/store/SKU/qty/amount/timestamp repeated, up to
 * 43x for a single row), almost certainly from the same paste landing more
 * than once. This inflates every sales/order total computed from this sheet.
 *
 * HOW TO RUN (Apps Script editor, this spreadsheet's bound script):
 *   1. Select `dryRunDedupeOfflineOrders` in the function dropdown, click Run.
 *      Nothing is deleted — check View > Logs (Ctrl+Enter) for the counts.
 *   2. Only once those numbers look right, select `dedupeOfflineOrders` and
 *      run that instead. It deletes the exact same rows the dry run found.
 *
 * Rule: for each set of rows with identical values in every column, keep the
 * FIRST occurrence (top-to-bottom) and delete the rest.
 */
var OFFLINE_ORDERS_SHEET_NAME = 'รายงานคำสั่งซื้อ ออฟไลน์';

/** Scans the sheet and returns which 1-based row numbers are duplicates
 * (i.e. NOT the first occurrence of their exact content), without changing
 * anything. */
function findDuplicateRowIndexes_(sheet) {
  var values = sheet.getDataRange().getValues();
  var seen = {};
  var duplicateRowIndexes = []; // 1-based sheet row numbers (header excluded)
  var uniqueRows = 0;

  for (var r = 1; r < values.length; r++) { // row 0 is the header
    var row = values[r];
    var isBlank = row.every(function (v) { return v === '' || v === null || v === undefined; });
    if (isBlank) continue;

    var sig = row
      .map(function (v) {
        if (Object.prototype.toString.call(v) === '[object Date]') return 'D' + v.getTime();
        return String(v);
      })
      .join('');

    if (seen[sig]) {
      duplicateRowIndexes.push(r + 1);
    } else {
      seen[sig] = true;
      uniqueRows++;
    }
  }

  return { duplicateRowIndexes: duplicateRowIndexes, uniqueRows: uniqueRows, totalDataRows: values.length - 1 };
}

/** Groups a descending-sorted list of row numbers into contiguous [start, count]
 * ranges so deletion can use bulk `deleteRows` instead of thousands of single
 * `deleteRow` calls (which risks the 6-minute Apps Script execution limit). */
function toContiguousRangesDesc_(sortedDesc) {
  var ranges = [];
  var i = 0;
  while (i < sortedDesc.length) {
    var rangeEnd = sortedDesc[i];
    var rangeStart = rangeEnd;
    var j = i + 1;
    while (j < sortedDesc.length && sortedDesc[j] === rangeStart - 1) {
      rangeStart = sortedDesc[j];
      j++;
    }
    ranges.push({ start: rangeStart, count: rangeEnd - rangeStart + 1 });
    i = j;
  }
  return ranges;
}

function dryRunDedupeOfflineOrders() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(OFFLINE_ORDERS_SHEET_NAME);
  if (!sheet) { Logger.log('Sheet not found: ' + OFFLINE_ORDERS_SHEET_NAME); return; }

  var result = findDuplicateRowIndexes_(sheet);
  Logger.log('Total data rows (excluding header): ' + result.totalDataRows);
  Logger.log('Unique rows that will be KEPT: ' + result.uniqueRows);
  Logger.log('Duplicate rows that WOULD be deleted: ' + result.duplicateRowIndexes.length);
  Logger.log(
    'First 20 sheet row numbers that would be deleted: ' +
      result.duplicateRowIndexes.slice(0, 20).join(', ')
  );
  Logger.log('DRY RUN ONLY — no changes made. Run dedupeOfflineOrders() to actually delete these rows.');
}

function dedupeOfflineOrders() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(OFFLINE_ORDERS_SHEET_NAME);
  if (!sheet) { Logger.log('Sheet not found: ' + OFFLINE_ORDERS_SHEET_NAME); return; }

  var result = findDuplicateRowIndexes_(sheet);
  if (result.duplicateRowIndexes.length === 0) {
    Logger.log('No duplicates found — nothing to do.');
    return;
  }

  // Delete from the bottom up, in contiguous batches, so earlier row numbers
  // stay valid as rows shift and the whole run stays well under the time limit.
  var descending = result.duplicateRowIndexes.slice().sort(function (a, b) { return b - a; });
  var ranges = toContiguousRangesDesc_(descending);
  for (var i = 0; i < ranges.length; i++) {
    sheet.deleteRows(ranges[i].start, ranges[i].count);
  }

  Logger.log(
    'Deleted ' + result.duplicateRowIndexes.length + ' duplicate rows in ' + ranges.length +
      ' batch(es). ' + result.uniqueRows + ' unique rows remain.'
  );
}
