// TRCloud RESTful API client — pull Sale Orders into dispatch-center as Deliveries.
// Auth + wire format notes: see git history / comments below.
//
// Auth: company_id/passkey/securekey/timestamp, where
//   securekey = MD5(encrypt_head + "t" + timestamp)
// Secrets: TRCLOUD_PASSKEY, TRCLOUD_ENCRYPT_HEAD (Pages secrets).
const { md5 } = require('../util/md5');
const writes = require('./writes');
const { toFrontend } = require('../serialize');

const BASE = 'https://gv.trcloud.co/application/api-connector2/end-point';
const COMPANY_ID = 2;
/** Sale Order document groups we pull into Dispatch (KSO + BigSeller BSO, …) */
const DEFAULT_SO_FORMATS = ['KSO', 'BSO'];

function normalizeSoFormats(p) {
  if (Array.isArray(p && p.companyFormats) && p.companyFormats.length) {
    return p.companyFormats.map((f) => String(f || '').trim().toUpperCase()).filter(Boolean);
  }
  if (p && p.companyFormat) {
    return String(p.companyFormat).split(/[,+\s]+/).map((f) => f.trim().toUpperCase()).filter(Boolean);
  }
  return DEFAULT_SO_FORMATS.slice();
}

function formatFromInvoice(inv) {
  const m = String(inv || '').match(/^([A-Z]+)/i);
  return m ? m[1].toUpperCase() : '';
}

function authFields(env) {
  const timestamp = Math.floor(Date.now() / 1000);
  const securekey = md5(env.TRCLOUD_ENCRYPT_HEAD + 't' + timestamp);
  return { company_id: COMPANY_ID, passkey: env.TRCLOUD_PASSKEY, securekey, timestamp };
}

function configured(env) {
  return !!(env.TRCLOUD_PASSKEY && env.TRCLOUD_ENCRYPT_HEAD);
}

async function post(env, path, data) {
  if (!configured(env)) throw new Error('TRCLOUD_PASSKEY/TRCLOUD_ENCRYPT_HEAD ยังไม่ได้ตั้งค่า');
  const payload = Object.assign(authFields(env), data);
  const body = new URLSearchParams({ json: JSON.stringify(payload) });
  const res = await fetch(`${BASE}/${path}`, {
    method: 'POST',
    headers: {
      Origin: env.TRCLOUD_API_ORIGIN || 'https://gadgetvilla-delivery.pages.dev',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });
  const text = await res.text();
  let result;
  try { result = JSON.parse(text); } catch (e) { return { httpStatus: res.status, raw: text }; }
  if (!result.success) throw new Error(`TRCloud API error (${path}): ${result.message || JSON.stringify(result)}`);
  return result;
}

async function searchOrders(env, { dateFrom, dateTo, status, approveStatus, limit, companyFormat } = {}) {
  const data = { company_format: companyFormat || 'KSO', start: 0, limit: limit || 200 };
  if (dateFrom) data['date-from'] = dateFrom;
  if (dateTo) data['date-to'] = dateTo;
  if (status) data.status = status;
  if (approveStatus) data.approve_status = approveStatus;
  return post(env, 'so/search.php', data);
}

async function readOrder(env, id) {
  return post(env, 'so/read.php', { id: String(id) });
}

async function formPost(env, path, formFields) {
  const body = new URLSearchParams(formFields);
  const res = await fetch(`${BASE}/${path}`, {
    method: 'POST',
    headers: {
      Origin: env.TRCLOUD_API_ORIGIN || 'https://gadgetvilla-delivery.pages.dev',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });
  const text = await res.text();
  let result;
  try { result = JSON.parse(text); } catch (e) { return { httpStatus: res.status, raw: text, success: 0 }; }
  return result;
}

function blank(v) {
  if (v == null) return '';
  const s = String(v);
  return s === '0000-00-00' || s === 'null' || s === 'undefined' ? '' : s;
}

/**
 * Build so/update.php document fields from a so/read response.
 * Official connector docs use the same shape as create (+ id), flat under auth —
 * not a tiny patch of status_* alone (that returns check_require data error).
 */
function buildSoUpdateDoc(doc, overrides) {
  const h = soHead(doc) || {};
  const lines = Array.isArray(doc && doc.body) ? doc.body : [];
  const other = parseOther(h.other);
  const fields = {
    issue_date: blank(h.issue_date) || new Date().toISOString().slice(0, 10),
    delivery_due: blank(h.delivery_due) || blank(h.issue_date) || new Date().toISOString().slice(0, 10),
    company_format: blank(h.company_format) || 'KSO',
    document_number: blank(h.document_number),
    payment_term: blank(h.payment_term || other.payment_term || other.credit_term),
    reference: blank(h.reference),
    discount: blank(h.discount != null ? h.discount : other.discount) || '0',
    wht: blank(h.wht) || '',
    tax_option: blank(h.tax_option) || 'in',
    staff: blank(h.salesman || h.staff),
    department: blank(h.department),
    project: blank(h.project),
    warehouse: blank(h.warehouse),
    url: blank(h.url),
    invoice_note: blank(h.invoice_note),
    status: blank(h.status) || 'Success',
    approve_id: blank(h.approve_id) || '0',
    approve_status: blank(h.approve_status),
    c1: '',
    anchor: blank(h.anchor),
    fx: blank(h.fx),
    rate: blank(h.rate) || '1',
    quotation: blank(h.quotation),
    shipping_to: blank(other.shipping_to || h.shipping_to || h.delivery_to),
    shipping_address: blank(other.shipping_address || h.shipping_address),
    customer: {
      group_code: 'C',
      code_number: '',
      name: blank(h.name),
      organization: blank(h.organization),
      branch: blank(h.branch) || '00000',
      address: blank(h.address),
      email: blank(h.email),
      telephone: blank(h.telephone),
      tax_id: blank(h.tax_id),
      contact_type: 'normal',
      contact_id: blank(h.contact_id) || '0',
      add_contact: blank(h.contact_id) && blank(h.contact_id) !== '0' ? '0' : '1',
    },
    product: lines.map((line) => ({
      product_id: blank(line.product_id),
      product: blank(line.description || line.product),
      price: blank(line.price),
      quantity: blank(line.quantity),
      discount: blank(line.discount),
      vat: blank(line.vat),
    })),
  };
  return Object.assign(fields, overrides || {});
}

async function updateOrder(env, id, fieldsOrOverrides, opts) {
  if (!configured(env)) throw new Error('TRCLOUD_PASSKEY/TRCLOUD_ENCRYPT_HEAD ยังไม่ได้ตั้งค่า');
  const idStr = String(id);
  const options = opts || {};
  let docFields = fieldsOrOverrides || {};
  // Wire format (confirmed live): auth + id + create-shaped fields FLAT in `json`.
  // Nested `data` → check_require error. status_deliver/ship/pack are ignored by API.
  if (!options.raw && (options.fromDoc || docFields.customer == null || docFields.product == null)) {
    const doc = options.fromDoc || await readOrder(env, idStr);
    docFields = buildSoUpdateDoc(doc, options.overrides || (docFields.customer ? {} : docFields));
  }
  const result = await formPost(env, 'so/update.php', {
    json: JSON.stringify(Object.assign(authFields(env), { id: idStr }, docFields)),
  });
  if (result && result.success) return result;
  throw new Error(`TRCloud API error (so/update.php): ${(result && result.message) || JSON.stringify(result)}`);
}

async function searchInvoices(env, { dateFrom, dateTo, limit, companyFormat, keyword } = {}) {
  const data = { company_format: companyFormat || 'IV', start: 0, limit: limit || 100 };
  if (dateFrom) data['date-from'] = dateFrom;
  if (dateTo) data['date-to'] = dateTo;
  if (keyword) data.keyword = keyword;
  return post(env, 'iv/search.php', data);
}

async function readInvoice(env, id) {
  return post(env, 'iv/read.php', { id: String(id) });
}

function buildIvUpdateDoc(doc, overrides) {
  const h = soHead(doc) || {};
  const lines = Array.isArray(doc && doc.body) ? doc.body : [];
  const other = parseOther(h.other);
  const fields = {
    issue_date: blank(h.issue_date) || new Date().toISOString().slice(0, 10),
    due_date: blank(h.due_date || h.delivery_due) || blank(h.issue_date),
    company_format: blank(h.company_format) || 'IV',
    document_number: blank(h.invoice_number || h.document_number),
    payment_term: blank(h.payment_term || other.payment_term || other.credit_term),
    reference: blank(h.reference),
    discount: blank(h.discount != null ? h.discount : other.discount) || '0',
    wht: blank(h.wht) || '',
    tax_option: blank(h.tax_option) || 'in',
    staff: blank(h.salesman || h.staff),
    department: blank(h.department),
    project: blank(h.project),
    warehouse: blank(h.warehouse),
    url: blank(h.url),
    invoice_note: blank(h.invoice_note),
    approve_id: blank(h.approve_id) || '0',
    approve_status: blank(h.approve_status),
    type: blank(h.type) || '',
    c1: '',
    anchor_dr: blank(h.anchor_dr || h.anchor),
    customer: {
      group_code: 'C',
      code_number: '',
      name: blank(h.name),
      organization: blank(h.organization),
      branch: blank(h.branch) || '00000',
      address: blank(h.address),
      email: blank(h.email),
      telephone: blank(h.telephone),
      tax_id: blank(h.tax_id),
      contact_type: 'normal',
      contact_id: blank(h.contact_id) || '0',
      add_contact: blank(h.contact_id) && blank(h.contact_id) !== '0' ? '0' : '1',
    },
    product: lines.map((line) => ({
      product_id: blank(line.product_id),
      product: blank(line.description || line.product),
      price: blank(line.price),
      quantity: blank(line.quantity),
      discount: blank(line.discount),
      vat: blank(line.vat),
    })),
  };
  return Object.assign(fields, overrides || {});
}

async function updateInvoice(env, id, opts) {
  const idStr = String(id);
  const options = opts || {};
  const doc = options.fromDoc || await readInvoice(env, idStr);
  const docFields = buildIvUpdateDoc(doc, options.overrides || {});
  const result = await formPost(env, 'iv/update.php', {
    json: JSON.stringify(Object.assign(authFields(env), { id: idStr }, docFields)),
  });
  if (result && result.success) return result;
  throw new Error(`TRCloud API error (iv/update.php): ${(result && result.message) || JSON.stringify(result)}`);
}

function extractConsequentialDocRef(message) {
  const text = String(message || '');
  const m = text.match(/\b([A-Z]{2,4}\d{6,})\b/);
  return m ? m[1] : '';
}

async function findInvoiceIdByRef(env, ref, aroundDate, soInvoiceNo) {
  if (!ref && !soInvoiceNo) return '';
  const base = aroundDate && aroundDate !== 'Invalid' ? new Date(aroundDate) : new Date();
  const from = new Date(base.getTime() - 14 * 864e5).toISOString().slice(0, 10);
  const to = new Date(base.getTime() + 3 * 864e5).toISOString().slice(0, 10);
  const formats = ['IV', 'KIV'];
  if (ref) {
    const prefix = String(ref).replace(/\d+$/, '');
    if (prefix && formats.indexOf(prefix) < 0) formats.unshift(prefix);
  }
  for (const companyFormat of formats) {
    try {
      const search = await searchInvoices(env, {
        dateFrom: from,
        dateTo: to,
        limit: 200,
        companyFormat,
        keyword: ref || soInvoiceNo || '',
      });
      const rows = Array.isArray(search.result) ? search.result : [];
      const hit = rows.find((r) => {
        const refNo = String(r.ref_no || '');
        const num = String(r.invoice_number || r.document_number || '');
        const fmt = String(r.company_format || companyFormat);
        const qo = String(r.quotation || '');
        return (ref && (refNo === ref || (fmt + num) === ref || num === String(ref).replace(/^[A-Z]+/i, '')))
          || (soInvoiceNo && (qo === soInvoiceNo || refNo === soInvoiceNo));
      });
      if (hit) return String(hit.invoice_id || hit.quotation_id || hit.id || hit.doc || '');
    } catch (_) { /* try next format */ }
  }
  return '';
}

/** Debug helper — confirm flat-full SO update + note writeback */
async function debugUpdateProbe(env, p) {
  const id = String(p.id || '');
  if (!id) throw new Error('id required');
  const doc = await readOrder(env, id);
  const stamp = 'Dispatch probe ' + new Date().toISOString().slice(0, 16);
  try {
    const result = await updateOrder(env, id, null, {
      fromDoc: doc,
      overrides: { invoice_note: stamp },
    });
    const after = await readOrder(env, id);
    const h = soHead(after) || {};
    return {
      winning: 'flat_full_docs',
      result,
      after: {
        status_deliver: h.status_deliver,
        status_ship: h.status_ship,
        invoice_note: h.invoice_note,
      },
      note: 'status_deliver is not writable via so/update.php (API ignores it); invoice_note works when SO is not locked by IV',
    };
  } catch (e) {
    const msg = String((e && e.message) || e);
    const ivRef = extractConsequentialDocRef(msg);
    return { ok: false, error: msg, consequentialDoc: ivRef };
  }
}

function parseTrcIdFromNote(note) {
  const m = String(note || '').match(/TRC#(\d+)/i);
  return m ? m[1] : '';
}

async function resolveSoId(env, delivery) {
  const fromNote = parseTrcIdFromNote(delivery.note || delivery.Note);
  if (fromNote) return fromNote;
  const inv = String(delivery.invoice_no || delivery.InvoiceNo || '').trim();
  const date = String(delivery.delivery_date || delivery.DeliveryDate || '').slice(0, 10);
  if (!inv) return '';
  const base = date && date !== 'Invalid' ? new Date(date) : new Date();
  const from = new Date(base.getTime() - 14 * 864e5).toISOString().slice(0, 10);
  const to = new Date(base.getTime() + 3 * 864e5).toISOString().slice(0, 10);
  const preferred = formatFromInvoice(inv);
  const formats = preferred
    ? [preferred, ...DEFAULT_SO_FORMATS.filter((f) => f !== preferred)]
    : DEFAULT_SO_FORMATS.slice();
  for (const companyFormat of formats) {
    try {
      const search = await searchOrders(env, { dateFrom: from, dateTo: to, limit: 300, companyFormat });
      const rows = Array.isArray(search.result) ? search.result : [];
      const hit = rows.find((r) => {
        const ref = invoiceFromSo(r);
        const num = String(r.document_number || '');
        return ref === inv || r.ref_no === inv || (num && inv.endsWith(num));
      });
      if (hit) return String(hit.quotation_id);
    } catch (_) { /* try next format */ }
  }
  return '';
}

/**
 * ตอนส่งสำเร็จใน Dispatch → เขียนกลับ TRCloud
 * - so/update ไม่รับ status_deliver (ignore) แต่รับ invoice_note ได้ถ้า SO ยังไม่ถูกออก IV
 * - ถ้า SO ถูกล็อกเพราะมี IV แล้ว → เขียน invoice_note ลง IV แทน
 */
async function markSoDelivered(env, deliveryRow) {
  if (!configured(env)) return { ok: false, skipped: true, reason: 'no_credentials' };
  const id = await resolveSoId(env, deliveryRow);
  if (!id) {
    return { ok: false, skipped: true, reason: 'so_not_found', invoiceNo: deliveryRow.invoice_no || deliveryRow.InvoiceNo };
  }
  const doc = await readOrder(env, id);
  const h = soHead(doc) || {};
  const qty = Math.max(1, Math.round(Number(h.sum_quantity) || Number(deliveryRow.box_qty || deliveryRow.BoxQty) || 1));
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const marker = 'Dispatch ส่งสำเร็จ ' + stamp;
  const invNote = [blank(h.invoice_note), marker].filter(Boolean).join(' · ');
  const invoiceNo = invoiceFromSo(h);

  try {
    const result = await updateOrder(env, id, null, {
      fromDoc: doc,
      overrides: {
        // API ignores these today; kept in case TRCloud enables them later
        status_deliver: String(qty),
        status_ship: String(qty),
        invoice_note: invNote,
      },
    });
    return { ok: true, target: 'so', trcloudId: id, invoiceNo, qty, result, note: invNote };
  } catch (e) {
    const msg = String((e && e.message) || e);
    const ivRef = extractConsequentialDocRef(msg);
    if (!/Cannot Modify|consequential/i.test(msg) && !ivRef) {
      return { ok: false, error: msg, trcloudId: id, invoiceNo };
    }
    try {
      const ivId = await findInvoiceIdByRef(env, ivRef, blank(h.issue_date), invoiceNo);
      if (!ivId) {
        return {
          ok: false,
          error: msg,
          trcloudId: id,
          invoiceNo,
          consequentialDoc: ivRef,
          reason: 'iv_not_found',
        };
      }
      const ivDoc = await readInvoice(env, ivId);
      const ivHead = soHead(ivDoc) || {};
      const ivNote = [blank(ivHead.invoice_note), marker + (invoiceNo ? ' (' + invoiceNo + ')' : '')].filter(Boolean).join(' · ');
      const result = await updateInvoice(env, ivId, {
        fromDoc: ivDoc,
        overrides: {
          invoice_note: ivNote,
          status_deliver: String(qty),
          status_ship: String(qty),
        },
      });
      return {
        ok: true,
        target: 'iv',
        trcloudId: id,
        ivId,
        consequentialDoc: ivRef,
        invoiceNo,
        qty,
        result,
        note: ivNote,
        warn: 'SO locked by IV — wrote delivery note on invoice instead',
      };
    } catch (e2) {
      return {
        ok: false,
        error: String((e2 && e2.message) || e2),
        trcloudId: id,
        invoiceNo,
        consequentialDoc: ivRef,
        soError: msg,
      };
    }
  }
}

async function pushDeliveryCompleted(env, deliveryId) {
  if (!deliveryId) return { ok: false, skipped: true, reason: 'no_delivery_id' };
  const row = await env.DB.prepare('select * from deliveries where delivery_id = ?1 and is_deleted = 0').bind(deliveryId).first();
  if (!row) return { ok: false, skipped: true, reason: 'delivery_missing' };
  const inv = String(row.invoice_no || '');
  const note = String(row.note || '');
  const looksTrc = /^(KSO|BSO)/i.test(inv) || /TRCloud|TRC#/i.test(note);
  if (!looksTrc) return { ok: false, skipped: true, reason: 'not_trcloud_order', invoiceNo: inv };
  return markSoDelivered(env, row);
}

function parseOther(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch (e) { return {}; }
}

function invoiceFromSo(h) {
  if (!h) return '';
  if (h.ref_no) return String(h.ref_no).trim();
  const fmt = h.company_format || 'KSO';
  const num = h.document_number || '';
  return (fmt + num).trim();
}

function soHead(doc) {
  if (!doc) return null;
  if (doc.head) return doc.head;
  return doc;
}

/** Normalize SO line array from so/read (body[]) or nested product lists */
function soLines(doc) {
  const body = doc && doc.body;
  if (Array.isArray(body)) return body;
  if (body && Array.isArray(body.product)) return body.product;
  if (body && Array.isArray(body.products)) return body.products;
  if (body && Array.isArray(body.items)) return body.items;
  return [];
}

/**
 * Map TRCloud column «จำนวน» → Dispatch quantity.
 * Prefer sum of line `quantity` (same as UI จำนวน); fall back to head.sum_quantity.
 * This is piece qty (pcs), NOT shipping cartons — UI labels use «จำนวน (ชิ้น)».
 */
function pieceQtyFrom(h, doc) {
  const lines = soLines(doc);
  if (lines.length) {
    const q = lines.reduce((n, p) => n + (Number(p.quantity) || 0), 0);
    if (q > 0) return Math.max(1, Math.round(q));
  }
  const sum = Number(h && h.sum_quantity);
  if (Number.isFinite(sum) && sum > 0) return Math.max(1, Math.round(sum));
  return 1;
}

function fmtMoney(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return '';
  return x.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

/** รวมทั้งสิ้นจาก SO — ตรงกับคอลัมน์ «รวมทั้งสิ้น» ใน TRCloud (รวม VAT) */
function amountFromSo(h, doc) {
  const candidates = [
    h && h.grand_total,
    h && h.payment,
    h && h.total,
    h && h.amount,
    h && h.sum_amount,
  ];
  for (const c of candidates) {
    const n = Number(c);
    if (Number.isFinite(n) && n > 0) return Math.round(n * 100) / 100;
  }
  const lines = soLines(doc);
  if (lines.length) {
    const sum = lines.reduce((acc, p) => {
      const lineTotal = Number(p.total);
      if (Number.isFinite(lineTotal) && lineTotal > 0) return acc + lineTotal;
      const qty = Number(p.quantity) || 0;
      const price = Number(p.price) || 0;
      return acc + qty * price;
    }, 0);
    if (sum > 0) return Math.round(sum * 100) / 100;
  }
  return null;
}

/** Short line list for note: product × qty @ price (คอลัมน์ จำนวน + ราคา ไม่รวมภาษี) */
function soLinesNote(doc, limit) {
  const lines = soLines(doc);
  if (!lines.length) return '';
  const max = Math.min(lines.length, limit || 6);
  const parts = [];
  for (let i = 0; i < max; i++) {
    const p = lines[i];
    const name = String(p.description || p.product || p.product_id || 'สินค้า').trim();
    const short = name.length > 42 ? name.slice(0, 40) + '…' : name;
    const qty = Number(p.quantity) || 0;
    const price = fmtMoney(p.price);
    const unit = blank(p.unit) || 'pcs';
    parts.push(short + ' × ' + qty + ' ' + unit + (price ? (' @ ' + price) : ''));
  }
  if (lines.length > max) parts.push('…อีก ' + (lines.length - max) + ' รายการ');
  return parts.join(' | ');
}

/** Map TRCloud SO head (+ optional read body) → Delivery frontend fields */
function mapSoToDelivery(doc) {
  const h = soHead(doc) || {};
  const lines = soLines(doc);
  const other = parseOther(h.other);
  const shipping = other.shipping_address || h.shipping_address || '';
  const shipTo = other.shipping_to || h.delivery_to || '';
  const dueRaw = h.delivery_due && h.delivery_due !== '0000-00-00' ? String(h.delivery_due).slice(0, 10) : '';
  const issued = (h.issue_date || '').slice(0, 10);
  const due = dueRaw || issued;
  const inv = invoiceFromSo(h);
  const poNo = blank(h.reference || h.ecommerce_reference || other.reference || other.po || other.po_no).trim();
  const trcId = String(h.quotation_id || (doc && doc.id) || h.id || '');
  const pieceQty = pieceQtyFrom(h, doc);
  const amount = amountFromSo(h, doc);
  const linesNote = soLinesNote(doc, 6);
  const noteParts = [
    h.invoice_note,
    shipTo ? ('ส่งถึง: ' + shipTo) : '',
    h.salesman ? ('พนักงานขาย: ' + h.salesman) : '',
    poNo ? ('PO: ' + poNo) : '',
    lines.length ? ('รายการสินค้า ' + lines.length + ' แถว · รวม ' + pieceQty + ' ชิ้น') : '',
    linesNote ? ('สินค้า: ' + linesNote) : '',
    inv ? ('TRCloud ' + inv) : '',
    trcId ? ('TRC#' + trcId) : '',
  ].filter(Boolean);
  return {
    InvoiceNo: inv,
    PoNo: poNo,                                 // เลขที่ PO ลูกค้า (TRCloud reference)
    // วันทำงานใน Dispatch (อาจถูกเลื่อนจากงานค้าง) — เริ่มจากกำหนดส่ง
    DeliveryDate: due || issued || new Date().toISOString().slice(0, 10),
    DocumentDate: issued || '',                 // วันที่ออกเอกสาร / เปิดบิล
    DueDate: dueRaw || issued || '',            // กำหนดส่งของ
    CustomerName: (h.organization || h.name || '').trim() || 'ไม่ระบุลูกค้า',
    BranchName: (h.branch || '').trim(),
    Address: (shipping || h.address || '').trim(),
    Amount: amount,                             // รวมทั้งสิ้น (grand_total)
    // DB column still box_qty — value = TRCloud «จำนวน» (ชิ้น)
    BoxQty: pieceQty,
    Priority: 'NORMAL',
    Note: noteParts.join(' · '),
    _trcloudId: trcId,
    _lineCount: lines.length,
    _pieceQty: pieceQty,
  };
}

async function findByInvoice(DB, invoiceNo) {
  if (!invoiceNo) return null;
  return DB.prepare(
    'select * from deliveries where invoice_no = ?1 and is_deleted = 0 order by created_at desc limit 1'
  ).bind(invoiceNo).first();
}

async function matchCustomerCoords(DB, customerName, branchName) {
  if (!customerName) return null;
  let row = null;
  if (branchName) {
    row = await DB.prepare(
      'select latitude, longitude, address, branch_name from customers where is_deleted = 0 and customer_name = ?1 and branch_name = ?2 limit 1'
    ).bind(customerName, branchName).first();
  }
  if (!row) {
    row = await DB.prepare(
      'select latitude, longitude, address, branch_name from customers where is_deleted = 0 and customer_name = ?1 limit 1'
    ).bind(customerName).first();
  }
  if (!row) return null;
  return {
    Latitude: row.latitude, Longitude: row.longitude,
    Address: row.address || undefined, BranchName: row.branch_name || undefined,
  };
}

async function setLastSync(env, iso) {
  await writes.updateSetting(env, {
    key: 'TRCLOUD_LAST_SYNC', value: iso || new Date().toISOString(),
    group: 'trcloud', label: 'TRCloud ซิงก์ล่าสุด', user: 'trcloud',
  });
}

/**
 * Upsert one SO into deliveries.
 * - New invoice → createDelivery (Draft + geocode)
 * - Existing Draft/Pending → update fields
 * - Existing Planned/In Progress/Completed → skip (don't overwrite live work)
 */
async function upsertDeliveryFromSo(env, doc, { user, skipGeocode, workDate } = {}) {
  const data = mapSoToDelivery(doc);
  if (!data.InvoiceNo) return { action: 'error', error: 'ไม่มีเลขบิล/เลขที่ SO' };

  // วันทำงาน — บิลใหม่เลื่อนเข้าคิว; บิลเก่าเกินช่วง carry → Completed
  applyWorkDatePolicy(data, workDate, 2);

  const existing = await findByInvoice(env.DB, data.InvoiceNo);
  const coords = await matchCustomerCoords(env.DB, data.CustomerName, data.BranchName);
  if (coords) {
    if (coords.Latitude && coords.Longitude) {
      data.Latitude = coords.Latitude;
      data.Longitude = coords.Longitude;
    }
    if (!data.Address && coords.Address) data.Address = coords.Address;
    if (!data.BranchName && coords.BranchName) data.BranchName = coords.BranchName;
  }

  const locked = existing && !['Draft', 'Pending', ''].includes(existing.status || '');
  if (existing && locked) {
    return { action: 'skipped', reason: 'already_' + (existing.status || 'locked'), deliveryId: existing.delivery_id, invoiceNo: data.InvoiceNo };
  }

  // Batch sync skips geocode (slow); webhook/single import still geocodes when needed
  const noGeo = skipGeocode === true || !!(data.Latitude && data.Longitude);

  if (existing) {
    const patch = {
      DeliveryDate: data.DeliveryDate,
      DocumentDate: data.DocumentDate || existing.document_date || '',
      DueDate: data.DueDate || existing.due_date || '',
      PoNo: data.PoNo || existing.po_no || '',
      CustomerName: data.CustomerName,
      BranchName: data.BranchName,
      Address: data.Address,
      BoxQty: data.BoxQty,
      Note: data.Note,
    };
    if (data.Amount != null && data.Amount > 0) patch.Amount = data.Amount;
    if (data.Status === 'Completed') patch.Status = 'Completed';
    if (data.Latitude) patch.Latitude = data.Latitude;
    if (data.Longitude) patch.Longitude = data.Longitude;
    const rec = await writes.updateDelivery(env, { id: existing.delivery_id, data: patch, user: user || 'trcloud', skipGeocode: noGeo });
    return { action: 'updated', delivery: rec, invoiceNo: data.InvoiceNo, trcloudId: data._trcloudId };
  }

  const rec = await writes.createDelivery(env, { data, user: user || 'trcloud', skipGeocode: noGeo });
  return { action: 'created', delivery: rec, invoiceNo: data.InvoiceNo, trcloudId: data._trcloudId };
}

async function importById(env, id, opts) {
  const doc = await readOrder(env, id);
  return upsertDeliveryFromSo(env, doc, Object.assign({ skipGeocode: false }, opts || {}));
}

/** Short note for bulk sync — avoid bloating D1 / Worker CPU on JSON */
function mapSoToDeliveryLight(doc) {
  const data = mapSoToDelivery(doc);
  const inv = data.InvoiceNo || '';
  const po = data.PoNo || '';
  const trc = data._trcloudId ? ('TRC#' + data._trcloudId) : '';
  const bits = [
    po ? ('PO ' + po) : '',
    inv ? ('SO ' + inv) : '',
    trc,
    data._pieceQty ? (data._pieceQty + ' ชิ้น') : '',
  ].filter(Boolean);
  data.Note = bits.join(' · ').slice(0, 180);
  return data;
}

/**
 * วันทำงาน: เลื่อนบิลล่าสุด (≤ lookback วัน) เข้าคิววันนี้
 * บิลเก่าเกินนั้น → Completed (ส่งเสร็จแล้วก่อนอัปเดต/ไม่ได้จัดในระบบ)
 */
function applyWorkDatePolicy(data, workDate, lookback) {
  const work = workDate ? String(workDate).slice(0, 10) : '';
  if (!work) {
    if (!data.Status) data.Status = 'Draft';
    return data;
  }
  const { daysBetween, CARRY_OPEN_DAYS } = require('./reads');
  const carry = Math.max(Number(lookback) || 0, CARRY_OPEN_DAYS || 2);
  const anchor = String(data.DueDate || data.DocumentDate || data.DeliveryDate || '').slice(0, 10);
  if (anchor && daysBetween(anchor, work) > carry) {
    data.Status = 'Completed';
    data.DeliveryDate = anchor;
    return data;
  }
  if (anchor && anchor < work) data.DeliveryDate = work;
  if (!data.Status) data.Status = 'Draft';
  return data;
}

/**
 * Fast bulk sync: search rows only (no so/read), preload invoices once,
 * D1 batch writes — avoids per-row updateDelivery CPU that triggers CF 1102/503.
 */
async function syncOrders(env, p = {}) {
  const { todayStr, addDays, normInvoiceNo, deliveryRowRank } = require('./reads');
  const today = todayStr();
  const dateTo = p.dateTo || today;
  // ดึงย้อนหลัง (ค่าเริ่ม 2 วัน) เพื่อให้บิลเสาร์–อาทิตย์ โผล่วันจันทร์
  const lookback = p.lookbackDays != null ? Math.max(0, Number(p.lookbackDays) || 0) : (p.dateFrom ? 0 : 2);
  const dateFrom = p.dateFrom || (lookback > 0 ? addDays(dateTo, -lookback) : dateTo);
  const workDate = p.workDate || dateTo;
  const limit = Math.min(Number(p.limit) || 80, 120);
  const formats = normalizeSoFormats(p);
  const user = p.user || 'trcloud-sync';
  const now = new Date().toISOString();

  const summary = {
    imported: 0, updated: 0, skipped: 0, deduped: 0, errors: [], total: 0,
    dateFrom, dateTo, workDate, lookback, formats, byFormat: {}, readsUsed: 0,
  };
  const samples = [];
  const seenIds = new Set();
  const allDocs = [];

  for (const companyFormat of formats) {
    const fmtSummary = { imported: 0, updated: 0, skipped: 0, errors: 0, total: 0 };
    let rows = [];
    try {
      const search = await searchOrders(env, {
        dateFrom, dateTo, limit, companyFormat,
        status: p.status, approveStatus: p.approveStatus,
      });
      rows = Array.isArray(search.result) ? search.result : [];
    } catch (e) {
      summary.errors.push({ format: companyFormat, error: String((e && e.message) || e) });
      summary.byFormat[companyFormat] = fmtSummary;
      continue;
    }
    fmtSummary.total = rows.length;
    summary.total += rows.length;
    for (const row of rows) {
      const qid = String(row.quotation_id || row.id || '');
      if (qid && seenIds.has(qid)) { fmtSummary.skipped++; summary.skipped++; continue; }
      if (qid) seenIds.add(qid);
      allDocs.push({ row, companyFormat, fmtSummary });
    }
    summary.byFormat[companyFormat] = fmtSummary;
  }

  // Preload existing deliveries by invoice (one query) — skip N findByInvoice round-trips
  const invoiceList = [];
  const mapped = [];
  for (const item of allDocs) {
    try {
      const data = mapSoToDeliveryLight(item.row);
      if (!data.InvoiceNo) {
        summary.errors.push({ format: item.companyFormat, error: 'ไม่มีเลขบิล/เลขที่ SO' });
        item.fmtSummary.errors++;
        continue;
      }
      applyWorkDatePolicy(data, workDate, lookback);
      invoiceList.push(data.InvoiceNo);
      mapped.push({ data, companyFormat: item.companyFormat, fmtSummary: item.fmtSummary });
    } catch (e) {
      summary.errors.push({ format: item.companyFormat, error: String((e && e.message) || e) });
      item.fmtSummary.errors++;
    }
  }

  const existingByInv = new Map();
  const dupDeleteStmts = [];
  if (invoiceList.length) {
    // Chunk IN queries (D1 bind limit); 40 invoices per chunk
    for (let i = 0; i < invoiceList.length; i += 40) {
      const chunk = invoiceList.slice(i, i + 40);
      const ph = chunk.map((_, j) => '?' + (j + 1)).join(',');
      const { results } = await env.DB.prepare(
        `select delivery_id, invoice_no, status, delivery_date, document_date, due_date, route_id, po_no,
                address, latitude, longitude, amount, updated_at
         from deliveries where is_deleted = 0 and invoice_no in (${ph})`
      ).bind(...chunk).all();
      const grouped = new Map();
      for (const r of results || []) {
        const key = normInvoiceNo(r.invoice_no);
        if (!key) continue;
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key).push(r);
      }
      for (const [key, list] of grouped) {
        list.sort((a, b) => deliveryRowRank(b) - deliveryRowRank(a));
        existingByInv.set(key, list[0]);
        for (let j = 1; j < list.length; j++) {
          dupDeleteStmts.push(env.DB.prepare(
            `update deliveries set is_deleted = 1, updated_at = ?1, updated_by = 'dedupe-invoice'
             where delivery_id = ?2 and is_deleted = 0`
          ).bind(now, list[j].delivery_id));
        }
      }
    }
  }

  // Preload customer coords once — batch sync skips geocode; reuse known pins
  const custByName = new Map();
  try {
    const { results: custs } = await env.DB.prepare(
      `select customer_name, branch_name, address, latitude, longitude
       from customers where is_deleted = 0`
    ).all();
    for (const c of custs || []) {
      const k = String(c.customer_name || '').trim().toLowerCase();
      if (!k) continue;
      if (!custByName.has(k)) custByName.set(k, []);
      custByName.get(k).push(c);
    }
  } catch (_) {}

  function applyCustomerCoords(data) {
    const list = custByName.get(String(data.CustomerName || '').trim().toLowerCase()) || [];
    if (!list.length) return;
    let hit = null;
    if (data.BranchName) {
      hit = list.find((c) => String(c.branch_name || '') === String(data.BranchName));
    }
    if (!hit) hit = list[0];
    if (!hit) return;
    if (hit.latitude != null && hit.longitude != null && hit.latitude !== '' && hit.longitude !== '') {
      data.Latitude = hit.latitude;
      data.Longitude = hit.longitude;
    }
    if (!data.Address && hit.address) data.Address = hit.address;
    if (!data.BranchName && hit.branch_name) data.BranchName = hit.branch_name;
  }

  const updateStmts = [];
  const createRows = [];
  for (const item of mapped) {
    const data = item.data;
    applyCustomerCoords(data);
    const existing = existingByInv.get(normInvoiceNo(data.InvoiceNo));
    const locked = existing && !['Draft', 'Pending', ''].includes(existing.status || '');
    if (existing && locked) {
      summary.skipped++;
      item.fmtSummary.skipped++;
      if (samples.length < 8) samples.push({ action: 'skipped', invoiceNo: data.InvoiceNo, format: item.companyFormat, deliveryId: existing.delivery_id });
      continue;
    }
    if (existing) {
      // Completed จากนโยบายบิลเก่า — เก็บวันที่ตาม due/doc ไม่เลื่อนเข้าคิววันนี้
      const isDone = data.Status === 'Completed';
      const deliveryDate = isDone
        ? (data.DeliveryDate || existing.due_date || existing.document_date || existing.delivery_date)
        : (data.DeliveryDate || existing.delivery_date);
      const lat = (data.Latitude != null && data.Latitude !== '') ? data.Latitude : (existing.latitude || null);
      const lng = (data.Longitude != null && data.Longitude !== '') ? data.Longitude : (existing.longitude || null);
      const amount = (data.Amount != null && data.Amount > 0) ? data.Amount : (existing.amount != null ? existing.amount : null);
      updateStmts.push(env.DB.prepare(
        `update deliveries set
           delivery_date = ?1, document_date = ?2, due_date = ?3,
           customer_name = ?4, branch_name = ?5, address = ?6,
           box_qty = ?7, note = ?8, po_no = ?9, status = ?10,
           amount = ?11, latitude = ?12, longitude = ?13,
           updated_at = ?14, updated_by = ?15,
           version = coalesce(version,0) + 1
         where delivery_id = ?16 and is_deleted = 0`
      ).bind(
        deliveryDate,
        data.DocumentDate || existing.document_date || '',
        data.DueDate || existing.due_date || '',
        data.CustomerName || '',
        data.BranchName || '',
        data.Address || existing.address || '',
        Number(data.BoxQty) || 1,
        data.Note || '',
        data.PoNo || existing.po_no || '',
        isDone ? 'Completed' : (existing.status || 'Draft'),
        amount,
        lat,
        lng,
        now,
        user,
        existing.delivery_id
      ));
      summary.updated++;
      item.fmtSummary.updated++;
      if (samples.length < 8) samples.push({ action: isDone ? 'completed' : 'updated', invoiceNo: data.InvoiceNo, format: item.companyFormat, deliveryId: existing.delivery_id });
    } else {
      createRows.push(item);
    }
  }

  // Batch updates (D1 allows ~1000 stmts; keep chunks small for CPU)
  for (let i = 0; i < dupDeleteStmts.length; i += 40) {
    await env.DB.batch(dupDeleteStmts.slice(i, i + 40));
  }
  if (dupDeleteStmts.length) summary.deduped = dupDeleteStmts.length;

  for (let i = 0; i < updateStmts.length; i += 40) {
    await env.DB.batch(updateStmts.slice(i, i + 40));
  }

  if (createRows.length) {
    const nNew = createRows.length;
    const seqRow = await env.DB.prepare(
      `insert into id_counters(prefix, next_value) values ('DEL', ?1)
       on conflict(prefix) do update set next_value = id_counters.next_value + ?2
       returning next_value - ?2 as start_v`
    ).bind(nNew + 1, nNew).first();
    let seq = Number(seqRow && seqRow.start_v) || 1;
    const insertStmts = [];
    for (const item of createRows) {
      const data = item.data;
      const id = 'DEL-' + String(seq++).padStart(3, '0');
      const lat = (data.Latitude != null && data.Latitude !== '') ? data.Latitude : null;
      const lng = (data.Longitude != null && data.Longitude !== '') ? data.Longitude : null;
      const amount = (data.Amount != null && data.Amount > 0) ? data.Amount : null;
      insertStmts.push(env.DB.prepare(
        `insert into deliveries (
           delivery_id, delivery_date, document_date, due_date,
           customer_name, branch_name, invoice_no, po_no, address,
           latitude, longitude, amount, box_qty, priority, note, route_id,
           status, created_at, updated_at, created_by, updated_by, version, is_deleted
         ) values (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,'NORMAL',?14,'',?15,?16,?16,?17,?17,1,0)`
      ).bind(
        id,
        data.DeliveryDate || workDate || today,
        data.DocumentDate || '',
        data.DueDate || '',
        data.CustomerName || '',
        data.BranchName || '',
        data.InvoiceNo,
        data.PoNo || '',
        data.Address || '',
        lat,
        lng,
        amount,
        Number(data.BoxQty) || 1,
        data.Note || '',
        data.Status === 'Completed' ? 'Completed' : 'Draft',
        now,
        user
      ));
      summary.imported++;
      item.fmtSummary.imported++;
      if (samples.length < 8) {
        samples.push({ action: data.Status === 'Completed' ? 'created-done' : 'created', invoiceNo: data.InvoiceNo, format: item.companyFormat, deliveryId: id });
      }
    }
    for (let i = 0; i < insertStmts.length; i += 40) {
      await env.DB.batch(insertStmts.slice(i, i + 40));
    }
  }

  await setLastSync(env, now).catch(() => {});
  summary.lastSync = now;
  summary.samples = samples;
  return summary;
}

async function getTrcloudStatus(env) {
  const { settingValue } = require('./reads');
  const lastSync = await settingValue(env.DB, 'TRCLOUD_LAST_SYNC', '');
  const hasCredentials = configured(env);
  let pingOk = false, pingError = '';
  if (hasCredentials) {
    try {
      const today = new Date().toISOString().slice(0, 10);
      await searchOrders(env, { dateFrom: today, dateTo: today, limit: 1 });
      pingOk = true;
    } catch (e) {
      pingError = String((e && e.message) || e);
    }
  }
  return {
    enabled: hasCredentials,
    connected: hasCredentials && pingOk,
    hasCredentials,
    lastSync,
    pingError,
    webhookUrl: 'https://gadgetvilla-delivery.pages.dev/trcloud-webhook',
    companyFormat: DEFAULT_SO_FORMATS.join('+'),
    companyFormats: DEFAULT_SO_FORMATS.slice(),
  };
}

/**
 * Webhook handler — TRCloud sends ?id=&company_id=&time=&hash=
 * Do NOT trust hash. Verify by so/read.php. Engine inferred from query or path.
 */
async function handleWebhook(env, request) {
  const url = new URL(request.url);
  const id = url.searchParams.get('id') || '';
  const action = (url.searchParams.get('action') || '').toLowerCase();
  const engine = (url.searchParams.get('engine') || 'so').toLowerCase();

  // Always log for diagnostics
  let body = '';
  try { body = await request.clone().text(); } catch (_) {}
  const headers = {};
  try { for (const [k, v] of request.headers.entries()) headers[k] = v; } catch (_) {}
  try {
    await env.DB.prepare(
      'insert into webhook_debug_log (source, method, url, headers, body, received_at) values (?1,?2,?3,?4,?5,?6)'
    ).bind('trcloud', request.method, request.url, JSON.stringify(headers), body, new Date().toISOString()).run();
  } catch (_) {}

  if (!id) return { ok: true, skipped: true, reason: 'no_id' };
  if (engine && engine !== 'so' && engine !== 'revenue') {
    // Only auto-import Sale Orders for now
    return { ok: true, skipped: true, reason: 'engine_' + engine };
  }

  if (action === 'delete') {
    // Soft-delete only Draft deliveries matching this TRCloud id via invoice after read fails
    try {
      const doc = await readOrder(env, id);
      const inv = invoiceFromSo(soHead(doc));
      const existing = await findByInvoice(env.DB, inv);
      if (existing && (existing.status === 'Draft' || existing.status === 'Pending')) {
        await writes.deleteDelivery(env, { id: existing.delivery_id, user: 'trcloud-webhook' });
        return { ok: true, action: 'deleted', invoiceNo: inv, deliveryId: existing.delivery_id };
      }
      return { ok: true, skipped: true, reason: 'delete_locked_or_missing', invoiceNo: inv };
    } catch (e) {
      // Document already gone — try nothing further
      return { ok: true, skipped: true, reason: 'delete_read_failed', error: String((e && e.message) || e) };
    }
  }

  try {
    const result = await importById(env, id, { user: 'trcloud-webhook' });
    await setLastSync(env, new Date().toISOString()).catch(() => {});
    return { ok: true, ...result };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e), id };
  }
}

module.exports = {
  searchOrders, readOrder, updateOrder, configured,
  searchInvoices, readInvoice, updateInvoice,
  mapSoToDelivery, upsertDeliveryFromSo, importById,
  syncOrders, getTrcloudStatus, handleWebhook,
  invoiceFromSo, markSoDelivered, pushDeliveryCompleted, parseTrcIdFromNote,
  debugUpdateProbe, DEFAULT_SO_FORMATS,
};
