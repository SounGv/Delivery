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
  const k = dash.kpi || {total:{count:0,boxes:0}}; const c = dash.cost||{}; const f = dash.fleet||{};
  const dels = Store.data.deliveries || [];
  const drafts = dels.filter(d=>d.Status==='Draft');
  const routes = dash.routes || [];
  const kpiCard = (icon, bg, col, lbl, val, unit, footN) => `
    <div class="kpi"><div class="top"><div class="ic" style="background:${bg};color:${col}"><i data-lucide="${icon}"></i></div>
      <div><div class="lbl">${lbl}</div><div class="val"><span class="num tab">${int(val)}</span><span class="unit">${unit}</span></div></div></div>
      <div class="foot">จำนวนกล่อง <b>${int(footN)}</b> กล่อง</div></div>`;
  const costCard = (icon,bg,col,lbl,val)=>`<div class="cost"><div class="lbl">${lbl}</div><div class="val tab">${money(val)}</div><div class="unit">บาท</div><div class="ic" style="background:${bg};color:${col}"><i data-lucide="${icon}"></i></div></div>`;

  page(view, `
    ${head('Dashboard', `ศูนย์ควบคุมการจัดส่ง · ${thDate(Store.date)} · ${int(k.total.count)} งาน · ${int(k.total.boxes)} กล่อง`,
      `<button class="btn btn-sm" data-act="sync"><i data-lucide="refresh-cw"></i>รีเฟรช</button>
       <a class="btn btn-primary btn-sm" href="#/planning"><i data-lucide="route"></i>ไปหน้าจัด Route</a>`)}

    <div class="kpi-row">
      ${kpiCard('clipboard-list','#EFF4FF','#2563EB','งานส่งทั้งหมด',k.total.count,'รายการ',k.total.boxes)}
      ${kpiCard('clock','#FFFBEB','#F59E0B','รอจัด Route',k.draft.count,'รายการ',k.draft.boxes)}
      ${kpiCard('git-fork','#F3EEFF','#7C3AED','วางแผนแล้ว',k.planned.count,'รายการ',k.planned.boxes)}
      ${kpiCard('truck','#EFF4FF','#2563EB','กำลังส่ง',k.inProgress.count,'รายการ',k.inProgress.boxes)}
      ${kpiCard('check-circle-2','#ECFDF5','#10B981','ส่งสำเร็จ',k.completed.count,'รายการ',k.completed.boxes)}
      ${kpiCard('x-circle','#FEF2F2','#EF4444','ส่งไม่สำเร็จ',k.failed.count,'รายการ',k.failed.boxes)}
    </div>

    <div class="card mt16">
      <div class="flex between aic mb14"><span class="h-card">สรุปต้นทุนการจัดส่งวันนี้</span>
        <span class="small muted">พร้อมใช้ ${int(f.available)} · ใช้งาน ${int(f.inUse)} · ออฟไลน์ ${int(f.offline)} คัน</span></div>
      <div class="cost-row">
        ${costCard('wallet','#ECFDF5','#10B981','ต้นทุนรวมวันนี้',c.total)}
        ${costCard('truck','#EFF4FF','#2563EB','ต้นทุนรถบริษัท',c.company)}
        ${costCard('truck-electric','#FFF4E5','#F59E0B','ต้นทุนรถภายนอก',c.external)}
        ${costCard('receipt','#F3EEFF','#7C3AED','ค่าใช้จ่ายอื่นๆ',c.other)}
        ${costCard('pie-chart','#EAF6FA','#0891B2','เฉลี่ยต่อ Route',c.avgPerRoute)}
        ${costCard('map-pin','#FFFBEB','#D97706','เฉลี่ยต่อจุดส่ง',c.avgPerStop)}
        ${costCard('box','#FEF2F2','#EF4444','เฉลี่ยต่อกล่อง',c.avgPerBox)}
      </div>
    </div>

    <div class="grid grid-2 mt16" style="grid-template-columns:1.55fr 1fr">
      <div class="card">
        <div class="flex between aic mb14"><span class="h-card">แผนที่เส้นทางวันนี้</span>
          <span class="pill-live"><span class="dot" style="background:#10B981"></span>${int(f.available+f.inUse)} คัน · ${Store.live?'สด':'ทดลอง'}</span></div>
        <div id="dashMap" class="map" style="height:320px"></div>
      </div>
      <div class="card" style="display:flex;flex-direction:column">
        <div class="flex between aic mb14"><span class="h-card">งานที่ต้องจัด Route</span><a href="#/deliveries">ดูทั้งหมด</a></div>
        <div class="tbl-wrap" style="flex:1">
        ${drafts.length? `<table class="tbl"><thead><tr><th>ลูกค้า</th><th>สาขา</th><th class="r">กล่อง</th><th>Priority</th><th class="r"></th></tr></thead>
          <tbody>${drafts.slice(0,6).map(d=>`<tr><td class="strong">${esc(d.CustomerName)}</td><td class="muted">${esc(d.BranchName)}</td><td class="r tab">${int(d.BoxQty)}</td><td>${priBadge(d.Priority)}</td><td class="r"><a class="btn btn-ghost btn-sm" href="#/planning">จัด Route</a></td></tr>`).join('')}</tbody></table>`
          : emptyState('ไม่มีงานรอจัด Route','ทุกงานถูกวางแผนแล้ว')}
        </div>
        <a class="btn btn-primary btn-block mt16" href="#/planning"><i data-lucide="brain-circuit"></i>จัดลำดับเส้นทางอัตโนมัติ</a>
      </div>
    </div>

    <div class="grid mt16" style="grid-template-columns:1.5fr 1fr">
      <div class="card">
        <div class="h-card mb14">Route วันนี้</div>
        <div class="tbl-wrap">
        ${routes.length? `<table class="tbl"><thead><tr><th>Route ID</th><th>ประเภท</th><th>คนขับ</th><th class="r">จุด</th><th class="r">กล่อง</th><th class="r">ระยะทาง</th><th class="r">ต้นทุน</th><th>สถานะ</th></tr></thead>
          <tbody>${routes.map(r=>`<tr><td><a href="#/rounds" class="mono strong">${esc(r.RouteID)}</a></td>
            <td>${r.RouteType==='EXTERNAL_VEHICLE'?'<span class="badge b-amber">รถภายนอก</span>':'<span class="badge b-blue">รถบริษัท</span>'}</td>
            <td>${esc(r.DriverName||'—')}</td><td class="r tab">${int(r.TotalStops)}</td><td class="r tab">${int(r.TotalBoxes)}</td>
            <td class="r tab">${num1(r.TotalDistance)} กม.</td><td class="r tab strong">${money(r.EstimatedTotalCost)}</td><td>${dstatusBadge(r.Status)}</td></tr>`).join('')}</tbody></table>`
          : emptyState('ยังไม่มี Route วันนี้','เริ่มจัด Route จากหน้าวางแผนเส้นทาง')}
        </div>
      </div>
      <div class="card">
        <div class="h-card mb14">กิจกรรมล่าสุด</div>
        <div style="display:flex;flex-direction:column;gap:12px">
          ${(dash.activities||[]).slice(0,7).map(a=>`<div class="flex gap12" style="align-items:flex-start">
            <div style="width:32px;height:32px;border-radius:9px;background:#EFF4FF;color:#2563EB;display:flex;align-items:center;justify-content:center;flex-shrink:0"><i data-lucide="${actIcon(a.Action)}" style="width:16px;height:16px"></i></div>
            <div style="flex:1"><div style="font-size:13px;color:#1F2533">${esc(a.Description)}</div><div class="small muted">${esc(a.User||'')} · ${ago(a.Timestamp)}</div></div></div>`).join('') || emptyState('ยังไม่มีกิจกรรม')}
        </div>
      </div>
    </div>
  `);

  // map
  setTimeout(()=>{
    if(!el('dashMap')) return;
    const wh = warehouse();
    const map = MapUtil.make('dashMap', wh);
    MapUtil.whMarker(map, wh);
    const pts=[[wh.lat,wh.lng]];
    dels.forEach((d,i)=>{ if(d.Latitude&&d.Longitude){ MapUtil.stopMarker(map,d,i+1,(PRIORITY[d.Priority]||PRIORITY.NORMAL).color); pts.push([+d.Latitude,+d.Longitude]); } });
    (Store._live?Store._live.vehicles:(Store.data.vehicles||[]).map(v=>({...v,lat:v.CurrentLatitude,lng:v.CurrentLongitude,speed:v.CurrentSpeed}))).forEach(v=>{ if(v.lat&&v.lng){ MapUtil.vehMarker(map,v); pts.push([+v.lat,+v.lng]); } });
    if(pts.length>1) map.fitBounds(pts,{padding:[30,30]});
    icons();
  },60);

  view.querySelector('[data-act="sync"]').onclick = async e=>{ e.target.closest('button').disabled=true; await loadBootstrap(); render(); toast('รีเฟรชข้อมูลแล้ว','ok'); };
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
          <td class="r"><button class="btn btn-sm" data-edit="${esc(d.DeliveryID)}"><i data-lucide="pencil"></i></button>
            <button class="btn btn-sm" data-del="${esc(d.DeliveryID)}"><i data-lucide="trash-2"></i></button></td></tr>`).join('')}</tbody></table>`
        : emptyState('ยังไม่มีงานส่งในวันนี้','เพิ่มงานส่งใหม่ หรือเปลี่ยนวันที่','<button class="btn btn-primary" data-act="new2"><i data-lucide="plus"></i>เพิ่มงานส่ง</button>')}
      </div>
    </div>
  `);
  const openForm = (d)=>deliveryForm(d);
  view.querySelector('[data-act="new"]').onclick = ()=>openForm(null);
  const n2=view.querySelector('[data-act="new2"]'); if(n2) n2.onclick=()=>openForm(null);
  view.querySelector('[data-act="csv"]').onclick = ()=>Exporter.csv(rows,'deliveries_'+Store.date);
  $$('[data-edit]',view).forEach(b=>b.onclick=()=>openForm((Store.data.deliveries||[]).find(x=>x.DeliveryID===b.dataset.edit)));
  $$('[data-del]',view).forEach(b=>b.onclick=()=>confirmDialog('ลบงานส่งนี้? (ระบบใช้ soft-delete ข้อมูลจริงไม่ถูกลบ)',async()=>{ await API.post('deleteDelivery',{id:b.dataset.del}); await refresh(); toast('ลบงานส่งแล้ว','ok'); },{danger:true,yes:'ลบ'}));
};
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
    try{ if(isEdit) await API.post('updateDelivery',{id:d.DeliveryID,data}); else await API.post('createDelivery',{data}); m.close(); await refresh(); toast(isEdit?'แก้ไขงานส่งแล้ว':'เพิ่มงานส่งแล้ว','ok'); }
    catch(e){ toast(e.message,'err'); el('fSave').disabled=false; }
  };
}

/* ================================================================
   ROUTE PLANNING — DECISION CENTER  ★
   ================================================================ */
const Plan = { selected:new Set(), result:null, chosen:null, map:null, layer:null };
ROUTES.planning = async function(view){
  const drafts = (Store.data.deliveries||[]).filter(d=>['Draft','Planned'].includes(d.Status) && d.Latitude);
  // keep only valid selections
  Plan.selected = new Set([...Plan.selected].filter(id=>drafts.some(d=>d.DeliveryID===id)));
  const selCount = Plan.selected.size;
  const selDels = drafts.filter(d=>Plan.selected.has(d.DeliveryID));
  const selBoxes = selDels.reduce((n,d)=>n+(+d.BoxQty||0),0);

  page(view, `
    ${head('วางแผนเส้นทาง', `Route Decision Center · ${thDate(Store.date)} · เลือก ${selCount} จุด · ${int(selBoxes)} กล่อง`)}
    <div class="grid plan-3" style="grid-template-columns:320px 1fr 380px;gap:16px;align-items:start">

      <!-- LEFT: deliveries -->
      <div class="card" style="padding:14px">
        <div class="flex between aic mb14"><span class="h-card">งานรอจัด (${drafts.length})</span>
          <button class="btn btn-sm" id="selAll">${selCount===drafts.length&&drafts.length?'ล้าง':'เลือกทั้งหมด'}</button></div>
        <div style="max-height:520px;overflow-y:auto" class="scrolly">
        ${drafts.length? drafts.map(d=>`<div class="check-item ${Plan.selected.has(d.DeliveryID)?'on':''}" data-pick="${esc(d.DeliveryID)}">
          <div class="cbx"><i data-lucide="check"></i></div>
          <div style="flex:1;min-width:0"><div class="strong" style="font-size:13px">${esc(d.CustomerName)}</div>
            <div class="small muted" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(d.BranchName)}</div></div>
          <div style="text-align:right"><div class="tab strong" style="font-size:13px">${int(d.BoxQty)}</div>${priBadge(d.Priority)}</div>
        </div>`).join('') : emptyState('ไม่มีงานรอจัด','เพิ่มงานส่งก่อน')}
        </div>
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
  el('selAll').onclick=()=>{ if(Plan.selected.size===drafts.length){Plan.selected.clear();} else drafts.forEach(d=>Plan.selected.add(d.DeliveryID)); Plan.result=null; render(); };
  const auto=el('autoPlan'); if(auto) auto.onclick=runAutoPlan;
  bindDecisionEvents();
};
function decisionInitial(count, boxes){
  const avail=(Store.data.vehicles||[]).filter(v=>v.VehicleStatus==='Available');
  const cap=avail.reduce((n,v)=>n+(+v.CapacityBox||0),0);
  return `
    <div class="h-card mb14">Route Decision Center</div>
    <div class="notice info mb14"><i data-lucide="info"></i><div>เลือกงานส่งทางซ้าย แล้วกด <b>วางแผน Route อัตโนมัติ</b> ระบบจะจัดลำดับจุดส่ง ตรวจความจุ แนะนำรถ และคำนวณต้นทุนให้</div></div>
    <div style="display:flex;flex-direction:column;gap:8px">
      ${miniStat('จุดส่งที่เลือก', count+' จุด','map-pin')}
      ${miniStat('จำนวนกล่อง', int(boxes)+' กล่อง','box')}
      ${miniStat('รถบริษัทพร้อมใช้', avail.length+' คัน · '+int(cap)+' กล่อง','truck')}
    </div>
    <button class="btn btn-primary btn-block btn-lg mt16" id="autoPlan" ${count?'':'disabled'}><i data-lucide="brain-circuit"></i>วางแผน Route อัตโนมัติ</button>`;
}
function miniStat(l,v,ic){ return `<div class="flex between aic" style="padding:11px 13px;border:1px solid var(--border);border-radius:10px">
  <span class="flex aic gap8"><i data-lucide="${ic}" style="width:18px;height:18px;color:#6B7383"></i><span class="small muted">${l}</span></span>
  <span class="strong tab">${v}</span></div>`; }

function drawPlanMap(selDels, seq){
  if(!Plan.map) return; Plan.layer.clearLayers();
  const wh=warehouse();
  L.marker([wh.lat,wh.lng],{icon:L.divIcon({className:'veh-pin',html:`<div class="veh-dot" style="background:#10B981;border-radius:11px 11px 11px 4px"><i data-lucide="home"></i></div>`,iconSize:[30,30],iconAnchor:[15,15]})}).addTo(Plan.layer).bindPopup('🏭 '+wh.name);
  (Store.data.vehicles||[]).filter(v=>v.CurrentLatitude).forEach(v=>{ const st=VSTATUS[v.VehicleStatus]||VSTATUS.Unknown; L.marker([+v.CurrentLatitude,+v.CurrentLongitude],{icon:L.divIcon({className:'veh-pin',html:`<div class="veh-dot" style="background:${st.dot}"><i data-lucide="truck"></i></div>`,iconSize:[28,28],iconAnchor:[14,14]})}).addTo(Plan.layer).bindPopup(esc(v.VehicleName)); });
  const list = seq || selDels;
  const pts=[[wh.lat,wh.lng]];
  list.forEach((d,i)=>{ if(d.Latitude){ MapUtil.stopMarker(Plan.layer,d,i+1,(PRIORITY[d.Priority]||PRIORITY.NORMAL).color); pts.push([+d.Latitude,+d.Longitude]); } });
  if(seq){ const line=[[wh.lat,wh.lng],...seq.map(s=>[+s.Latitude,+s.Longitude]),[wh.lat,wh.lng]]; L.polyline(line,{color:'#6f9e0a',weight:4,opacity:.85}).addTo(Plan.layer); }
  if(pts.length>1) Plan.map.fitBounds(pts,{padding:[30,30]});
  icons();
}

async function runAutoPlan(){
  const btn=el('autoPlan'); if(btn){btn.disabled=true; btn.innerHTML='<i data-lucide="loader-2" style="animation:spin 1s linear infinite"></i>กำลังวิเคราะห์…'; icons();}
  const drafts=(Store.data.deliveries||[]).filter(d=>Plan.selected.has(d.DeliveryID)&&d.Latitude);
  await new Promise(r=>setTimeout(r,450));
  const seq=Planner.order(drafts);
  const out=Planner.options(seq);
  Plan.result={seq,...out};
  // เลือกอัตโนมัติ: รถแนะนำ > Option ที่รองรับได้และถูกที่สุด > ตัวแรก
  const feasibleCheap = out.options.filter(o=>o.feasible).sort((a,b)=>a.cost.total-b.cost.total)[0];
  Plan.chosen = (out.options.find(o=>o.recommended) || feasibleCheap || out.options[0]).id;
  drawPlanMap(null,seq);
  renderDecision();
}
function renderDecision(){
  const dec=el('decision'); if(!dec||!Plan.result) return;
  const {seq,metrics:m,options}=Plan.result;
  const rec=Planner.recommendVehicle(m.boxes);
  const wh=warehouse();
  const seqHtml = seq.map((s,i)=>`<div class="flex aic gap8" style="padding:7px 0;border-bottom:1px solid #F3F5F8">
    <span class="stop-num" style="width:24px;height:24px;font-size:12px;background:${(PRIORITY[s.Priority]||PRIORITY.NORMAL).color}">${i+1}</span>
    <span style="flex:1;font-size:13px" class="strong">${esc(s.CustomerName)}</span>
    <span class="small muted">${num1(s._distPrev||0)} กม.</span><span class="tab small">${int(s.BoxQty)} กล่อง</span></div>`).join('');

  dec.innerHTML = `
    <div class="flex between aic mb14"><span class="h-card">ผลการวางแผน</span><button class="btn btn-sm" id="replan"><i data-lucide="rotate-cw"></i>ใหม่</button></div>
    <div class="grid" style="grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">
      ${miniStat('จุดส่ง',m.stops+' จุด','map-pin')}
      ${miniStat('กล่อง',int(m.boxes),'box')}
      ${miniStat('ระยะทาง',num1(m.distance)+' กม.','navigation')}
      ${miniStat('เวลา',Math.floor(m.durationMin/60)+':'+String(m.durationMin%60).padStart(2,'0')+' ชม.','clock')}
    </div>

    ${rec?`<div class="opt reco mb14">
      <div class="opt-head"><span class="flex aic gap8"><i data-lucide="star" style="width:18px;height:18px;color:#059669"></i><span class="opt-name">รถที่แนะนำ</span></span><span class="badge b-green">RECOMMENDED</span></div>
      <div class="flex between aic"><div><div class="strong">${esc(rec.VehicleName)}</div><div class="small muted mono">${esc(rec.LicensePlate)}</div></div>
        <div style="text-align:right"><div>${vstatusBadge(rec.VehicleStatus)}</div><div class="small muted mt16" style="margin-top:4px">ห่างคลัง ${num1(rec._distWh||0)} กม. · จุ ${int(rec.CapacityBox)} กล่อง</div></div></div>
    </div>`:`<div class="notice warn mb14"><i data-lucide="alert-triangle"></i><div>ไม่มีรถบริษัทคันเดียวที่รับงานทั้งหมดได้ — พิจารณา Option ด้านล่าง</div></div>`}

    <div class="strong small muted" style="margin-bottom:8px">ทางเลือก Route</div>
    <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:14px">
      ${options.map(o=>optionCard(o)).join('')}
    </div>

    <div class="strong small muted" style="margin-bottom:8px">ลำดับจุดส่งที่แนะนำ</div>
    <div style="max-height:190px;overflow-y:auto;margin-bottom:14px" class="scrolly">${seqHtml}</div>

    <div id="costBox">${costBreakdown(options.find(o=>o.id===Plan.chosen))}</div>

    <button class="btn btn-primary btn-block btn-lg mt16" id="confirmRoute"><i data-lucide="check-circle-2"></i>ยืนยัน Route นี้</button>
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
  </div>`;
}
function costBreakdown(o){
  if(!o||!o.feasible) return `<div class="notice warn"><i data-lucide="alert-triangle"></i><div>Option นี้ความจุไม่พอ กรุณาเลือก Option ที่รองรับงานทั้งหมด</div></div>`;
  const c=o.cost; const row=(l,v)=>`<div class="flex between" style="padding:5px 0;font-size:13px"><span class="muted">${l}</span><span class="tab">${money(v)}</span></div>`;
  return `<div style="border:1px solid var(--border);border-radius:11px;padding:14px">
    <div class="strong mb14">สรุปต้นทุน Route</div>
    ${row('ค่าน้ำมัน (Fuel)',c.fuel)}
    ${row('ค่าทางด่วน (Toll)',c.toll)}
    ${row('ค่าจอดรถ (Parking)',c.parking)}
    ${c.external?row('ค่ารถภายนอก',c.external):''}
    ${c.other?row('ค่าใช้จ่ายอื่น',c.other):''}
    <div class="divider"></div>
    <div class="flex between" style="font-size:15px"><span class="strong">ต้นทุนรวม</span><span class="strong tab" style="color:#2563EB">${money(c.total)} ฿</span></div>
    <div class="flex gap12 mt16" style="margin-top:10px">
      <div style="flex:1;text-align:center;background:#F7FAFF;border-radius:9px;padding:9px"><div class="small muted">ต่อจุด</div><div class="strong tab">${money(c.total/o.stops)}</div></div>
      <div style="flex:1;text-align:center;background:#F7FAFF;border-radius:9px;padding:9px"><div class="small muted">ต่อกล่อง</div><div class="strong tab">${money(c.total/o.boxes)}</div></div>
    </div></div>`;
}
function bindDecisionEvents(){
  const rp=el('replan'); if(rp) rp.onclick=()=>{ Plan.result=null; render(); };
  $$('[data-opt]').forEach(c=>c.onclick=()=>{ Plan.chosen=c.dataset.opt; $$('[data-opt]').forEach(x=>x.classList.toggle('sel',x.dataset.opt===Plan.chosen)); const cb=el('costBox'); if(cb){cb.innerHTML=costBreakdown(Plan.result.options.find(o=>o.id===Plan.chosen)); icons();} });
  const cr=el('confirmRoute'); if(cr) cr.onclick=confirmRoute;
}
async function confirmRoute(){
  const o=Plan.result.options.find(x=>x.id===Plan.chosen);
  if(!o||!o.feasible){ toast('Option นี้ความจุไม่พอ เลือก Option อื่น','warn'); return; }
  const seq=Plan.result.seq, m=Plan.result.metrics;
  const veh=o.vehicles.filter(Boolean)[0]||{};
  const isExt=o.id==='B'&&o.external;
  const emp=(Store.data.employees||[]).find(e=>e.VehicleID===veh.VehicleID);
  const data={ DeliveryDate:Store.date, RouteType:isExt?'EXTERNAL_VEHICLE':'COMPANY_VEHICLE',
    DriverName: veh.CurrentDriver || (emp&&emp.EmployeeName) || (o.external&&o.external.DriverName) || '',
    DriverPhone: emp&&emp.Phone || '', VehicleType: veh.VehicleType||(o.external&&o.external.VehicleType)||'',
    VehicleName: veh.VehicleName||'', LicensePlate: veh.LicensePlate||(o.external&&o.external.LicensePlate)||'',
    ProviderName: o.external?o.external.ProviderName:'', TotalStops:m.stops, TotalBoxes:m.boxes, TotalDistance:m.distance,
    EstimatedDuration:m.durationMin, EstimatedFuelCost:o.cost.fuel, EstimatedTollCost:o.cost.toll,
    EstimatedParkingCost:o.cost.parking, EstimatedExternalCost:o.cost.external||0, EstimatedOtherCost:o.cost.other||0, Status:'Planned' };
  const stops=seq.map(s=>({ DeliveryID:s.DeliveryID, CustomerName:s.CustomerName, BranchName:s.BranchName, Address:s.Address,
    Latitude:s.Latitude, Longitude:s.Longitude, BoxQty:s.BoxQty, DistanceFromPrevious:+(s._distPrev||0).toFixed(1) }));
  const btn=el('confirmRoute'); btn.disabled=true; btn.innerHTML='<i data-lucide="loader-2" style="animation:spin 1s linear infinite"></i>กำลังบันทึก…'; icons();
  try{
    const r=await API.post('confirmRoute',{data,stops});
    toast('สร้าง Route '+r.RouteID+' สำเร็จ · '+m.stops+' จุด','ok','ยืนยัน Route แล้ว');
    Plan.selected.clear(); Plan.result=null;
    await loadBootstrap(); location.hash='#/rounds';
  }catch(e){ toast(e.message,'err'); btn.disabled=false; btn.innerHTML='<i data-lucide="check-circle-2"></i>ยืนยัน Route นี้'; icons(); }
}

/* ================================================================
   ROUNDS (routes + stops)
   ================================================================ */
ROUTES.rounds = async function(view){
  const routes = await API.get('getRoutes',{date:Store.date});
  page(view, `
    ${head('รอบส่งสินค้า', `${thDate(Store.date)} · ${int(routes.length)} Route`,
      `<button class="btn btn-sm" data-act="csv"><i data-lucide="download"></i>CSV</button>`)}
    ${routes.length? `<div style="display:flex;flex-direction:column;gap:14px">${routes.map(routeCard).join('')}</div>`
      : emptyState('ยังไม่มีรอบส่งวันนี้','ไปที่หน้าวางแผนเส้นทางเพื่อสร้าง Route','<a class="btn btn-primary" href="#/planning"><i data-lucide="route"></i>จัด Route</a>')}
  `);
  const csv=view.querySelector('[data-act="csv"]'); if(csv) csv.onclick=()=>Exporter.csv(routes,'routes_'+Store.date);
  $$('[data-route]',view).forEach(b=>b.onclick=()=>openRouteDetail(b.dataset.route));
  $$('[data-start]',view).forEach(b=>b.onclick=async()=>{ await API.post('startRoute',{routeId:b.dataset.start}); await refresh(); toast('เริ่มรอบส่งแล้ว','ok'); });
};
function routeCard(r){
  return `<div class="card">
    <div class="flex between aic wrap" style="margin-bottom:12px">
      <div class="flex aic gap12"><span class="mono strong" style="font-size:16px">${esc(r.RouteID)}</span>
        ${r.RouteType==='EXTERNAL_VEHICLE'?'<span class="badge b-amber">รถภายนอก</span>':'<span class="badge b-blue">รถบริษัท</span>'}${dstatusBadge(r.Status)}</div>
      <div class="flex gap8">
        ${r.Status==='Planned'?`<button class="btn btn-sm" data-start="${esc(r.RouteID)}"><i data-lucide="play"></i>เริ่มรอบ</button>`:''}
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
  const r = (await API.get('getRoutes',{date:Store.date})).find(x=>x.RouteID===id)||{};
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
      <div style="text-align:right">${vstatusBadge(v.VehicleStatus)}<div class="small muted tab" style="margin-top:3px">${int(v.speed)} กม./ชม.</div></div></div>`).join('') : emptyState('ไม่มีรถตามตัวกรอง');
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
  const rows = await API.get('getVehicles');
  page(view, `
    ${head('รถบริษัท', `${int(rows.length)} คัน`, `<button class="btn btn-primary" data-act="new"><i data-lucide="plus"></i>เพิ่มรถ</button>`)}
    <div class="card" style="padding:0"><div class="tbl-wrap">
    <table class="tbl"><thead><tr><th>ชื่อรถ</th><th>ทะเบียน</th><th>ประเภท</th><th class="r">ความจุ</th><th>คนขับ</th><th>สถานะ</th><th>ตำแหน่งล่าสุด</th><th class="r">จัดการ</th></tr></thead>
    <tbody>${rows.map(v=>`<tr>
      <td class="strong">${esc(v.VehicleName)}</td><td class="mono small">${esc(v.LicensePlate)}</td>
      <td>${esc(v.VehicleType)}</td><td class="r tab">${int(v.CapacityBox)} กล่อง</td>
      <td>${v.CurrentDriver?esc(v.CurrentDriver):'<span class="muted">ไม่มีชื่อคนขับ</span>'}</td><td>${vstatusBadge(v.VehicleStatus)}</td>
      <td class="small muted">${v.CurrentLatitude?num1(v.CurrentLatitude)+', '+num1(v.CurrentLongitude):'—'}<br>${v.LastSyncAt?ago(v.LastSyncAt):(v.LastPositionTime?ago(v.LastPositionTime):'')}</td>
      <td class="r"><button class="btn btn-sm" data-edit="${esc(v.VehicleID)}"><i data-lucide="pencil"></i></button>
        <button class="btn btn-sm" data-del="${esc(v.VehicleID)}"><i data-lucide="trash-2"></i></button></td></tr>`).join('')}</tbody></table>
    </div></div>
  `);
  view.querySelector('[data-act="new"]').onclick=()=>vehicleForm(null);
  $$('[data-edit]',view).forEach(b=>b.onclick=()=>vehicleForm(rows.find(x=>x.VehicleID===b.dataset.edit)));
  $$('[data-del]',view).forEach(b=>b.onclick=()=>{ const v=rows.find(x=>x.VehicleID===b.dataset.del);
    confirmDialog(`ลบรถ "${v?v.VehicleName:''}" ? (ใช้ soft-delete — ข้อมูลจริงไม่ถูกลบถาวร กู้คืนได้)`, async()=>{ await API.post('updateVehicle',{id:b.dataset.del,data:{IsDeleted:true}}); await refresh(); toast('ลบรถแล้ว','ok'); }, {danger:true,yes:'ลบ'}); });
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
    if(!data.VehicleName){toast('กรุณากรอกชื่อรถ','warn');return;} el('vSave').disabled=true;
    try{ if(isEdit)await API.post('updateVehicle',{id:v.VehicleID,data}); else await API.post('createVehicle',{data}); m.close(); await refresh(); toast('บันทึกรถแล้ว','ok'); }catch(e){toast(e.message,'err');el('vSave').disabled=false;} };
}

/* ================================================================
   EXTERNAL VEHICLES
   ================================================================ */
ROUTES.external = async function(view){
  const provs = await API.get('getExternalProviders');
  const rows = await API.get('getExternalVehicles');
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
    confirmDialog(`ลบรถภายนอก "${v?v.ProviderName:''}" ? (soft-delete กู้คืนได้)`, async()=>{ await API.post('updateExternalVehicle',{id:b.dataset.del,data:{IsDeleted:true}}); await refresh(); toast('ลบรถภายนอกแล้ว','ok'); }, {danger:true,yes:'ลบ'}); });
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
    if(!data.ProviderName){toast('กรุณากรอกผู้ให้บริการ','warn');return;} el('eSave').disabled=true;
    try{ if(isEdit)await API.post('updateExternalVehicle',{id:v.ExternalVehicleID,data}); else await API.post('createExternalVehicle',{data}); m.close(); await refresh(); toast('บันทึกรถภายนอกแล้ว','ok'); }catch(e){toast(e.message,'err');el('eSave').disabled=false;} };
}

/* ================================================================
   EXPENSES
   ================================================================ */
ROUTES.expenses = async function(view){
  const rows = await API.get('getExpenses',{date:Store.date});
  const routes = await API.get('getRoutes',{date:Store.date});
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
    el('xS').onclick=async()=>{ const data={RouteID:el('xR').value,ExpenseType:el('xT').value,Amount:+el('xA').value||0,Description:el('xD').value.trim(),ExpenseDate:Store.date}; if(!data.Amount){toast('กรอกจำนวนเงิน','warn');return;} el('xS').disabled=true; try{await API.post('createExpense',{data});m.close();await refresh();toast('บันทึกค่าใช้จ่ายแล้ว','ok');}catch(e){toast(e.message,'err');el('xS').disabled=false;} };
  };
};

/* ================================================================
   ADVANCE / CLAIMS (เงินทดรองจ่าย + เคลียร์เงิน)
   ================================================================ */
ROUTES.advance = async function(view){
  const rows = await API.get('getClaims');
  const routes = await API.get('getRoutes',{date:Store.date});
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
    el('aS').onclick=async()=>{ const data={RouteID:el('aR').value,DriverName:el('aDrv').value.trim(),AdvanceAmount:+el('aAdv').value||0,ActualExpense:+el('aAct').value||0}; el('aS').disabled=true; try{await API.post('createClaim',{data});m.close();await refresh();toast('บันทึกการเคลียร์เงินแล้ว','ok');}catch(e){toast(e.message,'err');el('aS').disabled=false;} };
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
  const rows = (await API.get('getCustomers')).filter(c=>matchSearch(c,['CustomerName','BranchName','Address']));
  page(view, `
    ${head('ลูกค้า / สาขา', `${int(rows.length)} รายการ`, `<button class="btn btn-primary" data-act="new"><i data-lucide="plus"></i>เพิ่มลูกค้า</button>`)}
    <div class="card" style="padding:0"><div class="tbl-wrap">
    <table class="tbl"><thead><tr><th>ลูกค้า</th><th>สาขา</th><th>ที่อยู่</th><th>พิกัด</th><th>โทร</th><th class="r"></th></tr></thead>
    <tbody>${rows.map(c=>`<tr><td class="strong">${esc(c.CustomerName)}</td><td>${esc(c.BranchName)}</td><td class="muted small">${esc(c.Address)}</td>
      <td class="mono small">${c.Latitude?num1(c.Latitude)+', '+num1(c.Longitude):'—'}</td><td class="mono small">${esc(c.Phone||'')}</td>
      <td class="r"><button class="btn btn-sm" data-edit="${esc(c.CustomerID)}"><i data-lucide="pencil"></i></button></td></tr>`).join('')||`<tr><td colspan="6">${emptyState('ยังไม่มีลูกค้า')}</td></tr>`}</tbody></table>
    </div></div>
  `);
  const openC=(c)=>customerForm(c);

  view.querySelector('[data-act="new"]').onclick=()=>openC(null);
  $$('[data-edit]',view).forEach(b=>b.onclick=()=>openC(rows.find(x=>x.CustomerID===b.dataset.edit)));
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
  async function saveC(data){
    try{ if(isEdit) await API.post('updateCustomer',{id:c.CustomerID,data}); else await API.post('createCustomer',{data}); m.close(); await refresh(); toast('บันทึกลูกค้าแล้ว','ok'); }
    catch(e){ toast(e.message,'err'); const b=el('cSave'); if(b){b.disabled=false; b.innerHTML='<i data-lucide="check"></i>บันทึก'; icons();} }
  }
}

/* ================================================================
   EMPLOYEES
   ================================================================ */
ROUTES.employees = async function(view){
  const rows = await API.get('getEmployees');
  const veh = await API.get('getVehicles');
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
    confirmDialog(`ลบพนักงาน "${e?e.EmployeeName:''}" ? (soft-delete กู้คืนได้)`, async()=>{ await API.post('updateEmployee',{id:b.dataset.del,data:{IsDeleted:true}}); await refresh(); toast('ลบพนักงานแล้ว','ok'); }, {danger:true,yes:'ลบ'}); });
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
  `, foot:`<button class="btn" id="mpCancel">ยกเลิก</button><button class="btn btn-primary" id="mpSave"><i data-lucide="check"></i>บันทึก</button>`});
  el('mpCancel').onclick=m.close;
  el('mpSave').onclick=async()=>{ const data={ EmployeeName:el('mpName').value.trim(), Phone:el('mpPhone').value.trim(), Role:el('mpRole').value, Status:el('mpStatus').value, VehicleID:el('mpVeh').value };
    if(!data.EmployeeName){ toast('กรอกชื่อพนักงาน','warn'); return; } el('mpSave').disabled=true;
    try{ if(isEdit) await API.post('updateEmployee',{id:e.EmployeeID,data}); else await API.post('createEmployee',{data}); m.close(); await refresh(); toast('บันทึกพนักงานแล้ว','ok'); }catch(err){ toast(err.message,'err'); el('mpSave').disabled=false; } };
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
        <div style="flex:1"></div>
        <div style="align-self:flex-end" class="flex gap8"><button class="btn" id="rCsv"><i data-lucide="download"></i>CSV</button><button class="btn" id="rXls"><i data-lucide="file-spreadsheet"></i>Excel</button></div>
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
    const dist=sum(routes,'TotalDistance'); const stops=sum(routes,'TotalStops'); const boxes=sum(routes,'TotalBoxes');
    // group by date
    const byDate={}; routes.forEach(r=>{ byDate[r.DeliveryDate]=(byDate[r.DeliveryDate]||0)+(+r.EstimatedTotalCost||0); });
    const days=Object.keys(byDate).sort();
    const barData=days.map(d=>({l:thDate(d).replace(/ \d{4}$/,''),v:byDate[d]}));
    const kpi=(l,v,u)=>`<div class="cost"><div class="lbl">${l}</div><div class="val tab">${v}</div><div class="unit">${u||''}</div></div>`;
    el('rBody').innerHTML=`
      <div class="cost-row mb14">
        ${kpi('จำนวนงาน',int(dels.length),'งาน')}${kpi('จำนวน Route',int(routes.length),'route')}${kpi('จุดส่ง',int(stops),'จุด')}
        ${kpi('กล่อง',int(boxes),'กล่อง')}${kpi('ระยะทางรวม',num1(dist),'กม.')}${kpi('ต้นทุนรวม',money(totalCost),'บาท')}
        ${kpi('เฉลี่ย/Route',money(routes.length?totalCost/routes.length:0),'บาท')}
      </div>
      <div class="grid" style="grid-template-columns:1.4fr 1fr;gap:16px">
        <div class="card"><div class="h-card mb14">ต้นทุนรายวัน</div>${Chart.bars(barData,{money:true})}</div>
        <div class="card"><div class="h-card mb14">รถบริษัท vs รถภายนอก</div>${Chart.donut([{l:'รถบริษัท',v:sum(company,'EstimatedTotalCost'),color:'#2563EB'},{l:'รถภายนอก',v:sum(external,'EstimatedTotalCost'),color:'#F59E0B'}])}</div>
      </div>
      <div class="grid mt16" style="grid-template-columns:1fr 1fr;gap:16px">
        <div class="card"><div class="h-card mb14">จำนวน Route / งาน ต่อวัน</div>${Chart.bars(days.map(d=>({l:thDate(d).replace(/ \d{4}$/,''),v:routes.filter(r=>r.DeliveryDate===d).length})),{color:'#7C3AED'})}</div>
        <div class="card"><div class="h-card mb14">ต้นทุนแยกประเภท</div>${Chart.donut([
          {l:'น้ำมัน',v:sum(routes,'EstimatedFuelCost'),color:'#2563EB'},
          {l:'ทางด่วน',v:sum(routes,'EstimatedTollCost'),color:'#0891B2'},
          {l:'จอดรถ',v:sum(routes,'EstimatedParkingCost'),color:'#7C3AED'},
          {l:'รถภายนอก',v:sum(routes,'EstimatedExternalCost'),color:'#F59E0B'},
          {l:'อื่นๆ',v:sum(routes,'EstimatedOtherCost'),color:'#94A3B8'}])}</div>
      </div>
      <div class="card mt16"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Route</th><th>วันที่</th><th>ประเภท</th><th>คนขับ</th><th class="r">จุด</th><th class="r">กล่อง</th><th class="r">ระยะทาง</th><th class="r">ต้นทุน</th><th>สถานะ</th></tr></thead>
        <tbody>${routes.map(r=>`<tr><td class="mono strong">${esc(r.RouteID)}</td><td class="small">${thDate(r.DeliveryDate)}</td><td>${r.RouteType==='EXTERNAL_VEHICLE'?'ภายนอก':'บริษัท'}</td><td>${esc(r.DriverName||'')}</td><td class="r tab">${int(r.TotalStops)}</td><td class="r tab">${int(r.TotalBoxes)}</td><td class="r tab">${num1(r.TotalDistance)}</td><td class="r tab strong">${money(r.EstimatedTotalCost)}</td><td>${dstatusBadge(r.Status)}</td></tr>`).join('')||`<tr><td colspan="9">${emptyState('ไม่มี Route ในช่วงนี้')}</td></tr>`}</tbody></table></div></div>
    `;
    icons();
  }
  el('rGo').onclick=build;
  el('rCsv').onclick=()=>Exporter.csv(last.routes||[],'report_routes');
  el('rXls').onclick=()=>Exporter.excel((last.routes||[]).map(r=>({Route:r.RouteID,วันที่:r.DeliveryDate,ประเภท:r.RouteType,คนขับ:r.DriverName,จุด:r.TotalStops,กล่อง:r.TotalBoxes,ระยะทาง:r.TotalDistance,ต้นทุน:r.EstimatedTotalCost,สถานะ:r.Status})),'report_routes','รายงาน Route');
  build();
};

/* ================================================================
   SETTINGS
   ================================================================ */
ROUTES.settings = async function(view){
  const settings = await API.get('getSettings');
  const url = API.url();
  const group=(g)=>settings.filter(s=>s.Group===g);
  const fieldFor=(s)=>`<div class="field"><label class="label">${esc(s.Label||s.Key)} <span class="mono small muted">(${esc(s.Key)})</span></label><input class="input" data-skey="${esc(s.Key)}" value="${esc(s.Value)}"></div>`;
  page(view, `
    ${head('ตั้งค่าระบบ', 'เชื่อมต่อ Google Apps Script + พารามิเตอร์ระบบ')}
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
  el('apiMock').onclick=async()=>{ API.setUrl(''); await loadBootstrap(); render(); toast('สลับเป็นข้อมูลทดลอง (Mock)','info'); };
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
        <td class="tab">${int(v.CurrentSpeed)} กม./ชม.</td><td>${vstatusBadge(v.VehicleStatus)}</td></tr>`).join('')}</tbody></table>
    </div></div>
  `);
  el('ctTest').onclick=async()=>{ try{ const r=await API.post('syncCartrack',{}); toast(r.ok?('เชื่อมต่อสำเร็จ · '+r.fetched+' คัน'):(r.message||'ทดสอบเสร็จ'), r.ok?'ok':'warn'); }catch(e){toast(e.message,'err');} };
  el('ctSync').onclick=async()=>{ el('ctSync').disabled=true; try{ const r=await API.post('syncCartrack',{}); toast(r.ok?('ซิงก์แล้ว · พบ '+r.fetched+' · แมตช์ '+r.matched):(r.message||'ซิงก์ไม่สำเร็จ'), r.ok?'ok':'warn'); await refresh(); }catch(e){toast(e.message,'err');} el('ctSync').disabled=false; };
};
function ctStat(l,v,ic,col){ return `<div class="card" style="padding:16px"><div class="flex between aic"><div><div class="small muted">${l}</div><div class="strong" style="font-size:18px;margin-top:4px">${v}</div></div><div style="width:40px;height:40px;border-radius:11px;background:${col}15;color:${col};display:flex;align-items:center;justify-content:center"><i data-lucide="${ic}"></i></div></div></div>`; }

/* ================================================================
   DRIVER MOBILE MODE
   ================================================================ */
ROUTES.driver = async function(view){
  const routes = await API.get('getRoutes',{date:Store.date});
  const active = routes.find(r=>r.Status==='In Progress') || routes.find(r=>r.Status==='Planned') || routes[0];
  if(!active){ page(view, `${head('โหมดคนขับ','ไม่มีรอบส่งวันนี้')}${emptyState('ยังไม่มีรอบส่งที่มอบหมาย','ติดต่อผู้จัดการเพื่อรับงาน')}`); return; }
  const stops = await API.get('getRouteStops',{routeId:active.RouteID});
  const done = stops.filter(s=>s.Status==='Completed').length;
  const pct = stops.length? Math.round(done/stops.length*100):0;
  const cur = stops.find(s=>s.Status!=='Completed');
  page(view, `
    <div class="driver">
    ${head(active.RouteID,`${active.DriverName||''} · ${active.VehicleName||''}`)}
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
  const ds=el('dStart'); if(ds)ds.onclick=async()=>{ await API.post('startRoute',{routeId:active.RouteID}); await refresh(); toast('เริ่มรอบส่งแล้ว','ok'); };
  const dm=el('dMap'); if(dm)dm.onclick=()=>{ if(cur&&cur.Latitude) window.open(`https://www.google.com/maps/dir/?api=1&destination=${cur.Latitude},${cur.Longitude}`,'_blank'); };
  const dc=el('dCheckin'); if(dc)dc.onclick=()=>doCheckin(active,cur);
  const dd=el('dDone'); if(dd)dd.onclick=async()=>{ await API.post('completeDelivery',{routeId:active.RouteID,stopOrder:cur.StopOrder,deliveryId:cur.DeliveryID}); await refresh(); toast('บันทึกส่งสำเร็จ','ok'); };
  const df=el('dFail'); if(df)df.onclick=()=>{ const reason=prompt('เหตุผลที่ส่งไม่สำเร็จ:'); if(reason==null)return; API.post('failDelivery',{routeId:active.RouteID,stopOrder:cur.StopOrder,deliveryId:cur.DeliveryID,reason}).then(refresh).then(()=>toast('บันทึกส่งไม่สำเร็จ','warn')); };
};
function doCheckin(route, stop){
  if(!navigator.geolocation){ toast('อุปกรณ์ไม่รองรับ GPS','err'); return; }
  toast('กำลังระบุตำแหน่ง…','info');
  navigator.geolocation.getCurrentPosition(async pos=>{
    const {latitude,longitude,accuracy}=pos.coords;
    const dist = stop.Latitude? haversine(latitude,longitude,+stop.Latitude,+stop.Longitude)*1000 : 9999;
    const r = await API.post('checkIn',{routeId:route.RouteID,stopOrder:stop.StopOrder,deliveryId:stop.DeliveryID,lat:latitude,lng:longitude,accuracy,distanceMeters:dist});
    const msg = {GREEN:'🟢 ถึงจุดส่งแล้ว',YELLOW:'🟡 ใกล้จุดส่ง',RED:'🔴 ยังไม่ถึงจุดส่ง'}[r.proximity]||'Check-in สำเร็จ';
    toast(msg+' (ห่าง '+Math.round(dist)+' ม.)', r.proximity==='GREEN'?'ok':(r.proximity==='YELLOW'?'warn':'err'));
  }, err=>toast('ระบุตำแหน่งไม่ได้: '+err.message,'err'), {enableHighAccuracy:true,timeout:10000});
}
