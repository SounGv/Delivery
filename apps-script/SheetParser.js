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

  for (var r = 2; r < values.length; r++) {
    var row = values[r];
    var colA = row[0] !== '' && row[0] !== null ? String(row[0]).trim() : '';
    var colB = leadingCols > 1 && row[1] !== '' && row[1] !== null ? String(row[1]).trim() : '';
    var colC = leadingCols > 2 && row[2] !== '' && row[2] !== null ? String(row[2]).trim() : '';

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

  return {
    dates: blocks.map(function (b) { return b.dateKey; }),
    employees: Object.keys(employeesMap).map(function (k) { return employeesMap[k]; }),
    // Back-compat single target = the online production target.
    target: teamTargets.online || null,
    targetsByTeam: teamTargets,
    categories: otherCategories,
    shopSla: shopSla
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

  sheets.forEach(function (sheet) {
    var parsed;
    try {
      parsed = parseSheetTab_(sheet, tz);
    } catch (err) {
      parsed = null; // one malformed tab shouldn't break the whole dashboard
    }
    if (!parsed) {
      // Not a monthly date-block tab — if its name marks it as the error sheet, read it flat.
      var nm = sheet.getName();
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
    shipErrors: shipErrors
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
