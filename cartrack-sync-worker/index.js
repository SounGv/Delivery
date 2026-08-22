// Separate minimal Worker (Cron Triggers are a Workers primitive, not
// available to Pages Functions) — runs syncCartrack() once a minute against
// the same D1 database the Pages project uses.
// Manual Sync from the UI also hits this Worker's fetch handler.
const { syncCartrack } = require('../lib/actions/cartrack');

async function runSync(env, opts) {
  try {
    return await syncCartrack(env, opts);
  } catch (err) {
    const message = String((err && err.message) || err);
    try {
      const now = new Date().toISOString();
      await env.DB.prepare(
        'insert into cartrack_logs (sync_at, fetched, matched, status, message) values (?1,?2,?3,?4,?5)'
      ).bind(now, 0, 0, 'ERROR', message.slice(0, 500)).run();
    } catch (_) { /* best-effort */ }
    throw err;
  }
}

export default {
  async scheduled(event, env, ctx) {
    // Light sync every minute (positions only). Full sync (GPS log rows)
    // once an hour — writing gps_logs every minute bloats D1 for no live-UI gain.
    const minute = new Date(event.scheduledTime || Date.now()).getUTCMinutes();
    const light = minute !== 0;
    ctx.waitUntil(
      runSync(env, { light }).catch((err) => {
        console.error('cartrack cron failed', String((err && err.message) || err));
      }),
    );
  },
  async fetch(request, env) {
    const light = new URL(request.url).searchParams.get('light') === '1';
    try {
      const result = await runSync(env, { light });
      return new Response(JSON.stringify({ ok: true, data: result }), {
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      });
    } catch (err) {
      return new Response(JSON.stringify({ ok: false, error: String((err && err.message) || err) }), {
        status: 500,
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      });
    }
  },
};
