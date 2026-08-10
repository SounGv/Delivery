// POD (proof-of-delivery) photo upload proxies through to the existing
// Apps Script deployment's uploadPOD action (Google Drive) instead of R2 —
// R2 requires attaching a billing subscription to the account before the
// API allows bucket creation, and the user opted to skip that and keep
// Drive for photos while D1 replaces everything else. The Apps Script web
// app is already "Anyone can access", so this server-to-server call
// doesn't introduce any new exposure the frontend didn't already have.
// APPS_SCRIPT_POD_URL is a Pages environment variable (not a secret — it's
// the same web app URL app.js's DEFAULT_API_URL points at today).
async function uploadPOD(env, b) {
  const url = env.APPS_SCRIPT_POD_URL;
  if (!url) throw new Error('APPS_SCRIPT_POD_URL ยังไม่ได้ตั้งค่า (Pages environment variable)');
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'uploadPOD', base64: b.base64 || b.data, filename: b.filename }),
  });
  const body = await res.json();
  if (!body.ok) throw new Error(body.error || 'uploadPOD ล้มเหลว');
  return body.data;
}

module.exports = { uploadPOD };
