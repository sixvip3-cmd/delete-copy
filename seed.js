'use strict';
/**
 * Начальные данные: демо-аккаунты (боты отвечают на сообщения), публикации,
 * истории и переписки. Все картинки — сгенерированные SVG.
 */
const fs = require('fs');
const path = require('path');

const H = 60 * 60 * 1000;
const D = 24 * H;

/* ------------------------------------------------------------ SVG-генераторы */
function rnd(seed) {
  let s = 0;
  for (const c of seed) s = (s * 31 + c.charCodeAt(0)) >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function portrait(seed, c1, c2, skin = '#e0b48f', hair = '#2b1d14') {
  const r = rnd(seed);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
<defs><radialGradient id="g" cx="${30 + r() * 40}%" cy="25%" r="90%"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></radialGradient>
<filter id="b"><feGaussianBlur stdDeviation="6"/></filter></defs>
<rect width="200" height="200" fill="url(#g)"/>
<circle cx="${40 + r() * 120}" cy="${30 + r() * 60}" r="${30 + r() * 30}" fill="#fff" opacity=".18" filter="url(#b)"/>
<path d="M30 210c4-46 34-68 70-68s66 22 70 68z" fill="${hair}" opacity=".9"/>
<path d="M44 210c6-36 28-54 56-54s50 18 56 54z" fill="#1d2b3a"/>
<ellipse cx="100" cy="92" rx="34" ry="40" fill="${skin}"/>
<path d="M64 88c0-32 18-48 38-48s36 14 36 46c-6-14-18-24-36-24s-30 10-38 26z" fill="${hair}"/>
<rect x="88" y="124" width="24" height="22" fill="${skin}"/>
</svg>`;
}

function landscape(seed, sky1, sky2, hill1, hill2, sun = '#ffe7a8') {
  const r = rnd(seed);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">
<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky1}"/><stop offset="1" stop-color="${sky2}"/></linearGradient>
<filter id="b"><feGaussianBlur stdDeviation="10"/></filter></defs>
<rect width="400" height="400" fill="url(#s)"/>
<circle cx="${80 + r() * 240}" cy="${90 + r() * 60}" r="46" fill="${sun}" opacity=".9" filter="url(#b)"/>
<path d="M0 260 Q 100 ${190 + r() * 40} 200 250 T 400 ${220 + r() * 30} V400 H0z" fill="${hill1}"/>
<path d="M0 310 Q 120 ${260 + r() * 40} 240 310 T 400 300 V400 H0z" fill="${hill2}"/>
</svg>`;
}

function moody(seed) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1350">
<defs><radialGradient id="l" cx="38%" cy="32%" r="70%"><stop offset="0" stop-color="#6b6f6a"/><stop offset=".45" stop-color="#262a28"/><stop offset="1" stop-color="#050606"/></radialGradient>
<filter id="b"><feGaussianBlur stdDeviation="18"/></filter><filter id="n"><feTurbulence baseFrequency=".9" numOctaves="2"/><feColorMatrix values="0 0 0 0 .5 0 0 0 0 .5 0 0 0 0 .5 0 0 0 .08 0"/></filter></defs>
<rect width="1080" height="1350" fill="url(#l)"/>
${Array.from({ length: 7 }, (_, i) => `<rect x="-40" y="${170 + i * 110}" width="1160" height="16" fill="#0b0c0c" opacity=".7" transform="rotate(-4 540 ${170 + i * 110})"/>`).join('')}
<path d="M240 1350c20-260 120-420 300-440s300 150 320 440z" fill="#161a19"/>
<ellipse cx="540" cy="660" rx="150" ry="190" fill="#3d3a35" filter="url(#b)"/>
<ellipse cx="500" cy="620" rx="70" ry="110" fill="#8d877b" opacity=".45" filter="url(#b)"/>
<path d="M380 560c10-170 300-190 310-10-40-80-90-120-160-110s-110 50-150 120z" fill="#0e0f0f"/>
<path d="M300 1150c120-60 360-60 480 0" stroke="#5c5a54" stroke-width="40" fill="none" opacity=".5" filter="url(#b)"/>
<rect width="1080" height="1350" filter="url(#n)"/>
</svg>`;
}

function neon(seed) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1350">
<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1a2240"/><stop offset=".55" stop-color="#3a4c63"/><stop offset="1" stop-color="#8a8d86"/></linearGradient>
<filter id="glow"><feGaussianBlur stdDeviation="14" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<filter id="b"><feGaussianBlur stdDeviation="20"/></filter></defs>
<rect width="1080" height="1350" fill="url(#sky)"/>
<ellipse cx="300" cy="700" rx="260" ry="200" fill="#3d5a37" filter="url(#b)"/>
<ellipse cx="760" cy="640" rx="300" ry="230" fill="#4b6b3a" filter="url(#b)"/>
<path d="M0 900 L1080 860 V1350 H0z" fill="#9c9a94"/>
${Array.from({ length: 10 }, (_, i) => `<path d="M${i * 120} 1350 L${520 + i * 6} 880" stroke="#7c7a74" stroke-width="3"/>`).join('')}
<text x="150" y="330" font-family="Impact,Arial Black,sans-serif" font-size="300" fill="#ff2b3a" filter="url(#glow)" transform="rotate(-8 250 300)">2</text>
<rect x="470" y="110" width="40" height="220" fill="#fff" transform="rotate(18 490 220)"/>
<text x="640" y="350" font-family="Impact,Arial Black,sans-serif" font-size="300" fill="#2bff5a" filter="url(#glow)" transform="rotate(8 740 300)">5</text>
<g fill="#1b1b1b"><rect x="340" y="820" width="70" height="300" rx="30"/><circle cx="375" cy="790" r="38" fill="#c9a07a"/>
<rect x="520" y="830" width="80" height="300" rx="30"/><circle cx="560" cy="800" r="38" fill="#c9a07a"/>
<rect x="680" y="820" width="80" height="310" rx="30"/><circle cx="720" cy="790" r="38" fill="#c9a07a"/></g>
<rect x="335" y="840" width="80" height="140" rx="30" fill="#eee"/>
</svg>`;
}

function grass() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1350">
<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9fbf6a"/><stop offset=".5" stop-color="#3f6b2c"/><stop offset="1" stop-color="#12240f"/></linearGradient>
<filter id="b"><feGaussianBlur stdDeviation="4"/></filter></defs>
<rect width="1080" height="1350" fill="url(#g)"/>
${Array.from({ length: 160 }, (_, i) => {
    const x = (i * 97) % 1080; const h = 250 + ((i * 53) % 600); const c = ['#2d5a1e', '#4e8a2e', '#6fa83f', '#1d3d14'][i % 4];
    return `<path d="M${x} 1350 Q ${x + ((i % 7) - 3) * 18} ${1350 - h / 2} ${x + ((i % 5) - 2) * 40} ${1350 - h}" stroke="${c}" stroke-width="${6 + (i % 5)}" fill="none" filter="url(#b)"/>`;
  }).join('')}
</svg>`;
}

function sunset() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1920">
<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b1446"/><stop offset=".45" stop-color="#e2507a"/><stop offset=".7" stop-color="#ffb36b"/><stop offset="1" stop-color="#2a0f2b"/></linearGradient>
<filter id="b"><feGaussianBlur stdDeviation="30"/></filter></defs>
<rect width="1080" height="1920" fill="url(#s)"/>
<circle cx="540" cy="1150" r="220" fill="#ffe0a3" filter="url(#b)"/>
<path d="M0 1300 Q 270 1180 540 1290 T 1080 1260 V1920 H0z" fill="#3a1236"/>
<path d="M0 1450 Q 300 1360 620 1450 T 1080 1430 V1920 H0z" fill="#1d0a1f"/>
</svg>`;
}

function city() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1920">
<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#05060f"/><stop offset="1" stop-color="#232a5c"/></linearGradient>
<filter id="b"><feGaussianBlur stdDeviation="6"/></filter></defs>
<rect width="1080" height="1920" fill="url(#s)"/>
${Array.from({ length: 12 }, (_, i) => {
    const w = 70 + ((i * 37) % 60); const h = 500 + ((i * 131) % 700); const x = i * 92;
    const wins = Array.from({ length: 24 }, (_, j) => ((i + j) % 3 ? `<rect x="${x + 10 + (j % 3) * 22}" y="${1920 - h + 30 + Math.floor(j / 3) * 60}" width="12" height="20" fill="#ffd36b" opacity="${0.4 + ((i * j) % 5) / 10}"/>` : '')).join('');
    return `<rect x="${x}" y="${1920 - h}" width="${w}" height="${h}" fill="#0c0f22"/>${wins}`;
  }).join('')}
<circle cx="820" cy="300" r="70" fill="#f4f1e8" filter="url(#b)"/>
</svg>`;
}

function sea() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1350">
<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7fd0ff"/><stop offset=".5" stop-color="#d9f2ff"/><stop offset=".52" stop-color="#1b7fb8"/><stop offset="1" stop-color="#0a3552"/></linearGradient>
<filter id="b"><feGaussianBlur stdDeviation="12"/></filter></defs>
<rect width="1080" height="1350" fill="url(#s)"/>
<ellipse cx="300" cy="300" rx="180" ry="60" fill="#fff" opacity=".8" filter="url(#b)"/>
<ellipse cx="780" cy="220" rx="220" ry="70" fill="#fff" opacity=".7" filter="url(#b)"/>
${Array.from({ length: 14 }, (_, i) => `<path d="M0 ${720 + i * 45} Q 270 ${700 + i * 45} 540 ${720 + i * 45} T 1080 ${720 + i * 45}" stroke="#fff" stroke-opacity=".${2 + (i % 3)}" stroke-width="3" fill="none"/>`).join('')}
<path d="M0 1150 Q 540 1060 1080 1150 V1350 H0z" fill="#f1d7a6"/>
</svg>`;
}

/* ------------------------------------------------------------ seed */
module.exports = function seed(db, { mediaDir, hashPassword, id }) {
  const write = (name, svg) => {
    fs.writeFileSync(path.join(mediaDir, name), svg);
    return '/media/' + name;
  };
  const now = Date.now();

  const avatars = {
    delete: write('av-delete.svg', portrait('delete', '#5f7d5a', '#0f1a12', '#d7a983', '#2a1a10')),
    moderator: write('av-moderator.svg', landscape('mod', '#6aa5c9', '#cfe7ef', '#2f6e3a', '#1c4a25', '#ffffff')),
    arinka: write('av-arinka.svg', portrait('arinka', '#f3d6c8', '#9b6b5a', '#f1c7a6', '#4a2a1c')),
    xdaszx: write('av-xdaszx.svg', landscape('xd', '#a7c8e8', '#e6f0d8', '#6b9a44', '#3f6e2a')),
    lev1lem: write('av-lev1lem.svg', portrait('lev', '#e4c9a0', '#6b5034', '#e8b48c', '#1c1410')),
    max2: write('av-max2.svg', portrait('max2', '#3b5bcc', '#7a1f2b', '#b07a55', '#120c08')),
    katalin: write('av-katalin.svg', portrait('kat', '#f4c6d6', '#c97a95', '#f3cfb4', '#c49a6c')),
    maks: write('av-maks.svg', portrait('maks', '#6e7f9a', '#1b2232', '#d9a37f', '#3a2a1e')),
  };

  const mk = (username, name, avatar, extra = {}) => {
    const { salt, hash } = hashPassword(id());
    const u = { id: id(), username, name, salt, hash, avatar, color: '#3a8dff', bio: '', verified: false, bot: true, createdAt: now - 60 * D, ...extra };
    db.users.push(u);
    return u;
  };

  const del = mk('delete', 'delete', avatars.delete, { verified: true, bio: 'Официальный аккаунт delete. Общайся лично без лишнего.' });
  const mod = mk('moderator', 'Moderator', avatars.moderator, { verified: true, bio: 'Модерация и поддержка' });
  const ari = mk('arinka', 'аринка', avatars.arinka, { bio: '✨' });
  const xd = mk('xdaszx', 'xdaszx', avatars.xdaszx);
  const lev = mk('Lev1Lem', 'Lev1Lem', avatars.lev1lem);
  const max2 = mk('max2', 'max2', avatars.max2, { bio: '⚽️' });
  const kat = mk('katalin', 'Каталин', avatars.katalin, { bio: 'Самара 🌊' });
  const maks = mk('maks', 'макс', avatars.maks);

  // демо-аккаунт для быстрого входа (не бот)
  const pw = hashPassword('demo');
  const demo = {
    id: id(), username: 'demo', name: 'макс', salt: pw.salt, hash: pw.hash, avatar: avatars.maks, color: '#3a8dff',
    bio: 'Демо-аккаунт', verified: false, createdAt: now - 30 * D,
  };
  db.users.push(demo);
  for (const u of [del, ari, xd, kat, max2]) db.follows.push({ from: demo.id, to: u.id });
  for (const u of [del, ari, lev, mod]) db.follows.push({ from: u.id, to: demo.id });
  for (const u of [ari, xd, lev, max2, kat, maks, mod]) db.follows.push({ from: u.id, to: del.id });

  /* публикации */
  const img = {
    moody: write('post-moody.svg', moody('m')),
    neon: write('post-neon.svg', neon('n')),
    grass: write('post-grass.svg', grass()),
    sea: write('post-sea.svg', sea()),
  };
  const post = (u, text, media, ago, savedBy = [], likedBy = []) =>
    db.posts.push({ id: id(), userId: u.id, text, media, createdAt: now - ago, savedBy, likedBy });

  post(del, 'Добро пожаловать в delete 🖤', [{ type: 'image', url: img.grass }], 9 * D, [ari.id], [ari.id, xd.id, lev.id]);
  post(lev, '1 на 1 липсингам', [], 3 * D, [], [max2.id]);
  post(del, 'Смакуем delete', [{ type: 'image', url: img.moody }], 5 * D, [xd.id], [ari.id, kat.id]);
  post(kat, 'Люди с самары,газ знакомиться', [], 2 * D, [ari.id, max2.id], [lev.id]);
  post(ari, 'лето, вернись 🌊', [{ type: 'image', url: img.sea }], 30 * H, [], [del.id, kat.id, xd.id, lev.id]);
  post(del, 'Поцелуй', [{ type: 'image', url: img.neon }], 20 * H, [kat.id, demo.id], [ari.id, max2.id, lev.id, xd.id]);
  post(mod, 'Напоминаем: будьте вежливы друг к другу. Жалобы — в личные сообщения 🙏', [], 6 * H, [], [del.id]);

  /* истории */
  const st = {
    sunset: write('story-sunset.svg', sunset()),
    city: write('story-city.svg', city()),
  };
  const story = (u, media, text, bg, ago) =>
    db.stories.push({ id: id(), userId: u.id, media, text, bg, createdAt: now - ago, viewers: [] });
  story(ari, { type: 'image', url: st.sunset }, 'закат сегодня 🔥', null, 3 * H);
  story(ari, null, 'кто гулять вечером?', 'linear-gradient(160deg,#ff5f6d,#ffc371)', 2 * H);
  story(del, { type: 'image', url: st.city }, 'delete never sleeps', null, 5 * H);
  story(xd, { type: 'image', url: img.grass }, '', null, 7 * H);
  story(kat, null, 'Самара, я дома 🌊', 'linear-gradient(160deg,#4facfe,#00f2fe)', 1 * H);
  story(max2, { type: 'image', url: img.neon }, '2/5', null, 9 * H);
  story(lev, null, 'занят до вечера', 'linear-gradient(160deg,#7b61ff,#2b1055)', 11 * H);

  /* переписки демо-аккаунта (как на скриншотах) */
  const msg = (from, to, text, ago, extra = {}) => {
    const m = { id: id(), from: from.id, to: to.id, type: 'text', text, createdAt: now - ago, readAt: now - ago + 1000, ...extra };
    db.messages.push(m);
    return m;
  };
  const t0 = 50 * 60 * 1000;
  msg(demo, del, 'Привет как ты?', t0);
  msg(del, demo, 'Отлично, ты как?', t0 - 60e3);
  msg(demo, del, 'сойдет', t0 - 70e3);
  msg(demo, del, 'завтра в силе?', t0 - 80e3);
  const q = msg(del, demo, 'Понял, че завтра все в силе?', t0 - 90e3);
  msg(demo, del, 'да)', t0 - 120e3, { replyTo: q.id });
  msg(del, demo, 'Окей, я наберу тебе завтра', t0 - 130e3);
  const q2 = msg(demo, del, 'Хорошо возьми куртку будет дождь', t0 - 140e3);
  msg(demo, del, '🌧️', t0 - 150e3);
  msg(del, demo, 'Хорошо, до завтра', t0 - 200e3, { replyTo: q2.id });
  msg(demo, del, 'Давай 👋', t0 - 210e3);
  msg(del, demo, 'Я жду ес че)', 8 * 60e3);

  msg(xd, demo, 'привет', 20 * 60e3, { readAt: null });
  msg(xd, demo, 'ты завтра свободен?', 19 * 60e3, { readAt: null });
  msg(xd, demo, 'можно встретиться', 18 * 60e3, { readAt: null });
  msg(xd, demo, 'давай завтра', 6 * 60e3, { readAt: null });
  msg(demo, ari, 'ну что, как ты?', 14 * 60e3);
  msg(ari, demo, 'хорошо', 11 * 60e3, { readAt: null });
  msg(lev, demo, 'Привет, занят?', 10 * 60e3);
  msg(demo, mod, 'Здравствуйте, всё решилось', 11 * 60e3);
  msg(mod, demo, 'отлично спасибо за связь', 10 * 60e3);
  msg(max2, demo, '😢😢', 7 * H);
  msg(demo, demo, 'Заметка: купить билеты 🎟', 2 * D);
};
