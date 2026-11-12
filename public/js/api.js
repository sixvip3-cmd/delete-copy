export const session = {
  token: localStorage.getItem('delete.token') || null,
  set(token) { this.token = token; token ? localStorage.setItem('delete.token', token) : localStorage.removeItem('delete.token'); },
};

export async function api(path, { method = 'GET', body, raw, type } = {}) {
  const headers = {};
  if (session.token) headers.Authorization = 'Bearer ' + session.token;
  let payload;
  if (raw) { payload = raw; headers['Content-Type'] = type || raw.type || 'application/octet-stream'; }
  else if (body !== undefined) { payload = JSON.stringify(body); headers['Content-Type'] = 'application/json'; }
  const res = await fetch('/api' + path, { method, headers, body: payload });
  let data = null;
  try { data = await res.json(); } catch {}
  if (!res.ok) {
    const err = new Error((data && data.error) || 'Ошибка сети');
    err.status = res.status;
    throw err;
  }
  return data;
}

export async function upload(fileOrBlob, type) {
  const mime = (type || fileOrBlob.type || '').split(';')[0] || 'application/octet-stream';
  return api('/upload', { method: 'POST', raw: fileOrBlob, type: mime });
}

/* ---------- WebSocket с автопереподключением */
const listeners = new Set();
let ws, retry = 0, closedByUser = false;
export function onEvent(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function connect() {
  closedByUser = false;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}/ws?token=${encodeURIComponent(session.token)}`);
  ws.onopen = () => { retry = 0; listeners.forEach((fn) => fn({ type: 'connected' })); };
  ws.onmessage = (e) => { let d; try { d = JSON.parse(e.data); } catch { return; } listeners.forEach((fn) => fn(d)); };
  ws.onclose = (e) => {
    if (closedByUser || e.code === 4001) return;
    setTimeout(connect, Math.min(10000, 500 * 2 ** retry++));
  };
}
export function disconnect() { closedByUser = true; ws?.close(); }
export function wsSend(obj) { if (ws?.readyState === 1) ws.send(JSON.stringify(obj)); }
