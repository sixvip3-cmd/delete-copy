// Навигация: в обычной версии — через #hash, в демо (внутри артефакта) — стек в памяти.
const MEMORY = !!window.DELETE_DEMO;
const stack = ['#/chats'];
let handler = () => {};
let moved = false;

export function onRoute(fn) {
  handler = fn;
  if (!MEMORY) window.addEventListener('hashchange', () => { moved = true; fn(); });
}
export function here() { return MEMORY ? stack[stack.length - 1] : location.hash || '#/chats'; }
export function go(p) {
  if (MEMORY) { stack.push(p); if (stack.length > 50) stack.shift(); handler(); }
  else location.hash = p;
}
export function replace(p) {
  if (MEMORY) stack[stack.length - 1] = p;
  else location.replace(p || '#');
}
export function back(fallback = '#/chats') {
  if (MEMORY) { if (stack.length > 1) { stack.pop(); handler(); } else go(fallback); return; }
  if (moved && history.length > 1) history.back();
  else location.hash = fallback;
}
// ссылки вида <a href="#/...">
document.addEventListener('click', (e) => {
  if (!MEMORY) return;
  const a = e.target.closest?.('a[href^="#/"]');
  if (!a) return;
  e.preventDefault();
  go(a.getAttribute('href'));
});
