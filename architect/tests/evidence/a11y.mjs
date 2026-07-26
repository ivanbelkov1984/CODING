// ═══════════════════════════════════════════════════════════════
//  Архитектор — accessibility smoke (не блокирующий аудит).
//
//  Прогоняется в браузере по ТЕКУЩЕМУ отрисованному экрану и собирает
//  дефекты пяти классов:
//    1. icon-name   — тапаемый элемент без доступного имени (aria-label/
//                     title/текст) — screen reader прочитает «кнопка».
//    2. tap-size    — интерактивный элемент меньше 44×44 px.
//    3. focusable   — клик по div/span без роли/tabindex — недостижим
//                     с клавиатуры (keyboard/focus).
//    4. affordance  — onclick на текстовом элементе без cursor:pointer —
//                     тапаемость не видна.
//    5. contrast    — контраст текста к фону ниже порога WCAG AA
//                     (4.5:1 для обычного, 3:1 для крупного).
//
//  Это smoke, а не полный аудит: контраст оценивается по вычисленным
//  цветам (без учёта картинок/градиентов), поэтому пороги мягкие и
//  результат трактуется как «зона внимания», а не как строгий вердикт.
//  Ничего не чинит — только фиксирует.
// ═══════════════════════════════════════════════════════════════

// Функция сериализуется и исполняется в странице. Полностью самодостаточна.
function auditInPage(ctx) {
  const CAP = 40; // максимум находок на класс — против шумного отчёта
  const out = { 'icon-name': [], 'tap-size': [], focusable: [], affordance: [], contrast: [] };

  const isVisible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || parseFloat(s.opacity) === 0) return false;
    return true;
  };
  const label = (el) => {
    let p = el;
    let depth = 0;
    while (p && depth < 30) { if (p.classList && p.classList.contains('ov')) return p.id || 'overlay'; p = p.parentElement; depth++; }
    return 'screen';
  };
  const sig = (el) => {
    const id = el.id ? '#' + el.id : '';
    const cls = (el.className && typeof el.className === 'string') ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
    return (el.tagName.toLowerCase() + id + cls).slice(0, 80);
  };
  const accName = (el) => (
    (el.getAttribute('aria-label') || '').trim() ||
    (el.getAttribute('title') || '').trim() ||
    (el.textContent || '').trim() ||
    (el.querySelector('img[alt]') ? el.querySelector('img[alt]').getAttribute('alt').trim() : '')
  );

  // Кандидаты на «тапаемость».
  const interactive = Array.from(document.querySelectorAll(
    'button, a[href], [onclick], [role="button"], input, select, textarea, .navlink, .snpill, .qa, .card[onclick]'
  )).filter(isVisible);

  const seen = new Set();
  for (const el of interactive) {
    const s = sig(el);

    // 1. Доступное имя для управляющих элементов без видимого текста.
    const tag = el.tagName.toLowerCase();
    const isControl = tag === 'button' || tag === 'a' || el.getAttribute('role') === 'button' || el.hasAttribute('onclick');
    if (isControl) {
      const name = accName(el);
      const hasText = name.replace(/[\s\u200B]/g, '').length > 0;
      if (!hasText && out['icon-name'].length < CAP) {
        out['icon-name'].push({ where: label(el), el: s, detail: 'нет aria-label/title/текста' });
      }
    }

    // 2. Размер тап-цели.
    const r = el.getBoundingClientRect();
    if ((r.width < 44 || r.height < 44) && tag !== 'a' /* инлайн-ссылки допустимы */) {
      if (out['tap-size'].length < CAP) {
        out['tap-size'].push({ where: label(el), el: s, detail: `${Math.round(r.width)}×${Math.round(r.height)} px` });
      }
    }

    // 3. Достижимость с клавиатуры: div/span с onclick без роли/tabindex.
    if ((tag === 'div' || tag === 'span' || tag === 'li') && el.hasAttribute('onclick')) {
      const focusable = el.hasAttribute('tabindex') || el.getAttribute('role') === 'button';
      if (!focusable && out.focusable.length < CAP) {
        out.focusable.push({ where: label(el), el: s, detail: 'onclick без tabindex/role=button' });
      }
      // 4. Видимая тапаемость.
      const cur = getComputedStyle(el).cursor;
      if (cur !== 'pointer' && out.affordance.length < CAP) {
        out.affordance.push({ where: label(el), el: s, detail: `cursor: ${cur}` });
      }
    }
    seen.add(s);
  }

  // 5. Контраст текста. Берём видимые текстовые узлы (эвристика).
  const parseRGB = (str) => {
    const m = str && str.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(',').map(x => parseFloat(x.trim()));
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const lum = ({ r, g, b }) => {
    const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const bgOf = (el) => {
    let p = el;
    let depth = 0;
    while (p && depth < 40) {
      const c = parseRGB(getComputedStyle(p).backgroundColor);
      if (c && c.a > 0.5) return c;
      p = p.parentElement; depth++;
    }
    return { r: 20, g: 22, b: 28, a: 1 }; // фон приложения по умолчанию (тёмный)
  };
  const ratio = (l1, l2) => (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);

  const textEls = Array.from(document.querySelectorAll(
    'p, span, div, a, li, h1, h2, h3, h4, label, button, td, small, strong, em'
  )).filter((el) => {
    if (!isVisible(el)) return false;
    // Только узлы с собственным непустым текстом (без вложенных блоков).
    const direct = Array.from(el.childNodes).some(n => n.nodeType === 3 && n.textContent.trim().length > 1);
    return direct;
  });

  const contrastSeen = new Set();
  for (const el of textEls) {
    const st = getComputedStyle(el);
    const fg = parseRGB(st.color);
    if (!fg || fg.a < 0.5) continue;
    const bg = bgOf(el);
    const cr = ratio(lum(fg), lum(bg));
    const size = parseFloat(st.fontSize) || 16;
    const bold = (parseInt(st.fontWeight, 10) || 400) >= 700;
    const large = size >= 24 || (size >= 18.66 && bold);
    const threshold = large ? 3.0 : 4.5;
    if (cr < threshold) {
      const s = sig(el);
      if (contrastSeen.has(s)) continue;
      contrastSeen.add(s);
      if (out.contrast.length < CAP) {
        out.contrast.push({
          where: label(el), el: s,
          detail: `${cr.toFixed(2)}:1 (нужно ${threshold}:1, ${Math.round(size)}px${bold ? ' bold' : ''})`,
        });
      }
    }
  }

  const counts = Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.length]));
  return { context: ctx || 'screen', counts, findings: out };
}

export async function runA11y(page, context) {
  return page.evaluate(auditInPage, context);
}
