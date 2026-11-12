// Просмотр историй
import { api } from './api.js';
import { I, verifiedBadge } from './icons.js';
import { esc, el, avatar, ago, toast } from './util.js';

const DURATION = 5000;

/**
 * groups: [{user, items:[{id, media, text, bg, createdAt, seen}]}]
 */
export function openStories(groups, startGroup, { me, onClose, onReply } = {}) {
  let gi = startGroup;
  let ii = Math.max(0, groups[gi].items.findIndex((s) => !s.seen));
  let raf, startTs, elapsedBefore = 0, paused = false, curDuration = DURATION, video = null;

  const root = el(`<div class="viewer"><div class="stage">
    <div class="content"></div><div class="shade"></div>
    <div class="bars"></div>
    <div class="vhead"></div>
    <div class="tap l"></div><div class="tap r"></div>
    <div class="vfoot"></div>
  </div></div>`);
  document.body.appendChild(root);
  const $ = (s) => root.querySelector(s);

  function close() {
    cancelAnimationFrame(raf);
    video?.pause();
    root.remove();
    document.removeEventListener('keydown', onKey);
    onClose?.();
  }

  function render() {
    cancelAnimationFrame(raf);
    const g = groups[gi];
    const s = g.items[ii];
    const mine = me && g.user.id === me.id;
    $('.bars').innerHTML = g.items.map((_, k) => `<i><b style="width:${k < ii ? 100 : 0}%"></b></i>`).join('');
    $('.vhead').innerHTML = `${avatar(g.user, 34)}
      <button class="who" data-user>${esc(g.user.name)}${g.user.verified ? verifiedBadge() : ''} <small>${esc(ago(s.createdAt))}</small></button>
      ${mine ? `<button data-del aria-label="Удалить">${I.trash}</button>` : ''}
      <button data-close aria-label="Закрыть">${I.close}</button>`;

    const c = $('.content');
    video = null;
    c.style.background = s.bg || '#111';
    let html = '';
    if (s.media?.type === 'image') html += `<img src="${esc(s.media.url)}" alt="">`;
    if (s.media?.type === 'video') html += `<video src="${esc(s.media.url)}" playsinline autoplay></video>`;
    if (s.text) html += `<div class="stext ${s.media ? 'caption' : ''}">${esc(s.text)}</div>`;
    c.innerHTML = html;

    $('.vfoot').innerHTML = mine
      ? `<div class="views">${I.eye} ${s.views ?? 0}</div>`
      : `<input placeholder="Ответить ${esc(g.user.name)}…" enterkeyhint="send"><button data-send aria-label="Отправить">${I.send}</button>`;

    const inp = $('.vfoot input');
    if (inp) {
      inp.addEventListener('focus', () => (paused = true));
      inp.addEventListener('blur', () => { paused = false; resume(); });
      const send = async () => {
        const text = inp.value.trim();
        if (!text) return;
        inp.value = '';
        inp.blur();
        try {
          await onReply?.(g.user, s, text);
          toast('Ответ отправлен');
        } catch (e) { toast(e.message); }
      };
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
      $('[data-send]').addEventListener('click', send);
    }
    $('[data-close]').addEventListener('click', close);
    $('[data-user]').addEventListener('click', () => { close(); location.hash = '#/u/' + g.user.username; });
    $('[data-del]')?.addEventListener('click', async () => {
      await api('/stories/' + s.id, { method: 'DELETE' });
      g.items.splice(ii, 1);
      toast('История удалена');
      if (!g.items.length) { groups.splice(gi, 1); if (!groups.length) return close(); if (gi >= groups.length) gi = groups.length - 1; ii = 0; }
      else if (ii >= g.items.length) ii = g.items.length - 1;
      render();
    });

    if (!s.seen && !mine) { s.seen = true; api(`/stories/${s.id}/view`, { method: 'POST' }).catch(() => {}); }
    g.allSeen = g.items.every((x) => x.seen);

    elapsedBefore = 0;
    curDuration = DURATION;
    video = c.querySelector('video');
    if (video) {
      video.onloadedmetadata = () => { if (isFinite(video.duration)) curDuration = Math.min(60000, video.duration * 1000); };
    }
    resume();
  }

  function resume() {
    startTs = performance.now();
    if (video && paused === false) video.play().catch(() => {});
    tick();
  }
  function tick() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      if (paused) { return; }
      const el2 = elapsedBefore + (performance.now() - startTs);
      const bar = root.querySelectorAll('.bars b')[ii];
      if (bar) bar.style.width = Math.min(100, (el2 / curDuration) * 100) + '%';
      if (el2 >= curDuration) next();
      else tick();
    });
  }
  function pause() {
    if (paused) return;
    paused = true;
    elapsedBefore += performance.now() - startTs;
    video?.pause();
  }
  function unpause() {
    if (!paused) return;
    paused = false;
    resume();
  }
  function next() {
    const g = groups[gi];
    if (ii < g.items.length - 1) { ii++; render(); }
    else if (gi < groups.length - 1) { gi++; ii = Math.max(0, groups[gi].items.findIndex((s) => !s.seen)); render(); }
    else close();
  }
  function prev() {
    if (ii > 0) { ii--; render(); }
    else if (gi > 0) { gi--; ii = 0; render(); }
    else render();
  }

  // тапы: короткий — листать, долгий — пауза
  for (const side of ['l', 'r']) {
    const z = $('.tap.' + side);
    let downAt = 0, sy = 0;
    z.addEventListener('pointerdown', (e) => { downAt = Date.now(); sy = e.clientY; setTimeout(() => { if (downAt) pause(); }, 200); });
    z.addEventListener('pointerup', (e) => {
      const held = Date.now() - downAt;
      downAt = 0;
      if (e.clientY - sy > 90) return close();
      if (held < 200) { side === 'l' ? prev() : next(); }
      else unpause();
    });
    z.addEventListener('pointercancel', () => { downAt = 0; unpause(); });
  }
  const onKey = (e) => {
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowRight') next();
    if (e.key === 'ArrowLeft') prev();
  };
  document.addEventListener('keydown', onKey);

  render();
}
