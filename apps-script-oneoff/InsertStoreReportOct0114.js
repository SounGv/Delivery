var OCT_STORE_PERIOD_START_ = '01 ต.ค. 2026';
var OCT_STORE_PERIOD_END_ = '14 ต.ค. 2026';

// BigSeller "รายงานร้านค้า" export, 01-14 ต.ค. 2026 (pulled 24 ต.ค. 2026), in the page's own column order.
var OCT_STORE_FIELDS_ = [
  'ชื่อเล่นร้านค้าใน BigSeller', 'ยอดขายของคำสั่งซื้อที่มีผล', 'คำสั่งซื้อที่มีผล', 'รายได้รวม', 'เงินอุดหนุนจากผู้ขาย',
  'ยอดขายสินค้า', 'ราคาสินค้าเดิม', 'ยอดขาย', 'คำสั่งซื้อทั้งหมด', 'จำนวนพัสดุ', 'ลูกค้า', 'จำนวนเงินคืน',
  'คำสั่งซื้อที่คืนเงิน', 'ลูกค้าที่คืนเงิน', 'ยอดขายเฉลี่ยต่อลูกค้า', 'คำสั่งซื้อที่ยกเลิก', 'ยอดเงินคำสั่งซื้อที่ยกเลิก'
];

var OCT_STORE_ROWS_ = [
  'Manual Orders|0.00|0|0.00|0.00|63920.76|0.00|63920.76|4|4|4|0.00|0|0|15980.19|4|63920.76',
  'Shopee Philips|105281.00|684|162521.00|141595.00|109134.00|229820.00|110279.00|722|722|710|2071.00|9|9|155.32|38|4998.00',
  'Lazada Philips|9695.79|105|15678.09|12015.75|10151.47|12779.00|10528.13|119|119|114|0.00|0|0|92.35|14|832.34',
  'Shopee GV|831452.00|2104|1275980.00|1217353.00|950774.00|1456311.00|963297.00|2342|2342|2262|3295.00|21|21|425.86|238|131845.00',
  'Shopee Ugreen|6253929.00|13155|9922353.00|9551792.00|6894769.00|20415800.00|6945206.00|14485|14485|13816|59815.00|120|120|502.69|1330|691277.00',
  'Shopee Fantech|3550602.00|5888|5683371.00|5502120.00|4073693.00|11799187.00|4105016.00|6715|6715|6294|38883.00|71|71|652.21|827|554414.00',
  'Lazada GV|96249.70|269|126564.31|119942.25|100997.16|129023.00|104492.10|288|288|282|0.00|0|0|370.54|19|8242.40',
  'Lazada Fantech|271648.60|358|427232.33|414907.05|323779.63|442972.00|328421.35|435|435|411|0.00|0|0|799.08|77|56772.75',
  'Lazada Ugreen|561099.98|1306|1055267.66|1023944.21|901020.87|1077178.00|922551.42|1465|1467|1405|3300.76|9|9|656.62|159|361451.44',
  'Tiktok Fantech|2883446.23|5233|4360805.99|4129675.99|3401904.24|7127202.00|3430224.38|6204|6204|6041|17663.88|28|28|567.82|971|546778.15',
  'Tiktok Ugreen|1416183.75|6909|2102737.98|1826246.98|1585248.54|2560705.00|1600360.77|7703|7703|7535|8984.88|43|43|212.39|794|184177.02',
  'Tiktok Boya เปลี่ยนมาจาก GV|228.00|2|295.00|228.00|228.00|228.00|228.00|2|2|2|0.00|0|0|114.00|0|0.00',
  'Shopee UgreenGV+|2041828.00|4897|3253794.00|3113310.00|2312113.00|6029336.00|2332904.00|5391|5391|5211|19728.00|53|53|447.69|494|291076.00',
  'Lazada Boya|890.00|1|919.00|890.00|890.00|890.00|890.00|1|1|1|0.00|0|0|890.00|0|0.00',
  'Shopee Boya|24467.00|23|34202.00|33505.00|25488.00|36708.00|25536.00|24|24|24|1516.00|2|2|1064.00|1|1069.00',
  'Shopee Fantech Plus|202924.00|318|323047.00|314131.00|245888.00|664982.00|248431.00|387|387|371|2019.00|3|3|669.63|69|45507.00',
  'รับหน้าร้าน|243357.00|66|0.00|0.00|250296.74|0.00|249805.74|67|67|54|23580.00|1|1|4626.03|1|6448.74',
  'LockStock|78620.00|16|0.00|0.00|7113879.43|0.00|7113879.43|142|142|58|0.00|0|0|122653.09|126|7035259.43',
  'Marketing|150.00|11|0.00|0.00|150.00|0.00|150.00|11|11|11|0.00|0|0|13.64|0|0.00',
  'SPX Express|241560.00|120|0.00|0.00|248548.14|0.00|250018.14|124|124|104|1280.00|1|1|2404.02|4|8458.14',
  'GV ส่งเอง|2665794.06|102|0.00|0.00|2669893.86|0.00|2669167.86|104|104|80|0.00|0|0|33364.60|2|3373.80',
  'JIB|380923.21|13|0.00|0.00|381673.21|0.00|381673.21|14|14|6|0.00|0|0|63612.20|1|750.00',
  'ADVICE|2160162.00|67|0.00|0.00|2161512.00|0.00|2161512.00|68|68|10|0.00|0|0|216151.20|1|1350.00',
  'IT CITY|933583.28|54|0.00|0.00|1055389.17|0.00|1055389.17|62|62|12|0.00|0|0|87949.10|8|121805.89',
  'COM 7|2459375.00|65|0.00|0.00|2716895.00|0.00|2716895.00|68|68|5|28600.00|1|1|543379.00|3|257520.00',
  'Tiktok Philips|70.00|1|276.00|140.00|134.40|140.00|144.40|2|2|2|0.00|0|0|72.20|1|74.40',
  'สินค้าเคลม (GV)|400.00|45|0.00|0.00|441.00|0.00|441.00|48|48|9|0.00|0|0|49.00|3|41.00',
  'Shopee UGREEN NASync Thailand|61869.00|8|113699.00|113455.00|93041.00|194486.00|93131.00|10|10|10|10919.00|1|1|9313.10|2|31262.00',
  'แผนกคลังสินค้า|896.00|1|0.00|0.00|0.00|0.00|896.00|1|1|1|0.00|0|0|896.00|0|0.00'
];

function norm_(s) { s = String(s == null ? '' : s).trim(); return s.normalize ? s.normalize('NFC') : s; }

/** DryRun report for the Oct 1-14 store-report insert (writes nothing). */
function dryRunStoreOct0114_() { return runStoreOct0114_(false); }

/** Prepends the 29 rows above the existing store-report data (row 2). */
function applyStoreOct0114_() { return runStoreOct0114_(true); }

function runStoreOct0114_(apply) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('รายงานร้านค้า (BigSeller)');
  var lastCol = sheet.getLastColumn();
  var header = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(norm_);
  var existing = sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, lastCol).getDisplayValues() : [];

  // Map each BigSeller page column to a sheet header: exact name first, then the sheet's
  // own wording for the refund-amount column ("จำนวนคำสั่งซื้อที่คืนเงิน").
  var alias = { 'จำนวนเงินคืน': ['จำนวนเงินคืน', 'จำนวนคำสั่งซื้อที่คืนเงิน'] };
  var colOfField = OCT_STORE_FIELDS_.map(function (f) {
    var cands = (alias[f] || [f]).map(norm_);
    for (var c = 0; c < header.length; c++) if (cands.indexOf(header[c]) !== -1) return c;
    for (var c2 = 0; c2 < header.length; c2++) {
      for (var k = 0; k < cands.length; k++) if (header[c2].indexOf(cands[k]) === 0 && header[c2].length <= cands[k].length + 12) return c2;
    }
    return -1;
  });
  var colStart = header.indexOf('ช่วงเริ่มต้น');
  var colEnd = header.indexOf('ช่วงสิ้นสุด');
  var report = { header: header, unmappedFields: [], unmappedHeaders: [] };
  OCT_STORE_FIELDS_.forEach(function (f, i) { if (colOfField[i] === -1) report.unmappedFields.push(f); });
  header.forEach(function (h, c) { if (colOfField.indexOf(c) === -1 && c !== colStart && c !== colEnd) report.unmappedHeaders.push(h); });
  if (colStart === -1 || colEnd === -1 || report.unmappedFields.length || report.unmappedHeaders.length) {
    Logger.log('ABORT::' + JSON.stringify(report));
    return 'aborted';
  }

  var storeCol = colOfField[0];
  var seen = {}, dup = 0, nulls = 0;
  var rowsOut = OCT_STORE_ROWS_.map(function (line) {
    var parts = line.split('|');
    if (parts.length !== OCT_STORE_FIELDS_.length) throw new Error('Bad field count: ' + line);
    var out = new Array(lastCol).fill('');
    out[colStart] = OCT_STORE_PERIOD_START_;
    out[colEnd] = OCT_STORE_PERIOD_END_;
    parts.forEach(function (v, i) {
      if (i === 0) { out[colOfField[0]] = v; return; }
      if (v === '' || isNaN(Number(v))) nulls++;
      out[colOfField[i]] = Number(v);
    });
    if (seen[parts[0]]) dup++;
    seen[parts[0]] = true;
    return out;
  });

  var matched = 0;
  existing.forEach(function (r) {
    if (norm_(r[colStart]) === norm_(OCT_STORE_PERIOD_START_) && norm_(r[colEnd]) === norm_(OCT_STORE_PERIOD_END_)) matched++;
  });

  var latestSameStore = {};
  existing.forEach(function (r) {
    var s = norm_(r[storeCol]);
    if (!latestSameStore[s]) latestSameStore[s] = r;
  });
  var sample = [0, 4, 9, 16, 25].map(function (i) {
    var s = OCT_STORE_ROWS_[i].split('|')[0];
    var old = latestSameStore[s];
    return s + ' | ยอดขาย (ช่วงก่อน → ช่วงนี้): ' + (old ? old[colOfField[7]] : '-') + ' → ' + rowsOut[i][colOfField[7]];
  });

  var sumSales = 0, sumOrders = 0, sumRefund = 0;
  rowsOut.forEach(function (r) { sumSales += r[colOfField[7]]; sumOrders += r[colOfField[8]]; sumRefund += r[colOfField[11]]; });

  var summary = {
    rows_in: OCT_STORE_ROWS_.length, matched: matched, to_insert: matched === 0 ? rowsOut.length : 0, to_update: 0,
    skipped: matched === 0 ? 0 : rowsOut.length, null_count: nulls, duplicate_count: dup,
    sum_sales: Math.round(sumSales * 100) / 100, sum_orders: sumOrders, sum_refund: Math.round(sumRefund * 100) / 100,
    sample_diff: sample, apply: apply
  };
  if (matched > 0) { Logger.log('ABORT-ALREADY-PRESENT::' + JSON.stringify(summary)); return 'already present'; }

  if (apply) {
    sheet.insertRowsBefore(2, rowsOut.length);
    sheet.getRange(2, 1, rowsOut.length, lastCol).setValues(rowsOut);
    SpreadsheetApp.flush();
  }
  Logger.log('SUMMARY::' + JSON.stringify(summary));
  return apply ? 'applied' : 'dry-run ok';
}
