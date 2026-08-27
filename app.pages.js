/* ================================================================
   PAGES — registers into ROUTES (defined in app.js)
   ================================================================ */
'use strict';

async function refresh(){ await loadBootstrap(); render(); }
function page(view, html){ view.innerHTML = html; icons(); }
function head(title, sub, right){ return `<div class="page-head"><div><div class="page-title">${esc(title)}</div>${sub?`<div class="page-sub">${sub}</div>`:''}</div>${right?`<div class="flex gap8 wrap aic">${right}</div>`:''}</div>`; }
function matchSearch(obj, fields){ if(!Store.search) return true; return fields.some(f=>String(obj[f]||'').toLowerCase().includes(Store.search)); }
/** แสดงเลข PO ลูกค้าก่อน แล้วค่อยเลขบิล SO */
function billLabel(d){
  const po = String((d && d.PoNo) || '').trim();
  const inv = String((d && d.InvoiceNo) || '').trim();
  if(po && inv && po !== inv) return { primary: po, secondary: inv };
  if(po) return { primary: po, secondary: '' };
  if(inv) return { primary: inv, secondary: '' };
  return { primary: '—', secondary: '' };
}
function billCellHtml(d){
  const b = billLabel(d);
  if(!b.secondary) return `<span class="mono small">${esc(b.primary)}</span>`;
  return `<div class="mono small"><div class="strong">${esc(b.primary)}</div><div class="muted" style="font-size:11px;margin-top:2px">${esc(b.secondary)}</div></div>`;
}
function billInlineHtml(d){
  const b = billLabel(d);
  if(!b.secondary) return `<span class="mono small muted">${esc(b.primary)}</span>`;
  return `<span class="mono small"><span class="strong">${esc(b.primary)}</span> <span class="muted">· ${esc(b.secondary)}</span></span>`;
}

/* ================================================================
   DASHBOARD
   ================================================================ */
function vehStatusCard(v){
  const st = deriveVehStatus(v);
  const dot = st==='In Use'?'🟢':st==='Stopped'?'🟡':st==='Stale'?'🟠':'⚪';
  const route = (Store.data.routes||[]).find(r=>r.Status==='In Progress' && (r.VehicleName===v.VehicleName||r.LicensePlate===v.LicensePlate));
  let sub;
  if(route){
    const stops = ((Store._live&&Store._live.stops)||[]).filter(s=>s.RouteID===route.RouteID);
    const cur = stops.find(s=>s.Status!=='Completed');
    sub = `${esc(route.DriverName||'ไม่มีชื่อคนขับ')} · ${cur?'📍 '+esc(cur.CustomerName):'ส่งครบทุกจุดแล้ว'}`;
  } else {
    sub = v.CurrentDriver ? esc(v.CurrentDriver)+' · ยังไม่เริ่มงาน' : 'ยังไม่เริ่มงาน';
  }
  const title = vehicleShortName(v);
  const subName = (v.LicensePlate && v.VehicleName && v.VehicleName!==v.LicensePlate) ? `<div class="small muted">${esc(v.VehicleName)}</div>` : '';
  const stLabel = st==='In Use'?int(v.speed)+' กม./ชม.':(st==='Stopped'?'จอดอยู่':(st==='Stale'?'สัญญาณขาด':''));
  return `<div class="veh-status-card">
    <div class="flex aic gap10" style="min-width:0;flex:1">
      <span style="font-size:16px;line-height:1;flex-shrink:0">${dot}</span>
      <div style="min-width:0"><div class="strong mono" style="font-size:13px">${esc(title)}</div>${subName}<div class="small muted" style="word-break:break-word">${sub}</div></div>
    </div>
    ${stLabel?`<div class="small muted tab veh-status-meta">${stLabel}</div>`:''}
  </div>`;
}
/** ดึงชื่อเขต/อำเภอจากที่อยู่ TRCloud — รองรับทั้งแบบเต็มและแบบย่อ */
function districtFromAddress(addr){
  const s = String(addr || '').replace(/\s+/g, ' ').trim();
  if (!s || /^MARKETING$/i.test(s)) return '';

  // เขตXXX / เขต XXX
  let m = s.match(/(?:^|\s)เขต\s*([\u0E00-\u0E7F][\u0E00-\u0E7F\s.-]{0,40})/);
  if (m) return 'เขต' + m[1].trim().split(/\s+/)[0];

  // อำเภอXXX
  m = s.match(/(?:^|\s)อำเภอ\s*([\u0E00-\u0E7F][\u0E00-\u0E7F\s.-]{0,40})/);
  if (m) return 'อำเภอ' + m[1].trim().split(/\s+/)[0];

  // อ.XXX
  m = s.match(/(?:^|\s)อ\.\s*([\u0E00-\u0E7F][\u0E00-\u0E7F.-]{0,40})/);
  if (m) return 'อำเภอ' + m[1].trim().split(/\s+/)[0];

  // เมืองXXX (อำเภอเมือง…) — มักไม่มีคำว่า อำเภอ
  m = s.match(/(?:^|\s)เมือง([\u0E00-\u0E7F][\u0E00-\u0E7F.-]{0,40})/);
  if (m) return 'อำเภอเมือง' + m[1].trim().split(/\s+/)[0];

  // กรุงเทพฯ แบบไม่มีคำว่า "เขต": … แขวง… <ชื่อเขต> กรุงเทพ…
  if (/กรุงเทพ/.test(s) && /แขวง/.test(s)) {
    m = s.match(/([\u0E00-\u0E7F]+)\s+กรุงเทพ/);
    if (m && m[1] !== 'แขวง') return 'เขต' + m[1].trim();
  }

  return '';
}
function shortAddr(addr, max){
  const s = String(addr || '').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  const n = max || 72;
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
/** TRCloud: organization มักมี (สาขา) ต่อท้าย — แยกชื่อกับ branch ให้ชัด */
function trcBranchLabel(row){
  const br = String((row && row.BranchName) || '').trim();
  if (br) return br;
  const m = String((row && row.CustomerName) || '').match(/\(([^)]+)\)\s*$/);
  return m ? m[1].trim() : '';
}
function trcCustomerName(row){
  if (!row) return '—';
  let name = String(row.CustomerName || '').trim();
  if (!name) return '—';
  const br = trcBranchLabel(row);
  if (br) {
    const escBr = br.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    name = name.replace(new RegExp('\\s*\\(' + escBr + '\\)\\s*$'), '').trim();
  } else {
    name = name.replace(/\s*\([^)]+\)\s*$/, '').trim();
  }
  return name || String(row.CustomerName || '').trim();
}
function trcAddressOnly(row){
  return String((row && row.Address) || '').trim();
}
function uniqueDocParts(d){
  const seen = new Set();
  const out = [];
  [d.PoNo, d.InvoiceNo].forEach(raw => {
    const v = String(raw || '').trim();
    if (!v) return;
    const key = v.replace(/\s+/g, '').toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(v);
  });
  return out;
}
function actIcon(a){ return {CREATE_DELIVERY:'package-plus',CREATE_ROUTE:'route',CREATE_CUSTOMER:'store',SYNC_CARTRACK:'satellite-dish',COMPLETE_DELIVERY:'check-circle-2',FAILED_DELIVERY:'x-circle',START_ROUTE:'play',CREATE_EXPENSE:'receipt',CREATE_CLAIM:'hand-coins',SEED:'database'}[a]||'activity'; }

ROUTES.dashboard = async function(view){
  const allDel = Store.data.deliveries || [];
  const queued = allDel.filter(d => DelView.isNoRoute(d) && !DelView.isGhost(d));
  const plannedOpen = allDel.filter(d => DelView.isOpen(d) && !DelView.isNoRoute(d) && !DelView.isGhost(d));
  const done = allDel.filter(d => DelView.isDone(d));
  const viewMode = dPick.viewMode || 'queue';
  const open = queued;
  const allOpen = queued.concat(plannedOpen);
  const basePool = viewMode === 'done' ? done : allOpen;
  const dispatchable = queued;
  const searched = basePool.filter(d => {
    if (!Store.search) return true;
    if (matchSearch(d, ['CustomerName','BranchName','InvoiceNo','PoNo','Address'])) return true;
    return DelView.zone(d).toLowerCase().includes(Store.search);
  });
  const rows = applyDeliveryFilter(searched);
  const staffList = staffCounts(basePool);
  const zoneList = districtCounts(viewMode === 'done' ? done : (dPick.filter === 'planned' ? plannedOpen : queued));
  const selIds = viewMode === 'queue' ? [...dPick.sel].filter(id => queued.some(d => d.DeliveryID === id)) : [];
  const selN = selIds.length;
  const selAmount = selIds.reduce((n, id) => {
    const d = open.find(x => x.DeliveryID === id);
    return n + (d ? (DelView.amount(d) || 0) : 0);
  }, 0);
  const allChecked = viewMode === 'queue' && rows.length > 0 && rows.every(d => dPick.sel.has(d.DeliveryID));
  const statsBase = viewMode === 'done' ? done : queued;
  const zoneNamed = districtCounts(statsBase).filter(([n]) => n !== 'ไม่ระบุเขต').length;
  const kpi = DelView.kpi(statsBase);
  const dueTodayN = queued.filter(d => DelView.sendOnIso(d) === Store.date).length;
  const overdueN = queued.filter(d => DelView.isOverdue(d)).length;
  const plannedN = plannedOpen.length;
  const headSub = viewMode === 'done'
    ? `${thDate(Store.date)} · ส่งแล้ว ${int(done.length)} ร้าน`
    : `${thDate(Store.date)} · รอจัดรถ ${int(dueTodayN)} บิล${overdueN ? ` · ค้าง ${int(overdueN)}` : ''}${plannedN ? ` · จัดแล้ว ${int(plannedN)}` : ''}`;

  page(view, `
    <div class="del-page">
    ${delMobShell({ openN: queued.length, doneN: done.length, zoneNamed, viewMode, openList: queued, baseList: statsBase, kpi })}
    ${viewMode === 'queue' ? delMobQueueHint() : delMobDoneHint()}
    <div class="desk-only">${head('วันนี้', headSub, `<button class="btn btn-sm" data-act="printSo"><i data-lucide="printer"></i>พิมพ์ให้น้าเอ๋</button><button class="btn btn-sm" data-act="sync"><i data-lucide="refresh-cw"></i>รีเฟรช</button>`)}</div>
    <div class="desk-only">${delViewTabsHtml(queued.length, done.length)}</div>
    ${viewMode === 'queue' ? todayGlanceHtml(queued) : ''}
    <div class="del-mob-toolbar desk-only">
      <div class="del-search mb14">
        <i data-lucide="search"></i>
        <input id="delSearchDesk" class="input" placeholder="ค้นหาร้าน เขต PO บิล…" value="${esc(Store.search || '')}" enterkeyhint="search" autocomplete="off">
      </div>
    </div>
    ${viewMode === 'queue' ? delScopeBarHtml(allOpen, zoneList) : delFilterChipsHtml(statsBase, { keys: ['workAll', 'syncArchive'] })}
    <div class="card del-list-card ${selN ? 'has-sel' : ''}" style="padding:0">
      <div class="desk-only">
        <div class="tbl-wrap del-tbl-sticky">
        ${rows.length ? `<table class="tbl del-tbl">
          ${delTableHead(staffList, zoneList, viewMode === 'done', basePool)}
          <tbody>${rows.map(d => {
            const zone = DelView.zone(d);
            const po = DelView.poNo(d);
            const inv = DelView.invoiceNo(d);
            const invShow = (inv && po && inv.replace(/\s+/g,'').toLowerCase() === po.replace(/\s+/g,'').toLowerCase()) ? '—' : (inv || '—');
            const chk = viewMode === 'queue'
              ? `<input type="checkbox" class="d-sel" data-sel="${esc(d.DeliveryID)}" ${dPick.sel.has(d.DeliveryID) ? 'checked' : ''}>`
              : '';
            return `<tr class="${dPick.sel.has(d.DeliveryID) ? 'row-sel' : ''}">
              <td class="c">${chk}</td>
              <td class="strong">${esc(d.CustomerName || '—')}${isSoPrinted(d.DeliveryID) ? ' <span class="so-printed">พิมพ์แล้ว</span>' : ''}${d.Address ? `<div class="small muted" style="font-weight:400;margin-top:2px">${esc(shortAddr(d.Address, 64))}</div>` : ''}</td>
              <td>${delStaffBadge(d)}</td>
              <td>${zone ? esc(zone) : '<span class="muted">—</span>'}</td>
              <td class="r">${delAmountHtml(d)}</td>
              <td class="mono small">${esc(po || '—')}</td>
              <td class="mono small">${esc(invShow)}</td>
              <td class="small tab">${DelView.docIso(d) ? thDate(DelView.docIso(d)) : '—'}</td>
              <td class="small tab">${DelView.dueIso(d) ? thDate(DelView.dueIso(d)) : '—'}</td>
              ${viewMode === 'done' ? `<td>${delStatusBadge(d)}</td>` : ''}
              <td class="c del-act">${delRowActionsHtml(d, viewMode)}</td>
            </tr>`;
          }).join('')}</tbody>
        </table>` : (Store.search
          ? emptyState('ไม่มีงานในวันนี้ตามคำค้น','หน้านี้ดูแค่วันทำงานที่เลือก — บิลที่ส่งแล้ววันอื่นให้ค้นหาย้อนหลัง',
              `<button type="button" class="btn btn-primary" id="delHistSearch"><i data-lucide="package-search"></i>ค้นหาย้อนหลัง</button>`)
          : emptyState(dPick.filter === 'planned' ? 'ยังไม่มีรอบที่จัดแล้ววันนี้' : 'จัดรถครบแล้ว','บิลที่กดจัดรถแล้วไม่โชว์ที่นี่ — ไปเมนูจัดรถเพื่อแก้ไขถ้าผิด',
              `<a class="btn btn-primary" href="#/planning"><i data-lucide="route"></i>ดูรอบที่จัดแล้ว</a>`))}
        </div>
      </div>
      <div class="m-only">
        ${rows.length ? `<div class="job-card-list">${rows.map(d => delMobileCard(d, { viewMode })).join('')}</div>` : (Store.search
          ? emptyState('ไม่มีงานในวันนี้ตามคำค้น','ลองเปลี่ยนวัน หรือค้นหาย้อนหลังข้ามวัน',
              `<button type="button" class="btn btn-primary" id="delHistSearchMob"><i data-lucide="package-search"></i>ค้นหาย้อนหลัง</button>`)
          : emptyState(dPick.filter === 'planned' ? 'ยังไม่มีรอบที่จัดแล้ววันนี้' : 'จัดรถครบแล้ว','บิลที่กดจัดรถแล้วไปอยู่เมนูจัดรถ — กดแก้ไขได้ถ้าผิด',
              `<a class="btn btn-primary" href="#/planning"><i data-lucide="route"></i>ดูรอบที่จัดแล้ว</a>`))}
      </div>
    </div>
    ${viewMode === 'queue' ? delSelectionBar(selN, selAmount) : ''}
    </div>
  `);

  $$('[data-del-view]', view).forEach(b => b.onclick = () => {
    dPick.viewMode = b.dataset.delView || 'queue';
    if (dPick.viewMode === 'done') dPick.sel.clear();
    ROUTES.dashboard(view);
  });
  $$('[data-dfilter]', view).forEach(b => b.onclick = () => {
    dPick.filter = b.dataset.dfilter || 'all';
    ROUTES.dashboard(view);
  });
  const sy = view.querySelector('[data-act="sync"]'); if (sy) sy.onclick = async e => { e.target.closest('button').disabled = true; await loadBootstrap(); render(); toast('รีเฟรชข้อมูลแล้ว','ok'); };
  const bindDelSearch = (ds) => {
    if (!ds) return;
    ds.oninput = () => {
      Store.search = ds.value.trim().toLowerCase();
      clearTimeout(ds._t);
      ds._t = setTimeout(() => ROUTES.dashboard(view), 200);
    };
  };
  bindDelSearch(view.querySelector('#delSearch'));
  bindDelSearch(view.querySelector('#delSearchDesk'));
  const goHistSearch = () => {
    const q = String(Store.search || '').trim();
    if (!q) return;
    Store._trkQ = q;
    location.hash = '#/tracking';
  };
  const histBtn = view.querySelector('#delHistSearch');
  if (histBtn) histBtn.onclick = goHistSearch;
  const histBtnMob = view.querySelector('#delHistSearchMob');
  if (histBtnMob) histBtnMob.onclick = goHistSearch;
  [view.querySelector('#delSearch'), view.querySelector('#delSearchDesk')].forEach(inp => {
    if (!inp) return;
    inp.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      const q = inp.value.trim();
      if (!q || rows.length) return;
      Store.search = q.toLowerCase();
      goHistSearch();
    });
  });
  const fn = view.querySelector('#fName');
  if (fn) {
    fn.oninput = () => {
      dPick.nameFilter = fn.value.trim();
      clearTimeout(fn._t);
      fn._t = setTimeout(() => ROUTES.dashboard(view), 200);
    };
  }
  const fs = view.querySelector('#fStaff');
  if (fs) fs.onchange = () => { dPick.staffFilter = fs.value; ROUTES.dashboard(view); };
  const bindColSelect = (id, key) => {
    const elSel = view.querySelector('#' + id);
    if (elSel) elSel.onchange = () => { dPick[key] = elSel.value; ROUTES.dashboard(view); };
  };
  bindColSelect('fAmount', 'amountFilter');
  bindColSelect('fPo', 'poFilter');
  bindColSelect('fInv', 'invFilter');
  bindColSelect('fDocDate', 'docDateFilter');
  bindColSelect('fDueDate', 'dueDateFilter');
  const fZoneWrap = view.querySelector('#fZoneWrap');
  const fZoneBtn = view.querySelector('#fZoneBtn');
  const fZonePop = view.querySelector('#fZonePop');
  if (fZoneBtn && fZonePop && fZoneWrap) {
    const closeZonePop = () => {
      fZonePop.hidden = true;
      fZoneBtn.setAttribute('aria-expanded', 'false');
    };
    fZoneBtn.onclick = (e) => {
      e.stopPropagation();
      if (fZonePop.hidden) {
        fZonePop.hidden = false;
        fZoneBtn.setAttribute('aria-expanded', 'true');
      } else closeZonePop();
    };
    fZonePop.onclick = (e) => e.stopPropagation();
    const clr = fZonePop.querySelector('[data-zone-clear]');
    if (clr) clr.onclick = () => { toggleDistrictPick('', dispatchable); ROUTES.dashboard(view); };
    fZonePop.querySelectorAll('input[data-zone-filter]').forEach(cb => {
      cb.onchange = () => {
        const key = cb.dataset.zoneFilter;
        if (cb.checked && !dPick.districts.has(key)) toggleDistrictPick(key, dispatchable);
        else if (!cb.checked && dPick.districts.has(key)) toggleDistrictPick(key, dispatchable);
        ROUTES.dashboard(view);
      };
    });
    setTimeout(() => {
      const onDoc = (e) => {
        if (!fZoneWrap.contains(e.target)) {
          closeZonePop();
          document.removeEventListener('click', onDoc);
        }
      };
      document.addEventListener('click', onDoc);
    }, 0);
  }
  // เลิกใช้ชิปเขตยาว — ไม่ bind data-district จากแถบเก่าแล้ว
  $$('[data-district]', view).forEach(b => b.onclick = () => {
    toggleDistrictPick(b.dataset.district || '', open);
    ROUTES.dashboard(view);
  });
  const selAll = view.querySelector('#dSelAll');
  if (selAll) {
    selAll.checked = allChecked;
    selAll.onchange = () => {
      if (selAll.checked) rows.forEach(d => dPick.sel.add(d.DeliveryID));
      else rows.forEach(d => dPick.sel.delete(d.DeliveryID));
      ROUTES.dashboard(view);
    };
  }
  $$('.d-sel', view).forEach(cb => cb.onchange = () => {
    if (cb.checked) dPick.sel.add(cb.dataset.sel); else dPick.sel.delete(cb.dataset.sel);
    ROUTES.dashboard(view);
  });
  $$('.job-card[data-card]', view).forEach(card => {
    card.onclick = (e) => {
      if (viewMode !== 'queue') return;
      if (e.target.closest('input,button,a,label')) return;
      const cb = card.querySelector('.d-sel');
      if (!cb) return;
      cb.checked = !cb.checked;
      cb.dispatchEvent(new Event('change', { bubbles: true }));
    };
  });
  $$('[data-quick]', view).forEach(btn => btn.onclick = (e) => {
    e.stopPropagation();
    const d = rows.find(x => x.DeliveryID === btn.dataset.quick) || allDel.find(x => x.DeliveryID === btn.dataset.quick);
    if (d) quickDispatch(d);
  });
  $$('[data-del-edit]', view).forEach(btn => btn.onclick = (e) => {
    e.stopPropagation();
    const d = allDel.find(x => x.DeliveryID === btn.dataset.delEdit) || rows.find(x => x.DeliveryID === btn.dataset.delEdit);
    if (d) deliveryForm(d);
  });
  $$('[data-del-row-del]', view).forEach(btn => btn.onclick = (e) => {
    e.stopPropagation();
    const d = allDel.find(x => x.DeliveryID === btn.dataset.delRowDel) || rows.find(x => x.DeliveryID === btn.dataset.delRowDel);
    if (!d) return;
    confirmDialog(`ลบบิล "${d.CustomerName || d.InvoiceNo || d.PoNo || ''}" ? (กู้คืนได้)`, () => {
      deleteLocal('deliveries', 'deleteDelivery', d.DeliveryID, { id: d.DeliveryID }).then(() => {
        dPick.sel.delete(d.DeliveryID);
        toast('ลบบิลแล้ว', 'ok');
      }).catch(() => {});
    }, { danger: true, yes: 'ลบ' });
  });
  const planBtn = view.querySelector('#dselPlan');
  if (planBtn) planBtn.onclick = (e) => {
    e.preventDefault();
    Plan.result = null;
    handoffSelectionToPlan([...dPick.sel]);
    location.hash = '#/planning';
  };
  const editSelBtn = view.querySelector('[data-act="dselEdit"]');
  if (editSelBtn) editSelBtn.onclick = () => bulkEditSelectedDeliveries(view);
  const priSelBtn = view.querySelector('[data-act="dselPriority"]');
  if (priSelBtn) priSelBtn.onclick = () => bulkPrioritySelectedDeliveries(view);
  const delSelBtn = view.querySelector('[data-act="dselDelete"]');
  if (delSelBtn) delSelBtn.onclick = () => bulkDeleteSelectedDeliveries(view);
  const clr = view.querySelector('[data-act="dselClear"]'); if (clr) clr.onclick = () => { dPick.sel.clear(); dPick.districts.clear(); ROUTES.dashboard(view); };
  $$('[data-ship-filter]', view).forEach(b => b.onclick = () => {
    dPick.shipFilter = b.dataset.shipFilter || '';
    ROUTES.dashboard(view);
  });
  $$('[data-shop-ids]', view).forEach(b => b.onclick = () => {
    String(b.dataset.shopIds || '').split(',').filter(Boolean).forEach(id => dPick.sel.add(id));
    ROUTES.dashboard(view);
  });
  const bindPrintSo = (btn, getList) => {
    if (!btn) return;
    btn.onclick = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      btn.disabled = true;
      try { await printSaleOrdersForNaaAe(getList()); }
      catch (err) { toast(String((err && err.message) || err), 'err'); }
      finally { btn.disabled = false; if (view.isConnected) ROUTES.dashboard(view); }
    };
  };
  $$('[data-act="printSo"]', view).forEach(btn => bindPrintSo(btn, () => todayGlanceModel(open).self));
  bindPrintSo(view.querySelector('[data-act="dselPrintSo"]'), () => (open || []).filter(d => dPick.sel.has(d.DeliveryID)));
  const printShopsBtn = view.querySelector('[data-act="printShops"]');
  if (printShopsBtn) printShopsBtn.onclick = () => printTodayShopList(todayGlanceModel(open).self);
  $$('[data-print-so]', view).forEach(btn => btn.onclick = async (e) => {
    e.stopPropagation();
    const d = allDel.find(x => x.DeliveryID === btn.dataset.printSo) || rows.find(x => x.DeliveryID === btn.dataset.printSo);
    if (d) await printSaleOrdersForNaaAe([d]);
  });
};

/* ================================================================
   DELIVERIES — UI Phase (frontend only)
   ใช้ field จาก API เดิมผ่าน View Model — ไม่แตะ backend / mapping
   ================================================================ */
const dPick = { sel: new Set(), districts: new Set(), filter: 'noRoute', viewMode: 'queue', nameFilter: '', staffFilter: '', shipFilter: '', amountFilter: '', poFilter: '', invFilter: '', docDateFilter: '', dueDateFilter: '', lastSyncAt: localStorage.getItem('ddc_trc_sync_at') || '' };
const DFILTERS = [
  { key:'noRoute', label:'รอจัดรถ' },
  { key:'overdue', label:'เลยกำหนด' },
  { key:'planned', label:'จัดแล้ว' },
  { key:'dueToday', label:'ต้องส่งวันนี้' },
  { key:'workAll', label:'ทั้งคิว' },
  { key:'syncArchive', label:'บิลเก่า sync' },
];

/** View Model: อ่าน field เดิมเท่านั้น — ไม่เปลี่ยนชื่อ API */
const DelView = {
  /** วันต้องส่งจริง = DueDate ถ้ามี ไม่ก็วันทำงาน (DeliveryDate) */
  sendOnIso(d){
    const due = String(d.DueDate || '').slice(0, 10);
    if (due && due !== '0000-00-00') return due;
    return String(d.DeliveryDate || '').slice(0, 10);
  },
  dueIso(d){ return this.sendOnIso(d); },
  docIso(d){ return String(d.DocumentDate || '').slice(0, 10); },
  isOpen(d){ return ['Draft','Pending','Planned','Assigned','In Progress',''].includes(d.Status || ''); },
  isDone(d){ return d.Status === 'Completed'; },
  /** แถวว่างไม่มีบิล/PO/มูลค่า — ไม่ควรโผล่ในคิว (ทำให้ user งง) */
  isGhost(d){
    if (d.RouteID) return false;
    if (['Planned','Assigned','In Progress'].includes(d.Status || '')) return false;
    if (String(d.InvoiceNo || '').trim()) return false;
    if (this.amount(d)) return false;
    if (String(d.PoNo || '').trim()) return false;
    return true;
  },
  /** บิลเก่าที่ sync มาแล้วปิดเป็น Completed (ไม่ใช่งานที่ส่งวันนี้) */
  isSyncArchive(d){
    if (!this.isDone(d)) return false;
    const due = this.dueIso(d);
    if (due && due < Store.date) return true;
    const note = String(d.Note || '');
    return /auto-complete-past|trcloud-sync/i.test(note) || note.includes('[DISPATCH:DELIVERED]');
  },
  isNoRoute(d){ return !(d.RouteID) && (d.Status === 'Draft' || d.Status === 'Pending' || !d.Status); },
  isDueToday(d){ return this.sendOnIso(d) === Store.date && this.isOpen(d); },
  isOverdue(d){ const due = this.sendOnIso(d); return !!(due && due < Store.date && this.isOpen(d)); },
  /** มูลค่า — ใช้เฉพาะถ้า API มี Amount/GrandTotal/Total อยู่แล้ว */
  amount(d){
    const n = Number(d.Amount ?? d.GrandTotal ?? d.Total ?? d.OrderAmount);
    return Number.isFinite(n) && n > 0 ? n : null;
  },
  /** PR จาก field เดิม หรือดึงจาก Note ถ้ามีข้อความ PR… (ไม่ invent) */
  prNo(d){
    if (d.PrNo || d.PRNo || d.PR) return String(d.PrNo || d.PRNo || d.PR).trim();
    const m = String(d.Note || '').match(/\bPR[\w\/.-]+/i);
    return m ? m[0] : '';
  },
  /** พนักงานขาย / ช่องทาง TRCloud — เช่น 116-WALK-IN, 04-TENG */
  salesStaff(d){
    if (d.SalesStaff) return String(d.SalesStaff).trim();
    const note = String(d.Note || '');
    let m = note.match(/พนักงานขาย:\s*([^·|]+)/);
    if (m) return m[1].trim();
    const first = note.split('·')[0].trim();
    if (/^\d{2,3}-[\w-]+$/i.test(first) || /WALK-IN/i.test(first)) return first;
    m = note.match(/\b(\d{2,3}-[A-Z0-9-]+)\b/i);
    return m ? m[1].trim() : '';
  },
  isWalkIn(d){ return /WALK-IN/i.test(this.salesStaff(d) + ' ' + (d.Note || '') + ' ' + (d.BranchName || '')); },
  /** ช่องทางส่ง — แยกตั้งแต่เปิดบิล ไม่ต้องรอจัดรถ: ส่งเอง / ขนส่งอื่น / WALK-IN */
  shipChannel(d){
    if (this.isWalkIn(d)) return 'walkin';
    const blob = [d.Note, d.BranchName, d.Address, d.CustomerName, this.salesStaff(d)].join(' ');
    if (/(Kerry|Flash|SPX|J&T|JNT|BEST\s*Express|Ninja|ไปรษณีย์|Kerry Express|ขนส่งอื่น|ขนส่งKerry|Lalamove)/i.test(blob)) return 'courier';
    return 'self';
  },
  shipLabel(ch){
    return ch === 'walkin' ? 'WALK-IN' : (ch === 'courier' ? 'ขนส่งอื่น' : 'ส่งเอง');
  },
  poNo(d){ return String(d.PoNo || '').trim(); },
  invoiceNo(d){ return String(d.InvoiceNo || '').trim(); },
  /** เขต จากที่อยู่เดิม — ไม่คิดทิศเข็มทิศ */
  zone(d){
    if (d.Zone || d.DeliveryZone) return String(d.Zone || d.DeliveryZone);
    return districtFromAddress(d.Address);
  },
  /** ป้ายสถานะสำหรับ UI ตาม mock (derive จาก Status + DueDate เดิม) */
  uiStatus(d){
    if (d.Status === 'Completed') {
      if (this.isSyncArchive(d)) return { label:'บิลเก่า sync', cls:'b-gray' };
      return { label:'ส่งแล้ว', cls:'b-green' };
    }
    if (d.Status === 'Failed') return { label:'ไม่สำเร็จ', cls:'b-red' };
    if (d.Status === 'Cancelled') return { label:'ยกเลิก', cls:'b-gray' };
    if (d.Status === 'In Progress' || d.Status === 'Assigned') return { label:'กำลังส่ง', cls:'b-blue' };
    if (d.Status === 'Planned' || d.RouteID) return { label:'วางแผนแล้ว', cls:'b-violet' };
    if (this.isOverdue(d)) return { label:'เลยกำหนด', cls:'b-red' };
    if (this.isDueToday(d)) return { label:'กำหนดส่งวันนี้', cls:'b-amber' };
    return { label:'ยังไม่จัดรถ', cls:'b-blue' };
  },
  refsLine(d){
    return uniqueDocParts(d).join(' · ') || '—';
  },
  kpi(list){
    const all = list || [];
    return {
      total: all.length,
      noRoute: all.filter(d => this.isNoRoute(d)).length,
      dueToday: all.filter(d => this.isDueToday(d)).length,
      overdue: all.filter(d => this.isOverdue(d)).length,
      done: all.filter(d => d.Status === 'Completed').length,
      amountSum: all.reduce((n, d) => n + (this.amount(d) || 0), 0),
    };
  },
};

function applyDeliveryFilter(rows){
  let out = rows;
  const f = dPick.filter || 'noRoute';
  const doneView = dPick.viewMode === 'done';
  if (!doneView) {
    if (f === 'noRoute' || f === 'dueToday' || f === 'all') out = out.filter(d => DelView.isNoRoute(d) && DelView.sendOnIso(d) === Store.date);
    else if (f === 'overdue') out = out.filter(d => DelView.isOverdue(d) && DelView.isNoRoute(d));
    else if (f === 'planned') out = out.filter(d => !DelView.isNoRoute(d) && DelView.isOpen(d));
    else if (f === 'workAll') out = out.filter(d => DelView.isNoRoute(d));
  } else {
    if (f === 'syncArchive') out = out.filter(d => DelView.isSyncArchive(d));
    if (f === 'noRoute') out = out.filter(d => DelView.isNoRoute(d));
  }
  if (f === 'selected') out = out.filter(d => dPick.sel.has(d.DeliveryID));
  if (dPick.districts.size) {
    out = out.filter(d => dPick.districts.has(deliveryDistrictKey(d)));
  }
  const nf = String(dPick.nameFilter || '').trim().toLowerCase();
  if (nf) out = out.filter(d => String(d.CustomerName || '').toLowerCase().includes(nf));
  const sf = dPick.staffFilter;
  if (sf === '__walkin__') out = out.filter(d => DelView.isWalkIn(d));
  else if (sf) out = out.filter(d => DelView.salesStaff(d) === sf);
  const ch = dPick.shipFilter;
  if (ch) out = out.filter(d => DelView.shipChannel(d) === ch);
  if (dPick.amountFilter === '__none__') out = out.filter(d => DelView.amount(d) == null);
  else if (dPick.amountFilter) {
    const want = Number(dPick.amountFilter);
    out = out.filter(d => DelView.amount(d) === want);
  }
  if (dPick.poFilter === '__none__') out = out.filter(d => !DelView.poNo(d));
  else if (dPick.poFilter) out = out.filter(d => DelView.poNo(d) === dPick.poFilter);
  if (dPick.invFilter === '__none__') out = out.filter(d => !DelView.invoiceNo(d));
  else if (dPick.invFilter) out = out.filter(d => DelView.invoiceNo(d) === dPick.invFilter);
  if (dPick.docDateFilter === '__none__') out = out.filter(d => !DelView.docIso(d));
  else if (dPick.docDateFilter) out = out.filter(d => DelView.docIso(d) === dPick.docDateFilter);
  if (dPick.dueDateFilter === '__none__') out = out.filter(d => !String(d.DueDate || '').slice(0, 10));
  else if (dPick.dueDateFilter) out = out.filter(d => DelView.sendOnIso(d) === dPick.dueDateFilter);
  return out;
}
function deliveryDistrictKey(d){
  return DelView.zone(d) || '__none__';
}
function deliveryDistrictLabel(key){
  return key === '__none__' ? 'ไม่ระบุเขต' : key;
}
function deliveriesForDistrict(list, distKey){
  return normalizeDeliveries((list || []).filter(d => deliveryDistrictKey(d) === distKey));
}
function toggleDistrictPick(distKey, dispatchable){
  if (!distKey) {
    dPick.districts.clear();
    dPick.sel.clear();
    Plan.result = null;
    return;
  }
  if (dPick.districts.has(distKey)) {
    dPick.districts.delete(distKey);
    deliveriesForDistrict(dispatchable, distKey).forEach(d => dPick.sel.delete(d.DeliveryID));
  } else {
    dPick.districts.add(distKey);
    deliveriesForDistrict(dispatchable, distKey).forEach(d => dPick.sel.add(d.DeliveryID));
  }
  Plan.result = null;
}
function delDistrictFilterLabel(){
  const ds = dPick.districts;
  if (!ds.size) return 'ทั้งหมด';
  if (ds.size === 1) return deliveryDistrictLabel([...ds][0]);
  return int(ds.size) + ' เขต';
}
function deliveryFilterCounts(allRows){
  const list = allRows || [];
  return {
    dueToday: list.filter(d => DelView.isNoRoute(d) && DelView.sendOnIso(d) === Store.date).length,
    overdue: list.filter(d => DelView.isOverdue(d) && DelView.isNoRoute(d)).length,
    noRoute: list.filter(d => DelView.isNoRoute(d) && DelView.sendOnIso(d) === Store.date).length,
    planned: list.filter(d => !DelView.isNoRoute(d) && DelView.isOpen(d)).length,
    workAll: list.filter(d => DelView.isNoRoute(d)).length,
    all: list.filter(d => DelView.isNoRoute(d) && DelView.sendOnIso(d) === Store.date).length,
    syncArchive: list.filter(d => DelView.isSyncArchive(d)).length,
    selected: list.filter(d => dPick.sel.has(d.DeliveryID)).length,
  };
}
function routeVehicleLabel(routeId){
  if (!routeId) return '';
  const r = (Store.data.routes || []).find(x => x.RouteID === routeId);
  if (!r) return routeId;
  return r.LicensePlate || r.VehicleName || r.ProviderName || r.DriverName || routeId;
}
function staffCounts(list){
  const map = new Map();
  (list || []).forEach(d => {
    const s = DelView.salesStaff(d);
    if (!s) return;
    map.set(s, (map.get(s) || 0) + 1);
  });
  return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'th'));
}
function delStaffFilterHtml(staffList){
  const opts = ['<option value="">ทั้งหมด</option>',
    `<option value="__walkin__"${dPick.staffFilter === '__walkin__' ? ' selected' : ''}>WALK-IN ทั้งหมด</option>`]
    .concat(staffList.map(([name, n]) =>
      `<option value="${esc(name)}"${dPick.staffFilter === name ? ' selected' : ''}>${esc(name)} (${int(n)})</option>`
    ));
  return `<select class="select del-filter-input" id="fStaff" title="กรองช่องทาง / พนักงานขาย">${opts.join('')}</select>`;
}
function delValueCounts(list, getKey){
  const map = new Map();
  let none = 0;
  (list || []).forEach(d => {
    const key = getKey(d);
    if (key == null || key === '') { none += 1; return; }
    const k = String(key);
    map.set(k, (map.get(k) || 0) + 1);
  });
  const rows = [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'th'));
  return { rows, none };
}
function delSelectFilterHtml(id, cur, title, counts, labelFn){
  const opts = [`<option value="">ทั้งหมด</option>`];
  if (counts.none) {
    opts.push(`<option value="__none__"${cur === '__none__' ? ' selected' : ''}>ไม่ระบุ (${int(counts.none)})</option>`);
  }
  counts.rows.forEach(([val, n]) => {
    const label = labelFn ? labelFn(val) : val;
    opts.push(`<option value="${esc(val)}"${cur === val ? ' selected' : ''}>${esc(label)} (${int(n)})</option>`);
  });
  return `<select class="select del-filter-input" id="${esc(id)}" title="${esc(title)}">${opts.join('')}</select>`;
}
function delAmountFilterHtml(list){
  const c = delValueCounts(list, d => {
    const a = DelView.amount(d);
    return a == null ? '' : String(a);
  });
  return delSelectFilterHtml('fAmount', dPick.amountFilter, 'กรองมูลค่า', c, v => money(Number(v)));
}
function delPoFilterHtml(list){
  return delSelectFilterHtml('fPo', dPick.poFilter, 'กรองเลขที่เอกสารอ้างอิง', delValueCounts(list, d => DelView.poNo(d)));
}
function delInvFilterHtml(list){
  return delSelectFilterHtml('fInv', dPick.invFilter, 'กรองเลขบิล', delValueCounts(list, d => DelView.invoiceNo(d)));
}
function delDocDateFilterHtml(list){
  return delSelectFilterHtml('fDocDate', dPick.docDateFilter, 'กรองวันที่ออกเอกสาร', delValueCounts(list, d => DelView.docIso(d)), v => thDate(v));
}
function delDueDateFilterHtml(list){
  return delSelectFilterHtml('fDueDate', dPick.dueDateFilter, 'กรองกำหนดส่งของ', delValueCounts(list, d => DelView.dueIso(d)), v => thDate(v));
}
function delDistrictFilterHtml(districtList, prefix){
  const p = prefix || 'fZone';
  const ds = dPick.districts;
  const items = (districtList || []).map(([name, n]) => {
    const key = name === 'ไม่ระบุเขต' ? '__none__' : name;
    const on = ds.has(key);
    return `<label class="del-zone-opt"><input type="checkbox" data-zone-filter="${esc(key)}"${on ? ' checked' : ''}> ${esc(name)} (${int(n)})</label>`;
  });
  return `<div class="del-zone-multi" id="${p}Wrap">
    <button type="button" class="del-zone-btn del-filter-input" id="${p}Btn" aria-expanded="false" title="เลือกได้หลายเขต">${esc(delDistrictFilterLabel())}</button>
    <div class="del-zone-pop scrolly" id="${p}Pop" hidden>
      <button type="button" class="del-zone-clear" data-zone-clear>ล้าง · แสดงทั้งหมด</button>
      ${items.join('') || '<div class="small muted" style="padding:6px 8px">ไม่มีข้อมูลเขต</div>'}
    </div>
  </div>`;
}
function delMobShell({ openN, doneN, zoneNamed, viewMode, openList, baseList, kpi }){
  const amt = kpi && kpi.amountSum > 0 ? `<span class="del-mob-stat"><b class="tab">${money(kpi.amountSum)}</b><span>มูลค่า</span></span>` : '';
  const zoneStat = zoneNamed ? `<span class="del-mob-stat"><b>${int(zoneNamed)}</b><span>เขต</span></span>` : '';
  const queueStat = viewMode === 'done'
    ? `<span class="del-mob-stat"><b>${int(doneN)}</b><span>ส่งแล้ว</span></span>`
    : `<span class="del-mob-stat accent"><b>${int(openN)}</b><span>รอส่ง</span></span>`;
  return `<div class="del-mob-shell m-only">
    <div class="del-mob-shell-top">
      <div class="del-mob-shell-title">
        <div class="del-mob-app-title">วันนี้</div>
        <div class="del-mob-app-date">${esc(thDate(Store.date))}</div>
      </div>
      <button type="button" class="icon-btn del-mob-sync" data-act="printSo" title="พิมพ์ให้น้าเอ๋" aria-label="พิมพ์ให้น้าเอ๋"><i data-lucide="printer"></i></button>
      <button type="button" class="icon-btn del-mob-sync" data-act="sync" title="รีเฟรช" aria-label="รีเฟรช"><i data-lucide="refresh-cw"></i></button>
    </div>
    <div class="del-mob-stats">${queueStat}${zoneStat}${amt}</div>
    ${delViewTabsHtml(openN, doneN, { compact: true })}
    <div class="del-search del-mob-search">
      <i data-lucide="search"></i>
      <input id="delSearch" class="input" placeholder="ค้นหาร้าน เขต PO บิล…" value="${esc(Store.search || '')}" enterkeyhint="search" autocomplete="off">
    </div>
  </div>`;
}
function delMobPageHead(title, sub){
  return `<div class="del-mob-page-head m-only">
    <div>
      <div class="page-title">${esc(title)}</div>
      <div class="page-sub">${sub}</div>
    </div>
    <div class="del-mob-actions">
      <button type="button" class="icon-btn" data-act="sync" title="รีเฟรช" aria-label="รีเฟรช"><i data-lucide="refresh-cw"></i></button>
    </div>
  </div>
  <div class="desk-only">${head(title, sub, `<button class="btn btn-sm" data-act="sync"><i data-lucide="refresh-cw"></i>รีเฟรช</button>`)}</div>`;
}
function delMobQueueHint(){
  return `<div class="notice info mb14 desk-only"><i data-lucide="info"></i><div><b>รู้ร้านล่วงหน้า:</b> คีย์ SO แล้วร้านขึ้นทันที · กด <b>พิมพ์ให้น้าเอ๋</b> แล้วค่อยจัดรถ · บิลที่จัดรถแล้วไปอยู่เมนูจัดรถ</div></div>`;
}
function delMobDoneHint(){
  return `<div class="del-mob-done-note m-only">บิลส่งแล้ว — ไม่แสดงในคิวจัดรถ</div>
  <div class="notice ok mb14 desk-only"><i data-lucide="check-circle-2"></i><div>บิลที่<strong>ส่งแล้ว</strong> — ไม่แสดงในคิวจัดรถ · sync จาก TRCloud จะข้ามบิลที่มีเครื่องหมาย <span class="mono">[DISPATCH:DELIVERED]</span> แล้ว</div></div>`;
}
function delViewTabsHtml(openN, doneN, opts){
  const compact = opts && opts.compact;
  const mode = dPick.viewMode || 'queue';
  const tab = (key, label, n) => `<button type="button" class="pw-step ${mode === key ? 'on' : ''}" data-del-view="${key}" role="tab" aria-selected="${mode === key}">${esc(label)}<span class="del-tab-n">${int(n)}</span></button>`;
  const qLabel = compact ? 'รอส่ง' : 'รอจัดส่ง';
  const dLabel = compact ? 'ส่งแล้ว' : 'ส่งแล้ว';
  return `<div class="del-view-tabs plan-wizard-steps${compact ? ' del-view-tabs-compact' : ''} mb14" id="delViewTabs" role="tablist">${tab('queue', qLabel, openN)}${tab('done', dLabel, doneN)}</div>`;
}
function delFilterChipsHtml(list, opts){
  const f = dPick.filter || 'noRoute';
  const counts = deliveryFilterCounts(list || []);
  const keys = (opts && opts.keys) || (dPick.viewMode === 'done'
    ? ['workAll', 'syncArchive']
    : ['noRoute', 'overdue', 'planned']);
  const chip = (key, label) => `<button type="button" class="pw-step ${f === key ? 'on' : ''}" data-dfilter="${key}">${esc(label)} (${int(counts[key] || 0)})</button>`;
  const inner = `<div class="del-scope-chips plan-wizard-steps">${DFILTERS.filter(x => keys.includes(x.key)).map(x => chip(x.key, x.label)).join('')}</div>`;
  return (opts && opts.deskOnly) ? `<div class="desk-only">${inner}</div>` : inner;
}
/** แถบตัวกรองแบบ BigSeller: วันต้องส่ง + กดเลือกเขต (ไม่โชว์ชิปเขตทั้งแถบ) */
function delScopeBarHtml(list, districtList){
  const counts = deliveryFilterCounts(list || []);
  const overdueN = counts.overdue || 0;
  return `<div class="del-scope-bar mb14">
    <div class="del-scope-row">
      <span class="del-scope-label">คิว</span>
      ${delFilterChipsHtml(list)}
    </div>
    <div class="del-scope-row del-scope-zone">
      <span class="del-scope-label">เขต</span>
      <div class="del-scope-zone-ctrl">${delDistrictFilterHtml(districtList)}</div>
    </div>
    ${overdueN ? `<div class="small" style="color:#B45309;margin-top:6px">มีค้างส่ง ${int(overdueN)} บิลที่ยังไม่จัดรถ</div>` : ''}
  </div>`;
}
function districtChipsHtml(list, opts){
  // เลิกใช้ชิปเขตยาวด้านบน — คงฟังก์ชันไว้เผื่อเรียกเก่า แต่ชี้ไปแถบกรองใหม่
  return delScopeBarHtml(list, districtCounts(list));
}
function delTableHead(staffList, districtList, showStatus, filterList){
  const src = filterList || [];
  return `<thead>
    <tr class="del-head-row">
      <th class="c" style="width:42px">${showStatus ? '' : '<input type="checkbox" id="dSelAll">'}</th>
      <th>ชื่อร้าน</th>
      <th>WALK-IN / ชื่อ</th>
      <th>เขต</th>
      <th class="r">มูลค่า</th>
      <th>เลขที่เอกสารอ้างอิง</th>
      <th>เลขบิล</th>
      <th>วันที่ออกเอกสาร</th>
      <th>กำหนดส่งของ</th>
      ${showStatus ? '<th>สถานะ</th>' : ''}
      <th class="c del-act" style="width:88px">แก้</th>
    </tr>
    <tr class="del-filter-row">
      <th class="c"></th>
      <th><input class="input del-filter-input" id="fName" placeholder="กรองชื่อร้าน…" value="${esc(dPick.nameFilter || '')}"></th>
      <th>${delStaffFilterHtml(staffList)}</th>
      <th><span class="small muted">ใช้ตัวกรองด้านบน</span></th>
      <th>${delAmountFilterHtml(src)}</th>
      <th>${delPoFilterHtml(src)}</th>
      <th>${delInvFilterHtml(src)}</th>
      <th>${delDocDateFilterHtml(src)}</th>
      <th>${delDueDateFilterHtml(src)}</th>
      ${showStatus ? '<th></th>' : ''}
      <th class="del-act"></th>
    </tr>
  </thead>`;
}
function delStaffBadge(d){
  const ch = DelView.shipChannel(d);
  const chCls = ch === 'self' ? 'b-green' : (ch === 'courier' ? 'b-violet' : 'b-gray');
  const chHtml = `<span class="badge ${chCls}" style="font-size:10px">${esc(DelView.shipLabel(ch))}</span>`;
  const s = DelView.salesStaff(d);
  if (!s) return chHtml;
  return `<div class="flex gap8 wrap aic">${chHtml}<span class="badge ${ch === 'walkin' ? 'b-cyan' : 'b-blue'}" style="font-size:10px">${esc(s)}</span></div>`;
}
function districtCounts(list){
  const map = new Map();
  (list || []).forEach(d => {
    const z = DelView.zone(d) || 'ไม่ระบุเขต';
    map.set(z, (map.get(z) || 0) + 1);
  });
  return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'th'));
}
function shopVisitKey(d){
  return [String(d.CustomerName||'').trim(), String(d.BranchName||'').trim(), DelView.zone(d)||''].join('|');
}
function shopVisitLabel(d){
  const name = String(d.CustomerName || 'ไม่ระบุร้าน').trim();
  const br = trcBranchLabel(d);
  return br && br !== name ? name + ' · ' + br : name;
}
function groupShopsForVisit(list){
  const map = new Map();
  (list || []).forEach(d => {
    const key = shopVisitKey(d);
    if (!map.has(key)) {
      map.set(key, {
        key, name: shopVisitLabel(d), zone: DelView.zone(d) || 'ไม่ระบุเขต',
        bills: 0, qty: 0, amount: 0, ids: [], channel: DelView.shipChannel(d),
      });
    }
    const g = map.get(key);
    g.bills += 1;
    g.qty += Number(d.BoxQty) || 0;
    g.amount += DelView.amount(d) || 0;
    g.ids.push(d.DeliveryID);
  });
  return [...map.values()].sort((a, b) => a.zone.localeCompare(b.zone, 'th') || b.bills - a.bills || a.name.localeCompare(b.name, 'th'));
}
function todayGlanceModel(openList){
  const due = (openList || []).filter(d => DelView.sendOnIso(d) === Store.date || DelView.isOverdue(d));
  const self = due.filter(d => DelView.shipChannel(d) === 'self');
  const walk = due.filter(d => DelView.shipChannel(d) === 'walkin');
  const courier = due.filter(d => DelView.shipChannel(d) === 'courier');
  const shops = groupShopsForVisit(self);
  const qty = (arr) => arr.reduce((n, d) => n + (Number(d.BoxQty) || 0), 0);
  const amt = (arr) => arr.reduce((n, d) => n + (DelView.amount(d) || 0), 0);
  return {
    due, self, walk, courier, shops,
    nDue: due.length, nSelf: self.length, nWalk: walk.length, nCourier: courier.length,
    nShops: shops.length, qtySelf: qty(self), qtyDue: qty(due), amtSelf: amt(self), amtDue: amt(due),
  };
}
function glanceBarPct(n, total){
  if (!total) return 0;
  return Math.max(2, Math.round((n / total) * 100));
}
function todayGlanceHtml(openList){
  const g = todayGlanceModel(openList);
  const totalCh = g.nDue || 1;
  const chOn = dPick.shipFilter || '';
  const chBtn = (key, shortL, longL, n, color) => `<button type="button" class="glance-ch ${chOn === key ? 'on' : ''}" data-ship-filter="${esc(key)}" style="--ch:${color}">
    <span class="glance-ch-n tab">${int(n)}</span>
    <span class="glance-ch-l">${esc(shortL)}<span class="glance-ch-long"> — ${esc(longL)}</span></span>
    <span class="glance-ch-bar"><span style="width:${glanceBarPct(n, totalCh)}%;background:${color}"></span></span>
    <span class="glance-ch-p">${totalCh ? Math.round(n / totalCh * 100) : 0}%</span>
  </button>`;
  const byZone = new Map();
  g.shops.forEach(s => {
    if (!byZone.has(s.zone)) byZone.set(s.zone, []);
    byZone.get(s.zone).push(s);
  });
  const shopRows = [...byZone.entries()].map(([zone, shops]) => {
    const q = shops.reduce((n, s) => n + s.qty, 0);
    return `<div class="glance-zone">
      <div class="glance-zone-h"><b>${esc(zone)}</b><span>${int(shops.length)} ร้าน · ${int(q)} ชิ้น</span></div>
      ${shops.map(s => `<button type="button" class="glance-shop" data-shop-ids="${esc(s.ids.join(','))}">
        <span class="glance-shop-name">${esc(s.name)}</span>
        <span class="glance-shop-meta">${int(s.bills)} บิล · ${int(s.qty)} ชิ้น</span>
      </button>`).join('')}
    </div>`;
  }).join('') || `<div class="small muted" style="padding:8px 2px">ยังไม่มีบิลส่งเองวันนี้ — คีย์ SO แล้วรีเฟรช ร้านจะโผล่ที่นี่ทันที</div>`;
  return `<div class="today-glance mb14" id="todayGlance">
    <div class="glance-kpis">
      <div class="glance-kpi" style="--kpi:#4F7A0A">
        <div class="glance-kpi-l">ร้านที่รถต้องไป</div>
        <div class="glance-kpi-v tab">${int(g.nShops)} <span>ร้าน</span></div>
        <div class="glance-kpi-s">ไม่รวม WALK-IN / ขนส่งอื่น</div>
      </div>
      <div class="glance-kpi" style="--kpi:#2563EB">
        <div class="glance-kpi-l">บิลเปิดวันนี้</div>
        <div class="glance-kpi-v tab">${int(g.nDue)} <span>บิล</span></div>
        <div class="glance-kpi-s">${int(g.qtyDue)} ชิ้น · รู้ได้ตั้งแต่คีย์บิล</div>
      </div>
      <div class="glance-kpi" style="--kpi:#EA580C">
        <div class="glance-kpi-l">ขึ้นของ (ส่งเอง)</div>
        <div class="glance-kpi-v tab">${int(g.qtySelf)} <span>ชิ้น</span></div>
        <div class="glance-kpi-s">พิมพ์ใบสั่งขายให้น้าเอ๋ได้เลย</div>
      </div>
    </div>
    <div class="glance-split">
      ${chBtn('self', 'ส่งเอง', 'คนขับต้องรู้ร้าน', g.nSelf, '#4F7A0A')}
      ${chBtn('courier', 'ขนส่ง', 'Kerry / Flash / อื่น', g.nCourier, '#7C3AED')}
      ${chBtn('walkin', 'WALK-IN', 'มารับเอง', g.nWalk, '#6B7383')}
      ${chOn ? `<button type="button" class="glance-ch-clear" data-ship-filter="">ล้างตัวกรองช่องทาง</button>` : ''}
    </div>
    <div class="glance-shops">
      <div class="glance-shops-h">
        <div>
          <div class="strong">วันนี้รถบริษัทต้องไปร้านเหล่านี้</div>
          <div class="small muted">แอดมินคีย์บิลแล้ว ร้านขึ้นทันที — ไม่ต้องรอจัดรถเสร็จ</div>
        </div>
        <div class="flex gap8 wrap glance-print-acts">
          <button type="button" class="btn btn-sm" data-act="printShops" ${g.nShops ? '' : 'disabled'}><i data-lucide="map-pinned"></i>พิมพ์รายร้าน</button>
          <button type="button" class="btn btn-sm btn-primary" data-act="printSo" ${g.nSelf ? '' : 'disabled'}><i data-lucide="printer"></i>พิมพ์ให้น้าเอ๋</button>
        </div>
      </div>
      <div class="glance-shop-list">${shopRows}</div>
    </div>
  </div>`;
}
function soPrintedKey(){ return 'ddc_so_printed_' + (Store.date || ''); }
function soPrintedMap(){
  try { return JSON.parse(localStorage.getItem(soPrintedKey()) || '{}') || {}; }
  catch (e) { return {}; }
}
function markSoPrinted(ids){
  const map = soPrintedMap();
  const at = new Date().toISOString();
  (ids || []).forEach(id => { if (id) map[id] = at; });
  try { localStorage.setItem(soPrintedKey(), JSON.stringify(map)); } catch (e) {}
}
function isSoPrinted(id){ return !!soPrintedMap()[id]; }
function parseSoLinesFromNote(note){
  const s = String(note || '');
  const chunk = (s.split('สินค้า:')[1] || '').split('·')[0];
  if (!chunk) return [];
  return chunk.split('|').map(part => {
    const t = part.trim();
    if (!t || t.startsWith('…')) return null;
    const m = t.match(/^(.*?)\s*×\s*([\d.]+)\s*(\S+)?(?:\s*@\s*([\d,.]+))?/);
    if (!m) return { sku:'', name: t, qty: 0, unit:'ชิ้น', price: 0, total: 0 };
    return { sku:'', name: m[1].trim(), qty: Number(m[2]) || 0, unit: m[3] || 'ชิ้น', price: Number(String(m[4]||'').replace(/,/g,'')) || 0, total: 0 };
  }).filter(Boolean);
}
function soDocFromDelivery(d){
  return { delivery: d, lines: parseSoLinesFromNote(d.Note), salesman: DelView.salesStaff(d), soId: '' };
}
function soSlipHtml(doc){
  const d = (doc && doc.delivery) || {};
  const lines = (doc && doc.lines) || [];
  const ch = DelView.shipChannel(d);
  const qty = lines.length ? lines.reduce((n, l) => n + (Number(l.qty) || 0), 0) : (Number(d.BoxQty) || 0);
  const row = (l, v) => `<div><span>${l}:</span> <b>${esc(v == null || v === '' ? '-' : v)}</b></div>`;
  const lineRows = lines.length
    ? lines.map((l, i) => `<tr>
        <td class="c">☐</td><td class="c">${i + 1}</td>
        <td class="mono">${esc(l.sku || '—')}</td>
        <td>${esc(l.name || '—')}</td>
        <td class="r">${int(l.qty)}</td>
        <td class="c">${esc(l.unit || 'ชิ้น')}</td>
      </tr>`).join('')
    : `<tr><td colspan="6" class="c muted">ยังไม่มีรายการสินค้าจาก TRCloud — ใช้จำนวนรวม ${int(d.BoxQty)} ชิ้นขึ้นของได้</td></tr>`;
  return `<div class="so-slip">
    <div class="kv">
      ${row('ร้าน', shopVisitLabel(d))}${row('เขต', DelView.zone(d) || '—')}
      ${row('เลข PO', DelView.poNo(d) || '—')}${row('เลขบิล', DelView.invoiceNo(d) || '—')}
      ${row('กำหนดส่ง', d.DueDate ? thDate(d.DueDate) : thDate(d.DeliveryDate))}
      ${row('ช่องทาง', DelView.shipLabel(ch))}
      ${row('จำนวน', int(qty) + ' ชิ้น')}${row('พนักงานขาย', (doc && doc.salesman) || DelView.salesStaff(d) || '—')}
    </div>
    ${d.Address ? `<p class="small" style="margin:8px 0 0"><b>ที่อยู่:</b> ${esc(trcAddressOnly(d) || d.Address)}</p>` : ''}
    <div class="sec-title">รายการขึ้นของ — น้าเอ๋เช็ค ☐</div>
    <table class="slip-table">
      <thead><tr><th>☐</th><th>#</th><th>รหัส</th><th>สินค้า</th><th>จำนวน</th><th>หน่วย</th></tr></thead>
      <tbody>${lineRows}</tbody>
      <tfoot><tr><th colspan="4" class="r">รวม</th><th class="r">${int(qty)}</th><th></th></tr></tfoot>
    </table>
    <div class="sign"><div>ผู้จัดของ (น้าเอ๋)</div><div>ผู้ตรวจ</div></div>
    <div style="page-break-after:always;height:8px"></div>
  </div>`;
}
function soShopListHtml(selfBills){
  const shops = groupShopsForVisit(selfBills);
  const byZone = new Map();
  shops.forEach(s => { if (!byZone.has(s.zone)) byZone.set(s.zone, []); byZone.get(s.zone).push(s); });
  const qty = shops.reduce((n, s) => n + s.qty, 0);
  const body = [...byZone.entries()].map(([zone, list]) =>
    `<div class="sec-title">${esc(zone)} · ${int(list.length)} ร้าน</div>
     <table class="slip-table"><thead><tr><th>☐</th><th>ร้าน</th><th>บิล</th><th>ชิ้น</th></tr></thead>
     <tbody>${list.map(s => `<tr><td class="c">☐</td><td>${esc(s.name)}</td><td class="r">${int(s.bills)}</td><td class="r">${int(s.qty)}</td></tr>`).join('')}</tbody></table>`
  ).join('');
  const row = (l, v) => `<div><span>${l}:</span> <b>${esc(v)}</b></div>`;
  return `<div class="kv">
      ${row('วันที่', thDate(Store.date))}${row('ร้านที่รถต้องไป', int(shops.length) + ' ร้าน')}
      ${row('บิลส่งเอง', int(selfBills.length))}${row('ชิ้นที่ต้องขึ้น', int(qty))}
    </div>
    <p class="small muted">ใบนี้รู้ได้ตั้งแต่แอดมินคีย์บิล — คนขับ/น้าเอ๋เห็นร้านก่อนจัดรถเสร็จ · ไม่รวม WALK-IN และขนส่งอื่น</p>
    ${body || '<p class="muted">ไม่มีร้านส่งเอง</p>'}
    <div class="sign"><div>ผู้จัดงาน</div><div>น้าเอ๋ / คนขับ</div></div>
    <div style="page-break-after:always;height:8px"></div>`;
}
async function fetchSaleOrderDocs(deliveries){
  const list = deliveries || [];
  if (!list.length) return [];
  try {
    const ids = list.map(d => d.DeliveryID).filter(Boolean).join(',');
    const data = await API.get('getSaleOrdersPrint', { ids }, 1, 90000);
    const arr = Array.isArray(data) ? data : [];
    const byId = new Map(arr.map(x => [String((x.delivery || {}).DeliveryID || ''), x]));
    return list.map(d => {
      const hit = byId.get(String(d.DeliveryID));
      if (!hit) return soDocFromDelivery(d);
      return {
        delivery: Object.assign({}, d, hit.delivery || {}),
        lines: (hit.lines && hit.lines.length) ? hit.lines : parseSoLinesFromNote(d.Note),
        salesman: hit.salesman || DelView.salesStaff(d),
        soId: hit.soId || '',
      };
    });
  } catch (e) {
    return list.map(soDocFromDelivery);
  }
}
async function printSaleOrdersForNaaAe(deliveries){
  const all = (deliveries || []).filter(d => d && !DelView.isGhost(d));
  const self = all.filter(d => DelView.shipChannel(d) === 'self');
  const skipped = all.length - self.length;
  if (!self.length) {
    toast(skipped ? 'บิลที่เลือกเป็น WALK-IN / ขนส่งอื่น — น้าเอ๋ใช้ใบส่งเอง' : 'ยังไม่มีบิลส่งเองให้น้าเอ๋', 'warn');
    return;
  }
  toast('กำลังเตรียมใบสั่งขาย ' + int(self.length) + ' บิล…', 'ok');
  const docs = await fetchSaleOrderDocs(self);
  const body = soShopListHtml(self) + docs.map(soSlipHtml).join('');
  Printer.open('ใบสั่งขาย — ขึ้นของให้น้าเอ๋', 'A4', body);
  markSoPrinted(self.map(d => d.DeliveryID));
  toast('เปิดใบสั่งขายแล้ว' + (skipped ? ' · ข้าม WALK-IN/ขนส่งอื่น ' + int(skipped) + ' บิล' : ''), 'ok');
}
async function printTodayShopList(deliveries){
  const self = (deliveries || []).filter(d => DelView.shipChannel(d) === 'self' && !DelView.isGhost(d));
  if (!self.length) { toast('ยังไม่มีร้านที่รถบริษัทต้องไปวันนี้', 'warn'); return; }
  Printer.open('ร้านที่ต้องไปวันนี้', 'A4', soShopListHtml(self));
}
function billsForNaaAePrint(openList, rows){
  if (dPick.sel.size) {
    const selected = (openList || []).filter(d => dPick.sel.has(d.DeliveryID));
    return selected.length ? selected : (rows || []);
  }
  const g = todayGlanceModel(openList || []);
  return g.self;
}
function delStatusBadge(d){
  const st = DelView.uiStatus(d);
  return `<span class="badge ${st.cls}">${esc(st.label)}</span>`;
}
function delAmountHtml(d){
  const a = DelView.amount(d);
  return a == null ? '<span class="muted">—</span>' : `<span class="tab">${money(a)}</span>`;
}
function delRowActionsHtml(d, viewMode){
  if (viewMode === 'done') {
    return `<button type="button" class="icon-btn" data-del-edit="${esc(d.DeliveryID)}" title="ดู / แก้ไข"><i data-lucide="pencil"></i></button>`;
  }
  return `<div class="del-row-acts">
    <button type="button" class="icon-btn" data-print-so="${esc(d.DeliveryID)}" title="พิมพ์ใบสั่งขายให้น้าเอ๋"><i data-lucide="printer"></i></button>
    <button type="button" class="icon-btn" data-del-edit="${esc(d.DeliveryID)}" title="แก้ไขบิล (ด่วน/ปกติ)"><i data-lucide="pencil"></i></button>
    <button type="button" class="icon-btn del-row-del" data-del-row-del="${esc(d.DeliveryID)}" title="ลบ"><i data-lucide="trash-2"></i></button>
  </div>`;
}
function delSelectionBar(selN, selAmount){
  if (!selN) return '';
  const distHint = dPick.districts.size
    ? `<div class="small muted">${[...dPick.districts].map(deliveryDistrictLabel).join(' · ')}</div>`
    : '';
  return `<div class="del-sel-bar" id="delSelBar">
    <div class="del-sel-meta">
      <div class="strong">เลือกแล้ว ${int(selN)} ร้าน</div>
      ${distHint}
      ${selAmount > 0 ? `<div class="small muted">มูลค่ารวม ${money(selAmount)} บาท</div>` : `<div class="small muted">กดจัดรถรายการที่เลือก</div>`}
    </div>
    <div class="del-sel-actions">
      <button class="btn btn-sm desk-only" data-act="dselEdit">แก้ไขที่เลือก</button>
      <button class="btn btn-sm desk-only" data-act="dselPriority">ปรับด่วน/ปกติ</button>
      <button class="btn btn-sm btn-danger desk-only" data-act="dselDelete">ลบที่เลือก</button>
      <button class="btn btn-sm" data-act="dselClear">ล้าง</button>
      <button class="btn btn-sm desk-only" data-act="dselPrintSo"><i data-lucide="printer"></i>พิมพ์ให้น้าเอ๋</button>
      <a class="btn btn-primary" href="#/planning" id="dselPlan">จัดรถ <i data-lucide="chevron-right"></i></a>
    </div>
  </div>`;
}
function delMobileCard(d, opts){
  const viewMode = (opts && opts.viewMode) || 'queue';
  const zone = DelView.zone(d);
  const selected = dPick.sel.has(d.DeliveryID);
  const po = DelView.poNo(d);
  const inv = DelView.invoiceNo(d);
  const invShow = (inv && po && inv.replace(/\s+/g,'').toLowerCase() === po.replace(/\s+/g,'').toLowerCase()) ? '' : inv;
  const refs = [po ? `PO ${po}` : '', invShow ? `บิล ${invShow}` : ''].filter(Boolean).join(' · ');
  const showSel = viewMode === 'queue' && DelView.isNoRoute(d);
  const amt = DelView.amount(d);
  const amtHtml = amt != null ? `<div class="job-card-amt tab">${money(amt)}</div>` : '';
  const statusHtml = (viewMode === 'done' || !DelView.isNoRoute(d)) ? `<div class="job-card-status">${delStatusBadge(d)}</div>` : '';
  const foot = viewMode === 'queue'
    ? `<div class="job-card-foot">
        ${DelView.isNoRoute(d)
          ? `<button type="button" class="btn btn-sm" data-print-so="${esc(d.DeliveryID)}"><i data-lucide="printer"></i>ใบสั่งขาย</button>
             <button type="button" class="btn btn-sm" data-del-edit="${esc(d.DeliveryID)}"><i data-lucide="pencil"></i>แก้ไข</button>`
          : `<a class="btn btn-sm btn-primary" href="#/planning">แก้รอบที่จัดแล้ว</a>
             <button type="button" class="btn btn-sm" data-del-edit="${esc(d.DeliveryID)}"><i data-lucide="pencil"></i>แก้ไขบิล</button>`}
      </div>`
    : '';
  return `<div class="job-card job-card-mob ${selected ? 'on' : ''}" data-card="${esc(d.DeliveryID)}">
    <div class="job-card-row">
      ${showSel ? `<label class="job-check"><input type="checkbox" class="d-sel" data-sel="${esc(d.DeliveryID)}" ${selected ? 'checked' : ''} aria-label="เลือก ${esc(d.CustomerName || 'ร้าน')}"></label>` : ''}
      <div class="job-card-body">
        <div class="job-card-head">
          <div class="job-card-title">${esc(d.CustomerName || 'ไม่ระบุร้าน')}</div>
          ${amtHtml}
        </div>
        <div class="job-card-meta">
          ${zone ? `<span class="job-zone">${esc(zone)}</span>` : '<span class="job-zone muted">ไม่ระบุเขต</span>'}
          <span class="job-zone">${esc(DelView.shipLabel(DelView.shipChannel(d)))}</span>
          ${DelView.isOverdue(d) ? '<span class="job-overdue">เลยกำหนด</span>' : ''}
          ${statusHtml}
        </div>
        ${refs ? `<div class="job-card-refs">${esc(refs)}</div>` : ''}
        ${d.Address ? `<div class="job-card-addr">${esc(shortAddr(d.Address, 80))}</div>` : ''}
      </div>
    </div>
    ${foot}
  </div>`;
}
function delDesktopRow(d){
  const zone = DelView.zone(d);
  const selected = dPick.sel.has(d.DeliveryID);
  const po = DelView.poNo(d);
  const inv = DelView.invoiceNo(d);
  const invShow = (inv && po && inv.replace(/\s+/g,'').toLowerCase() === po.replace(/\s+/g,'').toLowerCase()) ? '—' : (inv || '—');
  return `<tr class="${selected ? 'row-sel' : ''}">
    <td class="c"><input type="checkbox" class="d-sel" data-sel="${esc(d.DeliveryID)}" ${selected ? 'checked' : ''}></td>
    <td class="strong">${esc(d.CustomerName || '—')}${d.Address ? `<div class="small muted" style="font-weight:400;margin-top:2px">${esc(shortAddr(d.Address, 64))}</div>` : ''}</td>
    <td class="small">${zone ? esc(zone) : '<span class="muted">—</span>'}</td>
    <td class="r">${delAmountHtml(d)}</td>
    <td class="mono small">${esc(po || '—')}</td>
    <td class="mono small">${esc(invShow)}</td>
    <td class="small tab">${DelView.docIso(d) ? thDate(DelView.docIso(d)) : '—'}</td>
    <td class="small tab">${DelView.dueIso(d) ? thDate(DelView.dueIso(d)) : '—'}</td>
    <td>${delStatusBadge(d)}</td>
  </tr>`;
}

ROUTES.deliveries = async function(view){
  if (location.hash !== '#/dashboard') history.replaceState(null, '', location.pathname + location.search + '#/dashboard');
  return ROUTES.dashboard(view);
};

/* ---- QUICK DISPATCH — จ่ายรถให้งานเดียวในคลิกเดียว ---- */
const QD = { type:'COMPANY', vehId:'', extId:'', driver:'', d:null, m:null, modal:null };
function qdVehicle(){ return QD.type==='EXTERNAL' ? (Store.data.externalVehicles||[]).find(v=>v.ExternalVehicleID===QD.extId) : (Store.data.vehicles||[]).find(v=>v.VehicleID===QD.vehId); }
function qdCost(){ const v=qdVehicle(), isExt=QD.type==='EXTERNAL';
  const fuel=isExt?0:Planner.fuelCost(QD.m.distance,v);
  const external=isExt&&v?Planner.extAmount(v,QD.m.distance):0;
  const toll=Number(QD.toll)||0, parking=Number(QD.parking)||0;
  return { fuel, toll, parking, external, total:+(fuel+toll+parking+external).toFixed(2) }; }
function quickDispatch(d){
  if(!d) return;
  QD.d=d; QD.m=Planner.metrics([d]);
  const rec=Planner.recommendVehicle()||Planner.availableVehicles()[0]||(Store.data.vehicles||[])[0];
  const emp=rec&&(Store.data.employees||[]).find(e=>e.VehicleID===rec.VehicleID);
  QD.type='COMPANY'; QD.vehId=rec?rec.VehicleID:''; QD.extId=((Store.data.externalVehicles||[])[0]||{}).ExternalVehicleID||'';
  QD.driver=rec?(rec.CurrentDriver||(emp&&emp.EmployeeName)||''):'';
  QD.toll=Planner.toll(); QD.parking=Planner.autoParking([d]);
  const m=modal({ title:'จัดทีละงาน (เร่งด่วน) — '+esc(d.CustomerName||''), body:`
    <div class="notice info" style="margin-bottom:12px"><i data-lucide="zap"></i><div>ใช้เมื่อจัดรถให้งานเดียวทันที — ถ้ามีหลายงานควรวางแผนหลายงานพร้อมกันแทน</div></div>
    <div id="qdBody">${qdBody()}</div>`,
    foot:`<button class="btn" id="qdCancel">ยกเลิก</button><button class="btn btn-primary" id="qdSave"><i data-lucide="check-circle-2"></i>ยืนยัน & จ่ายรถ</button>` });
  QD.modal=m; el('qdCancel').onclick=m.close; el('qdSave').onclick=qdConfirm; qdBind();
  // อัปเกรดเป็นระยะทางถนนจริงเมื่อโหลดเสร็จ
  Planner.roadMetrics([QD.d]).then(road=>{ if(road && document.getElementById('qdBody')){ QD.m=road; qdRefresh(); } });
}
function qdBody(){
  const d=QD.d, m=QD.m, isExt=QD.type==='EXTERNAL', v=qdVehicle(), c=qdCost();
  const veh=Store.data.vehicles||[], ext=Store.data.externalVehicles||[], emps=Store.data.employees||[];
  const noGeo=(!d.Latitude||!d.Longitude)?`<div class="notice info" style="margin-bottom:10px"><i data-lucide="info"></i><div>งานนี้ยังไม่มีพิกัด — ระยะทาง/ค่าน้ำมันจะเป็น 0 (แก้ที่อยู่เพื่อหาพิกัดก่อนได้)</div></div>`:'';
  const row=(l,x)=>`<div class="flex between" style="padding:4px 0;font-size:13px"><span class="muted">${l}</span><span class="tab">${money(x)}</span></div>`;
  return `
    <div class="notice info" style="margin-bottom:12px"><i data-lucide="package"></i><div><b>${esc(d.CustomerName)}</b>${d.BranchName?' · '+esc(d.BranchName):''}<br>${esc(d.Address||'')} · ${int(d.BoxQty)} กล่อง · ${priBadge(d.Priority)}${d.InvoiceNo?' · บิล '+esc(d.InvoiceNo):''}</div></div>
    ${noGeo}
    <div class="field"><label class="label">ประเภทรถ</label>
      <div class="seg" id="qdType"><button class="${!isExt?'on':''}" data-t="COMPANY">รถบริษัท</button><button class="${isExt?'on':''}" data-t="EXTERNAL">รถภายนอก</button></div></div>
    <div class="field"><label class="label">เลือกรถ</label>
      ${isExt?`<select class="select" id="qdExt">${ext.length?ext.map(x=>`<option value="${esc(x.ExternalVehicleID)}" ${QD.extId===x.ExternalVehicleID?'selected':''}>${esc(x.LicensePlate||x.ProviderName)} · ${esc(x.ProviderName)}</option>`).join(''):'<option value="">— ไม่มีรถภายนอก —</option>'}</select>`
        :`<select class="select" id="qdVeh">${veh.map(x=>`<option value="${esc(x.VehicleID)}" ${QD.vehId===x.VehicleID?'selected':''}>${esc(vehicleOptionLabel(x))}</option>`).join('')}</select>`}</div>
    <div class="field"><label class="label">คนขับ</label><input class="input" id="qdDriver" list="qdEmp" value="${esc(QD.driver)}" placeholder="ชื่อคนขับ"><datalist id="qdEmp">${emps.map(e=>`<option value="${esc(e.EmployeeName)}">`).join('')}</datalist></div>
    <div style="border:1px solid var(--border);border-radius:11px;padding:14px">
      <div class="flex between" style="font-size:13px;margin-bottom:4px"><span class="muted">ระยะทาง (ไป · ตามแผนที่)</span><span class="tab strong">${num1(Planner.routeDisplayKm(m))} กม.${m.source==='straight'?' <span class="small muted">(ประมาณ)</span>':''}</span></div>
      <div class="flex between" style="font-size:13px;margin-bottom:6px"><span class="muted">ระยะทาง (ไป-กลับ · ตามแผนที่)</span><span class="tab">${num1(Planner.fuelDistanceKm(m))} กม.${m.source==='straight'?' <span class="small muted">(ประมาณ)</span>':''}</span></div>
      ${row('ค่าน้ำมัน',c.fuel)}
      ${qdEdit('ค่าทางด่วน','qdToll',Number(QD.toll)||0,'ใส่ 0 ถ้าไม่ขึ้นทางด่วน')}
      ${qdEdit('ค่าจอดรถ','qdPark',Number(QD.parking)||0, Planner.isMall(d)?'ปลายทางเป็นห้าง':'ร้านเดี่ยว')}
      ${c.external?row('ค่ารถภายนอก',c.external):''}
      <div class="divider"></div>
      <div class="flex between" style="font-size:15px"><span class="strong">ต้นทุนรวม</span><span class="strong tab" style="color:var(--brand-ink)" id="qdTotal">${money(c.total)} ฿</span></div>
    </div>`;
}
function qdEdit(l,id,val,hint){ return `<div class="flex between aic" style="padding:4px 0"><span class="muted" style="font-size:13px">${l}${hint?` <span class="small" style="color:#9AA3B2">${hint}</span>`:''}</span>
  <span class="flex aic" style="gap:4px"><input class="input" id="${id}" type="number" value="${val}" style="width:96px;height:32px;text-align:right;padding:0 8px"><span class="small muted">฿</span></span></div>`; }
function qdBind(){
  const t=el('qdType'); if(t) $$('#qdType button').forEach(b=>b.onclick=()=>{ QD.type=b.dataset.t; if(b.dataset.t==='EXTERNAL'&&!QD.extId){ const e=(Store.data.externalVehicles||[])[0]; QD.extId=e?e.ExternalVehicleID:''; } qdRefresh(); });
  const sv=el('qdVeh'); if(sv) sv.onchange=()=>{ QD.vehId=sv.value; const v=qdVehicle(); if(v&&v.CurrentDriver)QD.driver=v.CurrentDriver; qdRefresh(); };
  const se=el('qdExt'); if(se) se.onchange=()=>{ QD.extId=se.value; const v=qdVehicle(); if(v&&v.DriverName)QD.driver=v.DriverName; qdRefresh(); };
  const sd=el('qdDriver'); if(sd) sd.oninput=()=>QD.driver=sd.value;
  const tl=el('qdToll'), pk=el('qdPark');
  const upd=()=>{ QD.toll=+tl.value||0; QD.parking=+pk.value||0; const c=qdCost(); if(el('qdTotal'))el('qdTotal').textContent=money(c.total)+' ฿'; };
  if(tl)tl.oninput=upd; if(pk)pk.oninput=upd;
}
function qdRefresh(){ el('qdBody').innerHTML=qdBody(); icons(); qdBind(); }
async function qdConfirm(){
  const d=QD.d, m=QD.m, isExt=QD.type==='EXTERNAL', v=qdVehicle(), c=qdCost();
  if(!v){ toast('เลือกรถก่อน','warn'); return; }
  const driverName=QD.driver||(isExt?v.DriverName:v.CurrentDriver)||'';
  const emp=!isExt&&((Store.data.employees||[]).find(e=>e.EmployeeName===driverName) || (Store.data.employees||[]).find(e=>e.VehicleID===v.VehicleID));
  const data={ DeliveryDate:Store.date, RouteType:isExt?'EXTERNAL_VEHICLE':'COMPANY_VEHICLE',
    DriverName:driverName, DriverPhone:(emp&&emp.Phone)||(isExt?v.DriverPhone:'')||'',
    DriverEmployeeID: isExt?'':(emp?emp.EmployeeID:''),
    VehicleType:v.VehicleType||'', VehicleName:isExt?'':(v.VehicleName||''), LicensePlate:v.LicensePlate||'', ProviderName:isExt?(v.ProviderName||''):'',
    TotalStops:1, TotalBoxes:Number(d.BoxQty)||0, TotalDistance:Planner.routeDisplayKm(m), EstimatedDuration:m.durationMin,
    EstimatedFuelCost:c.fuel, EstimatedTollCost:c.toll, EstimatedParkingCost:c.parking, EstimatedExternalCost:c.external||0, EstimatedOtherCost:0, Status:'Planned' };
  const stops=[{ DeliveryID:d.DeliveryID, CustomerName:d.CustomerName, BranchName:d.BranchName, Address:d.Address, Latitude:d.Latitude, Longitude:d.Longitude, BoxQty:d.BoxQty, DistanceFromPrevious:+(d._distPrev||Planner.routeDisplayKm(m)).toFixed(1) }];
  QD.modal.close();
  toast('กำลังจ่ายรถ · '+money(c.total)+' ฿…','ok','จัดทีละงานสำเร็จ');
  createRouteOptimistic('confirmRoute', data, stops).catch(()=>{});
}
function deliveryForm(d){
  const custs = Store.data.customers||[];
  const isEdit = !!d; d = d||{};
  const m = modal({ title: isEdit?'แก้ไขงานส่ง':'เพิ่มงานส่งสินค้า', body:`
    <div class="field"><label class="label">เลือกลูกค้า / สาขา (เติมพิกัดอัตโนมัติ)</label>
      <select class="select" id="fCust"><option value="">— เลือกลูกค้า —</option>${custs.map(c=>`<option value="${esc(c.CustomerID)}" data-lat="${c.Latitude}" data-lng="${c.Longitude}" data-br="${esc(c.BranchName)}" data-addr="${esc(c.Address)}" data-name="${esc(c.CustomerName)}" ${d.CustomerName===c.CustomerName&&d.BranchName===c.BranchName?'selected':''}>${esc(c.CustomerName)} · ${esc(c.BranchName)}</option>`).join('')}</select></div>
    <div class="field row2">
      <div><label class="label">ลูกค้า</label><input class="input" id="fName" value="${esc(d.CustomerName||'')}"></div>
      <div><label class="label">สาขา</label><input class="input" id="fBranch" value="${esc(d.BranchName||'')}"></div></div>
    <div class="field row2">
      <div><label class="label">เลขที่ PO ลูกค้า</label><input class="input" id="fPo" value="${esc(d.PoNo||'')}" placeholder="เช่น PO26081918"><div class="small muted" style="margin-top:4px">TRCloud: reference</div></div>
      <div><label class="label">เลขบิล (SO)</label><input class="input" id="fInv" value="${esc(d.InvoiceNo||'')}" placeholder="เช่น KSO260800367"><div class="small muted" style="margin-top:4px">TRCloud: ref_no</div></div></div>
    <div class="field row2">
      <div><label class="label">จำนวน (ชิ้น)</label><input class="input" type="number" id="fBox" value="${esc(d.BoxQty||'')}" title="จาก TRCloud คอลัมน์ จำนวน — รวมทุกรายการสินค้า"><div class="small muted" style="margin-top:4px">เทียบ TRCloud: จำนวน</div></div>
      <div></div></div>
    <div class="field row2">
      <div><label class="label">วันที่ออกเอกสาร</label><input class="input" type="date" id="fDocDate" value="${esc((d.DocumentDate||'').slice(0,10))}"></div>
      <div><label class="label">กำหนดส่งของ</label><input class="input" type="date" id="fDueDate" value="${esc((d.DueDate||d.DeliveryDate||'').slice(0,10))}"></div></div>
    <div class="field"><label class="label">ที่อยู่ (ถ้าไม่ได้เลือกลูกค้า ระบบจะหาพิกัดจากที่อยู่นี้ให้)</label><input class="input" id="fAddr" value="${esc(d.Address||'')}"></div>
    <input type="hidden" id="fLat" value="${esc(d.Latitude||'')}"><input type="hidden" id="fLng" value="${esc(d.Longitude||'')}">
    <div id="fGeoStat"></div>
    <div class="field row2">
      <div><label class="label">ความเร่งด่วน</label><select class="select" id="fPri">${Object.keys(PRIORITY).map(p=>`<option value="${p}" ${d.Priority===p?'selected':''}>${PRIORITY[p].label}</option>`).join('')}</select></div>
      <div><label class="label">สถานะ</label><select class="select" id="fStatus">${Object.keys(DSTATUS).map(s=>`<option value="${s}" ${((d.Status||'Draft')===s)?'selected':''}>${DSTATUS[s].label}</option>`).join('')}</select></div></div>
    <div class="field"><label class="label">หมายเหตุ</label><textarea class="textarea" id="fNote">${esc(d.Note||'')}</textarea></div>
  `, foot:`<button class="btn" id="fCancel">ยกเลิก</button><button class="btn btn-primary" id="fSave"><i data-lucide="check"></i>บันทึก</button>` });
  el('fCust').onchange = e=>{ const o=e.target.selectedOptions[0]; if(!o.value)return; el('fName').value=o.dataset.name; el('fBranch').value=o.dataset.br; el('fAddr').value=o.dataset.addr; el('fLat').value=o.dataset.lat; el('fLng').value=o.dataset.lng; };
  el('fCancel').onclick = m.close;
  el('fSave').onclick = async ()=>{
    if(!el('fName').value.trim()){ toast('กรุณากรอกชื่อลูกค้า','warn'); return; }
    el('fSave').disabled=true;
    // ไม่มีพิกัด แต่มีที่อยู่ → หาพิกัดอัตโนมัติ
    if((!el('fLat').value||!el('fLng').value) && el('fAddr').value.trim().length>=6){
      el('fSave').innerHTML='<i data-lucide="loader-2" style="animation:spin 1s linear infinite"></i>หาพิกัด…'; icons();
      const g=await Geo.geocode(el('fAddr').value.trim()+' ประเทศไทย'); if(g){ el('fLat').value=g.lat; el('fLng').value=g.lng; }
      el('fSave').innerHTML='<i data-lucide="check"></i>บันทึก'; icons();
    }
    const data = { CustomerName:el('fName').value.trim(), BranchName:el('fBranch').value.trim(),
      PoNo:el('fPo').value.trim(), InvoiceNo:el('fInv').value.trim(),
      Address:el('fAddr').value.trim(), Latitude:+el('fLat').value||'', Longitude:+el('fLng').value||'', BoxQty:+el('fBox').value||0,
      DocumentDate:el('fDocDate').value||'', DueDate:el('fDueDate').value||'',
      Priority:el('fPri').value, Status:el('fStatus').value, Note:el('fNote').value.trim(),
      DeliveryDate: isEdit ? (d.DeliveryDate || el('fDueDate').value || Store.date) : (el('fDueDate').value || Store.date) };
    m.close();
    if(isEdit) updateLocal('deliveries','updateDelivery',d.DeliveryID,data).then(()=>toast('แก้ไขงานส่งแล้ว','ok')).catch(()=>{});
    else       createLocal('deliveries','createDelivery',data).then(()=>toast('เพิ่มงานส่งแล้ว','ok')).catch(()=>{});
  };
}

function selectedDispatchableRows(){
  const open = Store.data.deliveries || [];
  return normalizeDeliveries(open.filter(d => dPick.sel.has(d.DeliveryID) && DelView.isNoRoute(d)));
}

function bulkEditSelectedDeliveries(view){
  const rows = selectedDispatchableRows();
  if (!rows.length) { toast('ยังไม่ได้เลือกรายการที่แก้ไขได้', 'warn'); return; }
  if (rows.length === 1) { deliveryForm(rows[0]); return; }
  const m = modal({
    title: `แก้ไขงานส่งที่เลือก (${int(rows.length)} รายการ)`,
    body: `
      <div class="notice info mb14"><i data-lucide="info"></i><div>ใช้สำหรับเตรียมงานก่อนกดจัดรถอัตโนมัติ</div></div>
      <div class="field"><label class="label">ความเร่งด่วน</label>
        <select class="select" id="bulkPri">
          <option value="">— ไม่เปลี่ยน —</option>
          ${Object.keys(PRIORITY).map(p=>`<option value="${p}">${PRIORITY[p].label}</option>`).join('')}
        </select>
      </div>
      <div class="field"><label class="label">กำหนดส่งของ (Due Date)</label><input class="input" type="date" id="bulkDue"></div>
      <div class="field"><label class="label">หมายเหตุ (เติมท้าย)</label><textarea class="textarea" id="bulkNote" placeholder="เช่น บิลด่วนลูกค้าโทรตาม"></textarea></div>
    `,
    foot:`<button class="btn" id="bulkCancel">ยกเลิก</button><button class="btn btn-primary" id="bulkSave"><i data-lucide="check"></i>บันทึกที่เลือก</button>`
  });
  el('bulkCancel').onclick = m.close;
  el('bulkSave').onclick = async () => {
    const pri = el('bulkPri').value;
    const due = el('bulkDue').value;
    const note = String(el('bulkNote').value || '').trim();
    if (!pri && !due && !note) { toast('ยังไม่ได้ระบุข้อมูลที่ต้องแก้ไข', 'warn'); return; }
    const ops = rows.map((d) => {
      const patch = {};
      if (pri) patch.Priority = pri;
      if (due) patch.DueDate = due;
      if (note) patch.Note = [String(d.Note || '').trim(), note].filter(Boolean).join(' | ');
      return updateLocal('deliveries', 'updateDelivery', d.DeliveryID, patch);
    });
    m.close();
    await Promise.allSettled(ops);
    toast(`แก้ไขแล้ว ${int(rows.length)} รายการ`, 'ok');
    ROUTES.dashboard(view);
  };
}

function bulkPrioritySelectedDeliveries(view){
  const rows = selectedDispatchableRows();
  if (!rows.length) { toast('ยังไม่ได้เลือกรายการ', 'warn'); return; }
  const m = modal({
    title: `ปรับความเร่งด่วน (${int(rows.length)} รายการ)`,
    body: `<div class="field"><label class="label">ความเร่งด่วนใหม่</label>
      <select class="select" id="bulkPriOnly">
        ${Object.keys(PRIORITY).map(p=>`<option value="${p}">${PRIORITY[p].label}</option>`).join('')}
      </select></div>`,
    foot:`<button class="btn" id="bulkPriCancel">ยกเลิก</button><button class="btn btn-primary" id="bulkPriSave"><i data-lucide="check"></i>บันทึก</button>`
  });
  el('bulkPriCancel').onclick = m.close;
  el('bulkPriSave').onclick = async () => {
    const pri = el('bulkPriOnly').value || 'NORMAL';
    m.close();
    await Promise.allSettled(rows.map(d => updateLocal('deliveries', 'updateDelivery', d.DeliveryID, { Priority: pri })));
    toast(`ปรับเป็น "${PRIORITY[pri].label}" แล้ว`, 'ok');
    ROUTES.dashboard(view);
  };
}

function bulkDeleteSelectedDeliveries(view){
  const rows = selectedDispatchableRows();
  if (!rows.length) { toast('ยังไม่ได้เลือกรายการ', 'warn'); return; }
  confirmDialog(`ลบงานส่งที่เลือก ${int(rows.length)} รายการ ? (soft-delete กู้คืนได้)`, async ()=>{
    await Promise.allSettled(rows.map(d => deleteLocal('deliveries', 'deleteDelivery', d.DeliveryID, { id: d.DeliveryID })));
    rows.forEach(d => dPick.sel.delete(d.DeliveryID));
    toast('ลบรายการที่เลือกแล้ว', 'ok');
    ROUTES.dashboard(view);
  }, { danger:true, yes:'ลบที่เลือก' });
}

/* ================================================================
   ROUTE PLANNING — DECISION CENTER  ★
   ================================================================ */
const Plan = {
  tab:'plan', selected:new Set(), locked:false,
  result:null, chosen:null, kWanted:null, kMax:null,
  sel:{type:'COMPANY',vehId:'',extId:'',driver:'',driverEmployeeId:''},
  splitSel:[]
};
function persistPlanSelection(){
  try {
    sessionStorage.setItem('ddc_plan_sel', JSON.stringify([...Plan.selected]));
    sessionStorage.setItem('ddc_plan_lock', Plan.locked ? '1' : '0');
  } catch (_) {}
}
function restorePlanSelection(){
  if (Plan.selected.size) return;
  try {
    const raw = sessionStorage.getItem('ddc_plan_sel');
    if (!raw) return;
    const ids = JSON.parse(raw);
    if (Array.isArray(ids) && ids.length) {
      Plan.selected = new Set(ids);
      Plan.locked = sessionStorage.getItem('ddc_plan_lock') === '1';
    }
  } catch (_) {}
}
/** ส่ง ID จากหน้างานส่ง → จัดรถ (ไม่ให้เลือกซ้ำ) */
function handoffSelectionToPlan(ids){
  const list = (ids && ids.length) ? ids : [...dPick.sel];
  const rows = normalizeDeliveries((Store.data.deliveries || []).filter(d => list.includes(d.DeliveryID)));
  Plan.selected = new Set(rows.map(d => d.DeliveryID));
  Plan.locked = Plan.selected.size > 0;
  Plan.tab = 'plan';
  Plan.result = null;
  Plan.chosen = null;
  Plan.kWanted = null;
  Plan.kMax = null;
  persistPlanSelection();
}
function planOpenStatuses(){ return ['Draft','Pending','Planned','Assigned','In Progress','']; }
function planSelectedRows(){
  const open = planOpenStatuses();
  return normalizeDeliveries((Store.data.deliveries || []).filter(d =>
    Plan.selected.has(d.DeliveryID) && open.includes(d.Status || '')
  ));
}
function planSelectedCard(d, { removable } = {}){
  const hasGeo = !!(d.Latitude && d.Longitude);
  const zone = DelView.zone(d);
  const po = DelView.poNo(d);
  const inv = DelView.invoiceNo(d);
  const amt = DelView.amount(d);
  const invShow = (inv && po && inv.replace(/\s+/g,'').toLowerCase() === po.replace(/\s+/g,'').toLowerCase()) ? '' : inv;
  const geoMsg = hasGeo
    ? ''
    : (d.Address
      ? `<div class="small" style="color:var(--amber-ink)">มีที่อยู่แล้ว แต่ยังไม่มีพิกัด — กดแก้ที่อยู่หรือรอระบบหาพิกัด</div>`
      : `<div class="small" style="color:var(--amber-ink)">ไม่มีพิกัด — ต้องเพิ่มที่อยู่ก่อนจัดเส้นทาง</div>`);
  return `<div class="check-item on locked">
    <div class="cbx"><i data-lucide="check"></i></div>
    <div style="flex:1;min-width:0">
      <div class="shop-name">${esc(d.CustomerName || '—')}</div>
      <div class="small muted">${esc(zone || 'ไม่ระบุเขต')}${po ? ' · ' + esc(po) : (invShow ? ' · ' + esc(invShow) : '')}${amt != null ? ' · ' + money(amt) + ' ฿' : ''}</div>
      ${d.Address ? `<div class="small muted">${esc(shortAddr(d.Address, 90))}</div>` : ''}
      ${geoMsg}
    </div>
    <div style="text-align:right">
      ${removable ? `<button class="btn btn-sm" data-unpick="${esc(d.DeliveryID)}" type="button">เอาออก</button>` : ''}
      ${!hasGeo ? `<button class="btn btn-sm" data-fixgeo="${esc(d.DeliveryID)}" type="button" style="margin-top:6px">แก้ที่อยู่</button>` : ''}
    </div>
  </div>`;
}
ROUTES.planning = async function(view){
  if (Plan.tab === 'rounds') return renderRoundsTab(view);
  // มีที่อยู่จากบิลแล้วแต่ยังไม่มีพิกัด → หาพิกัดอัตโนมัติครั้งเดียวต่อชุดที่เลือก
  const geoKey = [...Plan.selected].sort().join(',');
  if (geoKey && Plan._geocodedKey !== geoKey) {
    const need = planSelectedRows().filter(d => String(d.Address || '').trim() && !(d.Latitude && d.Longitude));
    Plan._geocodedKey = geoKey;
    if (need.length) {
      toast('กำลังหาพิกัดจากที่อยู่…', 'info');
      let ok = 0;
      for (const d of need.slice(0, 25)) {
        try {
          const g = await Geo.geocode(String(d.Address).trim() + ' ประเทศไทย');
          if (!g || !g.lat || !g.lng) continue;
          d.Latitude = g.lat;
          d.Longitude = g.lng;
          await updateLocal('deliveries', 'updateDelivery', d.DeliveryID, {
            Latitude: g.lat, Longitude: g.lng, Address: d.Address,
          });
          ok++;
        } catch (_) {}
      }
      if (ok) toast('หาพิกัดได้ ' + ok + ' บิล', 'ok');
      else if (need.length) toast('ยังหาพิกัดอัตโนมัติไม่ได้ — กดแก้ที่อยู่', 'warn');
    }
  }
  return renderPlanTab(view);
};
ROUTES.rounds = async function(view){
  Plan.tab = 'rounds';
  if ((location.hash || '') !== '#/planning') {
    history.replaceState(null, '', location.pathname + location.search + '#/planning');
    Store.page = 'planning';
    buildNav();
  }
  return ROUTES.planning(view);
};
function planPageTabs(active){
  return `<div class="seg mb14" id="planTabs">
    <button class="${active==='plan'?'on':''}" data-ptab="plan"><i data-lucide="route" style="width:14px;height:14px"></i> จัดรถ</button>
    <button class="${active==='rounds'?'on':''}" data-ptab="rounds"><i data-lucide="pencil" style="width:14px;height:14px"></i> รอบวันนี้</button>
  </div>`;
}
function bindPlanTabs(view){
  $$('[data-ptab]',view).forEach(b=>b.onclick=()=>{
    Plan.tab = b.dataset.ptab;
    if (Plan.tab === 'rounds') return renderRoundsTab(view);
    ROUTES.planning(view);
  });
}
async function renderPlanTab(view){
  restorePlanSelection();
  // ถ้ายังไม่มี selection ที่ล็อกไว้ — ไม่บังคับเลือกซ้ำทั้งรายการ: ชี้กลับไปหน้างานส่ง
  const allDels = Store.data.deliveries || [];
  const open = planOpenStatuses();
  Plan.selected = new Set([...Plan.selected].filter(id => {
    const d = allDels.find(x => x.DeliveryID === id);
    return d && open.includes(d.Status || '');
  }));
  const deduped = normalizeDeliveries(allDels.filter(d => Plan.selected.has(d.DeliveryID)));
  Plan.selected = new Set(deduped.map(d => d.DeliveryID));
  persistPlanSelection();

  const selected = planSelectedRows();
  const enrichedSel = Planner.enrichStopCoords(selected, Store.data.deliveries, Store.data.customers);
  const withGeo = enrichedSel.filter(d => Planner.hasCoords(d));
  const noGeo = enrichedSel.filter(d => !Planner.hasCoords(d));
  const selCount = selected.length;

  // ถ้าเข้าหน้าจัดรถตรงๆ โดยไม่มีบิลที่เลือก — แสดง empty + ลิงก์ไปหน้าวันนี้
  if (!selCount) {
    const hasRounds = (Store.data.routes || []).some(x => !x.IsDeleted && x.DeliveryDate === Store.date && x.Status !== 'Cancelled');
    if (hasRounds) { Plan.tab = 'rounds'; return renderRoundsTab(view); }
    page(view, `
      ${head('จัดรถ', thDate(Store.date), '')}
      ${emptyState('ยังไม่ได้เลือกเขต','กดเลือกเขตจากหน้าวันนี้','<a class="btn btn-primary btn-lg" href="#/dashboard"><i data-lucide="home"></i>ไปหน้าวันนี้</a>')}
    `);
    return;
  }

  const districtLabel = dPick.districts.size
    ? [...dPick.districts].map(deliveryDistrictLabel).join(' · ')
    : (selected.length === 1 ? DelView.zone(selected[0]) : '');

  page(view, `
    ${head('จัดรถ', `${thDate(Store.date)} · ${int(selCount)} บิล${districtLabel ? ' · ' + esc(districtLabel) : ''}`,
      `<a class="btn btn-sm" href="#/dashboard" id="planChangeSel"><i data-lucide="map-pin"></i>เปลี่ยนเขต</a>`)}
    ${planPageTabs('plan')}
    ${noGeo.length ? `<div class="notice warn mb14"><i data-lucide="map-pin-off"></i><div>
      ${int(noGeo.length)} บิลยังไม่มีพิกัด — จัดได้ ${int(withGeo.length)} บิล (ระบบจะข้ามบิลที่ไม่มีพิกัด)
      <details class="plan-skipped-bills"><summary>ดูรายการที่ข้าม</summary>
        <ul class="small" style="margin:8px 0 0;padding-left:18px">${noGeo.map(d=>`<li>${esc(d.CustomerName||'—')} · ${esc(planBillLabel(d))}${d.Address?` · ${esc(shortAddr(d.Address,48))}`:''}</li>`).join('')}</ul>
      </details></div></div>` : ''}

    <div class="card plan-single" id="decision" style="padding:16px">
      ${Plan.result ? '' : (Plan._autoRunning ? decisionLoading() : decisionInitial(withGeo.length))}
    </div>
  `);

  bindPlanTabs(view);
  $$('[data-unpick]', view).forEach(b => b.onclick = () => {
    Plan.selected.delete(b.dataset.unpick);
    if (!Plan.selected.size) Plan.locked = false;
    Plan.result = null;
    persistPlanSelection();
    ROUTES.planning(view);
  });
  $$('[data-fixgeo]', view).forEach(it => it.onclick = () => deliveryForm((Store.data.deliveries || []).find(x => x.DeliveryID === it.dataset.fixgeo)));
  const change = el('planChangeSel');
  if (change) change.onclick = () => { Plan.locked = false; persistPlanSelection(); location.hash = '#/dashboard'; };

  bindDecisionEvents();

  if (Plan.result) {
    renderDecision();
  } else if (withGeo.length && !Plan._autoRunning) {
    Plan._autoRunning = true;
    runAutoPlan().finally(() => { Plan._autoRunning = false; });
  }
};
function decisionLoading(){
  return `<div class="h-card mb14">กำลังจัดเส้นทาง…</div>
    <p class="small muted" style="margin:0"><i data-lucide="loader-2" style="width:14px;height:14px;animation:spin 1s linear infinite;vertical-align:-2px"></i> คำนวณลำดับส่ง · เลือกรถ</p>`;
}
function decisionInitial(count){
  return `<div class="h-card mb14">กำลังจัดเส้นทาง…</div>
    <p class="small muted" style="margin:0">${int(count)} บิลพร้อมจัด — รอสักครู่</p>`;
}
function miniStat(l,v,ic){ return `<div class="flex between aic" style="padding:11px 13px;border:1px solid var(--border);border-radius:10px">
  <span class="flex aic gap8"><i data-lucide="${ic}" style="width:18px;height:18px;color:#6B7383"></i><span class="small muted">${l}</span></span>
  <span class="strong tab">${v}</span></div>`; }

const SPLIT_COLORS=['#6f9e0a','#2563EB','#DB2777','#D97706','#7C3AED','#0891B2'];
function planCarTitle(i, g){
  const plate = vehicleShortName(g && g.v) || '';
  return `รถคันที่ ${i + 1}${plate ? ' · ' + plate : ''}`;
}

async function runAutoPlan(){
  Plan._autoRunning = true;
  const dec = el('decision');
  if (dec) { dec.innerHTML = decisionLoading(); icons(); }
  const btn=el('autoPlan'); if(btn){btn.disabled=true; btn.innerHTML='<i data-lucide="loader-2" style="animation:spin 1s linear infinite"></i>กำลังวิเคราะห์…'; icons();}
  const drafts=normalizeDeliveries((Store.data.deliveries||[]).filter(d=>Plan.selected.has(d.DeliveryID)));
  const enriched=Planner.enrichStopCoords(drafts, Store.data.deliveries, Store.data.customers)
    .map(d => Object.assign({}, d, { _district: DelView.zone(d) || 'ไม่ระบุเขต' }));
  const seq=Planner.order(enriched.filter(d=>Planner.hasCoords(d) && Planner.hasPlausibleCoords(d)));
  const road=await Planner.roadMetrics(seq);   // OSRM ถนนจริง (null ถ้าล่ม → ใช้เส้นตรง)
  const out=Planner.options(seq, road);
  const fleet = Planner.fleetVehicles();
  const cap = Math.min(fleet.length, seq.length) || 1;
  if (Plan.kMax == null || Plan.kMax < cap) Plan.kMax = cap;
  const maxK = Plan.kMax;
  const autoK = Planner.splitK(seq, out.metrics, maxK);
  if (Plan.kWanted == null) Plan.kWanted = autoK;
  Plan.kWanted = Math.max(1, Math.min(maxK, Number(Plan.kWanted) || autoK));
  const k = Plan.kWanted;
  const split = k >= 2 ? Planner.autoSplit(seq, fleet.slice(0, k)) : [];
  Plan.result={seq, split, ...out, maxK};
  Plan.chosen = split.length >= 2 ? 'C' : 'A';
  Plan.splitSel = split.map(g => splitSelFor(g));
  const rec = Planner.recommendVehicle() || Planner.availableVehicles()[0] || (Store.data.vehicles||[])[0];
  const emp = rec && (Store.data.employees||[]).find(e=>e.VehicleID===rec.VehicleID);
  Plan.sel = { type:'COMPANY', vehId: rec?rec.VehicleID:'', extId:(Planner.availableExternal()[0]||{}).ExternalVehicleID||'',
    driver: rec?(rec.CurrentDriver || (emp&&emp.EmployeeName) || ''):'',
    driverEmployeeId: emp ? emp.EmployeeID : empIdByName(rec&&rec.CurrentDriver),
    toll: Planner.toll(), parking: Planner.autoParking(seq) };
  persistPlanSelection();
  Plan._autoRunning = false;
  renderDecision();
}
/** ร้านเดียวกัน / พิกัดเดียวกัน → โชว์แถวเดียว (หลายบิลรวม) */
function stopGroupKey(s){
  const lat = Number(s.Latitude), lng = Number(s.Longitude);
  if (Number.isFinite(lat) && Number.isFinite(lng)) return lat.toFixed(5) + ',' + lng.toFixed(5);
  return String(s.CustomerName || '').trim().toLowerCase() + '|' + String(s.Address || '').trim().toLowerCase().slice(0, 48);
}
function groupStopsForDisplay(stops){
  const out = [];
  const seen = new Map();
  for (const s of stops || []) {
    const k = stopGroupKey(s);
    if (!seen.has(k)) {
      const g = { rep: s, bills: [s], dist: Number(s._distPrev) || 0 };
      seen.set(k, g);
      out.push(g);
    } else seen.get(k).bills.push(s);
  }
  return out;
}
function uniqueShopCount(stops){ return groupStopsForDisplay(stops).length; }
function planBillLabel(s){ return uniqueDocParts(s).join(' · ') || DelView.invoiceNo(s) || '—'; }
function displayBillRow(s, i, timeHint){
  const color = (PRIORITY[s.Priority] || PRIORITY.NORMAL).color;
  return `<div class="plan-stop-row">
    <span class="stop-num" style="background:${color}">${i}</span>
    <div class="plan-stop-main">
      <div class="strong">${esc(s.CustomerName || '—')}</div>
      <div class="small muted">${esc(planBillLabel(s))}${DelView.zone(s) ? ' · ' + esc(DelView.zone(s)) : ''}${timeHint ? ' · ' + timeHint : ''}</div>
    </div>
    <div class="small muted tab">${int(s.BoxQty || 0)} กล.</div>
  </div>`;
}
/** แปลง seq ของแผน → stops สำหรับไทม์ไลน์/แผนที่ */
function planStopsFromSeq(seq){
  return (seq || []).map((s, i) => Object.assign({}, s, {
    StopOrder: i + 1,
    DistanceFromPrevious: Number(s._distPrev) || Number(s.DistanceFromPrevious) || 0,
  }));
}
function planTimelineForSeq(seq){
  const stops = planStopsFromSeq(seq);
  return Planner.buildStopTimeline({ DeliveryDate: Store.date }, stops);
}
function planRouteTimelineHtml(tl, color){
  if (!tl || !tl.events) return '';
  const rows = tl.events.map(e => {
    if (e.kind === 'depart_wh') {
      return `<div class="plan-route-step">
        <span class="plan-route-dot go">ออก</span>
        <div><b>ออกจากคลัง</b><div class="small muted">จุดเริ่ม — เวลารอ GPS จริงหลังรถออก</div></div>
      </div>`;
    }
    if (e.kind === 'return_wh') {
      return `<div class="plan-route-step">
        <span class="plan-route-dot back">กลับ</span>
        <div><b>กลับถึงคลัง</b><div class="small muted">${e.badGeo ? 'พิกัดผิด' : (e.km ? 'ประมาณ ' + num1(e.km) + ' กม. จากจุดสุดท้าย' : 'จุดจบ')}</div></div>
      </div>`;
    }
    const kmLine = e.badGeo ? 'พิกัดผิด' : (e.km ? 'จากจุดก่อน · ประมาณ ' + num1(e.km) + ' กม.' : 'จุดส่ง');
    return `<div class="plan-route-step">
      <span class="plan-route-dot stop" style="background:${color || '#2563EB'}">${int(e.order)}</span>
      <div>
        <b>${int(e.order)}. ${esc(e.place)}</b>
        <div class="small muted">${kmLine}</div>
      </div>
    </div>`;
  }).join('');
  return `<div class="plan-route-tl">
    <div class="plan-route-stats">
      <span><b>${int((tl.events || []).filter(e => e.kind === 'stop').length)}</b> จุด</span>
      <span>แผนที่ ~${num1(tl.totalKm)} กม.</span>
      <span class="muted">เวลาจริงจาก GPS หลังวิ่ง</span>
    </div>
    <div class="small muted">ถึง · จอด · ออก ดูจาก GPS หลังวิ่ง</div>
    ${tl.hasBadGeo ? `<div class="small" style="color:#B45309;margin-bottom:8px">มีจุดพิกัดผิด — ข้ามกม.นั้น</div>` : ''}
    <div class="plan-route-steps scrolly">${rows}</div>
  </div>`;
}
function planTruckPreviewHtml(i, g, color){
  const seq = g.seq || [];
  const zones = (g.districts && g.districts.length) ? g.districts : [...new Set(seq.map(s => s._district || DelView.zone(s)).filter(Boolean))];
  const tl = planTimelineForSeq(seq);
  const billRows = seq.map((s, n) => displayBillRow(s, n + 1)).join('');
  return `<div class="plan-truck-preview card mb14" data-plan-truck="${i}">
    <div class="flex between aic wrap gap8 mb8">
      <div class="strong" style="color:${color}">${esc(planCarTitle(i, g))} · ${int(seq.length)} จุด · เขต ${esc(zones.join(' · ') || '—')}</div>
      <span class="small muted">ลำดับแผน คลัง → 1 → 2 → … → กลับคลัง</span>
    </div>
    <div class="plan-truck-grid">
      <div id="planMap${i}" class="map plan-route-map"></div>
      ${planRouteTimelineHtml(tl, color)}
    </div>
    <details class="plan-bills-details">
      <summary class="small strong">รายการบิล ${int(seq.length)} รายการ</summary>
      <div class="plan-stop-list scrolly">${billRows || '<div class="muted small">ไม่มีบิล</div>'}</div>
    </details>
  </div>`;
}
function mountPlanRouteMaps(){
  if (!Plan.result) return;
  const groups = (Plan.result.split && Plan.result.split.length >= 2)
    ? Plan.result.split
    : [{ seq: Plan.result.seq, v: null, districts: [] }];
  const wh = warehouse();
  groups.forEach((g, i) => {
    const box = el('planMap' + i);
    if (!box || !window.L) return;
    try {
      if (box._leaflet_id) { box._leaflet_id = null; box.innerHTML = ''; }
      const color = SPLIT_COLORS[i % SPLIT_COLORS.length];
      const mp = MapUtil.make('planMap' + i, wh);
      MapUtil.whMarker(mp, wh);
      const line = [[wh.lat, wh.lng]];
      const bounds = [[wh.lat, wh.lng]];
      (g.seq || []).forEach((s, n) => {
        if (!Planner.hasCoords(s)) return;
        MapUtil.stopMarker(mp, s, n + 1, color);
        line.push([+s.Latitude, +s.Longitude]);
        bounds.push([+s.Latitude, +s.Longitude]);
      });
      line.push([wh.lat, wh.lng]);
      if (line.length > 2) L.polyline(line, { color, weight: 4, opacity: 0.85 }).addTo(mp);
      if (bounds.length > 1) mp.fitBounds(bounds, { padding: [28, 28] });
      setTimeout(() => { try { mp.invalidateSize(); } catch (_) {} }, 120);
      icons();
    } catch (e) { console.warn('plan map', e); }
  });
}
function renderDecision(){
  const dec = el('decision');
  if (!dec || !Plan.result) return;
  const { seq, metrics: m, split, maxK } = Plan.result;
  const splitReady = Array.isArray(split) && split.length >= 2;
  const kNow = Math.max(1, Plan.kWanted || (splitReady ? split.length : 1));
  const kMax = Math.max(1, Plan.kMax || maxK || kNow);
  const kPicker = kMax >= 2 ? `<div class="plan-k-picker">
      <span class="small strong">ใช้กี่คัน</span>
      <button class="btn plan-k-btn" data-kwant="-1" type="button" ${kNow<=1?'disabled':''} aria-label="ลดจำนวนรถ">−</button>
      <span class="plan-k-n tab">${int(kNow)}</span>
      <button class="btn plan-k-btn" data-kwant="1" type="button" ${kNow>=kMax?'disabled':''} aria-label="เพิ่มจำนวนรถ">+</button>
      <span class="small muted">ได้ถึง ${int(kMax)} คัน · กด −/+ ได้ตลอดก่อนบันทึก</span>
    </div>` : '';
  const timeWarn = !splitReady && m.durationMin > Planner.workDayMin()
    ? `<div class="notice warn mb14"><i data-lucide="clock"></i><div>ใช้เวลาประมาณ ${Planner.fmtDur(m.durationMin)} — บันทึกคันนี้ก่อน แล้วจัดรอบถัดไป</div></div>` : '';
  const splitNote = splitReady
    ? `<div class="notice info mb14"><i data-lucide="git-branch"></i><div>แยก <b>${int(split.length)} คัน</b> ตามเขตใกล้กัน — กด −/+ ด้านบนถ้าอยากเปลี่ยนจำนวน</div></div>`
    : '';
  const routePreviews = splitReady
    ? split.map((g, i) => planTruckPreviewHtml(i, g, SPLIT_COLORS[i % SPLIT_COLORS.length])).join('')
    : planTruckPreviewHtml(0, { seq, v: (Plan.sel && Plan.sel.vehId) ? (Store.data.vehicles||[]).find(v=>v.VehicleID===Plan.sel.vehId) : null, districts: [] }, SPLIT_COLORS[0]);

  dec.innerHTML = `
    <div class="flex between aic mb14">
      <span class="h-card">${int(m.stops)} บิล · ${int(uniqueShopCount(seq))} ร้าน${splitReady ? ` · แยก ${int(split.length)} คัน` : ''} · ${num1(Planner.routeDisplayKm(m))} กม. ไป · ${Planner.fmtDur(m.durationMin)}</span>
      <button class="btn btn-sm" id="replan" type="button"><i data-lucide="rotate-cw"></i>เรียงลำดับใหม่</button>
    </div>
    ${timeWarn}
    ${kPicker}
    ${splitNote}
    <div class="plan-driver-step">
      <div class="plan-driver-step-head"><i data-lucide="truck"></i><span>${splitReady ? 'รถ + คนขับที่จัดให้ (แก้ทะเบียน/คนขับได้)' : 'เลือกรถ + คนขับ'}</span></div>
      <div class="plan-driver-box" id="driverFormBox">${splitReady ? splitFormAll(Plan.result) : selForm()}</div>
    </div>
    ${splitReady ? `<div id="costBox" style="margin-top:12px">${splitCostBoxAll(Plan.result)}</div>` : ''}
    <div class="plan-route-previews mt16">${routePreviews}</div>
    <div class="flex gap8 mt16">
      <button class="btn btn-primary btn-block btn-lg" id="confirmRoute" type="button"><i data-lucide="save"></i>${confirmBtnLabel()}</button>
      <button class="btn btn-block btn-lg" id="confirmRouteReports" type="button"><i data-lucide="bar-chart-3"></i>บันทึกแล้วไปรายงาน</button>
    </div>
  `;
  icons();
  bindDecisionEvents();
  setTimeout(() => {
    mountPlanRouteMaps();
    const box = el('driverFormBox');
    if (box) box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, 80);
}
function confirmBtnLabel(){
  if (Plan.result && Array.isArray(Plan.result.split) && Plan.result.split.length >= 2) {
    return `บันทึกจัดรถ ${int(Plan.result.split.length)} คัน`;
  }
  const v = selVehicle();
  const drv = String(Plan.sel.driver || (v && (v.CurrentDriver || v.DriverName)) || '').trim();
  const vehLbl = vehicleShortName(v) || '';
  const who = [drv, vehLbl].filter(Boolean).join(' · ');
  return who ? `บันทึกรายการ (${who})` : 'บันทึกรายการ';
}
function refreshConfirmBtn(){
  const cr = el('confirmRoute');
  if (!cr || !Plan.result) return;
  cr.innerHTML = `<i data-lucide="save"></i>${confirmBtnLabel()}`;
  icons();
}
function optionCard(o){
  const sel = Plan.chosen===o.id;
  return `<div class="opt ${sel?'sel':''} ${o.feasible?'':''}" data-opt="${o.id}">
    <div class="opt-head"><span class="opt-name">OPTION ${o.id} · ${esc(o.name)}</span>
      ${o.feasible?`<span class="badge b-blue">${money(o.cost.total)} ฿</span>`:`<span class="badge b-red">ใช้ไม่ได้</span>`}</div>
    <div class="small muted" style="margin-bottom:6px">${esc(o.note)}</div>
    <div class="flex gap12 small" style="color:#4B5363">
      <span><i data-lucide="truck" style="width:13px;height:13px;vertical-align:-2px"></i> ${o.vehicles.filter(Boolean).length} คัน</span>
      <span><i data-lucide="navigation" style="width:13px;height:13px;vertical-align:-2px"></i> ${num1(o.distance)} กม.</span>
      <span><i data-lucide="clock" style="width:13px;height:13px;vertical-align:-2px"></i> ${Planner.fmtDur(o.duration)}</span>
    </div>
    ${o.overtime?`<div class="small" style="color:#B45309;margin-top:6px">⚠ มีรอบที่อาจเกินเวลาทำงาน</div>`:''}
    ${o.id==='C'?`<div class="flex aic gap8" style="margin-top:10px;padding-top:10px;border-top:1px solid #F3F5F8">
      <span class="small muted">จำนวนคัน</span>
      <button class="btn btn-sm" data-ksplit="-1" type="button">−</button>
      <span class="strong tab">${o.split.length}</span>
      <button class="btn btn-sm" data-ksplit="1" type="button">+</button>
    </div>`:''}
  </div>`;
}
/* ---- manual vehicle/driver selection ---- */
function selForm(){
  const emps=Store.data.employees||[], ext=Store.data.externalVehicles||[];
  const veh=(Planner.availableVehicles().length?Planner.availableVehicles():(Store.data.vehicles||[]));
  const drivers=emps.filter(x=>x.Role==='DRIVER'&&!x.IsDeleted);
  const isExt=Plan.sel.type==='EXTERNAL';
  return `<div class="plan-driver-card">
    <div class="seg" id="selType" style="margin-bottom:12px">
      <button class="${!isExt?'on':''}" data-t="COMPANY">รถบริษัท</button>
      <button class="${isExt?'on':''}" data-t="EXTERNAL">รถภายนอก</button></div>
    <div class="plan-driver-grid">
      <div class="field" style="margin:0"><label class="label">รถ</label>
        ${isExt
          ? `<select class="select" id="selExt">${ext.length?ext.map(v=>`<option value="${esc(v.ExternalVehicleID)}" ${Plan.sel.extId===v.ExternalVehicleID?'selected':''}>${esc(v.ProviderName)} · ${esc(v.LicensePlate)}</option>`).join(''):'<option value="">— ไม่มีรถภายนอก —</option>'}</select>`
          : `<select class="select" id="selVeh">${veh.length?veh.map(v=>`<option value="${esc(v.VehicleID)}" ${Plan.sel.vehId===v.VehicleID?'selected':''}>${esc(vehicleOptionLabel(v))}</option>`).join(''):'<option value="">— ไม่มีรถว่าง —</option>'}</select>`}
      </div>
      <div class="field" style="margin:0"><label class="label">คนขับ</label>
        <select class="select" id="selDriverEmp">
          <option value="">— เลือกคนขับ —</option>
          ${drivers.map(dr=>`<option value="${esc(dr.EmployeeID)}" ${Plan.sel.driverEmployeeId===dr.EmployeeID?'selected':''}>${esc(dr.EmployeeName)}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="field" style="margin:10px 0 0"><input class="input" id="selDriver" value="${esc(Plan.sel.driver)}" placeholder="หรือพิมพ์ชื่อคนขับ (ถ้าไม่ได้เลือกจากรายชื่อ)"></div>
  </div>`;
}
function selVehicle(){ return Plan.sel.type==='EXTERNAL'
  ? (Store.data.externalVehicles||[]).find(v=>v.ExternalVehicleID===Plan.sel.extId)
  : (Store.data.vehicles||[]).find(v=>v.VehicleID===Plan.sel.vehId); }
function selCost(){
  const m=Plan.result.metrics, v=selVehicle();
  const isExt=Plan.sel.type==='EXTERNAL';
  const fuel = isExt ? 0 : Planner.fuelCost(m.distance, v);
  const external = isExt && v ? Planner.extAmount(v, m.distance) : 0;
  const toll = Number(Plan.sel.toll)||0;
  const parking = Number(Plan.sel.parking)||0;
  return { fuel, toll, parking, external, total:+(fuel+toll+parking+external).toFixed(2) };
}
function selCostBox(){
  const m=Plan.result.metrics, c=selCost(), v=selVehicle();
  const over = m.durationMin > Planner.workDayMin();
  const workLbl = String(Planner.workStartHour()).padStart(2,'0')+':00–'+String(Planner.workEndHour()).padStart(2,'0')+':00';
  const warn = over ? `<div class="notice warn" style="margin-bottom:10px"><i data-lucide="clock"></i><div>เวลาประมาณ ${Planner.fmtDur(m.durationMin)} เกินเวลาทำงาน ${workLbl} — ควรแบ่งตามเขตหลายคัน</div></div>` : '';
  const mallN = (Plan.result.seq||[]).filter(s=>Planner.isMall(s)).length;
  const row=(l,x)=>`<div class="flex between" style="padding:5px 0;font-size:13px"><span class="muted">${l}</span><span class="tab">${money(x)}</span></div>`;
  const editRow=(l,id,val,hint)=>`<div class="flex between aic" style="padding:4px 0"><span class="muted" style="font-size:13px">${l}${hint?` <span class="small" style="color:#9AA3B2">${hint}</span>`:''}</span>
    <span class="flex aic" style="gap:4px"><input class="input" id="${id}" type="number" value="${val}" style="width:96px;height:32px;text-align:right;padding:0 8px"><span class="small muted">฿</span></span></div>`;
  return `${warn}<div style="border:1px solid var(--border);border-radius:11px;padding:14px">
    <div class="strong mb14">สรุปต้นทุนประมาณ <span class="small muted">(แก้ทางด่วน/ค่าจอดได้)</span></div>
    ${row('ค่าน้ำมัน · '+num1(Planner.fuelDistanceKm(m))+' กม. (ไป-กลับ)', c.fuel)}
    ${editRow('ค่าทางด่วน','selToll',Number(Plan.sel.toll)||0,'ใส่ 0 ถ้าไม่ขึ้นทางด่วน')}
    ${editRow('ค่าจอดรถ','selPark',Number(Plan.sel.parking)||0, mallN?`ห้าง ${mallN} จุด`:'ร้านเดี่ยว')}
    ${c.external?row('ค่ารถภายนอก',c.external):''}
    <div class="divider"></div>
    <div class="flex between" style="font-size:15px"><span class="strong">ต้นทุนรวม</span><span class="strong tab" style="color:var(--brand-ink)" id="selTotal">${money(c.total)} ฿</span></div>
    <div class="flex gap12" style="margin-top:10px">
      <div style="flex:1;text-align:center;background:var(--brand-soft);border-radius:9px;padding:9px"><div class="small muted">ต่อจุด</div><div class="strong tab" id="selPerStop">${money(c.total/m.stops)}</div></div>
      <div style="flex:1;text-align:center;background:var(--brand-soft);border-radius:9px;padding:9px"><div class="small muted">ต่อกล่อง</div><div class="strong tab" id="selPerBox">${money(c.total/m.boxes)}</div></div>
    </div></div>`;
}
function refreshCostBox(){ const cb=el('costBox'); if(cb){ cb.innerHTML=selCostBox(); icons(); bindCostInputs(); } }
function bindCostInputs(){
  if(!Plan.result) return;
  const m=Plan.result.metrics;
  const t=el('selToll'), p=el('selPark');
  const upd=()=>{ Plan.sel.toll=+t.value||0; Plan.sel.parking=+p.value||0; const c=selCost();
    if(el('selTotal'))el('selTotal').textContent=money(c.total)+' ฿';
    if(el('selPerStop'))el('selPerStop').textContent=money(c.total/m.stops);
    if(el('selPerBox'))el('selPerBox').textContent=money(c.total/m.boxes); };
  if(t)t.oninput=upd; if(p)p.oninput=upd;
}
/* ---- multi-route (split) vehicle/driver selection — 1 ชุดต่อ Route ---- */
function splitForm(g, i){
  const veh = Planner.fleetVehicles().length ? Planner.fleetVehicles() : (Store.data.vehicles||[]);
  const emps=Store.data.employees||[];
  const drivers=emps.filter(x=>x.Role==='DRIVER'&&!x.IsDeleted);
  const sel = Plan.splitSel[i] || {};
  const color=SPLIT_COLORS[i%SPLIT_COLORS.length];
  const zones = (g.districts && g.districts.length)
    ? g.districts
    : [...new Set((g.seq||[]).map(s => s._district || DelView.zone(s)).filter(Boolean))];
  return `<div class="plan-driver-card plan-split-card" style="border-left:4px solid ${color}">
    <div class="strong" style="margin-bottom:4px">${esc(planCarTitle(i, g))} · ${int(g.seq.length)} บิล · ประมาณ ${Planner.fmtDur(g.m.durationMin)}</div>
    <div class="small muted" style="margin-bottom:10px">เขตนี้ไปกับคันนี้: ${esc(zones.join(' · ') || '—')}</div>
    <div class="plan-driver-grid">
      <div class="field" style="margin:0"><label class="label">รถ</label>
        <select class="select" data-splitveh="${i}">${veh.map(v=>`<option value="${esc(v.VehicleID)}" ${sel.vehId===v.VehicleID?'selected':''}>${esc(vehicleOptionLabel(v))}</option>`).join('')}</select></div>
      <div class="field" style="margin:0"><label class="label">คนขับ</label>
        <select class="select" data-splitdrvemp="${i}">
          <option value="">— เลือกคนขับ —</option>
          ${drivers.map(dr=>`<option value="${esc(dr.EmployeeID)}" ${sel.driverEmployeeId===dr.EmployeeID?'selected':''}>${esc(dr.EmployeeName)}</option>`).join('')}
        </select></div>
    </div>
    <div class="field" style="margin:10px 0 0"><input class="input" data-splitdrv="${i}" value="${esc(sel.driver||'')}" placeholder="หรือพิมพ์ชื่อคนขับ"></div>
  </div>`;
}
function splitFormAll(opt){
  return opt.split.map((g,i)=>splitForm(g,i)).join('');
}
function splitCost(g,i){
  const sel=Plan.splitSel[i]||{};
  const v=(Store.data.vehicles||[]).find(x=>x.VehicleID===sel.vehId) || g.v;
  const fuel=v?Planner.fuelCost(g.m.distance,v):0, toll=Number(sel.toll)||0, parking=Number(sel.parking)||0;
  return { fuel, toll, parking, total:+(fuel+toll+parking).toFixed(2) };
}
function gpsCostForPlate(plate){
  const p = String(plate || '').replace(/\s+/g,'').toLowerCase();
  if (!p) return null;
  const r = (Store.data.routes || []).find(x => String(x.LicensePlate||'').replace(/\s+/g,'').toLowerCase() === p && Number(x.GpsDistanceKm) > 0);
  if (!r) return null;
  const km = Number(r.GpsDistanceKm) || 0;
  return { km, baht: GpsTrack.fuelEst(km, r), src: gpsSourceLabel(r.GpsSource) };
}
function splitCostBoxAll(opt){
  const rows = opt.split.map((g,i)=>{
    const c=splitCost(g,i);
    const v=(Store.data.vehicles||[]).find(x=>x.VehicleID===((Plan.splitSel[i]||{}).vehId)) || g.v;
    const rate = v && v.FuelCostPerKm ? Number(v.FuelCostPerKm) : Planner.fuelPerKm();
    const km = Number(g.m.distance) || 0;
    const gps = gpsCostForPlate(v && v.LicensePlate);
    const extra = (c.toll||0) + (c.parking||0);
    const gpsLine = gps
      ? `<div class="small" style="color:var(--brand-ink);margin-top:2px"><b>น้ำมันจริง GPS ${gps.src || 'Cartrack'}</b> ${num1(gps.km)} กม. × ${num1(rate)} ฿ = ${money(gps.baht)} ฿</div>`
      : `<div class="small muted" style="margin-top:2px">น้ำมันจริง: รอ GPS Cartrack ของคันนี้ — จอดส่งแล้ววิ่งต่อ ระบบนับกม.แยกคัน ไม่รวมกับคันอื่น</div>`;
    return `<div style="padding:10px 0;border-bottom:1px solid #F3F5F8">
      <div class="flex between" style="font-size:13px"><span class="strong">${esc(planCarTitle(i, g))}</span><span class="tab">${gps ? money(gps.baht + extra) : money(c.fuel)} ฿</span></div>
      <div class="small muted">ประมาณแผนที่ ${num1(km)} กม. × ${num1(rate)} ฿/กม. = ${money(c.fuel)} ฿ (ยังไม่ใช่ของจริง)</div>
      ${gpsLine}
    </div>`;
  }).join('');
  return `<div style="border:1px solid var(--border);border-radius:11px;padding:14px">
    <div class="strong mb8">ต้นทุนน้ำมันแยกคัน</div>
    <div class="small muted mb14">คิดคนละคันจากระยะที่รถคันนั้นวิ่งจริงผ่าน <b>GPS Cartrack</b> (คลัง → จุดส่ง → จอด → ออกวิ่งต่อ → จุดถัดไป → กลับคลัง) ไม่เอากม.คันอื่นมารวม<br>
    ตอนจัดรถยังไม่วิ่ง ตัวเลขแผนที่เป็นแค่ประมาณ — ราคาจริงดูหลังรถกลับ ที่รายงานย้อนหลัง</div>
    ${rows}
  </div>`;
}
function empIdByName(name){ const emp=(Store.data.employees||[]).find(x=>x.EmployeeName===name); return emp?emp.EmployeeID:''; }
function splitSelFor(g){ const driver=(g.v&&g.v.CurrentDriver)||''; return { vehId:g.v?g.v.VehicleID:'', driver, driverEmployeeId:empIdByName(driver), toll:0, parking:Planner.autoParking(g.seq) }; }
function bindDecisionEvents(){
  const rp=el('replan'); if(rp) rp.onclick=()=>{ Plan.result=null; runAutoPlan(); };
  $$('[data-kwant]').forEach(b => b.onclick = () => {
    const maxK = Math.max(1, Plan.kMax || (Plan.result && Plan.result.maxK) || 1);
    const cur = Math.max(1, Plan.kWanted || ((Plan.result.split||[]).length) || 1);
    Plan.kWanted = Math.max(1, Math.min(maxK, cur + Number(b.dataset.kwant)));
    Plan.result = null;
    runAutoPlan();
  });
  const splitMode = Plan.result && Array.isArray(Plan.result.split) && Plan.result.split.length >= 2;
  if (splitMode) {
    $$('[data-splitveh]').forEach((it) => {
      it.onchange = () => {
        const i = Number(it.dataset.splitveh);
        const sel = Plan.splitSel[i] || {};
        sel.vehId = it.value;
        const v = (Store.data.vehicles || []).find(x => x.VehicleID === it.value);
        if (v && v.CurrentDriver) {
          sel.driver = v.CurrentDriver;
          sel.driverEmployeeId = empIdByName(v.CurrentDriver);
          const txt = document.querySelector(`[data-splitdrv="${i}"]`);
          const emp = document.querySelector(`[data-splitdrvemp="${i}"]`);
          if (txt) txt.value = sel.driver || '';
          if (emp) emp.value = sel.driverEmployeeId || '';
        }
        Plan.splitSel[i] = sel;
        const cb = el('costBox');
        if (cb) cb.innerHTML = splitCostBoxAll(Plan.result);
      };
    });
    $$('[data-splitdrvemp]').forEach((it) => {
      it.onchange = () => {
        const i = Number(it.dataset.splitdrvemp);
        const sel = Plan.splitSel[i] || {};
        sel.driverEmployeeId = it.value;
        const emp = (Store.data.employees || []).find(x => x.EmployeeID === it.value);
        sel.driver = emp ? emp.EmployeeName : '';
        const txt = document.querySelector(`[data-splitdrv="${i}"]`);
        if (txt) txt.value = sel.driver;
        Plan.splitSel[i] = sel;
      };
    });
    $$('[data-splitdrv]').forEach((it) => {
      it.oninput = () => {
        const i = Number(it.dataset.splitdrv);
        const sel = Plan.splitSel[i] || {};
        sel.driver = it.value;
        sel.driverEmployeeId = '';
        Plan.splitSel[i] = sel;
      };
    });
  }
  const st=el('selType'); if(st) $$('#selType button').forEach(b=>b.onclick=()=>{ Plan.sel.type=b.dataset.t;
    if(b.dataset.t==='EXTERNAL' && !Plan.sel.extId){ const e=(Store.data.externalVehicles||[])[0]; Plan.sel.extId=e?e.ExternalVehicleID:''; }
    renderDecision(); });
  const sv=el('selVeh'); if(sv) sv.onchange=()=>{ Plan.sel.vehId=sv.value; const v=selVehicle();
    if(v&&v.CurrentDriver){ Plan.sel.driver=v.CurrentDriver; Plan.sel.driverEmployeeId=empIdByName(v.CurrentDriver);
      if(el('selDriver')) el('selDriver').value=v.CurrentDriver; if(el('selDriverEmp')) el('selDriverEmp').value=Plan.sel.driverEmployeeId; }
    else { const emp=(Store.data.employees||[]).find(e=>e.VehicleID===sv.value); if(emp){ Plan.sel.driver=emp.EmployeeName; Plan.sel.driverEmployeeId=emp.EmployeeID;
      if(el('selDriver')) el('selDriver').value=emp.EmployeeName; if(el('selDriverEmp')) el('selDriverEmp').value=emp.EmployeeID; } }
    refreshConfirmBtn(); };
  const se=el('selExt'); if(se) se.onchange=()=>{ Plan.sel.extId=se.value; const v=selVehicle();
    if(v&&v.DriverName){ Plan.sel.driver=v.DriverName; Plan.sel.driverEmployeeId=''; if(el('selDriver')) el('selDriver').value=v.DriverName; }
    refreshConfirmBtn(); };
  const sde=el('selDriverEmp'); if(sde) sde.onchange=()=>{ Plan.sel.driverEmployeeId=sde.value;
    if(sde.value){ const emp=(Store.data.employees||[]).find(x=>x.EmployeeID===sde.value); Plan.sel.driver=emp?emp.EmployeeName:''; if(el('selDriver')) el('selDriver').value=Plan.sel.driver; }
    refreshConfirmBtn(); };
  const sd=el('selDriver'); if(sd) sd.oninput=()=>{ Plan.sel.driver=sd.value; Plan.sel.driverEmployeeId=''; refreshConfirmBtn(); };
  const cr=el('confirmRoute'); if(cr) cr.onclick=()=>confirmRoute(false);
  const crr=el('confirmRouteReports'); if(crr) crr.onclick=()=>confirmRoute(true);
}
function queueRoutePrints(routeIds, fallbackMatch){
  setTimeout(() => {
    let routes = (routeIds || []).map(id => (Store.data.routes || []).find(x => x.RouteID === id)).filter(Boolean);
    if (!routes.length && typeof fallbackMatch === 'function') {
      routes = (Store.data.routes || []).filter(fallbackMatch);
    }
    routes.forEach((r, i) => setTimeout(() => printRouteNote(r), i * 900));
  }, 350);
}
async function confirmRoute(goReports){
  const seq=Plan.result.seq, m=Plan.result.metrics;
  const splitMode = Plan.result && Array.isArray(Plan.result.split) && Plan.result.split.length >= 2;
  const isExt=Plan.sel.type==='EXTERNAL';
  const v=selVehicle();
  if(!splitMode && !v){ toast('กรุณาเลือกรถก่อน','warn'); return; }
  const c=selCost();
  const emps=Store.data.employees||[];
  const emp=!isExt && (emps.find(e=>e.EmployeeID===Plan.sel.driverEmployeeId) || emps.find(e=>e.VehicleID===v.VehicleID));
  const data={ DeliveryDate:Store.date, RouteType:isExt?'EXTERNAL_VEHICLE':'COMPANY_VEHICLE',
    DriverName: Plan.sel.driver || (isExt?v.DriverName:v.CurrentDriver) || '',
    DriverPhone: (emp&&emp.Phone) || (isExt?v.DriverPhone:'') || '',
    DriverEmployeeID: isExt?'':(Plan.sel.driverEmployeeId||''),
    VehicleType: v.VehicleType||'', VehicleName: isExt?'':(v.VehicleName||''),
    LicensePlate: v.LicensePlate||'', ProviderName: isExt?(v.ProviderName||''):'',
    TotalStops:m.stops, TotalBoxes:m.boxes, TotalDistance:Planner.routeDisplayKm(m), EstimatedDuration:m.durationMin,
    EstimatedFuelCost:c.fuel, EstimatedTollCost:c.toll, EstimatedParkingCost:c.parking,
    EstimatedExternalCost:c.external||0, EstimatedOtherCost:0, Status:'Planned' };
  const stops=seq.map(s=>{
    const d=(Store.data.deliveries||[]).find(x=>String(x.DeliveryID)===String(s.DeliveryID));
    const lat=Planner.hasCoords(s)?+s.Latitude:(d&&Planner.hasCoords(d)?+d.Latitude:null);
    const lng=Planner.hasCoords(s)?+s.Longitude:(d&&Planner.hasCoords(d)?+d.Longitude:null);
    return { DeliveryID:s.DeliveryID, CustomerName:s.CustomerName, BranchName:s.BranchName, Address:s.Address,
      Latitude:lat, Longitude:lng, BoxQty:s.BoxQty, DistanceFromPrevious:+(s._distPrev||0).toFixed(1) };
  });
  if (splitMode) {
    const groups = Plan.result.split || [];
    const routePromises = groups.map((g, i) => {
      const ss = Plan.splitSel[i] || {};
      const veh = (Store.data.vehicles || []).find(x => x.VehicleID === ss.vehId) || g.v;
      if (!veh) return Promise.reject(new Error('รถไม่พอสำหรับรอบที่ ' + (i + 1)));
      const empMatch = emps.find(e => e.EmployeeID === ss.driverEmployeeId) || emps.find(e => e.VehicleID === veh.VehicleID);
      const cc = splitCost(g, i);
      const payload = {
        DeliveryDate: Store.date,
        RouteType: 'COMPANY_VEHICLE',
        DriverName: ss.driver || (veh && veh.CurrentDriver) || '',
        DriverPhone: (empMatch && empMatch.Phone) || '',
        DriverEmployeeID: ss.driverEmployeeId || '',
        VehicleType: veh.VehicleType || '',
        VehicleName: veh.VehicleName || '',
        LicensePlate: veh.LicensePlate || '',
        ProviderName: '',
        TotalStops: g.m.stops,
        TotalBoxes: g.m.boxes,
        TotalDistance: Planner.routeDisplayKm(g.m),
        EstimatedDuration: g.m.durationMin,
        EstimatedFuelCost: cc.fuel,
        EstimatedTollCost: cc.toll,
        EstimatedParkingCost: cc.parking,
        EstimatedExternalCost: 0,
        EstimatedOtherCost: 0,
        Status: 'Planned'
      };
      const groupStops = g.seq.map((s) => ({
        DeliveryID: s.DeliveryID, CustomerName: s.CustomerName, BranchName: s.BranchName, Address: s.Address,
        Latitude: +s.Latitude || null, Longitude: +s.Longitude || null, BoxQty: s.BoxQty,
        DistanceFromPrevious: +(s._distPrev || 0).toFixed(1)
      }));
      return createRouteOptimistic('confirmRoute', payload, groupStops);
    });
    Plan.selected.clear(); Plan.locked = false; Plan.result=null; Plan.splitSel=[]; Plan.kWanted=null; Plan.kMax=null;
    try { sessionStorage.removeItem('ddc_plan_sel'); sessionStorage.removeItem('ddc_plan_lock'); } catch (_) {}
    if (typeof dPick !== 'undefined') { dPick.sel.clear(); dPick.districts.clear(); dPick.filter = 'noRoute'; }
    Plan.tab = 'rounds';
    if (goReports) Store._reportType = 'loadsheet';
    toast(goReports
      ? `บันทึกแล้ว ${int(groups.length)} รอบ — ดูรายงานได้ ถ้าผิดให้กลับมาแก้ไข`
      : `บันทึกแล้ว ${int(groups.length)} รอบ — กดแก้ไขได้ถ้าผิด`, 'ok', 'บันทึกแล้ว');
    if (goReports) location.hash = '#/reports';
    else if ((location.hash || '') === '#/planning') render();
    else location.hash = '#/planning';
    Promise.allSettled(routePromises).then((all) => {
      const routes = all.filter(x => x.status === 'fulfilled').map(x => x.value && x.value.RouteID).filter(Boolean);
      if (!goReports && routes.length) queueRoutePrints(routes);
    });
    return;
  }
  const routeMatch = r => r.DeliveryDate === Store.date && r.DriverName === data.DriverName && r.TotalStops === data.TotalStops && (r.__pending || r.Status === 'Planned');
  const saveP = createRouteOptimistic('confirmRoute', data, stops);
  Plan.selected.clear(); Plan.locked = false; Plan.result=null; Plan.splitSel=[]; Plan.kWanted=null; Plan.kMax=null;
  try { sessionStorage.removeItem('ddc_plan_sel'); sessionStorage.removeItem('ddc_plan_lock'); } catch (_) {}
  if (typeof dPick !== 'undefined') { dPick.sel.clear(); dPick.districts.clear(); dPick.filter = 'noRoute'; }
  Plan.tab = 'rounds';
  if (goReports) Store._reportType = 'loadsheet';
  toast(goReports ? 'บันทึกแล้ว — เช็คขึ้นของที่หน้ารายงาน (กดแก้ไขได้ถ้าผิด)' : 'บันทึกแล้ว — กดแก้ไขได้ถ้าผิด','ok','บันทึกแล้ว');
  if (goReports) location.hash = '#/reports';
  else if ((location.hash || '') === '#/planning') render();
  else location.hash = '#/planning';
  saveP.then(r => {
    if (!goReports) queueRoutePrints([r && r.RouteID], routeMatch);
  }).catch(() => { if (!goReports) queueRoutePrints([], routeMatch); });
}

/* ================================================================
   ROUNDS — แท็บในหน้าจัดรถ (เดิมเป็นเมนูแยก)
   ================================================================ */
async function renderRoundsTab(view){
  const routes = (Store.data.routes||[]).filter(x=>!x.IsDeleted && x.DeliveryDate===Store.date && x.Status !== 'Cancelled');
  page(view, `
    ${head('จัดรถ', `${thDate(Store.date)} · ${int(routes.length)} รอบ`,
      `<a class="btn btn-sm" href="#/dashboard"><i data-lucide="home"></i>ไปหน้าวันนี้</a>`)}
    ${planPageTabs('rounds')}
    ${routes.length? `<div class="notice ok mb14"><i data-lucide="pencil"></i><div>บันทึกแล้วแก้ได้ — กด <b>แก้ไข</b> ถ้าคนขับ/รถผิด หรือ <b>ยกเลิกจัดรถ</b> เพื่อคืนบิลเข้าคิววันนี้</div></div>
      <div class="plan-round-list">${routes.map(routeCard).join('')}</div>`
      : emptyState('ยังไม่มีรอบส่งวันนี้','กลับไปหน้าวันนี้ → เลือกเขต → จัดรถ','<a class="btn btn-primary" href="#/dashboard"><i data-lucide="home"></i>ไปหน้าวันนี้</a>')}
  `);
  bindPlanTabs(view);
  $$('[data-route]',view).forEach(b=>b.onclick=()=>openRouteDetail(b.dataset.route));
  $$('[data-edit-route]',view).forEach(b=>b.onclick=()=>routeEditForm((Store.data.routes||[]).find(x=>x.RouteID===b.dataset.editRoute)));
  $$('[data-print-route]',view).forEach(b=>b.onclick=()=>printRouteNote((Store.data.routes||[]).find(x=>x.RouteID===b.dataset.printRoute)));
  $$('[data-start]',view).forEach(b=>b.onclick=()=>{ updateLocal('routes','startRoute',b.dataset.start,{Status:'In Progress'},{routeId:b.dataset.start}).then(()=>toast('เริ่มรอบส่งแล้ว','ok')).catch(()=>{}); });
  $$('[data-undo-route]',view).forEach(b=>b.onclick=()=>undoSavedRoute(b.dataset.undoRoute));
}
function routeFuelExpense(route, expenses){
  return (expenses||[]).filter(e => e.RouteID === route.RouteID && e.ExpenseType === 'FUEL')
    .reduce((n, e) => n + (Number(e.Amount) || 0), 0);
}
function routeGpsFuelEst(route){
  const km = Number(route.GpsDistanceKm);
  if (!km) return null;
  return GpsTrack.fuelEst(km, route);
}
function fuelPricePerLiter(){ return Number(setting('FUEL_PRICE_PER_LITER', 33)) || 33; }
function fuelLitersFromBaht(baht){
  const p = fuelPricePerLiter();
  if (!baht || !p) return null;
  return +(Number(baht) / p).toFixed(2);
}
function routeGpsFuelLiters(route){
  const baht = routeGpsFuelEst(route);
  return baht == null ? null : fuelLitersFromBaht(baht);
}
function tripVehicleLabel(r){
  if (!r) return '—';
  const name = r.VehicleName || r.ProviderName || '';
  const plate = r.LicensePlate || '';
  return (name && plate && name !== plate) ? (name + ' · ' + plate) : (plate || name || '—');
}
function routeBillsLine(route, dels){
  const bills = (dels || []).filter(d => String(d.RouteID) === String(route.RouteID));
  if (!bills.length) return '—';
  return bills.map(d => {
    const po = DelView.poNo(d);
    const inv = DelView.invoiceNo(d);
    const shop = d.CustomerName || '—';
    const doc = [po, inv].filter(Boolean).filter((v, i, a) => a.findIndex(x => String(x).replace(/\s+/g,'').toLowerCase() === String(v).replace(/\s+/g,'').toLowerCase()) === i).join(' / ');
    return shop + (doc ? ' (' + doc + ')' : '');
  }).join(' · ');
}
function gpsDiffPct(est, actual){
  est = Number(est); actual = Number(actual);
  if (!est || !actual) return '';
  const d = ((actual - est) / est * 100);
  const sign = d > 0 ? '+' : '';
  return sign + d.toFixed(0) + '%';
}
function fmtTimeShort(iso){
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', hour12: false });
  } catch (_) { return '—'; }
}
function gpsSourceLabel(src){
  if (src === 'cartrack') return 'Cartrack (GPS รถ)';
  if (src === 'driver') return 'มือถือคนขับ';
  if (src === 'mixed') return 'Cartrack + มือถือ';
  return '—';
}
function routeEditForm(r){
  if(!r) return;
  const emps=Store.data.employees||[], veh=Store.data.vehicles||[], ext=Store.data.externalVehicles||[];
  const isExt=r.RouteType==='EXTERNAL_VEHICLE';
  const m=modal({ title:'แก้ไขรอบส่ง '+r.RouteID, body:`
    <div class="field row2"><div><label class="label">ประเภทรถ</label><select class="select" id="edType">
        <option value="COMPANY_VEHICLE" ${!isExt?'selected':''}>รถบริษัท</option>
        <option value="EXTERNAL_VEHICLE" ${isExt?'selected':''}>รถภายนอก</option></select></div>
      <div><label class="label">สถานะ</label><select class="select" id="edStatus">${['Planned','Assigned','In Progress','Completed','Failed','Cancelled'].map(s=>`<option value="${s}" ${r.Status===s?'selected':''}>${(DSTATUS[s]||{}).label||s}</option>`).join('')}</select></div></div>
    <div class="field row2"><div><label class="label">ชื่อรถ / ผู้ให้บริการ</label><input class="input" id="edVeh" list="edVehList" value="${esc(r.VehicleName||r.ProviderName||'')}">
      <datalist id="edVehList">${veh.map(v=>`<option value="${esc(v.VehicleName)}">`).join('')}${ext.map(v=>`<option value="${esc(v.ProviderName)}">`).join('')}</datalist></div>
      <div><label class="label">ทะเบียน</label><input class="input" id="edPlate" value="${esc(r.LicensePlate||'')}"></div></div>
    <div class="field"><label class="label">คนขับ</label><input class="input" id="edDriver" list="edEmpList" value="${esc(r.DriverName||'')}">
      <datalist id="edEmpList">${emps.map(e=>`<option value="${esc(e.EmployeeName)}">`).join('')}</datalist></div>
    <div class="sec-title" style="font-weight:600;margin:6px 0 8px">ค่าใช้จ่าย (แก้แล้วระบบคำนวณรวมใหม่ให้)</div>
    <div class="field row2"><div><label class="label">ค่าน้ำมัน</label><input class="input" type="number" id="edFuel" value="${esc(r.EstimatedFuelCost||0)}"></div>
      <div><label class="label">ค่าทางด่วน</label><input class="input" type="number" id="edToll" value="${esc(r.EstimatedTollCost||0)}"></div></div>
    <div class="field row2"><div><label class="label">ค่าจอดรถ</label><input class="input" type="number" id="edPark" value="${esc(r.EstimatedParkingCost||0)}"></div>
      <div><label class="label">ค่ารถภายนอก</label><input class="input" type="number" id="edExt" value="${esc(r.EstimatedExternalCost||0)}"></div></div>
    <div class="field"><label class="label">ค่าใช้จ่ายอื่น</label><input class="input" type="number" id="edOther" value="${esc(r.EstimatedOtherCost||0)}"></div>
  `, foot:`<button class="btn" id="edCancel">ยกเลิก</button><button class="btn btn-primary" id="edSave"><i data-lucide="check"></i>บันทึก</button>` });
  el('edCancel').onclick=m.close;
  el('edSave').onclick=async()=>{
    const data={ RouteType:el('edType').value, Status:el('edStatus').value,
      VehicleName: el('edType').value==='EXTERNAL_VEHICLE'?'':el('edVeh').value.trim(),
      ProviderName: el('edType').value==='EXTERNAL_VEHICLE'?el('edVeh').value.trim():'',
      LicensePlate:el('edPlate').value.trim(), DriverName:el('edDriver').value.trim(),
      EstimatedFuelCost:+el('edFuel').value||0, EstimatedTollCost:+el('edToll').value||0,
      EstimatedParkingCost:+el('edPark').value||0, EstimatedExternalCost:+el('edExt').value||0,
      EstimatedOtherCost:+el('edOther').value||0, TotalStops:r.TotalStops, TotalBoxes:r.TotalBoxes, recompute:true };
    m.close();
    updateLocal('routes','updateRoute',r.RouteID,data).then(()=>toast('แก้ไขรอบส่งแล้ว','ok')).catch(()=>{});
  };
}
function routeCard(r){
  const canUndo = r.Status === 'Planned' || r.Status === 'Assigned';
  return `<div class="card plan-round-card">
    <div class="flex between aic wrap gap8" style="margin-bottom:12px">
      <div>
        <div class="strong">${esc(r.DriverName || 'ไม่ระบุคนขับ')} · ${esc(tripVehicleLabel(r))}</div>
        <div class="small muted">${esc(r.RouteID)} · ${int(r.TotalStops)} จุด${dstatusBadge(r.Status)}</div>
      </div>
    </div>
    <div class="plan-round-acts">
      <button class="btn btn-sm btn-primary" data-edit-route="${esc(r.RouteID)}"><i data-lucide="pencil"></i>แก้ไข</button>
      ${canUndo ? `<button class="btn btn-sm" data-undo-route="${esc(r.RouteID)}">ยกเลิกจัดรถ</button>` : ''}
      <button class="btn btn-sm" data-print-route="${esc(r.RouteID)}"><i data-lucide="printer"></i>พิมพ์ใบงาน</button>
      ${r.Status==='Planned'?`<button class="btn btn-sm" data-start="${esc(r.RouteID)}"><i data-lucide="play"></i>เริ่มรอบ</button>`:''}
      <button class="btn btn-sm" data-route="${esc(r.RouteID)}"><i data-lucide="map"></i>รายละเอียด</button>
    </div>
  </div>`;
}
function undoSavedRoute(routeId){
  const r = (Store.data.routes || []).find(x => x.RouteID === routeId);
  if (!r) return;
  confirmDialog('ยกเลิกจัดรถรอบนี้ แล้วคืนบิลเข้าคิวหน้าวันนี้?', async () => {
    const dels = (Store.data.deliveries || []).filter(d => String(d.RouteID) === String(routeId));
    const prevSt = r.Status;
    const prevDels = dels.map(d => ({ d, st: d.Status, rid: d.RouteID }));
    try {
      r.Status = 'Cancelled';
      dels.forEach(d => { d.Status = 'Draft'; d.RouteID = ''; });
      await API.post('cancelRoute', { routeId });
      toast('คืนบิลเข้าคิววันนี้แล้ว — จัดใหม่ได้', 'ok');
      if (typeof dPick !== 'undefined') dPick.filter = 'noRoute';
      render();
    } catch (e) {
      r.Status = prevSt;
      prevDels.forEach(x => { x.d.Status = x.st; x.d.RouteID = x.rid; });
      toast(e.message || 'ยกเลิกไม่สำเร็จ', 'err');
    }
  }, { danger: true, yes: 'ยกเลิกจัดรถ' });
}
function rItem(l,v){ return `<div style="border:1px solid var(--border);border-radius:9px;padding:9px 11px"><div class="small muted">${l}</div><div class="strong" style="font-size:13.5px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${v}</div></div>`; }
function fmtClock(ms){
  if (!ms || !Number.isFinite(ms)) return '—';
  try {
    return new Date(ms).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', hour12: false });
  } catch (_) { return '—'; }
}
async function showRouteTimelineModal(route){
  if (!route) return;
  let stops = [];
  try { stops = await API.get('getRouteStops', { routeId: route.RouteID }); } catch (_) {}
  if (!stops.length) {
    stops = (Store.data.deliveries || []).filter(d => String(d.RouteID) === String(route.RouteID)).map((d, i) => ({
      StopOrder: i + 1, DeliveryID: d.DeliveryID, CustomerName: d.CustomerName, BranchName: d.BranchName,
      Address: d.Address, Latitude: d.Latitude, Longitude: d.Longitude, BoxQty: d.BoxQty || 0,
      DistanceFromPrevious: d.DistanceFromPrevious,
    }));
  }
  const needLegs = stops.some(s => !(Number(s.DistanceFromPrevious) > 0) && !(Number(s._distPrev) > 0));
  if (needLegs && stops.length) {
    try {
      const calc = await Planner.metricsForStops(stops, Store.data.deliveries, Store.data.customers);
      if (calc && calc.metrics) stops = calc.seq.length ? calc.seq : stops;
    } catch (_) {}
  }
  const tl = Planner.buildStopTimeline(route, stops);
  const startLbl = tl.startSource === 'gps'
    ? 'ออกจริงจาก GPS'
    : 'ออกประมาณ ' + String(Planner.workStartHour()).padStart(2, '0') + ':00';
  const kmChip = (e) => {
    if (e.badGeo) return `<span class="tl-chip bad">พิกัดผิด</span>`;
    if (e.km == null || e.km === 0 && e.kind !== 'stop') return '';
    if (!(Number(e.km) > 0) && e.kind === 'depart_wh') return '';
    return `<span class="tl-chip km">${num1(e.km)} กม.</span>`;
  };
  const steps = tl.events.map(e => {
    if (e.kind === 'depart_wh') {
      return `<li class="tl-step">
        <div class="tl-rail"><span class="tl-dot go">ออก</span></div>
        <div class="tl-card">
          <div class="tl-card-title">ออกจากคลัง</div>
          <div class="tl-card-sub">${esc(e.place)}</div>
          <div class="tl-chips"><span class="tl-chip time">${fmtClock(e.at)}</span></div>
        </div>
      </li>`;
    }
    if (e.kind === 'return_wh') {
      return `<li class="tl-step">
        <div class="tl-rail"><span class="tl-dot back">กลับ</span></div>
        <div class="tl-card">
          <div class="tl-card-title">กลับถึงคลัง</div>
          <div class="tl-card-sub">${esc(e.place)}</div>
          <div class="tl-chips">
            <span class="tl-chip time">ถึง ${fmtClock(e.at)}</span>
            ${kmChip(e)}
          </div>
        </div>
      </li>`;
    }
    return `<li class="tl-step">
      <div class="tl-rail"><span class="tl-dot stop">${int(e.order)}</span></div>
      <div class="tl-card">
        <div class="tl-card-title">${esc(e.place)}</div>
        ${e.address ? `<div class="tl-card-sub">${esc(shortAddr(e.address, 64))}</div>` : ''}
        <div class="tl-chips">
          <span class="tl-chip time">ถึง ${fmtClock(e.at)}</span>
          ${kmChip(e)}
          <span class="tl-chip dwell">จอด ${int(e.dwellMin)} น.</span>
          <span class="tl-chip time">ออก ${fmtClock(e.leaveAt)}</span>
        </div>
      </div>
    </li>`;
  }).join('');
  const m = modal({
    wide: true,
    title: 'ไทม์ไลน์ · ' + route.RouteID,
    body: `
      <div class="tl-stats">
        <div class="tl-stat"><b>${fmtClock(tl.startMs)}</b><span>ออกคลัง</span></div>
        <div class="tl-stat"><b>${num1(tl.totalKm)} กม.</b><span>ระยะรวม</span></div>
        <div class="tl-stat"><b>${Planner.fmtDur(tl.totalMin)}</b><span>เวลาทั้งหมด</span></div>
      </div>
      <p class="tl-meta">${esc(tripVehicleLabel(route))} · ${esc(route.DriverName || '—')} · ${esc(startLbl)} · จอดจุดละ ${int(tl.dwell)} น.</p>
      ${tl.hasBadGeo ? `<div class="tl-warn">มีจุดพิกัดผิด — ข้ามระยะนั้นตอนคำนวณเวลา · แก้ที่อยู่/พิกัดร้านแล้วรีเฟรช</div>` : ''}
      <ul class="tl-list">${steps}</ul>
    `,
    foot: `<button class="btn" id="tlClose">ปิด</button>
      <button class="btn btn-primary" id="tlPrint"><i data-lucide="printer"></i>พิมพ์</button>`,
  });
  el('tlClose').onclick = m.close;
  el('tlPrint').onclick = () => {
    const body = `
      <div class="kv">
        <div><span>รอบส่ง:</span> <b>${esc(route.RouteID)}</b></div>
        <div><span>วันที่:</span> <b>${thDate(route.DeliveryDate)}</b></div>
        <div><span>รถ:</span> <b>${esc(tripVehicleLabel(route))}</b></div>
        <div><span>คนขับ:</span> <b>${esc(route.DriverName || '—')}</b></div>
        <div><span>รวม:</span> <b>${num1(tl.totalKm)} กม. · ${Planner.fmtDur(tl.totalMin)}</b></div>
        <div><span>จอด/จุด:</span> <b>${int(tl.dwell)} นาที</b></div>
      </div>
      <div class="sec-title">ไทม์ไลน์ทีละจุด</div>
      <table><thead><tr><th>#</th><th>ถึง</th><th>สถานที่</th><th class="r">กม.</th><th class="r">จอด</th><th>ออก</th></tr></thead>
      <tbody>${tl.events.map(e => {
        if (e.kind === 'depart_wh') return `<tr><td>ออก</td><td>${fmtClock(e.at)}</td><td>คลัง</td><td class="r">—</td><td class="r">—</td><td>${fmtClock(e.leaveAt)}</td></tr>`;
        if (e.kind === 'return_wh') return `<tr><td>กลับ</td><td>${fmtClock(e.at)}</td><td>คลัง</td><td class="r">${e.badGeo ? 'พิกัดผิด' : num1(e.km)}</td><td class="r">—</td><td>—</td></tr>`;
        return `<tr><td>${int(e.order)}</td><td>${fmtClock(e.at)}</td><td>${esc(e.place)}</td><td class="r">${e.badGeo ? 'พิกัดผิด' : num1(e.km)}</td><td class="r">${int(e.dwellMin)} น.</td><td>${fmtClock(e.leaveAt)}</td></tr>`;
      }).join('')}</tbody></table>`;
    Printer.open('ไทม์ไลน์รอบส่ง — ' + route.RouteID, rSize(), body);
  };
}
async function openRouteDetail(id){
  const stops = await API.get('getRouteStops',{routeId:id});
  const r = (Store.data.routes||[]).find(x=>x.RouteID===id)||{};
  let tlHtml = '';
  try {
    const tl = Planner.buildStopTimeline(r, stops);
    tlHtml = `<div class="card mb14" style="padding:12px 14px">
      <div class="flex between aic mb8"><span class="h-card" style="font-size:14px">ไทม์ไลน์</span>
        <button type="button" class="btn btn-sm" id="rdTimeline"><i data-lucide="clock"></i>ดูเต็ม</button></div>
      <div class="tl-stats" style="margin-bottom:8px">
        <div class="tl-stat"><b>${fmtClock(tl.startMs)}</b><span>ออกคลัง</span></div>
        <div class="tl-stat"><b>${num1(tl.totalKm)} กม.</b><span>ระยะ</span></div>
        <div class="tl-stat"><b>${Planner.fmtDur(tl.totalMin)}</b><span>เวลา</span></div>
      </div>
      ${tl.hasBadGeo ? `<div class="tl-warn" style="margin-bottom:8px">มีจุดพิกัดผิด — กดดูเต็มเพื่อรายละเอียด</div>` : ''}
      <div class="scrolly" style="max-height:140px">${tl.events.filter(e=>e.kind==='stop').map(e=>
        `<div class="flex between aic" style="padding:6px 0;border-bottom:1px solid #F3F5F8;gap:8px;font-size:13px">
          <span class="mono muted">#${int(e.order)}</span>
          <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(e.place)}</span>
          <span class="tab">${fmtClock(e.at)}</span>
          <span class="muted">${e.badGeo ? 'พิกัดผิด' : (num1(e.km)+' กม.')}</span>
          <span class="tab">ออก ${fmtClock(e.leaveAt)}</span>
        </div>`).join('')}</div>
    </div>`;
  } catch (_) {}
  const m = modal({ wide:true, title:'รายละเอียด '+id, body:`
    ${tlHtml}
    <div class="grid" style="grid-template-columns:1fr 1fr;gap:16px">
      <div><div id="rdMap" class="map" style="height:340px"></div></div>
      <div>
        <div class="flex gap8 wrap mb14">${dstatusBadge(r.Status)} <span class="badge b-blue">${esc(r.DriverName||'')}</span> <span class="badge b-gray">${esc(r.VehicleName||r.ProviderName||'')}</span></div>
        <div style="max-height:300px;overflow-y:auto" class="scrolly">
        ${stops.map((s,i)=>`<div class="flex aic gap8" style="padding:9px 0;border-bottom:1px solid #F3F5F8">
          <span class="stop-num" style="width:26px;height:26px;font-size:12px;background:#2563EB">${s.StopOrder}</span>
          <div style="flex:1"><div class="strong" style="font-size:13px">${esc(s.CustomerName)}</div><div class="small muted">${esc(s.BranchName)} · ${int(s.BoxQty)} กล่อง</div></div>
          ${badge(DSTATUS,s.Status==='Pending'?'Planned':(s.Status==='Completed'?'Completed':'Assigned'))}</div>`).join('')||emptyState('ไม่มีจุดส่ง')}
        </div>
      </div></div>
  `, foot:`<button class="btn btn-primary" id="rdClose">ปิด</button>` });
  el('rdClose').onclick=m.close;
  const rdTl = el('rdTimeline'); if (rdTl) rdTl.onclick = () => { m.close(); showRouteTimelineModal(r); };
  setTimeout(()=>{ if(!el('rdMap'))return; const wh=warehouse(); const mp=MapUtil.make('rdMap',wh); MapUtil.whMarker(mp,wh); const pts=[[wh.lat,wh.lng]]; stops.forEach(s=>{ if(s.Latitude){MapUtil.stopMarker(mp,s,s.StopOrder,'#2563EB'); pts.push([+s.Latitude,+s.Longitude]);} }); if(stops.length){const line=[[wh.lat,wh.lng],...stops.map(s=>[+s.Latitude,+s.Longitude]),[wh.lat,wh.lng]]; L.polyline(line,{color:'#6f9e0a',weight:4}).addTo(mp);} if(pts.length>1)mp.fitBounds(pts,{padding:[25,25]}); icons(); },80);
}

/* ================================================================
   PARCEL TRACKING — ค้นด้วยเลขบิล / PO / DeliveryID
   ================================================================ */
function renderTrackingSearch(view){
  const preset = String(Store._trkQ || Store.search || '').trim();
  Store._trkQ = '';
  el('ltBody').innerHTML = `
    <div class="card mb14">
      <div class="notice info mb14"><i data-lucide="info"></i><div>
        ค้นหาย้อนหลังได้ทุกวัน — ใส่ <b>เลขบิล / PO / ชื่อร้าน</b> จะเจอทั้งรอส่งและส่งแล้ว
      </div></div>
      <div class="flex gap8 wrap aic">
        <div class="search" style="flex:1;max-width:480px;margin:0">
          <i data-lucide="package-search"></i>
          <input id="trkQ" placeholder="เช่น BSO260800295 หรือ PO หรือชื่อร้าน" value="${esc(preset)}" autocomplete="off">
        </div>
        <button class="btn btn-primary" id="trkGo"><i data-lucide="search"></i>ค้นหา</button>
      </div>
    </div>
    <div id="trkResult">${preset ? loadingState('กำลังค้นหา…') : emptyState('พิมพ์เลขบิล/PO แล้วกดค้นหา','ค้นได้ข้ามวัน รวมบิลที่ส่งแล้ว')}</div>
  `;
  icons();
  const run = async ()=>{
    const q = el('trkQ').value.trim();
    if(!q){ toast('กรอกเลขบิล/PO ก่อน','warn'); return; }
    el('trkResult').innerHTML = loadingState('กำลังค้นหา…');
    try{
      const hits = await API.get('searchDeliveries', { q, limit: 40 });
      if(!hits || !hits.length){
        el('trkResult').innerHTML = emptyState('ไม่พบในระบบ','ตรวจเลขบิลอีกครั้ง หรือบิลนี้ยังไม่เคย sync เข้า Dispatch');
        icons(); return;
      }
      const routeIds = [...new Set(hits.map(h=>h.RouteID).filter(Boolean))];
      const stopsByRoute = {};
      await Promise.all(routeIds.map(rid=>API.get('getRouteStops',{routeId:rid}).then(s=>stopsByRoute[rid]=s).catch(()=>stopsByRoute[rid]=[])));
      const stopFor = d => (stopsByRoute[d.RouteID]||[]).find(s=>String(s.DeliveryID)===String(d.DeliveryID));
      Track.hits = hits; Track.stopFor = stopFor;
      el('trkResult').innerHTML = `<div class="small muted mb14">พบ ${int(hits.length)} รายการ (รวมวันอื่น / ส่งแล้ว)</div>`
        + hits.map(d=>trackCard(d, stopsByRoute[d.RouteID]||[])).join('');
      const trkBox = el('trkResult');
      $$('[data-print]', trkBox).forEach(b=>b.onclick=()=>{ const d=hits.find(x=>x.DeliveryID===b.dataset.print); Printer.open('ใบติดตามพัสดุ','A5', trkDoc(d, stopFor(d))); });
      $$('[data-goto-day]', trkBox).forEach(b=>b.onclick=async()=>{
        const day = b.dataset.gotoDay;
        if (!day) return;
        Store.date = day;
        setDateLabel();
        await loadBootstrap();
        location.hash = '#/dashboard';
        render();
      });
      icons();
    }catch(e){ el('trkResult').innerHTML = errorState(e.message,"renderLiveTracking(document.getElementById('view'),'search')"); icons(); }
  };
  el('trkGo').onclick = run;
  el('trkQ').addEventListener('keydown', e=>{ if(e.key==='Enter') run(); });
  el('trkQ').focus();
  if (preset) run();
}
function trackCard(d, stops){
  const stop = stops.find(s=>String(s.DeliveryID)===String(d.DeliveryID));
  const checkedIn = stop && stop.CheckInTime;
  const done = d.Status==='Completed' || (stop && stop.Status==='Completed');
  const failed = d.Status==='Failed';
  const day = String(d.DeliveryDate || '').slice(0, 10);
  const dayBtn = day
    ? `<button class="btn btn-sm" data-goto-day="${esc(day)}"><i data-lucide="calendar"></i>เปิดวัน ${thDate(day)}</button>`
    : '';
  const steps = [
    { k:'สร้างงาน', t:d.CreatedAt, on:true },
    { k:'วางแผนรอบส่ง', t:d.RouteID?'':'', on:!!d.RouteID || ['Planned','Assigned','In Progress','Completed'].includes(d.Status), sub:d.RouteID||'' },
    { k:'กำลังส่ง', t:'', on:['In Progress','Completed'].includes(d.Status) },
    { k:'เช็คอินถึงจุดส่ง (GPS)', t:checkedIn?stop.CheckInTime:'', on:!!checkedIn, sub:checkedIn?(stop.CheckInLatitude?num1(stop.CheckInLatitude)+', '+num1(stop.CheckInLongitude):''):'' },
    { k: failed?'ส่งไม่สำเร็จ':'ส่งสำเร็จ', t:(stop&&stop.DeliveryCompletedTime)||'', on:done||failed, fail:failed }
  ];
  return `<div class="card mb14">
    <div class="flex between aic wrap" style="margin-bottom:10px">
      <div><div class="flex aic gap8"><span class="mono strong" style="font-size:15px">${esc(d.PoNo||d.InvoiceNo||d.DeliveryID)}</span>${dstatusBadge(d.Status)}</div>
        <div class="small muted" style="margin-top:3px">${esc(d.CustomerName)}${d.BranchName?' · '+esc(d.BranchName):''} · ${int(d.BoxQty)} กล่อง · วันทำงาน ${thDate(d.DeliveryDate)}</div>
        <div class="small muted">บิล ${esc(d.InvoiceNo||'—')} · PO ${esc(d.PoNo||'—')}</div></div>
      <div class="flex gap8 wrap">
        ${d.RouteID?`<span class="badge b-blue">รอบส่ง ${esc(d.RouteID)}</span>`:''}
        ${dayBtn}
        <button class="btn btn-sm" data-print="${esc(d.DeliveryID)}"><i data-lucide="printer"></i>พิมพ์</button>
      </div>
    </div>
    ${d.Note?`<div class="small muted" style="margin-bottom:10px">${esc(d.Note)}</div>`:''}
    ${stop&&stop.PhotoURL?`<div style="margin-bottom:10px"><a href="${esc(stop.PhotoURL)}" target="_blank" class="chip" style="text-decoration:none;color:var(--brand-ink)"><i data-lucide="image" style="width:13px;height:13px;vertical-align:-2px"></i> ดูรูปหลักฐานการส่ง</a></div>`:''}
    <div style="display:flex;flex-direction:column;gap:0">
      ${steps.map((s,i)=>`<div class="flex gap12" style="align-items:flex-start">
        <div style="display:flex;flex-direction:column;align-items:center">
          <span style="width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:${s.on?(s.fail?'#EF4444':'#10B981'):'#E5E9F0'};color:#fff;flex-shrink:0"><i data-lucide="${s.fail?'x':'check'}" style="width:13px;height:13px;opacity:${s.on?1:0}"></i></span>
          ${i<steps.length-1?`<span style="width:2px;height:22px;background:${s.on?'#10B981':'#E5E9F0'}"></span>`:''}
        </div>
        <div style="padding-bottom:8px"><div class="${s.on?'strong':'muted'}" style="font-size:13px">${esc(s.k)}</div>
          ${(s.t||s.sub)?`<div class="small muted">${s.sub?esc(s.sub)+' · ':''}${s.t?timeShort(s.t)+' '+thDate(s.t):''}</div>`:''}</div>
      </div>`).join('')}
    </div>
  </div>`;
}
const Track = { hits:[], stopFor:()=>null };
// เอกสารพิมพ์ใบติดตาม
function trkDoc(d, stop){
  const row=(l,v)=>`<div><span>${l}:</span> <b>${esc(v==null||v===''?'-':v)}</b></div>`;
  return `<div class="sec-title">ข้อมูลพัสดุ</div>
    <div class="kv">${row('เลข PO',d.PoNo)}${row('เลขบิล',d.InvoiceNo)}${row('รหัสงาน',d.DeliveryID)}${row('ลูกค้า',d.CustomerName)}${row('สาขา',d.BranchName)}
      ${row('จำนวน',int(d.BoxQty)+' กล่อง')}${row('วันที่ส่ง',thDate(d.DeliveryDate))}${row('สถานะ',(DSTATUS[d.Status]||{}).label||d.Status)}${row('รอบส่ง',d.RouteID)}</div>
    ${d.Note?`<div class="sec-title">รายละเอียด</div><div>${esc(d.Note)}</div>`:''}
    <div class="sec-title">การเช็คอิน (GPS)</div>
    <div class="kv">${row('เช็คอินเมื่อ', stop&&stop.CheckInTime?new Date(stop.CheckInTime).toLocaleString('th-TH'):'ยังไม่เช็คอิน')}
      ${row('พิกัดเช็คอิน', stop&&stop.CheckInLatitude?stop.CheckInLatitude+', '+stop.CheckInLongitude:'-')}
      ${row('ส่งสำเร็จเมื่อ', stop&&stop.DeliveryCompletedTime?new Date(stop.DeliveryCompletedTime).toLocaleString('th-TH'):'-')}</div>`;
};

/* ================================================================
   LIVE MAP
   ================================================================ */
/* ================================================================
   ติดตาม — รวม "ภาพรวมรถ" (เดิม livemap) + "ค้นหาพัสดุ" (เดิม tracking)
   ไว้หน้าเดียว ใต้เมนูเดียว ตาม IA 4 เมนู — คนละแท็บ ไม่ใช่คนละหน้า
   ================================================================ */
let liveMapRef=null, liveTab='fleet';
async function renderLiveTracking(view, forceTab){
  if(forceTab) liveTab = forceTab;
  const ct=Store.data.cartrack||{};
  page(view, `
    ${head('ติดตาม', ctStatusLine(ct))}
    <div class="seg mb14" id="ltTabs">
      <button class="${liveTab==='fleet'?'on':''}" data-lt="fleet">ภาพรวมรถ</button>
      <button class="${liveTab==='search'?'on':''}" data-lt="search">ค้นหาพัสดุ</button>
    </div>
    <div id="ltBody"></div>
  `);
  $$('[data-lt]',view).forEach(b=>b.onclick=()=>{ liveTab=b.dataset.lt; renderLiveTracking(view); });
  if(liveTab==='search') renderTrackingSearch(view); else renderFleetOverview(view);
}
ROUTES.livemap = async function(view){ return renderLiveTracking(view,'fleet'); };
ROUTES.tracking = async function(view){ return renderLiveTracking(view,'search'); };
function ctStatusLine(ct){ if(!ct) return ''; if(ct.connected) return `🟢 Cartrack เชื่อมต่อ · พบ ${ct.found} คัน · แมตช์ ${ct.matched} · ${ago(ct.lastSync)}`; if(ct.enabled) return '🔴 Cartrack ออฟไลน์'; return 'โหมดข้อมูลระบบ (ยังไม่เปิด Cartrack)'; }
// ป้ายบอกแหล่งที่มาพิกัด — Cartrack (มี CartrackVehicleID + เปิดใช้งาน) vs มือถือคนขับ (มีพิกัดแต่ไม่ใช่ Cartrack) vs ไม่มีข้อมูล
function gpsSourceLabel(v, ct){
  if(v.CartrackVehicleID && ct && ct.enabled) return '📡 Cartrack';
  if(v.lat||v.lng) return '📱 มือถือคนขับ';
  return '⚪ ไม่มีข้อมูล';
}
function fleetVehicleCard(v, ct, activeByVeh, stopsByRoute, colorByRoute){
  const st = deriveVehStatus(v);
  const route = activeByVeh[v.VehicleName] || activeByVeh[v.LicensePlate];
  const lineColor = route ? colorByRoute[route.RouteID] : null;
  let stopLine = '';
  if(route){
    const stops = stopsByRoute[route.RouteID]||[];
    const cur = stops.find(s=>s.Status!=='Completed');
    const next = cur ? stops.find(s=>s.StopOrder===cur.StopOrder+1) : null;
    if(cur) stopLine = `<div class="small muted" style="margin-top:4px">📍 ${esc(cur.CustomerName)}${next?' · ถัดไป '+esc(next.CustomerName):''}</div>`;
  }
  const lastT = v.lastPositionTime||v.LastPositionTime||v.LastSyncAt||v.lastSyncAt;
  return `<div style="padding:10px 12px;border:1px solid var(--border);border-radius:10px;${lineColor?`border-left:3px solid ${lineColor}`:''}">
    <div class="flex between aic">
      <div><div class="strong mono" style="font-size:13px">${lineColor?`<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${lineColor};margin-right:6px"></span>`:''}${esc(vehicleShortName(v))}</div><div class="small muted">${esc(v.CurrentDriver||'ไม่มีชื่อคนขับ')}${v.VehicleName&&v.LicensePlate&&v.VehicleName!==v.LicensePlate?' · '+esc(v.VehicleName):''}</div></div>
      <div style="text-align:right">${vstatusBadge(st)}<div class="small muted tab" style="margin-top:3px">${st==='In Use'?int(v.speed)+' กม./ชม.':''}</div></div>
    </div>
    ${stopLine}
    <div class="flex between aic" style="margin-top:6px">
      <span class="small muted">${gpsSourceLabel(v,ct)} · ${lastT?ago(lastT):'ไม่มีสัญญาณ'}</span>
      ${route?`<button class="btn btn-sm" data-track="${esc(route.RouteID)}"><i data-lucide="route"></i>เส้นทางจริง</button>`:''}
    </div>
  </div>`;
}
function renderFleetOverview(view){
  const ct=Store.data.cartrack||{};
  el('ltBody').innerHTML = `
    ${ct.stale&&ct.enabled?`<div class="notice warn mb14"><i data-lucide="clock"></i><div>🟡 ข้อมูลอาจไม่ใหม่ล่าสุด — ซิงก์ Cartrack ล่าสุด ${ago(ct.lastSync)}</div></div>`:''}
    ${!ct.enabled?`<div class="notice info mb14"><i data-lucide="info"></i><div>ยังไม่เปิดใช้งาน Cartrack — แสดงพิกัดจากข้อมูลระบบ (มือถือคนขับ/ค่าที่ตั้งเอง) ตั้งค่าได้ที่หน้า Cartrack Integration</div></div>`:''}
    <div class="seg mb14" id="lmFilter"><button class="on" data-f="all">ทั้งหมด</button><button data-f="moving">กำลังวิ่ง</button><button data-f="stopped">จอดอยู่</button><button data-f="stale">สัญญาณขาด</button><button data-f="offline">ออฟไลน์</button></div>
    <div class="grid" style="grid-template-columns:1fr 340px;gap:16px;align-items:start">
      <div class="card" style="padding:14px"><div id="liveMap" class="map" style="height:560px"></div></div>
      <div class="card" style="padding:14px">
        <div class="h-card mb14">สถานะรถ</div>
        <div id="vehList" style="display:flex;flex-direction:column;gap:8px;max-height:560px;overflow-y:auto" class="scrolly"></div>
      </div>
    </div>
  `;
  icons();
  let filter='all';
  const activeRoutes = (Store.data.routes||[]).filter(r=>r.Status==='In Progress');
  const activeByVeh = {}; activeRoutes.forEach(r=>{ if(r.VehicleName) activeByVeh[r.VehicleName]=r; if(r.LicensePlate) activeByVeh[r.LicensePlate]=r; });
  // คนละสีต่อ Route ที่กำลังวิ่งอยู่ — ให้เส้นทางบนแผนที่และจุดสี/แถบข้างการ์ดรถตรงกัน แยกรถหลายคันออกจากกันได้
  const colorByRoute = {}; activeRoutes.forEach((r,ri)=>{ colorByRoute[r.RouteID] = SPLIT_COLORS[ri % SPLIT_COLORS.length]; });
  const stopsByRoute = {}; ((Store._live&&Store._live.stops)||[]).forEach(s=>{ (stopsByRoute[s.RouteID]=stopsByRoute[s.RouteID]||[]).push(s); });
  const ensureStops = ()=>{
    const missing = activeRoutes.filter(r=>!stopsByRoute[r.RouteID]);
    if(!missing.length) return Promise.resolve();
    return Promise.all(missing.map(r=>API.get('getRouteStops',{routeId:r.RouteID}).then(s=>stopsByRoute[r.RouteID]=s).catch(()=>stopsByRoute[r.RouteID]=[])));
  };
  const vehicles=()=>liveVehicles().filter(v=>{ const st=deriveVehStatus(v);
    if(filter==='moving')return st==='In Use'; if(filter==='stopped')return st==='Stopped'; if(filter==='stale')return st==='Stale'; if(filter==='offline')return st==='Offline'; return true; });
  function draw(){
    const list=vehicles();
    el('vehList').innerHTML = list.length? list.map(v=>fleetVehicleCard(v,ct,activeByVeh,stopsByRoute,colorByRoute)).join('') : emptyState('ไม่มีรถตามตัวกรอง');
    $$('[data-track]',view).forEach(b=>b.onclick=()=>{ const r=activeRoutes.find(x=>x.RouteID===b.dataset.track); if(r) showRouteTrackModal(r); });
    if(liveMapRef){ liveMapRef.remove(); liveMapRef=null; }
    const wh=warehouse(); liveMapRef=MapUtil.make('liveMap',wh); MapUtil.whMarker(liveMapRef,wh);
    const pts=[[wh.lat,wh.lng]];
    const routedDeliveryIds = new Set();
    // วาดเส้นทางของรถที่กำลังวิ่งอยู่ — คนละสีต่อคัน (ตาม Route) พร้อมเลขจุดส่งสีเดียวกับเส้น
    activeRoutes.forEach(r=>{
      const color = colorByRoute[r.RouteID];
      const stops = (stopsByRoute[r.RouteID]||[]).filter(s=>s.Latitude&&s.Longitude);
      if(!stops.length) return;
      const line=[[wh.lat,wh.lng], ...stops.map(s=>[+s.Latitude,+s.Longitude]), [wh.lat,wh.lng]];
      L.polyline(line,{color,weight:4,opacity:.85}).addTo(liveMapRef);
      stops.forEach((s,i)=>{ MapUtil.stopMarker(liveMapRef,s,i+1,color); pts.push([+s.Latitude,+s.Longitude]); if(s.DeliveryID) routedDeliveryIds.add(s.DeliveryID); });
    });
    list.forEach(v=>{ if(v.lat&&v.lng){MapUtil.vehMarker(liveMapRef,v);pts.push([+v.lat,+v.lng]);} });
    (Store.data.deliveries||[]).forEach((d,i)=>{ if(d.Latitude && !routedDeliveryIds.has(d.DeliveryID)){MapUtil.stopMarker(liveMapRef,d,i+1,'#94A3B8');} });
    if(pts.length>1)liveMapRef.fitBounds(pts,{padding:[30,30]}); icons();
  }
  ensureStops().then(draw);
  $$('#lmFilter button',view).forEach(b=>b.onclick=()=>{ $$('#lmFilter button',view).forEach(x=>x.classList.remove('on')); b.classList.add('on'); filter=b.dataset.f; draw(); });
  window._onRealtime=()=>{ if((Store.page==='livemap'||Store.page==='tracking') && liveTab==='fleet' && el('liveMap')) draw(); };
}
// เปรียบเทียบเส้นทางที่วางแผนไว้ (จาก route_stops) กับเส้นทางที่วิ่งจริง (จาก gps_logs) + จุดจอดนาน
async function showRouteTrackModal(route){
  const [stops, track] = await Promise.all([
    API.get('getRouteStops',{routeId:route.RouteID}),
    API.get('getRouteGpsTrack',{routeId:route.RouteID}),
  ]);
  const dwells = deriveDwells(track);
  const useCt = (track||[]).some(p => GpsTrack.isCartrack(p.EventType));
  const gm = GpsTrack.metrics(track, { cartrack: useCt });
  const gpsSrc = route.GpsSource || (useCt ? 'cartrack' : (track.length ? 'driver' : 'none'));
  const gpsFuel = GpsTrack.fuelEst(gm.distanceKm, route);
  const gpsLiters = fuelLitersFromBaht(gpsFuel);
  const bills = routeBillsLine(route, Store.data.deliveries || []);
  const statRow = (l, v, sub) => `<div class="flex between" style="padding:5px 0;font-size:13px"><span class="muted">${l}${sub?` <span class="small" style="color:#9AA3B2">${sub}</span>`:''}</span><span class="tab strong">${v}</span></div>`;
  const m = modal({ title:'ย้อนหลังรอบส่ง — '+esc(route.RouteID), body:`
    <div id="rtMap" class="map" style="height:300px;margin-bottom:12px"></div>
    <div class="flex gap12 small muted" style="margin-bottom:12px">
      <span><span style="display:inline-block;width:14px;height:3px;background:#2563EB;vertical-align:middle;margin-right:5px"></span>จุดส่งตามใบงาน</span>
      <span><span style="display:inline-block;width:14px;height:3px;background:#EF4444;vertical-align:middle;margin-right:5px"></span>เส้นทางที่วนจริง (GPS)</span>
    </div>
    <div style="border:1px solid var(--border);border-radius:11px;padding:12px;margin-bottom:12px">
      <div class="small strong muted mb8">รถ · บิล · เวลา · น้ำมัน</div>
      ${statRow('รถ', esc(tripVehicleLabel(route)), esc(route.DriverName||''))}
      ${statRow('บิล / ร้าน', esc(bills), '')}
      ${statRow('แหล่ง GPS', gpsSourceLabel(gpsSrc), int(gm.pointCount)+' จุด')}
      ${statRow('ออก', fmtTimeShort(gm.startedAt), gm.startedAt ? thDate(gm.startedAt) : '')}
      ${statRow('กลับ', fmtTimeShort(gm.endedAt), gm.endedAt ? thDate(gm.endedAt) : '')}
      ${statRow('เวลาวิ่ง', gm.durationMin ? Planner.fmtDur(gm.durationMin) : '—', '')}
      ${statRow('ระยะ GPS', gm.distanceKm ? num1(gm.distanceKm)+' กม.' : '—', 'จาก GPS จริง')}
      ${statRow('น้ำมัน', gpsLiters != null ? num1(gpsLiters)+' ลิตร' : '—', gpsFuel ? money(gpsFuel)+' ฿' : '')}
    </div>
    <div class="h-card mb14">จุดที่จอดนิ่งนาน (${dwells.length})</div>
    ${dwells.length? dwells.map(d=>`<div class="flex between" style="padding:6px 0;border-bottom:1px solid #F3F5F8"><span class="small">${timeShort(d.from)}–${timeShort(d.to)}</span><span class="small strong">จอด ${int(d.minutes)} นาที</span></div>`).join('')
      : '<div class="small muted">ไม่พบช่วงจอดนิ่งนานเกิน 3 นาที (หรือยังไม่มีข้อมูล GPS ระหว่างทาง)</div>'}
  `, foot:`<button class="btn" id="rtClose">ปิด</button>` });
  el('rtClose').onclick=m.close;
  setTimeout(()=>{
    if(!el('rtMap')) return;
    const wh=warehouse();
    const map=MapUtil.make('rtMap',wh); MapUtil.whMarker(map,wh);
    const plannedPts=[[wh.lat,wh.lng]];
    stops.forEach((s,i)=>{ if(s.Latitude){ MapUtil.stopMarker(map,s,i+1,'#2563EB'); plannedPts.push([+s.Latitude,+s.Longitude]); } });
    plannedPts.push([wh.lat,wh.lng]);
    L.polyline(plannedPts,{color:'#2563EB',weight:3,dashArray:'6,6'}).addTo(map);
    const actualPts = track.filter(p=>p.Latitude&&p.Longitude).map(p=>[+p.Latitude,+p.Longitude]);
    if(actualPts.length>1) L.polyline(actualPts,{color:'#EF4444',weight:3}).addTo(map);
    const allPts = plannedPts.concat(actualPts);
    if(allPts.length>1) map.fitBounds(allPts,{padding:[26,26]});
    icons();
  },60);
}

/* ================================================================
   COMPANY VEHICLES
   ================================================================ */
ROUTES.vehicles = async function(view){
  const rows = (Store.data.vehicles||[]).filter(x=>!x.IsDeleted);
  page(view, `
    ${head('รถบริษัท', `${int(rows.length)} คัน`, `<button class="btn btn-primary" data-act="new"><i data-lucide="plus"></i>เพิ่มรถ</button>`)}
    <div class="card" style="padding:0"><div class="tbl-wrap">
    <table class="tbl"><thead><tr><th>ชื่อรถ</th><th>ทะเบียน</th><th>ประเภท</th><th>คนขับ</th><th>สถานะ</th><th>ตำแหน่งล่าสุด</th><th class="r">จัดการ</th></tr></thead>
    <tbody>${rows.map(v=>`<tr>
      <td class="strong">${esc(v.VehicleName)}</td><td class="mono small">${esc(v.LicensePlate)}</td>
      <td>${esc(v.VehicleType)}</td>
      <td>${v.CurrentDriver?esc(v.CurrentDriver):'<span class="muted">ไม่มีชื่อคนขับ</span>'}</td><td>${vstatusBadge(deriveVehStatus(v))}</td>
      <td class="small muted">${v.CurrentLatitude?num1(v.CurrentLatitude)+', '+num1(v.CurrentLongitude):'—'}<br>${v.LastSyncAt?ago(v.LastSyncAt):(v.LastPositionTime?ago(v.LastPositionTime):'')}</td>
      <td class="r"><button class="btn btn-sm" data-edit="${esc(v.VehicleID)}"><i data-lucide="pencil"></i></button>
        <button class="btn btn-sm" data-del="${esc(v.VehicleID)}"><i data-lucide="trash-2"></i></button></td></tr>`).join('')}</tbody></table>
    </div></div>
  `);
  view.querySelector('[data-act="new"]').onclick=()=>vehicleForm(null);
  $$('[data-edit]',view).forEach(b=>b.onclick=()=>vehicleForm(rows.find(x=>x.VehicleID===b.dataset.edit)));
  $$('[data-del]',view).forEach(b=>b.onclick=()=>{ const v=rows.find(x=>x.VehicleID===b.dataset.del);
    confirmDialog(`ลบรถ "${v?v.VehicleName:''}" ? (ใช้ soft-delete — ข้อมูลจริงไม่ถูกลบถาวร กู้คืนได้)`, ()=>{ deleteLocal('vehicles','updateVehicle',b.dataset.del,{id:b.dataset.del,data:{IsDeleted:true}}).then(()=>toast('ลบรถแล้ว','ok')).catch(()=>{}); }, {danger:true,yes:'ลบ'}); });
};
function vehicleForm(v){
  const isEdit=!!v; v=v||{};
  const m=modal({ title:isEdit?'แก้ไขรถบริษัท':'เพิ่มรถบริษัท', body:`
    <div class="field row2"><div><label class="label">ชื่อรถ</label><input class="input" id="vName" value="${esc(v.VehicleName||'')}"></div>
      <div><label class="label">ทะเบียน</label><input class="input" id="vPlate" value="${esc(v.LicensePlate||'')}"></div></div>
    <div class="field row2"><div><label class="label">ประเภท</label><select class="select" id="vType"><option ${v.VehicleType==='PICKUP'?'selected':''}>PICKUP</option><option ${v.VehicleType==='TRUCK'?'selected':''}>TRUCK</option><option ${v.VehicleType==='VAN'?'selected':''}>VAN</option></select></div>
      <div><label class="label">สถานะ</label><select class="select" id="vStatus">${Object.keys(VSTATUS).map(s=>`<option value="${s}" ${((v.VehicleStatus||'Available')===s)?'selected':''}>${VSTATUS[s].label}</option>`).join('')}</select></div></div>
    <div class="field row2"><div><label class="label">ค่าน้ำมัน/กม. (บาท)</label><input class="input" type="number" step="0.1" id="vFuel" value="${esc(v.FuelCostPerKm||setting('FUEL_COST_PER_KM',3.5))}"></div>
      <div><label class="label">คนขับประจำ</label><input class="input" id="vDrv" value="${esc(v.CurrentDriver||'')}"></div></div>
    <div class="field"><label class="label">Cartrack Registration</label><input class="input" id="vCt" value="${esc(v.CartrackRegistration||v.LicensePlate||'')}"></div>
  `, foot:`<button class="btn" id="vCancel">ยกเลิก</button><button class="btn btn-primary" id="vSave"><i data-lucide="check"></i>บันทึก</button>` });
  el('vCancel').onclick=m.close;
  el('vSave').onclick=async()=>{ const data={ VehicleName:el('vName').value.trim(), LicensePlate:el('vPlate').value.trim(), VehicleType:el('vType').value, FuelCostPerKm:+el('vFuel').value||0, VehicleStatus:el('vStatus').value, CurrentDriver:el('vDrv').value.trim(), CartrackRegistration:el('vCt').value.trim() };
    if(!data.VehicleName){toast('กรุณากรอกชื่อรถ','warn');return;}
    m.close();
    if(isEdit) updateLocal('vehicles','updateVehicle',v.VehicleID,data).then(()=>toast('บันทึกรถแล้ว','ok')).catch(()=>{});
    else       createLocal('vehicles','createVehicle',data,{VehicleStatus:'Available'}).then(()=>toast('เพิ่มรถแล้ว','ok')).catch(()=>{}); };
}

/* ================================================================
   EXTERNAL VEHICLES
   ================================================================ */
ROUTES.external = async function(view){
  const provs = (Store.data.externalProviders||[]).filter(x=>!x.IsDeleted);
  const rows = (Store.data.externalVehicles||[]).filter(x=>!x.IsDeleted);
  page(view, `
    ${head('รถจ้างภายนอก', `${int(rows.length)} คัน · ${int(provs.length)} ผู้ให้บริการ`, `<button class="btn btn-primary" data-act="new"><i data-lucide="plus"></i>เพิ่มรถภายนอก</button>`)}
    <div class="card" style="padding:0"><div class="tbl-wrap">
    <table class="tbl"><thead><tr><th>ผู้ให้บริการ</th><th>คนขับ</th><th>โทร</th><th>ประเภท</th><th>ทะเบียน</th><th class="r">ราคา</th><th>รูปแบบ</th><th>สถานะ</th><th class="r"></th></tr></thead>
    <tbody>${rows.map(v=>`<tr>
      <td class="strong">${esc(v.ProviderName)}</td><td>${esc(v.DriverName)}</td><td class="mono small">${esc(v.DriverPhone)}</td>
      <td>${esc(v.VehicleType)}</td><td class="mono small">${esc(v.LicensePlate)}</td>
      <td class="r tab">${money(v.Rate)}</td><td><span class="badge b-gray">${RATE_TYPE[v.RateType]||v.RateType}</span></td>
      <td>${v.Status==='Available'?'<span class="badge b-green">พร้อม</span>':'<span class="badge b-gray">'+esc(v.Status)+'</span>'}</td>
      <td class="r"><button class="btn btn-sm" data-edit="${esc(v.ExternalVehicleID)}"><i data-lucide="pencil"></i></button>
        <button class="btn btn-sm" data-del="${esc(v.ExternalVehicleID)}"><i data-lucide="trash-2"></i></button></td></tr>`).join('')}</tbody></table>
    </div></div>
  `);
  view.querySelector('[data-act="new"]').onclick=()=>extForm(null,provs);
  $$('[data-edit]',view).forEach(b=>b.onclick=()=>extForm(rows.find(x=>x.ExternalVehicleID===b.dataset.edit),provs));
  $$('[data-del]',view).forEach(b=>b.onclick=()=>{ const v=rows.find(x=>x.ExternalVehicleID===b.dataset.del);
    confirmDialog(`ลบรถภายนอก "${v?v.ProviderName:''}" ? (soft-delete กู้คืนได้)`, ()=>{ deleteLocal('externalVehicles','updateExternalVehicle',b.dataset.del,{id:b.dataset.del,data:{IsDeleted:true}}).then(()=>toast('ลบรถภายนอกแล้ว','ok')).catch(()=>{}); }, {danger:true,yes:'ลบ'}); });
};
function extForm(v,provs){
  const isEdit=!!v; v=v||{};
  const m=modal({ title:isEdit?'แก้ไขรถภายนอก':'เพิ่มรถจ้างภายนอก', body:`
    <div class="field"><label class="label">ผู้ให้บริการ</label><input class="input" id="eProv" list="provList" value="${esc(v.ProviderName||'')}">
      <datalist id="provList">${provs.map(p=>`<option value="${esc(p.ProviderName)}">`).join('')}</datalist></div>
    <div class="field row2"><div><label class="label">คนขับ</label><input class="input" id="eDrv" value="${esc(v.DriverName||'')}"></div>
      <div><label class="label">เบอร์โทร</label><input class="input" id="ePhone" value="${esc(v.DriverPhone||'')}"></div></div>
    <div class="field row2"><div><label class="label">ประเภทรถ</label><input class="input" id="eType" value="${esc(v.VehicleType||'')}"></div>
      <div><label class="label">ทะเบียน</label><input class="input" id="ePlate" value="${esc(v.LicensePlate||'')}"></div></div>
    <div class="field row2"><div><label class="label">ราคา</label><input class="input" type="number" id="eRate" value="${esc(v.Rate||'')}"></div>
      <div><label class="label">รูปแบบราคา</label><select class="select" id="eRt">${Object.keys(RATE_TYPE).map(k=>`<option value="${k}" ${v.RateType===k?'selected':''}>${RATE_TYPE[k]}</option>`).join('')}</select></div></div>
    <div class="field"><label class="label">สถานะ</label><select class="select" id="eStatus"><option ${v.Status==='Available'?'selected':''}>Available</option><option ${v.Status==='In Use'?'selected':''}>In Use</option><option ${v.Status==='Inactive'?'selected':''}>Inactive</option></select></div>
  `, foot:`<button class="btn" id="eCancel">ยกเลิก</button><button class="btn btn-primary" id="eSave"><i data-lucide="check"></i>บันทึก</button>` });
  el('eCancel').onclick=m.close;
  el('eSave').onclick=async()=>{ const data={ ProviderName:el('eProv').value.trim(), DriverName:el('eDrv').value.trim(), DriverPhone:el('ePhone').value.trim(), VehicleType:el('eType').value.trim(), LicensePlate:el('ePlate').value.trim(), Rate:+el('eRate').value||0, RateType:el('eRt').value, Status:el('eStatus').value };
    if(!data.ProviderName){toast('กรุณากรอกผู้ให้บริการ','warn');return;}
    m.close();
    if(isEdit) updateLocal('externalVehicles','updateExternalVehicle',v.ExternalVehicleID,data).then(()=>toast('บันทึกรถภายนอกแล้ว','ok')).catch(()=>{});
    else       createLocal('externalVehicles','createExternalVehicle',data,{Status:'Available'}).then(()=>toast('เพิ่มรถภายนอกแล้ว','ok')).catch(()=>{}); };
}

/* ================================================================
   EXPENSES
   ================================================================ */
ROUTES.expenses = async function(view){
  const rows = await API.get('getExpenses',{date:Store.date});
  const routes = (Store.data.routes||[]).filter(x=>!x.IsDeleted);
  const total = rows.reduce((n,e)=>n+(+e.Amount||0),0);
  const EXTYPE={FUEL:'ค่าน้ำมัน',TOLL:'ค่าทางด่วน',PARKING:'ค่าจอดรถ',EXTERNAL:'ค่ารถภายนอก',OTHER:'อื่นๆ'};
  page(view, `
    ${head('ค่าใช้จ่าย', `${thDate(Store.date)} · รวม ${money(total)} บาท`, `<button class="btn btn-sm" data-act="csv"><i data-lucide="download"></i>CSV</button><button class="btn btn-primary" data-act="new"><i data-lucide="plus"></i>บันทึกค่าใช้จ่าย</button>`)}
    <div class="card" style="padding:0"><div class="tbl-wrap">
    ${rows.length?`<table class="tbl"><thead><tr><th>รอบส่ง</th><th>ประเภท</th><th>รายละเอียด</th><th class="r">จำนวนเงิน</th><th>เวลา</th></tr></thead>
    <tbody>${rows.map(e=>`<tr><td class="mono small">${esc(e.RouteID||'—')}</td><td><span class="badge b-gray">${EXTYPE[e.ExpenseType]||e.ExpenseType}</span></td><td>${esc(e.Description||'')}</td><td class="r tab strong">${money(e.Amount)}</td><td class="small muted">${timeShort(e.CreatedAt)}</td></tr>`).join('')}</tbody></table>`
    :emptyState('ยังไม่มีค่าใช้จ่ายวันนี้','บันทึกค่าน้ำมัน ทางด่วน ค่าจอด ฯลฯ')}
    </div></div>
  `);
  const csv=view.querySelector('[data-act="csv"]'); if(csv)csv.onclick=()=>Exporter.csv(rows,'expenses_'+Store.date);
  view.querySelector('[data-act="new"]').onclick=()=>{
    const m=modal({title:'บันทึกค่าใช้จ่าย',body:`
      <div class="field"><label class="label">รอบส่ง (ถ้ามี)</label><select class="select" id="xR"><option value="">— ไม่ระบุ —</option>${routes.map(r=>`<option value="${esc(r.RouteID)}">${esc(r.RouteID)} · ${esc(r.DriverName||'')}</option>`).join('')}</select></div>
      <div class="field row2"><div><label class="label">ประเภท</label><select class="select" id="xT">${Object.keys(EXTYPE).map(k=>`<option value="${k}">${EXTYPE[k]}</option>`).join('')}</select></div>
        <div><label class="label">จำนวนเงิน (บาท)</label><input class="input" type="number" id="xA"></div></div>
      <div class="field"><label class="label">รายละเอียด</label><input class="input" id="xD"></div>
    `,foot:`<button class="btn" id="xC">ยกเลิก</button><button class="btn btn-primary" id="xS"><i data-lucide="check"></i>บันทึก</button>`});
    el('xC').onclick=m.close;
    el('xS').onclick=async()=>{ const data={RouteID:el('xR').value,ExpenseType:el('xT').value,Amount:+el('xA').value||0,Description:el('xD').value.trim(),ExpenseDate:Store.date}; if(!data.Amount){toast('กรอกจำนวนเงิน','warn');return;} el('xS').disabled=true; try{await API.post('createExpense',{data});m.close();render();toast('บันทึกค่าใช้จ่ายแล้ว','ok');}catch(e){toast(e.message,'err');el('xS').disabled=false;} };
  };
};

/* ================================================================
   ADVANCE / CLAIMS (เงินทดรองจ่าย + เคลียร์เงิน)
   ================================================================ */
ROUTES.advance = async function(view){
  const rows = await API.get('getClaims');
  const routes = (Store.data.routes||[]).filter(x=>!x.IsDeleted);
  page(view, `
    ${head('เงินทดรองจ่าย & เคลียร์เงิน', `${int(rows.length)} รายการ`, `<button class="btn btn-primary" data-act="new"><i data-lucide="plus"></i>เคลียร์เงินทดรอง</button>`)}
    <div class="card" style="padding:0"><div class="tbl-wrap">
    ${rows.length?`<table class="tbl"><thead><tr><th>Claim ID</th><th>รอบส่ง</th><th>คนขับ</th><th class="r">เบิก</th><th class="r">ใช้จริง</th><th class="r">เงินทอน</th><th class="r">เบิกเพิ่ม</th><th class="r">คงเหลือ</th><th>สถานะ</th></tr></thead>
    <tbody>${rows.map(c=>`<tr><td class="mono small">${esc(c.ClaimID)}</td><td class="mono small">${esc(c.RouteID||'—')}</td><td>${esc(c.DriverName||'')}</td>
      <td class="r tab">${money(c.AdvanceAmount)}</td><td class="r tab">${money(c.ActualExpense)}</td>
      <td class="r tab" style="color:#047857">${c.RefundAmount>0?money(c.RefundAmount):'—'}</td>
      <td class="r tab" style="color:#B91C1C">${c.AdditionalAmount>0?money(c.AdditionalAmount):'—'}</td>
      <td class="r tab strong">${money(c.Balance)}</td><td>${c.Status==='Cleared'?'<span class="badge b-green">เคลียร์แล้ว</span>':'<span class="badge b-amber">รอเคลียร์</span>'}</td></tr>`).join('')}</tbody></table>`
    :emptyState('ยังไม่มีรายการเงินทดรอง','บันทึกการเบิก-เคลียร์เงินของคนขับ')}
    </div></div>
  `);
  view.querySelector('[data-act="new"]').onclick=()=>{
    const m=modal({title:'เคลียร์เงินทดรองจ่าย',body:`
      <div class="notice info mb14"><i data-lucide="info"></i><div>ระบบคำนวณ <b>เงินทอน</b> (เบิก &gt; ใช้จริง) หรือ <b>เบิกเพิ่ม</b> (ใช้จริง &gt; เบิก) ให้อัตโนมัติ</div></div>
      <div class="field"><label class="label">รอบส่ง</label><select class="select" id="aR"><option value="">— ไม่ระบุ —</option>${routes.map(r=>`<option value="${esc(r.RouteID)}">${esc(r.RouteID)} · ${esc(r.DriverName||'')}</option>`).join('')}</select></div>
      <div class="field"><label class="label">คนขับ</label><input class="input" id="aDrv"></div>
      <div class="field row2"><div><label class="label">เบิกเงินทดรอง (บาท)</label><input class="input" type="number" id="aAdv"></div>
        <div><label class="label">ใช้จริง (บาท)</label><input class="input" type="number" id="aAct"></div></div>
      <div id="aCalc" class="notice ok" style="display:none"><i data-lucide="calculator"></i><div id="aCalcTxt"></div></div>
    `,foot:`<button class="btn" id="aC">ยกเลิก</button><button class="btn btn-primary" id="aS"><i data-lucide="check"></i>บันทึก</button>`});
    const calc=()=>{ const adv=+el('aAdv').value||0,act=+el('aAct').value||0; if(!adv&&!act){el('aCalc').style.display='none';return;} el('aCalc').style.display='flex'; const ref=adv>act?adv-act:0,add=act>adv?act-adv:0; el('aCalcTxt').innerHTML= ref?`เงินทอน <b>${money(ref)}</b> บาท (คนขับคืนเงิน)`:(add?`เบิกเพิ่ม <b>${money(add)}</b> บาท`:'พอดี ไม่มีเงินทอน'); };
    el('aAdv').oninput=calc; el('aAct').oninput=calc;
    el('aC').onclick=m.close;
    el('aS').onclick=async()=>{ const data={RouteID:el('aR').value,DriverName:el('aDrv').value.trim(),AdvanceAmount:+el('aAdv').value||0,ActualExpense:+el('aAct').value||0}; el('aS').disabled=true; try{await API.post('createClaim',{data});m.close();render();toast('บันทึกการเคลียร์เงินแล้ว','ok');}catch(e){toast(e.message,'err');el('aS').disabled=false;} };
  };
};

/* ================================================================
   ROUTE COST
   ================================================================ */
ROUTES.routecost = async function(view){
  const routes = await API.get('getRouteCosts',{date:Store.date});
  const tot=routes.reduce((n,r)=>n+(+r.EstimatedTotalCost||0),0);
  page(view, `
    ${head('ต้นทุนต่อรอบส่ง', `${thDate(Store.date)} · ${int(routes.length)} รอบ · รวม ${money(tot)} บาท`, `<button class="btn btn-sm" data-act="excel"><i data-lucide="file-spreadsheet"></i>Excel</button>`)}
    <div class="card" style="padding:0"><div class="tbl-wrap">
    ${routes.length?`<table class="tbl"><thead><tr><th>รอบส่ง</th><th>ประเภท</th><th class="r">น้ำมัน</th><th class="r">ทางด่วน</th><th class="r">จอดรถ</th><th class="r">รถภายนอก</th><th class="r">อื่นๆ</th><th class="r">รวม</th><th class="r">ต่อจุด</th><th class="r">ต่อกล่อง</th></tr></thead>
    <tbody>${routes.map(r=>`<tr><td class="mono strong">${esc(r.RouteID)}</td><td>${r.RouteType==='EXTERNAL_VEHICLE'?'<span class="badge b-amber">ภายนอก</span>':'<span class="badge b-blue">บริษัท</span>'}</td>
      <td class="r tab">${money(r.EstimatedFuelCost)}</td><td class="r tab">${money(r.EstimatedTollCost)}</td><td class="r tab">${money(r.EstimatedParkingCost)}</td>
      <td class="r tab">${money(r.EstimatedExternalCost)}</td><td class="r tab">${money(r.EstimatedOtherCost)}</td>
      <td class="r tab strong" style="color:#2563EB">${money(r.EstimatedTotalCost)}</td><td class="r tab">${money(r.CostPerStop)}</td><td class="r tab">${money(r.CostPerBox)}</td></tr>`).join('')}</tbody></table>`
    :emptyState('ยังไม่มีรอบส่ง','สร้างรอบส่งจากหน้าวางแผนหลายงาน')}
    </div></div>
  `);
  const ex=view.querySelector('[data-act="excel"]'); if(ex)ex.onclick=()=>Exporter.excel(routes.map(r=>({RouteID:r.RouteID,ประเภท:r.RouteType,น้ำมัน:r.EstimatedFuelCost,ทางด่วน:r.EstimatedTollCost,จอดรถ:r.EstimatedParkingCost,รถภายนอก:r.EstimatedExternalCost,อื่นๆ:r.EstimatedOtherCost,รวม:r.EstimatedTotalCost,ต่อจุด:r.CostPerStop,ต่อกล่อง:r.CostPerBox})),'route_cost_'+Store.date,'ต้นทุนต่อรอบส่ง');
};

/* ================================================================
   CUSTOMERS
   ================================================================ */
ROUTES.customers = async function(view){
  const rows = (Store.data.customers||[]).filter(x=>!x.IsDeleted).filter(c=>matchSearch(c,['CustomerName','BranchName','Address']));
  page(view, `
    ${head('ลูกค้า / สาขา', `${int(rows.length)} รายการ`, `<button class="btn btn-primary" data-act="new"><i data-lucide="plus"></i>เพิ่มลูกค้า</button>`)}
    <div class="card" style="padding:0"><div class="tbl-wrap">
    <table class="tbl"><thead><tr><th>ลูกค้า</th><th>สาขา</th><th>ที่อยู่</th><th>พิกัด</th><th>โทร</th><th class="r"></th></tr></thead>
    <tbody>${rows.map(c=>`<tr><td class="strong">${esc(c.CustomerName)}</td><td>${esc(c.BranchName)}</td><td class="muted small">${esc(c.Address)}</td>
      <td class="mono small">${c.Latitude?num1(c.Latitude)+', '+num1(c.Longitude):'—'}</td><td class="mono small">${esc(c.Phone||'')}</td>
      <td class="r"><button class="btn btn-sm" data-edit="${esc(c.CustomerID)}"><i data-lucide="pencil"></i></button>
        <button class="btn btn-sm" data-del="${esc(c.CustomerID)}"><i data-lucide="trash-2"></i></button></td></tr>`).join('')||`<tr><td colspan="6">${emptyState('ยังไม่มีลูกค้า')}</td></tr>`}</tbody></table>
    </div></div>
  `);
  const openC=(c)=>customerForm(c);

  view.querySelector('[data-act="new"]').onclick=()=>openC(null);
  $$('[data-edit]',view).forEach(b=>b.onclick=()=>openC(rows.find(x=>x.CustomerID===b.dataset.edit)));
  $$('[data-del]',view).forEach(b=>b.onclick=()=>{ const c=rows.find(x=>x.CustomerID===b.dataset.del);
    confirmDialog(`ลบลูกค้า "${c?c.CustomerName:''}" ? (soft-delete กู้คืนได้)`, ()=>{ deleteLocal('customers','updateCustomer',b.dataset.del,{id:b.dataset.del,data:{IsDeleted:true}}).then(()=>toast('ลบลูกค้าแล้ว','ok')).catch(()=>{}); }, {danger:true,yes:'ลบ'}); });
};

function customerForm(c){
  const isEdit=!!c; c=c||{};
  const m=modal({title:isEdit?'แก้ไขลูกค้า / สาขา':'เพิ่มลูกค้า / สาขา', body:`
    <div class="notice info mb14"><i data-lucide="info"></i><div>กรอกที่อยู่ให้ครบ (ถนน เขต จังหวัด รหัสไปรษณีย์) แล้วกด <b>ค้นหาพิกัด</b> — ระบบหาตำแหน่ง GPS ให้อัตโนมัติ ไม่ต้องกรอกพิกัดเอง</div></div>
    <div class="field row2"><div><label class="label">ชื่อลูกค้า / ร้าน *</label><input class="input" id="cN" value="${esc(c.CustomerName||'')}"></div>
      <div><label class="label">สาขา</label><input class="input" id="cB" value="${esc(c.BranchName||'')}"></div></div>
    <div class="field"><label class="label">ที่อยู่ (บ้านเลขที่ · ถนน · แขวง/ตำบล · เขต/อำเภอ · จังหวัด)</label>
      <textarea class="textarea" id="cA" placeholder="เช่น 729/28-37 ถ.รัชดาภิเษก แขวงบางโพงพาง เขตยานนาวา กรุงเทพฯ">${esc(c.Address||'')}</textarea></div>
    <div class="field row2"><div><label class="label">รหัสไปรษณีย์</label><input class="input" id="cPost" inputmode="numeric" value="${esc(c.PostalCode||'')}"></div>
      <div><label class="label">โทรศัพท์</label><input class="input" id="cP" value="${esc(c.Phone||'')}"></div></div>
    <div class="field"><label class="label">ผู้ติดต่อ</label><input class="input" id="cC" value="${esc(c.ContactPerson||'')}"></div>

    <button class="btn btn-ghost btn-block" id="cGeo" type="button"><i data-lucide="map-pin"></i>ค้นหาพิกัด GPS จากที่อยู่</button>
    <div id="cGeoStat" style="margin-top:10px"></div>
    <input type="hidden" id="cLat" value="${esc(c.Latitude||'')}"><input type="hidden" id="cLng" value="${esc(c.Longitude||'')}">
  `, foot:`<button class="btn" id="cCancel">ยกเลิก</button><button class="btn btn-primary" id="cSave"><i data-lucide="check"></i>บันทึก</button>`});

  const buildAddr=()=>[el('cA').value.trim(), el('cPost').value.trim(), 'ประเทศไทย'].filter(Boolean).join(' ');
  const showPin=(g,manual)=>{
    if(g){ el('cLat').value=g.lat; el('cLng').value=g.lng;
      el('cGeoStat').innerHTML=`<div class="notice ok"><i data-lucide="map-pin-check"></i><div>พบพิกัด: <b class="mono">${(+g.lat).toFixed(6)}, ${(+g.lng).toFixed(6)}</b>${g.display?`<br><span class="small muted">${esc(g.display).slice(0,90)}</span>`:''}<br><a href="#" id="cManual">ปรับพิกัดเอง</a></div></div>`; }
    else if(manual){ el('cGeoStat').innerHTML=`<div class="notice warn"><i data-lucide="search-x"></i><div>หาพิกัดจากที่อยู่ไม่พบ — ลองใส่ที่อยู่ให้ละเอียดขึ้น หรือ <a href="#" id="cManual">กรอกพิกัดเอง</a></div></div>`; }
    icons(); const mn=el('cManual'); if(mn) mn.onclick=(e)=>{ e.preventDefault(); el('cGeoStat').innerHTML=`<div class="field row2"><div><label class="label">Latitude</label><input class="input" id="cLatV" value="${esc(el('cLat').value)}"></div><div><label class="label">Longitude</label><input class="input" id="cLngV" value="${esc(el('cLng').value)}"></div></div>`; el('cLatV').oninput=()=>el('cLat').value=el('cLatV').value; el('cLngV').oninput=()=>el('cLng').value=el('cLngV').value; };
  };
  if(c.Latitude&&c.Longitude) showPin({lat:c.Latitude,lng:c.Longitude});

  el('cGeo').onclick=async()=>{
    const q=buildAddr(); if(el('cA').value.trim().length<6){ toast('กรอกที่อยู่ให้ละเอียดขึ้นก่อน','warn'); return; }
    el('cGeo').disabled=true; el('cGeoStat').innerHTML='<div class="flex aic gap8 small muted"><span class="spinner" style="width:18px;height:18px;border-width:2px"></span>กำลังค้นหาพิกัด…</div>';
    const g=await Geo.geocode(q); el('cGeo').disabled=false; showPin(g,true);
    if(g) toast('พบพิกัด GPS แล้ว','ok');
  };
  el('cCancel').onclick=m.close;
  el('cSave').onclick=async()=>{
    const name=el('cN').value.trim(); if(!name){ toast('กรอกชื่อลูกค้า','warn'); return; }
    el('cSave').disabled=true;
    // ยังไม่มีพิกัด → ลอง geocode อัตโนมัติตอนบันทึก
    if((!el('cLat').value||!el('cLng').value) && el('cA').value.trim().length>=6){
      el('cSave').innerHTML='<i data-lucide="loader-2" style="animation:spin 1s linear infinite"></i>หาพิกัด…'; icons();
      const g=await Geo.geocode(buildAddr()); if(g){ el('cLat').value=g.lat; el('cLng').value=g.lng; }
    }
    const addr=[el('cA').value.trim(), el('cPost').value.trim()].filter(Boolean).join(' ');
    const data={ CustomerName:name, BranchName:el('cB').value.trim(), Address:addr, PostalCode:el('cPost').value.trim(),
      Latitude:+el('cLat').value||'', Longitude:+el('cLng').value||'', Phone:el('cP').value.trim(), ContactPerson:el('cC').value.trim() };
    if(!data.Latitude){ el('cSave').disabled=false; el('cSave').innerHTML='<i data-lucide="check"></i>บันทึกทั้งที่ไม่มีพิกัด'; icons();
      confirmDialog('ยังไม่มีพิกัด GPS ของที่อยู่นี้ (แผนที่/การจัดรอบส่งจะไม่แสดงจุดนี้จนกว่าจะมีพิกัด) ต้องการบันทึกต่อไหม?', ()=>saveC(data), {yes:'บันทึกต่อ'}); return; }
    saveC(data);
  };
  function saveC(data){
    m.close();
    if(isEdit) updateLocal('customers','updateCustomer',c.CustomerID,data).then(()=>toast('บันทึกลูกค้าแล้ว','ok')).catch(()=>{});
    else       createLocal('customers','createCustomer',data,{Status:'Active'}).then(()=>toast('เพิ่มลูกค้าแล้ว','ok')).catch(()=>{});
  }
}

/* ================================================================
   EMPLOYEES
   ================================================================ */
ROUTES.employees = async function(view){
  const rows = (Store.data.employees||[]).filter(x=>!x.IsDeleted);
  const veh = (Store.data.vehicles||[]).filter(x=>!x.IsDeleted);
  page(view, `
    ${head('พนักงานส่งสินค้า', `${int(rows.length)} คน`, `<button class="btn btn-primary" data-act="new"><i data-lucide="plus"></i>เพิ่มพนักงาน</button>`)}
    <div class="card" style="padding:0"><div class="tbl-wrap">
    <table class="tbl"><thead><tr><th>ชื่อ</th><th>โทร</th><th>ตำแหน่ง</th><th>รถประจำ</th><th>สถานะ</th><th class="r">จัดการ</th></tr></thead>
    <tbody>${rows.map(e=>{const v=veh.find(x=>x.VehicleID===e.VehicleID); return `<tr>
      <td class="strong">${esc(e.EmployeeName)}</td><td class="mono small">${esc(e.Phone)||'—'}</td>
      <td>${e.Role==='DRIVER'?'คนขับ':(e.Role==='HELPER'?'ผู้ช่วย':esc(e.Role||'—'))}</td>
      <td>${esc(v?v.VehicleName:'—')}</td>
      <td>${e.Status==='Active'?'<span class="badge b-green">ทำงาน</span>':'<span class="badge b-gray">'+esc(e.Status||'')+'</span>'}</td>
      <td class="r"><button class="btn btn-sm" data-edit="${esc(e.EmployeeID)}"><i data-lucide="pencil"></i></button>
        <button class="btn btn-sm" data-del="${esc(e.EmployeeID)}"><i data-lucide="trash-2"></i></button></td></tr>`;}).join('')
      || `<tr><td colspan="6">${emptyState('ยังไม่มีพนักงาน','เพิ่มพนักงานส่งสินค้า/คนขับ')}</td></tr>`}</tbody></table>
    </div></div>
  `);
  view.querySelector('[data-act="new"]').onclick=()=>employeeForm(null,veh);
  $$('[data-edit]',view).forEach(b=>b.onclick=()=>employeeForm(rows.find(x=>x.EmployeeID===b.dataset.edit),veh));
  $$('[data-del]',view).forEach(b=>b.onclick=()=>{ const e=rows.find(x=>x.EmployeeID===b.dataset.del);
    confirmDialog(`ลบพนักงาน "${e?e.EmployeeName:''}" ? (soft-delete กู้คืนได้)`, ()=>{ deleteLocal('employees','updateEmployee',b.dataset.del,{id:b.dataset.del,data:{IsDeleted:true}}).then(()=>toast('ลบพนักงานแล้ว','ok')).catch(()=>{}); }, {danger:true,yes:'ลบ'}); });
};
function employeeForm(e, veh){
  const isEdit=!!e; e=e||{};
  const m=modal({ title:isEdit?'แก้ไขพนักงาน':'เพิ่มพนักงานส่งสินค้า', body:`
    <div class="field row2"><div><label class="label">ชื่อ-นามสกุล *</label><input class="input" id="mpName" value="${esc(e.EmployeeName||'')}"></div>
      <div><label class="label">เบอร์โทร</label><input class="input" id="mpPhone" value="${esc(e.Phone||'')}"></div></div>
    <div class="field row2"><div><label class="label">ตำแหน่ง</label><select class="select" id="mpRole">
        <option value="DRIVER" ${e.Role==='DRIVER'?'selected':''}>คนขับ</option>
        <option value="HELPER" ${e.Role==='HELPER'?'selected':''}>ผู้ช่วย</option>
        <option value="ADMIN" ${e.Role==='ADMIN'?'selected':''}>ธุรการ</option></select></div>
      <div><label class="label">สถานะ</label><select class="select" id="mpStatus">
        <option value="Active" ${((e.Status||'Active')==='Active')?'selected':''}>ทำงาน</option>
        <option value="Inactive" ${e.Status==='Inactive'?'selected':''}>พักงาน</option></select></div></div>
    <div class="field"><label class="label">รถประจำ</label><select class="select" id="mpVeh"><option value="">— ไม่ระบุ —</option>${(veh||[]).map(v=>`<option value="${esc(v.VehicleID)}" ${e.VehicleID===v.VehicleID?'selected':''}>${esc(vehicleOptionLabel(v))}</option>`).join('')}</select></div>
    ${isEdit?`<div class="field" style="border:1px solid var(--border);border-radius:10px;padding:12px;margin-top:4px">
      <div class="strong small" style="margin-bottom:8px">ล็อกอินโหมดคนขับ</div>
      <div class="field row2" style="margin-bottom:8px">
        <div><label class="label">Username</label><input class="input" id="mpUser" value="${esc(e.Username||'')}" placeholder="เช่น somchai"></div>
        <div><label class="label">PIN ใหม่ (4-6 หลัก)</label><input class="input" id="mpPin" type="password" inputmode="numeric" placeholder="เว้นว่างถ้าไม่เปลี่ยน"></div>
      </div>
      <button class="btn btn-sm" id="mpSetPin" type="button"><i data-lucide="key-round"></i>บันทึก Username/PIN</button>
    </div>`:''}
  `, foot:`<button class="btn" id="mpCancel">ยกเลิก</button><button class="btn btn-primary" id="mpSave"><i data-lucide="check"></i>บันทึก</button>`});
  el('mpCancel').onclick=m.close;
  el('mpSave').onclick=async()=>{ const data={ EmployeeName:el('mpName').value.trim(), Phone:el('mpPhone').value.trim(), Role:el('mpRole').value, Status:el('mpStatus').value, VehicleID:el('mpVeh').value };
    if(!data.EmployeeName){ toast('กรอกชื่อพนักงาน','warn'); return; }
    m.close();
    if(isEdit) updateLocal('employees','updateEmployee',e.EmployeeID,data).then(()=>toast('บันทึกพนักงานแล้ว','ok')).catch(()=>{});
    else       createLocal('employees','createEmployee',data,{Status:'Active'}).then(()=>toast('เพิ่มพนักงานแล้ว','ok')).catch(()=>{}); };
  if(isEdit){ const spBtn=el('mpSetPin'); if(spBtn) spBtn.onclick=async()=>{
    const username=el('mpUser').value.trim(), pin=el('mpPin').value.trim();
    if(!username){ toast('กรอก Username','warn'); return; }
    if(!pin){ toast('กรอก PIN ใหม่ก่อนบันทึก','warn'); return; }
    if(!/^\d{4,6}$/.test(pin)){ toast('PIN ต้องเป็นเลข 4-6 หลัก','warn'); return; }
    spBtn.disabled=true;
    try{ await API.post('setDriverPin',{id:e.EmployeeID,username,pin}); toast('บันทึก Username/PIN แล้ว','ok'); }
    catch(err){ toast(err.message,'err'); }
    spBtn.disabled=false;
  }; }
}

/* ================================================================
   REPORTS
   ================================================================ */
ROUTES.reports = async function(view){
  const to = Store.date;
  const wantLoad = Store._reportType === 'loadsheet';
  Store._reportType = '';
  const from = wantLoad ? to : new Date(new Date(to).getTime()-6*864e5).toISOString().slice(0,10);
  page(view, `
    ${head('รายงาน', 'เช็คขึ้นของต่อคันรถได้บนจอ — พิมพ์เมื่อต้องการ หรือเทียบกับบิลจริงก็ได้ ไม่บังคับ', '')}
    <div class="card mb14">
      <div class="flex gap12 wrap aic">
        <div><label class="label">จากวันที่</label><input type="date" class="input" id="rFrom" value="${from}"></div>
        <div><label class="label">ถึงวันที่</label><input type="date" class="input" id="rTo" value="${to}"></div>
        <div style="align-self:flex-end"><button class="btn btn-primary" id="rGo"><i data-lucide="search"></i>สร้างรายงาน</button></div>
        <div style="align-self:flex-end" class="flex gap8">
          <button class="btn btn-sm" data-preset="today">วันนี้</button>
          <button class="btn btn-sm" data-preset="7">7 วัน</button>
          <button class="btn btn-sm" data-preset="month">เดือนนี้</button></div>
        <div style="align-self:flex-end"><label class="label">ประเภทรายงาน</label><select class="select" id="rType" style="width:260px">
          <option value="loadsheet" selected>เช็คขึ้นของ (ต่อคันรถ)</option>
          <option value="gpsactual">ดูย้อนหลัง (รถ · บิล · GPS)</option>
          <option value="routes">สรุปรอบส่ง</option>
          <option value="deliveries">รายการจัดส่ง (รายร้าน)</option>
          <option value="expenses">ค่าใช้จ่ายแยกประเภท</option></select></div>
        <div style="flex:1"></div>
        <div style="align-self:flex-end"><label class="label">กระดาษ</label><select class="select" id="rSize" style="width:90px"><option>A4</option><option>A5</option></select></div>
        <div style="align-self:flex-end" class="flex gap8">
          <button class="btn" id="rPrint"><i data-lucide="printer"></i>พิมพ์รายงาน</button>
          <button class="btn" id="rCsv"><i data-lucide="download"></i>CSV</button>
          <button class="btn" id="rXls"><i data-lucide="file-spreadsheet"></i>Excel</button></div>
      </div>
    </div>
    <div id="rBody">${loadingState()}</div>
  `);
  let last={};
  async function build(){
    const from=el('rFrom').value, to=el('rTo').value;
    el('rBody').innerHTML=loadingState();
    const rep = await API.get('getReports',{from,to}); last=rep;
    const routes=rep.routes, dels=rep.deliveries, exps=rep.expenses;
    const sum=(a,f)=>a.reduce((n,x)=>n+(+x[f]||0),0);
    const totalCost=sum(routes,'EstimatedTotalCost');
    const company=routes.filter(r=>r.RouteType==='COMPANY_VEHICLE');
    const external=routes.filter(r=>r.RouteType==='EXTERNAL_VEHICLE');
    const dist=sum(routes,'TotalDistance'); const boxes=sum(routes,'TotalBoxes');
    const gpsDist=sum(routes,'GpsDistanceKm');
    const kpi=(l,v,u)=>`<div class="cost"><div class="lbl">${l}</div><div class="val tab">${v}</div><div class="unit">${u||''}</div></div>`;
    el('rBody').innerHTML=`
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:14px;margin-bottom:6px">
        ${kpi('จำนวนงาน',int(dels.length),'งาน')}
        ${kpi('จำนวนรวม',int(sum(dels,'BoxQty')||boxes),'ชิ้น')}
        ${kpi('ค่าใช้จ่ายรวม',money(totalCost),'บาท')}
        ${kpi('ระยะประมาณ',num1(dist),'กม.')}
        ${kpi('ระยะ GPS จริง',gpsDist ? num1(gpsDist) : '—','กม.')}
      </div>
      <div id="rDetail"></div>
    `;
    icons();
    renderDetail();
  }
  function renderDetail(){
    if(!el('rDetail')) return;
    const type=(el('rType')&&el('rType').value)||'routes';
    el('rDetail').innerHTML = reportDetail(type, last).html; icons();
    $$('[data-note]',view).forEach(b=>b.onclick=()=>printRouteNote((last.routes||[]).find(x=>x.RouteID===b.dataset.note)));
    $$('[data-track]',view).forEach(b=>b.onclick=()=>{ const r=(last.routes||[]).find(x=>x.RouteID===b.dataset.track); if(r) showRouteTrackModal(r); });
    $$('[data-timeline]',view).forEach(b=>b.onclick=()=>{ const r=(last.routes||[]).find(x=>x.RouteID===b.dataset.timeline); if(r) showRouteTimelineModal(r); });
  }
  el('rGo').onclick=build;
  el('rType').onchange=renderDetail;
  $$('[data-preset]',view).forEach(b=>b.onclick=()=>{ const t=new Date(Store.date); const iso=d=>d.toISOString().slice(0,10);
    if(b.dataset.preset==='today'){ el('rFrom').value=iso(t); el('rTo').value=iso(t); }
    else if(b.dataset.preset==='7'){ const f=new Date(t.getTime()-6*864e5); el('rFrom').value=iso(f); el('rTo').value=iso(t); }
    else { el('rFrom').value=iso(new Date(t.getFullYear(),t.getMonth(),1)); el('rTo').value=iso(new Date(t.getFullYear(),t.getMonth()+1,0)); }
    build(); });
  const curType=()=>(el('rType')&&el('rType').value)||'routes';
  el('rPrint').onclick=()=>printReport(el('rFrom').value, el('rTo').value, last, curType());
  el('rCsv').onclick=()=>{ const d=reportDetail(curType(), last); Exporter.csv(d.rows, d.filename); };
  el('rXls').onclick=()=>{ const d=reportDetail(curType(), last); Exporter.excel(d.rows, d.filename, d.title); };
  build();
};
/* สร้างตาราง + ข้อมูล export ตามประเภทรายงานที่เลือก */
function reportDetail(type, rep){
  rep = rep||{};
  const routes = rep.routes||[], dels = rep.deliveries||[], exps = rep.expenses||[];
  const rmap={}; routes.forEach(r=>{ rmap[r.RouteID]=r; });
  if(type==='loadsheet'){
    const leftover = (dels||[]).filter(d => !d.RouteID && !['Completed','Failed','Cancelled'].includes(d.Status||''));
    const rows = [];
    const cards = routes.map(r => {
      const bills = (dels||[]).filter(d => String(d.RouteID||'') === String(r.RouteID||''));
      const qty = bills.reduce((n, d) => n + (Number(d.BoxQty) || 0), 0);
      const zones = [...new Set(bills.map(d => DelView.zone(d)).filter(z => z && z !== 'ไม่ระบุเขต'))].join(' · ') || 'ไม่ระบุเขต';
      bills.forEach(d => rows.push({
        'รถ': tripVehicleLabel(r), 'คนขับ': r.DriverName||'', 'รอบส่ง': r.RouteID, 'วันที่': r.DeliveryDate,
        'ลูกค้า': d.CustomerName||'', 'เลข PO': DelView.poNo(d)||'', 'เลขบิล': DelView.invoiceNo(d)||'',
        'จำนวน': Number(d.BoxQty)||0, 'เขต': DelView.zone(d)||''
      }));
      const body = bills.map((d,i)=>{
        const po = DelView.poNo(d) || '—';
        const inv = DelView.invoiceNo(d) || '—';
        return `<tr><td class="c">☐</td><td class="c tab">${int(i+1)}</td>
          <td class="strong">${esc(d.CustomerName||'—')}</td>
          <td class="mono small">${esc(po)}</td><td class="mono small">${esc(inv)}</td>
          <td class="r tab">${int(d.BoxQty)}</td><td class="small">${esc(DelView.zone(d)||'—')}</td>
          <td>${priBadge(d.Priority)}</td></tr>`;
      }).join('') || `<tr><td colspan="8" class="c muted">ไม่มีบิลในรอบนี้</td></tr>`;
      return `<div class="card mb14">
        <div class="flex between aic wrap gap8" style="margin-bottom:10px">
          <div>
            <div class="h-card" style="margin:0">${esc(tripVehicleLabel(r) || r.RouteID)} · ${esc(r.DriverName || 'ไม่ระบุคนขับ')}</div>
            <div class="small muted" style="margin-top:4px">${thDate(r.DeliveryDate)} · ${int(bills.length)} บิล · ${int(qty)} ชิ้น · ${esc(zones)}</div>
            ${r.GpsDistanceKm
              ? `<div class="small" style="margin-top:4px">น้ำมันจริง Cartrack ${num1(r.GpsDistanceKm)} กม. × อัตราคันนี้ = <b>${money(routeGpsFuelEst(r))} ฿</b></div>`
              : `<div class="small muted" style="margin-top:4px">น้ำมันจริงคิดจาก GPS Cartrack ของคันนี้หลังวิ่ง (จอดส่งแล้วออกต่อ)</div>`}
          </div>
          <button class="btn btn-sm" data-note="${esc(r.RouteID)}" title="พิมพ์คันนี้ถ้าต้องการ"><i data-lucide="printer"></i>พิมพ์คันนี้</button>
        </div>
        <div class="tbl-wrap"><table class="tbl">
          <thead><tr><th class="c">ขึ้น</th><th class="c">#</th><th>ร้าน</th><th>เลขอ้างอิง</th><th>เลขบิล</th><th class="r">จำนวน</th><th>เขต</th><th>ด่วน</th></tr></thead>
          <tbody>${body}</tbody>
        </table></div>
      </div>`;
    }).join('');
    leftover.forEach(d => rows.push({
      'รถ': '(ยังไม่จัดรถ)', 'คนขับ':'', 'รอบส่ง':'', 'วันที่': d.DeliveryDate,
      'ลูกค้า': d.CustomerName||'', 'เลข PO': DelView.poNo(d)||'', 'เลขบิล': DelView.invoiceNo(d)||'',
      'จำนวน': Number(d.BoxQty)||0, 'เขต': DelView.zone(d)||''
    }));
    const leftoverHtml = leftover.length ? `<div class="card mb14">
      <div class="h-card mb14">ยังไม่ขึ้นรถ · ${int(leftover.length)} บิล</div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>ร้าน</th><th>เลขอ้างอิง</th><th>เลขบิล</th><th class="r">จำนวน</th><th>เขต</th></tr></thead>
      <tbody>${leftover.map((d,i)=>`<tr><td class="c">${int(i+1)}</td><td class="strong">${esc(d.CustomerName||'—')}</td>
        <td class="mono small">${esc(DelView.poNo(d)||'—')}</td><td class="mono small">${esc(DelView.invoiceNo(d)||'—')}</td>
        <td class="r tab">${int(d.BoxQty)}</td><td class="small">${esc(DelView.zone(d)||'—')}</td></tr>`).join('')}</tbody></table></div></div>` : '';
    const html = `<div class="notice info mb14"><i data-lucide="clipboard-check"></i><div>
      แยกรายการตามคันรถเพื่อเช็คว่าขึ้นของครบหรือยัง — ดูบนจอได้ · พิมพ์เฉพาะคันที่ต้องการ หรือเทียบกับบิลจริงก็ได้ <b>ไม่บังคับพิมพ์</b>
    </div></div>${cards || emptyState('ยังไม่มีรอบส่งในช่วงนี้','จัดรถแล้วจึงมาเช็คขึ้นของที่นี่')}${leftoverHtml}`;
    return { html, rows, filename:'report_loadsheet', title:'เช็คขึ้นของต่อคันรถ' };
  }
  if(type==='gpsactual'){
    const hasTrack = r => Number(r.GpsPointCount) > 1;
    const priceL = fuelPricePerLiter();
    const rows = routes.map(r=>{
      const gpsFuel = routeGpsFuelEst(r);
      const liters = fuelLitersFromBaht(gpsFuel);
      const receipt = Number(r.ActualFuelExpense) || routeFuelExpense(r, exps);
      return {
        'รอบส่ง': r.RouteID, 'วันที่': r.DeliveryDate, 'รถ': tripVehicleLabel(r), 'คนขับ': r.DriverName||'',
        'บิล / ร้าน': routeBillsLine(r, dels),
        'ออก': r.GpsStartedAt||'', 'กลับ': r.GpsEndedAt||'',
        'ระยะ GPS (กม.)': Number(r.GpsDistanceKm)||0,
        'น้ำมัน (ลิตร)': liters != null ? liters : '',
        'น้ำมัน GPS (บาท)': gpsFuel != null ? gpsFuel : '',
        'น้ำมันใบเสร็จ (บาท)': receipt || '',
        'เวลาวิ่ง (น.)': Number(r.GpsDurationMin)||0,
        'แหล่ง GPS': gpsSourceLabel(r.GpsSource),
        'สถานะ': (DSTATUS[r.Status]||{}).label||r.Status,
      };
    });
    const sumGps = routes.reduce((n,r)=>n+(Number(r.GpsDistanceKm)||0),0);
    const sumL = routes.reduce((n,r)=>{ const L=routeGpsFuelLiters(r); return n+(L||0); },0);
    const html=`    <div class="notice info mb14"><i data-lucide="satellite"></i><div>
      น้ำมันคิด <b>แยกคัน</b> จากกม.ที่รถคันนั้นวิ่งจริงผ่าน GPS Cartrack (คลัง → จุดส่ง → จอดขึ้นของ → วิ่งต่อจุดถัดไป → กลับคลัง) ไม่เอากม.คันอื่นมารวม<br>
      ระยะทาง/เวลา = GPS รถ · ลิตร = กม.GPS × อัตราคันนั้น ÷ ราคาน้ำมัน ${num1(priceL)} บาท/ลิตร
    </div></div>
    <div class="card mt16"><div class="h-card mb14">ย้อนหลัง ${int(routes.length)} รอบ · GPS ${num1(sumGps)} กม. · น้ำมันประมาณ ${num1(sumL)} ลิตร</div>
      <div class="tbl-wrap scrolly"><table class="tbl"><thead><tr>
        <th>รอบส่ง</th><th>วันที่</th><th>รถ</th><th>คนขับ</th><th>บิล / ร้าน</th>
        <th>ออก</th><th>กลับ</th>
        <th class="r">กม.GPS</th><th class="r">ลิตร</th><th class="r">น้ำมัน ฿</th><th class="r">ใบเสร็จ</th>
        <th class="r">เวลา</th><th>สถานะ</th><th class="r">ดู</th>
      </tr></thead><tbody>${routes.map(r=>{
        const gpsFuel = routeGpsFuelEst(r);
        const liters = fuelLitersFromBaht(gpsFuel);
        const receipt = Number(r.ActualFuelExpense) || routeFuelExpense(r, exps);
        return `<tr>
          <td class="mono strong">${esc(r.RouteID)}</td>
          <td class="small">${thDate(r.DeliveryDate)}</td>
          <td class="small">${esc(tripVehicleLabel(r))}</td>
          <td>${esc(r.DriverName||'—')}</td>
          <td class="small">${esc(routeBillsLine(r, dels))}</td>
          <td class="small tab">${fmtTimeShort(r.GpsStartedAt)}</td>
          <td class="small tab">${fmtTimeShort(r.GpsEndedAt)}</td>
          <td class="r tab strong">${r.GpsDistanceKm ? num1(r.GpsDistanceKm) : '<span class="muted">—</span>'}</td>
          <td class="r tab">${liters != null ? num1(liters) : '—'}</td>
          <td class="r tab">${gpsFuel != null ? money(gpsFuel) : '—'}</td>
          <td class="r tab">${receipt ? money(receipt) : '—'}</td>
          <td class="r tab small">${r.GpsDurationMin ? int(r.GpsDurationMin)+' น.' : '—'}</td>
          <td>${dstatusBadge(r.Status)}</td>
          <td class="r"><div class="flex gap8" style="justify-content:flex-end">
            <button class="btn btn-sm" data-timeline="${esc(r.RouteID)}" title="ไทม์ไลน์ทีละจุด"><i data-lucide="clock"></i></button>
            ${hasTrack(r)?`<button class="btn btn-sm" data-track="${esc(r.RouteID)}" title="ดูเส้นทางที่วน"><i data-lucide="route"></i></button>`:'<span class="muted small">—</span>'}
          </div></td>
        </tr>`;
      }).join('')||`<tr><td colspan="14">${emptyState('ไม่มีรอบส่งในช่วงนี้')}</td></tr>`}</tbody></table></div></div>`;
    return { html, rows, filename:'report_route_history', title:'รายงานย้อนหลัง รถ · บิล · GPS' };
  }
  if(type==='deliveries'){
    const totBox = dels.reduce((n,d)=>n+(+d.BoxQty||0),0);
    const rows = dels.map(d=>({
      'วันที่เปิดเอกสาร':d.DocumentDate||'', 'วันกำหนดส่ง':d.DueDate||'', 'วันที่ทำงาน':d.DeliveryDate,
      'ลูกค้า':d.CustomerName, 'สาขา':d.BranchName||'', 'ที่อยู่':d.Address||'',
      'เลข PO':d.PoNo||'', 'เลขบิล':d.InvoiceNo||'', 'จำนวน':Number(d.BoxQty)||0, 'ความเร่งด่วน':(PRIORITY[d.Priority]||{}).label||d.Priority||'',
      'รอบส่ง':d.RouteID||'', 'คนขับ':(rmap[d.RouteID]||{}).DriverName||'', 'สถานะ':(DSTATUS[d.Status]||{}).label||d.Status||'' }));
    const html=`<div class="card mt16"><div class="h-card mb14">รายการจัดส่งรายร้าน · ${int(dels.length)} รายการ · ${int(totBox)} ชิ้น</div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>เปิดเอกสาร</th><th>กำหนดส่ง</th><th>ลูกค้า</th><th>สาขา</th><th>ที่อยู่</th><th>เลข PO</th><th>เลขบิล</th><th class="r">จำนวน</th><th>ความเร่งด่วน</th><th>รอบส่ง</th><th>คนขับ</th><th>สถานะ</th></tr></thead>
      <tbody>${dels.map(d=>`<tr><td class="small">${d.DocumentDate?thDate(d.DocumentDate):'—'}</td><td class="small">${d.DueDate?thDate(d.DueDate):(d.DeliveryDate?thDate(d.DeliveryDate):'—')}</td><td class="strong">${esc(d.CustomerName)}</td><td class="muted">${esc(d.BranchName||'')}</td><td class="small muted">${esc(d.Address||'')}</td><td class="mono small strong">${esc(d.PoNo||'—')}</td><td class="mono small muted">${esc(d.InvoiceNo||'—')}</td><td class="r tab">${int(d.BoxQty)}</td><td>${priBadge(d.Priority)}</td><td class="mono small">${esc(d.RouteID||'—')}</td><td>${esc((rmap[d.RouteID]||{}).DriverName||'')}</td><td>${dstatusBadge(d.Status)}</td></tr>`).join('')||`<tr><td colspan="12">${emptyState('ไม่มีงานส่งในช่วงนี้')}</td></tr>`}</tbody></table></div></div>`;
    return { html, rows, filename:'report_deliveries', title:'รายงานการจัดส่งรายร้าน' };
  }
  if(type==='expenses'){
    const sum=f=>routes.reduce((n,r)=>n+(+r[f]||0),0);
    const rows = routes.map(r=>({
      'รอบส่ง':r.RouteID, 'วันที่':r.DeliveryDate, 'คนขับ':r.DriverName||'',
      'ค่าน้ำมัน':Number(r.EstimatedFuelCost)||0, 'ค่าทางด่วน':Number(r.EstimatedTollCost)||0, 'ค่าจอดรถ':Number(r.EstimatedParkingCost)||0,
      'ค่ารถภายนอก':Number(r.EstimatedExternalCost)||0, 'ค่าอื่นๆ':Number(r.EstimatedOtherCost)||0, 'รวม':Number(r.EstimatedTotalCost)||0 }));
    const html=`<div class="card mt16"><div class="h-card mb14">ค่าใช้จ่ายแยกประเภท · รวม ${money(sum('EstimatedTotalCost'))} บาท</div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>รอบส่ง</th><th>วันที่</th><th>คนขับ</th><th class="r">น้ำมัน</th><th class="r">ทางด่วน</th><th class="r">จอดรถ</th><th class="r">รถภายนอก</th><th class="r">อื่นๆ</th><th class="r">รวม</th></tr></thead>
      <tbody>${routes.map(r=>`<tr><td class="mono strong">${esc(r.RouteID)}</td><td class="small">${thDate(r.DeliveryDate)}</td><td>${esc(r.DriverName||'')}</td><td class="r tab">${money(r.EstimatedFuelCost)}</td><td class="r tab">${money(r.EstimatedTollCost)}</td><td class="r tab">${money(r.EstimatedParkingCost)}</td><td class="r tab">${money(r.EstimatedExternalCost)}</td><td class="r tab">${money(r.EstimatedOtherCost)}</td><td class="r tab strong">${money(r.EstimatedTotalCost)}</td></tr>`).join('')||`<tr><td colspan="9">${emptyState('ไม่มีข้อมูล')}</td></tr>`}</tbody>
      <tfoot><tr><th colspan="3" class="r">รวมทั้งสิ้น</th><th class="r tab">${money(sum('EstimatedFuelCost'))}</th><th class="r tab">${money(sum('EstimatedTollCost'))}</th><th class="r tab">${money(sum('EstimatedParkingCost'))}</th><th class="r tab">${money(sum('EstimatedExternalCost'))}</th><th class="r tab">${money(sum('EstimatedOtherCost'))}</th><th class="r tab">${money(sum('EstimatedTotalCost'))}</th></tr></tfoot></table></div></div>`;
    return { html, rows, filename:'report_expenses', title:'รายงานค่าใช้จ่ายแยกประเภท' };
  }
  const rows = routes.map(r=>({ 'รอบส่ง':r.RouteID, 'วันที่':r.DeliveryDate, 'ประเภท':r.RouteType==='EXTERNAL_VEHICLE'?'รถภายนอก':'รถบริษัท', 'คนขับ':r.DriverName||'', 'จุด':Number(r.TotalStops)||0, 'กล่อง':Number(r.TotalBoxes)||0, 'ระยะทาง':Number(r.TotalDistance)||0, 'เวลาวิ่ง (นาที)':Number(r.EstimatedDuration)||0, 'ต้นทุน':Number(r.EstimatedTotalCost)||0, 'สถานะ':(DSTATUS[r.Status]||{}).label||r.Status }));
  const hasTrack = r => r.Status==='In Progress' || r.Status==='Completed';
  const html=`<div class="card mt16"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>รอบส่ง</th><th>วันที่</th><th>ประเภท</th><th>คนขับ</th><th class="r">จุด</th><th class="r">กล่อง</th><th class="r">ระยะทาง</th><th class="r">เวลาวิ่ง</th><th class="r">ต้นทุน</th><th>สถานะ</th><th class="r">ดู</th></tr></thead>
    <tbody>${routes.map(r=>`<tr><td class="mono strong">${esc(r.RouteID)}</td><td class="small">${thDate(r.DeliveryDate)}</td><td>${r.RouteType==='EXTERNAL_VEHICLE'?'ภายนอก':'บริษัท'}</td><td>${esc(r.DriverName||'')}</td><td class="r tab">${int(r.TotalStops)}</td><td class="r tab">${int(r.TotalBoxes)}</td><td class="r tab">${num1(r.TotalDistance)}</td><td class="r tab">${r.EstimatedDuration?int(r.EstimatedDuration)+' น.':'—'}</td><td class="r tab strong">${money(r.EstimatedTotalCost)}</td><td>${dstatusBadge(r.Status)}</td><td class="r"><div class="flex gap8" style="justify-content:flex-end">
      <button class="btn btn-sm" data-timeline="${esc(r.RouteID)}" title="ไทม์ไลน์ทีละจุด"><i data-lucide="clock"></i></button>
      ${hasTrack(r)?`<button class="btn btn-sm" data-track="${esc(r.RouteID)}" title="เส้นทางจริง + เวลาจอด"><i data-lucide="route"></i></button>`:''}
      <button class="btn btn-sm" data-note="${esc(r.RouteID)}" title="พิมพ์ใบงาน"><i data-lucide="printer"></i></button>
    </div></td></tr>`).join('')||`<tr><td colspan="11">${emptyState('ไม่มีรอบส่งในช่วงนี้')}</td></tr>`}</tbody></table></div></div>`;
  return { html, rows, filename:'report_routes', title:'รายงานรอบส่ง' };
}
function rSize(){ return (el('rSize')&&el('rSize').value)||'A4'; }
function printReport(from,to,rep,type){
  rep=rep||{}; type=type||'routes';
  const routes=rep.routes||[], dels=rep.deliveries||[];
  const sum=(a,f)=>a.reduce((n,x)=>n+(+x[f]||0),0);
  const total=sum(routes,'EstimatedTotalCost');
  const head=`
    <div class="kv">
      <div><span>ช่วงวันที่:</span> <b>${thDate(from)} – ${thDate(to)}</b></div>
      <div><span>จำนวนงาน:</span> <b>${int(dels.length)}</b></div>
      <div><span>จำนวนรอบส่ง:</span> <b>${int(routes.length)}</b></div>
      <div><span>จุดส่งรวม:</span> <b>${int(sum(routes,'TotalStops'))}</b></div>
      <div><span>กล่องรวม:</span> <b>${int(sum(routes,'TotalBoxes'))}</b></div>
      <div><span>ระยะทางรวม:</span> <b>${num1(sum(routes,'TotalDistance'))} กม.</b></div>
      <div><span>ต้นทุนรวม:</span> <b>${money(total)} บาท</b></div>
    </div>`;
  let title='รายงานการจัดส่ง', tbl='';
  if(type==='deliveries'){
    title='รายงานการจัดส่งรายร้าน';
    const totBox=sum(dels,'BoxQty');
    tbl=`<div class="sec-title">รายการจัดส่งรายร้าน</div>
    <table><colgroup><col style="width:13%"><col style="width:22%"><col><col style="width:13%"><col style="width:9%"><col style="width:13%"></colgroup>
    <thead><tr><th>วันที่</th><th>ลูกค้า</th><th>สาขา / ที่อยู่</th><th>เลข PO</th><th>เลขบิล</th><th>กล่อง</th><th>สถานะ</th></tr></thead>
    <tbody>${dels.map(d=>`<tr><td>${thDate(d.DeliveryDate)}</td><td>${esc(d.CustomerName)}</td><td class="addr">${esc([d.BranchName,d.Address].filter(Boolean).join(' · '))}</td><td class="mono strong">${esc(d.PoNo||'-')}</td><td class="mono muted">${esc(d.InvoiceNo||'-')}</td><td class="r">${int(d.BoxQty)}</td><td>${(DSTATUS[d.Status]||{}).label||d.Status}</td></tr>`).join('')||'<tr><td colspan="7" class="c muted">ไม่มีข้อมูล</td></tr>'}</tbody>
    <tfoot><tr><th colspan="4" class="r">รวมกล่อง</th><th class="r" colspan="2">${int(totBox)} กล่อง</th></tr></tfoot></table>`;
  } else if(type==='expenses'){
    title='รายงานค่าใช้จ่าย';
    tbl=`<div class="sec-title">ค่าใช้จ่ายแยกประเภท (รายรอบส่ง)</div>
    <table><thead><tr><th class="tl">รอบส่ง</th><th>วันที่</th><th>ค่าน้ำมัน</th><th>ทางด่วน</th><th>จอดรถ</th><th>รถภายนอก</th><th>อื่นๆ</th><th>รวม</th></tr></thead>
    <tbody>${routes.map(r=>`<tr><td>${esc(r.RouteID)}</td><td>${thDate(r.DeliveryDate)}</td><td class="r">${money(r.EstimatedFuelCost)}</td><td class="r">${money(r.EstimatedTollCost)}</td><td class="r">${money(r.EstimatedParkingCost)}</td><td class="r">${money(r.EstimatedExternalCost)}</td><td class="r">${money(r.EstimatedOtherCost)}</td><td class="r">${money(r.EstimatedTotalCost)}</td></tr>`).join('')||'<tr><td colspan="8" class="c muted">ไม่มีข้อมูล</td></tr>'}</tbody>
    <tfoot><tr><th colspan="2" class="r">รวมทั้งสิ้น</th><th class="r">${money(sum(routes,'EstimatedFuelCost'))}</th><th class="r">${money(sum(routes,'EstimatedTollCost'))}</th><th class="r">${money(sum(routes,'EstimatedParkingCost'))}</th><th class="r">${money(sum(routes,'EstimatedExternalCost'))}</th><th class="r">${money(sum(routes,'EstimatedOtherCost'))}</th><th class="r">${money(total)}</th></tr></tfoot></table>`;
  } else if(type==='loadsheet'){
    title='เช็คขึ้นของต่อคันรถ';
    tbl = routes.map(r => {
      const bills = (dels||[]).filter(d => String(d.RouteID||'') === String(r.RouteID||''));
      const qty = bills.reduce((n,d)=>n+(Number(d.BoxQty)||0),0);
      return `<div class="sec-title">${esc(tripVehicleLabel(r) || r.RouteID)} · ${esc(r.DriverName||'-')} · ${thDate(r.DeliveryDate)}</div>
        <table class="slip-table"><thead><tr><th>☐</th><th>#</th><th>ร้าน</th><th>เลขอ้างอิง</th><th>เลขบิล</th><th>จำนวน</th><th>เขต</th></tr></thead>
        <tbody>${bills.map((d,i)=>`<tr><td class="c">☐</td><td class="c">${i+1}</td><td>${esc(d.CustomerName||'-')}</td>
          <td class="mono">${esc(DelView.poNo(d)||'-')}</td><td class="mono">${esc(DelView.invoiceNo(d)||'-')}</td>
          <td class="r">${int(d.BoxQty)}</td><td>${esc(DelView.zone(d)||'-')}</td></tr>`).join('')||'<tr><td colspan="7" class="c muted">ไม่มีบิล</td></tr>'}</tbody>
        <tfoot><tr><th colspan="5" class="r">รวม</th><th class="r">${int(qty)}</th><th></th></tr></tfoot></table>
        <p class="small muted">เช็ค ☐ ก่อนขึ้นของ · เทียบบิลจริงได้ ไม่บังคับพิมพ์</p>
        <div class="sign"><div>ผู้จัดงาน</div><div>คนขับ</div></div>
        <div style="page-break-after:always;height:12px"></div>`;
    }).join('') || '<p class="muted">ยังไม่มีรอบส่ง</p>';
  } else if(type==='gpsactual'){
    title='รายงานย้อนหลัง รถ · บิล · GPS';
    const exps = rep.expenses||[];
    tbl=`<div class="sec-title">รถคันไหนวิ่งรอบไหน บิลไหน ออก-กลับ ระยะทาง น้ำมัน</div>
    <table><thead><tr><th>รอบส่ง</th><th>วันที่</th><th>รถ</th><th>คนขับ</th><th>บิล / ร้าน</th><th>ออก</th><th>กลับ</th><th class="r">กม.GPS</th><th class="r">ลิตร</th><th class="r">น้ำมัน ฿</th><th class="r">ใบเสร็จ</th><th class="r">เวลา</th></tr></thead>
    <tbody>${routes.map(r=>{
      const gpsFuel = routeGpsFuelEst(r);
      const liters = fuelLitersFromBaht(gpsFuel);
      const receipt = Number(r.ActualFuelExpense) || routeFuelExpense(r, exps);
      return `<tr><td>${esc(r.RouteID)}</td><td>${thDate(r.DeliveryDate)}</td><td>${esc(tripVehicleLabel(r))}</td><td>${esc(r.DriverName||'-')}</td>
        <td class="addr">${esc(routeBillsLine(r, dels))}</td>
        <td>${fmtTimeShort(r.GpsStartedAt)}</td><td>${fmtTimeShort(r.GpsEndedAt)}</td>
        <td class="r">${r.GpsDistanceKm?num1(r.GpsDistanceKm):'-'}</td>
        <td class="r">${liters!=null?num1(liters):'-'}</td>
        <td class="r">${gpsFuel!=null?money(gpsFuel):'-'}</td>
        <td class="r">${receipt?money(receipt):'-'}</td><td class="r">${r.GpsDurationMin?int(r.GpsDurationMin)+' น.':'-'}</td></tr>`;
    }).join('')||'<tr><td colspan="12" class="c muted">ไม่มีข้อมูล</td></tr>'}</tbody></table>`;
  } else {
    tbl=`<div class="sec-title">รายการรอบส่ง</div>
    <table><thead><tr><th class="tl">รอบส่ง</th><th>วันที่</th><th>ประเภท</th><th>คนขับ</th><th>จุด</th><th>กล่อง</th><th>ระยะทาง</th><th>เวลาวิ่ง</th><th>ต้นทุน</th><th>สถานะ</th></tr></thead>
    <tbody>${routes.map(r=>`<tr><td>${esc(r.RouteID)}</td><td>${thDate(r.DeliveryDate)}</td><td>${r.RouteType==='EXTERNAL_VEHICLE'?'ภายนอก':'บริษัท'}</td><td>${esc(r.DriverName||'-')}</td><td class="r">${int(r.TotalStops)}</td><td class="r">${int(r.TotalBoxes)}</td><td class="r">${num1(r.TotalDistance)}</td><td class="r">${r.EstimatedDuration?int(r.EstimatedDuration)+' น.':'-'}</td><td class="r">${money(r.EstimatedTotalCost)}</td><td>${(DSTATUS[r.Status]||{}).label||r.Status}</td></tr>`).join('')||'<tr><td colspan="10" class="c muted">ไม่มีข้อมูล</td></tr>'}</tbody>
    <tfoot><tr><th colspan="8" class="r">รวมต้นทุน</th><th class="r" colspan="2">${money(total)} บาท</th></tr></tfoot></table>`;
  }
  Printer.open(title, rSize(), head + tbl);
}
async function printRouteNote(r){
  if(!r) return;
  let stops=[]; try{ stops=await API.get('getRouteStops',{routeId:r.RouteID}); }catch(e){}
  if(!stops.length) stops=(Store.data.routeStops||[]).filter(s=>String(s.RouteID)===String(r.RouteID)).sort((a,b)=>a.StopOrder-b.StopOrder);
  if(!stops.length){
    stops=(Store.data.deliveries||[]).filter(d=>String(d.RouteID)===String(r.RouteID)).map((d,i)=>({
      StopOrder:i+1, DeliveryID:d.DeliveryID, CustomerName:d.CustomerName, BranchName:d.BranchName,
      Address:d.Address, Latitude:d.Latitude, Longitude:d.Longitude, BoxQty:d.BoxQty||0,
    }));
  }
  const deliveryForStop = s => (Store.data.deliveries||[]).find(x=>String(x.DeliveryID)===String(s.DeliveryID));
  const poForStop = s => {
    const d = deliveryForStop(s);
    return d ? (DelView.poNo(d) || '—') : '—';
  };
  const invForStop = s => {
    const d = deliveryForStop(s);
    if (!d) return '—';
    const po = DelView.poNo(d);
    const inv = DelView.invoiceNo(d);
    if (inv && po && inv.replace(/\s+/g, '').toLowerCase() === po.replace(/\s+/g, '').toLowerCase()) return '—';
    return inv || '—';
  };
  const qtyNumForStop = s => {
    const d = deliveryForStop(s);
    return Number(d ? (d.BoxQty ?? s.BoxQty) : s.BoxQty) || 0;
  };
  const rowForStop = s => {
    const d = deliveryForStop(s);
    return d || { CustomerName: s.CustomerName, BranchName: s.BranchName, Address: s.Address };
  };
  const addrForStop = s => trcAddressOnly(rowForStop(s)) || '—';
  const row=(l,v)=>`<div><span>${l}:</span> <b>${esc(v==null||v===''?'-':v)}</b></div>`;
  const vehLbl = ((r.VehicleName||r.ProviderName||'') + (r.LicensePlate ? ' · '+r.LicensePlate : '')).trim() || '-';
  const body=`
    <div class="kv">
      ${row('รอบส่ง',r.RouteID)}${row('วันที่',thDate(r.DeliveryDate))}
      ${row('คนขับ',r.DriverName)}${row('รถ',vehLbl)}
      ${row('จำนวนบิล',int(stops.length))}${row('จำนวนรวม',int(r.TotalBoxes))}</div>
    <div class="sec-title">รายการขึ้นของ / จุดส่ง — ให้คนขับเช็คก่อนออกรถ</div>
    <table class="slip-table">
      <colgroup><col style="width:5%"><col style="width:5%"><col style="width:20%"><col style="width:14%"><col style="width:14%"><col style="width:8%"><col></colgroup>
      <thead><tr><th>☐</th><th>#</th><th>ลูกค้า</th><th>เลขอ้างอิง</th><th>เลขบิล</th><th>จำนวน</th><th>ที่อยู่</th></tr></thead>
      <tbody>${stops.map(s=>{ const stopRow = rowForStop(s); return `<tr>
        <td class="c">☐</td><td class="c">${s.StopOrder}</td>
        <td>${esc(trcCustomerName(stopRow))}</td>
        <td class="mono">${esc(poForStop(s))}</td>
        <td class="mono">${esc(invForStop(s))}</td>
        <td class="r">${int(qtyNumForStop(s))}</td>
        <td class="addr">${esc(addrForStop(s))}</td>
      </tr>`; }).join('')||'<tr><td colspan="7" class="c muted">ไม่มีรายการ</td></tr>'}</tbody>
      <tfoot><tr><th colspan="5" class="r">รวมจำนวน</th><th class="r">${int(stops.reduce((n,s)=>n+qtyNumForStop(s),0))}</th><th></th></tr></tfoot>
    </table>
    <p class="small muted" style="margin:10px 0 0">เช็ค ☐ ทุกบิลก่อนขึ้นของ · ลำดับส่งตาม # · ระยะทาง / เวลาออก-กลับ / น้ำมัน ดูที่รายงานย้อนหลัง</p>
    <div class="sign"><div>ผู้จัดงาน</div><div>คนขับ (เช็คขึ้นของ)</div></div>`;
  Printer.open('ใบงานส่ง — เช็ครายการขึ้นของ', rSize(), body);
}

/* ================================================================
   SETTINGS HUB (MVP) — รวมทุกเมนูขั้นสูงไว้ที่เดียว
   ================================================================ */
ROUTES.settings = async function(view){
  const item=(href,icon,title,sub,ext)=>`<a href="${href}"${ext?' target="_blank"':''} style="display:flex;align-items:center;gap:13px;padding:15px 16px;background:var(--card,#fff);border:1px solid var(--border);border-radius:14px;text-decoration:none;color:inherit">
    <span style="width:42px;height:42px;border-radius:11px;background:#eef6cf;color:#5f7a00;display:flex;align-items:center;justify-content:center;flex-shrink:0"><i data-lucide="${icon}"></i></span>
    <span style="flex:1;min-width:0"><span style="display:block;font-weight:600;font-size:14.5px">${esc(title)}</span><span style="display:block;font-size:12.5px;color:#6B7383;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(sub)}</span></span>
    <i data-lucide="chevron-right" style="color:#9AA3B2;width:18px;height:18px;flex-shrink:0"></i></a>`;
  const grp=(t,items)=>`<div style="font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#9AA3B2;font-weight:700;margin:22px 4px 10px">${esc(t)}</div><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:12px">${items.join('')}</div>`;
  page(view, `
    ${head('ตั้งค่า', 'ข้อมูลหลัก การเชื่อมต่อ และเมนูขั้นสูง — จัดการที่นี่ที่เดียว')}
    ${grp('ปฏิบัติการเพิ่มเติม',[
      item('#/expenses','wallet','ค่าใช้จ่าย','บันทึก/ตรวจสอบค่าใช้จ่ายแต่ละรอบส่ง'),
      item('#/driver','smartphone','โหมดคนขับ','เปิดหน้าคนขับ / ให้สแกน QR บนมือถือ')])}
    ${grp('ข้อมูลหลัก',[
      item('#/customers','store','ลูกค้า / สาขา','ที่อยู่ · พิกัด · เบอร์ติดต่อ'),
      item('#/vehicles','truck','รถบริษัท','ทะเบียน · คนขับ · ค่าน้ำมัน'),
      item('#/external','truck-electric','รถจ้างภายนอก','ผู้ให้บริการ + เรตราคา'),
      item('#/employees','users','พนักงานส่งสินค้า','คนขับ + รถประจำ')])}
    ${grp('การเงินเพิ่มเติม',[
      item('#/advance','hand-coins','เงินทดรองจ่าย','เบิก / เคลียร์เงินคนขับ'),
      item('#/routecost','calculator','ต้นทุนต่อรอบส่ง','แยกค่าใช้จ่ายรายรอบส่ง')])}
    ${grp('ระบบ & การเชื่อมต่อ',[
      item('#/config','sliders-horizontal','ตั้งค่าระบบ · คลัง · ต้นทุน','บริษัท พิกัดคลัง ค่าน้ำมัน + เชื่อม Google'),
      item('#/trcloud','cloud-download','TRCloud ออเดอร์','ดึง Sale Order เป็นงานส่ง · webhook realtime'),
      item('#/cartrack','satellite-dish','Cartrack GPS','เชื่อมต่อ GPS ติดตามรถ')])}
  `);
};

/* ================================================================
   SYSTEM CONFIG — คลัง · ต้นทุน · เชื่อมต่อ Google (เข้าจากหน้าตั้งค่า)
   ================================================================ */
ROUTES.config = async function(view){
  const settings = await API.get('getSettings');
  const url = API.url();
  // เติมค่าเวลาทำงานถ้ายังไม่มีใน settings (ใช้กับโลจิกแบ่งรถ)
  [['WORK_START_HOUR','9','cost','เริ่มงาน (ชั่วโมง 0–23) เช่น 9 = 09:00'],
   ['WORK_END_HOUR','18','cost','เลิกงาน (ชั่วโมง 0–23) เช่น 18 = 18:00'],
   ['SERVICE_MIN_PER_STOP','12','cost','นาทีจอดส่งต่อจุด (ใช้ในไทม์ไลน์รายงาน)'],
   ['FUEL_PRICE_PER_LITER','33','cost','ราคาน้ำมัน (บาท/ลิตร) ใช้คำนวณลิตรในรายงานย้อนหลัง']].forEach(([Key,Value,Group,Label])=>{
    if(!settings.find(s=>s.Key===Key)) settings.push({ Key, Value:String(setting(Key,Value)), Group, Label });
  });
  const group=(g)=>settings.filter(s=>s.Group===g);
  const fieldFor=(s)=>`<div class="field"><label class="label">${esc(s.Label||s.Key)} <span class="mono small muted">(${esc(s.Key)})</span></label><input class="input" data-skey="${esc(s.Key)}" value="${esc(s.Value)}"></div>`;
  page(view, `
    ${head('ตั้งค่าระบบ', 'คลัง · ต้นทุน · การเชื่อมต่อ Backend', '<a class="btn btn-sm" href="#/settings"><i data-lucide="arrow-left"></i>กลับหน้าตั้งค่า</a>')}
    <div class="card mb14">
      <div class="flex aic gap12 mb14"><div style="width:40px;height:40px;border-radius:11px;background:#EFF4FF;color:#2563EB;display:flex;align-items:center;justify-content:center"><i data-lucide="database"></i></div>
        <div><div class="h-card">แหล่งข้อมูล — API Backend URL</div><div class="small muted">ค่าเริ่มต้นต่อกับ Cloudflare (D1) อยู่แล้วในตัว — ไม่ต้องตั้งอะไรเพิ่ม ช่องนี้มีไว้เผื่อทดสอบ/สลับ backend เท่านั้น</div></div></div>
      <div class="field"><input class="input" id="apiUrl" placeholder="/api/gas" value="${esc(url)}"></div>
      <div class="flex gap8 wrap">
        <button class="btn btn-primary" id="apiSave"><i data-lucide="plug"></i>เชื่อมต่อ & โหลดข้อมูล</button>
        <button class="btn" id="apiTest"><i data-lucide="activity"></i>ทดสอบการเชื่อมต่อ</button>
        <button class="btn" id="apiMock"><i data-lucide="flask-conical"></i>ใช้ข้อมูลทดลอง (Mock)</button>
        <span class="flex aic gap8" style="margin-left:auto"><span class="sync-dot" style="background:${Store.live?'#10B981':'#F59E0B'}"></span><span class="small strong">${Store.live?'เชื่อมต่อแล้ว':'โหมดทดลอง'}</span></span>
      </div>
    </div>

    <div class="grid" style="grid-template-columns:1fr 1fr;gap:16px">
      <div class="card"><div class="h-card mb14">ข้อมูลบริษัท & คลังสินค้า</div>${group('company').map(fieldFor).join('')}</div>
      <div class="card"><div class="h-card mb14">พารามิเตอร์ต้นทุน</div>${group('cost').map(fieldFor).join('')}</div>
      <div class="card"><div class="h-card mb14">การติดตาม (GPS Check-in)</div>${group('tracking').map(fieldFor).join('')}</div>
      <div class="card"><div class="h-card mb14">บันทึกค่าทั้งหมด</div>
        <p class="small muted">แก้ไขค่าในช่องด้านซ้าย แล้วกดบันทึกเพื่อบันทึกลงระบบทันที</p>
        <button class="btn btn-primary btn-block mt16" id="setSave"><i data-lucide="save"></i>บันทึกการตั้งค่าทั้งหมด</button></div>
    </div>
  `);
  el('apiSave').onclick=async()=>{ API.setUrl(el('apiUrl').value.trim()); await loadBootstrap(); render(); toast(Store.live?'เชื่อมต่อสำเร็จ':'บันทึก URL แล้ว','ok'); };
  el('apiTest').onclick=async()=>{ const u=el('apiUrl').value.trim(); if(!u){toast('กรอก URL ก่อน','warn');return;} try{ const r=await fetch(u+'?action=ping'); const j=await r.json(); toast(j.ok?'เชื่อมต่อสำเร็จ ✓ server time '+(j.data&&j.data.time||''):'ตอบกลับผิดพลาด','ok'); }catch(e){ toast('เชื่อมต่อไม่ได้: '+e.message,'err'); } };
  el('apiMock').onclick=async()=>{ API.useMock(); await loadBootstrap(); render(); toast('สลับเป็นข้อมูลทดลอง (Mock)','info'); };
  el('setSave').onclick=async()=>{ const inputs=$$('[data-skey]',view); el('setSave').disabled=true; try{ for(const i of inputs){ await API.post('updateSetting',{key:i.dataset.skey,value:i.value}); } await loadBootstrap(); toast('บันทึกการตั้งค่าแล้ว','ok'); }catch(e){toast(e.message,'err');} el('setSave').disabled=false; };
};

/* ================================================================
   TRCLOUD — ดึง Sale Order เป็นงานส่ง
   ================================================================ */
ROUTES.trcloud = async function(view){
  let st = { enabled:false, connected:false, hasCredentials:false, lastSync:'', pingError:'', webhookUrl:'https://gadgetvilla-delivery.pages.dev/trcloud-webhook' };
  try{ st = await API.get('getTrcloudStatus'); }catch(e){ st.pingError = e.message||String(e); }
  const to = Store.date;
  const from = Store.date;
  page(view, `
    ${head('TRCloud ออเดอร์', 'ดึง Sale Order (KSO + BSO) เป็นงานส่งอัตโนมัติ', '<a class="btn btn-sm" href="#/settings"><i data-lucide="arrow-left"></i>กลับตั้งค่า</a>')}
    <div class="notice ${st.connected?'ok':(st.hasCredentials?'warn':'info')} mb14"><i data-lucide="${st.connected?'cloud':'cloud-off'}"></i>
      <div><b>${st.connected?'เชื่อมต่อ TRCloud ได้':(st.hasCredentials?'มี credentials แต่ทดสอบไม่ผ่าน':'ยังไม่มี credentials')}</b>
      · ซิงก์ล่าสุด ${st.lastSync?ago(st.lastSync):'—'}
      ${st.pingError?' · '+esc(st.pingError):''}</div></div>

    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:14px;margin-bottom:16px">
      <div class="card" style="padding:16px"><div class="small muted">สถานะ</div><div class="strong" style="font-size:18px;margin-top:4px">${st.connected?'พร้อม':'ยังไม่พร้อม'}</div></div>
      <div class="card" style="padding:16px"><div class="small muted">ซิงก์ล่าสุด</div><div class="strong" style="font-size:16px;margin-top:4px">${st.lastSync?ago(st.lastSync):'—'}</div></div>
      <div class="card" style="padding:16px"><div class="small muted">รูปแบบเอกสาร</div><div class="strong mono" style="font-size:18px;margin-top:4px">${esc((st.companyFormats||['KSO','BSO']).join(' + '))}</div></div>
    </div>

    <div class="card mb14">
      <div class="h-card mb14">ดึงออเดอร์ตามช่วงวันที่</div>
      <div class="flex gap12 wrap aic">
        <div><label class="label">จากวันที่</label><input type="date" class="input" id="tcFrom" value="${from}"></div>
        <div><label class="label">ถึงวันที่</label><input type="date" class="input" id="tcTo" value="${to}"></div>
        <div style="align-self:flex-end"><button class="btn btn-primary" id="tcSync"><i data-lucide="cloud-download"></i>ดึงออเดอร์ → งานส่ง</button></div>
        <div style="align-self:flex-end"><button class="btn" id="tcPing"><i data-lucide="activity"></i>ทดสอบการเชื่อมต่อ</button></div>
      </div>
      <div class="small muted" style="margin-top:10px">ดึงทั้ง <b>KSO</b> และ <b>BSO</b> · สร้างงาน <b>รอจัดส่ง</b> · บิลที่ TRCloud มีเครื่องหมาย <span class="mono">[DISPATCH:DELIVERED]</span> หรือส่งครบแล้ว → บันทึกเป็น <b>ส่งแล้ว</b> ไม่โผล่ซ้ำในคิว · บิลเก่าเกิน 2 วัน → ปิดอัตโนมัติ</div>
      <div id="tcResult" class="mt16"></div>
    </div>

    <div class="card">
      <div class="h-card mb14">Realtime เมื่อช่อง SO ถูก gvtools ใช้อยู่</div>
      <div class="notice warn mb14"><i data-lucide="info"></i><div>
        <b>อย่าเปลี่ยน</b> สร้างรายการ / แก้ไขรายการ ของ SO ใน TRCloud — ปล่อยให้ชี้ <span class="mono">gvtools.dev</span> ตามเดิม<br>
        ระบบนี้จะ <b>ดึง SO อัตโนมัติทุก 3 นาที</b> (และกดปุ่มด้านบนได้) โดยไม่แย่ง webhook ของเขา
      </div></div>
      <p class="small muted" style="margin:0 0 10px;line-height:1.55">ถ้าต้องการ realtime ทันทีโดยไม่ทับ gvtools — ให้ทีม gvtools <b>forward</b> หลังรับ event SO มาที่:</p>
      <code class="mono small" style="display:block;padding:12px;background:var(--bg,#FAFBFC);border-radius:10px;border:1px solid var(--border);word-break:break-all">https://gadgetvilla-delivery.pages.dev/trcloud-webhook?engine=so&amp;action=create</code>
      <div class="small muted" style="margin-top:10px">ตัวอย่างโค้ด forward อยู่ในไฟล์ <span class="mono">docs/TRCLOUD_GVTOOLS_FORWARD.md</span> ในโปรเจกต์ — ส่งให้คนดูแล gvtools ได้เลย</div>
    </div>
  `);
  el('tcPing').onclick=async()=>{ el('tcPing').disabled=true; try{ st=await API.get('getTrcloudStatus'); toast(st.connected?'เชื่อมต่อสำเร็จ':'เชื่อมต่อไม่ผ่าน: '+(st.pingError||''), st.connected?'ok':'warn'); ROUTES.trcloud(view); }catch(e){ toast(e.message,'err'); } el('tcPing').disabled=false; };
  el('tcSync').onclick=async()=>{
    const dateFrom=el('tcFrom').value, dateTo=el('tcTo').value;
    el('tcSync').disabled=true; el('tcSync').innerHTML='<i data-lucide="loader-2" style="animation:spin 1s linear infinite"></i>กำลังดึง…'; icons();
    el('tcResult').innerHTML=loadingState();
    try{
      const r=await API.post('syncTrcloudOrders',{ dateFrom, dateTo, workDate:dateTo, lookbackDays:0, limit:80 });
      await loadBootstrap();
      const byFmt = r.byFormat||{};
      const fmtLine = Object.keys(byFmt).map(f=>`${f}: พบ ${int(byFmt[f].total)} (ใหม่ ${int(byFmt[f].imported)})`).join(' · ');
      el('tcResult').innerHTML=`<div class="notice ok"><i data-lucide="check-circle-2"></i><div>
        รูปแบบ ${(r.formats||[]).join('+')||'KSO+BSO'} · ช่วง ${esc(r.dateFrom||dateFrom)} → ${esc(r.dateTo||dateTo)} · พบรวม ${int(r.total)} ใบ · <b>ใหม่ ${int(r.imported)}</b> · อัปเดต ${int(r.updated)} · ข้าม ${int(r.skipped)}
        ${r.markedDelivered ? ` · ส่งแล้วใน TRCloud ${int(r.markedDelivered)}` : ''}
        ${r.skippedDelivered ? ` · ข้าม (ส่งแล้วในระบบ) ${int(r.skippedDelivered)}` : ''}
        ${r.skippedIncomplete ? ` · ข้าม (ข้อมูลไม่ครบ) ${int(r.skippedIncomplete)}` : ''}
        ${r.ghostsPurged ? ` · ลบแถวว่าง ${int(r.ghostsPurged)}` : ''}
        ${fmtLine?`<br><span class="small muted">${esc(fmtLine)}</span>`:''}
        ${r.errors&&r.errors.length?`<br><span class="small">error ${r.errors.length}: ${esc((r.errors[0]&&r.errors[0].error)||'')}</span>`:''}
        <div style="margin-top:10px"><a class="btn btn-sm btn-primary" href="#/deliveries">ไปหน้างานส่ง</a></div>
      </div></div>`;
      toast('ดึงออเดอร์จาก TRCloud แล้ว','ok');
    }catch(e){
      el('tcResult').innerHTML=`<div class="notice warn"><i data-lucide="alert-triangle"></i><div>${esc(e.message||String(e))}</div></div>`;
      toast(e.message,'err');
    }
    el('tcSync').disabled=false; el('tcSync').innerHTML='<i data-lucide="cloud-download"></i>ดึงออเดอร์ → งานส่ง'; icons();
  };
};

/* ================================================================
   CARTRACK INTEGRATION
   ================================================================ */
ROUTES.cartrack = async function(view){
  const ct = await API.get('getCartrackStatus');
  const veh = await API.get('getVehicles');
  const matched = veh.filter(v=>v.CartrackRegistration);
  page(view, `
    ${head('Cartrack Fleet Integration', 'ติดตามรถ GPS สดผ่าน Cloudflare Worker (ซิงก์ทุก 1 นาที) — รถที่ไม่ได้ผูก Cartrack ใช้สัญญาณมือถือคนขับแทน')}
    <div class="notice ${ct.connected?'ok':(ct.enabled?'warn':'info')} mb14"><i data-lucide="${ct.connected?'wifi':(ct.enabled?'wifi-off':'info')}"></i>
      <div><b>${ct.connected?'🟢 Connected':(ct.enabled?'🔴 Disconnected':'⚪ ยังไม่เปิดใช้งาน')}</b> ·
      ${ct.hasCredentials?'มี credentials':'ยังไม่ได้ตั้งค่า credentials'} · Worker ซิงก์ล่าสุด ${ct.lastSync?ago(ct.lastSync):'—'}${ct.mock?' · (โหมดทดลอง)':''}</div></div>
    <div class="notice info mb14"><i data-lucide="info"></i><div>"Worker ซิงก์ล่าสุด" คือเวลาที่ระบบ<b>ถาม</b> Cartrack ล่าสุด ไม่ใช่เวลาที่รถแต่ละคันมีพิกัดใหม่จริง — ถ้ารถคันไหนจอดหรืออุปกรณ์ไม่ส่งพิกัดมานานเกิน 10 นาที สถานะจะขึ้น <b>🟠 สัญญาณขาด</b> (ไม่ใช่ "ออฟไลน์" — คนละความหมาย: สัญญาณขาด = เคยเชื่อมต่อได้ แต่พิกัดล่าสุดเก่าไปแล้ว ส่วนออฟไลน์ = ไม่มีพิกัดเลยตั้งแต่แรก) แม้ Worker จะซิงก์สำเร็จทุกนาทีก็ตาม (ดูคอลัมน์ "อัปเดตพิกัดล่าสุด" ต่อคันด้านล่าง)</div></div>

    <div class="grid" style="grid-template-columns:repeat(4,1fr);gap:16px" class="mb14">
      ${ctStat('สถานะ',ct.connected?'เชื่อมต่อ':'ไม่เชื่อมต่อ','satellite-dish',ct.connected?'#10B981':'#EF4444')}
      ${ctStat('Worker ซิงก์ล่าสุด',ct.lastSync?ago(ct.lastSync):'—','clock','#2563EB')}
      ${ctStat('รถที่พบ',int(ct.found)+' คัน','truck','#7C3AED')}
      ${ctStat('รถที่จับคู่',int(ct.matched)+' คัน','link','#0891B2')}
    </div>

    <div class="card mt16">
      <div class="notice warn mb14"><i data-lucide="shield-check"></i><div><b>ความปลอดภัย:</b> Cartrack Username / API Token ถูกเก็บเป็น secret ใน Cloudflare (Worker/Pages) เท่านั้น ไม่เก็บใน Frontend / HTML / LocalStorage — ตัว Worker เป็นผู้เรียก Cartrack API โดยตรง</div></div>
      <div class="flex gap8 wrap">
        <button class="btn btn-primary" id="ctTest"><i data-lucide="activity"></i>ทดสอบการเชื่อมต่อ</button>
        <button class="btn" id="ctSync"><i data-lucide="refresh-cw"></i>Sync รถทั้งหมด</button>
      </div>
      <div class="notice info" style="margin-top:14px"><i data-lucide="terminal"></i><div>
        ดึงพิกัดอัตโนมัติทุก 1 นาทีผ่าน Cloudflare Worker (cron trigger) · ตั้งค่า/แก้ credentials ได้ที่ Cloudflare Pages/Worker secrets เท่านั้น (ไม่ใส่ในเว็บ)</div></div>
    </div>

    <div class="card mt16"><div class="h-card mb14">การจับคู่รถบริษัท ↔ Cartrack</div><div class="tbl-wrap">
      <table class="tbl"><thead><tr><th>รถบริษัท</th><th>ทะเบียน</th><th>Cartrack Reg.</th><th>ตำแหน่งล่าสุด</th><th>ความเร็ว</th><th>อัปเดตพิกัดล่าสุด</th><th>สถานะ</th></tr></thead>
      <tbody>${veh.map(v=>`<tr><td class="strong">${esc(v.VehicleName)}</td><td class="mono small">${esc(v.LicensePlate)}</td>
        <td class="mono small">${v.CartrackRegistration?esc(v.CartrackRegistration):'<span class="badge b-gray">ยังไม่จับคู่</span>'}</td>
        <td class="small muted">${v.CurrentLatitude?num1(v.CurrentLatitude)+', '+num1(v.CurrentLongitude):'—'}</td>
        <td class="tab">${int(v.CurrentSpeed)} กม./ชม.</td>
        <td class="small muted">${v.LastPositionTime?ago(v.LastPositionTime):(v.LastSyncAt?ago(v.LastSyncAt):'ไม่มีสัญญาณ')}</td>
        <td>${vstatusBadge(deriveVehStatus(v))}</td></tr>`).join('')}</tbody></table>
    </div></div>
  `);
  el('ctTest').onclick=async()=>{ try{ const r=await API.post('syncCartrack',{}); toast(r.ok?('เชื่อมต่อสำเร็จ · '+r.fetched+' คัน'):(r.message||'ทดสอบเสร็จ'), r.ok?'ok':'warn'); if(r.ok) await refresh(); }catch(e){toast(e.message,'err');} };
  el('ctSync').onclick=async()=>{ el('ctSync').disabled=true; try{ const r=await API.post('syncCartrack',{}); toast(r.ok?('ซิงก์แล้ว · พบ '+r.fetched+' · แมตช์ '+r.matched):(r.message||'ซิงก์ไม่สำเร็จ'), r.ok?'ok':'warn'); await refresh(); }catch(e){toast(e.message,'err');} el('ctSync').disabled=false; };
  // รีเฟรชสถานะบนหน้านี้ทุก 15 วิ (poll หลักใน app.js จะสั่ง syncCartrack light แล้วเรียก render)
};
function ctStat(l,v,ic,col){ return `<div class="card" style="padding:16px"><div class="flex between aic"><div><div class="small muted">${l}</div><div class="strong" style="font-size:18px;margin-top:4px">${v}</div></div><div style="width:40px;height:40px;border-radius:11px;background:${col}15;color:${col};display:flex;align-items:center;justify-content:center"><i data-lucide="${ic}"></i></div></div></div>`; }

/* ================================================================
   DRIVER MOBILE MODE
   ================================================================ */
const Driver = { routeId:null, tab:'home' };
/* ---- driver login session (localStorage) ---- */
const DRV_LS_TOKEN='ddc_driver_token', DRV_LS_EMP='ddc_driver_emp';
function driverSession(){
  try{ const token=localStorage.getItem(DRV_LS_TOKEN); const emp=JSON.parse(localStorage.getItem(DRV_LS_EMP)||'null');
    return (token&&emp)?{token,emp}:null; }catch(e){ return null; }
}
function driverSetSession(token,emp){ localStorage.setItem(DRV_LS_TOKEN,token); localStorage.setItem(DRV_LS_EMP,JSON.stringify(emp)); }
function driverClearSession(){ localStorage.removeItem(DRV_LS_TOKEN); localStorage.removeItem(DRV_LS_EMP); Driver.routeId=null; Driver.tab='home'; stopDriverBeacon(); }
/* ---- ส่งพิกัดต่อเนื่องระหว่างวิ่งงาน (ทุก 25 วิ) — แทนการยิง GPS แค่ตอน check-in/ส่งเสร็จ
   ให้หน้าติดตามเห็นตำแหน่งสดของรถที่ไม่มี Cartrack ได้จริง (ผ่าน driverPing → อัปเดต vehicles) ---- */
let driverBeaconTimer=null, driverBeaconRouteId=null;
function stopDriverBeacon(){ if(driverBeaconTimer){ clearInterval(driverBeaconTimer); driverBeaconTimer=null; } driverBeaconRouteId=null; }
function startDriverBeacon(routeId, token){
  if(driverBeaconRouteId===routeId && driverBeaconTimer) return;
  stopDriverBeacon();
  driverBeaconRouteId=routeId;
  if(!navigator.geolocation) return;
  const ping=()=>{
    navigator.geolocation.getCurrentPosition(pos=>{
      const {latitude,longitude,speed,heading,accuracy}=pos.coords;
      API.post('driverPing',{routeId, lat:latitude, lng:longitude, speed:speed||0, heading, accuracy, token}).catch(()=>{});
    }, ()=>{}, {enableHighAccuracy:true, timeout:15000, maximumAge:10000});
  };
  ping(); driverBeaconTimer=setInterval(ping,25000);
}
function bindDriverLogout(sess){
  const b=el('drvLogout'); if(!b) return;
  b.onclick=async()=>{ try{ await API.post('driverLogout',{token:sess.token}); }catch(e){} driverClearSession(); render(); };
}
function driverExitAdmin(){
  // ออกจากโหมดคนขับกลับหน้าจัดการ — ไม่บังคับ logout คนขับ (session ยังอยู่ถ้าอยากกลับมา)
  location.hash = '#/dashboard';
}
/** ออกจากบัญชีคนขับ → กลับหน้ารายชื่อพนักงาน (ยังอยู่ #/driver) */
async function driverBackToPicker(){
  const sess = driverSession();
  if (sess) {
    try { await API.post('driverLogout', { token: sess.token }); } catch (e) {}
    driverClearSession();
  }
  Driver.tab = 'home';
  if ((location.hash || '').replace(/^#\/?/, '').split('?')[0] !== 'driver') {
    location.hash = '#/driver';
  } else {
    render();
  }
}
function driverBackBar(extraRight, opts){
  const toPicker = !!(opts && opts.toPicker);
  const label = toPicker ? 'รายชื่อพนักงาน' : 'กลับ';
  const id = toPicker ? 'drvBackPicker' : 'drvBackAdmin';
  return `<div class="driver-backbar">
    <button type="button" class="btn btn-sm" id="${id}"><i data-lucide="arrow-left"></i>${label}</button>
    ${extraRight||''}
  </div>`;
}
function bindDriverBack(opts){
  const toPicker = !!(opts && opts.toPicker);
  const b = el(toPicker ? 'drvBackPicker' : 'drvBackAdmin');
  if (!b) return;
  b.onclick = () => {
    if (toPicker) driverBackToPicker();
    else driverExitAdmin();
  };
}
function driverLoginForm(view){
  // ไม่ต้องใส่รหัส — งานถูกระบบคำนวณ+มอบหมายไว้อยู่แล้ว แค่แตะเลือกว่าเป็นใคร
  // เพื่อให้แยก "งานของฉัน" ได้ และรู้ว่าใครเช็คอิน/ส่งสำเร็จจริง (ไม่ใช่การล็อกอินเพื่อกันคนนอก)
  const drivers = (Store.data.employees||[]).filter(e=>!e.IsDeleted && e.Role==='DRIVER' && e.Status==='Active');
  page(view, `<div class="driver">
    ${driverBackBar()}
    ${head('โหมดคนขับ', thDate(Store.date))}
    <div class="strong small muted mb14" style="text-align:center">แตะชื่อของคุณเพื่อเข้าใช้งาน</div>
    ${drivers.length? drivers.map(e=>`<button class="btn btn-block big-btn mb14" data-pick="${esc(e.EmployeeID)}" style="justify-content:flex-start;gap:12px">
        <span class="avatar" style="width:36px;height:36px;flex-shrink:0"><i data-lucide="user"></i></span>
        <span style="flex:1;text-align:left">${esc(e.EmployeeName)}</span>
        <i data-lucide="chevron-right"></i>
      </button>`).join('')
      : emptyState('ยังไม่มีรายชื่อคนขับ','เพิ่มคนขับได้ที่หน้าตั้งค่า → พนักงานส่งสินค้า')}
  </div>`);
  bindDriverBack();
  $$('[data-pick]',view).forEach(b=>b.onclick=async()=>{
    const orig=b.innerHTML; b.disabled=true; b.innerHTML='<i data-lucide="loader-2" style="animation:spin 1s linear infinite"></i>กำลังเข้าสู่ระบบ…'; icons();
    try{
      let r;
      try {
        r = await API.post('driverSelect',{employeeId:b.dataset.pick});
      } catch(e1){
        // localStorage ชี้ Apps Script เก่าที่ไม่มี driverSelect → สลับกลับ /api/gas แล้วลองใหม่ครั้งเดียว
        if(/unknown action:\s*driverSelect/i.test(String(e1&&e1.message||e1))){
          API.setUrl(''); // clear → DEFAULT_API_URL (/api/gas)
          toast('สลับไป API ใหม่แล้ว กำลังเข้าสู่ระบบอีกครั้ง…','info');
          r = await API.post('driverSelect',{employeeId:b.dataset.pick});
        } else { throw e1; }
      }
      driverSetSession(r.token,r.employee); render();
    }
    catch(e){ toast(e.message,'err'); b.disabled=false; b.innerHTML=orig; icons(); }
  });
}
function driverJobCard(r){
  return `<div class="card mb14">
    <div class="flex between aic"><div><div class="mono strong" style="font-size:16px">${esc(r.RouteID)}</div>
      <div class="small muted">${esc(r.DriverName||'ยังไม่ระบุคนขับ')} · ${esc(r.VehicleName||r.ProviderName||'')}</div></div>${dstatusBadge(r.Status)}</div>
    <div class="flex gap12 small muted" style="margin:12px 0"><span>📍 ${int(r.TotalStops)} จุด</span><span>📦 ${int(r.TotalBoxes)} กล่อง</span><span>🛣️ ${num1(r.TotalDistance)} กม.</span></div>
    <button class="btn btn-primary btn-block big-btn" data-accept="${esc(r.RouteID)}"><i data-lucide="hand"></i>รับงานนี้</button>
  </div>`;
}
/* ---- Driver-mode chrome: dnav (🏠 วันนี้ / 🚚 งาน / 👤 ฉัน) replaces the admin sidebar/topbar (see body.driver-mode in styles.css) ---- */
function buildDriverNav(){
  const nav = el('dnav');
  const items=[{k:'home',icon:'home',label:'วันนี้'},{k:'jobs',icon:'truck',label:'งาน'},{k:'me',icon:'user',label:'ฉัน'}];
  nav.innerHTML = items.map(it=>`<button data-dtab="${it.k}" class="${Driver.tab===it.k?'active':''}"><i data-lucide="${it.icon}"></i>${it.label}</button>`).join('');
  $$('[data-dtab]',nav).forEach(b=>b.onclick=()=>{ Driver.tab=b.dataset.dtab; render(); });
  icons();
}
ROUTES.driver = async function(view){
  const sess = driverSession();
  if(!sess){ el('dnav').innerHTML=''; driverLoginForm(view); return; }
  let routes, pool;
  try{
    routes = await API.post('getMyRoutes',{token:sess.token, date:Store.date});
    pool = await API.post('getAvailableRoutes',{token:sess.token, date:Store.date});
  }
  catch(e){ driverClearSession(); el('dnav').innerHTML=''; toast('เซสชันหมดอายุ — กรุณาเข้าสู่ระบบใหม่','warn'); driverLoginForm(view); return; }
  const active = routes.find(r=>r.RouteID===Driver.routeId) || routes.find(r=>r.Status==='In Progress');
  const stops = active ? await API.get('getRouteStops',{routeId:active.RouteID}) : [];
  if(active && active.Status==='In Progress') startDriverBeacon(active.RouteID, sess.token); else stopDriverBeacon();
  buildDriverNav();
  if(Driver.tab==='jobs') return driverJobsView(view, sess, routes, pool, active, stops);
  if(Driver.tab==='me') return driverMeView(view, sess, active);
  return driverHomeView(view, sess, pool, active, stops);
};
/* ---- 🏠 วันนี้ — จุดโฟกัสเดียว: รอบที่กำลังส่งอยู่ + จุดถัดไป ---- */
let driverMapRef=null;
function drawDriverMap(cur){
  if(!el('driverMap')) return;
  if(driverMapRef){ driverMapRef.remove(); driverMapRef=null; }
  const wh=warehouse();
  driverMapRef=MapUtil.make('driverMap',{lat:+cur.Latitude,lng:+cur.Longitude});
  MapUtil.whMarker(driverMapRef,wh);
  MapUtil.stopMarker(driverMapRef,cur,cur.StopOrder,'#2563EB');
  driverMapRef.fitBounds([[wh.lat,wh.lng],[+cur.Latitude,+cur.Longitude]],{padding:[26,26]});
}
function driverHomeView(view, sess, pool, active, stops){
  if(!active){
    page(view, `<div class="driver">
      ${driverBackBar('', { toPicker: true })}
      ${head('วันนี้', `${thDate(Store.date)} · สวัสดี ${esc(sess.emp.EmployeeName)}`)}
      <div class="notice info mb14"><i data-lucide="info"></i><div>ยังไม่มีรอบส่งที่เริ่ม — ไปที่แท็บ <b>งาน</b> เพื่อรับงาน${pool.length?` (มีงานรอรับ ${int(pool.length)} งาน)`:''}</div></div>
      ${emptyState('พร้อมทำงานเมื่อไหร่ก็รับงานได้เลย','')}
    </div>`);
    bindDriverBack({ toPicker: true });
    return;
  }
  const done = stops.filter(s=>s.Status==='Completed').length;
  const pct = stops.length? Math.round(done/stops.length*100):0;
  const cur = stops.find(s=>s.Status!=='Completed');
  page(view, `<div class="driver">
    ${driverBackBar(`<span class="mono small muted">${esc(active.RouteID)}</span>`, { toPicker: true })}
    ${head('วันนี้', `${esc(sess.emp.EmployeeName)} · ${esc(active.VehicleName||active.ProviderName||'')}`)}
    <div class="card mb14">
      <div class="flex between aic mb14"><span class="h-card">ความคืบหน้ารอบส่ง</span><span class="strong tab">${done}/${stops.length} จุด</span></div>
      <div class="progress" style="height:14px"><span style="width:${pct}%;background:#10B981"></span></div>
      <div class="flex between" style="margin-top:8px"><span class="small muted">${int(active.TotalBoxes)} กล่อง · ${num1(active.TotalDistance)} กม.</span><span class="small strong">${pct}%</span></div>
    </div>
    ${active.Status==='Planned'?`<button class="btn btn-primary btn-block big-btn mb14" id="dStart"><i data-lucide="play"></i>เริ่มรอบส่ง</button>`:''}
    ${cur?`<div class="card mb14" style="border:2px solid #2563EB">
      <div class="small muted">จุดส่งปัจจุบัน (ลำดับ ${cur.StopOrder})</div>
      <div class="strong" style="font-size:19px;margin:4px 0">${esc(cur.CustomerName)}</div>
      <div class="muted">${esc(cur.BranchName)} · ${int(cur.BoxQty)} กล่อง</div>
      ${cur.Latitude?`<div id="driverMap" class="map" style="height:180px;margin-top:12px"></div>`:''}
      <div class="grid" style="grid-template-columns:1fr 1fr;gap:10px;margin-top:14px">
        <button class="btn big-btn" id="dMap"><i data-lucide="map"></i>เปิดแผนที่</button>
        <button class="btn big-btn" id="dCheckin"><i data-lucide="map-pin"></i>Check-in</button>
        <button class="btn btn-primary big-btn" id="dDone"><i data-lucide="check-circle-2"></i>ส่งเสร็จ</button>
        <button class="btn btn-danger big-btn" id="dFail"><i data-lucide="x-circle"></i>ส่งไม่สำเร็จ</button>
      </div></div>`:`<div class="notice ok mb14"><i data-lucide="party-popper"></i><div>ส่งครบทุกจุดแล้ว! 🎉</div></div>`}
  </div>`);
  bindDriverBack({ toPicker: true });
  const ds=el('dStart'); if(ds)ds.onclick=async()=>{ ds.disabled=true; try{ await API.post('startRoute',{routeId:active.RouteID,token:sess.token}); }catch(e){} render(); toast('เริ่มรอบส่งแล้ว','ok'); };
  const dm=el('dMap'); if(dm)dm.onclick=()=>{ if(cur&&cur.Latitude) window.open(`https://www.google.com/maps/dir/?api=1&destination=${cur.Latitude},${cur.Longitude}`,'_blank'); };
  const dc=el('dCheckin'); if(dc)dc.onclick=()=>doCheckin(active,cur,sess.token);
  const dd=el('dDone'); if(dd)dd.onclick=()=>podModal('complete',active,cur,sess.token);
  const df=el('dFail'); if(df)df.onclick=()=>podModal('fail',active,cur,sess.token);
  if(cur&&cur.Latitude) setTimeout(()=>drawDriverMap(cur),60);
}
/* ---- 🚚 งาน — รับงาน (ของฉัน + พูลรอรับ) หรือรายการจุดส่งทั้งหมดของรอบที่กำลังทำ ---- */
function driverJobsView(view, sess, routes, pool, active, stops){
  if(!active){
    page(view, `<div class="driver">
      ${driverBackBar('', { toPicker: true })}
      ${head('งาน', thDate(Store.date))}
      <div class="strong small muted mb14">งานของฉัน (${routes.length})</div>
      ${routes.length
        ? `<div class="notice info mb14"><i data-lucide="hand"></i><div>เลือกงานของคุณแล้วกด <b>รับงานนี้</b> เพื่อเริ่มส่ง</div></div>` + routes.map(driverJobCard).join('')
        : emptyState('ยังไม่มีรอบส่งมอบหมายให้คุณวันนี้','')}
      <div class="strong small muted mb14" style="margin-top:20px">งานที่รอรับ (${pool.length})</div>
      ${pool.length
        ? pool.map(driverJobCard).join('')
        : emptyState('ไม่มีงานรอรับตอนนี้','')}
    </div>`);
    bindDriverBack({ toPicker: true });
    $$('[data-accept]',view).forEach(b=>b.onclick=async()=>{ const rid=b.dataset.accept;
      const isPool = pool.some(x=>x.RouteID===rid);
      Driver.routeId=rid;
      // รับงาน = อ้างสิทธิ์ (ถ้าเป็นงานในพูล) + เริ่มรอบทันที → อัปเดตสถานะขึ้นเซิร์ฟเวอร์ ให้ผู้จ่ายงานเห็นว่า "กำลังส่ง"
      try{ await API.post(isPool?'claimRoute':'startRoute',{routeId:rid,token:sess.token}); }
      catch(e){ toast(e.message,'err'); Driver.routeId=null; return; }
      Driver.tab='home'; render(); toast('รับงาน '+rid+' แล้ว เริ่มส่งได้เลย','ok'); });
    return;
  }
  page(view, `<div class="driver">
    ${driverBackBar(`<button class="btn btn-sm" id="dChange"><i data-lucide="repeat"></i>เปลี่ยนงาน</button>`, { toPicker: true })}
    ${head(active.RouteID, `${active.DriverName||''} · ${active.VehicleName||''}`)}
    <div class="card">
      <div class="h-card mb14">รายการจุดส่ง</div>
      ${stops.map(s=>`<div class="flex aic gap8" style="padding:11px 0;border-bottom:1px solid #F3F5F8">
        <span class="stop-num" style="width:28px;height:28px;font-size:12px;background:${s.Status==='Completed'?'#10B981':(s.Status==='Failed'?'#EF4444':'#94A3B8')}">${s.Status==='Completed'?'✓':s.StopOrder}</span>
        <div style="flex:1"><div class="strong" style="font-size:14px">${esc(s.CustomerName)}</div><div class="small muted">${esc(s.BranchName)} · ${int(s.BoxQty)} กล่อง</div></div></div>`).join('')}
    </div>
  </div>`);
  bindDriverBack({ toPicker: true });
  const dch=el('dChange'); if(dch)dch.onclick=()=>{ Driver.routeId=null; render(); };
}
/* ---- 👤 ฉัน — โปรไฟล์คนขับ, ออกจากระบบ, บันทึกค่าใช้จ่าย ---- */
function driverMeView(view, sess, active){
  page(view, `<div class="driver">
    ${driverBackBar('', { toPicker: true })}
    ${head('ฉัน', thDate(Store.date))}
    <div class="card mb14" style="text-align:center;padding:26px 20px">
      <div class="avatar" style="width:64px;height:64px;margin:0 auto 12px"><i data-lucide="user" style="width:30px;height:30px"></i></div>
      <div class="strong" style="font-size:18px">${esc(sess.emp.EmployeeName)}</div>
      <div class="small muted">${esc(sess.emp.Phone||'')}${active?' · '+esc(active.VehicleName||active.ProviderName||''):''}</div>
    </div>
    <button class="btn btn-block big-btn mb14" id="dExpense"><i data-lucide="receipt"></i>บันทึกค่าใช้จ่าย</button>
    <button class="btn btn-block big-btn mb14" id="drvBackPicker2"><i data-lucide="users"></i>เปลี่ยนคนขับ / รายชื่อพนักงาน</button>
    <button class="btn btn-block big-btn mb14" id="drvBackAdmin2"><i data-lucide="layout-dashboard"></i>กลับหน้าจัดการ</button>
    <button class="btn btn-block big-btn" id="drvLogout"><i data-lucide="log-out"></i>ออกจากระบบ</button>
  </div>`);
  bindDriverBack({ toPicker: true });
  const bp = el('drvBackPicker2'); if (bp) bp.onclick = () => driverBackToPicker();
  const b2 = el('drvBackAdmin2'); if(b2) b2.onclick = ()=>driverExitAdmin();
  el('dExpense').onclick=()=>driverExpenseModal(active, sess);
  bindDriverLogout(sess);
}
/* ---- บันทึกค่าใช้จ่ายจากมือถือคนขับ — ใช้ action เดิม (createExpense) ที่ไม่มี auth gate อยู่แล้ว ---- */
function driverExpenseModal(active, sess){
  const EXTYPE={FUEL:'ค่าน้ำมัน',TOLL:'ค่าทางด่วน',PARKING:'ค่าจอดรถ',OTHER:'อื่นๆ'};
  let photoData=null;
  const m=modal({ title:'บันทึกค่าใช้จ่าย', body:`
    ${active?`<div class="notice info mb14"><i data-lucide="route"></i><div>Route: <b>${esc(active.RouteID)}</b></div></div>`:''}
    <div class="field"><label class="label">ประเภท</label><select class="select" id="deType">${Object.keys(EXTYPE).map(k=>`<option value="${k}">${EXTYPE[k]}</option>`).join('')}</select></div>
    <div class="field"><label class="label">จำนวนเงิน (บาท)</label><input class="input" id="deAmt" type="number" inputmode="decimal" placeholder="0"></div>
    <div class="field"><label class="label">หมายเหตุ</label><input class="input" id="deNote" placeholder="เช่น เติมน้ำมัน 7-Eleven"></div>
    <div class="field" style="margin:0"><label class="label">รูปใบเสร็จ (ถ้ามี)</label>
      <input type="file" accept="image/*" capture="environment" id="dePhoto" style="display:none">
      <button class="btn btn-block" id="dePick" type="button"><i data-lucide="camera"></i>ถ่าย / เลือกรูป</button>
      <div id="dePrev" style="margin-top:10px"></div></div>
  `, foot:`<button class="btn" id="deCancel">ยกเลิก</button><button class="btn btn-primary" id="deSave"><i data-lucide="check"></i>บันทึก</button>` });
  el('dePick').onclick=()=>el('dePhoto').click();
  el('dePhoto').onchange=async e=>{ const f=e.target.files[0]; if(!f)return; el('dePrev').innerHTML='<span class="small muted">กำลังย่อรูป…</span>';
    photoData=await compressImage(f,1024,0.7);
    el('dePrev').innerHTML=`<img src="${photoData}" style="width:100%;max-height:220px;object-fit:contain;border-radius:10px;border:1px solid var(--border)"><button class="btn btn-sm" id="deClr" style="margin-top:6px"><i data-lucide="x"></i>เอารูปออก</button>`; icons();
    el('deClr').onclick=()=>{ photoData=null; el('dePhoto').value=''; el('dePrev').innerHTML=''; }; };
  el('deCancel').onclick=m.close;
  el('deSave').onclick=async()=>{
    const amount=+el('deAmt').value||0; if(!amount){ toast('กรอกจำนวนเงิน','warn'); return; }
    const btn=el('deSave'); btn.disabled=true; btn.innerHTML='<i data-lucide="loader-2" style="animation:spin 1s linear infinite"></i>กำลังบันทึก…'; icons();
    let photoUrl=''; if(photoData){ try{ photoUrl=await uploadPOD(photoData); }catch(err){ toast('อัปโหลดรูปไม่สำเร็จ ('+err.message+') — บันทึกต่อโดยไม่มีรูป','warn'); } }
    const data={ RouteID:active?active.RouteID:'', ExpenseType:el('deType').value, Amount:amount, Description:el('deNote').value.trim(), ExpenseDate:Store.date, ReceiptImageURL:photoUrl };
    try{ await API.post('createExpense',{data,user:sess.emp.EmployeeName}); m.close(); toast('บันทึกค่าใช้จ่ายแล้ว','ok'); }
    catch(err){ toast(err.message,'err'); btn.disabled=false; btn.innerHTML='<i data-lucide="check"></i>บันทึก'; icons(); }
  };
}
/* ---- ถ่ายรูปหลักฐานการส่ง (POD) ---- */
function compressImage(file, maxW, q){
  return new Promise(res=>{ const rd=new FileReader();
    rd.onload=()=>{ const img=new Image(); img.onload=()=>{ const s=Math.min(1,maxW/img.width);
      const c=document.createElement('canvas'); c.width=Math.round(img.width*s); c.height=Math.round(img.height*s);
      c.getContext('2d').drawImage(img,0,0,c.width,c.height); res(c.toDataURL('image/jpeg',q)); };
      img.onerror=()=>res(rd.result); img.src=rd.result; };
    rd.readAsDataURL(file); });
}
async function uploadPOD(dataUrl){ const r=await API.post('uploadPOD',{base64:dataUrl,filename:'POD-'+Date.now()+'.jpg'}); return r.url||r.viewUrl||''; }
function podModal(type, active, cur, token){
  const isFail=type==='fail'; let photoData=null;
  const m=modal({ title:(isFail?'บันทึกส่งไม่สำเร็จ':'ยืนยันส่งเสร็จ')+' — '+esc(cur.CustomerName), body:`
    <div class="notice info" style="margin-bottom:12px"><i data-lucide="map-pin"></i><div>${esc(cur.BranchName||'')} · ${int(cur.BoxQty)} กล่อง</div></div>
    ${isFail?`<div class="field"><label class="label">เหตุผลที่ส่งไม่สำเร็จ *</label><textarea class="textarea" id="podReason" placeholder="เช่น ร้านปิด / ลูกค้าไม่รับ / ที่อยู่ผิด"></textarea></div>`:''}
    <div class="field" style="margin:0"><label class="label">รูปหลักฐาน (หน้าร้าน / ลายเซ็น / พัสดุ)</label>
      <input type="file" accept="image/*" capture="environment" id="podFile" style="display:none">
      <button class="btn btn-block" id="podPick" type="button"><i data-lucide="camera"></i>ถ่าย / เลือกรูป</button>
      <div id="podPrev" style="margin-top:10px"></div></div>
  `, foot:`<button class="btn" id="podCancel">ยกเลิก</button><button class="btn ${isFail?'btn-danger':'btn-primary'}" id="podOk"><i data-lucide="check"></i>${isFail?'บันทึก':'ยืนยันส่งเสร็จ'}</button>` });
  el('podPick').onclick=()=>el('podFile').click();
  el('podFile').onchange=async e=>{ const f=e.target.files[0]; if(!f)return; el('podPrev').innerHTML='<span class="small muted">กำลังย่อรูป…</span>';
    photoData=await compressImage(f,1024,0.7);
    el('podPrev').innerHTML=`<img src="${photoData}" style="width:100%;max-height:240px;object-fit:contain;border-radius:10px;border:1px solid var(--border)"><button class="btn btn-sm" id="podClr" style="margin-top:6px"><i data-lucide="x"></i>เอารูปออก</button>`; icons();
    el('podClr').onclick=()=>{ photoData=null; el('podFile').value=''; el('podPrev').innerHTML=''; }; };
  el('podCancel').onclick=m.close;
  el('podOk').onclick=async()=>{
    const reason=isFail?el('podReason').value.trim():''; if(isFail&&!reason){ toast('ใส่เหตุผลก่อน','warn'); return; }
    const btn=el('podOk'); btn.disabled=true; btn.innerHTML='<i data-lucide="loader-2" style="animation:spin 1s linear infinite"></i>กำลังบันทึก…'; icons();
    let photoUrl=''; if(photoData){ try{ photoUrl=await uploadPOD(photoData); }catch(err){ toast('อัปโหลดรูปไม่สำเร็จ ('+err.message+') — บันทึกต่อโดยไม่มีรูป','warn'); } }
    try{
      if(isFail) await API.post('failDelivery',{routeId:active.RouteID,stopOrder:cur.StopOrder,deliveryId:cur.DeliveryID,reason,photoUrl,token});
      else       await API.post('completeDelivery',{routeId:active.RouteID,stopOrder:cur.StopOrder,deliveryId:cur.DeliveryID,photoUrl,token});
      m.close(); render(); toast((isFail?'บันทึกส่งไม่สำเร็จ':'บันทึกส่งสำเร็จ')+(photoUrl?' + แนบรูป':''), isFail?'warn':'ok');
    }catch(err){ toast(err.message,'err'); btn.disabled=false; btn.innerHTML='<i data-lucide="check"></i>'+(isFail?'บันทึก':'ยืนยันส่งเสร็จ'); icons(); }
  };
}
function doCheckin(route, stop, token){
  if(!navigator.geolocation){ toast('อุปกรณ์ไม่รองรับ GPS','err'); return; }
  toast('กำลังระบุตำแหน่ง…','info');
  navigator.geolocation.getCurrentPosition(async pos=>{
    const {latitude,longitude,accuracy}=pos.coords;
    const dist = stop.Latitude? haversine(latitude,longitude,+stop.Latitude,+stop.Longitude)*1000 : 9999;
    const r = await API.post('checkIn',{routeId:route.RouteID,stopOrder:stop.StopOrder,deliveryId:stop.DeliveryID,lat:latitude,lng:longitude,accuracy,distanceMeters:dist,token});
    const msg = {GREEN:'🟢 ถึงจุดส่งแล้ว',YELLOW:'🟡 ใกล้จุดส่ง',RED:'🔴 ยังไม่ถึงจุดส่ง'}[r.proximity]||'Check-in สำเร็จ';
    toast(msg+' (ห่าง '+Math.round(dist)+' ม.)', r.proximity==='GREEN'?'ok':(r.proximity==='YELLOW'?'warn':'err'));
  }, err=>toast('ระบุตำแหน่งไม่ได้: '+err.message,'err'), {enableHighAccuracy:true,timeout:10000});
}
