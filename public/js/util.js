import { verifiedBadge } from './icons.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
export function linkify(text) {
  return esc(text).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>')
    .replace(/(^|\s)@([a-zA-Z0-9_.]{3,24})/g, '$1<a href="#/u/$2">@$2</a>');
}

export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}

const pad = (n) => String(n).padStart(2, '0');
export const hhmm = (t) => { const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

export function dayLabel(t) {
  const d = new Date(t), now = new Date(), y = new Date(Date.now() - 864e5);
  if (sameDay(d, now)) return 'Сегодня';
  if (sameDay(d, y)) return 'Вчера';
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${d.getFullYear() !== now.getFullYear() ? ' ' + d.getFullYear() : ''}`;
}
export function listTime(t) {
  const d = new Date(t), now = new Date(), y = new Date(Date.now() - 864e5);
  if (sameDay(d, now)) return hhmm(t);
  if (sameDay(d, y)) return 'вчера';
  if (now - d < 6 * 864e5) return ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'][d.getDay()];
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}`;
}
export function ago(t) {
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return 'только что';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} ${plural(m, 'минуту', 'минуты', 'минут')} назад`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ${plural(h, 'час', 'часа', 'часов')} назад`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'Вчера';
  if (d < 30) return `${d} ${plural(d, 'день', 'дня', 'дней')} назад`;
  return dayLabel(t);
}
export function lastSeen(u) {
  if (!u) return '';
  if (u.online) return 'в сети';
  if (!u.lastSeen) return 'был(а) недавно';
  return 'был(а) ' + ago(u.lastSeen).replace('Вчера', 'вчера');
}
export function dur(sec) {
  sec = Math.max(0, Math.round(sec || 0));
  return `${Math.floor(sec / 60)}:${pad(sec % 60)}`;
}

export function avatar(u, size = 44, extraCls = '') {
  if (!u) return `<div class="avatar ${extraCls}" style="width:${size}px;height:${size}px"></div>`;
  const inner = u.avatar
    ? `<img src="${esc(u.avatar)}" alt="" loading="lazy">`
    : `<span class="initial">${esc((u.name || u.username || '?').trim()[0] || '?')}</span>`;
  const bg = u.avatar ? '' : `background:linear-gradient(135deg, ${u.color || '#3a8dff'}, ${shade(u.color || '#3a8dff')});`;
  return `<div class="avatar ${extraCls}" style="width:${size}px;height:${size}px;font-size:${size}px;${bg}">${inner}</div>`;
}
function shade(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, (n >> 16) - 70), g = Math.max(0, ((n >> 8) & 255) - 70), b = Math.max(0, (n & 255) - 70);
  return `rgb(${r},${g},${b})`;
}
export function nameHtml(u, cls = '') {
  return `<span class="n ${cls}">${esc(u?.name || u?.username || '')}</span>${u?.verified ? verifiedBadge() : ''}`;
}

let toastTimer;
export function toast(text, ms = 2200) {
  const t = $('#toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

export function isEmojiOnly(text) {
  const t = (text || '').trim();
  if (!t || t.length > 16) return false;
  return /^(?:\p{Extended_Pictographic}|\p{Emoji_Component}|‍|️|\s)+$/u.test(t) && !/^[\d#*\s]+$/.test(t);
}

export function pickFile(accept, multiple = false, capture = false) {
  return new Promise((resolve) => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = accept;
    inp.multiple = multiple;
    if (capture) inp.setAttribute('capture', '');
    inp.onchange = () => resolve([...inp.files]);
    inp.click();
  });
}

export function longPress(node, cb, ms = 450) {
  let timer, sx, sy, fired = false;
  node.addEventListener('pointerdown', (e) => {
    if (e.button && e.button !== 0) return;
    fired = false; sx = e.clientX; sy = e.clientY;
    timer = setTimeout(() => { fired = true; navigator.vibrate?.(10); cb(e); }, ms);
  });
  const cancel = () => clearTimeout(timer);
  node.addEventListener('pointermove', (e) => { if (Math.hypot(e.clientX - sx, e.clientY - sy) > 8) cancel(); });
  node.addEventListener('pointerup', cancel);
  node.addEventListener('pointercancel', cancel);
  node.addEventListener('pointerleave', cancel);
  node.addEventListener('contextmenu', (e) => { e.preventDefault(); if (!fired) { cancel(); cb(e); } });
  node.addEventListener('click', (e) => { if (fired) { e.stopPropagation(); e.preventDefault(); fired = false; } }, true);
}
