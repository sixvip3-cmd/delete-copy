// Автономный бэкенд для демо-версии: тот же интерфейс, что и api.js,
// но все данные живут в браузере, а боты отвечают локально.
const LS_DB = 'delete.demo.db';
const LS_TOKEN = 'delete.demo.token';
const STORY_TTL = 24 * 60 * 60 * 1000;

const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); return true; } catch { return false; } };

const rid = () => Math.random().toString(36).slice(2, 11) + Date.now().toString(36).slice(-3);

/* ---------------------------------------------------------------- база */
let db;
(function load() {
  const raw = lsGet(LS_DB);
  if (raw) { try { db = JSON.parse(raw); } catch {} }
  if (!db) {
    db = JSON.parse(JSON.stringify(window.DELETE_SEED));
    // сдвигаем время сида к «сейчас»
    const shift = Date.now() - db.seededAt;
    for (const k of ['posts', 'stories', 'messages']) for (const x of db[k]) { x.createdAt += shift; if (x.readAt) x.readAt += shift; }
  }
})();
let saveTimer;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (!lsSet(LS_DB, JSON.stringify(db))) console.warn('demo: localStorage недоступен, данные только в памяти');
  }, 300);
}

export const session = {
  token: lsGet(LS_TOKEN),
  set(t) { this.token = t; lsSet(LS_TOKEN, t); },
};
const meId = () => db.tokens[session.token];
const userById = (id) => db.users.find((u) => u.id === id);
const userByName = (n) => db.users.find((u) => u.username.toLowerCase() === String(n).toLowerCase());

function publicUser(u, viewerId) {
  if (!u) return null;
  return {
    id: u.id, username: u.username, name: u.name, avatar: u.avatar || null, color: u.color, bio: u.bio || '',
    verified: !!u.verified, online: !!u.bot || u.id === meId(), lastSeen: u.lastSeen || null,
    followers: db.follows.filter((f) => f.to === u.id).length,
    following: db.follows.filter((f) => f.from === u.id).length,
    isFollowing: viewerId ? db.follows.some((f) => f.from === viewerId && f.to === u.id) : false,
    postsCount: db.posts.filter((p) => p.userId === u.id).length,
  };
}
function publicPost(p, v) {
  return {
    id: p.id, user: publicUser(userById(p.userId), v), text: p.text, media: p.media || [], createdAt: p.createdAt,
    saves: p.savedBy.length, saved: p.savedBy.includes(v), likes: (p.likedBy || []).length, liked: (p.likedBy || []).includes(v),
  };
}
function previewText(m) {
  if (!m) return '';
  switch (m.type) {
    case 'voice': return '🎤 Голосовое сообщение';
    case 'image': return m.text ? '🖼 ' + m.text : '🖼 Фото';
    case 'video': return m.text ? '🎬 ' + m.text : '🎬 Видео';
    case 'story': return '↩︎ Ответ на историю: ' + (m.text || '');
    default: return m.text || '';
  }
}
function publicMessage(m) {
  const r = m.replyTo ? db.messages.find((x) => x.id === m.replyTo) : null;
  return { ...m, reply: r ? { id: r.id, from: r.from, name: (userById(r.from) || {}).name, text: previewText(r) } : null };
}

/* ---------------------------------------------------------------- события */
const listeners = new Set();
export function onEvent(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit(uid, payload) {
  if (uid !== meId()) return;
  setTimeout(() => listeners.forEach((fn) => fn(payload)), 0);
}
export function connect() { emit(meId(), { type: 'connected' }); }
export function disconnect() {}
export function wsSend(o) {
  if (o.type === 'read' && o.peer) markRead(meId(), o.peer);
}

function markRead(uid, peer) {
  let changed = false;
  for (const m of db.messages) if (m.from === peer && m.to === uid && !m.readAt) { m.readAt = Date.now(); changed = true; }
  if (changed) { save(); emit(peer, { type: 'read', by: uid }); emit(uid, { type: 'unread' }); }
}

const BOT_LINES = [
  'Отлично, ты как?', 'Понял 👌', 'Ахах, да', 'Давай завтра', 'Окей, я наберу тебе завтра', 'Хорошо, до завтра',
  'Звучит круто 🔥', 'Сейчас занят, напишу позже', 'Согласен', 'Ну ты даёшь 😄', 'Скинь потом фотки', 'А ты где сейчас?',
  'Да, в силе', 'Ммм, интересно 🤔',
];
function botReply(bot, user, incoming) {
  setTimeout(() => { markRead(bot.id, user.id); emit(user.id, { type: 'typing', from: bot.id }); }, 700);
  setTimeout(() => {
    let text = BOT_LINES[Math.floor(Math.random() * BOT_LINES.length)];
    if (incoming.type === 'voice') text = 'Послушал голосовое 🎧 ' + text;
    if (incoming.type === 'story') text = 'Спасибо, что посмотрел(а) мою историю 🙌';
    if (/привет|здаров|хай/i.test(incoming.text || '')) text = 'Привет! Отлично, ты как?';
    const msg = { id: rid(), from: bot.id, to: user.id, type: 'text', text, createdAt: Date.now(), readAt: null };
    if (Math.random() < 0.25) msg.replyTo = incoming.id;
    db.messages.push(msg);
    save();
    emit(user.id, { type: 'message', message: publicMessage(msg), user: publicUser(bot, user.id) });
  }, 1800 + Math.random() * 1600);
}

/* ---------------------------------------------------------------- роуты */
class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const fail = (s, m) => { throw new HttpError(s, m); };
const toggle = (a, v) => { const i = a.indexOf(v); i >= 0 ? a.splice(i, 1) : a.push(v); };
const USERNAME_RE = /^[a-zA-Z0-9_.]{3,24}$/;

function login(user) {
  const token = rid() + rid();
  db.tokens[token] = user.id;
  save();
  return { token, user: publicUser(user, user.id) };
}

const routes = [
  ['POST', /^\/register$/, (b) => {
    const { username, password, name } = b;
    if (!USERNAME_RE.test(username || '')) fail(400, 'Юзернейм: 3–24 символа, латиница, цифры, _ и .');
    if (!password || String(password).length < 4) fail(400, 'Пароль минимум 4 символа');
    if (userByName(username)) fail(400, 'Этот юзернейм уже занят');
    const colors = ['#ff7a59', '#7b61ff', '#2ec4b6', '#ff4d8d', '#3a8dff', '#f5a623'];
    const user = { id: rid(), username, name: (name || username).trim().slice(0, 40), pw: String(password), avatar: null, color: colors[Math.floor(Math.random() * colors.length)], bio: '', createdAt: Date.now() };
    db.users.push(user);
    const off = userByName('delete');
    if (off) {
      db.follows.push({ from: user.id, to: off.id });
      db.messages.push({ id: rid(), from: off.id, to: user.id, type: 'text', text: `Привет, ${user.name}! 👋 Добро пожаловать в delete. Напиши кому-нибудь из чатов — тебе ответят.`, createdAt: Date.now(), readAt: null });
    }
    return login(user);
  }],
  ['POST', /^\/login$/, (b) => {
    const u = userByName(b.username || '');
    if (!u || u.bot) fail(400, 'Неверный логин или пароль');
    if (u.username !== 'demo' && u.pw !== String(b.password)) fail(400, 'Неверный логин или пароль');
    if (u.username === 'demo' && b.password !== 'demo') fail(400, 'Неверный логин или пароль');
    return login(u);
  }],
  ['POST', /^\/logout$/, () => { delete db.tokens[session.token]; save(); return { ok: true }; }],
  ['GET', /^\/me$/, (b, me) => publicUser(me, me.id)],
  ['PATCH', /^\/me$/, (b, me) => {
    if (typeof b.name === 'string' && b.name.trim()) me.name = b.name.trim().slice(0, 40);
    if (typeof b.bio === 'string') me.bio = b.bio.slice(0, 160);
    if (typeof b.avatar === 'string') me.avatar = b.avatar;
    if (typeof b.username === 'string' && b.username !== me.username) {
      if (!USERNAME_RE.test(b.username)) fail(400, 'Некорректный юзернейм');
      if (userByName(b.username)) fail(400, 'Юзернейм занят');
      me.username = b.username;
    }
    save();
    return publicUser(me, me.id);
  }],
  ['GET', /^\/users\?q=(.*)$/, (b, me, m) => {
    const q = decodeURIComponent(m[1]).trim().toLowerCase();
    return db.users.filter((u) => u.id !== me.id && (!q || u.username.toLowerCase().includes(q) || u.name.toLowerCase().includes(q))).map((u) => publicUser(u, me.id));
  }],
  ['GET', /^\/users\/([^/?]+)$/, (b, me, m) => {
    const key = decodeURIComponent(m[1]);
    const u = userByName(key) || userById(key);
    if (!u) fail(404, 'Пользователь не найден');
    const posts = db.posts.filter((p) => p.userId === u.id).sort((a, c) => c.createdAt - a.createdAt);
    return { user: publicUser(u, me.id), posts: posts.map((p) => publicPost(p, me.id)) };
  }],
  ['POST', /^\/users\/([^/]+)\/follow$/, (b, me, m) => {
    const t = userById(m[1]);
    if (!t || t.id === me.id) fail(400, 'Нельзя');
    const i = db.follows.findIndex((f) => f.from === me.id && f.to === t.id);
    i >= 0 ? db.follows.splice(i, 1) : db.follows.push({ from: me.id, to: t.id });
    save();
    return publicUser(t, me.id);
  }],
  ['GET', /^\/feed\?mode=(\w+)$/, (b, me, m) => {
    let posts = db.posts.slice();
    if (m[1] === 'following') {
      const ids = new Set(db.follows.filter((f) => f.from === me.id).map((f) => f.to));
      ids.add(me.id);
      posts = posts.filter((p) => ids.has(p.userId));
    } else if (m[1] === 'saved') posts = posts.filter((p) => p.savedBy.includes(me.id));
    return posts.sort((a, c) => c.createdAt - a.createdAt).map((p) => publicPost(p, me.id));
  }],
  ['POST', /^\/posts$/, (b, me) => {
    const media = (b.media || []).slice(0, 10);
    if (!String(b.text || '').trim() && !media.length) fail(400, 'Пустая публикация');
    const p = { id: rid(), userId: me.id, text: String(b.text || '').slice(0, 2000), media, createdAt: Date.now(), savedBy: [], likedBy: [] };
    db.posts.push(p);
    save();
    return publicPost(p, me.id);
  }],
  ['DELETE', /^\/posts\/([^/]+)$/, (b, me, m) => {
    const i = db.posts.findIndex((p) => p.id === m[1] && p.userId === me.id);
    if (i < 0) fail(404, 'Не найдено');
    db.posts.splice(i, 1);
    save();
    return { ok: true };
  }],
  ['POST', /^\/posts\/([^/]+)\/(save|like)$/, (b, me, m) => {
    const p = db.posts.find((x) => x.id === m[1]);
    if (!p) fail(404, 'Не найдено');
    p.likedBy = p.likedBy || [];
    toggle(m[2] === 'save' ? p.savedBy : p.likedBy, me.id);
    save();
    return publicPost(p, me.id);
  }],
  ['GET', /^\/stories$/, (b, me) => {
    const groups = new Map();
    const now = Date.now();
    for (const s of db.stories.filter((s) => now - s.createdAt < STORY_TTL).sort((a, c) => a.createdAt - c.createdAt)) {
      if (!groups.has(s.userId)) groups.set(s.userId, []);
      groups.get(s.userId).push({ id: s.id, media: s.media, text: s.text, bg: s.bg, createdAt: s.createdAt, seen: s.viewers.includes(me.id), views: s.userId === me.id ? s.viewers.length : undefined });
    }
    const res = [...groups.entries()].map(([uid, items]) => ({ user: publicUser(userById(uid), me.id), items, allSeen: items.every((i) => i.seen), last: items[items.length - 1].createdAt }));
    res.sort((a, c) => (a.user.id === me.id ? -1 : c.user.id === me.id ? 1 : a.allSeen !== c.allSeen ? (a.allSeen ? 1 : -1) : c.last - a.last));
    return res;
  }],
  ['POST', /^\/stories$/, (b, me) => {
    if (!b.media && !String(b.text || '').trim()) fail(400, 'Пустая история');
    db.stories.push({ id: rid(), userId: me.id, media: b.media || null, text: String(b.text || '').slice(0, 300), bg: b.bg || null, createdAt: Date.now(), viewers: [] });
    // боты «смотрят» историю
    const st = db.stories[db.stories.length - 1];
    db.users.filter((u) => u.bot).slice(0, 5).forEach((u, i) => setTimeout(() => { st.viewers.push(u.id); save(); }, 3000 + i * 2500));
    save();
    return { ok: true };
  }],
  ['POST', /^\/stories\/([^/]+)\/view$/, (b, me, m) => {
    const s = db.stories.find((x) => x.id === m[1]);
    if (s && !s.viewers.includes(me.id) && s.userId !== me.id) { s.viewers.push(me.id); save(); }
    return { ok: true };
  }],
  ['DELETE', /^\/stories\/([^/]+)$/, (b, me, m) => {
    const i = db.stories.findIndex((s) => s.id === m[1] && s.userId === me.id);
    if (i >= 0) { db.stories.splice(i, 1); save(); }
    return { ok: true };
  }],
  ['GET', /^\/chats$/, (b, me) => {
    const map = new Map();
    for (const m of db.messages) {
      if (m.from !== me.id && m.to !== me.id) continue;
      const peer = m.from === me.id ? m.to : m.from;
      const c = map.get(peer) || { last: null, unread: 0 };
      if (!c.last || m.createdAt > c.last.createdAt) c.last = m;
      if (m.to === me.id && m.from !== me.id && !m.readAt) c.unread++;
      map.set(peer, c);
    }
    const chats = [...map.entries()].filter(([p]) => p !== me.id).map(([p, c]) => ({
      user: publicUser(userById(p), me.id),
      last: { text: previewText(c.last), createdAt: c.last.createdAt, mine: c.last.from === me.id, read: !!c.last.readAt },
      unread: c.unread,
    })).filter((c) => c.user).sort((a, c) => c.last.createdAt - a.last.createdAt);
    const fav = map.get(me.id);
    return { chats, favorites: fav ? { text: previewText(fav.last), createdAt: fav.last.createdAt } : null };
  }],
  ['GET', /^\/chats\/([^/]+)\/messages$/, (b, me, m) => {
    const peer = decodeURIComponent(m[1]);
    const msgs = db.messages.filter((x) => (x.from === me.id && x.to === peer) || (x.from === peer && x.to === me.id)).sort((a, c) => a.createdAt - c.createdAt).map(publicMessage);
    return { user: publicUser(userById(peer), me.id), messages: msgs };
  }],
  ['POST', /^\/chats\/([^/]+)\/read$/, (b, me, m) => { markRead(me.id, decodeURIComponent(m[1])); return { ok: true }; }],
  ['POST', /^\/messages$/, (b, me) => {
    const peer = userById(b.to);
    if (!peer) fail(400, 'Нет такого собеседника');
    const type = b.type || 'text';
    const msg = { id: rid(), from: me.id, to: peer.id, type, text: String(b.text || '').slice(0, 4000), createdAt: Date.now(), readAt: peer.id === me.id ? Date.now() : null };
    if (type === 'story') msg.story = b.story || {};
    else if (type !== 'text') { if (!b.media) fail(400, 'Нет файла'); msg.media = b.media; }
    if (type === 'voice') { msg.duration = Number(b.duration) || 0; msg.waveform = (b.waveform || []).slice(0, 64); }
    if (type === 'text' && !msg.text.trim()) fail(400, 'Пустое сообщение');
    if (b.replyTo && db.messages.some((x) => x.id === b.replyTo)) msg.replyTo = b.replyTo;
    db.messages.push(msg);
    save();
    const pm = publicMessage(msg);
    if (peer.bot) botReply(peer, me, msg);
    return pm;
  }],
  ['DELETE', /^\/messages\/([^/]+)$/, (b, me, m) => {
    const i = db.messages.findIndex((x) => x.id === m[1] && x.from === me.id);
    if (i < 0) fail(404, 'Не найдено');
    db.messages.splice(i, 1);
    save();
    return { ok: true };
  }],
  ['PATCH', /^\/messages\/([^/]+)$/, (b, me, m) => {
    const x = db.messages.find((y) => y.id === m[1] && y.from === me.id && y.type === 'text');
    if (!x) fail(404, 'Не найдено');
    x.text = String(b.text || '').trim().slice(0, 4000);
    x.editedAt = Date.now();
    save();
    return publicMessage(x);
  }],
];

export async function api(path, { method = 'GET', body } = {}) {
  await new Promise((r) => setTimeout(r, 40));
  const open = /^\/(login|register)$/.test(path);
  const me = userById(meId());
  if (!open && !me) fail(401, 'Требуется вход');
  for (const [mth, re, fn] of routes) {
    if (mth !== method) continue;
    const m = path.match(re);
    if (m) return JSON.parse(JSON.stringify(fn(body || {}, me, m) ?? null));
  }
  fail(404, 'Не найдено');
}

export function upload(blob, type) {
  const mime = (type || blob.type || '').split(';')[0];
  return new Promise((resolve, reject) => {
    if (blob.size > 8 * 1024 * 1024 && !mime.startsWith('audio')) {
      // большие файлы не сохраняем, только показываем в этой сессии
      return resolve({ url: URL.createObjectURL(blob), type: mime.split('/')[0] });
    }
    const fr = new FileReader();
    fr.onload = () => resolve({ url: fr.result, type: mime.split('/')[0] });
    fr.onerror = () => reject(new Error('Не удалось прочитать файл'));
    fr.readAsDataURL(mime && blob.type !== mime ? new Blob([blob], { type: mime }) : blob);
  });
}
