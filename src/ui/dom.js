// Tiny DOM builder. Text is ALWAYS set with textContent / text nodes - never innerHTML -
// so questionnaire answers and any other user-supplied text can never inject markup.

export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

/** Wait for the next paint (used to focus freshly-inserted elements). */
export const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

export function focusables(root) {
  return [...root.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
    .filter((el) => el.offsetParent !== null || el === document.activeElement);
}

/** Roving arrow-key navigation for a vertical list of buttons (menus). */
export function arrowNav(container, { horizontal = false } = {}) {
  container.addEventListener('keydown', (e) => {
    const keys = horizontal ? ['ArrowLeft', 'ArrowRight'] : ['ArrowUp', 'ArrowDown'];
    if (!keys.includes(e.key)) return;
    const items = focusables(container);
    const i = items.indexOf(document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    const d = e.key === keys[0] ? -1 : 1;
    items[(i + d + items.length) % items.length].focus();
  });
}

export function canvasFromAtlasFrame(atlas, frameName, w, h, crop = null) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const f = atlas?.getFrame(frameName);
  if (f) {
    if (crop) ctx.drawImage(f, crop.x, crop.y, crop.w, crop.h, 0, 0, w, h);
    else ctx.drawImage(f, 0, 0, w, h);
  }
  return c;
}
