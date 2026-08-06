/* ================================================================
   PAGES — registers into ROUTES (defined in app.js)
   ================================================================ */
'use strict';

async function refresh(){ await loadBootstrap(); render(); }
function page(view, html){ view.innerHTML = html; icons(); }
function head(title, sub, right){ return `<div class="page-head"><div><div class="page-title">${esc(title)}</div>${sub?`<div class="page-sub">${sub}</div>`:''}</div>${right?`<div class="flex gap8 wrap aic">${right}</div>`:''}</div>`; }
function matchSearch(obj, fields){ if(!Store.search) return true; return fields.some(f=>String(obj[f]||'').toLowerCase().includes(Store.search)); }

/* ================================================================
   DASHBOARD
   ================================================================ */
ROUTES.dashboard = async function(view){
  const dash = Store.data.dashboard || {};
  const k = dash.kpi || {}; const c = dash.cost || {};
  const g = s => (k[s] && k[s].count) || 0;
  const tot = g('total'), done = g('completed'), failed = g('failed');
  const pending = Math.max(0, tot - done - failed);
  const dels = Store.data.deliveries || [];
  const todo = dels.filter(d=>['Draft','Planned','Assigned','In Progress'].includes(d.Status));
  const stat = (label,val,unit,color,icon,sub)=>`<div class="card" style="padding:18px 20px;display:flex;flex-direction:column;gap:7px">
      <div class="flex aic gap8"><span style="width:38px;height:38px;border-radius:11px;background:${color}1a;color:${color};display:flex;align-items:center;justify-content:center"><i data-lucide="${icon}"></i></span>
        <span class="small muted">${label}</span></div>
      <div style="font-size:30px;font-weight:800;line-height:1.05" class="tab">${val}<span style="font-size:14px;font-weight:600;color:#9AA3B2;margin-left:5px">${unit||''}</span></div>
      ${sub?`<div class="small muted">${sub}</div>`:'<div class="small muted">&nbsp;</div>'}</div>`;
  page(view, `
    ${head('หน้าหลัก', thDate(Store.date), '<button class="btn btn-sm" data-act="sync"><i data-lucide="refresh-cw"></i>รีเฟรช</button>')}
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(175px,1fr));gap:14px;margin-bottom:18px">
      ${stat('งานวันนี้', int(tot), 'งาน', '#2563EB','package', int((k.total&&k.total.boxes)||0)+' กล่อง')}
      ${stat('ส่งแล้ว', int(done), 'งาน', '#10B981','check-circle-2')}
      ${stat('ค้างส่ง', int(pending), 'งาน', '#F59E0B','clock')}
      ${stat('ค่าใช้จ่ายวันนี้', money(c.total||0), 'บาท', '#7C3AED','wallet')}
    </div>
    <div class="card">
      <div class="flex between aic wrap gap8 mb14"><span class="h-card">งานที่ต้องส่งวันนี้ (${todo.length})</span>
        <a class="btn btn-primary" href="#/planning"><i data-lucide="route"></i>วางแผนส่ง</a></div>
      <div class="tbl-wrap">
      ${todo.length? `<table class="tbl"><thead><tr><th>ลูกค้า</th><th>สาขา / ที่อยู่</th><th class="r">กล่อง</th><th>Priority</th><th>สถานะ</th></tr></thead>
        <tbody>${todo.map(d=>`<tr><td class="strong">${esc(d.CustomerName)}</td><td class="muted small">${esc(d.BranchName||d.Address||'')}</td><td class="r tab">${int(d.BoxQty)}</td><td>${priBadge(d.Priority)}</td><td>${dstatusBadge(d.Status)}</td></tr>`).join('')}</tbody></table>`
        : emptyState('ไม่มีงานค้างส่ง','งานวันนี้ส่งครบแล้ว หรือยังไม่มีงานส่ง','<a class="btn btn-primary" href="#/deliveries"><i data-lucide="plus"></i>เพิ่มงานส่ง</a>')}
      </div>
    </div>
  `);
  const sy=view.querySelector('[data-act="sync"]'); if(sy) sy.onclick = async e=>{ e.target.closest('button').disabled=true; await loadBootstrap(); render(); toast('รีเฟรชข้อมูลแล้ว','ok'); };
};
function actIcon(a){ return {CREATE_DELIVERY:'package-plus',CREATE_ROUTE:'route',CREATE_CUSTOMER:'store',SYNC_CARTRACK:'satellite-dish',COMPLETE_DELIVERY:'check-circle-2',FAILED_DELIVERY:'x-circle',START_ROUTE:'play',CREATE_EXPENSE:'receipt',CREATE_CLAIM:'hand-coins',SEED:'database'}[a]||'activity'; }

/* ================================================================
   DELIVERIES
   ================================================================ */
ROUTES.deliveries = async function(view){
  const rows = (Store.data.deliveries||[]).filter(d=>matchSearch(d,['CustomerName','BranchName','InvoiceNo']));
  page(view, `
    ${head('งานส่งสินค้า', `${thDate(Store.date)} · ${int(rows.length)} รายการ`,
      `<button class="btn btn-sm" data-act="csv"><i data-lucide="download"></i>CSV</button>
       <button class="btn btn-primary" data-act="new"><i data-lucide="plus"></i>เพิ่มงานส่ง</button>`)}
    <div class="card" style="padding:0">
      <div class="tbl-wrap">
      ${rows.length? `<table class="tbl"><thead><tr><th>Priority</th><th>ลูกค้า</th><th>สาขา</th><th>เลขบิล</th><th class="r">กล่อง</th><th>Route</th><th>สถานะ</th><th class="r">จัดการ</th></tr></thead>
        <tbody>${rows.map(d=>`<tr>
          <td>${priBadge(d.Priority)}</td><td class="strong">${esc(d.CustomerName)}</td><td class="muted">${esc(d.BranchName)}</td>
          <td class="mono small">${esc(d.InvoiceNo||'—')}</td><td class="r tab">${int(d.BoxQty)}</td>
          <td>${d.RouteID?`<span class="mono small">${esc(d.RouteID)}</span>`:'<span class="muted small">—</span>'}</td>
          <td>${dstatusBadge(d.Status)}</td>
          <td class="r"><div class="flex gap8" style="justify-content:flex-end">
            ${d.Status==='Draft'?`<button class="btn btn-ghost btn-sm" data-dispatch="${esc(d.DeliveryID)}"><i data-lucide="truck"></i>จัดรถด่วน</button>`:''}
            <button class="btn btn-sm" data-edit="${esc(d.DeliveryID)}"><i data-lucide="pencil"></i></button>
            <button class="btn btn-sm" data-del="${esc(d.DeliveryID)}"><i data-lucide="trash-2"></i></button></div></td></tr>`).join('')}</tbody></table>`
        : emptyState('ยังไม่มีงานส่งในวันนี้','เพิ่มงานส่งใหม่ หรือเปลี่ยนวันที่','<button class="btn btn-primary" data-act="new2"><i data-lucide="plus"></i>เพิ่มงานส่ง</button>')}
      </div>
    </div>
  `);
  const openForm = (d)=>deliveryForm(d);
  view.querySelector('[data-act="new"]').onclick = ()=>openForm(null);
  const n2=view.querySelector('[data-act="new2"]'); if(n2) n2.onclick=()=>openForm(null);
  view.querySelector('[data-act="csv"]').onclick = ()=>Exporter.csv(rows,'deliveries_'+Store.date);
  $$('[data-edit]',view).forEach(b=>b.onclick=()=>openForm((Store.data.deliveries||[]).find(x=>x.DeliveryID===b.dataset.edit)));
  $$('[data-del]',view).forEach(b=>b.onclick=()=>confirmDialog('ลบงานส่งนี้? (ระบบใช้ soft-delete ข้อมูลจริงไม่ถูกลบ)',()=>{ deleteLocal('deliveries','deleteDelivery',b.dataset.del).then(()=>toast('ลบงานส่งแล้ว','ok')).catch(()=>{}); },{danger:true,yes:'ลบ'}));
  $$('[data-dispatch]',view).forEach(b=>b.onclick=()=>quickDispatch((Store.data.deliveries||[]).find(x=>x.DeliveryID===b.dataset.dispatch)));
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
  const rec=Planner.recommendVehicle(Number(d.BoxQty)||0)||Planner.availableVehicles()[0]||(Store.data.vehicles||[])[0];
  const emp=rec&&(Store.data.employees||[]).find(e=>e.VehicleID===rec.VehicleID);
  QD.type='COMPANY'; QD.vehId=rec?rec.VehicleID:''; QD.extId=((Store.data.externalVehicles||[])[0]||{}).ExternalVehicleID||'';
  QD.driver=rec?(rec.CurrentDriver||(emp&&emp.EmployeeName)||''):'';
  QD.toll=Planner.toll(); QD.parking=Planner.autoParking([d]);
  const m=modal({ title:'จัดรถด่วน — '+esc(d.CustomerName||''), body:`<div id="qdBody">${qdBody()}</div>`,
    foot:`<button class="btn" id="qdCancel">ยกเลิก</button><button class="btn btn-primary" id="qdSave"><i data-lucide="check-circle-2"></i>ยืนยัน & จ่ายรถ</button>` });
  QD.modal=m; el('qdCancel').onclick=m.close; el('qdSave').onclick=qdConfirm; qdBind();
  // อัปเกรดเป็นระยะทางถนนจริง (OSRM) เมื่อโหลดเสร็จ
  Planner.roadMetrics([QD.d]).then(road=>{ if(road && document.getElementById('qdBody')){ QD.m=road; qdRefresh(); } });
}
function qdBody(){
  const d=QD.d, m=QD.m, isExt=QD.type==='EXTERNAL', v=qdVehicle(), c=qdCost();
  const veh=Store.data.vehicles||[], ext=Store.data.externalVehicles||[], emps=Store.data.employees||[];
  const cap=v?Number(v.CapacityBox):0;
  const warn=(cap&&Number(d.BoxQty)>cap)?`<div class="notice warn" style="margin-bottom:10px"><i data-lucide="alert-triangle"></i><div>ความจุรถ ${int(cap)} กล่อง &lt; งาน ${int(d.BoxQty)} กล่อง</div></div>`:'';
  const noGeo=(!d.Latitude||!d.Longitude)?`<div class="notice info" style="margin-bottom:10px"><i data-lucide="info"></i><div>งานนี้ยังไม่มีพิกัด — ระยะทาง/ค่าน้ำมันจะเป็น 0 (แก้ที่อยู่เพื่อหาพิกัดก่อนได้)</div></div>`:'';
  const row=(l,x)=>`<div class="flex between" style="padding:4px 0;font-size:13px"><span class="muted">${l}</span><span class="tab">${money(x)}</span></div>`;
  return `
    <div class="notice info" style="margin-bottom:12px"><i data-lucide="package"></i><div><b>${esc(d.CustomerName)}</b>${d.BranchName?' · '+esc(d.BranchName):''}<br>${esc(d.Address||'')} · ${int(d.BoxQty)} กล่อง · ${priBadge(d.Priority)}</div></div>
    ${noGeo}
    <div class="field"><label class="label">ประเภทรถ</label>
      <div class="seg" id="qdType"><button class="${!isExt?'on':''}" data-t="COMPANY">รถบริษัท</button><button class="${isExt?'on':''}" data-t="EXTERNAL">รถภายนอก</button></div></div>
    <div class="field"><label class="label">เลือกรถ</label>
      ${isExt?`<select class="select" id="qdExt">${ext.length?ext.map(x=>`<option value="${esc(x.ExternalVehicleID)}" ${QD.extId===x.ExternalVehicleID?'selected':''}>${esc(x.ProviderName)} · ${esc(x.LicensePlate)} (${int(x.CapacityBox)} กล่อง)</option>`).join(''):'<option value="">— ไม่มีรถภายนอก —</option>'}</select>`
        :`<select class="select" id="qdVeh">${veh.map(x=>`<option value="${esc(x.VehicleID)}" ${QD.vehId===x.VehicleID?'selected':''}>${esc(x.VehicleName)} · ${esc(x.LicensePlate)} (${int(x.CapacityBox)} กล่อง)</option>`).join('')}</select>`}</div>
    <div class="field"><label class="label">คนขับ</label><input class="input" id="qdDriver" list="qdEmp" value="${esc(QD.driver)}" placeholder="ชื่อคนขับ"><datalist id="qdEmp">${emps.map(e=>`<option value="${esc(e.EmployeeName)}">`).join('')}</datalist></div>
    ${warn}
    <div style="border:1px solid var(--border);border-radius:11px;padding:14px">
      <div class="flex between" style="font-size:13px;margin-bottom:6px"><span class="muted">ระยะทาง (ไป-กลับคลัง)</span><span class="tab strong">${num1(m.distance)} กม.</span></div>
      ${row('ค่าน้ำมัน (Fuel)',c.fuel)}
      ${qdEdit('ค่าทางด่วน (Toll)','qdToll',Number(QD.toll)||0,'ใส่ 0 ถ้าไม่ขึ้นทางด่วน')}
      ${qdEdit('ค่าจอดรถ (Parking)','qdPark',Number(QD.parking)||0, Planner.isMall(d)?'ปลายทางเป็นห้าง':'ร้านเดี่ยว')}
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
    TotalStops:1, TotalBoxes:Number(d.BoxQty)||0, TotalDistance:m.distance, EstimatedDuration:m.durationMin,
    EstimatedFuelCost:c.fuel, EstimatedTollCost:c.toll, EstimatedParkingCost:c.parking, EstimatedExternalCost:c.external||0, EstimatedOtherCost:0, Status:'Planned' };
  const stops=[{ DeliveryID:d.DeliveryID, CustomerName:d.CustomerName, BranchName:d.BranchName, Address:d.Address, Latitude:d.Latitude, Longitude:d.Longitude, BoxQty:d.BoxQty, DistanceFromPrevious:m.distance }];
  QD.modal.close();
  toast('กำลังจ่ายรถ · '+money(c.total)+' ฿…','ok','จัดรถด่วนสำเร็จ');
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
      <div><label class="label">เลขบิล</label><input class="input" id="fInv" value="${esc(d.InvoiceNo||'')}"></div>
      <div><label class="label">จำนวนกล่อง</label><input class="input" type="number" id="fBox" value="${esc(d.BoxQty||'')}"></div></div>
    <div class="field"><label class="label">ที่อยู่ (ถ้าไม่ได้เลือกลูกค้า ระบบจะหาพิกัดจากที่อยู่นี้ให้)</label><input class="input" id="fAddr" value="${esc(d.Address||'')}"></div>
    <input type="hidden" id="fLat" value="${esc(d.Latitude||'')}"><input type="hidden" id="fLng" value="${esc(d.Longitude||'')}">
    <div id="fGeoStat"></div>
    <div class="field row2">
      <div><label class="label">Priority</label><select class="select" id="fPri">${Object.keys(PRIORITY).map(p=>`<option value="${p}" ${d.Priority===p?'selected':''}>${PRIORITY[p].label}</option>`).join('')}</select></div>
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
    const data = { CustomerName:el('fName').value.trim(), BranchName:el('fBranch').value.trim(), InvoiceNo:el('fInv').value.trim(),
      Address:el('fAddr').value.trim(), Latitude:+el('fLat').value||'', Longitude:+el('fLng').value||'', BoxQty:+el('fBox').value||0,
      Priority:el('fPri').value, Status:el('fStatus').value, Note:el('fNote').value.trim(), DeliveryDate:Store.date };
    m.close();
    if(isEdit) updateLocal('deliveries','updateDelivery',d.DeliveryID,data).then(()=>toast('แก้ไขงานส่งแล้ว','ok')).catch(()=>{});
    else       createLocal('deliveries','createDelivery',data).then(()=>toast('เพิ่มงานส่งแล้ว','ok')).catch(()=>{});
  };
}

/* ================================================================
   ROUTE PLANNING — DECISION CENTER  ★
   ================================================================ */
const Plan = { selected:new Set(), result:null, chosen:null, sel:{type:'COMPANY',vehId:'',extId:'',driver:'',driverEmployeeId:''}, splitSel:[], map:null, layer:null };
ROUTES.planning = async function(view){
  const pending = (Store.data.deliveries||[]).filter(d=>['Draft','Planned'].includes(d.Status));
  const drafts = pending.filter(d=>d.Latitude && d.Longitude);   // มีพิกัด → จัด Route ได้
  const noGeo  = pending.filter(d=>!(d.Latitude && d.Longitude)); // ยังไม่มีพิกัด → ต้องเพิ่มที่อยู่ก่อน
  // keep only valid selections
  Plan.selected = new Set([...Plan.selected].filter(id=>drafts.some(d=>d.DeliveryID===id)));
  const selCount = Plan.selected.size;
  const selDels = drafts.filter(d=>Plan.selected.has(d.DeliveryID));
  const selBoxes = selDels.reduce((n,d)=>n+(+d.BoxQty||0),0);

  page(view, `
    ${head('วางแผนส่ง', `${thDate(Store.date)} · เลือก ${selCount} จุด · ${int(selBoxes)} กล่อง`)}
    <div class="grid plan-3" style="grid-template-columns:320px 1fr 380px;gap:16px;align-items:start">

      <!-- LEFT: deliveries -->
      <div class="card" style="padding:14px">
        <div class="flex between aic mb14"><span class="h-card">งานรอจัด (${pending.length})</span>
          <button class="btn btn-sm" id="selAll">${selCount===drafts.length&&drafts.length?'ล้าง':'เลือกทั้งหมด'}</button></div>
        <div style="max-height:520px;overflow-y:auto" class="scrolly">
        ${pending.length? drafts.map(d=>`<div class="check-item ${Plan.selected.has(d.DeliveryID)?'on':''}" data-pick="${esc(d.DeliveryID)}">
          <div class="cbx"><i data-lucide="check"></i></div>
          <div style="flex:1;min-width:0"><div class="strong" style="font-size:13px">${esc(d.CustomerName)}</div>
            <div class="small muted" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(d.BranchName||d.InvoiceNo||'')}</div></div>
          <div style="text-align:right"><div class="tab strong" style="font-size:13px">${int(d.BoxQty)}</div>${priBadge(d.Priority)}</div>
        </div>`).join('') + noGeo.map(d=>`<div class="check-item" style="border-color:#FCE9BD;background:var(--amber-soft)" data-fixgeo="${esc(d.DeliveryID)}">
          <div class="cbx" style="border-color:#F59E0B;background:transparent"><i data-lucide="map-pin-off" style="width:13px;height:13px;color:#B45309;opacity:1"></i></div>
          <div style="flex:1;min-width:0"><div class="strong" style="font-size:13px">${esc(d.CustomerName)}</div>
            <div class="small" style="color:#B45309">ไม่มีพิกัด · แตะเพื่อเพิ่มที่อยู่</div></div>
          <div class="tab strong" style="font-size:13px">${int(d.BoxQty)}</div>
        </div>`).join('') : emptyState('ไม่มีงานรอจัด','เพิ่มงานส่งก่อน')}
        </div>
        ${noGeo.length?`<div class="small" style="color:#B45309;margin-top:10px"><i data-lucide="alert-triangle" style="width:13px;height:13px;vertical-align:-2px"></i> ${noGeo.length} งานยังไม่มีพิกัด — แตะเพื่อเพิ่มที่อยู่ (ระบบหาพิกัดให้อัตโนมัติ)</div>`:''}
      </div>

      <!-- CENTER: map -->
      <div class="card" style="padding:14px">
        <div class="flex between aic mb14"><span class="h-card">แผนที่ & ลำดับจุดส่ง</span>
          <span class="small muted">🏭 คลัง · 📍 จุดส่ง · 🚚 รถ</span></div>
        <div id="planMap" class="map" style="height:520px"></div>
      </div>

      <!-- RIGHT: decision -->
      <div class="card" id="decision" style="padding:16px">
        ${decisionInitial(selCount, selBoxes)}
      </div>
    </div>
  `);

  // map
  setTimeout(()=>{ if(!el('planMap'))return; const wh=warehouse(); Plan.map=MapUtil.make('planMap',wh); Plan.layer=L.layerGroup().addTo(Plan.map); drawPlanMap(selDels); },60);

  // events
  $$('[data-pick]',view).forEach(it=>it.onclick=()=>{ const id=it.dataset.pick; if(Plan.selected.has(id))Plan.selected.delete(id); else Plan.selected.add(id); Plan.result=null; render(); });
  $$('[data-fixgeo]',view).forEach(it=>it.onclick=()=>deliveryForm((Store.data.deliveries||[]).find(x=>x.DeliveryID===it.dataset.fixgeo)));
  el('selAll').onclick=()=>{ if(Plan.selected.size===drafts.length){Plan.selected.clear();} else drafts.forEach(d=>Plan.selected.add(d.DeliveryID)); Plan.result=null; render(); };
  const auto=el('autoPlan'); if(auto) auto.onclick=runAutoPlan;
  bindDecisionEvents();
};
function decisionInitial(count, boxes){
  const avail=(Store.data.vehicles||[]).filter(v=>v.VehicleStatus==='Available');
  const cap=avail.reduce((n,v)=>n+(+v.CapacityBox||0),0);
  return `
    <div class="h-card mb14">วางแผนส่ง</div>
    <div class="notice info mb14"><i data-lucide="info"></i><div>เลือกงานส่งทางซ้าย แล้วกด <b>จัดเส้นทางอัตโนมัติ</b> ระบบจะเรียงลำดับจุดส่ง คำนวณระยะทาง เวลา และแนะนำรถให้</div></div>
    <div style="display:flex;flex-direction:column;gap:8px">
      ${miniStat('จุดส่งที่เลือก', count+' จุด','map-pin')}
      ${miniStat('จำนวนกล่อง', int(boxes)+' กล่อง','box')}
      ${miniStat('รถบริษัทพร้อมใช้', avail.length+' คัน · '+int(cap)+' กล่อง','truck')}
    </div>
    <button class="btn btn-primary btn-block btn-lg mt16" id="autoPlan" ${count?'':'disabled'}><i data-lucide="brain-circuit"></i>จัดเส้นทางอัตโนมัติ</button>`;
}
function miniStat(l,v,ic){ return `<div class="flex between aic" style="padding:11px 13px;border:1px solid var(--border);border-radius:10px">
  <span class="flex aic gap8"><i data-lucide="${ic}" style="width:18px;height:18px;color:#6B7383"></i><span class="small muted">${l}</span></span>
  <span class="strong tab">${v}</span></div>`; }

const SPLIT_COLORS=['#6f9e0a','#2563EB','#DB2777','#D97706','#7C3AED','#0891B2'];
function drawPlanMap(selDels, seq, splitGroups){
  if(!Plan.map) return; Plan.layer.clearLayers();
  const wh=warehouse();
  MapUtil.whMarker(Plan.layer, wh);
  (Store.data.vehicles||[]).filter(v=>v.CurrentLatitude).forEach(v=>{ const st=VSTATUS[v.VehicleStatus]||VSTATUS.Unknown; L.marker([+v.CurrentLatitude,+v.CurrentLongitude],{icon:L.divIcon({className:'veh-pin',html:`<div class="veh-dot" style="background:${st.dot}"><i data-lucide="truck"></i></div>`,iconSize:[28,28],iconAnchor:[14,14]})}).addTo(Plan.layer).bindPopup(esc(v.VehicleName)); });
  const pts=[[wh.lat,wh.lng]];
  if(splitGroups){
    splitGroups.forEach((g,gi)=>{
      const color=SPLIT_COLORS[gi%SPLIT_COLORS.length];
      g.seq.forEach((d,i)=>{ if(d.Latitude){ MapUtil.stopMarker(Plan.layer,d,i+1,color); pts.push([+d.Latitude,+d.Longitude]); } });
      const line=[[wh.lat,wh.lng],...g.seq.map(s=>[+s.Latitude,+s.Longitude]),[wh.lat,wh.lng]];
      L.polyline(line,{color,weight:4,opacity:.85}).addTo(Plan.layer);
    });
  } else {
    const list = seq || selDels;
    list.forEach((d,i)=>{ if(d.Latitude){ MapUtil.stopMarker(Plan.layer,d,i+1,(PRIORITY[d.Priority]||PRIORITY.NORMAL).color); pts.push([+d.Latitude,+d.Longitude]); } });
    if(seq){
      const geo = Plan.result && Plan.result.metrics && Plan.result.metrics.geometry;
      const line = (geo && geo.length) ? geo : [[wh.lat,wh.lng],...seq.map(s=>[+s.Latitude,+s.Longitude]),[wh.lat,wh.lng]];
      L.polyline(line,{color:'#6f9e0a',weight:4,opacity:.85}).addTo(Plan.layer);
    }
  }
  if(pts.length>1) Plan.map.fitBounds(pts,{padding:[30,30]});
  icons();
}

async function runAutoPlan(){
  const btn=el('autoPlan'); if(btn){btn.disabled=true; btn.innerHTML='<i data-lucide="loader-2" style="animation:spin 1s linear infinite"></i>กำลังวิเคราะห์…'; icons();}
  const drafts=(Store.data.deliveries||[]).filter(d=>Plan.selected.has(d.DeliveryID)&&d.Latitude);
  const seq=Planner.order(drafts);
  const road=await Planner.roadMetrics(seq);   // OSRM ถนนจริง (null ถ้าล่ม → ใช้เส้นตรง)
  const out=Planner.options(seq, road);
  Plan.result={seq,...out};
  // เลือกอัตโนมัติ: รถแนะนำ > Option ที่รองรับได้และถูกที่สุด > ตัวแรก
  const feasibleCheap = out.options.filter(o=>o.feasible).sort((a,b)=>a.cost.total-b.cost.total)[0];
  Plan.chosen = (out.options.find(o=>o.recommended) || feasibleCheap || out.options[0]).id;
  // ค่าเริ่มต้นสำหรับเลือกรถ/คนขับเอง
  const rec = Planner.recommendVehicle(out.metrics.boxes) || Planner.availableVehicles()[0] || (Store.data.vehicles||[])[0];
  const emp = rec && (Store.data.employees||[]).find(e=>e.VehicleID===rec.VehicleID);
  Plan.sel = { type:'COMPANY', vehId: rec?rec.VehicleID:'', extId:(Planner.availableExternal()[0]||{}).ExternalVehicleID||'',
    driver: rec?(rec.CurrentDriver || (emp&&emp.EmployeeName) || ''):'',
    driverEmployeeId: emp ? emp.EmployeeID : empIdByName(rec&&rec.CurrentDriver),
    toll: Planner.toll(), parking: Planner.autoParking(seq) };
  drawPlanMap(null,seq);
  renderDecision();
}
function renderDecision(){
  const dec=el('decision'); if(!dec||!Plan.result) return;
  const {seq,metrics:m,options}=Plan.result;
  const rec=Planner.recommendVehicle(m.boxes);
  const wh=warehouse();
  const isSplit = Plan.chosen==='C';
  const splitOpt = isSplit ? options.find(o=>o.id==='C') : null;
  const seqHtml = isSplit
    ? splitOpt.split.map((g,gi)=>`<div class="strong small" style="margin:10px 0 4px;color:${SPLIT_COLORS[gi%SPLIT_COLORS.length]}">Route ${gi+1} · ${g.seq.length} จุด</div>` +
        g.seq.map((s,i)=>`<div class="flex aic gap8" style="padding:7px 0;border-bottom:1px solid #F3F5F8">
          <span class="stop-num" style="width:24px;height:24px;font-size:12px;background:${SPLIT_COLORS[gi%SPLIT_COLORS.length]}">${i+1}</span>
          <span style="flex:1;font-size:13px" class="strong">${esc(s.CustomerName)}</span>
          <span class="small muted">${num1(s._distPrev||0)} กม.</span><span class="tab small">${int(s.BoxQty)} กล่อง</span></div>`).join('')).join('')
    : seq.map((s,i)=>`<div class="flex aic gap8" style="padding:7px 0;border-bottom:1px solid #F3F5F8">
        <span class="stop-num" style="width:24px;height:24px;font-size:12px;background:${(PRIORITY[s.Priority]||PRIORITY.NORMAL).color}">${i+1}</span>
        <span style="flex:1;font-size:13px" class="strong">${esc(s.CustomerName)}</span>
        <span class="small muted">${num1(s._distPrev||0)} กม.</span><span class="tab small">${int(s.BoxQty)} กล่อง</span></div>`).join('');

  if(isSplit) drawPlanMap(null,null,splitOpt.split); else drawPlanMap(null,seq);

  dec.innerHTML = `
    <div class="flex between aic mb14"><span class="h-card">ผลการวางแผน</span><button class="btn btn-sm" id="replan"><i data-lucide="rotate-cw"></i>ใหม่</button></div>
    <div class="grid" style="grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">
      ${miniStat('จุดส่ง',m.stops+' จุด','map-pin')}
      ${miniStat('กล่อง',int(m.boxes),'box')}
      ${miniStat('ระยะทาง',num1(m.distance)+' กม.','navigation')}
      ${miniStat('เวลา',Math.floor(m.durationMin/60)+':'+String(m.durationMin%60).padStart(2,'0')+' ชม.','clock')}
    </div>
    <div class="small" style="margin:-6px 0 12px;color:${m.source==='osrm'?'#4F7A0A':'#9AA3B2'}">${m.source==='osrm'?'📍 ระยะทาง/เวลา ตามถนนจริง (OSRM)':'📏 ระยะทางเส้นตรงโดยประมาณ'}</div>

    ${rec?`<div class="opt reco mb14">
      <div class="opt-head"><span class="flex aic gap8"><i data-lucide="star" style="width:18px;height:18px;color:#059669"></i><span class="opt-name">รถที่แนะนำ</span></span><span class="badge b-green">RECOMMENDED</span></div>
      <div class="flex between aic"><div><div class="strong">${esc(rec.VehicleName)}</div><div class="small muted mono">${esc(rec.LicensePlate)}</div></div>
        <div style="text-align:right"><div>${vstatusBadge(rec.VehicleStatus)}</div><div class="small muted mt16" style="margin-top:4px">ห่างคลัง ${num1(rec._distWh||0)} กม. · จุ ${int(rec.CapacityBox)} กล่อง</div></div></div>
    </div>`:`<div class="notice warn mb14"><i data-lucide="alert-triangle"></i><div>ไม่มีรถบริษัทคันเดียวที่รับงานทั้งหมดได้ — พิจารณา Option ด้านล่าง</div></div>`}

    ${options.length>1?`<details style="margin-bottom:14px"><summary style="cursor:pointer;font-size:13px;font-weight:600;color:#5f7a00;padding:7px 0;list-style:none">⚙️ ตัวเลือกเส้นทางเพิ่มเติม (${options.length}) — แตะเพื่อเปรียบเทียบ</summary>
      <div style="display:flex;flex-direction:column;gap:10px;margin-top:10px">${options.map(o=>optionCard(o)).join('')}</div></details>`:''}

    <div class="strong small muted" style="margin-bottom:8px">ลำดับจุดส่งที่แนะนำ</div>
    <div style="max-height:170px;overflow-y:auto;margin-bottom:12px" class="scrolly">${seqHtml}</div>

    <div id="selFormBox">${isSplit ? splitFormAll(splitOpt) : selForm()}</div>
    <div id="costBox">${isSplit ? splitCostBoxAll(splitOpt) : selCostBox()}</div>

    <button class="btn btn-primary btn-block btn-lg mt16" id="confirmRoute"><i data-lucide="check-circle-2"></i>${isSplit?`ยืนยันการส่งทั้งหมด (${splitOpt.split.length} Route)`:'ยืนยันการส่ง'}</button>
  `;
  icons();
  bindDecisionEvents();
}
function optionCard(o){
  const sel = Plan.chosen===o.id;
  return `<div class="opt ${sel?'sel':''} ${o.feasible?'':''}" data-opt="${o.id}">
    <div class="opt-head"><span class="opt-name">OPTION ${o.id} · ${esc(o.name)}</span>
      ${o.feasible?`<span class="badge b-blue">${money(o.cost.total)} ฿</span>`:`<span class="badge b-red">ไม่เพียงพอ</span>`}</div>
    <div class="small muted" style="margin-bottom:6px">${esc(o.note)}</div>
    <div class="flex gap12 small" style="color:#4B5363">
      <span><i data-lucide="truck" style="width:13px;height:13px;vertical-align:-2px"></i> ${o.vehicles.filter(Boolean).length} คัน</span>
      <span><i data-lucide="navigation" style="width:13px;height:13px;vertical-align:-2px"></i> ${num1(o.distance)} กม.</span>
      <span><i data-lucide="box" style="width:13px;height:13px;vertical-align:-2px"></i> ${int(o.boxes)} กล่อง</span>
    </div>
    ${!o.feasible&&o.shortage?`<div class="mt16" style="margin-top:10px"><div class="progress"><span style="width:${Math.min(100,100* (o.boxes-o.shortage)/o.boxes)}%;background:#2563EB"></span><span style="width:${100*o.shortage/o.boxes}%;background:#EF4444"></span></div><div class="small" style="color:#B91C1C;margin-top:4px">ขาดความจุ ${int(o.shortage)} กล่อง</div></div>`:''}
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
  const emps=Store.data.employees||[], veh=Store.data.vehicles||[], ext=Store.data.externalVehicles||[];
  const drivers=emps.filter(x=>x.Role==='DRIVER'&&!x.IsDeleted);
  const isExt=Plan.sel.type==='EXTERNAL';
  return `<div style="border:1px solid var(--border);border-radius:11px;padding:14px;margin-bottom:12px">
    <div class="strong" style="margin-bottom:10px">รถ & คนขับที่จะใช้</div>
    <div class="seg" id="selType" style="margin-bottom:10px">
      <button class="${!isExt?'on':''}" data-t="COMPANY">รถบริษัท</button>
      <button class="${isExt?'on':''}" data-t="EXTERNAL">รถภายนอก</button></div>
    <div class="field" style="margin-bottom:10px"><label class="label">เลือกรถ</label>
      ${isExt
        ? `<select class="select" id="selExt">${ext.length?ext.map(v=>`<option value="${esc(v.ExternalVehicleID)}" ${Plan.sel.extId===v.ExternalVehicleID?'selected':''}>${esc(v.ProviderName)} · ${esc(v.LicensePlate)} (${int(v.CapacityBox)} กล่อง · ${money(v.Rate)} ${RATE_TYPE[v.RateType]||''})</option>`).join(''):'<option value="">— ไม่มีรถภายนอก —</option>'}</select>`
        : `<select class="select" id="selVeh">${veh.map(v=>`<option value="${esc(v.VehicleID)}" ${Plan.sel.vehId===v.VehicleID?'selected':''}>${esc(v.VehicleName)} · ${esc(v.LicensePlate)} (${int(v.CapacityBox)} กล่อง · ${VSTATUS[v.VehicleStatus]?VSTATUS[v.VehicleStatus].label:''})</option>`).join('')}</select>`}
    </div>
    <div class="field" style="margin-bottom:8px"><label class="label">คนขับ (เลือกจากระบบให้เข้าโหมดคนขับได้)</label>
      <select class="select" id="selDriverEmp">
        <option value="">— พิมพ์ชื่อเอง / คนขับรถภายนอก —</option>
        ${drivers.map(dr=>`<option value="${esc(dr.EmployeeID)}" ${Plan.sel.driverEmployeeId===dr.EmployeeID?'selected':''}>${esc(dr.EmployeeName)}</option>`).join('')}
      </select></div>
    <div class="field" style="margin:0">
      <input class="input" id="selDriver" value="${esc(Plan.sel.driver)}" placeholder="ชื่อคนขับ">
    </div>
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
  const cap=v?Number(v.CapacityBox):0;
  const warn = (cap && m.boxes>cap) ? `<div class="notice warn" style="margin-bottom:10px"><i data-lucide="alert-triangle"></i><div>ความจุรถ ${int(cap)} กล่อง &lt; งาน ${int(m.boxes)} กล่อง (เกิน ${int(m.boxes-cap)}) — ควรเพิ่มรถหรือแบ่งรอบ</div></div>` : '';
  const mallN = (Plan.result.seq||[]).filter(s=>Planner.isMall(s)).length;
  const row=(l,x)=>`<div class="flex between" style="padding:5px 0;font-size:13px"><span class="muted">${l}</span><span class="tab">${money(x)}</span></div>`;
  const editRow=(l,id,val,hint)=>`<div class="flex between aic" style="padding:4px 0"><span class="muted" style="font-size:13px">${l}${hint?` <span class="small" style="color:#9AA3B2">${hint}</span>`:''}</span>
    <span class="flex aic" style="gap:4px"><input class="input" id="${id}" type="number" value="${val}" style="width:96px;height:32px;text-align:right;padding:0 8px"><span class="small muted">฿</span></span></div>`;
  return `${warn}<div style="border:1px solid var(--border);border-radius:11px;padding:14px">
    <div class="strong mb14">สรุปต้นทุน Route <span class="small muted">(แก้ทางด่วน/ค่าจอดได้)</span></div>
    ${row('ค่าน้ำมัน (Fuel) · '+num1(m.distance)+' กม.', c.fuel)}
    ${editRow('ค่าทางด่วน (Toll)','selToll',Number(Plan.sel.toll)||0,'ใส่ 0 ถ้าไม่ขึ้นทางด่วน')}
    ${editRow('ค่าจอดรถ (Parking)','selPark',Number(Plan.sel.parking)||0, mallN?`ห้าง ${mallN} จุด`:'ร้านเดี่ยว')}
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
  const veh=Store.data.vehicles||[], emps=Store.data.employees||[];
  const drivers=emps.filter(x=>x.Role==='DRIVER'&&!x.IsDeleted);
  const sel = Plan.splitSel[i] || {};
  return `<div style="border:1px solid var(--border);border-radius:11px;padding:14px;margin-bottom:12px;border-left:4px solid ${SPLIT_COLORS[i%SPLIT_COLORS.length]}">
    <div class="strong" style="margin-bottom:10px">Route ${i+1} · ${g.seq.length} จุด · ${num1(g.m.distance)} กม.</div>
    <div class="field" style="margin-bottom:10px"><label class="label">เลือกรถ</label>
      <select class="select" data-splitveh="${i}">${veh.map(v=>`<option value="${esc(v.VehicleID)}" ${sel.vehId===v.VehicleID?'selected':''}>${esc(v.VehicleName)} · ${esc(v.LicensePlate)} (${int(v.CapacityBox)} กล่อง · ${VSTATUS[v.VehicleStatus]?VSTATUS[v.VehicleStatus].label:''})</option>`).join('')}</select></div>
    <div class="field" style="margin-bottom:8px"><label class="label">คนขับ (เลือกจากระบบให้เข้าโหมดคนขับได้)</label>
      <select class="select" data-splitdrvemp="${i}">
        <option value="">— พิมพ์ชื่อเอง —</option>
        ${drivers.map(dr=>`<option value="${esc(dr.EmployeeID)}" ${sel.driverEmployeeId===dr.EmployeeID?'selected':''}>${esc(dr.EmployeeName)}</option>`).join('')}
      </select></div>
    <div class="field" style="margin:0"><input class="input" data-splitdrv="${i}" value="${esc(sel.driver||'')}" placeholder="ชื่อคนขับ"></div>
  </div>`;
}
function splitFormAll(opt){
  return opt.split.map((g,i)=>splitForm(g,i)).join('');
}
function splitCost(g,i){
  const sel=Plan.splitSel[i]||{};
  const v=(Store.data.vehicles||[]).find(x=>x.VehicleID===sel.vehId);
  const fuel=v?Planner.fuelCost(g.m.distance,v):0, toll=Number(sel.toll)||0, parking=Number(sel.parking)||0;
  return { fuel, toll, parking, total:+(fuel+toll+parking).toFixed(2) };
}
function splitCostBoxAll(opt){
  const rows = opt.split.map((g,i)=>{ const c=splitCost(g,i); return `<div class="flex between" style="padding:5px 0;font-size:13px"><span class="muted">Route ${i+1}</span><span class="tab">${money(c.total)} ฿</span></div>`; }).join('');
  const total = opt.split.reduce((n,g,i)=>n+splitCost(g,i).total,0);
  return `<div style="border:1px solid var(--border);border-radius:11px;padding:14px">
    <div class="strong mb14">สรุปต้นทุนรวม (${opt.split.length} Route)</div>
    ${rows}
    <div class="divider"></div>
    <div class="flex between" style="font-size:15px"><span class="strong">ต้นทุนรวมทั้งหมด</span><span class="strong tab" style="color:var(--brand-ink)">${money(total)} ฿</span></div>
  </div>`;
}
function empIdByName(name){ const emp=(Store.data.employees||[]).find(x=>x.EmployeeName===name); return emp?emp.EmployeeID:''; }
function splitSelFor(g){ const driver=(g.v&&g.v.CurrentDriver)||''; return { vehId:g.v?g.v.VehicleID:'', driver, driverEmployeeId:empIdByName(driver), toll:Planner.toll(), parking:Planner.autoParking(g.seq) }; }
function bindDecisionEvents(){
  const rp=el('replan'); if(rp) rp.onclick=()=>{ Plan.result=null; render(); };
  // คลิก Option → เติมค่าในฟอร์มเลือกรถ (Option C = โหมดแบ่งหลาย Route)
  $$('[data-opt]').forEach(c=>c.onclick=()=>{ const o=Plan.result.options.find(x=>x.id===c.dataset.opt); Plan.chosen=c.dataset.opt;
    if(o){ if(o.id==='C'){ Plan.splitSel = o.split.map(splitSelFor); }
      else if(o.id==='B'&&o.external){ Plan.sel.type='EXTERNAL'; Plan.sel.extId=o.external.ExternalVehicleID; }
      else { Plan.sel.type='COMPANY'; const v=o.vehicles.filter(Boolean)[0]; if(v){ Plan.sel.vehId=v.VehicleID; Plan.sel.driver=v.CurrentDriver||Plan.sel.driver; } } }
    renderDecision(); });
  // ปุ่ม −/+ จำนวนคันใน Option C — คำนวณกลุ่มใหม่ทันที
  $$('[data-ksplit]').forEach(b=>b.onclick=(e)=>{
    e.stopPropagation();
    const opt=Plan.result.options.find(o=>o.id==='C'); if(!opt) return;
    const newK=Math.min(Math.max(opt.split.length+Number(b.dataset.ksplit),1),opt.kMax);
    if(newK===opt.split.length) return;
    const vehicles=Planner.availableVehicles().slice().sort((a,b2)=>Number(b2.CapacityBox)-Number(a.CapacityBox)).slice(0,newK);
    const groups=Planner.autoSplit(Plan.result.seq, vehicles);
    opt.split=groups; opt.vehicles=groups.map(g=>g.v);
    opt.distance=+groups.reduce((n,g)=>n+g.m.distance,0).toFixed(1);
    opt.duration=Math.max(...groups.map(g=>g.m.durationMin));
    const cFuel=groups.reduce((n,g)=>n+g.cost.fuel,0), cToll=groups.reduce((n,g)=>n+g.cost.toll,0), cPark=groups.reduce((n,g)=>n+g.cost.parking,0);
    opt.cost={ fuel:+cFuel.toFixed(2), toll:cToll, parking:cPark, external:0, other:0, total:+(cFuel+cToll+cPark).toFixed(2) };
    opt.name=`แบ่งเป็น ${groups.length} Route (ตามพื้นที่)`;
    opt.note=groups.map((g,i)=>`Route ${i+1}: ${g.seq.length} จุด · ${num1(g.m.distance)} กม.`).join(' · ');
    if(Plan.chosen==='C') Plan.splitSel=groups.map(splitSelFor);
    renderDecision();
  });
  const st=el('selType'); if(st) $$('#selType button').forEach(b=>b.onclick=()=>{ Plan.sel.type=b.dataset.t;
    if(b.dataset.t==='EXTERNAL' && !Plan.sel.extId){ const e=(Store.data.externalVehicles||[])[0]; Plan.sel.extId=e?e.ExternalVehicleID:''; }
    renderDecision(); });
  const sv=el('selVeh'); if(sv) sv.onchange=()=>{ Plan.sel.vehId=sv.value; const v=selVehicle();
    if(v&&v.CurrentDriver){ Plan.sel.driver=v.CurrentDriver; Plan.sel.driverEmployeeId=empIdByName(v.CurrentDriver);
      if(el('selDriver')) el('selDriver').value=v.CurrentDriver; if(el('selDriverEmp')) el('selDriverEmp').value=Plan.sel.driverEmployeeId; }
    refreshCostBox(); };
  const se=el('selExt'); if(se) se.onchange=()=>{ Plan.sel.extId=se.value; const v=selVehicle();
    if(v&&v.DriverName){ Plan.sel.driver=v.DriverName; Plan.sel.driverEmployeeId=''; if(el('selDriver')) el('selDriver').value=v.DriverName; }
    refreshCostBox(); };
  const sde=el('selDriverEmp'); if(sde) sde.onchange=()=>{ Plan.sel.driverEmployeeId=sde.value;
    if(sde.value){ const emp=(Store.data.employees||[]).find(x=>x.EmployeeID===sde.value); Plan.sel.driver=emp?emp.EmployeeName:''; if(el('selDriver')) el('selDriver').value=Plan.sel.driver; } };
  const sd=el('selDriver'); if(sd) sd.oninput=()=>{ Plan.sel.driver=sd.value; Plan.sel.driverEmployeeId=''; };
  bindCostInputs();
  // อินพุตรถ/คนขับต่อ Route ในโหมดแบ่งหลาย Route
  $$('[data-splitveh]').forEach(sel=>sel.onchange=()=>{ const i=Number(sel.dataset.splitveh); Plan.splitSel[i]=Plan.splitSel[i]||{}; Plan.splitSel[i].vehId=sel.value;
    const v=(Store.data.vehicles||[]).find(x=>x.VehicleID===sel.value);
    if(v&&v.CurrentDriver){ Plan.splitSel[i].driver=v.CurrentDriver; Plan.splitSel[i].driverEmployeeId=empIdByName(v.CurrentDriver);
      const de=document.querySelector('[data-splitdrvemp="'+i+'"]'); if(de) de.value=Plan.splitSel[i].driverEmployeeId;
      const di=document.querySelector('[data-splitdrv="'+i+'"]'); if(di) di.value=v.CurrentDriver; }
    const cb=el('costBox'); if(cb){ const opt=Plan.result.options.find(o=>o.id==='C'); cb.innerHTML=splitCostBoxAll(opt); icons(); } });
  $$('[data-splitdrvemp]').forEach(sel=>sel.onchange=()=>{ const i=Number(sel.dataset.splitdrvemp); Plan.splitSel[i]=Plan.splitSel[i]||{}; Plan.splitSel[i].driverEmployeeId=sel.value;
    if(sel.value){ const emp=(Store.data.employees||[]).find(x=>x.EmployeeID===sel.value); Plan.splitSel[i].driver=emp?emp.EmployeeName:'';
      const di=document.querySelector('[data-splitdrv="'+i+'"]'); if(di) di.value=Plan.splitSel[i].driver; } });
  $$('[data-splitdrv]').forEach(inp=>inp.oninput=()=>{ const i=Number(inp.dataset.splitdrv); Plan.splitSel[i]=Plan.splitSel[i]||{}; Plan.splitSel[i].driver=inp.value; Plan.splitSel[i].driverEmployeeId=''; });
  const cr=el('confirmRoute'); if(cr) cr.onclick=confirmRoute;
}
async function confirmRoute(){
  if(Plan.chosen==='C') return confirmSplitRoutes();
  const seq=Plan.result.seq, m=Plan.result.metrics;
  const isExt=Plan.sel.type==='EXTERNAL';
  const v=selVehicle();
  if(!v){ toast('กรุณาเลือกรถก่อน','warn'); return; }
  const c=selCost();
  const emps=Store.data.employees||[];
  const emp=!isExt && (emps.find(e=>e.EmployeeID===Plan.sel.driverEmployeeId) || emps.find(e=>e.VehicleID===v.VehicleID));
  const data={ DeliveryDate:Store.date, RouteType:isExt?'EXTERNAL_VEHICLE':'COMPANY_VEHICLE',
    DriverName: Plan.sel.driver || (isExt?v.DriverName:v.CurrentDriver) || '',
    DriverPhone: (emp&&emp.Phone) || (isExt?v.DriverPhone:'') || '',
    DriverEmployeeID: isExt?'':(Plan.sel.driverEmployeeId||''),
    VehicleType: v.VehicleType||'', VehicleName: isExt?'':(v.VehicleName||''),
    LicensePlate: v.LicensePlate||'', ProviderName: isExt?(v.ProviderName||''):'',
    TotalStops:m.stops, TotalBoxes:m.boxes, TotalDistance:m.distance, EstimatedDuration:m.durationMin,
    EstimatedFuelCost:c.fuel, EstimatedTollCost:c.toll, EstimatedParkingCost:c.parking,
    EstimatedExternalCost:c.external||0, EstimatedOtherCost:0, Status:'Planned' };
  const stops=seq.map(s=>({ DeliveryID:s.DeliveryID, CustomerName:s.CustomerName, BranchName:s.BranchName, Address:s.Address,
    Latitude:s.Latitude, Longitude:s.Longitude, BoxQty:s.BoxQty, DistanceFromPrevious:+(s._distPrev||0).toFixed(1) }));
  Plan.selected.clear(); Plan.result=null;
  toast('กำลังบันทึก Route · '+m.stops+' จุด…','ok','ยืนยัน Route แล้ว');
  location.hash='#/rounds';
  createRouteOptimistic('confirmRoute', data, stops).catch(()=>{});
}
async function confirmSplitRoutes(){
  const opt = Plan.result.options.find(o=>o.id==='C');
  if(!opt){ toast('ไม่พบแผนแบ่งเส้นทาง','err'); return; }
  const groups = opt.split;
  if(!Plan.splitSel.length || Plan.splitSel.some(s=>!s||!s.vehId)){ toast('กรุณาเลือกรถให้ครบทุก Route','warn'); return; }
  const emps = Store.data.employees||[];
  const jobs = groups.map((g,i)=>{
    const sel = Plan.splitSel[i];
    const v = (Store.data.vehicles||[]).find(x=>x.VehicleID===sel.vehId);
    const emp = emps.find(e=>e.EmployeeID===sel.driverEmployeeId) || (v && emps.find(e=>e.VehicleID===v.VehicleID));
    const fuel = v ? Planner.fuelCost(g.m.distance, v) : 0;
    const toll = Number(sel.toll)||0, parking = Number(sel.parking)||0;
    const data = { DeliveryDate:Store.date, RouteType:'COMPANY_VEHICLE',
      DriverName: sel.driver || (v&&v.CurrentDriver) || '', DriverPhone:(emp&&emp.Phone)||'',
      DriverEmployeeID: sel.driverEmployeeId||'',
      VehicleType:(v&&v.VehicleType)||'', VehicleName:(v&&v.VehicleName)||'', LicensePlate:(v&&v.LicensePlate)||'',
      TotalStops:g.m.stops, TotalBoxes:g.m.boxes, TotalDistance:g.m.distance, EstimatedDuration:g.m.durationMin,
      EstimatedFuelCost:fuel, EstimatedTollCost:toll, EstimatedParkingCost:parking, EstimatedExternalCost:0, EstimatedOtherCost:0, Status:'Planned' };
    const stops = g.seq.map(s=>({ DeliveryID:s.DeliveryID, CustomerName:s.CustomerName, BranchName:s.BranchName, Address:s.Address,
      Latitude:s.Latitude, Longitude:s.Longitude, BoxQty:s.BoxQty, DistanceFromPrevious:+(s._distPrev||0).toFixed(1) }));
    return { data, stops };
  });
  Plan.selected.clear(); Plan.result=null; Plan.splitSel=[];
  toast('กำลังบันทึก '+jobs.length+' Route…','ok','ยืนยัน Route แล้ว');
  location.hash='#/rounds';
  jobs.forEach(j=>createRouteOptimistic('confirmRoute', j.data, j.stops).catch(()=>{}));
}

/* ================================================================
   ROUNDS (routes + stops)
   ================================================================ */
ROUTES.rounds = async function(view){
  const routes = (Store.data.routes||[]).filter(x=>!x.IsDeleted);
  page(view, `
    ${head('รอบส่งสินค้า', `${thDate(Store.date)} · ${int(routes.length)} Route`,
      `<button class="btn btn-sm" data-act="csv"><i data-lucide="download"></i>CSV</button>`)}
    ${routes.length? `<div style="display:flex;flex-direction:column;gap:14px">${routes.map(routeCard).join('')}</div>`
      : emptyState('ยังไม่มีรอบส่งวันนี้','ไปที่หน้าวางแผนเส้นทางเพื่อสร้าง Route','<a class="btn btn-primary" href="#/planning"><i data-lucide="route"></i>จัด Route</a>')}
  `);
  const csv=view.querySelector('[data-act="csv"]'); if(csv) csv.onclick=()=>Exporter.csv(routes,'routes_'+Store.date);
  $$('[data-route]',view).forEach(b=>b.onclick=()=>openRouteDetail(b.dataset.route));
  $$('[data-start]',view).forEach(b=>b.onclick=()=>{ updateLocal('routes','startRoute',b.dataset.start,{Status:'In Progress'},{routeId:b.dataset.start}).then(()=>toast('เริ่มรอบส่งแล้ว','ok')).catch(()=>{}); });
  $$('[data-edit]',view).forEach(b=>b.onclick=()=>routeEditForm(routes.find(x=>x.RouteID===b.dataset.edit)));
};
function routeEditForm(r){
  if(!r) return;
  const emps=Store.data.employees||[], veh=Store.data.vehicles||[], ext=Store.data.externalVehicles||[];
  const isExt=r.RouteType==='EXTERNAL_VEHICLE';
  const m=modal({ title:'แก้ไข Route '+r.RouteID, body:`
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
    updateLocal('routes','updateRoute',r.RouteID,data).then(()=>toast('แก้ไข Route แล้ว','ok')).catch(()=>{});
  };
}
function routeCard(r){
  return `<div class="card">
    <div class="flex between aic wrap" style="margin-bottom:12px">
      <div class="flex aic gap12"><span class="mono strong" style="font-size:16px">${esc(r.RouteID)}</span>
        ${r.RouteType==='EXTERNAL_VEHICLE'?'<span class="badge b-amber">รถภายนอก</span>':'<span class="badge b-blue">รถบริษัท</span>'}${dstatusBadge(r.Status)}</div>
      <div class="flex gap8">
        ${r.Status==='Planned'?`<button class="btn btn-sm" data-start="${esc(r.RouteID)}"><i data-lucide="play"></i>เริ่มรอบ</button>`:''}
        <button class="btn btn-sm" data-edit="${esc(r.RouteID)}"><i data-lucide="pencil"></i>แก้ไข</button>
        <button class="btn btn-sm" data-route="${esc(r.RouteID)}"><i data-lucide="map"></i>รายละเอียด</button></div>
    </div>
    <div class="grid" style="grid-template-columns:repeat(6,1fr);gap:10px">
      ${rItem('คนขับ',esc(r.DriverName||'—'))}
      ${rItem('รถ',esc(r.VehicleName||r.ProviderName||'—'))}
      ${rItem('จุดส่ง',int(r.TotalStops)+' จุด')}
      ${rItem('กล่อง',int(r.TotalBoxes))}
      ${rItem('ระยะทาง',num1(r.TotalDistance)+' กม.')}
      ${rItem('ต้นทุน',money(r.EstimatedTotalCost)+' ฿')}
    </div></div>`;
}
function rItem(l,v){ return `<div style="border:1px solid var(--border);border-radius:9px;padding:9px 11px"><div class="small muted">${l}</div><div class="strong" style="font-size:13.5px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${v}</div></div>`; }
async function openRouteDetail(id){
  const stops = await API.get('getRouteStops',{routeId:id});
  const r = (Store.data.routes||[]).find(x=>x.RouteID===id)||{};
  const m = modal({ wide:true, title:'รายละเอียด '+id, body:`
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
  setTimeout(()=>{ if(!el('rdMap'))return; const wh=warehouse(); const mp=MapUtil.make('rdMap',wh); MapUtil.whMarker(mp,wh); const pts=[[wh.lat,wh.lng]]; stops.forEach(s=>{ if(s.Latitude){MapUtil.stopMarker(mp,s,s.StopOrder,'#2563EB'); pts.push([+s.Latitude,+s.Longitude]);} }); if(stops.length){const line=[[wh.lat,wh.lng],...stops.map(s=>[+s.Latitude,+s.Longitude]),[wh.lat,wh.lng]]; L.polyline(line,{color:'#6f9e0a',weight:4}).addTo(mp);} if(pts.length>1)mp.fitBounds(pts,{padding:[25,25]}); icons(); },80);
}

/* ================================================================
   PARCEL TRACKING — ค้นด้วยเลขบิล / PO / DeliveryID
   ================================================================ */
ROUTES.tracking = async function(view){
  page(view, `
    ${head('ติดตามพัสดุ', 'ค้นหาด้วยเลขบิล / เลขที่ PO / รหัสงานส่ง → เช็คสถานะ + GPS Check-in')}
    <div class="card mb14">
      <div class="flex gap8 wrap aic">
        <div class="search" style="flex:1;max-width:480px;margin:0">
          <i data-lucide="package-search"></i>
          <input id="trkQ" placeholder="เลขบิล / PO / รหัสงาน เช่น BSUJR3L61970" autocomplete="off">
        </div>
        <button class="btn btn-primary" id="trkGo"><i data-lucide="search"></i>ค้นหา</button>
      </div>
    </div>
    <div id="trkResult">${emptyState('พิมพ์เลขบิล/PO แล้วกดค้นหา','ระบบจะแสดงสถานะการส่ง ตำแหน่ง GPS และประวัติการเช็คอิน')}</div>
  `);
  const run = async ()=>{
    const q = el('trkQ').value.trim().toLowerCase();
    if(!q){ toast('กรอกเลขบิล/PO ก่อน','warn'); return; }
    el('trkResult').innerHTML = loadingState('กำลังค้นหา…');
    try{
      const dels = await API.get('getDeliveries');
      const hits = dels.filter(d => [d.InvoiceNo,d.DeliveryID,d.Note,d.CustomerName].some(f=>String(f||'').toLowerCase().includes(q))).slice(0,20);
      if(!hits.length){ el('trkResult').innerHTML = emptyState('ไม่พบพัสดุ','ตรวจเลขบิล/PO อีกครั้ง'); icons(); return; }
      const routeIds = [...new Set(hits.map(h=>h.RouteID).filter(Boolean))];
      const stopsByRoute = {};
      await Promise.all(routeIds.map(rid=>API.get('getRouteStops',{routeId:rid}).then(s=>stopsByRoute[rid]=s).catch(()=>stopsByRoute[rid]=[])));
      const stopFor = d => (stopsByRoute[d.RouteID]||[]).find(s=>String(s.DeliveryID)===String(d.DeliveryID));
      Track.hits = hits; Track.stopFor = stopFor;
      el('trkResult').innerHTML = hits.map(d=>trackCard(d, stopsByRoute[d.RouteID]||[])).join('');
      $$('[data-print]',view).forEach(b=>b.onclick=()=>{ const d=hits.find(x=>x.DeliveryID===b.dataset.print); Printer.open('ใบติดตามพัสดุ','A5', trkDoc(d, stopFor(d))); });
      icons();
    }catch(e){ el('trkResult').innerHTML = errorState(e.message,"ROUTES.tracking(document.getElementById('view'))"); icons(); }
  };
  el('trkGo').onclick = run;
  el('trkQ').addEventListener('keydown', e=>{ if(e.key==='Enter') run(); });
  el('trkQ').focus();
};
function trackCard(d, stops){
  const stop = stops.find(s=>String(s.DeliveryID)===String(d.DeliveryID));
  const checkedIn = stop && stop.CheckInTime;
  const done = d.Status==='Completed' || (stop && stop.Status==='Completed');
  const failed = d.Status==='Failed';
  const steps = [
    { k:'สร้างงาน', t:d.CreatedAt, on:true },
    { k:'วางแผน Route', t:d.RouteID?'':'', on:!!d.RouteID || ['Planned','Assigned','In Progress','Completed'].includes(d.Status), sub:d.RouteID||'' },
    { k:'กำลังส่ง', t:'', on:['In Progress','Completed'].includes(d.Status) },
    { k:'เช็คอินถึงจุดส่ง (GPS)', t:checkedIn?stop.CheckInTime:'', on:!!checkedIn, sub:checkedIn?(stop.CheckInLatitude?num1(stop.CheckInLatitude)+', '+num1(stop.CheckInLongitude):''):'' },
    { k: failed?'ส่งไม่สำเร็จ':'ส่งสำเร็จ', t:(stop&&stop.DeliveryCompletedTime)||'', on:done||failed, fail:failed }
  ];
  return `<div class="card mb14">
    <div class="flex between aic wrap" style="margin-bottom:10px">
      <div><div class="flex aic gap8"><span class="mono strong" style="font-size:15px">${esc(d.InvoiceNo||d.DeliveryID)}</span>${dstatusBadge(d.Status)}</div>
        <div class="small muted" style="margin-top:3px">${esc(d.CustomerName)}${d.BranchName?' · '+esc(d.BranchName):''} · ${int(d.BoxQty)} กล่อง · ${thDate(d.DeliveryDate)}</div></div>
      <div class="flex gap8">
        ${d.RouteID?`<span class="badge b-blue">Route ${esc(d.RouteID)}</span>`:''}
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
    <div class="kv">${row('เลขบิล',d.InvoiceNo)}${row('รหัสงาน',d.DeliveryID)}${row('ลูกค้า',d.CustomerName)}${row('สาขา',d.BranchName)}
      ${row('จำนวน',int(d.BoxQty)+' กล่อง')}${row('วันที่ส่ง',thDate(d.DeliveryDate))}${row('สถานะ',(DSTATUS[d.Status]||{}).label||d.Status)}${row('Route',d.RouteID)}</div>
    ${d.Note?`<div class="sec-title">รายละเอียด</div><div>${esc(d.Note)}</div>`:''}
    <div class="sec-title">การเช็คอิน (GPS)</div>
    <div class="kv">${row('เช็คอินเมื่อ', stop&&stop.CheckInTime?new Date(stop.CheckInTime).toLocaleString('th-TH'):'ยังไม่เช็คอิน')}
      ${row('พิกัดเช็คอิน', stop&&stop.CheckInLatitude?stop.CheckInLatitude+', '+stop.CheckInLongitude:'-')}
      ${row('ส่งสำเร็จเมื่อ', stop&&stop.DeliveryCompletedTime?new Date(stop.DeliveryCompletedTime).toLocaleString('th-TH'):'-')}</div>`;
};

/* ================================================================
   LIVE MAP
   ================================================================ */
let liveMapRef=null;
ROUTES.livemap = async function(view){
  const ct=Store.data.cartrack||{};
  page(view, `
    ${head('แผนที่ติดตาม (Live Fleet Map)', ctStatusLine(ct),
      `<div class="seg" id="lmFilter">
        <button class="on" data-f="all">ทั้งหมด</button><button data-f="company">รถบริษัท</button>
        <button data-f="external">รถภายนอก</button><button data-f="moving">กำลังวิ่ง</button><button data-f="stopped">จอดอยู่</button></div>`)}
    ${ct.stale&&ct.enabled?`<div class="notice warn mb14"><i data-lucide="clock"></i><div>🟡 ข้อมูลอาจไม่ใหม่ล่าสุด — ซิงก์ Cartrack ล่าสุด ${ago(ct.lastSync)}</div></div>`:''}
    ${!ct.enabled?`<div class="notice info mb14"><i data-lucide="info"></i><div>ยังไม่เปิดใช้งาน Cartrack — แสดงพิกัดจากข้อมูลระบบ ตั้งค่าได้ที่หน้า Cartrack Integration</div></div>`:''}
    <div class="grid" style="grid-template-columns:1fr 320px;gap:16px;align-items:start">
      <div class="card" style="padding:14px"><div id="liveMap" class="map" style="height:560px"></div></div>
      <div class="card" style="padding:14px">
        <div class="h-card mb14">สถานะรถ</div>
        <div id="vehList" style="display:flex;flex-direction:column;gap:8px;max-height:560px;overflow-y:auto" class="scrolly"></div>
      </div>
    </div>
  `);
  let filter='all';
  const vehicles=()=>(Store._live?Store._live.vehicles:(Store.data.vehicles||[]).map(v=>({VehicleID:v.VehicleID,VehicleName:v.VehicleName,LicensePlate:v.LicensePlate,VehicleType:v.VehicleType,CurrentDriver:v.CurrentDriver,VehicleStatus:v.VehicleStatus,lat:v.CurrentLatitude,lng:v.CurrentLongitude,speed:v.CurrentSpeed}))).filter(v=>{
    if(filter==='company')return true; if(filter==='moving')return Number(v.speed)>3; if(filter==='stopped')return Number(v.speed)<=3&&v.VehicleStatus!=='Offline'; if(filter==='external')return false; return true; });
  function draw(){
    const list=vehicles();
    el('vehList').innerHTML = list.length? list.map(v=>`<div class="flex between aic" style="padding:10px 12px;border:1px solid var(--border);border-radius:10px">
      <div><div class="strong" style="font-size:13px">${esc(v.VehicleName)}</div><div class="small muted mono">${esc(v.LicensePlate)} · ${esc(v.CurrentDriver||'ไม่มีชื่อคนขับ')}</div></div>
      <div style="text-align:right">${vstatusBadge(deriveVehStatus(v))}<div class="small muted tab" style="margin-top:3px">${int(v.speed)} กม./ชม.</div></div></div>`).join('') : emptyState('ไม่มีรถตามตัวกรอง');
    if(liveMapRef){ liveMapRef.remove(); liveMapRef=null; }
    const wh=warehouse(); liveMapRef=MapUtil.make('liveMap',wh); MapUtil.whMarker(liveMapRef,wh);
    const pts=[[wh.lat,wh.lng]]; list.forEach(v=>{ if(v.lat&&v.lng){MapUtil.vehMarker(liveMapRef,v);pts.push([+v.lat,+v.lng]);} });
    (Store.data.deliveries||[]).forEach((d,i)=>{ if(d.Latitude){MapUtil.stopMarker(liveMapRef,d,i+1,'#94A3B8');} });
    if(pts.length>1)liveMapRef.fitBounds(pts,{padding:[30,30]}); icons();
  }
  setTimeout(draw,60);
  $$('#lmFilter button',view).forEach(b=>b.onclick=()=>{ $$('#lmFilter button',view).forEach(x=>x.classList.remove('on')); b.classList.add('on'); filter=b.dataset.f; draw(); });
  window._onRealtime=()=>{ if(Store.page==='livemap') draw(); };
};
function ctStatusLine(ct){ if(!ct) return ''; if(ct.connected) return `🟢 Cartrack เชื่อมต่อ · พบ ${ct.found} คัน · แมตช์ ${ct.matched} · ${ago(ct.lastSync)}`; if(ct.enabled) return '🔴 Cartrack ออฟไลน์'; return 'โหมดข้อมูลระบบ (ยังไม่เปิด Cartrack)'; }

/* ================================================================
   COMPANY VEHICLES
   ================================================================ */
ROUTES.vehicles = async function(view){
  const rows = (Store.data.vehicles||[]).filter(x=>!x.IsDeleted);
  page(view, `
    ${head('รถบริษัท', `${int(rows.length)} คัน`, `<button class="btn btn-primary" data-act="new"><i data-lucide="plus"></i>เพิ่มรถ</button>`)}
    <div class="card" style="padding:0"><div class="tbl-wrap">
    <table class="tbl"><thead><tr><th>ชื่อรถ</th><th>ทะเบียน</th><th>ประเภท</th><th class="r">ความจุ</th><th>คนขับ</th><th>สถานะ</th><th>ตำแหน่งล่าสุด</th><th class="r">จัดการ</th></tr></thead>
    <tbody>${rows.map(v=>`<tr>
      <td class="strong">${esc(v.VehicleName)}</td><td class="mono small">${esc(v.LicensePlate)}</td>
      <td>${esc(v.VehicleType)}</td><td class="r tab">${int(v.CapacityBox)} กล่อง</td>
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
      <div><label class="label">ความจุ (กล่อง)</label><input class="input" type="number" id="vCap" value="${esc(v.CapacityBox||'')}"></div></div>
    <div class="field row2"><div><label class="label">ค่าน้ำมัน/กม. (บาท)</label><input class="input" type="number" step="0.1" id="vFuel" value="${esc(v.FuelCostPerKm||setting('FUEL_COST_PER_KM',3.5))}"></div>
      <div><label class="label">สถานะ</label><select class="select" id="vStatus">${Object.keys(VSTATUS).map(s=>`<option value="${s}" ${((v.VehicleStatus||'Available')===s)?'selected':''}>${VSTATUS[s].label}</option>`).join('')}</select></div></div>
    <div class="field row2"><div><label class="label">คนขับประจำ</label><input class="input" id="vDrv" value="${esc(v.CurrentDriver||'')}"></div>
      <div><label class="label">Cartrack Registration</label><input class="input" id="vCt" value="${esc(v.CartrackRegistration||v.LicensePlate||'')}"></div></div>
  `, foot:`<button class="btn" id="vCancel">ยกเลิก</button><button class="btn btn-primary" id="vSave"><i data-lucide="check"></i>บันทึก</button>` });
  el('vCancel').onclick=m.close;
  el('vSave').onclick=async()=>{ const data={ VehicleName:el('vName').value.trim(), LicensePlate:el('vPlate').value.trim(), VehicleType:el('vType').value, CapacityBox:+el('vCap').value||0, FuelCostPerKm:+el('vFuel').value||0, VehicleStatus:el('vStatus').value, CurrentDriver:el('vDrv').value.trim(), CartrackRegistration:el('vCt').value.trim() };
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
    <table class="tbl"><thead><tr><th>ผู้ให้บริการ</th><th>คนขับ</th><th>โทร</th><th>ประเภท</th><th>ทะเบียน</th><th class="r">ความจุ</th><th class="r">ราคา</th><th>รูปแบบ</th><th>สถานะ</th><th class="r"></th></tr></thead>
    <tbody>${rows.map(v=>`<tr>
      <td class="strong">${esc(v.ProviderName)}</td><td>${esc(v.DriverName)}</td><td class="mono small">${esc(v.DriverPhone)}</td>
      <td>${esc(v.VehicleType)}</td><td class="mono small">${esc(v.LicensePlate)}</td><td class="r tab">${int(v.CapacityBox)}</td>
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
    <div class="field row2"><div><label class="label">ความจุ (กล่อง)</label><input class="input" type="number" id="eCap" value="${esc(v.CapacityBox||'')}"></div>
      <div><label class="label">ราคา</label><input class="input" type="number" id="eRate" value="${esc(v.Rate||'')}"></div></div>
    <div class="field row2"><div><label class="label">รูปแบบราคา</label><select class="select" id="eRt">${Object.keys(RATE_TYPE).map(k=>`<option value="${k}" ${v.RateType===k?'selected':''}>${RATE_TYPE[k]}</option>`).join('')}</select></div>
      <div><label class="label">สถานะ</label><select class="select" id="eStatus"><option ${v.Status==='Available'?'selected':''}>Available</option><option ${v.Status==='In Use'?'selected':''}>In Use</option><option ${v.Status==='Inactive'?'selected':''}>Inactive</option></select></div></div>
  `, foot:`<button class="btn" id="eCancel">ยกเลิก</button><button class="btn btn-primary" id="eSave"><i data-lucide="check"></i>บันทึก</button>` });
  el('eCancel').onclick=m.close;
  el('eSave').onclick=async()=>{ const data={ ProviderName:el('eProv').value.trim(), DriverName:el('eDrv').value.trim(), DriverPhone:el('ePhone').value.trim(), VehicleType:el('eType').value.trim(), LicensePlate:el('ePlate').value.trim(), CapacityBox:+el('eCap').value||0, Rate:+el('eRate').value||0, RateType:el('eRt').value, Status:el('eStatus').value };
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
    ${rows.length?`<table class="tbl"><thead><tr><th>Route</th><th>ประเภท</th><th>รายละเอียด</th><th class="r">จำนวนเงิน</th><th>เวลา</th></tr></thead>
    <tbody>${rows.map(e=>`<tr><td class="mono small">${esc(e.RouteID||'—')}</td><td><span class="badge b-gray">${EXTYPE[e.ExpenseType]||e.ExpenseType}</span></td><td>${esc(e.Description||'')}</td><td class="r tab strong">${money(e.Amount)}</td><td class="small muted">${timeShort(e.CreatedAt)}</td></tr>`).join('')}</tbody></table>`
    :emptyState('ยังไม่มีค่าใช้จ่ายวันนี้','บันทึกค่าน้ำมัน ทางด่วน ค่าจอด ฯลฯ')}
    </div></div>
  `);
  const csv=view.querySelector('[data-act="csv"]'); if(csv)csv.onclick=()=>Exporter.csv(rows,'expenses_'+Store.date);
  view.querySelector('[data-act="new"]').onclick=()=>{
    const m=modal({title:'บันทึกค่าใช้จ่าย',body:`
      <div class="field"><label class="label">Route (ถ้ามี)</label><select class="select" id="xR"><option value="">— ไม่ระบุ —</option>${routes.map(r=>`<option value="${esc(r.RouteID)}">${esc(r.RouteID)} · ${esc(r.DriverName||'')}</option>`).join('')}</select></div>
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
    ${rows.length?`<table class="tbl"><thead><tr><th>Claim ID</th><th>Route</th><th>คนขับ</th><th class="r">เบิก</th><th class="r">ใช้จริง</th><th class="r">เงินทอน</th><th class="r">เบิกเพิ่ม</th><th class="r">คงเหลือ</th><th>สถานะ</th></tr></thead>
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
      <div class="field"><label class="label">Route</label><select class="select" id="aR"><option value="">— ไม่ระบุ —</option>${routes.map(r=>`<option value="${esc(r.RouteID)}">${esc(r.RouteID)} · ${esc(r.DriverName||'')}</option>`).join('')}</select></div>
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
    ${head('ต้นทุนต่อ Route', `${thDate(Store.date)} · ${int(routes.length)} Route · รวม ${money(tot)} บาท`, `<button class="btn btn-sm" data-act="excel"><i data-lucide="file-spreadsheet"></i>Excel</button>`)}
    <div class="card" style="padding:0"><div class="tbl-wrap">
    ${routes.length?`<table class="tbl"><thead><tr><th>Route</th><th>ประเภท</th><th class="r">น้ำมัน</th><th class="r">ทางด่วน</th><th class="r">จอดรถ</th><th class="r">รถภายนอก</th><th class="r">อื่นๆ</th><th class="r">รวม</th><th class="r">ต่อจุด</th><th class="r">ต่อกล่อง</th></tr></thead>
    <tbody>${routes.map(r=>`<tr><td class="mono strong">${esc(r.RouteID)}</td><td>${r.RouteType==='EXTERNAL_VEHICLE'?'<span class="badge b-amber">ภายนอก</span>':'<span class="badge b-blue">บริษัท</span>'}</td>
      <td class="r tab">${money(r.EstimatedFuelCost)}</td><td class="r tab">${money(r.EstimatedTollCost)}</td><td class="r tab">${money(r.EstimatedParkingCost)}</td>
      <td class="r tab">${money(r.EstimatedExternalCost)}</td><td class="r tab">${money(r.EstimatedOtherCost)}</td>
      <td class="r tab strong" style="color:#2563EB">${money(r.EstimatedTotalCost)}</td><td class="r tab">${money(r.CostPerStop)}</td><td class="r tab">${money(r.CostPerBox)}</td></tr>`).join('')}</tbody></table>`
    :emptyState('ยังไม่มี Route','สร้าง Route จากหน้าวางแผนเส้นทาง')}
    </div></div>
  `);
  const ex=view.querySelector('[data-act="excel"]'); if(ex)ex.onclick=()=>Exporter.excel(routes.map(r=>({RouteID:r.RouteID,ประเภท:r.RouteType,น้ำมัน:r.EstimatedFuelCost,ทางด่วน:r.EstimatedTollCost,จอดรถ:r.EstimatedParkingCost,รถภายนอก:r.EstimatedExternalCost,อื่นๆ:r.EstimatedOtherCost,รวม:r.EstimatedTotalCost,ต่อจุด:r.CostPerStop,ต่อกล่อง:r.CostPerBox})),'route_cost_'+Store.date,'ต้นทุนต่อ Route');
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
      confirmDialog('ยังไม่มีพิกัด GPS ของที่อยู่นี้ (แผนที่/การจัด Route จะไม่แสดงจุดนี้จนกว่าจะมีพิกัด) ต้องการบันทึกต่อไหม?', ()=>saveC(data), {yes:'บันทึกต่อ'}); return; }
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
    <div class="field"><label class="label">รถประจำ</label><select class="select" id="mpVeh"><option value="">— ไม่ระบุ —</option>${(veh||[]).map(v=>`<option value="${esc(v.VehicleID)}" ${e.VehicleID===v.VehicleID?'selected':''}>${esc(v.VehicleName)} · ${esc(v.LicensePlate)}</option>`).join('')}</select></div>
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
  const to = Store.date; const from = new Date(new Date(to).getTime()-6*864e5).toISOString().slice(0,10);
  page(view, `
    ${head('รายงาน', 'สรุปงานส่ง · Route · ต้นทุน ย้อนหลัง', '')}
    <div class="card mb14">
      <div class="flex gap12 wrap aic">
        <div><label class="label">จากวันที่</label><input type="date" class="input" id="rFrom" value="${from}"></div>
        <div><label class="label">ถึงวันที่</label><input type="date" class="input" id="rTo" value="${to}"></div>
        <div style="align-self:flex-end"><button class="btn btn-primary" id="rGo"><i data-lucide="search"></i>สร้างรายงาน</button></div>
        <div style="align-self:flex-end" class="flex gap8">
          <button class="btn btn-sm" data-preset="today">วันนี้</button>
          <button class="btn btn-sm" data-preset="7">7 วัน</button>
          <button class="btn btn-sm" data-preset="month">เดือนนี้</button></div>
        <div style="align-self:flex-end"><label class="label">ประเภทรายงาน</label><select class="select" id="rType" style="width:210px">
          <option value="routes">สรุป Route</option>
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
    const kpi=(l,v,u)=>`<div class="cost"><div class="lbl">${l}</div><div class="val tab">${v}</div><div class="unit">${u||''}</div></div>`;
    el('rBody').innerHTML=`
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:14px;margin-bottom:6px">
        ${kpi('จำนวนงาน',int(dels.length),'งาน')}
        ${kpi('จำนวนกล่อง',int(boxes),'กล่อง')}
        ${kpi('ค่าใช้จ่ายรวม',money(totalCost),'บาท')}
        ${kpi('ระยะทางรวม',num1(dist),'กม.')}
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
  const routes = rep.routes||[], dels = rep.deliveries||[];
  const rmap={}; routes.forEach(r=>{ rmap[r.RouteID]=r; });
  if(type==='deliveries'){
    const totBox = dels.reduce((n,d)=>n+(+d.BoxQty||0),0);
    const rows = dels.map(d=>({
      'วันที่':d.DeliveryDate, 'ลูกค้า':d.CustomerName, 'สาขา':d.BranchName||'', 'ที่อยู่':d.Address||'',
      'เลขบิล':d.InvoiceNo||'', 'กล่อง':Number(d.BoxQty)||0, 'Priority':(PRIORITY[d.Priority]||{}).label||d.Priority||'',
      'Route':d.RouteID||'', 'คนขับ':(rmap[d.RouteID]||{}).DriverName||'', 'สถานะ':(DSTATUS[d.Status]||{}).label||d.Status||'' }));
    const html=`<div class="card mt16"><div class="h-card mb14">รายการจัดส่งรายร้าน · ${int(dels.length)} รายการ · ${int(totBox)} กล่อง</div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>วันที่</th><th>ลูกค้า</th><th>สาขา</th><th>ที่อยู่</th><th>เลขบิล</th><th class="r">กล่อง</th><th>Priority</th><th>Route</th><th>คนขับ</th><th>สถานะ</th></tr></thead>
      <tbody>${dels.map(d=>`<tr><td class="small">${thDate(d.DeliveryDate)}</td><td class="strong">${esc(d.CustomerName)}</td><td class="muted">${esc(d.BranchName||'')}</td><td class="small muted">${esc(d.Address||'')}</td><td class="mono small">${esc(d.InvoiceNo||'—')}</td><td class="r tab">${int(d.BoxQty)}</td><td>${priBadge(d.Priority)}</td><td class="mono small">${esc(d.RouteID||'—')}</td><td>${esc((rmap[d.RouteID]||{}).DriverName||'')}</td><td>${dstatusBadge(d.Status)}</td></tr>`).join('')||`<tr><td colspan="10">${emptyState('ไม่มีงานส่งในช่วงนี้')}</td></tr>`}</tbody></table></div></div>`;
    return { html, rows, filename:'report_deliveries', title:'รายงานการจัดส่งรายร้าน' };
  }
  if(type==='expenses'){
    const sum=f=>routes.reduce((n,r)=>n+(+r[f]||0),0);
    const rows = routes.map(r=>({
      'Route':r.RouteID, 'วันที่':r.DeliveryDate, 'คนขับ':r.DriverName||'',
      'ค่าน้ำมัน':Number(r.EstimatedFuelCost)||0, 'ค่าทางด่วน':Number(r.EstimatedTollCost)||0, 'ค่าจอดรถ':Number(r.EstimatedParkingCost)||0,
      'ค่ารถภายนอก':Number(r.EstimatedExternalCost)||0, 'ค่าอื่นๆ':Number(r.EstimatedOtherCost)||0, 'รวม':Number(r.EstimatedTotalCost)||0 }));
    const html=`<div class="card mt16"><div class="h-card mb14">ค่าใช้จ่ายแยกประเภท · รวม ${money(sum('EstimatedTotalCost'))} บาท</div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Route</th><th>วันที่</th><th>คนขับ</th><th class="r">น้ำมัน</th><th class="r">ทางด่วน</th><th class="r">จอดรถ</th><th class="r">รถภายนอก</th><th class="r">อื่นๆ</th><th class="r">รวม</th></tr></thead>
      <tbody>${routes.map(r=>`<tr><td class="mono strong">${esc(r.RouteID)}</td><td class="small">${thDate(r.DeliveryDate)}</td><td>${esc(r.DriverName||'')}</td><td class="r tab">${money(r.EstimatedFuelCost)}</td><td class="r tab">${money(r.EstimatedTollCost)}</td><td class="r tab">${money(r.EstimatedParkingCost)}</td><td class="r tab">${money(r.EstimatedExternalCost)}</td><td class="r tab">${money(r.EstimatedOtherCost)}</td><td class="r tab strong">${money(r.EstimatedTotalCost)}</td></tr>`).join('')||`<tr><td colspan="9">${emptyState('ไม่มีข้อมูล')}</td></tr>`}</tbody>
      <tfoot><tr><th colspan="3" class="r">รวมทั้งสิ้น</th><th class="r tab">${money(sum('EstimatedFuelCost'))}</th><th class="r tab">${money(sum('EstimatedTollCost'))}</th><th class="r tab">${money(sum('EstimatedParkingCost'))}</th><th class="r tab">${money(sum('EstimatedExternalCost'))}</th><th class="r tab">${money(sum('EstimatedOtherCost'))}</th><th class="r tab">${money(sum('EstimatedTotalCost'))}</th></tr></tfoot></table></div></div>`;
    return { html, rows, filename:'report_expenses', title:'รายงานค่าใช้จ่ายแยกประเภท' };
  }
  const rows = routes.map(r=>({ Route:r.RouteID, 'วันที่':r.DeliveryDate, 'ประเภท':r.RouteType==='EXTERNAL_VEHICLE'?'รถภายนอก':'รถบริษัท', 'คนขับ':r.DriverName||'', 'จุด':Number(r.TotalStops)||0, 'กล่อง':Number(r.TotalBoxes)||0, 'ระยะทาง':Number(r.TotalDistance)||0, 'ต้นทุน':Number(r.EstimatedTotalCost)||0, 'สถานะ':(DSTATUS[r.Status]||{}).label||r.Status }));
  const html=`<div class="card mt16"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Route</th><th>วันที่</th><th>ประเภท</th><th>คนขับ</th><th class="r">จุด</th><th class="r">กล่อง</th><th class="r">ระยะทาง</th><th class="r">ต้นทุน</th><th>สถานะ</th><th class="r">พิมพ์</th></tr></thead>
    <tbody>${routes.map(r=>`<tr><td class="mono strong">${esc(r.RouteID)}</td><td class="small">${thDate(r.DeliveryDate)}</td><td>${r.RouteType==='EXTERNAL_VEHICLE'?'ภายนอก':'บริษัท'}</td><td>${esc(r.DriverName||'')}</td><td class="r tab">${int(r.TotalStops)}</td><td class="r tab">${int(r.TotalBoxes)}</td><td class="r tab">${num1(r.TotalDistance)}</td><td class="r tab strong">${money(r.EstimatedTotalCost)}</td><td>${dstatusBadge(r.Status)}</td><td class="r"><button class="btn btn-sm" data-note="${esc(r.RouteID)}"><i data-lucide="printer"></i></button></td></tr>`).join('')||`<tr><td colspan="10">${emptyState('ไม่มี Route ในช่วงนี้')}</td></tr>`}</tbody></table></div></div>`;
  return { html, rows, filename:'report_routes', title:'รายงาน Route' };
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
      <div><span>จำนวน Route:</span> <b>${int(routes.length)}</b></div>
      <div><span>จุดส่งรวม:</span> <b>${int(sum(routes,'TotalStops'))}</b></div>
      <div><span>กล่องรวม:</span> <b>${int(sum(routes,'TotalBoxes'))}</b></div>
      <div><span>ระยะทางรวม:</span> <b>${num1(sum(routes,'TotalDistance'))} กม.</b></div>
      <div><span>ต้นทุนรวม:</span> <b>${money(total)} บาท</b></div>
    </div>`;
  let title='รายงานการจัดส่ง / DELIVERY REPORT', tbl='';
  if(type==='deliveries'){
    title='รายงานการจัดส่งรายร้าน / DELIVERY DETAIL';
    const totBox=sum(dels,'BoxQty');
    tbl=`<div class="sec-title">รายการจัดส่งรายร้าน</div>
    <table><colgroup><col style="width:13%"><col style="width:22%"><col><col style="width:13%"><col style="width:9%"><col style="width:13%"></colgroup>
    <thead><tr><th>วันที่</th><th>ลูกค้า</th><th>สาขา / ที่อยู่</th><th>เลขบิล</th><th>กล่อง</th><th>สถานะ</th></tr></thead>
    <tbody>${dels.map(d=>`<tr><td>${thDate(d.DeliveryDate)}</td><td>${esc(d.CustomerName)}</td><td class="addr">${esc([d.BranchName,d.Address].filter(Boolean).join(' · '))}</td><td>${esc(d.InvoiceNo||'-')}</td><td class="r">${int(d.BoxQty)}</td><td>${(DSTATUS[d.Status]||{}).label||d.Status}</td></tr>`).join('')||'<tr><td colspan="6" class="c muted">ไม่มีข้อมูล</td></tr>'}</tbody>
    <tfoot><tr><th colspan="4" class="r">รวมกล่อง</th><th class="r" colspan="2">${int(totBox)} กล่อง</th></tr></tfoot></table>`;
  } else if(type==='expenses'){
    title='รายงานค่าใช้จ่าย / EXPENSE REPORT';
    tbl=`<div class="sec-title">ค่าใช้จ่ายแยกประเภท (ราย Route)</div>
    <table><thead><tr><th class="tl">Route</th><th>วันที่</th><th>ค่าน้ำมัน</th><th>ทางด่วน</th><th>จอดรถ</th><th>รถภายนอก</th><th>อื่นๆ</th><th>รวม</th></tr></thead>
    <tbody>${routes.map(r=>`<tr><td>${esc(r.RouteID)}</td><td>${thDate(r.DeliveryDate)}</td><td class="r">${money(r.EstimatedFuelCost)}</td><td class="r">${money(r.EstimatedTollCost)}</td><td class="r">${money(r.EstimatedParkingCost)}</td><td class="r">${money(r.EstimatedExternalCost)}</td><td class="r">${money(r.EstimatedOtherCost)}</td><td class="r">${money(r.EstimatedTotalCost)}</td></tr>`).join('')||'<tr><td colspan="8" class="c muted">ไม่มีข้อมูล</td></tr>'}</tbody>
    <tfoot><tr><th colspan="2" class="r">รวมทั้งสิ้น</th><th class="r">${money(sum(routes,'EstimatedFuelCost'))}</th><th class="r">${money(sum(routes,'EstimatedTollCost'))}</th><th class="r">${money(sum(routes,'EstimatedParkingCost'))}</th><th class="r">${money(sum(routes,'EstimatedExternalCost'))}</th><th class="r">${money(sum(routes,'EstimatedOtherCost'))}</th><th class="r">${money(total)}</th></tr></tfoot></table>`;
  } else {
    tbl=`<div class="sec-title">รายการ Route</div>
    <table><thead><tr><th class="tl">Route</th><th>วันที่</th><th>ประเภท</th><th>คนขับ</th><th>จุด</th><th>กล่อง</th><th>ระยะทาง</th><th>ต้นทุน</th><th>สถานะ</th></tr></thead>
    <tbody>${routes.map(r=>`<tr><td>${esc(r.RouteID)}</td><td>${thDate(r.DeliveryDate)}</td><td>${r.RouteType==='EXTERNAL_VEHICLE'?'ภายนอก':'บริษัท'}</td><td>${esc(r.DriverName||'-')}</td><td class="r">${int(r.TotalStops)}</td><td class="r">${int(r.TotalBoxes)}</td><td class="r">${num1(r.TotalDistance)}</td><td class="r">${money(r.EstimatedTotalCost)}</td><td>${(DSTATUS[r.Status]||{}).label||r.Status}</td></tr>`).join('')||'<tr><td colspan="9" class="c muted">ไม่มีข้อมูล</td></tr>'}</tbody>
    <tfoot><tr><th colspan="7" class="r">รวมต้นทุน</th><th class="r" colspan="2">${money(total)} บาท</th></tr></tfoot></table>`;
  }
  Printer.open(title, rSize(), head + tbl);
}
async function printRouteNote(r){
  if(!r) return;
  let stops=[]; try{ stops=await API.get('getRouteStops',{routeId:r.RouteID}); }catch(e){}
  const row=(l,v)=>`<div><span>${l}:</span> <b>${esc(v==null||v===''?'-':v)}</b></div>`;
  const body=`
    <div class="kv">
      ${row('Route ID',r.RouteID)}${row('วันที่',thDate(r.DeliveryDate))}${row('ประเภท',r.RouteType==='EXTERNAL_VEHICLE'?'รถภายนอก':'รถบริษัท')}
      ${row('คนขับ',r.DriverName)}${row('รถ',r.VehicleName||r.ProviderName)}${row('ทะเบียน',r.LicensePlate)}
      ${row('จำนวนจุด',int(r.TotalStops))}${row('กล่องรวม',int(r.TotalBoxes))}${row('ระยะทาง',num1(r.TotalDistance)+' กม.')}${row('สถานะ',(DSTATUS[r.Status]||{}).label||r.Status)}</div>
    <div class="sec-title">รายการจุดส่ง</div>
    <table>
      <colgroup><col style="width:8%"><col style="width:30%"><col><col style="width:11%"><col style="width:15%"></colgroup>
      <thead><tr><th>ลำดับ</th><th>ลูกค้า</th><th>สาขา / ที่อยู่</th><th>กล่อง</th><th>หมายเหตุ</th></tr></thead>
      <tbody>${stops.map(s=>`<tr><td class="c">${s.StopOrder}</td><td>${esc(s.CustomerName)}</td><td class="addr">${esc(s.BranchName||s.Address||'')}</td><td class="r">${int(s.BoxQty)}</td><td></td></tr>`).join('')||'<tr><td colspan="5" class="c muted">ไม่มีจุดส่ง</td></tr>'}</tbody></table>
    <div class="sec-title">สรุปค่าใช้จ่าย (สำหรับเบิกกับฝ่ายบัญชี)</div>
    <div class="kv">${row('ค่าน้ำมัน',money(r.EstimatedFuelCost))}${row('ค่าทางด่วน',money(r.EstimatedTollCost))}${row('ค่าจอดรถ',money(r.EstimatedParkingCost))}${row('ค่ารถภายนอก',money(r.EstimatedExternalCost))}${row('ค่าอื่นๆ',money(r.EstimatedOtherCost))}${row('รวมเบิกทั้งสิ้น',money(r.EstimatedTotalCost)+' บาท')}</div>
    <div class="sign"><div>ผู้มอบหมายงาน / หัวหน้า</div><div>คนขับ (ผู้เบิก)</div><div>ฝ่ายบัญชี (ผู้อนุมัติจ่าย)</div></div>`;
  Printer.open('ใบสรุปงาน-เบิกค่าใช้จ่าย / TRIP & EXPENSE', rSize(), body);
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
    ${grp('ข้อมูลหลัก',[
      item('#/customers','store','ลูกค้า / สาขา','ร้านค้าปลายทาง + พิกัด GPS'),
      item('#/vehicles','truck','รถบริษัท','ทะเบียน · ความจุ · ค่าน้ำมัน'),
      item('#/external','truck-electric','รถจ้างภายนอก','ผู้ให้บริการ + เรตราคา'),
      item('#/employees','users','พนักงานส่งสินค้า','คนขับ + รถประจำ')])}
    ${grp('รอบส่ง & การเงินเพิ่มเติม',[
      item('#/rounds','list-checks','รอบส่งสินค้า','Route ที่จัดแล้ว'),
      item('#/advance','hand-coins','เงินทดรองจ่าย','เบิก / เคลียร์เงินคนขับ'),
      item('#/routecost','calculator','ต้นทุนต่อ Route','แยกค่าใช้จ่ายราย Route')])}
    ${grp('ระบบ & การเชื่อมต่อ',[
      item('#/config','sliders-horizontal','ตั้งค่าระบบ · คลัง · ต้นทุน','บริษัท พิกัดคลัง ค่าน้ำมัน + เชื่อม Google'),
      item('#/cartrack','satellite-dish','Cartrack GPS','เชื่อมต่อ GPS ติดตามรถ'),
      item('user-guide.html','book-open','คู่มือใช้งาน','วิธีใช้แต่ละหน้าแบบละเอียด',true)])}
  `);
};

/* ================================================================
   SYSTEM CONFIG — คลัง · ต้นทุน · เชื่อมต่อ Google (เข้าจากหน้าตั้งค่า)
   ================================================================ */
ROUTES.config = async function(view){
  const settings = await API.get('getSettings');
  const url = API.url();
  const group=(g)=>settings.filter(s=>s.Group===g);
  const fieldFor=(s)=>`<div class="field"><label class="label">${esc(s.Label||s.Key)} <span class="mono small muted">(${esc(s.Key)})</span></label><input class="input" data-skey="${esc(s.Key)}" value="${esc(s.Value)}"></div>`;
  page(view, `
    ${head('ตั้งค่าระบบ', 'คลัง · ต้นทุน · เชื่อมต่อ Google Apps Script', '<a class="btn btn-sm" href="#/settings"><i data-lucide="arrow-left"></i>กลับหน้าตั้งค่า</a>')}
    <div class="card mb14">
      <div class="flex aic gap12 mb14"><div style="width:40px;height:40px;border-radius:11px;background:#EFF4FF;color:#2563EB;display:flex;align-items:center;justify-content:center"><i data-lucide="database"></i></div>
        <div><div class="h-card">แหล่งข้อมูล — Google Apps Script Web App URL</div><div class="small muted">Frontend เรียก API ผ่าน URL นี้เท่านั้น (Sheets ไม่ถูกเรียกตรง)</div></div></div>
      <div class="field"><input class="input" id="apiUrl" placeholder="https://script.google.com/macros/s/XXXX/exec" value="${esc(url)}"></div>
      <div class="flex gap8 wrap">
        <button class="btn btn-primary" id="apiSave"><i data-lucide="plug"></i>เชื่อมต่อ & โหลดข้อมูล</button>
        <button class="btn" id="apiTest"><i data-lucide="activity"></i>ทดสอบการเชื่อมต่อ</button>
        <button class="btn" id="apiMock"><i data-lucide="flask-conical"></i>ใช้ข้อมูลทดลอง (Mock)</button>
        <span class="flex aic gap8" style="margin-left:auto"><span class="sync-dot" style="background:${Store.live?'#10B981':'#F59E0B'}"></span><span class="small strong">${Store.live?'เชื่อมต่อแล้ว':'โหมดทดลอง'}</span></span>
      </div>
      <div class="notice info" style="margin-top:14px"><i data-lucide="list-ordered"></i><div>
        1) เปิด Google Sheet → Extensions → Apps Script วางไฟล์ <b>Code.gs</b> แล้วรัน <b>setupDatabase()</b> ครั้งเดียว<br>
        2) Deploy → New deployment → Web app · Execute as <b>Me</b> · Who has access <b>Anyone</b><br>
        3) คัดลอก Web app URL มาวางด้านบน แล้วกด "เชื่อมต่อ & โหลดข้อมูล"</div></div>
    </div>

    <div class="grid" style="grid-template-columns:1fr 1fr;gap:16px">
      <div class="card"><div class="h-card mb14">ข้อมูลบริษัท & คลังสินค้า</div>${group('company').map(fieldFor).join('')}</div>
      <div class="card"><div class="h-card mb14">พารามิเตอร์ต้นทุน</div>${group('cost').map(fieldFor).join('')}</div>
      <div class="card"><div class="h-card mb14">การติดตาม (GPS Check-in)</div>${group('tracking').map(fieldFor).join('')}</div>
      <div class="card"><div class="h-card mb14">บันทึกค่าทั้งหมด</div>
        <p class="small muted">แก้ไขค่าในช่องด้านซ้าย แล้วกดบันทึกเพื่อเขียนกลับไปยัง Google Sheets (ชีต Settings)</p>
        <button class="btn btn-primary btn-block mt16" id="setSave"><i data-lucide="save"></i>บันทึกการตั้งค่าทั้งหมด</button></div>
    </div>
  `);
  el('apiSave').onclick=async()=>{ API.setUrl(el('apiUrl').value.trim()); await loadBootstrap(); render(); toast(Store.live?'เชื่อมต่อ Apps Script สำเร็จ':'บันทึก URL แล้ว','ok'); };
  el('apiTest').onclick=async()=>{ const u=el('apiUrl').value.trim(); if(!u){toast('กรอก URL ก่อน','warn');return;} try{ const r=await fetch(u+'?action=ping'); const j=await r.json(); toast(j.ok?'เชื่อมต่อสำเร็จ ✓ server time '+(j.data&&j.data.time||''):'ตอบกลับผิดพลาด','ok'); }catch(e){ toast('เชื่อมต่อไม่ได้: '+e.message,'err'); } };
  el('apiMock').onclick=async()=>{ API.useMock(); await loadBootstrap(); render(); toast('สลับเป็นข้อมูลทดลอง (Mock)','info'); };
  el('setSave').onclick=async()=>{ const inputs=$$('[data-skey]',view); el('setSave').disabled=true; try{ for(const i of inputs){ await API.post('updateSetting',{key:i.dataset.skey,value:i.value}); } await loadBootstrap(); toast('บันทึกการตั้งค่าแล้ว','ok'); }catch(e){toast(e.message,'err');} el('setSave').disabled=false; };
};

/* ================================================================
   CARTRACK INTEGRATION
   ================================================================ */
ROUTES.cartrack = async function(view){
  const ct = await API.get('getCartrackStatus');
  const veh = await API.get('getVehicles');
  const matched = veh.filter(v=>v.CartrackRegistration);
  page(view, `
    ${head('Cartrack Fleet Integration', 'ติดตามรถ GPS สดผ่าน Google Apps Script (backend)')}
    <div class="notice ${ct.connected?'ok':(ct.enabled?'warn':'info')} mb14"><i data-lucide="${ct.connected?'wifi':(ct.enabled?'wifi-off':'info')}"></i>
      <div><b>${ct.connected?'🟢 Connected':(ct.enabled?'🔴 Disconnected':'⚪ ยังไม่เปิดใช้งาน')}</b> ·
      ${ct.hasCredentials?'มี credentials':'ยังไม่ได้ตั้งค่า credentials'} · ซิงก์ล่าสุด ${ct.lastSync?ago(ct.lastSync):'—'}${ct.mock?' · (โหมดทดลอง)':''}</div></div>

    <div class="grid" style="grid-template-columns:repeat(4,1fr);gap:16px" class="mb14">
      ${ctStat('สถานะ',ct.connected?'เชื่อมต่อ':'ไม่เชื่อมต่อ','satellite-dish',ct.connected?'#10B981':'#EF4444')}
      ${ctStat('ซิงก์ล่าสุด',ct.lastSync?ago(ct.lastSync):'—','clock','#2563EB')}
      ${ctStat('รถที่พบ',int(ct.found)+' คัน','truck','#7C3AED')}
      ${ctStat('รถที่จับคู่',int(ct.matched)+' คัน','link','#0891B2')}
    </div>

    <div class="card mt16">
      <div class="notice warn mb14"><i data-lucide="shield-check"></i><div><b>ความปลอดภัย:</b> Cartrack Username / Password / API Token ถูกเก็บใน <b>Google Apps Script — PropertiesService</b> เท่านั้น ไม่เก็บใน Frontend / HTML / LocalStorage และ Apps Script เป็นผู้เรียก Cartrack API (เลี่ยง CORS + ปลอดภัยกว่า)</div></div>
      <div class="flex gap8 wrap">
        <button class="btn btn-primary" id="ctTest"><i data-lucide="activity"></i>ทดสอบการเชื่อมต่อ</button>
        <button class="btn" id="ctSync"><i data-lucide="refresh-cw"></i>Sync รถทั้งหมด</button>
      </div>
      <div class="notice info" style="margin-top:14px"><i data-lucide="terminal"></i><div>
        ตั้งค่า credentials ใน Apps Script (ครั้งเดียว): แก้ค่าในฟังก์ชัน <b>setupCartrackCredentials()</b> แล้วรัน ·
        ดึงอัตโนมัติ: รัน <b>installCartrackTrigger()</b> (ทุก 1 นาที) · Frontend รีเฟรชทุก 8 วินาที</div></div>
    </div>

    <div class="card mt16"><div class="h-card mb14">การจับคู่รถบริษัท ↔ Cartrack</div><div class="tbl-wrap">
      <table class="tbl"><thead><tr><th>รถบริษัท</th><th>ทะเบียน</th><th>Cartrack Reg.</th><th>ตำแหน่งล่าสุด</th><th>ความเร็ว</th><th>สถานะ</th></tr></thead>
      <tbody>${veh.map(v=>`<tr><td class="strong">${esc(v.VehicleName)}</td><td class="mono small">${esc(v.LicensePlate)}</td>
        <td class="mono small">${v.CartrackRegistration?esc(v.CartrackRegistration):'<span class="badge b-gray">ยังไม่จับคู่</span>'}</td>
        <td class="small muted">${v.CurrentLatitude?num1(v.CurrentLatitude)+', '+num1(v.CurrentLongitude):'—'}</td>
        <td class="tab">${int(v.CurrentSpeed)} กม./ชม.</td><td>${vstatusBadge(deriveVehStatus(v))}</td></tr>`).join('')}</tbody></table>
    </div></div>
  `);
  el('ctTest').onclick=async()=>{ try{ const r=await API.post('syncCartrack',{}); toast(r.ok?('เชื่อมต่อสำเร็จ · '+r.fetched+' คัน'):(r.message||'ทดสอบเสร็จ'), r.ok?'ok':'warn'); }catch(e){toast(e.message,'err');} };
  el('ctSync').onclick=async()=>{ el('ctSync').disabled=true; try{ const r=await API.post('syncCartrack',{}); toast(r.ok?('ซิงก์แล้ว · พบ '+r.fetched+' · แมตช์ '+r.matched):(r.message||'ซิงก์ไม่สำเร็จ'), r.ok?'ok':'warn'); await refresh(); }catch(e){toast(e.message,'err');} el('ctSync').disabled=false; };
};
function ctStat(l,v,ic,col){ return `<div class="card" style="padding:16px"><div class="flex between aic"><div><div class="small muted">${l}</div><div class="strong" style="font-size:18px;margin-top:4px">${v}</div></div><div style="width:40px;height:40px;border-radius:11px;background:${col}15;color:${col};display:flex;align-items:center;justify-content:center"><i data-lucide="${ic}"></i></div></div></div>`; }

/* ================================================================
   DRIVER MOBILE MODE
   ================================================================ */
const Driver = { routeId:null };
/* ---- driver login session (localStorage) ---- */
const DRV_LS_TOKEN='ddc_driver_token', DRV_LS_EMP='ddc_driver_emp';
function driverSession(){
  try{ const token=localStorage.getItem(DRV_LS_TOKEN); const emp=JSON.parse(localStorage.getItem(DRV_LS_EMP)||'null');
    return (token&&emp)?{token,emp}:null; }catch(e){ return null; }
}
function driverSetSession(token,emp){ localStorage.setItem(DRV_LS_TOKEN,token); localStorage.setItem(DRV_LS_EMP,JSON.stringify(emp)); }
function driverClearSession(){ localStorage.removeItem(DRV_LS_TOKEN); localStorage.removeItem(DRV_LS_EMP); Driver.routeId=null; }
function driverLogoutBtn(){ return `<button class="btn btn-sm" id="drvLogout"><i data-lucide="log-out"></i>ออกจากระบบ</button>`; }
function bindDriverLogout(sess){
  const b=el('drvLogout'); if(!b) return;
  b.onclick=async()=>{ try{ await API.post('driverLogout',{token:sess.token}); }catch(e){} driverClearSession(); render(); };
}
function driverLoginForm(view){
  page(view, `<div class="driver">
    ${head('โหมดคนขับ · เข้าสู่ระบบ', thDate(Store.date))}
    <div class="card" style="max-width:360px;margin:0 auto">
      <div class="field"><label class="label">Username</label><input class="input" id="drvUser" placeholder="Username คนขับ" autocomplete="username"></div>
      <div class="field" style="margin:0"><label class="label">PIN</label><input class="input" id="drvPin" type="password" inputmode="numeric" placeholder="PIN 4-6 หลัก" autocomplete="current-password"></div>
      <button class="btn btn-primary btn-block big-btn mt16" id="drvLoginBtn" style="margin-top:14px"><i data-lucide="log-in"></i>เข้าสู่ระบบ</button>
    </div>
  </div>`);
  const go=async()=>{
    const username=el('drvUser').value.trim(), pin=el('drvPin').value.trim();
    if(!username||!pin){ toast('กรอก Username และ PIN','warn'); return; }
    const btn=el('drvLoginBtn'); btn.disabled=true; btn.innerHTML='<i data-lucide="loader-2" style="animation:spin 1s linear infinite"></i>กำลังเข้าสู่ระบบ…'; icons();
    try{ const r=await API.post('driverLogin',{username,pin}); driverSetSession(r.token,r.employee); render(); }
    catch(e){ toast(e.message,'err'); btn.disabled=false; btn.innerHTML='<i data-lucide="log-in"></i>เข้าสู่ระบบ'; icons(); }
  };
  el('drvLoginBtn').onclick=go;
  el('drvPin').addEventListener('keydown', e=>{ if(e.key==='Enter') go(); });
}
function driverJobCard(r){
  return `<div class="card mb14">
    <div class="flex between aic"><div><div class="mono strong" style="font-size:16px">${esc(r.RouteID)}</div>
      <div class="small muted">${esc(r.DriverName||'ยังไม่ระบุคนขับ')} · ${esc(r.VehicleName||r.ProviderName||'')}</div></div>${dstatusBadge(r.Status)}</div>
    <div class="flex gap12 small muted" style="margin:12px 0"><span>📍 ${int(r.TotalStops)} จุด</span><span>📦 ${int(r.TotalBoxes)} กล่อง</span><span>🛣️ ${num1(r.TotalDistance)} กม.</span></div>
    <button class="btn btn-primary btn-block big-btn" data-accept="${esc(r.RouteID)}"><i data-lucide="hand"></i>รับงานนี้</button>
  </div>`;
}
ROUTES.driver = async function(view){
  const sess = driverSession();
  if(!sess){ driverLoginForm(view); return; }
  let routes;
  try{ routes = await API.post('getMyRoutes',{token:sess.token, date:Store.date}); }
  catch(e){ driverClearSession(); toast('เซสชันหมดอายุ — กรุณาเข้าสู่ระบบใหม่','warn'); driverLoginForm(view); return; }
  let active = routes.find(r=>r.RouteID===Driver.routeId) || routes.find(r=>r.Status==='In Progress');
  if(!active){
    // หน้ากดรับงาน — เห็นแต่งานที่มอบหมายให้ตัวเองเท่านั้น
    page(view, `<div class="driver">
      ${head('โหมดคนขับ · รับงาน', `${thDate(Store.date)} · ${sess.emp.EmployeeName} · ${routes.length} รอบ`, driverLogoutBtn())}
      ${routes.length
        ? `<div class="notice info mb14"><i data-lucide="hand"></i><div>เลือกงานของคุณแล้วกด <b>รับงานนี้</b> เพื่อเริ่มส่ง</div></div>` + routes.map(driverJobCard).join('')
        : emptyState('ยังไม่มีรอบส่งมอบหมายให้คุณวันนี้','ติดต่อผู้จัดการเพื่อรับงาน หรือให้แอดมินจัด Route ก่อน')}
    </div>`);
    bindDriverLogout(sess);
    $$('[data-accept]',view).forEach(b=>b.onclick=async()=>{ const rid=b.dataset.accept; Driver.routeId=rid;
      const rt=routes.find(x=>x.RouteID===rid);
      // รับงาน = เริ่มรอบทันที → อัปเดตสถานะขึ้นเซิร์ฟเวอร์ ให้ผู้จ่ายงานเห็นว่า "กำลังส่ง"
      if(rt && rt.Status==='Planned'){ try{ await API.post('startRoute',{routeId:rid,token:sess.token}); }catch(e){} }
      render(); toast('รับงาน '+rid+' แล้ว เริ่มส่งได้เลย','ok'); });
    return;
  }
  const stops = await API.get('getRouteStops',{routeId:active.RouteID});
  const done = stops.filter(s=>s.Status==='Completed').length;
  const pct = stops.length? Math.round(done/stops.length*100):0;
  const cur = stops.find(s=>s.Status!=='Completed');
  page(view, `
    <div class="driver">
    ${head(active.RouteID,`${active.DriverName||''} · ${active.VehicleName||''}`,`<button class="btn btn-sm" id="dChange"><i data-lucide="repeat"></i>เปลี่ยนงาน</button>${driverLogoutBtn()}`)}
    <div class="card mb14">
      <div class="flex between aic mb14"><span class="h-card">ความคืบหน้ารอบส่ง</span><span class="strong tab">${done}/${stops.length} จุด</span></div>
      <div class="progress" style="height:14px"><span style="width:${pct}%;background:#10B981"></span></div>
      <div class="flex between mt16" style="margin-top:8px"><span class="small muted">${int(active.TotalBoxes)} กล่อง · ${num1(active.TotalDistance)} กม.</span><span class="small strong">${pct}%</span></div>
    </div>
    ${active.Status==='Planned'?`<button class="btn btn-primary btn-block big-btn mb14" id="dStart"><i data-lucide="play"></i>เริ่มรอบส่ง</button>`:''}
    ${cur?`<div class="card mb14" style="border:2px solid #2563EB">
      <div class="small muted">จุดส่งปัจจุบัน (ลำดับ ${cur.StopOrder})</div>
      <div class="strong" style="font-size:19px;margin:4px 0">${esc(cur.CustomerName)}</div>
      <div class="muted">${esc(cur.BranchName)} · ${int(cur.BoxQty)} กล่อง</div>
      <div class="grid" style="grid-template-columns:1fr 1fr;gap:10px;margin-top:14px">
        <button class="btn big-btn" id="dMap"><i data-lucide="map"></i>เปิดแผนที่</button>
        <button class="btn big-btn" id="dCheckin"><i data-lucide="map-pin"></i>Check-in</button>
        <button class="btn btn-primary big-btn" id="dDone"><i data-lucide="check-circle-2"></i>ส่งเสร็จ</button>
        <button class="btn btn-danger big-btn" id="dFail"><i data-lucide="x-circle"></i>ส่งไม่สำเร็จ</button>
      </div></div>`:`<div class="notice ok mb14"><i data-lucide="party-popper"></i><div>ส่งครบทุกจุดแล้ว! 🎉</div></div>`}
    <div class="card">
      <div class="h-card mb14">รายการจุดส่ง</div>
      ${stops.map(s=>`<div class="flex aic gap8" style="padding:11px 0;border-bottom:1px solid #F3F5F8">
        <span class="stop-num" style="width:28px;height:28px;font-size:12px;background:${s.Status==='Completed'?'#10B981':(s.Status==='Failed'?'#EF4444':'#94A3B8')}">${s.Status==='Completed'?'✓':s.StopOrder}</span>
        <div style="flex:1"><div class="strong" style="font-size:14px">${esc(s.CustomerName)}</div><div class="small muted">${esc(s.BranchName)} · ${int(s.BoxQty)} กล่อง</div></div></div>`).join('')}
    </div></div>
  `);
  bindDriverLogout(sess);
  const dch=el('dChange'); if(dch)dch.onclick=()=>{ Driver.routeId=null; render(); };
  const ds=el('dStart'); if(ds)ds.onclick=async()=>{ ds.disabled=true; try{ await API.post('startRoute',{routeId:active.RouteID,token:sess.token}); }catch(e){} render(); toast('เริ่มรอบส่งแล้ว','ok'); };
  const dm=el('dMap'); if(dm)dm.onclick=()=>{ if(cur&&cur.Latitude) window.open(`https://www.google.com/maps/dir/?api=1&destination=${cur.Latitude},${cur.Longitude}`,'_blank'); };
  const dc=el('dCheckin'); if(dc)dc.onclick=()=>doCheckin(active,cur,sess.token);
  const dd=el('dDone'); if(dd)dd.onclick=()=>podModal('complete',active,cur,sess.token);
  const df=el('dFail'); if(df)df.onclick=()=>podModal('fail',active,cur,sess.token);
};
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
