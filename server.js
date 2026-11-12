'use strict';
/**
 * delete — сервер мессенджера.
 * Express (REST + статика) + ws (реалтайм) + JSON-хранилище в ./data
 */
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const seed = require('./seed');

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const MEDIA_DIR = path.join(DATA_DIR, 'media');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const STORY_TTL = 24 * 60 * 60 * 1000;

fs.mkdirSync(MEDIA_DIR, { recursive: true });

/* ---------------------------------------------------------------- DB */
let db;
function emptyDb() {
  return { users: [], tokens: {}, follows: [], posts: [], stories: [], messages: [] };
}
function loadDb() {
  if (fs.existsSync(DB_FILE)) {
    try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch (e) { console.error('db.json повреждён, создаю новый'); }
  }
  const fresh = emptyDb();
  seed(fresh, { mediaDir: MEDIA_DIR, hashPassword, id });
  return fresh;
}
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.writeFile(DB_FILE + '.tmp', JSON.stringify(db), (err) => {
      if (!err) fs.rename(DB_FILE + '.tmp', DB_FILE, () => {});
    });
  }, 200);
}

function id() { return crypto.randomBytes(9).toString('base64url'); }
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 32).toString('hex');
  return { salt, hash };
}

db = loadDb();
save();

const userById = (uid) => db.users.find((u) => u.id === uid);
const userByName = (name) => db.users.find((u) => u.username.toLowerCase() === String(name).toLowerCase());

function publicUser(u, viewerId) {
  if (!u) return null;
  const followers = db.follows.filter((f) => f.to === u.id).length;
  const following = db.follows.filter((f) => f.from === u.id).length;
  return {
    id: u.id,
    username: u.username,
    name: u.name,
    avatar: u.avatar || null,
    color: u.color,
    bio: u.bio || '',
    verified: !!u.verified,
    online: online.has(u.id),
    lastSeen: u.lastSeen || null,
    followers,
    following,
    isFollowing: viewerId ? db.follows.some((f) => f.from === viewerId && f.to === u.id) : false,
    postsCount: db.posts.filter((p) => p.userId === u.id).length,
  };
}

function publicPost(p, viewerId) {
  return {
    id: p.id,
    user: publicUser(userById(p.userId), viewerId),
    text: p.text,
    media: p.media || [],
    createdAt: p.createdAt,
    saves: p.savedBy.length,
    saved: p.savedBy.includes(viewerId),
    likes: (p.likedBy || []).length,
    liked: (p.likedBy || []).includes(viewerId),
  };
}

function publicMessage(m) {
  const reply = m.replyTo ? db.messages.find((x) => x.id === m.replyTo) : null;
  return {
    ...m,
    reply: reply
      ? { id: reply.id, from: reply.from, name: (userById(reply.from) || {}).name, text: previewText(reply) }
      : null,
  };
}

function previewText(m) {
  if (!m) return '';
  if (m.deleted) return 'Сообщение удалено';
  switch (m.type) {
    case 'voice': return '🎤 Голосовое сообщение';
    case 'image': return m.text ? '🖼 ' + m.text : '🖼 Фото';
    case 'video': return m.text ? '🎬 ' + m.text : '🎬 Видео';
    case 'story': return '↩︎ Ответ на историю: ' + (m.text || '');
    default: return m.text || '';
  }
}

/* ---------------------------------------------------------------- APP */
const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));
app.use('/media', express.static(MEDIA_DIR, { maxAge: '30d', immutable: true }));

function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : req.query.token;
  const uid = token && db.tokens[token];
  const user = uid && userById(uid);
  if (!user) return res.status(401).json({ error: 'Требуется вход' });
  req.user = user;
  next();
}

const USERNAME_RE = /^[a-zA-Z0-9_.]{3,24}$/;

app.post('/api/register', (req, res) => {
  const { username, password, name } = req.body || {};
  if (!USERNAME_RE.test(username || '')) return res.status(400).json({ error: 'Юзернейм: 3–24 символа, латиница, цифры, _ и .' });
  if (!password || String(password).length < 4) return res.status(400).json({ error: 'Пароль минимум 4 символа' });
  if (userByName(username)) return res.status(400).json({ error: 'Этот юзернейм уже занят' });
  const { salt, hash } = hashPassword(password);
  const colors = ['#ff7a59', '#7b61ff', '#2ec4b6', '#ff4d8d', '#3a8dff', '#f5a623', '#4cd964'];
  const user = {
    id: id(), username, name: (name || username).trim().slice(0, 40), salt, hash,
    avatar: null, color: colors[Math.floor(Math.random() * colors.length)], bio: '', verified: false,
    createdAt: Date.now(),
  };
  db.users.push(user);
  // подписываемся на официальный аккаунт и получаем приветствие
  const official = userByName('delete');
  if (official) {
    db.follows.push({ from: user.id, to: official.id });
    db.messages.push({
      id: id(), from: official.id, to: user.id, type: 'text',
      text: `Привет, ${user.name}! 👋 Добро пожаловать в delete. Попробуй записать голосовое — зажми микрофон справа внизу.`,
      createdAt: Date.now(), readAt: null,
    });
  }
  const token = crypto.randomBytes(24).toString('hex');
  db.tokens[token] = user.id;
  save();
  res.json({ token, user: publicUser(user, user.id) });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  const user = userByName(username || '');
  if (!user || user.bot) return res.status(400).json({ error: 'Неверный логин или пароль' });
  const { hash } = hashPassword(password || '', user.salt);
  if (!crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(user.hash))) return res.status(400).json({ error: 'Неверный логин или пароль' });
  const token = crypto.randomBytes(24).toString('hex');
  db.tokens[token] = user.id;
  save();
  res.json({ token, user: publicUser(user, user.id) });
});

app.post('/api/logout', auth, (req, res) => {
  const token = (req.headers.authorization || '').slice(7);
  delete db.tokens[token];
  save();
  res.json({ ok: true });
});

app.get('/api/me', auth, (req, res) => res.json(publicUser(req.user, req.user.id)));

app.patch('/api/me', auth, (req, res) => {
  const { name, bio, avatar, username } = req.body || {};
  if (typeof name === 'string' && name.trim()) req.user.name = name.trim().slice(0, 40);
  if (typeof bio === 'string') req.user.bio = bio.slice(0, 160);
  if (typeof avatar === 'string' && avatar.startsWith('/media/')) req.user.avatar = avatar;
  if (avatar === null) req.user.avatar = null;
  if (typeof username === 'string' && username !== req.user.username) {
    if (!USERNAME_RE.test(username)) return res.status(400).json({ error: 'Некорректный юзернейм' });
    if (userByName(username)) return res.status(400).json({ error: 'Юзернейм занят' });
    req.user.username = username;
  }
  save();
  const pu = publicUser(req.user, req.user.id);
  broadcast({ type: 'user', user: publicUser(req.user) });
  res.json(pu);
});

/* загрузка медиа: сырое тело запроса */
const MIME_EXT = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg',
  'image/heic': 'heic', 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov',
  'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3', 'audio/aac': 'aac', 'audio/wav': 'wav',
};
app.post('/api/upload', auth, express.raw({ type: () => true, limit: '60mb' }), (req, res) => {
  const type = String(req.headers['content-type'] || '').split(';')[0].trim();
  const ext = MIME_EXT[type];
  if (!ext) return res.status(400).json({ error: 'Неподдерживаемый формат: ' + type });
  if (!req.body || !req.body.length) return res.status(400).json({ error: 'Пустой файл' });
  const name = `${Date.now().toString(36)}-${id()}.${ext}`;
  fs.writeFile(path.join(MEDIA_DIR, name), req.body, (err) => {
    if (err) return res.status(500).json({ error: 'Не удалось сохранить файл' });
    res.json({ url: '/media/' + name, type: type.split('/')[0] });
  });
});

/* пользователи */
app.get('/api/users', auth, (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  let list = db.users.filter((u) => u.id !== req.user.id);
  if (q) list = list.filter((u) => u.username.toLowerCase().includes(q) || u.name.toLowerCase().includes(q));
  res.json(list.slice(0, 50).map((u) => publicUser(u, req.user.id)));
});

app.get('/api/users/:username', auth, (req, res) => {
  const u = userByName(req.params.username) || userById(req.params.username);
  if (!u) return res.status(404).json({ error: 'Пользователь не найден' });
  const posts = db.posts.filter((p) => p.userId === u.id).sort((a, b) => b.createdAt - a.createdAt);
  res.json({ user: publicUser(u, req.user.id), posts: posts.map((p) => publicPost(p, req.user.id)) });
});

app.post('/api/users/:id/follow', auth, (req, res) => {
  const target = userById(req.params.id);
  if (!target || target.id === req.user.id) return res.status(400).json({ error: 'Нельзя' });
  const idx = db.follows.findIndex((f) => f.from === req.user.id && f.to === target.id);
  if (idx >= 0) db.follows.splice(idx, 1);
  else db.follows.push({ from: req.user.id, to: target.id });
  save();
  res.json(publicUser(target, req.user.id));
});

/* лента */
app.get('/api/feed', auth, (req, res) => {
  const mode = req.query.mode || 'all';
  let posts = db.posts.slice();
  if (mode === 'following') {
    const ids = new Set(db.follows.filter((f) => f.from === req.user.id).map((f) => f.to));
    ids.add(req.user.id);
    posts = posts.filter((p) => ids.has(p.userId));
  } else if (mode === 'saved') {
    posts = posts.filter((p) => p.savedBy.includes(req.user.id));
  }
  posts.sort((a, b) => b.createdAt - a.createdAt);
  res.json(posts.slice(0, 100).map((p) => publicPost(p, req.user.id)));
});

app.post('/api/posts', auth, (req, res) => {
  const { text, media } = req.body || {};
  const cleanMedia = Array.isArray(media)
    ? media.filter((m) => m && typeof m.url === 'string' && m.url.startsWith('/media/')).slice(0, 10)
        .map((m) => ({ type: m.type === 'video' ? 'video' : 'image', url: m.url }))
    : [];
  if (!String(text || '').trim() && !cleanMedia.length) return res.status(400).json({ error: 'Пустая публикация' });
  const post = { id: id(), userId: req.user.id, text: String(text || '').slice(0, 2000), media: cleanMedia, createdAt: Date.now(), savedBy: [], likedBy: [] };
  db.posts.push(post);
  save();
  const pp = publicPost(post, req.user.id);
  broadcast({ type: 'post', post: publicPost(post) });
  res.json(pp);
});

app.delete('/api/posts/:id', auth, (req, res) => {
  const idx = db.posts.findIndex((p) => p.id === req.params.id && p.userId === req.user.id);
  if (idx < 0) return res.status(404).json({ error: 'Не найдено' });
  db.posts.splice(idx, 1);
  save();
  res.json({ ok: true });
});

function toggle(arr, v) { const i = arr.indexOf(v); if (i >= 0) arr.splice(i, 1); else arr.push(v); }
app.post('/api/posts/:id/save', auth, (req, res) => {
  const p = db.posts.find((x) => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: 'Не найдено' });
  toggle(p.savedBy, req.user.id);
  save();
  res.json(publicPost(p, req.user.id));
});
app.post('/api/posts/:id/like', auth, (req, res) => {
  const p = db.posts.find((x) => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: 'Не найдено' });
  p.likedBy = p.likedBy || [];
  toggle(p.likedBy, req.user.id);
  save();
  res.json(publicPost(p, req.user.id));
});

/* истории */
function activeStories() {
  const now = Date.now();
  return db.stories.filter((s) => now - s.createdAt < STORY_TTL);
}
app.get('/api/stories', auth, (req, res) => {
  const groups = new Map();
  for (const s of activeStories().sort((a, b) => a.createdAt - b.createdAt)) {
    if (!groups.has(s.userId)) groups.set(s.userId, []);
    groups.get(s.userId).push({
      id: s.id, media: s.media, text: s.text, bg: s.bg, createdAt: s.createdAt,
      seen: s.viewers.includes(req.user.id),
      views: s.userId === req.user.id ? s.viewers.length : undefined,
    });
  }
  const result = [...groups.entries()].map(([uid, items]) => ({
    user: publicUser(userById(uid), req.user.id),
    items,
    allSeen: items.every((i) => i.seen),
    last: items[items.length - 1].createdAt,
  }));
  result.sort((a, b) => {
    if (a.user.id === req.user.id) return -1;
    if (b.user.id === req.user.id) return 1;
    if (a.allSeen !== b.allSeen) return a.allSeen ? 1 : -1;
    return b.last - a.last;
  });
  res.json(result);
});

app.post('/api/stories', auth, (req, res) => {
  const { media, text, bg } = req.body || {};
  const m = media && typeof media.url === 'string' && media.url.startsWith('/media/')
    ? { type: media.type === 'video' ? 'video' : 'image', url: media.url } : null;
  if (!m && !String(text || '').trim()) return res.status(400).json({ error: 'Пустая история' });
  const story = { id: id(), userId: req.user.id, media: m, text: String(text || '').slice(0, 300), bg: typeof bg === 'string' ? bg.slice(0, 200) : null, createdAt: Date.now(), viewers: [] };
  db.stories.push(story);
  save();
  broadcast({ type: 'stories' });
  res.json({ ok: true, id: story.id });
});

app.post('/api/stories/:id/view', auth, (req, res) => {
  const s = db.stories.find((x) => x.id === req.params.id);
  if (s && !s.viewers.includes(req.user.id) && s.userId !== req.user.id) { s.viewers.push(req.user.id); save(); }
  res.json({ ok: true });
});

app.delete('/api/stories/:id', auth, (req, res) => {
  const idx = db.stories.findIndex((s) => s.id === req.params.id && s.userId === req.user.id);
  if (idx >= 0) { db.stories.splice(idx, 1); save(); }
  res.json({ ok: true });
});

/* чаты */
function peerOf(m, uid) { return m.from === uid ? m.to : m.from; }

app.get('/api/chats', auth, (req, res) => {
  const uid = req.user.id;
  const map = new Map();
  for (const m of db.messages) {
    if (m.from !== uid && m.to !== uid) continue;
    const peer = peerOf(m, uid);
    const cur = map.get(peer) || { last: null, unread: 0 };
    if (!cur.last || m.createdAt > cur.last.createdAt) cur.last = m;
    if (m.to === uid && m.from !== uid && !m.readAt) cur.unread++;
    map.set(peer, cur);
  }
  const chats = [...map.entries()]
    .filter(([peer]) => peer !== uid)
    .map(([peer, c]) => ({
      user: publicUser(userById(peer), uid),
      last: { text: previewText(c.last), createdAt: c.last.createdAt, mine: c.last.from === uid, read: !!c.last.readAt },
      unread: c.unread,
    }))
    .filter((c) => c.user)
    .sort((a, b) => b.last.createdAt - a.last.createdAt);
  const fav = map.get(uid);
  res.json({ chats, favorites: fav ? { text: previewText(fav.last), createdAt: fav.last.createdAt } : null });
});

app.get('/api/chats/:peer/messages', auth, (req, res) => {
  const uid = req.user.id;
  const peer = req.params.peer;
  const msgs = db.messages
    .filter((m) => (m.from === uid && m.to === peer) || (m.from === peer && m.to === uid))
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(-500)
    .map(publicMessage);
  res.json({ user: publicUser(userById(peer), uid), messages: msgs });
});

app.post('/api/chats/:peer/read', auth, (req, res) => {
  markRead(req.user.id, req.params.peer);
  res.json({ ok: true });
});

function markRead(uid, peer) {
  const now = Date.now();
  let changed = false;
  for (const m of db.messages) {
    if (m.from === peer && m.to === uid && !m.readAt) { m.readAt = now; changed = true; }
  }
  if (changed) {
    save();
    send(peer, { type: 'read', by: uid, at: now });
    send(uid, { type: 'unread' });
  }
}

const TYPES = new Set(['text', 'voice', 'image', 'video', 'story']);
app.post('/api/messages', auth, (req, res) => {
  const { to, text, type = 'text', media, duration, waveform, replyTo, story } = req.body || {};
  const peer = userById(to);
  if (!peer) return res.status(400).json({ error: 'Нет такого собеседника' });
  if (!TYPES.has(type)) return res.status(400).json({ error: 'Тип не поддерживается' });
  const msg = {
    id: id(), from: req.user.id, to: peer.id, type,
    text: String(text || '').slice(0, 4000),
    createdAt: Date.now(), readAt: peer.id === req.user.id ? Date.now() : null,
  };
  if (type !== 'text') {
    if (type === 'story') {
      if (story && typeof story === 'object') msg.story = { url: story.url || null, text: String(story.text || '').slice(0, 120), bg: story.bg || null, mediaType: story.mediaType || 'image' };
    } else {
      if (typeof media !== 'string' || !media.startsWith('/media/')) return res.status(400).json({ error: 'Нет файла' });
      msg.media = media;
    }
  }
  if (type === 'voice') {
    msg.duration = Math.max(0, Math.min(3600, Number(duration) || 0));
    msg.waveform = Array.isArray(waveform) ? waveform.slice(0, 64).map((v) => Math.max(0, Math.min(1, Number(v) || 0))) : [];
  }
  if (type === 'text' && !msg.text.trim()) return res.status(400).json({ error: 'Пустое сообщение' });
  if (replyTo && db.messages.some((m) => m.id === replyTo)) msg.replyTo = replyTo;
  db.messages.push(msg);
  save();
  const pm = publicMessage(msg);
  send(peer.id, { type: 'message', message: pm, user: publicUser(req.user, peer.id) });
  send(req.user.id, { type: 'message', message: pm, user: publicUser(peer, req.user.id) });
  if (peer.bot) botReply(peer, req.user, msg);
  res.json(pm);
});

app.delete('/api/messages/:id', auth, (req, res) => {
  const m = db.messages.find((x) => x.id === req.params.id && x.from === req.user.id);
  if (!m) return res.status(404).json({ error: 'Не найдено' });
  db.messages.splice(db.messages.indexOf(m), 1);
  save();
  send(m.to, { type: 'deleted', id: m.id, peer: m.from });
  send(m.from, { type: 'deleted', id: m.id, peer: m.to });
  res.json({ ok: true });
});

app.patch('/api/messages/:id', auth, (req, res) => {
  const m = db.messages.find((x) => x.id === req.params.id && x.from === req.user.id && x.type === 'text');
  if (!m) return res.status(404).json({ error: 'Не найдено' });
  const text = String((req.body || {}).text || '').trim();
  if (!text) return res.status(400).json({ error: 'Пустое сообщение' });
  m.text = text.slice(0, 4000);
  m.editedAt = Date.now();
  save();
  const pm = publicMessage(m);
  send(m.to, { type: 'edited', message: pm });
  send(m.from, { type: 'edited', message: pm });
  res.json(pm);
});

/* SPA fallback */
app.use((req, res, next) => {
  if (req.method !== 'GET' || req.path.startsWith('/api') || req.path.startsWith('/media')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/* ---------------------------------------------------------------- боты */
const BOT_LINES = [
  'Отлично, ты как?', 'Понял 👌', 'Ахах, да', 'Давай завтра', 'Окей, я наберу тебе завтра',
  'Хорошо, до завтра', 'Звучит круто 🔥', 'Сейчас занят, напишу позже', 'Согласен', 'Ну ты даёшь 😄',
  'Скинь потом фотки', 'А ты где сейчас?', 'Да, в силе', 'Ммм, интересно 🤔',
];
function botReply(bot, user, incoming) {
  setTimeout(() => {
    markRead(bot.id, user.id);
    send(user.id, { type: 'typing', from: bot.id });
  }, 700);
  setTimeout(() => {
    let text = BOT_LINES[Math.floor(Math.random() * BOT_LINES.length)];
    if (incoming.type === 'voice') text = 'Послушал голосовое 🎧 ' + text;
    if (incoming.type === 'story') text = 'Спасибо, что посмотрел(а) мою историю 🙌';
    if (/привет|здаров|хай/i.test(incoming.text || '')) text = 'Привет! Отлично, ты как?';
    const msg = {
      id: id(), from: bot.id, to: user.id, type: 'text', text, createdAt: Date.now(), readAt: null,
      replyTo: Math.random() < 0.25 ? incoming.id : undefined,
    };
    db.messages.push(msg);
    save();
    send(user.id, { type: 'message', message: publicMessage(msg), user: publicUser(bot, user.id) });
  }, 1800 + Math.random() * 1600);
}

/* ---------------------------------------------------------------- WS */
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });
const online = new Map(); // uid -> Set<ws>
for (const u of db.users) if (u.bot) online.set(u.id, new Set()); // боты всегда онлайн

function send(uid, payload) {
  const set = online.get(uid);
  if (!set) return;
  const data = JSON.stringify(payload);
  for (const ws of set) if (ws.readyState === 1) ws.send(data);
}
function broadcast(payload) {
  const data = JSON.stringify(payload);
  for (const client of wss.clients) if (client.readyState === 1) client.send(data);
}

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://x');
  const uid = db.tokens[url.searchParams.get('token')];
  if (!uid) return ws.close(4001, 'unauthorized');
  const wasOnline = online.has(uid) && online.get(uid).size > 0;
  if (!online.has(uid)) online.set(uid, new Set());
  online.get(uid).add(ws);
  if (!wasOnline) broadcast({ type: 'presence', id: uid, online: true });
  ws.isAlive = true;
  ws.on('pong', () => (ws.isAlive = true));
  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (msg.type === 'typing' && msg.to) send(msg.to, { type: 'typing', from: uid, kind: msg.kind || 'text' });
    if (msg.type === 'read' && msg.peer) markRead(uid, msg.peer);
  });
  ws.on('close', () => {
    const set = online.get(uid);
    if (!set) return;
    set.delete(ws);
    if (set.size === 0) {
      online.delete(uid);
      const u = userById(uid);
      if (u) { u.lastSeen = Date.now(); save(); }
      broadcast({ type: 'presence', id: uid, online: false, lastSeen: Date.now() });
    }
  });
});
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 30000);

server.listen(PORT, () => console.log(`delete запущен: http://localhost:${PORT}`));
