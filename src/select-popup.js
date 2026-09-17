export function placeSelectPopup(anchor, viewport, contentHeight) {
  const gap = 8;
  const width = Math.min(anchor.width, Math.max(0, viewport.width - gap * 2));
  const left = Math.max(viewport.left + gap, Math.min(anchor.left, viewport.left + viewport.width - gap - width));
  const above = Math.max(0, anchor.top - viewport.top - gap * 2);
  const below = Math.max(0, viewport.top + viewport.height - anchor.bottom - gap * 2);
  const desired = Math.min(contentHeight, 280, viewport.height * 0.6);
  const opensAbove = below < desired && above > below;
  const height = Math.min(desired, opensAbove ? above : below);
  const top = opensAbove ? anchor.top - gap - height : anchor.bottom + gap;
  return { left, top, width, height, placement: opensAbove ? 'above' : 'below' };
}

export function createSelectPopup() {
  const owners = new WeakMap();
  let active = null;
  let frame = 0;

  function owner(node) {
    return node?.closest('.select-ui') || owners.get(node?.closest('.select-ui-menu'));
  }

  function close({ restoreFocus = false } = {}) {
    if (!active) return;
    const { shell, button, menu, topLayer } = active;
    active = null;
    cancelAnimationFrame(frame);
    frame = 0;
    if (topLayer && menu.matches(':popover-open')) menu.hidePopover();
    menu.hidden = true;
    menu.inert = true;
    menu.classList.remove('is-floating');
    menu.removeAttribute('style');
    if (!topLayer) shell.appendChild(menu);
    shell.classList.remove('is-open');
    button.setAttribute('aria-expanded', 'false');
    if (restoreFocus && button.isConnected) button.focus({ preventScroll: true });
  }

  function position() {
    if (!active) return;
    const { button, menu } = active;
    if (!button.isConnected || !button.getClientRects().length) { close(); return; }
    const anchor = button.getBoundingClientRect();
    const viewport = { left: window.visualViewport?.offsetLeft || 0, top: window.visualViewport?.offsetTop || 0,
      width: window.visualViewport?.width || innerWidth, height: window.visualViewport?.height || innerHeight };
    // Close when the trigger scrolls out of its card, not just out of the window.
    let top = viewport.top, bottom = top + viewport.height;
    let left = viewport.left, right = left + viewport.width;
    for (let node = button.parentElement; node && node !== document.body; node = node.parentElement) {
      const style = getComputedStyle(node), rect = node.getBoundingClientRect();
      if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) { top = Math.max(top, rect.top); bottom = Math.min(bottom, rect.bottom); }
      if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) { left = Math.max(left, rect.left); right = Math.min(right, rect.right); }
    }
    if (anchor.bottom <= top || anchor.top >= bottom || anchor.right <= left || anchor.left >= right) { close(); return; }
    menu.style.width = `${Math.min(anchor.width, viewport.width - 16)}px`;
    menu.style.maxHeight = 'none';
    const layout = placeSelectPopup(anchor, viewport, menu.scrollHeight + 2);
    Object.assign(menu.style, { left: `${layout.left}px`, top: `${layout.top}px`, width: `${layout.width}px`, maxHeight: `${layout.height}px` });
    menu.dataset.placement = layout.placement;
  }

  function schedulePosition(event) {
    if (!active || (event?.target instanceof Node && active.menu.contains(event.target))) return;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => { frame = 0; position(); });
  }

  function open(shell) {
    close();
    const button = shell.querySelector('[data-select-toggle]');
    const menu = shell.querySelector('.select-ui-menu');
    if (!menu || button.disabled) return;
    menu.querySelector('[data-select-search]').value = '';
    menu.querySelectorAll('[data-select-option]').forEach((option) => { option.hidden = false; });
    const topLayer = typeof menu.showPopover === 'function';
    owners.set(menu, shell);
    active = { shell, button, menu, topLayer };
    menu.hidden = false;
    menu.inert = false;
    menu.classList.add('is-floating');
    shell.classList.add('is-open');
    button.setAttribute('aria-expanded', 'true');
    // The top layer escapes overflow and transformed drawers; older browsers use a body portal.
    if (topLayer) { menu.setAttribute('popover', 'manual'); menu.showPopover(); }
    else document.body.appendChild(menu);
    position();
  }

  function keydown(event) {
    if (!active && ['ArrowDown', 'ArrowUp'].includes(event.key)) {
      const trigger = event.target.closest('[data-select-toggle]');
      if (trigger) open(trigger.closest('.select-ui'));
    }
    if (!active) return false;
    if (event.key === 'Escape') { event.preventDefault(); close({ restoreFocus: true }); return true; }
    if (event.key === 'Tab') { close({ restoreFocus: true }); return false; }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return false;
    if (event.target.matches('[data-select-search]') && ['Home', 'End'].includes(event.key)) return false;
    const options = [...active.menu.querySelectorAll('[data-select-option]:not([hidden]):not(:disabled)')];
    if (!options.length) return false;
    const index = options.indexOf(document.activeElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1
      : event.key === 'ArrowDown' ? (index + 1) % options.length : (index < 0 ? options.length - 1 : (index - 1 + options.length) % options.length);
    event.preventDefault();
    options[next].focus({ preventScroll: true });
    options[next].scrollIntoView({ block: 'nearest' });
    return true;
  }

  document.addEventListener('scroll', schedulePosition, { capture: true, passive: true });
  window.addEventListener('resize', schedulePosition, { passive: true });
  window.visualViewport?.addEventListener('resize', schedulePosition, { passive: true });
  window.visualViewport?.addEventListener('scroll', schedulePosition, { passive: true });
  document.addEventListener('animationend', schedulePosition);
  document.addEventListener('focusin', (event) => { if (active && owner(event.target) !== active.shell) close(); });
  return { open, close, owner, position, keydown };
}
