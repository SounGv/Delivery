// Deletes existing August 2026 rows from the OFFLINE order-report sheet.
// Run dryRunDeleteAugustOfflineRows first, then deleteAugustOfflineRows for real.
// Run this AFTER dedupeOfflineOrders, so the count reflects the deduplicated sheet.
var OFFLINE_SHEET_NAME_DA = 'รายงานคำสั่งชื้อ ออฟไลน์';
var THAI_MONTH_MAP_DA = { 'ม.ค.': 1, 'ก.พ.': 2, 'มี.ค.': 3, 'เม.ย.': 4, 'พ.ค.': 5, 'มิ.ย.': 6, 'ก.ค.': 7, 'ส.ค.': 8, 'ก.ย.': 9, 'ต.ค.': 10, 'พ.ย.': 11, 'ธ.ค.': 12 };
function parseThaiYM_(s) {
if (!s) return null; if (Object.prototype.toString.call(s) === '[object Date]') return { year: s.getFullYear(), month: s.getMonth() + 1 };
var m = String(s).trim().match(/^(\d{1,2})\s+([ก-ฮ.]+)\s+(\d{4})/);
if (!m) return null;
var mon = THAI_MONTH_MAP_DA[m[2]];
if (!mon) return null;
return { year: Number(m[3]), month: mon };
}
function findAugustOfflineRows_() {
var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(OFFLINE_SHEET_NAME_DA);
if (!sheet) return null;
var values = sheet.getDataRange().getValues();
var header = values[0];
var tsIdx = header.indexOf('เวลาสั่งซื้อ');
var rowNumbers = [];
for (var i = 1; i < values.length; i++) {
var d = parseThaiYM_(values[i][tsIdx]);
if (d && d.year === 2026 && d.month === 8) rowNumbers.push(i + 1);
}
return { sheet: sheet, rowNumbers: rowNumbers, totalRows: values.length - 1 };
}
function dryRunDeleteAugustOfflineRows() {
var result = findAugustOfflineRows_();
if (!result) { Logger.log('Sheet not found: ' + OFFLINE_SHEET_NAME_DA); return; }
Logger.log('Total rows in sheet: ' + result.totalRows);
Logger.log('August 2026 rows that WOULD be deleted: ' + result.rowNumbers.length);
if (result.rowNumbers.length > 0) {
Logger.log('Row range: ' + Math.min.apply(null, result.rowNumbers) + ' to ' + Math.max.apply(null, result.rowNumbers));
}
Logger.log('DRY RUN ONLY. Run deleteAugustOfflineRows() to actually delete.');
}
function deleteAugustOfflineRows() {
var result = findAugustOfflineRows_();
if (!result) { Logger.log('Sheet not found: ' + OFFLINE_SHEET_NAME_DA); return; }
if (result.rowNumbers.length === 0) { Logger.log('No August rows found.'); return; }
var descending = result.rowNumbers.slice().sort(function (a, b) { return b - a; });
var ranges = [];
var i = 0;
while (i < descending.length) {
var rangeEnd = descending[i];
var rangeStart = rangeEnd;
var j = i + 1;
while (j < descending.length && descending[j] === rangeStart - 1) {
rangeStart = descending[j];
j++;
}
ranges.push({ start: rangeStart, count: rangeEnd - rangeStart + 1 });
i = j;
}
for (var k = 0; k < ranges.length; k++) {
result.sheet.deleteRows(ranges[k].start, ranges[k].count);
}
Logger.log('Deleted ' + result.rowNumbers.length + ' August rows in ' + ranges.length + ' batches. New last row: ' + result.sheet.getLastRow());
}
