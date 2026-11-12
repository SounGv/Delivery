function diagStorePerm_() {
  var out = {};
  try { out.effectiveUser = Session.getEffectiveUser().getEmail(); } catch (e) { out.effectiveUserErr = String(e); }
  try { out.activeUser = Session.getActiveUser().getEmail(); } catch (e2) { out.activeUserErr = String(e2); }
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  try { out.owner = ss.getOwner() ? ss.getOwner().getEmail() : null; } catch (e3) { out.ownerErr = String(e3); }
  try { out.editors = ss.getEditors().map(function (u) { return u.getEmail(); }); } catch (e4) { out.editorsErr = String(e4); }
  var sheet = ss.getSheetByName('รายงานร้านค้า (BigSeller)');
  try {
    var prot = sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET).concat(sheet.getProtections(SpreadsheetApp.ProtectionType.RANGE));
    out.protections = prot.map(function (p) { return p.getDescription() + '|canEdit:' + p.canEdit(); });
  } catch (e5) { out.protectionsErr = String(e5); }
  try { out.lastRow = sheet.getLastRow(); } catch (e6) { out.lastRowErr = String(e6); }
  Logger.log('DIAG::' + JSON.stringify(out));
  return 'diag ok';
}
