/**
 * Dynamic parser for the hand-maintained "รายงานของทีม" warehouse KPI sheet.
 *
 * The spreadsheet has ONE TAB PER MONTH (e.g. "03-69", "04-69", ... "07-69"),
 * each pre-populated with every calendar day of that month as a date-block
 * column (most are blank until that day is filled in). This parser reads
 * every tab, parses each with the same dynamic date-block algorithm, and
 * merges them into one payload. No fixed schema is assumed: date columns,
 * employee roster and section rows can change per tab.
 */

/**
 * The sheet's date headers were typed with a 2-digit year intended as Thai
 * Buddhist Era (e.g. "16/01/69" meaning B.E. 2569 = A.D. 2026). Google
 * Sheets' own 2-digit-year rule (>=30 -> 19xx, <30 -> 20xx) stores that as
 * the literal Gregorian year 1969 instead, and getValues() returns that
 * literal (wrong) date. Recover the intended year by treating any date that
 * lands in the implausible 1930-1999 range as a Buddhist-era 2-digit year
 * from the 2500s decade and remapping it back to the correct Gregorian year.
 */
function normalizeHeaderDate_(date) {
  var year = date.getFullYear();
  if (year >= 1930 && year <= 1999) {
    var corrected = new Date(date.getTime());
    corrected.setFullYear(1957 + (year % 100));
    return corrected;
  }
  return date;
}

/**
 * Parses a single monthly tab into raw per-tab data (no cross-tab totals yet).
 * Returns null if the sheet doesn't look like a data tab (e.g. no date row) so
 * callers can skip stray/non-data tabs without failing the whole request.
 */
function parseSheetTab_(sheet, tz) {
  var range = sheet.getDataRange();
  var values = range.getValues();
  if (values.length < 3) return null;

  var formats = range.getNumberFormats();
  // Time-of-day cells (เวลาเข้างาน/เวลาออกงาน) come back from getValues() as
  // 1899-epoch Date objects that are awkward to format reliably; the DISPLAYED
  // string ("8:59", "18:40") is exactly what the user typed, so read those from
  // display values instead.
  var displayValues = range.getDisplayValues();
  var headerRow = values[0];
  var subHeaderRow = values[1];

  var blocks = [];
  for (var c = 0; c < headerRow.length; c++) {
    if (Object.prototype.toString.call(headerRow[c]) === '[object Date]') {
      blocks.push({ col: c, date: normalizeHeaderDate_(headerRow[c]) });
    }
  }
  if (blocks.length === 0) return null;

  blocks.sort(function (a, b) { return a.col - b.col; });
  for (var i = 0; i < blocks.length; i++) {
    blocks[i].endCol = (i + 1 < blocks.length) ? blocks[i + 1].col - 1 : headerRow.length - 1;
    blocks[i].dateKey = Utilities.formatDate(blocks[i].date, tz, 'yyyy-MM-dd');
    var keys = [];
    for (var bc = blocks[i].col; bc <= blocks[i].endCol; bc++) {
      var key = subHeaderRow[bc];
      keys.push(key && String(key).trim() ? String(key).trim() : 'value' + (bc - blocks[i].col + 1));
    }
    blocks[i].fieldKeys = keys;
  }

  var leadingCols = blocks[0].col;
  // Employees are keyed by name + team so the same person working in different
  // teams (e.g. moved from the online production line to the offline crew) is
  // tracked as two separate roster entries rather than silently merged.
  var employeesMap = {};
  var targetsByTeam = {};
  var categories = [];
  var shopSla = [];

  var currentCategory = null;
  var currentSubLabel = '';
  var inShopBlock = false;
  var currentShop = null;
  // "▶ ฝ่ายรับเข้า" / "▶ ฝ่ายคลัง" blocks were added to the monthly tab BELOW the
  // Shopee-SLA block. They use the same date-block layout as production, so they're
  // read here; deptTeam is the crew every row below such a marker belongs to.
  var deptTeam = null;
  var deptCatId = '';
  var deptCatTitle = '';
  var rwDeptMap = {};
  var rwDeptOrder = [];
  function rwDept_(title) {
    if (!rwDeptMap[title]) {
      rwDeptMap[title] = { title: title, staffMap: {}, catMap: {}, metricMap: {} };
      rwDeptOrder.push(title);
    }
    return rwDeptMap[title];
  }

  for (var r = 2; r < values.length; r++) {
    var row = values[r];
    var displayRowAll = displayValues[r];
    var colA = row[0] !== '' && row[0] !== null ? String(row[0]).trim() : '';
    var colB = leadingCols > 1 && row[1] !== '' && row[1] !== null ? String(row[1]).trim() : '';
    var colC = leadingCols > 2 && row[2] !== '' && row[2] !== null ? String(row[2]).trim() : '';

    // A ▶ marker opens a department block. It also ENDS the Shopee-SLA block, whose
    // flag is otherwise sticky and would swallow every row below it.
    if (colA.indexOf('▶') !== -1) {
      deptTeam = colA.indexOf('รับเข้า') !== -1 ? 'receiving' : (colA.indexOf('คลัง') !== -1 ? 'warehouse' : null);
      inShopBlock = false;
      currentShop = null;
      currentCategory = null;
      deptCatId = '';
      deptCatTitle = '';
      continue;
    }
    // Column B ("ฝ่ายรับเข้า - รายบุคคล") confirms the block; any other label ends it.
    if (colB) {
      if (colB.indexOf('ฝ่ายรับเข้า') !== -1) deptTeam = 'receiving';
      else if (colB.indexOf('ฝ่ายคลัง') !== -1) deptTeam = 'warehouse';
      else deptTeam = null;
      if (deptTeam) { inShopBlock = false; currentShop = null; }
    }

    if (deptTeam) {
      var deptTitle = deptTeam === 'receiving' ? 'ฝ่ายรับเข้า' : 'ฝ่ายคลัง';
      var rwd = rwDept_(deptTitle);
      if (colA) {
        var dm = colA.match(/^(\d+)\./);
        deptCatId = dm ? dm[1] : '';
        deptCatTitle = colA.replace(/^\d+\.\s*/, '').trim();
      }
      var deptCatKey = deptCatId || deptCatTitle;
      // Free-text KPI rows (e.g. "ปัญหาต่างๆ") put a whole sentence in the ชื่อ column,
      // so only short values on non-"ปัญหา" rows are treated as people.
      var isProblemRow = deptCatTitle.indexOf('ปัญหา') !== -1;
      (function (row, displayRow, team) {
        blocks.forEach(function (b) {
          var nameIdx = b.fieldKeys.indexOf('ชื่อ'); if (nameIdx === -1) nameIdx = 0;
          var parcelsIdx = b.fieldKeys.indexOf('จำนวนพัสดุ'); if (parcelsIdx === -1) parcelsIdx = 1;
          var itemsIdx = b.fieldKeys.indexOf('จำนวนสินค้า'); if (itemsIdx === -1) itemsIdx = 2;
          var inIdx = findFieldIndex_(b.fieldKeys, 'เวลาเข้า');
          var outIdx = findFieldIndex_(b.fieldKeys, 'เวลาออก');

          var nameRaw = row[b.col + nameIdx];
          var name = (nameRaw === '' || nameRaw === null || nameRaw === undefined) ? '' : String(nameRaw).trim();

          if (name && name.length <= 20 && !isProblemRow) {
            var pRaw = row[b.col + parcelsIdx];
            var iRaw = row[b.col + itemsIdx];
            var parcels = (pRaw === '' || pRaw === null || pRaw === undefined) ? null : Number(pRaw);
            var items = (iRaw === '' || iRaw === null || iRaw === undefined) ? null : Number(iRaw);
            var checkIn = inIdx !== -1 ? timeFromCell_(row[b.col + inIdx], displayRow[b.col + inIdx]) : null;
            var checkOut = outIdx !== -1 ? timeFromCell_(row[b.col + outIdx], displayRow[b.col + outIdx]) : null;

            var entry = { parcels: isNaN(parcels) ? null : parcels, items: isNaN(items) ? null : items };
            if (checkIn) entry.checkIn = checkIn;
            if (checkOut) entry.checkOut = checkOut;

            var empKey = name + ' ' + team;
            if (!employeesMap[empKey]) {
              employeesMap[empKey] = { name: name, team: team, byDate: {}, totalParcels: 0, totalItems: 0 };
            }
            employeesMap[empKey].byDate[b.dateKey] = entry;
            if (typeof entry.parcels === 'number') employeesMap[empKey].totalParcels += entry.parcels;
            if (typeof entry.items === 'number') employeesMap[empKey].totalItems += entry.items;

            // Mirror into the ฝ่ายรับเข้า/ฝ่ายคลัง view structure.
            if (!rwd.catMap[deptCatKey]) {
              rwd.catMap[deptCatKey] = { id: deptCatId, title: deptCatTitle, target: colC || '', empMap: {} };
            }
            var rwEntry = { value1: entry.parcels, value2: entry.items };
            if (checkIn) rwEntry.checkIn = checkIn;
            if (checkOut) rwEntry.checkOut = checkOut;
            var em = rwd.catMap[deptCatKey].empMap;
            if (!em[name]) em[name] = { name: name, byDate: {} };
            em[name].byDate[b.dateKey] = rwEntry;
            if (!rwd.staffMap[name]) rwd.staffMap[name] = { name: name, byDate: {} };
            rwd.staffMap[name].byDate[b.dateKey] = rwEntry;
          } else if (deptCatTitle) {
            // Department-wide KPI value for this date (read displayed text so time
            // cells don't come through as 1899 Date strings).
            var texts = [];
            for (var bc = b.col; bc <= b.endCol; bc++) {
              var dv = displayRow[bc];
              if (dv !== '' && dv !== null && dv !== undefined && String(dv).trim()) texts.push(String(dv).trim());
            }
            if (texts.length) {
              if (!rwd.metricMap[deptCatKey]) {
                rwd.metricMap[deptCatKey] = { id: deptCatId, title: deptCatTitle, target: colC || '', byDate: {} };
              }
              rwd.metricMap[deptCatKey].byDate[b.dateKey] = texts.join(' ');
            }
          }
        });
      })(row, displayRowAll, deptTeam);
      continue;
    }

    if (colC.indexOf('เกณฑ์ข้อที่') !== -1) {
      inShopBlock = true;
    }

    if (inShopBlock) {
      if (colB) {
        currentShop = { shop: colB, criteria: [] };
        shopSla.push(currentShop);
      }
      if (!currentShop || !colC) continue;
      var criterion = { label: colC, byDate: {} };
      (function (row, criterion) {
        blocks.forEach(function (b) {
          var raw = row[b.col];
          if (raw === '' || raw === null || raw === undefined) return;
          var num = parseFloat(raw);
          if (isNaN(num)) return;
          var fmt = (formats[r] && formats[r][b.col]) || '';
          var pct = fmt.indexOf('%') !== -1 ? Math.round(num * 10000) / 100 : num;
          criterion.byDate[b.dateKey] = pct;
        });
      })(row, criterion);
      currentShop.criteria.push(criterion);
      continue;
    }

    var isSectionHeaderRow = /^\d+\./.test(colA);
    if (isSectionHeaderRow) {
      currentCategory = { id: colA.split('.')[0], title: colA.replace(/^\d+\./, '').trim(), rows: [] };
      categories.push(currentCategory);
      currentSubLabel = '';
    }
    if (colB) currentSubLabel = colB;
    if (!currentCategory) continue;

    var isProductionSection = currentCategory.title.indexOf('ยอดผลิต') !== -1;

    if (isProductionSection) {
      if (colC) currentCategory.target = colC;
      if (colB) currentCategory.team = colB;
      // Which team this production block belongs to. There are now (at least) two
      // production sections — "ยอดผลิต ออนไลน์" and "ยอดผลิต ออฟไลน์" — distinguished
      // only by the team label in column B; default to online when unlabeled.
      var team = normalizeTeam_(currentCategory.team);
      if (currentCategory.target && !targetsByTeam[team]) targetsByTeam[team] = currentCategory.target;
      (function (row, displayRow, team) {
        blocks.forEach(function (b) {
          var nameIdx = b.fieldKeys.indexOf('ชื่อ');
          if (nameIdx === -1) nameIdx = 0;
          var nameRaw = row[b.col + nameIdx];
          if (!nameRaw || typeof nameRaw !== 'string' || !nameRaw.trim()) return;
          var name = nameRaw.trim();

          var parcelsIdx = b.fieldKeys.indexOf('จำนวนพัสดุ'); if (parcelsIdx === -1) parcelsIdx = 1;
          var itemsIdx = b.fieldKeys.indexOf('จำนวนสินค้า'); if (itemsIdx === -1) itemsIdx = 2;
          var parcelsRaw = row[b.col + parcelsIdx];
          var itemsRaw = row[b.col + itemsIdx];
          var parcels = (parcelsRaw === '' || parcelsRaw === null || parcelsRaw === undefined) ? null : Number(parcelsRaw);
          var items = (itemsRaw === '' || itemsRaw === null || itemsRaw === undefined) ? null : Number(itemsRaw);

          // Check-in / check-out are OPTIONAL extra sub-columns present only in
          // some (newer) date-blocks. Match by substring so trailing text or
          // spacing in the header doesn't break detection, and read the displayed
          // string ("8:59") normalized to "HH:mm".
          var checkIn = null, checkOut = null;
          var inIdx = findFieldIndex_(b.fieldKeys, 'เวลาเข้า');
          var outIdx = findFieldIndex_(b.fieldKeys, 'เวลาออก');
          if (inIdx !== -1) checkIn = normalizeTime_(displayRow[b.col + inIdx]);
          if (outIdx !== -1) checkOut = normalizeTime_(displayRow[b.col + outIdx]);

          // งานที่ทำ / หมายเหตุ are OPTIONAL free-text sub-columns the offline crew
          // will start recording (they log tasks + notes rather than parcel counts).
          // Present only where the header has them; read as plain text.
          var work = null, note = null;
          var workIdx = findFieldIndex_(b.fieldKeys, 'งานที่ทำ');
          var noteIdx = findFieldIndex_(b.fieldKeys, 'หมายเหตุ');
          if (workIdx !== -1) { var wRaw = row[b.col + workIdx]; if (wRaw !== '' && wRaw !== null && wRaw !== undefined) work = String(wRaw).trim(); }
          if (noteIdx !== -1) { var nRaw = row[b.col + noteIdx]; if (nRaw !== '' && nRaw !== null && nRaw !== undefined) note = String(nRaw).trim(); }

          var empKey = name + ' ' + team;
          if (!employeesMap[empKey]) {
            employeesMap[empKey] = { name: name, team: team, byDate: {}, totalParcels: 0, totalItems: 0 };
          }
          var entry = { parcels: isNaN(parcels) ? null : parcels, items: isNaN(items) ? null : items };
          if (checkIn) entry.checkIn = checkIn;
          if (checkOut) entry.checkOut = checkOut;
          if (work) entry.work = work;
          if (note) entry.note = note;
          employeesMap[empKey].byDate[b.dateKey] = entry;
          if (typeof parcels === 'number' && !isNaN(parcels)) employeesMap[empKey].totalParcels += parcels;
          if (typeof items === 'number' && !isNaN(items)) employeesMap[empKey].totalItems += items;
        });
      })(row, displayValues[r], team);
    } else {
      var label = colB || currentSubLabel || currentCategory.title;
      var rowEntry = { label: label, note: colC || undefined, byDate: {} };
      var hasAny = false;
      (function (row, rowEntry) {
        blocks.forEach(function (b) {
          var texts = [];
          for (var bc = b.col; bc <= b.endCol; bc++) {
            var v = row[bc];
            if (v !== '' && v !== null && v !== undefined) texts.push(String(v).trim());
          }
          if (texts.length) {
            rowEntry.byDate[b.dateKey] = texts.join(' ');
            hasAny = true;
          }
        });
      })(row, rowEntry);
      if (hasAny || colB) currentCategory.rows.push(rowEntry);
    }
  }

  var otherCategories = categories.filter(function (c) { return c.title.indexOf('ยอดผลิต') === -1; });

  // Per-team production targets. Each team's target text (e.g. "350 / ต่อคน") is
  // parsed into a numeric value where possible; the offline crew currently has
  // no numeric target ("/ ต่อคน"), so its value stays null.
  var teamTargets = {};
  Object.keys(targetsByTeam).forEach(function (t) {
    teamTargets[t] = { label: targetsByTeam[t] || '', value: parseTargetValue_(targetsByTeam[t]) };
  });

  // The ▶ ฝ่ายรับเข้า / ▶ ฝ่ายคลัง blocks, in the same shape the dedicated
  // "รับเข้า+คลัง" sheet produces, so both sources feed one view.
  var rwDepartments = rwDeptOrder.map(function (title) {
    var d = rwDeptMap[title];
    return {
      title: title,
      staff: rwPeopleList_(d.staffMap),
      staffCategories: Object.keys(d.catMap).map(function (k) {
        var c = d.catMap[k];
        return { id: c.id, title: c.title, target: c.target, employees: rwPeopleList_(c.empMap) };
      }),
      metrics: Object.keys(d.metricMap).map(function (k) { return d.metricMap[k]; })
    };
  });

  return {
    dates: blocks.map(function (b) { return b.dateKey; }),
    employees: Object.keys(employeesMap).map(function (k) { return employeesMap[k]; }),
    // Back-compat single target = the online production target.
    target: teamTargets.online || null,
    targetsByTeam: teamTargets,
    categories: otherCategories,
    shopSla: shopSla,
    receivingWarehouse: rwDepartments.length
      ? { dates: blocks.map(function (b) { return b.dateKey; }), departments: rwDepartments }
      : null
  };
}

/**
 * Reads the standalone post-shipment error sheet ("ข้อผิดพลาด" / "ออเดอร์ส่งผิด")
 * — a FLAT table (not date-block), columns:
 *   A วันที่ | B ชื่อ | C เลขที่ PO | D SKU ที่ผิด | E จำนวนผิด | F SKU ที่ถูก | G จำนวนถูก | H หมายเหตุ
 * Read-only. Column order follows the sheet's own header row when present
 * (matched by keyword), else falls back to the fixed A-H order above.
 * Returns [] for any non-error / malformed sheet so it never breaks the payload.
 */
function parseShipErrorSheet_(sheet, tz) {
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];

  // Locate a header row (contains SKU / PO / วันที่). Default column map = A-H.
  var col = { date: 0, name: 1, po: 2, wrongSku: 3, wrongQty: 4, rightSku: 5, rightQty: 6, note: 7 };
  var headerRowIdx = -1;
  for (var r = 0; r < Math.min(values.length, 5); r++) {
    var joined = values[r].map(function (v) { return String(v == null ? '' : v); }).join('|');
    if (joined.indexOf('SKU') !== -1 || joined.indexOf('PO') !== -1 || (joined.indexOf('วันที่') !== -1 && joined.indexOf('ชื่อ') !== -1)) {
      headerRowIdx = r;
      var hdr = values[r];
      for (var c = 0; c < hdr.length; c++) {
        var h = String(hdr[c] == null ? '' : hdr[c]);
        if (h.indexOf('วันที่') !== -1) col.date = c;
        else if (h.indexOf('ชื่อ') !== -1) col.name = c;
        else if (h.indexOf('PO') !== -1) col.po = c;
        else if (h.indexOf('SKU') !== -1 && (h.indexOf('ผิด') !== -1)) col.wrongSku = c;
        else if (h.indexOf('SKU') !== -1 && (h.indexOf('ถูก') !== -1)) col.rightSku = c;
        else if (h.indexOf('จำนวน') !== -1 && h.indexOf('ผิด') !== -1) col.wrongQty = c;
        else if (h.indexOf('จำนวน') !== -1 && h.indexOf('ถูก') !== -1) col.rightQty = c;
        else if (h.indexOf('หมายเหตุ') !== -1) col.note = c;
      }
      break;
    }
  }

  var out = [];
  for (var i = headerRowIdx + 1; i < values.length; i++) {
    var row = values[i];
    var rawDate = row[col.date];
    var name = row[col.name];
    // Skip fully-empty rows.
    if ((rawDate === '' || rawDate === null) && (name === '' || name === null)) continue;

    var dateStr;
    if (Object.prototype.toString.call(rawDate) === '[object Date]') {
      dateStr = Utilities.formatDate(normalizeHeaderDate_(rawDate), tz, 'yyyy-MM-dd');
    } else {
      dateStr = String(rawDate == null ? '' : rawDate).trim();
    }

    out.push({
      date: dateStr,
      name: String(name == null ? '' : name).trim(),
      po: String(row[col.po] == null ? '' : row[col.po]).trim(),
      wrongSku: String(row[col.wrongSku] == null ? '' : row[col.wrongSku]).trim(),
      wrongQty: row[col.wrongQty] === '' || row[col.wrongQty] == null ? null : Number(row[col.wrongQty]),
      rightSku: String(row[col.rightSku] == null ? '' : row[col.rightSku]).trim(),
      rightQty: row[col.rightQty] === '' || row[col.rightQty] == null ? null : Number(row[col.rightQty]),
      note: String(row[col.note] == null ? '' : row[col.note]).trim()
    });
  }
  return out;
}

var THAI_MONTH_MAP_ = {
  'ม.ค.': 0, 'ก.พ.': 1, 'มี.ค.': 2, 'เม.ย.': 3, 'พ.ค.': 4, 'มิ.ย.': 5,
  'ก.ค.': 6, 'ส.ค.': 7, 'ก.ย.': 8, 'ต.ค.': 9, 'พ.ย.': 10, 'ธ.ค.': 11
};

/** Parses a "31 พ.ค. 2026" style long-form Thai date (as typed/exported by BigSeller)
 * into a Date. Falls back to the cell's own Date value when it's already date-typed. */
function parseThaiLongDate_(raw, display) {
  if (Object.prototype.toString.call(raw) === '[object Date]') return normalizeHeaderDate_(raw);
  var s = String(display != null ? display : (raw != null ? raw : '')).trim();
  var m = s.match(/^(\d{1,2})\s+(\S+)\s+(\d{4})$/);
  if (!m) return null;
  var day = parseInt(m[1], 10);
  var mon = THAI_MONTH_MAP_[m[2]];
  var year = parseInt(m[3], 10);
  if (mon === undefined || isNaN(day) || isNaN(year)) return null;
  return new Date(year, mon, day);
}

/** Reads a percentage cell as a plain number (e.g. "0.47%" -> 0.47), preferring the
 * display text since the underlying value for a percent-formatted cell is the raw
 * fraction (0.0047), not the number shown to the user. */
function percentFromCell_(raw, display) {
  var s = String(display != null ? display : '').trim();
  if (s.indexOf('%') !== -1) {
    var v = parseFloat(s.replace('%', '').replace(/,/g, ''));
    return isNaN(v) ? null : v;
  }
  if (typeof raw === 'number') return raw <= 1 ? raw * 100 : raw;
  return null;
}

function numFromCell_(v) {
  if (v === '' || v === null || v === undefined) return null;
  if (typeof v === 'number') return isNaN(v) ? null : v;
  var n = Number(String(v).replace(/,/g, ''));
  return isNaN(n) ? null : n;
}

/**
 * Reads the standalone "รายงานคำสั่งซื้อ" sheet (BigSeller order-report export) — a
 * FLAT table, one row per day. Columns are matched by header keyword (most-specific
 * pattern checked first, since several headers share substrings like "คำสั่งซื้อ"),
 * so reordered/renamed columns degrade gracefully instead of misreading data.
 * Read-only. Returns [] for a non-matching sheet so it never breaks the payload.
 */
function parseOrderReportSheet_(sheet, tz) {
  var range = sheet.getDataRange();
  var values = range.getValues();
  if (values.length < 2) return [];
  var displayValues = range.getDisplayValues();

  var headerRowIdx = -1;
  var col = {};
  for (var r = 0; r < Math.min(values.length, 5); r++) {
    var hdr = values[r];
    var joined = hdr.map(function (v) { return String(v == null ? '' : v).normalize ? String(v == null ? '' : v).normalize('NFC') : String(v == null ? '' : v); }).join('|');
    if (joined.indexOf('วันที่') === -1 || joined.indexOf('คำสั่งซื้อ') === -1) continue;
    headerRowIdx = r;
    for (var c = 0; c < hdr.length; c++) {
      var h = String(hdr[c] == null ? '' : hdr[c]).trim();
      if (h.normalize) h = h.normalize('NFC');
      if (h === 'วันที่') col.date = c;
      else if (h.indexOf('ยอดขายของคำสั่งซื้อที่มีผล') !== -1) col.effSales = c;
      else if (h === 'คำสั่งซื้อที่มีผล') col.effOrders = c;
      else if (h.indexOf('คำสั่งซื้อทั้งหมด') !== -1) col.totalOrders = c;
      else if (h.indexOf('จำนวนพัสดุ') !== -1) col.parcels = c;
      else if (h.indexOf('รายได้รวม') !== -1) col.totalRevenue = c;
      else if (h.indexOf('เงินอุดหนุน') !== -1) col.sellerSubsidy = c;
      else if (h.indexOf('ยอดขายสินค้า') !== -1) col.productSales = c;
      else if (h.indexOf('ราคาสินค้าเดิม') !== -1) col.origPrice = c;
      else if (h === 'ยอดขาย') col.sales = c;
      else if (h.indexOf('จำนวนคำสั่งซื้อที่คืนเงิน') !== -1) col.refundAmount = c;
      else if (h === 'คำสั่งซื้อที่คืนเงิน') col.refundOrders = c;
      else if (h.indexOf('ลูกค้าที่คืนเงิน') !== -1) col.refundCustomers = c;
      else if (h.indexOf('อัตราการคืนเงิน') !== -1) col.refundRate = c;
      else if (h.indexOf('ยอดเงินคำสั่งซื้อที่ยกเลิก') !== -1) col.cancelledAmount = c;
      else if (h === 'คำสั่งซื้อที่ยกเลิก') col.cancelledOrders = c;
      else if (h.indexOf('ยอดขายเฉลี่ยต่อคำสั่งซื้อ') !== -1) col.aov = c;
      else if (h.indexOf('โค้ดส่วนลด') !== -1) col.discountCode = c;
    }
    break;
  }
  if (headerRowIdx === -1 || col.date === undefined) return [];

  var out = [];
  for (var i = headerRowIdx + 1; i < values.length; i++) {
    var row = values[i];
    var displayRow = displayValues[i];
    var dateObj = parseThaiLongDate_(row[col.date], displayRow[col.date]);
    if (!dateObj) continue;

    out.push({
      date: Utilities.formatDate(dateObj, tz, 'yyyy-MM-dd'),
      effSales: numFromCell_(row[col.effSales]) || 0,
      effOrders: numFromCell_(row[col.effOrders]) || 0,
      totalOrders: numFromCell_(row[col.totalOrders]) || 0,
      parcels: numFromCell_(row[col.parcels]) || 0,
      totalRevenue: numFromCell_(row[col.totalRevenue]) || 0,
      sellerSubsidy: numFromCell_(row[col.sellerSubsidy]) || 0,
      productSales: numFromCell_(row[col.productSales]) || 0,
      origPrice: numFromCell_(row[col.origPrice]) || 0,
      sales: numFromCell_(row[col.sales]) || 0,
      refundAmount: numFromCell_(row[col.refundAmount]) || 0,
      refundOrders: numFromCell_(row[col.refundOrders]) || 0,
      refundCustomers: numFromCell_(row[col.refundCustomers]) || 0,
      refundRate: percentFromCell_(row[col.refundRate], displayRow[col.refundRate]) || 0,
      cancelledAmount: numFromCell_(row[col.cancelledAmount]) || 0,
      cancelledOrders: numFromCell_(row[col.cancelledOrders]) || 0,
      aov: numFromCell_(row[col.aov]) || 0,
      discountCode: numFromCell_(row[col.discountCode]) || 0
    });
  }
  return out;
}

/** Merges order-report day rows from more than one matching tab, by date (later tab
 * wins on overlap) — mirrors mergeReceivingWarehouse_'s union-by-key approach. */
function mergeOrderReportDays_(a, b) {
  var byDate = {};
  (a || []).forEach(function (d) { byDate[d.date] = d; });
  (b || []).forEach(function (d) { byDate[d.date] = d; });
  return Object.keys(byDate).sort().map(function (d) { return byDate[d]; });
}

/** Parses a "d/m/yy" (or "d/m/yyyy") date typed with a Thai Buddhist-Era short
 * year — e.g. "1/8/69" means 1 Aug 2569 BE = 2026 AD — the convention used on
 * the "ปัญหารอแก้" sheet. Unlike parseDdmmyyyy_ (which assumes a 2-digit year is
 * a plain Gregorian short-year), every 2-digit year here is treated as B.E.
 * (2500 + yy), matching normalizeHeaderDate_'s 1957+yy recovery formula. */
function parseDdmmyyBuddhist_(text) {
  var m = String(text).match(/^\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s*$/);
  if (!m) return null;
  var d = parseInt(m[1], 10), mo = parseInt(m[2], 10), y = parseInt(m[3], 10);
  if (y < 100) y = 1957 + y;
  else if (y > 2500) y -= 543;
  var date = new Date(y, mo - 1, d);
  return isNaN(date.getTime()) ? null : date;
}

/** Reads a "ปัญหารอแก้" (work issues / obstacles) date cell — Date-typed cells
 * already carry Google Sheets' own (buggy) 2-digit-year reinterpretation, so
 * normalizeHeaderDate_ recovers those; plain text cells are parsed with the
 * B.E.-short-year convention above. */
function issueDateFromCell_(raw, display) {
  if (Object.prototype.toString.call(raw) === '[object Date]') return normalizeHeaderDate_(raw);
  return parseDdmmyyBuddhist_(display || raw);
}

/**
 * Reads the standalone "ปัญหารอแก้" sheet (workplace obstacles/issues log, e.g.
 * unstable internet, printer/ink problems, PC crashes) — a FLAT table, one row
 * per issue. Columns matched by header keyword so column order/typos (e.g. the
 * sheet's own "สถานนะ" for "สถานะ") degrade gracefully. Column A is a free
 * "ตัวอย่าง" (example) tag on the sheet's demo rows — those rows are skipped so
 * seed/example data never shows up as a real reported issue. Read-only.
 */
function parseWorkIssuesSheet_(sheet, tz) {
  var range = sheet.getDataRange();
  var values = range.getValues();
  if (values.length < 2) return [];
  var displayValues = range.getDisplayValues();

  var headerRowIdx = -1;
  var col = {};
  for (var r = 0; r < Math.min(values.length, 5); r++) {
    var hdr = values[r];
    var joined = hdr.map(function (v) { return String(v == null ? '' : v).normalize ? String(v == null ? '' : v).normalize('NFC') : String(v == null ? '' : v); }).join('|');
    if (joined.indexOf('รายละเอียดปัญหา') === -1 || joined.indexOf('ผู้แจ้ง') === -1) continue;
    headerRowIdx = r;
    for (var c = 0; c < hdr.length; c++) {
      var h = String(hdr[c] == null ? '' : hdr[c]).trim();
      if (h.normalize) h = h.normalize('NFC');
      if (h === 'วันที่') col.date = c;
      else if (h.indexOf('ผู้แจ้ง') !== -1) col.reporter = c;
      else if (h.indexOf('หมวดหมู่') !== -1) col.category = c;
      else if (h.indexOf('รายละเอียดปัญหา') !== -1) col.detail = c;
      else if (h.indexOf('ความเร่งด่วน') !== -1) col.urgency = c;
      else if (h.indexOf('ผู้รับผิดชอบ') !== -1) col.assignee = c;
      else if (h.indexOf('วันที่เริ่มแก้ไข') !== -1) col.startDate = c;
      else if (h.indexOf('กำหนดเสร็จ') !== -1) col.dueDate = c;
      else if (h.indexOf('วิธีแก้ไข') !== -1) col.resolution = c;
      else if (h.indexOf('สถาน') !== -1) col.status = c;
      else if (h.indexOf('ผลตรวจสอบ') !== -1) col.verifyResult = c;
      else if (h.indexOf('หมายเหตุ') !== -1) col.note = c;
    }
    break;
  }
  if (headerRowIdx === -1 || col.detail === undefined) return [];

  function cellDate_(rowIdx, c) {
    if (c === undefined) return '';
    var raw = values[rowIdx][c];
    var dateObj = issueDateFromCell_(raw, displayValues[rowIdx][c]);
    return dateObj ? Utilities.formatDate(dateObj, tz, 'yyyy-MM-dd') : '';
  }
  function cellText_(rowIdx, c) {
    if (c === undefined) return '';
    var v = values[rowIdx][c];
    return v == null ? '' : String(v).trim();
  }

  var out = [];
  for (var i = headerRowIdx + 1; i < values.length; i++) {
    var row = values[i];
    var colAText = String(row[0] == null ? '' : row[0]).trim();
    if (colAText.normalize) colAText = colAText.normalize('NFC');
    if (colAText === 'ตัวอย่าง') continue; // skip seed/example rows
    var detail = cellText_(i, col.detail);
    var reporter = cellText_(i, col.reporter);
    if (!detail && !reporter) continue; // fully blank row

    out.push({
      date: cellDate_(i, col.date),
      reporter: reporter,
      category: cellText_(i, col.category),
      detail: detail,
      urgency: cellText_(i, col.urgency),
      assignee: cellText_(i, col.assignee),
      startDate: cellDate_(i, col.startDate),
      dueDate: cellDate_(i, col.dueDate),
      resolution: cellText_(i, col.resolution),
      status: cellText_(i, col.status),
      verifyResult: cellText_(i, col.verifyResult),
      note: cellText_(i, col.note)
    });
  }
  return out;
}

/** Parses a "dd/mm/yyyy" header string into a Date. Years in the 2500s are Thai
 * Buddhist Era and mapped back to Gregorian; plain "2026" is left as-is. */
function parseDdmmyyyy_(text) {
  var m = String(text).match(/^\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s*$/);
  if (!m) return null;
  var d = parseInt(m[1], 10), mo = parseInt(m[2], 10), y = parseInt(m[3], 10);
  if (y < 100) y = (y >= 30 ? 1900 : 2000) + y;
  if (y > 2500) y -= 543;
  var date = new Date(Date.UTC(y, mo - 1, d));
  return isNaN(date.getTime()) ? null : date;
}

/**
 * Parses the standalone "รับเข้า + คลัง" work sheet — a SEPARATE schema from the
 * monthly production tabs. Layout:
 *   row 2: date headers (each spanning a 5-column date-block)
 *   row 3: per-block sub-headers — ชื่อ | ค่าที่ 1 (SKU/บิล) | ค่าที่ 2 (จำนวนชิ้น) | เวลาเข้างาน | เวลาออกงาน
 *   col A: หมวดงาน (KPI category, e.g. "1. จำนวนสินค้าที่รับเข้า")
 *   col B: ทีม/รายละเอียด (e.g. "ฝ่ายรับเข้า - รายบุคคล" / "ฝ่ายคลัง - รวมทั้งฝ่าย")
 *   col C: เป้าหมาย (target text)
 *   "▶ ฝ่ายรับเข้า" / "▶ ฝ่ายคลัง" rows mark department boundaries.
 * Two row kinds: per-person ("รายบุคคล" → staff with value1/value2/check-in/out per day)
 * and team-wide ("รวมทั้งฝ่าย" → one KPI metric with a free-text value per day).
 * Returns null for a sheet that doesn't match this schema. Read-only.
 */
function parseReceivingWarehouseTab_(sheet, tz) {
  var range = sheet.getDataRange();
  var values = range.getValues();
  if (values.length < 4) return null;
  var displayValues = range.getDisplayValues();

  var dateRow = values[1];       // row 2
  var subHeaderRow = values[2];  // row 3
  // Date-blocks start where the sub-header is "ชื่อ".
  var starts = [];
  for (var c = 0; c < subHeaderRow.length; c++) {
    if (String(subHeaderRow[c] || '').trim() === 'ชื่อ') starts.push(c);
  }
  if (starts.length === 0) return null;

  var blocks = [];
  for (var i = 0; i < starts.length; i++) {
    var col = starts[i];
    var end = (i + 1 < starts.length) ? starts[i + 1] - 1 : subHeaderRow.length - 1;
    var rawDate = dateRow[col];
    var dateObj = (Object.prototype.toString.call(rawDate) === '[object Date]')
      ? normalizeHeaderDate_(rawDate)
      : parseDdmmyyyy_(rawDate);
    if (!dateObj) continue;
    var fields = {};
    for (var bc = col; bc <= end; bc++) {
      var h = String(subHeaderRow[bc] || '').replace(/\s+/g, ' ').trim();
      if (h.indexOf('ชื่อ') !== -1) fields.name = bc;
      else if (h.indexOf('ค่าที่ 1') !== -1) fields.v1 = bc;
      else if (h.indexOf('ค่าที่ 2') !== -1) fields.v2 = bc;
      else if (h.indexOf('เวลาเข้า') !== -1) fields.checkIn = bc;
      else if (h.indexOf('เวลาออก') !== -1) fields.checkOut = bc;
    }
    blocks.push({ col: col, end: end, fields: fields, dateKey: Utilities.formatDate(dateObj, tz, 'yyyy-MM-dd') });
  }
  if (blocks.length === 0) return null;

  var deptMap = {}; // title -> { title, personCats, metrics, staffMap }
  var deptOrder = [];
  function dept(title) {
    if (!deptMap[title]) { deptMap[title] = { title: title, personCats: {}, metrics: {}, staffMap: {} }; deptOrder.push(title); }
    return deptMap[title];
  }
  // Records a person's attendance for the department. Called for every name that
  // carries a check-in/out (or that sits on a "รายบุคคล" row) — so both the
  // ฝ่ายรับเข้า per-person section AND the ฝ่ายคลัง rows that pin a name to a KPI
  // become attendance the app can show/filter.
  function addStaff(d, name, dateKey, v1, v2, checkIn, checkOut) {
    if (!d.staffMap[name]) d.staffMap[name] = { name: name, byDate: {} };
    var e = d.staffMap[name].byDate[dateKey] || {};
    if (typeof v1 === 'number' && !isNaN(v1)) e.value1 = v1;
    if (typeof v2 === 'number' && !isNaN(v2)) e.value2 = v2;
    if (checkIn) e.checkIn = checkIn;
    if (checkOut) e.checkOut = checkOut;
    d.staffMap[name].byDate[dateKey] = e;
  }

  // currentDept / currentIsPerson / currentCat PERSIST across continuation rows,
  // because column A (หมวดงาน) and B (ทีม/รายละเอียด) are vertically merged — only
  // the first row of each section carries them; the rest come back blank.
  var currentDept = null;
  var currentIsPerson = false;
  var currentCat = null;
  var dateKeySet = {};
  blocks.forEach(function (b) { dateKeySet[b.dateKey] = true; });

  for (var r = 3; r < values.length; r++) {
    var row = values[r];
    var displayRow = displayValues[r];
    var colA = row[0] != null ? String(row[0]).trim() : '';
    var colB = row[1] != null ? String(row[1]).trim() : '';
    var colC = row[2] != null ? String(row[2]).trim() : '';

    if (colA.indexOf('▶') !== -1) { currentDept = colA.replace(/▶/g, '').trim(); currentCat = null; continue; }

    if (colB) {
      currentDept = colB.split('-')[0].trim();
      currentIsPerson = colB.indexOf('รายบุคคล') !== -1;
    }
    if (!currentDept) continue;
    var d = dept(currentDept);

    var idm = colA.match(/^(\d+)\./);
    var startsCat = !!idm;
    var catId = idm ? idm[1] : '';
    var catTitle = colA.replace(/^\d+\.\s*/, '').trim();

    (function (row, displayRow) {
      if (currentIsPerson) {
        if (startsCat) {
          if (!d.personCats[catId]) d.personCats[catId] = { id: catId, title: catTitle, target: colC || '', employeesMap: {} };
          currentCat = d.personCats[catId];
        }
        if (!currentCat) return;
        var cat = currentCat;
        blocks.forEach(function (b) {
          var nameRaw = b.fields.name != null ? row[b.fields.name] : null;
          if (!nameRaw || !String(nameRaw).trim()) return;
          var name = String(nameRaw).trim();
          var v1raw = b.fields.v1 != null ? row[b.fields.v1] : null;
          var v2raw = b.fields.v2 != null ? row[b.fields.v2] : null;
          var v1 = (v1raw === '' || v1raw == null) ? null : Number(v1raw);
          var v2 = (v2raw === '' || v2raw == null) ? null : Number(v2raw);
          var checkIn = b.fields.checkIn != null ? timeFromCell_(row[b.fields.checkIn], displayRow[b.fields.checkIn]) : null;
          var checkOut = b.fields.checkOut != null ? timeFromCell_(row[b.fields.checkOut], displayRow[b.fields.checkOut]) : null;
          if (!cat.employeesMap[name]) cat.employeesMap[name] = { name: name, byDate: {} };
          var entry = { value1: isNaN(v1) ? null : v1, value2: isNaN(v2) ? null : v2 };
          if (checkIn) entry.checkIn = checkIn;
          if (checkOut) entry.checkOut = checkOut;
          cat.employeesMap[name].byDate[b.dateKey] = entry;
          addStaff(d, name, b.dateKey, entry.value1, entry.value2, checkIn, checkOut);
        });
      } else {
        // Team-wide KPI metric: one metric per row, a free-text value per date.
        var metric = null;
        if (startsCat || catTitle) {
          var metricKey = catId || catTitle;
          if (!d.metrics[metricKey]) d.metrics[metricKey] = { id: catId, title: catTitle, target: colC || '', byDate: {} };
          metric = d.metrics[metricKey];
        }
        blocks.forEach(function (b) {
          // Read DISPLAY values so time cells render "08:57" (not a 1899 Date string).
          var texts = [];
          for (var bc = b.col; bc <= b.end; bc++) {
            var dv = displayRow[bc];
            if (dv != null && String(dv).trim()) texts.push(String(dv).trim());
          }
          if (metric && texts.length) metric.byDate[b.dateKey] = texts.join(' ');
          // Some departments (e.g. ฝ่ายคลัง) pin a person to each KPI row rather than
          // having a separate "รายบุคคล" section. Treat the name in the ชื่อ column as
          // that person's attendance — even before a clock-in/out is filled in — so the
          // department shows up in the filter. Skip "ปัญหา" rows (free text, not a name)
          // and anything too long to be a name.
          var nameRaw = b.fields.name != null ? row[b.fields.name] : null;
          var nameStr = nameRaw != null ? String(nameRaw).trim() : '';
          var checkIn = b.fields.checkIn != null ? timeFromCell_(row[b.fields.checkIn], displayRow[b.fields.checkIn]) : null;
          var checkOut = b.fields.checkOut != null ? timeFromCell_(row[b.fields.checkOut], displayRow[b.fields.checkOut]) : null;
          if (nameStr && nameStr.length <= 20 && catTitle.indexOf('ปัญหา') === -1) {
            var v1raw = b.fields.v1 != null ? row[b.fields.v1] : null;
            var v2raw = b.fields.v2 != null ? row[b.fields.v2] : null;
            var v1 = (v1raw === '' || v1raw == null) ? null : Number(v1raw);
            var v2 = (v2raw === '' || v2raw == null) ? null : Number(v2raw);
            addStaff(d, nameStr, b.dateKey, isNaN(v1) ? null : v1, isNaN(v2) ? null : v2, checkIn, checkOut);
          }
        });
      }
    })(row, displayRow);
  }

  function totalsAndList(map) {
    return Object.keys(map).map(function (n) {
      var e = map[n];
      var t1 = 0, t2 = 0;
      Object.keys(e.byDate).forEach(function (dk) {
        var en = e.byDate[dk];
        if (typeof en.value1 === 'number') t1 += en.value1;
        if (typeof en.value2 === 'number') t2 += en.value2;
      });
      return { name: e.name, byDate: e.byDate, totalValue1: t1, totalValue2: t2 };
    });
  }

  var departments = deptOrder.map(function (title) {
    var d = deptMap[title];
    return {
      title: title,
      staff: totalsAndList(d.staffMap),
      staffCategories: Object.keys(d.personCats).map(function (k) {
        var cat = d.personCats[k];
        return { id: cat.id, title: cat.title, target: cat.target, employees: totalsAndList(cat.employeesMap) };
      }),
      metrics: Object.keys(d.metrics).map(function (k) { return d.metrics[k]; })
    };
  });

  return { dates: Object.keys(dateKeySet).sort(), departments: departments };
}

/** Merges two parsed รับเข้า+คลัง results (one per monthly tab) into one — union of
 * dates, and departments merged by title (staff/staffCategories by name, metrics by
 * id), so ก.ค. + ส.ค. + … combine instead of the last tab overwriting the rest. */
function mergeReceivingWarehouse_(a, b) {
  if (!a) return b;
  if (!b) return a;

  var dateSet = {};
  a.dates.concat(b.dates).forEach(function (x) { dateSet[x] = true; });

  var byTitle = {};
  var order = [];
  function ensure(title) {
    if (!byTitle[title]) { byTitle[title] = { title: title, staffMap: {}, catMap: {}, metricMap: {} }; order.push(title); }
    return byTitle[title];
  }
  function mergePeople(map, list) {
    (list || []).forEach(function (e) {
      if (!map[e.name]) map[e.name] = { name: e.name, byDate: {} };
      Object.keys(e.byDate).forEach(function (dk) { map[e.name].byDate[dk] = e.byDate[dk]; });
    });
  }
  [a, b].forEach(function (rw) {
    rw.departments.forEach(function (dep) {
      var t = ensure(dep.title);
      mergePeople(t.staffMap, dep.staff);
      (dep.staffCategories || []).forEach(function (c) {
        if (!t.catMap[c.id]) t.catMap[c.id] = { id: c.id, title: c.title, target: c.target, empMap: {} };
        mergePeople(t.catMap[c.id].empMap, c.employees);
      });
      (dep.metrics || []).forEach(function (m) {
        var key = m.id || m.title;
        if (!t.metricMap[key]) t.metricMap[key] = { id: m.id, title: m.title, target: m.target, byDate: {} };
        Object.keys(m.byDate).forEach(function (dk) { t.metricMap[key].byDate[dk] = m.byDate[dk]; });
      });
    });
  });

  function withTotals(map) {
    return Object.keys(map).map(function (n) {
      var e = map[n];
      var t1 = 0, t2 = 0;
      Object.keys(e.byDate).forEach(function (dk) {
        var en = e.byDate[dk];
        if (typeof en.value1 === 'number') t1 += en.value1;
        if (typeof en.value2 === 'number') t2 += en.value2;
      });
      return { name: e.name, byDate: e.byDate, totalValue1: t1, totalValue2: t2 };
    });
  }

  var departments = order.map(function (title) {
    var d = byTitle[title];
    return {
      title: title,
      staff: withTotals(d.staffMap),
      staffCategories: Object.keys(d.catMap).map(function (k) {
        var c = d.catMap[k];
        return { id: c.id, title: c.title, target: c.target, employees: withTotals(c.empMap) };
      }),
      metrics: Object.keys(d.metricMap).map(function (k) { return d.metricMap[k]; })
    };
  });

  return { dates: Object.keys(dateSet).sort(), departments: departments };
}

function buildDashboardPayload_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tz = ss.getSpreadsheetTimeZone();
  var sheets = ss.getSheets();

  var employeesMap = {};
  var categoriesMap = {};
  var shopMap = {};
  var dateSet = {};
  var target = null;
  var targetsByTeam = {};
  var shipErrors = [];
  var receivingWarehouse = null;
  var orderReportDays = [];
  var workIssues = [];

  sheets.forEach(function (sheet) {
    var parsed;
    try {
      parsed = parseSheetTab_(sheet, tz);
    } catch (err) {
      parsed = null; // one malformed tab shouldn't break the whole dashboard
    }
    if (!parsed) {
      // Normalized so a tab name whose Thai combining marks were typed/pasted in a
      // different Unicode form (NFD vs NFC — common when copy-pasting between apps)
      // still matches these literal substrings, which are themselves NFC.
      var nm = sheet.getName();
      if (nm && nm.normalize) nm = nm.normalize('NFC');
      // The daily "รับเข้า + คลัง" work sheet has its own schema (not a monthly
      // production tab). The monthly summary variant is skipped for now.
      if (nm.indexOf('ตารางงาน') !== -1 && nm.indexOf('รับเข้า') !== -1 && nm.indexOf('รายเดือน') === -1) {
        try {
          var rw = parseReceivingWarehouseTab_(sheet, tz);
          // Merge across monthly tabs (ก.ค. + ส.ค. + …) instead of letting the last overwrite.
          if (rw) receivingWarehouse = mergeReceivingWarehouse_(receivingWarehouse, rw);
        } catch (e3) { /* ignore malformed รับเข้า+คลัง sheet */ }
        return;
      }
      // The standalone BigSeller order-report export ("รายงานคำสั่งซื้อ", possibly
      // suffixed e.g. "... ออนไลน์") — a flat one-row-per-day sales sheet, unrelated
      // to the monthly production tabs. Detected by CONTENT (header keywords), not
      // by tab name, so a rename never silently drops this data again; the parser
      // itself returns [] fast for any sheet whose header doesn't match.
      try {
        var orderDays = parseOrderReportSheet_(sheet, tz);
        if (orderDays.length) {
          orderReportDays = mergeOrderReportDays_(orderReportDays, orderDays);
          return;
        }
      } catch (e4) { /* ignore malformed order-report sheet */ }
      // The "ปัญหารอแก้" workplace-obstacles log (unstable internet, printer/ink,
      // PC crashes, ...) — a flat one-row-per-issue sheet. Detected by CONTENT
      // (header keywords), not tab name, for the same rename-proofing reason as
      // the order-report sheet above.
      try {
        var issues = parseWorkIssuesSheet_(sheet, tz);
        if (issues.length) {
          workIssues = workIssues.concat(issues);
          return;
        }
      } catch (e5) { /* ignore malformed work-issues sheet */ }
      // Otherwise, if its name marks it as the error sheet, read it flat.
      if (nm.indexOf('ผิด') !== -1) {
        try {
          var errs = parseShipErrorSheet_(sheet, tz);
          if (errs.length) shipErrors = shipErrors.concat(errs);
        } catch (e2) { /* ignore malformed error sheet */ }
      }
      return;
    }

    parsed.dates.forEach(function (d) { dateSet[d] = true; });

    parsed.employees.forEach(function (emp) {
      // Totals are intentionally NOT accumulated here: if the same date ever
      // appears in more than one tab (e.g. a summary tab overlapping a
      // dedicated monthly tab), adding each tab's own subtotal would double
      // count it. byDate is merged by date key (later tabs overwrite), and
      // totals are recomputed from that deduplicated byDate once, below.
      // Keyed by name + team so a person who appears in both teams stays split.
      var team = emp.team || 'online';
      var empKey = emp.name + ' ' + team;
      if (!employeesMap[empKey]) {
        employeesMap[empKey] = { name: emp.name, team: team, byDate: {} };
      }
      var empTarget = employeesMap[empKey];
      Object.keys(emp.byDate).forEach(function (d) { empTarget.byDate[d] = emp.byDate[d]; });
    });

    if (parsed.target && !target) target = parsed.target;
    // ▶ ฝ่ายรับเข้า / ▶ ฝ่ายคลัง blocks found inside this monthly tab.
    if (parsed.receivingWarehouse) {
      receivingWarehouse = mergeReceivingWarehouse_(receivingWarehouse, parsed.receivingWarehouse);
    }
    if (parsed.targetsByTeam) {
      Object.keys(parsed.targetsByTeam).forEach(function (t) {
        if (!targetsByTeam[t]) targetsByTeam[t] = parsed.targetsByTeam[t];
      });
    }

    parsed.categories.forEach(function (cat) {
      if (!categoriesMap[cat.title]) categoriesMap[cat.title] = { id: cat.id, title: cat.title, rowsMap: {} };
      var catTarget = categoriesMap[cat.title];
      cat.rows.forEach(function (row) {
        if (!catTarget.rowsMap[row.label]) catTarget.rowsMap[row.label] = { label: row.label, note: row.note, byDate: {} };
        Object.keys(row.byDate).forEach(function (d) { catTarget.rowsMap[row.label].byDate[d] = row.byDate[d]; });
      });
    });

    parsed.shopSla.forEach(function (shop) {
      if (!shopMap[shop.shop]) shopMap[shop.shop] = { shop: shop.shop, criteriaMap: {} };
      var shopTarget = shopMap[shop.shop];
      shop.criteria.forEach(function (crit) {
        if (!shopTarget.criteriaMap[crit.label]) shopTarget.criteriaMap[crit.label] = { label: crit.label, byDate: {} };
        Object.keys(crit.byDate).forEach(function (d) { shopTarget.criteriaMap[crit.label].byDate[d] = crit.byDate[d]; });
      });
    });
  });

  var dates = Object.keys(dateSet).sort();
  if (dates.length === 0) throw new Error('No date columns found in any sheet tab');

  var employees = Object.keys(employeesMap).map(function (k) {
    var emp = employeesMap[k];
    var totalParcels = 0;
    var totalItems = 0;
    Object.keys(emp.byDate).forEach(function (d) {
      var entry = emp.byDate[d];
      if (typeof entry.parcels === 'number' && !isNaN(entry.parcels)) totalParcels += entry.parcels;
      if (typeof entry.items === 'number' && !isNaN(entry.items)) totalItems += entry.items;
    });
    return { name: emp.name, team: emp.team || 'online', byDate: emp.byDate, totalParcels: totalParcels, totalItems: totalItems };
  });

  // "Today" = the latest date that actually has recorded activity, not just
  // the latest column — monthly tabs pre-create every calendar day, so most
  // future days in the current month are blank placeholders.
  var activeDateSet = {};
  employees.forEach(function (e) {
    Object.keys(e.byDate).forEach(function (d) {
      var entry = e.byDate[d];
      if (entry && (entry.parcels !== null || entry.items !== null)) activeDateSet[d] = true;
    });
  });
  var activeDates = Object.keys(activeDateSet).sort();
  var todayDate = activeDates.length ? activeDates[activeDates.length - 1] : dates[dates.length - 1];
  var latestMonthKey = todayDate.slice(0, 7);

  // Team-wide production totals reflect the ONLINE line — that is the crew whose
  // KPI is parcel/item output. The offline crew is attendance/task based (no
  // parcel counts), so it would only contribute zeros here anyway.
  var onlineEmployees = employees.filter(function (e) { return (e.team || 'online') === 'online'; });
  var teamTotalsByDate = {};
  dates.forEach(function (d) {
    var parcels = 0, items = 0, active = 0;
    onlineEmployees.forEach(function (e) {
      var entry = e.byDate[d];
      if (entry) {
        if (typeof entry.parcels === 'number' && !isNaN(entry.parcels)) parcels += entry.parcels;
        if (typeof entry.items === 'number' && !isNaN(entry.items)) items += entry.items;
        if ((entry.parcels || 0) > 0 || (entry.items || 0) > 0) active++;
      }
    });
    teamTotalsByDate[d] = { parcels: parcels, items: items, activeEmployees: active };
  });

  var monthlyTotals = { parcels: 0, items: 0 };
  dates.forEach(function (d) {
    if (d.indexOf(latestMonthKey) === 0) {
      monthlyTotals.parcels += teamTotalsByDate[d].parcels;
      monthlyTotals.items += teamTotalsByDate[d].items;
    }
  });

  var categories = Object.keys(categoriesMap).map(function (title) {
    var cat = categoriesMap[title];
    return { id: cat.id, title: cat.title, rows: Object.keys(cat.rowsMap).map(function (l) { return cat.rowsMap[l]; }) };
  });

  var shopSla = Object.keys(shopMap).map(function (shopName) {
    var shop = shopMap[shopName];
    return { shop: shop.shop, criteria: Object.keys(shop.criteriaMap).map(function (l) { return shop.criteriaMap[l]; }) };
  });

  return {
    generatedAt: new Date().toISOString(),
    todayDate: todayDate,
    dates: dates,
    employees: employees,
    teamTotalsByDate: teamTotalsByDate,
    monthlyTotals: monthlyTotals,
    target: target,
    targetsByTeam: targetsByTeam,
    categories: categories,
    shopSla: shopSla,
    shipErrors: shipErrors,
    receivingWarehouse: receivingWarehouse,
    orderReport: orderReportDays.length ? { days: orderReportDays } : null,
    workIssues: workIssues
  };
}

/** Maps a team label from column B to a stable id. Anything containing "ออฟไลน์"
 * is the offline crew; everything else (incl. blank/"ออนไลน์") is the online line. */
function normalizeTeam_(label) {
  return label && String(label).indexOf('ออฟไลน์') !== -1 ? 'offline' : 'online';
}

function parseTargetValue_(text) {
  if (!text) return null;
  var m = String(text).match(/(\d+(\.\d+)?)/);
  return m ? Number(m[1]) : null;
}

/** First fieldKeys index whose label CONTAINS the given substring, else -1. */
function findFieldIndex_(fieldKeys, substr) {
  for (var i = 0; i < fieldKeys.length; i++) {
    if (String(fieldKeys[i]).indexOf(substr) !== -1) return i;
  }
  return -1;
}

/** Normalizes a displayed time string ("8:59", "18:40", "8.59") to zero-padded
 * "HH:mm". Returns null for blank/non-time text so downstream code can treat
 * "no check-in recorded" cleanly. */
function normalizeTime_(raw) {
  if (raw === '' || raw === null || raw === undefined) return null;
  var s = String(raw).trim();
  if (!s) return null;
  var m = s.match(/^(\d{1,2})[:.](\d{1,2})/);
  if (!m) return null;
  var h = parseInt(m[1], 10);
  var min = parseInt(m[2], 10);
  if (isNaN(h) || isNaN(min) || h > 23 || min > 59) return null;
  return (h < 10 ? '0' + h : '' + h) + ':' + (min < 10 ? '0' + min : '' + min);
}

/** Reads a check-in/out time robustly: the DISPLAYED "8:57" first, falling back to
 * the raw cell's own hours/minutes when the value is a 1899 time-of-day Date whose
 * display string isn't "HH:mm". */
function timeFromCell_(rawCell, dispCell) {
  var t = normalizeTime_(dispCell);
  if (t) return t;
  if (Object.prototype.toString.call(rawCell) === '[object Date]') {
    var h = rawCell.getHours(), m = rawCell.getMinutes();
    if (!isNaN(h) && !isNaN(m) && (h !== 0 || m !== 0)) {
      return (h < 10 ? '0' + h : '' + h) + ':' + (m < 10 ? '0' + m : '' + m);
    }
  }
  return null;
}

/** {name -> {name, byDate}} map to a list with value1/value2 totals. */
function rwPeopleList_(map) {
  return Object.keys(map).map(function (n) {
    var e = map[n];
    var t1 = 0, t2 = 0;
    Object.keys(e.byDate).forEach(function (dk) {
      var en = e.byDate[dk];
      if (typeof en.value1 === 'number') t1 += en.value1;
      if (typeof en.value2 === 'number') t2 += en.value2;
    });
    return { name: e.name, byDate: e.byDate, totalValue1: t1, totalValue2: t2 };
  });
}
