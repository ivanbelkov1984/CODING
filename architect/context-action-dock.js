'use strict';

// Context action dock — issue #138.
// The central FAB remains the global «Записать» action. This dock only exposes
// existing actions belonging to the currently visible section/subsection.
(() => {
  const ACTIONS = {
    'map:insights': [
      { id: 'insight', label: 'Новый инсайт', icon: 'plus', primary: true, run: () => openOv('ov-add') },
    ],
    'map:dreams': [
      { id: 'dream', label: 'Записать сон', icon: 'moon', primary: true, run: () => openOv('ov-drm') },
    ],
    'map:patterns': [
      { id: 'pattern', label: 'Новый паттерн', icon: 'git-branch', primary: true, run: () => openOv('ov-pat-add') },
    ],
    'map:spiritual': [
      { id: 'spiritual', label: 'Новая запись', icon: 'sparkles', primary: true, run: () => openOv('ov-spi-add') },
    ],
    'map:evolution': [
      { id: 'evolution', label: 'Новая запись', icon: 'trending-up', primary: true, run: () => openOv('ov-evo-add') },
    ],
    vit: [
      { id: 'sphere-log', label: 'Отметить сферу', icon: 'check-circle-2', primary: true, run: () => captureSphere() },
      { id: 'sphere-new', label: 'Новая сфера', icon: 'plus', run: () => openSphereEdit() },
    ],
    health: [
      { id: 'symptom', label: 'Симптом', icon: 'heart-pulse', primary: true, run: () => openOv('ov-symptom') },
      { id: 'measure', label: 'Измерение', icon: 'activity', run: () => openOv('ov-measure') },
      { id: 'craving', label: 'Тяга', icon: 'flame', run: () => openOv('ov-craving') },
    ],
    sys: [
      { id: 'digest', label: 'Обзор недели', icon: 'refresh-cw', primary: true, run: () => mkDig() },
      { id: 'doctor', label: 'Отчёт врачу', icon: 'file-text', run: () => openDoctorReport() },
    ],
    'astro:natal': [
      { id: 'wheel', label: 'Колесо карты', icon: 'maximize-2', primary: true, run: () => openFullWheel() },
    ],
  };

  let dock = null;
  let frame = 0;
  let renderedSignature = '';

  const escapeHtml = value => String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

  function ensureDock() {
    dock = document.getElementById('nsh-context-dock');
    if (dock) return dock;
    const tabbar = document.getElementById('nsh-tabbar');
    if (!tabbar) return null;
    dock = document.createElement('div');
    dock.id = 'nsh-context-dock';
    dock.className = 'nsh-context-dock';
    dock.setAttribute('role', 'toolbar');
    dock.setAttribute('aria-label', 'Действия текущего раздела');
    dock.hidden = true;
    tabbar.before(dock);
    dock.addEventListener('click', event => {
      const button = event.target.closest('button[data-action]');
      if (!button || !dock.contains(button)) return;
      const action = currentActions().find(item => item.id === button.dataset.action);
      if (action && typeof action.run === 'function') {
        action.run();
        // Hide immediately when an action opens a sheet, but preserve the
        // clicked button until the browser has completed dispatching the click.
        update();
      }
    });
    return dock;
  }

  function currentKey() {
    const page = document.querySelector('.pg.on');
    if (!page) return '';
    const tab = page.id.replace('pg-', '');
    if (tab === 'map') {
      const sub = [...document.querySelectorAll('#pg-map [id^="ms-"]')]
        .find(element => getComputedStyle(element).display !== 'none');
      return `map:${sub ? sub.id.slice(3) : 'insights'}`;
    }
    if (tab === 'astro') {
      const sub = [...document.querySelectorAll('#pg-astro .asub')]
        .find(element => getComputedStyle(element).display !== 'none');
      return `astro:${sub ? sub.id.replace('as-', '') : 'menu'}`;
    }
    return tab;
  }

  function currentActions() {
    return ACTIONS[currentKey()] || [];
  }

  function update() {
    const element = ensureDock();
    if (!element) return;
    const phone = Boolean(window.matchMedia && window.matchMedia('(max-width: 767px)').matches);
    const shellOn = document.body.classList.contains('navshell');
    const overlayOpen = Boolean(document.querySelector('.ov.on'));
    const key = currentKey();
    const actions = shellOn && phone && !overlayOpen ? (ACTIONS[key] || []) : [];

    document.body.classList.toggle('nsh-context-on', actions.length > 0);
    element.hidden = actions.length === 0;

    // When hiding, keep the current children in the DOM so a click/focus event
    // can finish cleanly. They are inaccessible while the toolbar is hidden.
    if (!actions.length) {
      renderedSignature = 'hidden';
      return;
    }

    const signature = `${key}:${actions.map(action => action.id).join(',')}`;
    // goTo/msub/asub can emit several DOM mutations for one navigation action.
    // Do not detach and recreate already-correct buttons on every mutation.
    if (signature === renderedSignature) return;
    renderedSignature = signature;
    element.replaceChildren();

    for (const action of actions) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `nsh-context-action${action.primary ? ' primary' : ''}`;
      button.dataset.action = action.id;
      button.setAttribute('aria-label', action.label);
      button.innerHTML = `<i data-lucide="${escapeHtml(action.icon)}"></i><span>${escapeHtml(action.label)}</span>`;
      element.appendChild(button);
    }
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      try { window.lucide.createIcons({ nodes: [element] }); } catch (_) {}
    }
  }

  function schedule() {
    if (frame) cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      frame = 0;
      update();
    });
  }

  function init() {
    if (!ensureDock()) return;
    const observer = new MutationObserver(schedule);
    // Observe only state-bearing application nodes. Never observe the dock's
    // descendants: Lucide replaces icon nodes and that must not trigger render.
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    document.querySelectorAll('.pg, .ov, #pg-map [id^="ms-"], #pg-astro .asub').forEach(element => {
      observer.observe(element, { attributes: true, attributeFilter: ['class', 'style'] });
    });
    window.addEventListener('hashchange', schedule);
    window.addEventListener('resize', schedule);
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') schedule();
    });
    update();
  }

  window.__ARCH_CONTEXT_DOCK__ = {
    update,
    currentKey,
    currentActions: () => currentActions().map(({ id, label, primary }) => ({ id, label, primary: Boolean(primary) })),
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
