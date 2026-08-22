// TRCloud webhook receiver — registered in TRCloud api-webhook settings.
// Query: ?id=&company_id=&time=&hash= (& optional engine=&action=)
// Do not trust hash; verify by so/read.php then upsert Delivery.
const trcloud = require('../lib/actions/trcloud');

async function handle(context) {
  const { request, env } = context;
  let result;
  try {
    result = await trcloud.handleWebhook(env, request);
  } catch (e) {
    result = { ok: false, error: String((e && e.message) || e) };
  }
  // Always 200 so TRCloud doesn't retry-storm; error detail is in JSON + debug log
  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

export const onRequestGet = handle;
export const onRequestPost = handle;
