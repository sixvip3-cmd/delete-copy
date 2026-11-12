import { api, upload, session, connect, disconnect, onEvent, wsSend } from './api.js';
import { I, verifiedBadge } from './icons.js';
import {
  $, $$, esc, el, linkify, avatar, nameHtml, hhmm, dayLabel, listTime, ago, lastSeen, toast,
  isEmojiOnly, pickFile, longPress, plural,
} from './util.js';
import { canRecord as canRecordLive, startRecording, voiceHtml, bindVoice, stopVoice, analyzeAudio } from './voice.js';
const DEMO = !!window.DELETE_DEMO;
const canRecord = () => DEMO || canRecordLive();
import { openStories } from './stories.js';
import { go, here, back, replace, onRoute } from './nav.js';

const app = $('#app');
const state = {
  me: null,
  chats: [],
  favorites: null,
  stories: [],
  typing: {},        // peerId -> { kind, until }
  feedMode: 'all',
  chat: null,        // текущий открытый чат
  screen: null,      // имя текущего экрана
  cleanup: null,
};

/* ================================================================ boot */
async function boot() {
  if (!session.token) return renderOnboarding();
  try {
    state.me = await api('/me');
  } catch (e) {
    if (e.status === 401) { session.set(null); return renderOnboarding(); }
    app.innerHTML = `<div class="empty"><div class="big">📡</div>Нет связи с сервером</div>`;
    return setTimeout(boot, 3000);
  }
  connect();
  refreshChats();
  loadStories();
  if (!here() || here() === '#/' || here() === '#') replace('#/chats');
  route();
}
onRoute(() => state.me && route());

function route() {
  state.cleanup?.();
  state.cleanup = null;
  state.chat = null;
  stopVoice();
  const [, name, arg] = here().split('/');
  switch (name) {
    case 'feed': return renderFeed();
    case 'me': return renderProfile(state.me.username, true);
    case 'u': return arg && decodeURIComponent(arg) === state.me.username ? renderProfile(state.me.username, true) : renderProfile(decodeURIComponent(arg || ''));
    case 'chat': return renderChat(decodeURIComponent(arg || ''));
    case 'favorites': return renderChat(state.me.id);
    case 'chats':
    default: return renderChats();
  }
}


/* ================================================================ realtime */
onEvent((ev) => {
  switch (ev.type) {
    case 'message': {
      const m = ev.message;
      const peerId = m.from === state.me.id ? m.to : m.from;
      if (state.chat && state.chat.peerId === peerId) {
        state.chat.append(m, true);
        if (m.from !== state.me.id) wsSend({ type: 'read', peer: peerId });
      } else if (m.from !== state.me.id) {
        notify(ev.user, m);
      }
      if (m.from !== state.me.id) clearTyping(m.from);
      refreshChats();
      break;
    }
    case 'deleted':
      if (state.chat && state.chat.peerId === ev.peer) state.chat.remove(ev.id);
      refreshChats();
      break;
    case 'edited':
      state.chat?.update(ev.message);
      refreshChats();
      break;
    case 'typing':
      state.typing[ev.from] = { kind: ev.kind, until: Date.now() + 4000 };
      onTypingChanged(ev.from);
      setTimeout(() => { if (state.typing[ev.from] && state.typing[ev.from].until <= Date.now()) clearTyping(ev.from); }, 4100);
      break;
    case 'read':
    case 'unread':
      refreshChats();
      break;
    case 'presence': {
      const c = state.chats.find((x) => x.user.id === ev.id);
      if (c) { c.user.online = ev.online; c.user.lastSeen = ev.lastSeen || c.user.lastSeen; }
      if (state.chat && state.chat.peerId === ev.id) state.chat.presence(ev);
      if (state.screen === 'chats') renderChatList();
      break;
    }
    case 'stories':
      loadStories();
      break;
    case 'post':
      if (state.screen === 'feed' && ev.post.user.id !== state.me.id) state.onNewPost?.(ev.post);
      break;
    case 'connected':
      refreshChats();
      break;
  }
});

function clearTyping(uid) { delete state.typing[uid]; onTypingChanged(uid); }
function onTypingChanged(uid) {
  if (state.chat && state.chat.peerId === uid) state.chat.renderStatus();
  if (state.screen === 'chats') renderChatList();
}
function typingText(uid) {
  const t = state.typing[uid];
  if (!t || t.until < Date.now()) return null;
  return t.kind === 'voice' ? 'записывает голосовое' : 'печатает';
}

function notify(user, m) {
  if (!user) return;
  const text = m.type === 'voice' ? '🎤 Голосовое сообщение' : m.type === 'image' ? '🖼 Фото' : m.type === 'video' ? '🎬 Видео' : m.text;
  toast(`${user.name}: ${text}`, 2600);
  if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
    try { new Notification(user.name, { body: text, icon: user.avatar || '/icon.svg' }); } catch {}
  }
}

let chatsTimer;
function refreshChats() {
  clearTimeout(chatsTimer);
  chatsTimer = setTimeout(async () => {
    try {
      const r = await api('/chats');
      state.chats = r.chats;
      state.favorites = r.favorites;
      updateBadges();
      if (state.screen === 'chats') renderChatList();
    } catch {}
  }, 80);
}
function unreadChats(exceptPeer) { return state.chats.filter((c) => c.unread > 0 && c.user.id !== exceptPeer).length; }
function updateBadges() {
  const n = unreadChats();
  $$('.tab[data-tab="chats"] .badge').forEach((b) => { b.textContent = n; b.classList.toggle('hidden', !n); });
  const bp = $('.back-pill .count');
  if (bp) { const k = unreadChats(state.chat?.peerId); bp.textContent = k; bp.classList.toggle('hidden', !k); }
  document.title = n ? `(${n}) delete` : 'delete';
}

async function loadStories() {
  try {
    state.stories = await api('/stories');
    $$('[data-stories-row]').forEach(renderStoriesRow);
  } catch {}
}

/* ================================================================ common UI */
function tabbar(active) {
  const tabs = [['feed', 'Лента', I.home], ['chats', 'Чаты', I.chats], ['me', 'Профиль', I.user]];
  const idx = tabs.findIndex((t) => t[0] === active);
  const n = unreadChats();
  const node = el(`<nav class="tabbar">
    <div class="tabs">
      <div class="tab-indicator" style="transform:translateX(${idx * 100}%)"></div>
      ${tabs.map(([k, label, ic]) => `<button class="tab ${k === active ? 'active' : ''}" data-tab="${k}">${ic}<span>${label}</span>${k === 'chats' ? `<span class="badge ${n ? '' : 'hidden'}">${n}</span>` : ''}</button>`).join('')}
    </div>
    <button class="plus-btn" aria-label="Создать">${I.plus}</button>
  </nav>`);
  node.querySelectorAll('.tab').forEach((b, i) => b.addEventListener('click', () => {
    node.querySelector('.tab-indicator').style.transform = `translateX(${i * 100}%)`;
    const target = '#/' + b.dataset.tab;
    if (here() === target) { $('.scroll', app)?.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    setTimeout(() => go(target), 120);
  }));
  node.querySelector('.plus-btn').addEventListener('click', openCreateSheet);
  return node;
}

function mountScreen(name, html, { tab, push } = {}) {
  state.screen = name;
  const screen = el(`<div class="screen ${tab ? 'has-tabbar' : ''} ${push ? 'push-in' : 'fade-in'} ${name}-screen">${html}</div>`);
  if (tab) screen.appendChild(tabbar(tab));
  app.replaceChildren(screen);
  return screen;
}

export function openSheet(html, { onClose } = {}) {
  const root = el(`<div class="sheet-backdrop"><div class="sheet"><div class="grab"></div>${html}</div></div>`);
  $('#sheet-root').appendChild(root);
  const sheet = root.querySelector('.sheet');
  const close = () => {
    sheet.style.transition = 'transform .22s ease';
    sheet.style.transform = 'translateY(100%)';
    root.style.transition = 'opacity .22s';
    root.style.opacity = '0';
    setTimeout(() => root.remove(), 220);
    onClose?.();
  };
  root.addEventListener('click', (e) => { if (e.target === root) close(); });
  // свайп вниз за «ручку»
  let sy = null;
  root.querySelector('.grab').addEventListener('pointerdown', (e) => { sy = e.clientY; e.target.setPointerCapture(e.pointerId); });
  root.querySelector('.grab').addEventListener('pointermove', (e) => { if (sy != null) sheet.style.transform = `translateY(${Math.max(0, e.clientY - sy)}px)`; });
  root.querySelector('.grab').addEventListener('pointerup', (e) => { if (sy != null && e.clientY - sy > 80) close(); else sheet.style.transform = ''; sy = null; });
  return { root, sheet, close };
}

function menuSheet(items, title) {
  const { sheet, close } = openSheet(`${title ? `<h3>${esc(title)}</h3>` : ''}<div class="menu">${items.map((it, i) =>
    `<button data-i="${i}" class="${it.danger ? 'danger' : ''}">${it.icon || ''}${esc(it.label)}</button>`).join('')}</div>
    <div class="menu" style="margin-top:10px"><button data-cancel style="justify-content:center;font-weight:600">Отмена</button></div>`);
  sheet.querySelectorAll('[data-i]').forEach((b) => b.addEventListener('click', () => { close(); items[+b.dataset.i].action(); }));
  sheet.querySelector('[data-cancel]').addEventListener('click', close);
}

function lightbox(url, type = 'image') {
  const lb = el(`<div class="lightbox">${type === 'video' ? `<video src="${esc(url)}" controls autoplay playsinline></video>` : `<img src="${esc(url)}" alt="">`}<button class="circle-btn">${I.close}</button></div>`);
  lb.addEventListener('click', (e) => { if (e.target.tagName !== 'VIDEO') lb.remove(); });
  document.body.appendChild(lb);
}

function storyRing(u, size) {
  const g = state.stories.find((s) => s.user.id === u.id);
  if (!g) return avatar(u, size);
  return `<div class="ring ${g.allSeen ? 'seen' : ''}" data-open-story="${u.id}"><div class="ring-inner">${avatar(u, size - 11)}</div></div>`;
}
function openUserStories(uid) {
  const groups = state.stories.filter((g) => g.items.length);
  const idx = groups.findIndex((g) => g.user.id === uid);
  if (idx < 0) return;
  openStories(groups, idx, { me: state.me, onClose: loadStories, onReply: replyToStory });
}
async function replyToStory(user, s, text) {
  await api('/messages', {
    method: 'POST',
    body: { to: user.id, type: 'story', text, story: { url: s.media?.url || null, mediaType: s.media?.type || null, text: s.text, bg: s.bg } },
  });
}

/* ================================================================ stories row */
function renderStoriesRow(row) {
  const me = state.me;
  const mine = state.stories.find((g) => g.user.id === me.id);
  const others = state.stories.filter((g) => g.user.id !== me.id);
  row.innerHTML = `
    <button class="story-item" data-me>
      ${mine
        ? `<div class="ring ${mine.allSeen ? 'seen' : ''}"><div class="ring-inner">${avatar(me, 59)}</div></div>`
        : `<div class="story-add">${avatar(me, 70)}<span class="plus">+</span></div>`}
      <span>Моя история</span>
    </button>
    ${others.map((g) => `<button class="story-item ${g.allSeen ? 'seen' : ''}" data-uid="${g.user.id}">
      <div class="ring ${g.allSeen ? 'seen' : ''}"><div class="ring-inner">${avatar(g.user, 59)}</div></div>
      <span>${esc(g.user.name)}</span></button>`).join('')}`;
  row.querySelector('[data-me]').addEventListener('click', () => (mine ? openUserStories(me.id) : openStorySheet()));
  row.querySelectorAll('[data-uid]').forEach((b) => b.addEventListener('click', () => openUserStories(b.dataset.uid)));
}

/* ================================================================ CHATS */
function renderChats() {
  const screen = mountScreen('chats', `
    <header class="topbar"><div class="spacer44"></div><div class="title chats-title">Чаты</div>
      <button class="circle-btn" data-search aria-label="Поиск">${I.search}</button></header>
    <div class="scroll">
      <div class="search-box hidden">${I.search}<input placeholder="Поиск людей и чатов" enterkeyhint="search"></div>
      <div class="stories" data-stories-row></div>
      <div data-list></div>
    </div>`, { tab: 'chats' });
  renderStoriesRow($('[data-stories-row]', screen));
  const box = $('.search-box', screen);
  const inp = $('input', box);
  $('[data-search]', screen).addEventListener('click', () => {
    box.classList.toggle('hidden');
    if (!box.classList.contains('hidden')) inp.focus();
    else { inp.value = ''; state.chatQuery = ''; renderChatList(); }
  });
  let st;
  inp.addEventListener('input', () => {
    state.chatQuery = inp.value.trim();
    renderChatList();
    clearTimeout(st);
    st = setTimeout(searchPeople, 250);
  });
  state.chatQuery = '';
  state.people = [];
  renderChatList();
  refreshChats();
}

async function searchPeople() {
  const q = state.chatQuery;
  if (!q) { state.people = []; return renderChatList(); }
  try {
    const users = await api('/users?q=' + encodeURIComponent(q));
    if (q === state.chatQuery) { state.people = users; renderChatList(); }
  } catch {}
}

function renderChatList() {
  const list = $('[data-list]', app);
  if (!list) return;
  const q = (state.chatQuery || '').toLowerCase();
  const chats = state.chats.filter((c) => !q || c.user.name.toLowerCase().includes(q) || c.user.username.toLowerCase().includes(q));
  const chatIds = new Set(state.chats.map((c) => c.user.id));
  const people = (state.people || []).filter((u) => !chatIds.has(u.id));

  let html = '';
  if (!q || 'избранное'.includes(q)) {
    html += `<a class="chat-row" href="#/favorites">
      <div class="fav-avatar" style="width:70px;height:70px">${I.bookmarkFill}</div>
      <div class="body"><div class="main"><div class="name"><span class="n">Избранное</span></div>
      ${state.favorites ? `<div class="preview">${esc(state.favorites.text)}</div>` : ''}</div>
      ${state.favorites ? `<div class="meta"><span class="time">${listTime(state.favorites.createdAt)}</span></div>` : ''}</div></a>`;
  }
  html += chats.map((c) => {
    const typing = typingText(c.user.id);
    return `<a class="chat-row" href="#/chat/${c.user.id}">
      <div class="avatar-wrap">${avatar(c.user, 70)}${c.user.online ? '<span class="dot"></span>' : ''}</div>
      <div class="body"><div class="main">
        <div class="name">${nameHtml(c.user)}</div>
        <div class="preview ${typing ? 'typing' : ''}">${typing ? esc(typing) + '…' : (c.last.mine ? '<span style="color:#fff">Вы: </span>' : '') + esc(c.last.text)}</div>
      </div>
      <div class="meta"><span class="time">${c.last.mine ? (c.last.read ? I.check2 : I.check) : ''}${listTime(c.last.createdAt)}</span>
        ${c.unread ? `<span class="unread">${c.unread}</span>` : '<span style="height:22px"></span>'}</div></div></a>`;
  }).join('');
  if (people.length) {
    html += `<div class="section-label">Люди</div>` + people.map((u) => `<a class="chat-row" href="#/u/${esc(u.username)}">
      ${avatar(u, 56)}<div class="body"><div class="main"><div class="name">${nameHtml(u)}</div><div class="preview">@${esc(u.username)}</div></div></div></a>`).join('');
  }
  if (!chats.length && q && !people.length) html += `<div class="empty">Ничего не найдено</div>`;
  if (!state.chats.length && !q) html += `<div class="empty"><div class="big">💬</div>Пока нет чатов.<br>Найдите людей через поиск 🔍</div>`;
  list.innerHTML = html;
}

/* ================================================================ CHAT */
async function renderChat(peerId) {
  const isFav = peerId === state.me.id;
  const screen = mountScreen('chat', `
    <header class="topbar">
      <button class="back-pill" data-back aria-label="Назад">${I.back}<span class="count hidden"></span></button>
      <div class="title"><span data-title>${isFav ? 'Избранное' : ''}</span><small data-status></small></div>
      <button data-peer aria-label="Профиль">${isFav ? `<div class="fav-avatar" style="width:44px;height:44px">${I.bookmarkFill}</div>` : avatar(null, 44)}</button>
    </header>
    <div class="scroll"><div class="messages"><div class="feed-loader"><div class="spinner"></div></div></div></div>
    <div class="composer-wrap">
      <div class="reply-bar hidden"></div>
      <div class="composer">
        <div class="field">
          <button class="attach" aria-label="Прикрепить">${I.clip}</button>
          <textarea rows="1" placeholder="Сообщение" enterkeyhint="send"></textarea>
        </div>
        <button class="send-btn" aria-label="Отправить">${I.mic}</button>
      </div>
    </div>`, { push: true });

  const scroll = $('.scroll', screen);
  const list = $('.messages', screen);
  const ta = $('textarea', screen);
  const sendBtn = $('.send-btn', screen);
  const replyBar = $('.reply-bar', screen);
  const field = $('.field', screen);
  let peer = null;
  let messages = [];
  let replyTo = null;
  let editing = null;

  $('[data-back]', screen).addEventListener('click', () => back('#/chats'));
  $('[data-peer]', screen).addEventListener('click', () => { if (!isFav && peer) go('#/u/' + peer.username); });

  const chat = {
    peerId,
    append(m, animate) { if (messages.some((x) => x.id === m.id)) return; messages.push(m); appendRow(m, animate); },
    remove(id) {
      messages = messages.filter((x) => x.id !== id);
      redraw();
    },
    update(m) {
      const i = messages.findIndex((x) => x.id === m.id);
      if (i < 0) return;
      messages[i] = m;
      const row = list.querySelector(`[data-id="${m.id}"]`);
      if (row) { const nr = buildRow(m, messages[i - 1], messages[i + 1]); row.replaceWith(nr); }
    },
    presence(ev) { if (peer) { peer.online = ev.online; if (ev.lastSeen) peer.lastSeen = ev.lastSeen; chat.renderStatus(); } },
    renderStatus() {
      const st = $('[data-status]', screen);
      if (!st || isFav || !peer) return;
      const t = typingText(peerId);
      st.className = t || peer.online ? 'online' : '';
      st.innerHTML = t ? `${esc(t)} <span class="typing-ind"><i></i><i></i><i></i></span>` : esc(lastSeen(peer));
    },
  };
  state.chat = chat;
  updateBadges();

  try {
    const r = await api(`/chats/${encodeURIComponent(peerId)}/messages`);
    if (state.chat !== chat) return;
    peer = r.user;
    messages = r.messages;
  } catch (e) {
    list.innerHTML = `<div class="empty">${esc(e.message)}</div>`;
    return;
  }
  if (!peer) { list.innerHTML = '<div class="empty">Пользователь не найден</div>'; return; }
  if (!isFav) {
    $('[data-title]', screen).textContent = peer.name;
    $('[data-peer]', screen).innerHTML = avatar(peer, 44);
    chat.renderStatus();
  }
  redraw();
  wsSend({ type: 'read', peer: peerId });
  api(`/chats/${encodeURIComponent(peerId)}/read`, { method: 'POST' }).then(refreshChats).catch(() => {});

  function redraw() {
    list.innerHTML = '';
    if (!messages.length) {
      list.innerHTML = `<div class="empty" data-empty>${isFav
        ? '<div class="big">🔖</div>Сохраняйте здесь заметки,<br>ссылки и голосовые'
        : `<div style="margin-bottom:14px;display:flex;justify-content:center">${avatar(peer, 84)}</div><b style="color:#fff">${esc(peer.name)}</b><br>Напишите первое сообщение 👋`}</div>`;
    }
    messages.forEach((m, i) => list.appendChild(buildRowWithDay(m, messages[i - 1], messages[i + 1])));
    scroll.scrollTop = scroll.scrollHeight;
  }

  function buildRowWithDay(m, prev, next) {
    const frag = document.createDocumentFragment();
    if (!prev || dayLabel(prev.createdAt) !== dayLabel(m.createdAt)) frag.appendChild(el(`<div class="day" data-day="${dayLabel(m.createdAt)}">${dayLabel(m.createdAt)}</div>`));
    frag.appendChild(buildRow(m, prev, next));
    return frag;
  }

  function appendRow(m, animate) {
    list.querySelector('[data-empty]')?.remove();
    const nearBottom = scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 160;
    const prev = messages[messages.length - 2];
    // у предыдущего входящего от того же автора убираем аватар (группировка)
    if (prev && prev.from === m.from && prev.from !== state.me.id && dayLabel(prev.createdAt) === dayLabel(m.createdAt)) {
      const pr = list.querySelector(`[data-id="${prev.id}"] .av-slot`);
      if (pr) pr.innerHTML = '';
    }
    const frag = buildRowWithDay(m, prev, null);
    if (animate) frag.lastChild.querySelector('.bubble')?.classList.add('msg-enter');
    list.appendChild(frag);
    if (nearBottom || m.from === state.me.id) scroll.scrollTo({ top: scroll.scrollHeight, behavior: animate ? 'smooth' : 'auto' });
  }

  function buildRow(m, prev, next) {
    const out = m.from === state.me.id;
    const lastInGroup = !next || next.from !== m.from || dayLabel(next.createdAt) !== dayLabel(m.createdAt);
    const stamp = `<span class="stamp">${m.editedAt ? '<span class="edited">изм.</span>' : ''}${hhmm(m.createdAt)}</span>`;
    let quote = '';
    if (m.reply) {
      const rn = m.reply.from === state.me.id ? state.me.name : (peer?.id === m.reply.from ? peer.name : m.reply.name);
      quote = `<button class="quote" data-jump="${m.reply.id}"><b>${esc(rn)}</b><span>${esc(m.reply.text)}</span></button>`;
    }
    let cls = 'bubble', inner = '';
    switch (m.type) {
      case 'voice':
        inner = quote + voiceHtml(m, stamp);
        break;
      case 'image':
        cls += ' media';
        inner = (quote ? `<div style="padding:6px 8px 0">${quote}</div>` : '') + `<img src="${esc(m.media)}" alt="" data-lb="image">` +
          (m.text ? `<div class="caption"><span class="text">${linkify(m.text)}</span>${stamp}</div>` : stamp.replace('stamp', 'stamp over'));
        break;
      case 'video':
        cls += ' media';
        inner = `<video src="${esc(m.media)}#t=0.1" playsinline preload="metadata" data-lb="video"></video>` +
          (m.text ? `<div class="caption"><span class="text">${linkify(m.text)}</span>${stamp}</div>` : stamp.replace('stamp', 'stamp over'));
        break;
      case 'story': {
        const sref = m.story || {};
        const thumbStyle = sref.url && sref.mediaType !== 'video' ? `background-image:url('${esc(sref.url)}')` : `background:${esc(sref.bg || '#333')}`;
        inner = `<div class="story-ref"><div class="thumb" style="${thumbStyle}">${!sref.url ? esc((sref.text || '').slice(0, 30)) : ''}</div><span>${out ? 'Вы ответили на историю' : 'Ответ на вашу историю'}</span></div>
          <span class="text">${linkify(m.text)}</span>${stamp}`;
        break;
      }
      default:
        if (!quote && isEmojiOnly(m.text)) { cls += ' emoji'; inner = `<span class="text">${esc(m.text)}</span>${stamp}`; }
        else inner = quote + `<span class="text">${linkify(m.text)}</span>${stamp}`;
        if (quote) cls += ' wide';
    }
    const showAv = !out && !isFav;
    const row = el(`<div class="row ${out ? 'out' : 'in'}" data-id="${m.id}" data-from="${m.from}">
      ${showAv ? `<div class="av-slot">${lastInGroup ? avatar(peer, 40) : ''}</div>` : ''}
      <div class="${cls}">${inner}</div></div>`);
    const bubble = row.querySelector('.bubble');
    if (m.type === 'voice') bindVoice(bubble.querySelector('.voice'), m, () => {
      // автопроигрывание следующего голосового
      const i = messages.indexOf(m);
      const nx = messages.slice(i + 1).find((x) => x.type === 'voice');
      if (nx && nx.from === m.from) list.querySelector(`[data-id="${nx.id}"] .voice`)?._play?.();
    });
    bubble.querySelector('[data-lb]')?.addEventListener('click', (e) => { e.stopPropagation(); lightbox(m.media, e.target.dataset.lb); });
    bubble.querySelector('[data-jump]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const t = list.querySelector(`[data-id="${e.currentTarget.dataset.jump}"] .bubble`);
      if (t) { t.scrollIntoView({ behavior: 'smooth', block: 'center' }); t.classList.remove('highlight'); void t.offsetWidth; t.classList.add('highlight'); }
    });
    longPress(bubble, () => messageMenu(m));
    bubble.addEventListener('dblclick', () => startReply(m));
    swipeToReply(row, bubble, () => startReply(m));
    return row;
  }

  function swipeToReply(row, bubble, cb) {
    let sx = null, sy = 0, dx = 0, active = false;
    row.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; dx = 0; active = false; }, { passive: true });
    row.addEventListener('touchmove', (e) => {
      if (sx == null) return;
      const x = e.touches[0].clientX - sx, y = e.touches[0].clientY - sy;
      if (!active && Math.abs(x) > 12 && Math.abs(x) > Math.abs(y) * 1.5 && x < 0) active = true;
      if (active) { dx = Math.max(-80, Math.min(0, x)); bubble.style.transform = `translateX(${dx}px)`; }
    }, { passive: true });
    row.addEventListener('touchend', () => {
      if (active && dx <= -55) { navigator.vibrate?.(8); cb(); }
      bubble.style.transition = 'transform .2s'; bubble.style.transform = '';
      setTimeout(() => (bubble.style.transition = ''), 200);
      sx = null; active = false;
    });
  }

  function messageMenu(m) {
    const out = m.from === state.me.id;
    const items = [{ label: 'Ответить', icon: I.reply, action: () => startReply(m) }];
    if (m.text) items.push({ label: 'Копировать', icon: I.copy, action: () => { navigator.clipboard?.writeText(m.text); toast('Скопировано'); } });
    if (!isFav) items.push({ label: 'В избранное', icon: I.bookmark, action: () => saveToFavorites(m) });
    if (out && m.type === 'text') items.push({ label: 'Изменить', icon: I.edit, action: () => startEdit(m) });
    if (out) items.push({ label: 'Удалить', icon: I.trash, danger: true, action: async () => { await api('/messages/' + m.id, { method: 'DELETE' }); chat.remove(m.id); } });
    menuSheet(items);
  }

  async function saveToFavorites(m) {
    const body = { to: state.me.id, type: m.type === 'story' ? 'text' : m.type, text: m.text || '', media: m.media, duration: m.duration, waveform: m.waveform };
    if (body.type === 'text' && !body.text) return;
    await api('/messages', { method: 'POST', body });
    toast('Сохранено в Избранное');
  }

  function startReply(m) {
    editing = null;
    replyTo = m;
    const who = m.from === state.me.id ? state.me.name : peer.name;
    const txt = m.type === 'voice' ? '🎤 Голосовое сообщение' : m.type === 'image' ? '🖼 Фото' : m.type === 'video' ? '🎬 Видео' : m.text;
    showBar(I.reply, who, txt);
    ta.focus();
  }
  function startEdit(m) {
    replyTo = null;
    editing = m;
    showBar(I.edit, 'Редактирование', m.text);
    ta.value = m.text;
    autosize();
    ta.focus();
  }
  function showBar(icon, title, text) {
    replyBar.innerHTML = `<span class="ic">${icon}</span><div class="rb"><b>${esc(title)}</b><span>${esc(text)}</span></div><button aria-label="Отмена">${I.close}</button>`;
    replyBar.classList.remove('hidden');
    replyBar.querySelector('button').addEventListener('click', clearBar);
  }
  function clearBar() {
    if (editing) { ta.value = ''; autosize(); }
    replyTo = null; editing = null;
    replyBar.classList.add('hidden');
  }

  /* ---------- composer */
  function autosize() {
    ta.style.height = 'auto';
    ta.style.height = Math.min(140, ta.scrollHeight) + 'px';
    const has = !!ta.value.trim();
    sendBtn.classList.toggle('ready', has);
    sendBtn.innerHTML = has || !canRecord() ? I.arrowUp : I.mic;
  }
  autosize();
  let lastTyping = 0;
  ta.addEventListener('input', () => {
    autosize();
    if (!isFav && Date.now() - lastTyping > 2500) { lastTyping = Date.now(); wsSend({ type: 'typing', to: peerId }); }
  });
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !('ontouchstart' in window)) { e.preventDefault(); sendText(); }
  });

  async function sendText() {
    const text = ta.value.trim();
    if (!text) return;
    ta.value = '';
    autosize();
    ta.focus();
    try {
      if (editing) {
        const m = await api('/messages/' + editing.id, { method: 'PATCH', body: { text } });
        chat.update(m);
      } else {
        const m = await api('/messages', { method: 'POST', body: { to: peerId, text, replyTo: replyTo?.id } });
        chat.append(m, true);
      }
      clearBar();
    } catch (e) { toast(e.message); ta.value = text; autosize(); }
  }

  $('.attach', screen).addEventListener('click', async () => {
    const [file] = await pickFile('image/*,video/*');
    if (!file) return;
    toast('Загрузка…', 10000);
    try {
      const up = await upload(file);
      const m = await api('/messages', { method: 'POST', body: { to: peerId, type: up.type === 'video' ? 'video' : 'image', media: up.url, text: ta.value.trim(), replyTo: replyTo?.id } });
      ta.value = '';
      autosize();
      clearBar();
      chat.append(m, true);
      toast('Отправлено', 900);
    } catch (e) { toast(e.message); }
  });

  /* ---------- голосовые: удержание — запись, отпустить — отправить,
     влево — отмена, вверх — закрепить; короткий тап — режим «без рук» */
  let rec = null, recStarting = null, recUi = null, locked = false, startX = 0, startY = 0, downAt = 0, levelsDom = null, timeDom = null;

  sendBtn.addEventListener('pointerdown', async (e) => {
    if (ta.value.trim() || !canRecord() || DEMO) return;
    if (rec && locked) return; // в закреплённом режиме обработаем в click
    e.preventDefault();
    sendBtn.setPointerCapture(e.pointerId);
    startX = e.clientX; startY = e.clientY; downAt = Date.now(); locked = false;
    showRecorder();
    recStarting = startRecording((lvl, t) => {
      if (!levelsDom) return;
      const bar = document.createElement('i');
      bar.style.height = Math.max(3, lvl * 28) + 'px';
      levelsDom.appendChild(bar);
      while (levelsDom.children.length > 70) levelsDom.firstChild.remove();
      timeDom.textContent = fmtRec(t);
    }).then((r) => {
      rec = r;
      if (!isFav) wsSend({ type: 'typing', to: peerId, kind: 'voice' });
      return r;
    }).catch((err) => {
      hideRecorder();
      toast(err.name === 'NotAllowedError' ? 'Нет доступа к микрофону' : 'Запись недоступна: ' + err.message);
      return null;
    });
  });
  sendBtn.addEventListener('pointermove', (e) => {
    if (!recUi || locked) return;
    const dx = e.clientX - startX, dy = e.clientY - startY;
    const hint = recUi.querySelector('.rec-hint');
    if (hint) hint.style.transform = `translateX(${Math.min(0, dx)}px)`;
    if (dx < -110) finishRecording(false);
    else if (dy < -70) lockRecording();
  });
  sendBtn.addEventListener('pointerup', async () => {
    if (!recUi || locked) return;
    if (Date.now() - downAt < 400) { lockRecording(); return; }
    finishRecording(true);
  });
  sendBtn.addEventListener('pointercancel', () => { if (recUi && !locked) finishRecording(false); });
  sendBtn.addEventListener('click', () => {
    if (DEMO && !ta.value.trim()) return sendAudioFile();
    if (rec && locked) return finishRecording(true);
    if (ta.value.trim() || !canRecord()) sendText();
  });

  // демо внутри артефакта: живой микрофон недоступен — записываем/выбираем аудиофайл
  async function sendAudioFile() {
    const [file] = await pickFile('audio/*', false, true);
    if (!file) return;
    toast('Отправляем голосовое…', 8000);
    try {
      const { duration, waveform } = await analyzeAudio(file);
      const up = await upload(file, file.type || 'audio/mp4');
      const m = await api('/messages', { method: 'POST', body: { to: peerId, type: 'voice', media: up.url, duration, waveform, replyTo: replyTo?.id } });
      clearBar();
      chat.append(m, true);
      toast('Голосовое отправлено', 900);
    } catch (e) { toast(e.message); }
  }

  function fmtRec(t) { const s = Math.floor(t); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')},${Math.floor((t % 1) * 10)}`; }
  function showRecorder() {
    recUi = el(`<div class="recorder"><span class="rec-dot"></span><span class="rec-time">0:00,0</span>
      <div class="live-wave"></div><span class="rec-hint">‹ влево — отмена</span></div>`);
    levelsDom = recUi.querySelector('.live-wave');
    timeDom = recUi.querySelector('.rec-time');
    field.classList.add('hidden');
    field.after(recUi);
    sendBtn.classList.add('rec');
    sendBtn.innerHTML = I.mic;
  }
  function lockRecording() {
    locked = true;
    const hint = recUi.querySelector('.rec-hint');
    hint.outerHTML = `<button class="rec-cancel">Отмена</button>`;
    recUi.querySelector('.rec-cancel').addEventListener('click', () => finishRecording(false));
    sendBtn.classList.remove('rec');
    sendBtn.classList.add('ready');
    sendBtn.innerHTML = I.arrowUp;
  }
  function hideRecorder() {
    recUi?.remove();
    recUi = null; levelsDom = null; timeDom = null; locked = false;
    field.classList.remove('hidden');
    sendBtn.classList.remove('rec');
    autosize();
  }
  async function finishRecording(send) {
    const ui = recUi;
    if (!ui) return;
    hideRecorder();
    const r = rec || (await recStarting);
    rec = null; recStarting = null;
    if (!r) return;
    if (!send) { r.cancel(); toast('Запись отменена', 1000); return; }
    const res = await r.stop();
    if (res.duration < 0.6 || !res.blob.size) { toast('Удерживайте кнопку, чтобы записать голосовое'); return; }
    try {
      const up = await upload(res.blob, res.mime);
      const m = await api('/messages', {
        method: 'POST',
        body: { to: peerId, type: 'voice', media: up.url, duration: res.duration, waveform: res.waveform, replyTo: replyTo?.id },
      });
      clearBar();
      chat.append(m, true);
    } catch (e) { toast(e.message); }
  }

  state.cleanup = () => {
    if (rec) rec.cancel();
    else recStarting?.then((r) => r?.cancel());
  };
}

/* ================================================================ POSTS */
function postHtml(p) {
  const media = p.media || [];
  const mediaHtml = media.length
    ? `<div class="post-media">${media.length > 1 ? '<div class="post-gallery">' : ''}${media.map((m) => m.type === 'video'
        ? `<div style="position:relative"><video src="${esc(m.url)}" muted loop playsinline preload="metadata"></video><button class="mute" data-mute>${I.mute}</button></div>`
        : `<img src="${esc(m.url)}" alt="" loading="lazy">`).join('')}${media.length > 1 ? '</div>' : ''}</div>`
    : '';
  return `<article class="post" data-post="${p.id}">
    <div class="post-head">
      <a href="#/u/${esc(p.user.username)}" class="avatar-wrap">${avatar(p.user, 50)}${p.user.id !== state.me.id && !p.user.isFollowing ? '<span class="plus">+</span>' : ''}</a>
      <a class="who" href="#/u/${esc(p.user.username)}"><b>${nameHtml(p.user)}</b><small>${esc(ago(p.createdAt))}</small></a>
      <div class="post-actions">
        <button data-like class="${p.liked ? 'liked' : ''}">${p.liked ? I.heartFill : I.heart}<span>${p.likes || ''}</span></button>
        <button data-save class="${p.saved ? 'on' : ''}">${p.saved ? I.bookmarkFill : I.bookmark}<span>${p.saves}</span></button>
        <button data-more aria-label="Ещё">${I.moreH}</button>
      </div>
    </div>
    ${p.text ? `<div class="post-text">${linkify(p.text)}</div>` : '<div style="height:8px"></div>'}
    ${mediaHtml}
  </article>`;
}

const videoObserver = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (e.isIntersecting && e.intersectionRatio > 0.6) e.target.play().catch(() => {});
    else e.target.pause();
  }
}, { threshold: [0, 0.6, 1] }) : null;

function bindPost(node, p, { onDelete } = {}) {
  const likeBtn = node.querySelector('[data-like]');
  const saveBtn = node.querySelector('[data-save]');
  const setLike = (np) => {
    Object.assign(p, np);
    likeBtn.className = p.liked ? 'liked' : '';
    likeBtn.innerHTML = (p.liked ? I.heartFill : I.heart) + `<span>${p.likes || ''}</span>`;
  };
  likeBtn.addEventListener('click', async () => setLike(await api(`/posts/${p.id}/like`, { method: 'POST' })));
  saveBtn.addEventListener('click', async () => {
    const np = await api(`/posts/${p.id}/save`, { method: 'POST' });
    Object.assign(p, np);
    saveBtn.className = p.saved ? 'on' : '';
    saveBtn.innerHTML = (p.saved ? I.bookmarkFill : I.bookmark) + `<span>${p.saves}</span>`;
    toast(p.saved ? 'Сохранено' : 'Удалено из сохранённых', 1200);
  });
  node.querySelector('[data-more]').addEventListener('click', () => {
    const mine = p.user.id === state.me.id;
    const items = [];
    if (!mine) items.push({ label: 'Написать ' + p.user.name, icon: I.send, action: () => (go('#/chat/' + p.user.id)) });
    if (p.text) items.push({ label: 'Копировать текст', icon: I.copy, action: () => { navigator.clipboard?.writeText(p.text); toast('Скопировано'); } });
    items.push({ label: 'Профиль', icon: I.user2, action: () => (go('#/u/' + p.user.username)) });
    if (mine) items.push({ label: 'Удалить публикацию', icon: I.trash, danger: true, action: async () => { await api('/posts/' + p.id, { method: 'DELETE' }); node.remove(); onDelete?.(); toast('Публикация удалена'); } });
    menuSheet(items);
  });
  // двойной тап по медиа — лайк
  const media = node.querySelector('.post-media');
  if (media) {
    let lastTap = 0;
    media.addEventListener('click', async (e) => {
      if (e.target.closest('[data-mute]')) return;
      const now = Date.now();
      if (now - lastTap < 320) {
        const heart = el(`<div class="heart-pop">${I.heartFill}</div>`);
        media.appendChild(heart);
        setTimeout(() => heart.remove(), 800);
        if (!p.liked) setLike(await api(`/posts/${p.id}/like`, { method: 'POST' }));
        lastTap = 0;
      } else lastTap = now;
    });
    media.querySelectorAll('video').forEach((v) => videoObserver?.observe(v));
    media.querySelectorAll('[data-mute]').forEach((b) => b.addEventListener('click', (e) => {
      e.stopPropagation();
      const v = b.parentElement.querySelector('video');
      v.muted = !v.muted;
      b.innerHTML = v.muted ? I.mute : I.volume;
    }));
  }
}

/* ================================================================ FEED */
async function renderFeed() {
  const screen = mountScreen('feed', `
    <div class="scroll">
      <div class="feed-head"><div class="bg fallback"></div><div class="ttl">delete</div>
        <div class="seg">
          <button data-mode="all">Все</button><button data-mode="following">Подписки</button><button data-mode="saved">Сохранённые</button>
        </div></div>
      <div class="feed-body">
        <div class="feed-stories"><div class="stories" data-stories-row></div></div>
        <div data-posts style="display:flex;flex-direction:column;gap:14px"><div class="feed-loader"><div class="spinner"></div></div></div>
      </div>
    </div>`, { tab: 'feed' });
  renderStoriesRow($('[data-stories-row]', screen));
  const segs = $$('[data-mode]', screen);
  const setMode = (m) => { state.feedMode = m; segs.forEach((b) => b.classList.toggle('on', b.dataset.mode === m)); load(); };
  segs.forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
  const box = $('[data-posts]', screen);
  state.onNewPost = (p) => {
    if (state.feedMode !== 'all') return;
    const node = el(postHtml(p));
    box.prepend(node);
    bindPost(node, p);
  };
  state.cleanup = () => (state.onNewPost = null);

  async function load() {
    box.innerHTML = '<div class="feed-loader"><div class="spinner"></div></div>';
    let posts;
    try { posts = await api('/feed?mode=' + state.feedMode); } catch (e) { box.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
    if (state.screen !== 'feed') return;
    const firstImg = posts.flatMap((p) => p.media).find((m) => m.type === 'image');
    const bg = $('.feed-head .bg', screen);
    if (firstImg) { bg.classList.remove('fallback'); bg.style.backgroundImage = `url('${firstImg.url}')`; }
    box.innerHTML = '';
    if (!posts.length) {
      box.innerHTML = `<div class="empty"><div class="big">${state.feedMode === 'saved' ? '🔖' : '🌱'}</div>${state.feedMode === 'saved' ? 'Здесь появятся сохранённые публикации' : 'Пока пусто. Подпишитесь на кого-нибудь или опубликуйте первый пост!'}</div>`;
      return;
    }
    for (const p of posts) {
      const node = el(postHtml(p));
      box.appendChild(node);
      bindPost(node, p);
    }
  }
  setMode(state.feedMode);
}

/* ================================================================ PROFILE */
async function renderProfile(username, own = false) {
  const screen = mountScreen(own ? 'me' : 'profile', `
    <header class="topbar">
      ${own ? `<button class="circle-btn" data-edit aria-label="Настройки">${I.settings}</button>` : `<button class="circle-btn" data-back aria-label="Назад">${I.back}</button>`}
      <button class="circle-btn" data-more aria-label="Ещё">${I.moreV}</button>
    </header>
    <div class="scroll"><div class="feed-loader"><div class="spinner"></div></div></div>`, own ? { tab: 'me' } : { push: true });
  $('[data-back]', screen)?.addEventListener('click', () => back('#/feed'));
  const body = $('.scroll', screen);
  let data;
  try { data = await api('/users/' + encodeURIComponent(username)); } catch (e) { body.innerHTML = `<div class="empty"><div class="big">🤷</div>${esc(e.message)}</div>`; return; }
  if (!screen.isConnected) return;
  const u = data.user;
  if (own) state.me = { ...state.me, ...u };

  const draw = () => {
    body.innerHTML = `
      <div class="profile-head">
        <div data-av>${storyRing(u, 140)}</div>
        <div class="pname">${esc(u.name)}${u.verified ? verifiedBadge() : ''}</div>
        <div class="uname">@${esc(u.username)}${!own ? ` · ${esc(lastSeen(u))}` : ''}</div>
        ${u.bio ? `<div class="bio">${linkify(u.bio)}</div>` : ''}
        <div class="profile-stats">
          <div><b>${u.postsCount}</b><span>${plural(u.postsCount, 'публикация', 'публикации', 'публикаций')}</span></div>
          <div><b>${u.followers}</b><span>${plural(u.followers, 'подписчик', 'подписчика', 'подписчиков')}</span></div>
          <div><b>${u.following}</b><span>${plural(u.following, 'подписка', 'подписки', 'подписок')}</span></div>
        </div>
        <div class="profile-actions">
          ${own
            ? `<button class="pill-btn" data-edit2>Редактировать</button><button class="round-dark" data-story aria-label="История">${I.camera}</button>`
            : `<button class="pill-btn ${u.isFollowing ? '' : 'primary'}" data-follow>${u.isFollowing ? 'Отписаться' : 'Подписаться'}</button>
               <a class="round-white" href="#/chat/${u.id}" aria-label="Написать">${I.send}</a>`}
        </div>
      </div>
      <div class="pubs-title">Публикации <span>${data.posts.length}</span></div>
      <div class="feed-body" data-posts style="padding-bottom:20px"></div>`;
    const box = $('[data-posts]', body);
    if (!data.posts.length) box.innerHTML = `<div class="empty" style="padding-top:20px">${own ? 'Нажмите «+», чтобы опубликовать первый пост' : 'Публикаций пока нет'}</div>`;
    for (const p of data.posts) {
      const node = el(postHtml(p));
      box.appendChild(node);
      bindPost(node, p, { onDelete: () => { data.posts = data.posts.filter((x) => x.id !== p.id); u.postsCount--; draw(); } });
    }
    $('[data-open-story]', body)?.addEventListener('click', () => openUserStories(u.id));
    if (own && !state.stories.some((g) => g.user.id === u.id)) $('[data-av]', body).addEventListener('click', openStorySheet);
    $('[data-follow]', body)?.addEventListener('click', async () => {
      const nu = await api(`/users/${u.id}/follow`, { method: 'POST' });
      Object.assign(u, nu);
      draw();
    });
    $('[data-edit2]', body)?.addEventListener('click', openEditProfile);
    $('[data-story]', body)?.addEventListener('click', openStorySheet);
  };
  draw();

  $('[data-edit]', screen)?.addEventListener('click', openEditProfile);
  $('[data-more]', screen).addEventListener('click', () => {
    const link = window.DELETE_DEMO ? '@' + u.username : `${location.origin}/#/u/${u.username}`;
    const items = own
      ? [
          { label: 'Избранное', icon: I.bookmark, action: () => (go('#/favorites')) },
          { label: 'Сохранённые публикации', icon: I.bookmarkFill, action: () => { state.feedMode = 'saved'; go('#/feed'); } },
          { label: 'Редактировать профиль', icon: I.edit, action: openEditProfile },
          { label: 'Поделиться профилем', icon: I.copy, action: () => { navigator.clipboard?.writeText(link); toast('Ссылка скопирована'); } },
          { label: 'Включить уведомления', icon: I.chats, action: () => Notification?.requestPermission?.().then((p) => toast(p === 'granted' ? 'Уведомления включены' : 'Уведомления запрещены')) },
          { label: 'Выйти', icon: I.logout, danger: true, action: logout },
        ]
      : [
          { label: 'Написать', icon: I.send, action: () => (go('#/chat/' + u.id)) },
          { label: 'Скопировать ссылку', icon: I.copy, action: () => { navigator.clipboard?.writeText(link); toast('Ссылка скопирована'); } },
        ];
    menuSheet(items);
  });
}

async function logout() {
  try { await api('/logout', { method: 'POST' }); } catch {}
  disconnect();
  session.set(null);
  state.me = null;
  replace('');
  renderOnboarding();
}

function openEditProfile() {
  const me = state.me;
  let newAvatar;
  const { sheet, close } = openSheet(`<h3>Профиль</h3>
    <div class="form">
      <button class="avatar-edit" data-av>${avatar(me, 96)}<span class="cam">${I.camera}</span></button>
      <input class="input" name="name" placeholder="Имя" value="${esc(me.name)}" maxlength="40">
      <input class="input" name="username" placeholder="Юзернейм" value="${esc(me.username)}" maxlength="24" autocapitalize="off">
      <textarea class="input" name="bio" placeholder="О себе" maxlength="160">${esc(me.bio || '')}</textarea>
      <div class="err"></div>
      <button class="btn" data-save>Сохранить</button>
    </div>`);
  sheet.querySelector('[data-av]').addEventListener('click', async () => {
    const [file] = await pickFile('image/*');
    if (!file) return;
    try {
      const up = await upload(file);
      newAvatar = up.url;
      sheet.querySelector('[data-av] .avatar').outerHTML = avatar({ ...me, avatar: up.url }, 96);
    } catch (e) { toast(e.message); }
  });
  sheet.querySelector('[data-save]').addEventListener('click', async () => {
    const body = {
      name: sheet.querySelector('[name=name]').value,
      username: sheet.querySelector('[name=username]').value.trim(),
      bio: sheet.querySelector('[name=bio]').value,
    };
    if (newAvatar) body.avatar = newAvatar;
    try {
      state.me = await api('/me', { method: 'PATCH', body });
      close();
      toast('Сохранено');
      if (state.screen === 'me') renderProfile(state.me.username, true);
    } catch (e) { sheet.querySelector('.err').textContent = e.message; }
  });
}

/* ================================================================ CREATE */
function openCreateSheet() {
  const { sheet, close } = openSheet(`<h3>Создать</h3>
    <div class="chooser">
      <button data-post><span class="ico" style="background:linear-gradient(135deg,#3b8cff,#7b61ff)">${I.post}</span>Публикация<small>Фото, видео или текст в ленту</small></button>
      <button data-story><span class="ico" style="background:linear-gradient(135deg,#ff4d8d,#ff8a3d)">${I.story}</span>История<small>Исчезнет через 24 часа</small></button>
    </div>`);
  sheet.querySelector('[data-post]').addEventListener('click', () => { close(); setTimeout(openPostSheet, 230); });
  sheet.querySelector('[data-story]').addEventListener('click', () => { close(); setTimeout(openStorySheet, 230); });
}

function openPostSheet() {
  const files = [];
  const { sheet, close } = openSheet(`<h3>Новая публикация</h3>
    <div class="form">
      <div style="display:flex;gap:12px;align-items:flex-start">${avatar(state.me, 44)}
        <textarea class="input" placeholder="Что нового?" maxlength="2000" style="flex:1"></textarea></div>
      <div class="composer-media"></div>
      <div style="display:flex;gap:10px">
        <button class="btn ghost" data-media style="flex:none;width:58px;display:grid;place-items:center">${I.image.replace('<svg', '<svg width="24" height="24"')}</button>
        <button class="btn" data-pub style="flex:1">Опубликовать</button>
      </div>
      <div class="err"></div>
    </div>`);
  const ta = sheet.querySelector('textarea');
  const thumbs = sheet.querySelector('.composer-media');
  setTimeout(() => ta.focus(), 300);
  const drawThumbs = () => {
    thumbs.innerHTML = files.map((f, i) => `<div class="thumb">${f.type.startsWith('video') ? `<video src="${f.preview}" muted></video>` : `<img src="${f.preview}">`}<button data-rm="${i}">✕</button></div>`).join('');
    thumbs.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', () => { files.splice(+b.dataset.rm, 1); drawThumbs(); }));
  };
  sheet.querySelector('[data-media]').addEventListener('click', async () => {
    const picked = await pickFile('image/*,video/*', true);
    for (const f of picked.slice(0, 10 - files.length)) { f.preview = URL.createObjectURL(f); files.push(f); }
    drawThumbs();
  });
  const pub = sheet.querySelector('[data-pub]');
  pub.addEventListener('click', async () => {
    if (!ta.value.trim() && !files.length) { sheet.querySelector('.err').textContent = 'Добавьте текст или медиа'; return; }
    pub.disabled = true;
    pub.textContent = 'Публикуем…';
    try {
      const media = [];
      for (const f of files) { const up = await upload(f); media.push({ type: up.type === 'video' ? 'video' : 'image', url: up.url }); }
      await api('/posts', { method: 'POST', body: { text: ta.value, media } });
      close();
      toast('Опубликовано');
      if (state.screen === 'feed' || state.screen === 'me') route();
      else go('#/feed');
    } catch (e) { sheet.querySelector('.err').textContent = e.message; pub.disabled = false; pub.textContent = 'Опубликовать'; }
  });
}

const STORY_BGS = [
  'linear-gradient(160deg,#ff5f6d,#ffc371)', 'linear-gradient(160deg,#4facfe,#00f2fe)', 'linear-gradient(160deg,#7b61ff,#2b1055)',
  'linear-gradient(160deg,#11998e,#38ef7d)', 'linear-gradient(160deg,#fc466b,#3f5efb)', 'linear-gradient(160deg,#232526,#414345)',
];
function openStorySheet() {
  let file = null, bg = STORY_BGS[0];
  const { sheet, close } = openSheet(`<h3>Новая история</h3>
    <div class="form">
      <div class="story-draft" style="background:${bg}"><div class="stext" contenteditable="true" data-ph="Текст истории">Нажмите, чтобы написать</div></div>
      <div class="bg-choices">${STORY_BGS.map((b, i) => `<button data-bg="${i}" class="${i ? '' : 'on'}" style="background:${b}"></button>`).join('')}</div>
      <div style="display:flex;gap:10px">
        <button class="btn ghost" data-media style="flex:1">Фото / видео</button>
        <button class="btn" data-pub style="flex:1">Опубликовать</button>
      </div>
      <div class="err"></div>
    </div>`);
  const draft = sheet.querySelector('.story-draft');
  const stext = sheet.querySelector('.stext');
  let touched = false;
  stext.addEventListener('focus', () => { if (!touched) { stext.textContent = ''; touched = true; } });
  sheet.querySelectorAll('[data-bg]').forEach((b) => b.addEventListener('click', () => {
    bg = STORY_BGS[+b.dataset.bg];
    draft.style.background = bg;
    sheet.querySelectorAll('[data-bg]').forEach((x) => x.classList.toggle('on', x === b));
  }));
  sheet.querySelector('[data-media]').addEventListener('click', async () => {
    const [f] = await pickFile('image/*,video/*');
    if (!f) return;
    file = f;
    draft.querySelector('img,video')?.remove();
    const url = URL.createObjectURL(f);
    draft.prepend(el(f.type.startsWith('video') ? `<video src="${url}" autoplay muted loop playsinline></video>` : `<img src="${url}">`));
    if (!touched) { stext.textContent = ''; touched = true; }
    sheet.querySelector('.bg-choices').classList.add('hidden');
  });
  const pub = sheet.querySelector('[data-pub]');
  pub.addEventListener('click', async () => {
    const text = touched ? stext.innerText.trim() : '';
    if (!file && !text) { sheet.querySelector('.err').textContent = 'Добавьте фото или текст'; return; }
    pub.disabled = true;
    pub.textContent = 'Публикуем…';
    try {
      let media = null;
      if (file) { const up = await upload(file); media = { type: up.type === 'video' ? 'video' : 'image', url: up.url }; }
      await api('/stories', { method: 'POST', body: { media, text, bg: file ? null : bg } });
      close();
      toast('История опубликована');
      await loadStories();
      if (state.screen === 'me') route();
    } catch (e) { sheet.querySelector('.err').textContent = e.message; pub.disabled = false; pub.textContent = 'Опубликовать'; }
  });
}

/* ================================================================ ONBOARDING / AUTH */
function miniChat() {
  return `<div class="mp-status"><span>9:41</span><span>●●● ▮</span></div>
    <div class="mp-title">delete</div>
    <div style="text-align:center;color:#8e8e93;font-size:9px;margin:6px 0">Сегодня</div>
    <div class="mb o">Привет как ты?</div><div class="mb">Отлично, ты как?</div>
    <div class="mb o">сойдет</div><div class="mb o">завтра в силе?</div>
    <div class="mb">Понял, че завтра все в силе?</div>
    <div class="mb o" style="border-left:2px solid #fff">да)</div>
    <div class="mb">Окей, я наберу тебе завтра</div>
    <div class="mb o">Хорошо возьми куртку будет дождь</div>
    <div style="text-align:right;font-size:34px">🌧️</div>
    <div class="mb">Хорошо, до завтра</div><div class="mb o">Давай 👋</div>`;
}
function miniFeed() {
  return `<div class="mp-status"><span>9:41</span><span>●●● ▮</span></div>
    <div class="mp-title" style="margin:6px -10px 8px;padding:14px 0;background:linear-gradient(135deg,#2c5a2a,#7aa04a);border-radius:0 0 16px 16px">delete</div>
    <div class="mcard"><div class="mrow" style="border:0;padding:0"><i style="background:linear-gradient(135deg,#5f7d5a,#0f1a12)"></i><div><b>delete ⚡</b><span>5 дней назад</span></div></div>
      <div style="margin-top:6px">Смакуем delete</div><div class="mimg" style="background:radial-gradient(circle at 40% 35%,#6b6f6a,#111)"></div></div>
    <div class="mcard"><div class="mrow" style="border:0;padding:0"><i style="background:linear-gradient(135deg,#f4c6d6,#c97a95)"></i><div><b>Каталин</b><span>2 дня назад</span></div></div>
      <div style="margin-top:6px">Люди с самары,газ знакомиться</div></div>`;
}
function miniProfile() {
  return `<div class="mp-status"><span>9:41</span><span>●●● ▮</span></div>
    <div style="display:flex;flex-direction:column;align-items:center;margin-top:14px">
      <i style="width:66px;height:66px;border-radius:50%;background:linear-gradient(135deg,#5f7d5a,#0f1a12)"></i>
      <b style="font-size:14px;margin-top:8px">delete ⚡</b><span style="color:#8e8e93">@delete</span>
      <div style="display:flex;gap:6px;margin-top:8px"><span style="padding:6px 22px;border-radius:14px;background:#1c1c1e;font-weight:600">Отписаться</span><span style="width:26px;height:26px;border-radius:50%;background:#fff"></span></div>
      <b style="margin:12px 0 8px;font-size:12px">Публикации 5</b></div>
    <div class="mcard"><b>delete ⚡</b><div style="margin-top:4px">Поцелуй</div><div class="mimg" style="background:linear-gradient(160deg,#1a2240,#3a4c63 60%,#8a8d86)"></div></div>`;
}
function miniChats() {
  const rows = [['xdaszx', 'давай завтра', '#a7c8e8,#6b9a44'], ['delete ⚡', 'Я жду ес че)', '#5f7d5a,#0f1a12'], ['аринка', 'хорошо', '#f3d6c8,#9b6b5a'], ['Lev1Lem', 'Привет, занят?', '#e4c9a0,#6b5034'], ['Moderator ⚡', 'отлично спасибо за связь', '#6aa5c9,#2f6e3a'], ['max2', '😢😢', '#3b5bcc,#7a1f2b']];
  return `<div class="mp-status"><span>9:41</span><span>●●● ▮</span></div><div class="mp-title">Чаты</div>
    <div class="mrow"><i style="background:radial-gradient(circle at 30% 25%,#ffc28a,#e9855a)"></i><b>Избранное</b></div>
    ${rows.map(([n, t, g]) => `<div class="mrow"><i style="background:linear-gradient(135deg,${g})"></i><div><b>${n}</b><span>${t}</span></div></div>`).join('')}`;
}

function renderOnboarding() {
  state.screen = 'onb';
  const slides = [
    ['Просто напиши', 'Общайся лично без лишнего', miniChat(), 'radial-gradient(35% 30% at 72% 22%, #ffe36e, transparent), radial-gradient(40% 35% at 85% 45%, #5ef2c8, transparent), radial-gradient(45% 40% at 15% 75%, #4de0ff, transparent), radial-gradient(40% 30% at 85% 85%, #b96bff, transparent)'],
    ['Будь в теме', 'Смотри, чем делятся люди вокруг', miniFeed(), 'radial-gradient(40% 30% at 10% 45%, #b388ff, transparent), radial-gradient(45% 40% at 95% 50%, #8e7bff, transparent), radial-gradient(45% 30% at 50% 95%, #ff9be0, transparent)'],
    ['Будь собой', 'Покажи себя таким, каким хочешь', miniProfile(), 'repeating-linear-gradient(-38deg, #000 0 40px, #ff6a3d 60px, #ffb38a 80px, #000 110px)'],
    ['Всегда рядом', 'Все разговоры в одном месте', miniChats(), 'radial-gradient(60% 40% at 50% 15%, #d8d8d8, transparent), radial-gradient(50% 40% at 0% 85%, #9a9a9a, transparent), radial-gradient(40% 40% at 100% 70%, #ff7a3d, transparent)'],
  ];
  app.innerHTML = `<div class="onb fade-in">
    <div class="onb-slides">${slides.map(([h, p, inner, glow]) => `<div class="onb-slide"><div class="onb-card">
      <div class="glow" style="background:${glow}"></div><div class="grain"></div>
      <h1>${h}</h1><p>${p}</p><div class="mini-phone">${inner}</div></div></div>`).join('')}</div>
    <div class="onb-dots">${slides.map((_, i) => `<i class="${i ? '' : 'on'}"></i>`).join('')}</div>
    <div class="onb-actions">
      <button class="btn white" data-reg>Создать аккаунт</button>
      <button class="btn ghost" data-login>Войти</button>
      <button class="link" data-demo>Посмотреть демо →</button>
    </div></div>`;
  const track = $('.onb-slides', app);
  const dots = $$('.onb-dots i', app);
  track.addEventListener('scroll', () => {
    const i = Math.round(track.scrollLeft / track.clientWidth);
    dots.forEach((d, k) => d.classList.toggle('on', k === i));
  });
  const auto = setInterval(() => {
    if (!track.isConnected) return clearInterval(auto);
    const i = (Math.round(track.scrollLeft / track.clientWidth) + 1) % slides.length;
    track.scrollTo({ left: i * track.clientWidth, behavior: 'smooth' });
  }, 4500);
  track.addEventListener('pointerdown', () => clearInterval(auto), { once: true });
  $('[data-reg]', app).addEventListener('click', () => authSheet('register'));
  $('[data-login]', app).addEventListener('click', () => authSheet('login'));
  $('[data-demo]', app).addEventListener('click', () => doAuth('login', { username: 'demo', password: 'demo' }));
}

async function doAuth(mode, body) {
  const r = await api('/' + mode, { method: 'POST', body });
  session.set(r.token);
  state.me = r.user;
  $('#sheet-root').innerHTML = '';
  go('#/chats');
  boot();
}

function authSheet(mode) {
  const reg = mode === 'register';
  const { sheet } = openSheet(`<div class="auth-brand">delete</div>
    <h3 style="font-weight:500;color:#8e8e93;font-size:16px">${reg ? 'Создайте аккаунт' : 'Войдите в аккаунт'}</h3>
    <form class="form">
      ${reg ? '<input class="input" name="name" placeholder="Имя" maxlength="40" autocomplete="name">' : ''}
      <input class="input" name="username" placeholder="Юзернейм" autocapitalize="off" autocomplete="username" required>
      <input class="input" name="password" type="password" placeholder="Пароль" autocomplete="${reg ? 'new-password' : 'current-password'}" required>
      <div class="err"></div>
      <button class="btn" type="submit">${reg ? 'Создать аккаунт' : 'Войти'}</button>
      <button class="link" type="button" data-switch style="color:#8e8e93;padding:8px">${reg ? 'Уже есть аккаунт? Войти' : 'Нет аккаунта? Создать'}</button>
    </form>`);
  const form = sheet.querySelector('form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(form));
    try { await doAuth(mode, fd); } catch (err) { sheet.querySelector('.err').textContent = err.message; }
  });
  sheet.querySelector('[data-switch]').addEventListener('click', () => { $('#sheet-root').innerHTML = ''; authSheet(reg ? 'login' : 'register'); });
  setTimeout(() => form.querySelector('input').focus(), 300);
}

boot();
