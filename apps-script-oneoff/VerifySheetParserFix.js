function verifySplitDocs() {
  var payload = buildDashboardPayload_();
  var wp = payload.workPerformance;
  Logger.log('dates: ' + wp.dates.length + ' (' + wp.dates[0] + ' .. ' + wp.dates[wp.dates.length-1] + ')');
  var stock = wp.employees.filter(function(e) { return e.department === 'คลัง'; });
  stock.forEach(function(e) {
    Logger.log(e.name + ' (' + e.operator + '): transferDocs=' + e.totals.transferDocs + ' replenishDocs=' + e.totals.replenishDocs);
  });
  var sample = stock.filter(function(e) { return e.totals.transferDocs > 0 || e.totals.replenishDocs > 0; })[0];
  if (sample) {
    var dates = Object.keys(sample.byDate).sort();
    Logger.log('sample employee ' + sample.name + ' byDate days=' + dates.length);
    dates.slice(0,5).forEach(function(d) {
      Logger.log('  ' + d + ' transferDocs=' + sample.byDate[d].transferDocs + ' replenishDocs=' + sample.byDate[d].replenishDocs);
    });
  }
  // Sanity check on someone from ออนไลน์/ออฟไลน์: should be 0/0.
  var online = wp.employees.filter(function(e) { return e.department === 'ออนไลน์'; })[0];
  if (online) {
    Logger.log('online sample ' + online.name + ' totals.transferDocs=' + online.totals.transferDocs + ' replenishDocs=' + online.totals.replenishDocs);
  }
}
