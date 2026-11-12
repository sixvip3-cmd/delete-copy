// Иконки в стиле SF Symbols (stroke, currentColor)
const s = (body, vb = '0 0 24 24', extra = '') =>
  `<svg viewBox="${vb}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ${extra}>${body}</svg>`;
const f = (body, vb = '0 0 24 24') => `<svg viewBox="${vb}" fill="currentColor">${body}</svg>`;

export const I = {
  home: s('<path d="M4 10.2 12 4l8 6.2V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19z"/><path d="M9 14.2c1.6 1.6 4.4 1.6 6 0"/>'),
  chats: s('<path d="M14.5 15.5h1.2l3.3 2.7v-2.9A4.5 4.5 0 0 0 21 11.5v-1A4.5 4.5 0 0 0 16.5 6"/><path d="M3 9.5A4.5 4.5 0 0 1 7.5 5h4A4.5 4.5 0 0 1 16 9.5v1a4.5 4.5 0 0 1-4.5 4.5H8.8L5 18.2v-3.5a4.5 4.5 0 0 1-2-3.7z"/>'),
  user: s('<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5c.8-3.8 3.8-6 7.5-6s6.7 2.2 7.5 6"/>'),
  plus: s('<path d="M12 4.5v15M4.5 12h15"/>', '0 0 24 24', 'stroke-width="2"'),
  search: s('<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>', '0 0 24 24', 'stroke-width="2.2"'),
  back: s('<path d="M15 5 8 12l7 7"/>', '0 0 24 24', 'stroke-width="2.4"'),
  close: s('<path d="M6 6l12 12M18 6 6 18"/>', '0 0 24 24', 'stroke-width="2.2"'),
  moreV: f('<circle cx="12" cy="5.5" r="1.9"/><circle cx="12" cy="12" r="1.9"/><circle cx="12" cy="18.5" r="1.9"/>'),
  moreH: f('<circle cx="5.5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="18.5" cy="12" r="1.7"/>'),
  bookmark: s('<path d="M7 4h10a1 1 0 0 1 1 1v15l-6-4-6 4V5a1 1 0 0 1 1-1z"/>'),
  bookmarkFill: f('<path d="M7 3.5h10A1.5 1.5 0 0 1 18.5 5v15.6a.6.6 0 0 1-.94.5L12 17.3l-5.56 3.8a.6.6 0 0 1-.94-.5V5A1.5 1.5 0 0 1 7 3.5z"/>'),
  send: f('<path d="M20.6 3.5 3.9 10.2c-.9.4-.8 1.6.1 1.9l6 1.9 1.9 6c.3.9 1.5 1 1.9.1l6.7-16.7c.3-.7-.4-1.3-1-1z"/>'),
  arrowUp: s('<path d="M12 19V5M5.5 11.5 12 5l6.5 6.5"/>', '0 0 24 24', 'stroke-width="2.6"'),
  arrowDown: s('<path d="M12 5v14M5.5 12.5 12 19l6.5-6.5"/>', '0 0 24 24', 'stroke-width="2.4"'),
  mic: s('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>', '0 0 24 24', 'stroke-width="2"'),
  play: f('<path d="M7 4.8v14.4c0 .8.9 1.3 1.6.9l11.5-7.2c.6-.4.6-1.4 0-1.8L8.6 3.9C7.9 3.5 7 4 7 4.8z"/>'),
  pause: f('<rect x="6" y="4" width="4.2" height="16" rx="1.4"/><rect x="13.8" y="4" width="4.2" height="16" rx="1.4"/>'),
  volume: s('<path d="M4 9.5h3l5-4v13l-5-4H4z"/><path d="M16 9a4.5 4.5 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/>'),
  mute: s('<path d="M4 9.5h3l5-4v13l-5-4H4z"/><path d="m16 9.5 5 5M21 9.5l-5 5"/>'),
  heart: s('<path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z"/>'),
  heartFill: f('<path d="M12 20.5s-8-4.8-8-10.8a4.6 4.6 0 0 1 8-3 4.6 4.6 0 0 1 8 3c0 6-8 10.8-8 10.8z"/>'),
  camera: s('<path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2.2l1.5-2h5.6l1.5 2h2.2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z"/><circle cx="12" cy="12.5" r="3.5"/>'),
  image: s('<rect x="3.5" y="4.5" width="17" height="15" rx="3"/><circle cx="9" cy="10" r="1.8"/><path d="m4 17 4.5-4.5 3.5 3.5 3-3 5 5"/>'),
  clip: s('<path d="m20 11.5-7.8 7.8a5 5 0 0 1-7.1-7.1l8.2-8.2a3.4 3.4 0 0 1 4.8 4.8l-8.1 8.1a1.7 1.7 0 0 1-2.4-2.4l7.4-7.4"/>'),
  trash: s('<path d="M4.5 6.5h15M9.5 6.5V4.8a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1.7M6.5 6.5l.8 12.4a1.5 1.5 0 0 0 1.5 1.4h6.4a1.5 1.5 0 0 0 1.5-1.4l.8-12.4"/>'),
  reply: s('<path d="M10 6 4 12l6 6"/><path d="M4.5 12H14a6 6 0 0 1 6 6v1"/>'),
  copy: s('<rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6.5A2.5 2.5 0 0 0 13.5 4h-7A2.5 2.5 0 0 0 4 6.5v7A2.5 2.5 0 0 0 6.5 16H8"/>'),
  edit: s('<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>'),
  check: s('<path d="m5 12.5 4.5 4.5L19 7.5"/>', '0 0 24 24', 'stroke-width="2.2"'),
  check2: s('<path d="m2.5 12.5 4.5 4.5 9-9.5M12 16.5l.5.5 9-9.5"/>', '0 0 24 24', 'stroke-width="2"'),
  eye: s('<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>'),
  logout: s('<path d="M14 4.5h3.5A1.5 1.5 0 0 1 19 6v12a1.5 1.5 0 0 1-1.5 1.5H14M10 16.5 5.5 12 10 7.5M5.5 12H15"/>'),
  settings: s('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-2.7-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.1-2.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 2.7-1.1V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7h.1a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/>'),
  story: s('<circle cx="12" cy="12" r="8.5" stroke-dasharray="3 2.2"/><path d="M12 8.5v7M8.5 12h7"/>'),
  post: s('<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M8 12h8M12 8v8"/>'),
  text: s('<path d="M5 6.5V5h14v1.5M12 5v14M9 19h6"/>'),
  lock: s('<rect x="5.5" y="10.5" width="13" height="10" rx="2.5"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>'),
  stop: f('<rect x="6" y="6" width="12" height="12" rx="3"/>'),
  user2: s('<circle cx="12" cy="8" r="3.5"/><path d="M5.5 19.5c.7-3.2 3.3-5 6.5-5s5.8 1.8 6.5 5"/>'),
};

let vbId = 0;
export function verifiedBadge(cls = 'verified') {
  const gid = 'vb' + ++vbId;
  return `<svg class="${cls}" viewBox="0 0 24 24"><defs><linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5b8cff"/><stop offset=".5" stop-color="#a45cff"/><stop offset="1" stop-color="#ff6ad5"/></linearGradient></defs><path fill="url(#${gid})" d="M7.2 2.5h3.3l-1.6 7.2 8.6-6.6h4.1L12.4 11l6.4 10.5h-4.1l-4.8-8.1-1.6 1.3-1.5 6.8H3.5z"/></svg>`;
}
