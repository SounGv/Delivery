// Separate minimal Worker (Cron Triggers are a Workers primitive, not
// available to Pages Functions) — runs syncCartrack() once a minute against
// the same D1 database the Pages project uses (bindings are account-level
// resources, shared freely across Pages/Workers projects; see wrangler.toml
// in this folder). The GET endpoint also acts as the sync target for the
// Pages Function's own `syncCartrack` action (functions/api/gas.js) — the
// Cartrack username/token secrets live only here, not on the Pages project,
// so the frontend's manual "Sync" button proxies through to this Worker
// instead of needing those credentials entered a second time.
const { syncCartrack } = require('../lib/actions/cartrack');

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(syncCartrack(env, { light: false }));
  },
  async fetch(request, env) {
    const light = new URL(request.url).searchParams.get('light') === '1';
    try {
      const result = await syncCartrack(env, { light });
      return new Response(JSON.stringify({ ok: true, data: result }), { headers: { 'content-type': 'application/json' } });
    } catch (err) {
      return new Response(JSON.stringify({ ok: false, error: String((err && err.message) || err) }), { headers: { 'content-type': 'application/json' } });
    }
  },
};
