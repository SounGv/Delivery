// TRCloud RESTful API client — used to pull Sale Orders into dispatch-center
// as Deliveries. TRCloud's own docs UI shows the auth+data fields as if they
// were flat form fields, but the real wire format (confirmed against a
// working reference implementation, gadgetvillath/gv-console's
// trcloud_client.py) nests everything — auth fields included — into ONE
// JSON blob under a single form field literally named "json". Sending flat
// form fields (as the docs table implies) gets silently rejected with a
// generic {"message":"No data received!"} — this is not a "no results"
// response, it means the request itself wasn't understood.
//
// Auth: company_id/passkey/securekey/timestamp, where
//   securekey = MD5(encrypt_head + "t" + timestamp)
// company_id/passkey/encrypt_head come from a dedicated API key TRCloud
// issued for this integration (Settings → API Key), stored as Cloudflare
// Pages secrets (TRCLOUD_PASSKEY, TRCLOUD_ENCRYPT_HEAD) — never hardcoded.
// An Origin header is also required — TRCloud checks it against whatever
// Origin the API key is restricted to (ANY skips the check, but the header
// still needs to be present).
const { md5 } = require('../util/md5');

const BASE = 'https://gv.trcloud.co/application/api-connector2/end-point';
const COMPANY_ID = 2; // shown alongside the API keys in TRCloud's own settings UI — not a secret

function authFields(env) {
  const timestamp = Math.floor(Date.now() / 1000);
  const securekey = md5(env.TRCLOUD_ENCRYPT_HEAD + 't' + timestamp);
  return { company_id: COMPANY_ID, passkey: env.TRCLOUD_PASSKEY, securekey, timestamp };
}

async function post(env, path, data) {
  if (!env.TRCLOUD_PASSKEY || !env.TRCLOUD_ENCRYPT_HEAD) throw new Error('TRCLOUD_PASSKEY/TRCLOUD_ENCRYPT_HEAD not configured');
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
  // Every api-connector2 endpoint answers {result|..., HTTP, message, success}
  // regardless of module — HTTP 200 alone doesn't mean the call succeeded.
  // A genuine zero-match search still comes back success:1 with an empty
  // result, so this doesn't turn "no results" into a false error.
  if (!result.success) throw new Error(`TRCloud API error (${path}): ${result.message || JSON.stringify(result)}`);
  return result;
}

// dateFrom/dateTo: 'YYYY-MM-DD'. status/approveStatus optional per TRCloud's
// own `setting` fields (e.g. status: 'New', approve_status: 'yes').
async function searchOrders(env, { dateFrom, dateTo, status, approveStatus, limit, companyFormat } = {}) {
  const data = { company_format: companyFormat || 'KSO', start: 0, limit: limit || 100 };
  if (dateFrom) data['date-from'] = dateFrom;
  if (dateTo) data['date-to'] = dateTo;
  if (status) data.status = status;
  if (approveStatus) data.approve_status = approveStatus;
  return post(env, 'so/search.php', data);
}

async function readOrder(env, id) {
  return post(env, 'so/read.php', { id });
}

module.exports = { searchOrders, readOrder };
