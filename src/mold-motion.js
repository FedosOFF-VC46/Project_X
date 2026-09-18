import { cuboidPoints } from './mold-math.js?v=mold-flow-1';

export function createMoldMotion(root) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const running = new Set();
  const channels = new WeakMap();
  let frame = 0, current = null, latest = [0, 0, 0], active = '';
  const svg = root.querySelector('[data-mw-cube]');
  function animate(node, frames, duration = 340, channel = 'reveal') {
    if (!node || reduced.matches) return;
    const map = channels.get(node) || new Map();
    map.get(channel)?.cancel();
    const animation = node.animate(frames, { duration, easing: 'cubic-bezier(.22,1,.36,1)' });
    map.set(channel, animation); channels.set(node, map); running.add(animation);
    const clean = () => running.delete(animation);
    animation.finished.then(clean, clean);
  }
  const reveal = (node) => animate(node, [{ opacity: .2, transform: 'translateY(10px)' }, { opacity: 1, transform: 'translateY(0)' }]);
  function layout(update, incoming) {
    const nodes = [...root.querySelectorAll('[data-mw-anchor]')].filter((n) => n.getClientRects().length);
    const before = new Map(nodes.map((n) => [n, n.getBoundingClientRect().top]));
    update();
    for (const node of nodes) {
      if (!node.isConnected || !node.getClientRects().length) continue;
      const offset = before.get(node) - node.getBoundingClientRect().top;
      if (Math.abs(offset) > 1) animate(node, [{ transform: `translateY(${offset}px)` }, { transform: 'translateY(0)' }], 420, 'layout');
    }
    reveal(typeof incoming === 'function' ? incoming() : incoming);
  }
  function paint(points) {
    if (!svg) return;
    const path = (ids) => ids.map((i, j) => `${j ? 'L' : 'M'}${points[i].join(',')}`).join(' ');
    for (const [face, ids] of Object.entries({ front: [3, 2, 6, 7], side: [1, 2, 6, 5], top: [4, 5, 6, 7] })) {
      svg.querySelector(`[data-face="${face}"]`).setAttribute('d', path(ids) + 'Z');
    }
    svg.querySelector('[data-hidden-edge]').setAttribute('d', path([1, 0, 3]) + ' ' + path([0, 4]));
    const axis = { length: [7, 6], width: [5, 6], height: [2, 6] }[active];
    svg.querySelector('[data-axis]').setAttribute('d', axis ? path(axis) : '');
  }
  function cube(dimensions = latest, focus = active, immediate = false) {
    latest = dimensions; active = focus;
    if (!svg || !svg.getClientRects().length) return;
    const { width, height } = svg.getBoundingClientRect();
    if (!width || !height) return;
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    const target = cuboidPoints(dimensions, width, height), start = current || target;
    cancelAnimationFrame(frame);
    if (reduced.matches || immediate) { current = target; paint(target); return; }
    const began = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - began) / 440), ease = 1 - (1 - t) ** 3;
      current = target.map((point, i) => point.map((value, j) => start[i][j] + (value - start[i][j]) * ease));
      paint(current);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
  }
  const resize = new ResizeObserver(() => cube(latest, active, true));
  if (svg) resize.observe(svg);
  const reduce = () => { if (reduced.matches) { running.forEach((animation) => animation.cancel()); cube(latest, active, true); } };
  reduced.addEventListener('change', reduce);
  return { reveal, layout, cube,
    press: (node) => animate(node, [{ transform: 'scale(.975)' }, { transform: 'scale(1)' }], 230, 'press'),
    value: (node, value) => { if (node && node.textContent !== value) { node.textContent = value; animate(node, [{ opacity: .5 }, { opacity: 1 }], 200, 'value'); } },
    destroy: () => { cancelAnimationFrame(frame); resize.disconnect(); running.forEach((a) => a.cancel()); reduced.removeEventListener('change', reduce); },
  };
}
