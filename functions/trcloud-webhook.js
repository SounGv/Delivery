// Temporary diagnostic endpoint — TRCloud has no published webhook payload
// docs, so this just captures whatever TRCloud actually sends (method,
// full URL incl. query string, headers, raw body) into D1's
// webhook_debug_log table so the real payload shape can be inspected
// before writing the actual integration. Always responds 200 fast, since
// webhook senders generally expect a quick 2xx ack.
async function logAndRespond(context) {
  const { request, env } = context;
  let body = '';
  try { body = await request.text(); } catch (e) {}
  const headers = {};
  for (const [k, v] of request.headers.entries()) headers[k] = v;
  try {
    await env.DB.prepare('insert into webhook_debug_log (source, method, url, headers, body, received_at) values (?1,?2,?3,?4,?5,?6)')
      .bind('trcloud', request.method, request.url, JSON.stringify(headers), body, new Date().toISOString()).run();
  } catch (e) {}
  return new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json' } });
}

export const onRequestGet = logAndRespond;
export const onRequestPost = logAndRespond;
