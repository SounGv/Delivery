/**
 * Web app entry point. Deploy this container-bound script (Extensions > Apps
 * Script from inside the target Google Sheet) as a Web App:
 *   Execute as: Me
 *   Who has access: Anyone
 *
 * GET {deployedUrl}?path=dashboard -> JSON payload for the dashboard page.
 * GET {deployedUrl}?path=claims    -> pre-claim registrations (sheet "เคลมสินค้า").
 * POST JSON { action: "createClaim"|"updateClaim", ... } -> write a claim row.
 *
 * No response caching here on purpose: CacheService's cache is shared at the
 * script-project level across ALL deployments (old and new), so if more than
 * one deployment URL is ever live at once, one can silently serve a cached
 * response computed by the other's (possibly older) code. Always recomputing
 * from the sheet avoids that cross-deployment staleness entirely.
 */

function jsonOutput_(output) {
  return ContentService
    .createTextOutput(JSON.stringify(output))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  var path = (e && e.parameter && e.parameter.path) || 'dashboard';
  var output;
  try {
    if (path === 'dashboard') {
      output = buildDashboardPayload_();
    } else if (path === 'claims') {
      output = { claims: listClaims_() };
    } else {
      output = { error: 'Unknown path: ' + path };
    }
  } catch (err) {
    output = { error: err && err.message ? err.message : String(err) };
  }
  return jsonOutput_(output);
}

function doPost(e) {
  var output;
  try {
    var body = {};
    if (e && e.postData && e.postData.contents) {
      body = JSON.parse(e.postData.contents);
    }
    var action = body.action || '';
    if (action === 'createClaim') {
      output = { claim: upsertClaim_(body.claim) };
    } else if (action === 'updateClaim') {
      output = { claim: updateClaim_(body.id, body.status, body.adminNote) };
    } else {
      output = { error: 'Unknown action: ' + action };
    }
  } catch (err) {
    output = { error: err && err.message ? err.message : String(err) };
  }
  return jsonOutput_(output);
}

var CLAIM_SHEET_NAME_ = 'เคลมสินค้า';
var CLAIM_HEADERS_ = [
  'รหัสเคลม', 'วันเวลาสร้าง', 'วันเวลาแก้ไข', 'สถานะ',
  'ชื่อลูกค้า', 'เบอร์โทร', 'ที่อยู่ผู้ส่ง',
  'เลขพัสดุ', 'ขนส่ง',
  'ชื่อผู้รับคืน', 'เบอร์ผู้รับคืน', 'ที่อยู่ส่งกลับ',
  'ใช้ที่อยู่ผู้ส่ง', 'ยี่ห้อ', 'รุ่น', 'Serial', 'เลขออเดอร์', 'อาการ',
  'หมายเหตุแอดมิน', 'วันรับเข้า'
];

function claimSheet_() {
  var ss = SpreadsheetApp.getActive();
  var sheet = ss.getSheetByName(CLAIM_SHEET_NAME_);
  if (!sheet) {
    sheet = ss.insertSheet(CLAIM_SHEET_NAME_);
    sheet.getRange(1, 1, 1, CLAIM_HEADERS_.length).setValues([CLAIM_HEADERS_]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function claimToRow_(c) {
  return [
    c.id || '',
    c.createdAt || '',
    c.updatedAt || '',
    c.status || 'pending_parcel',
    c.customerName || '',
    c.phone || '',
    c.senderAddress || '',
    c.trackingNumber || '',
    c.courier || '',
    c.returnName || '',
    c.returnPhone || '',
    c.returnAddress || '',
    c.sameAsSender ? 'TRUE' : 'FALSE',
    c.brand || '',
    c.model || '',
    c.serialNumber || '',
    c.orderRef || '',
    c.issue || '',
    c.adminNote || '',
    c.receivedAt || ''
  ];
}

function rowToClaim_(row) {
  return {
    id: String(row[0] || ''),
    createdAt: String(row[1] || ''),
    updatedAt: String(row[2] || ''),
    status: String(row[3] || 'pending_parcel'),
    customerName: String(row[4] || ''),
    phone: String(row[5] || ''),
    senderAddress: String(row[6] || ''),
    trackingNumber: String(row[7] || ''),
    courier: String(row[8] || ''),
    returnName: String(row[9] || ''),
    returnPhone: String(row[10] || ''),
    returnAddress: String(row[11] || ''),
    sameAsSender: String(row[12] || '') === 'TRUE',
    brand: String(row[13] || ''),
    model: String(row[14] || ''),
    serialNumber: String(row[15] || ''),
    orderRef: String(row[16] || ''),
    issue: String(row[17] || ''),
    adminNote: String(row[18] || ''),
    receivedAt: String(row[19] || '') || null
  };
}

function listClaims_() {
  var sheet = claimSheet_();
  var last = sheet.getLastRow();
  if (last < 2) return [];
  var values = sheet.getRange(2, 1, last - 1, CLAIM_HEADERS_.length).getDisplayValues();
  var out = [];
  for (var i = 0; i < values.length; i++) {
    var claim = rowToClaim_(values[i]);
    if (claim.id) out.push(claim);
  }
  return out;
}

function findClaimRow_(sheet, id) {
  var last = sheet.getLastRow();
  if (last < 2) return -1;
  var ids = sheet.getRange(2, 1, last - 1, 1).getDisplayValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) return i + 2;
  }
  return -1;
}

function upsertClaim_(claim) {
  if (!claim || !claim.id) throw new Error('missing claim id');
  var sheet = claimSheet_();
  var row = findClaimRow_(sheet, claim.id);
  var values = [claimToRow_(claim)];
  if (row > 0) {
    sheet.getRange(row, 1, 1, CLAIM_HEADERS_.length).setValues(values);
  } else {
    sheet.appendRow(claimToRow_(claim));
  }
  return claim;
}

function updateClaim_(id, status, adminNote) {
  if (!id) throw new Error('missing claim id');
  var sheet = claimSheet_();
  var row = findClaimRow_(sheet, id);
  if (row < 0) throw new Error('claim not found: ' + id);
  var current = rowToClaim_(sheet.getRange(row, 1, 1, CLAIM_HEADERS_.length).getDisplayValues()[0]);
  current.status = status || current.status;
  if (typeof adminNote === 'string') current.adminNote = adminNote;
  current.updatedAt = new Date().toISOString();
  if (current.status === 'received' && !current.receivedAt) {
    current.receivedAt = current.updatedAt;
  }
  sheet.getRange(row, 1, 1, CLAIM_HEADERS_.length).setValues([claimToRow_(current)]);
  return current;
}
