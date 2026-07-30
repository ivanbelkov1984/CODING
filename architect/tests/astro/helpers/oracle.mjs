// Wave 3 (issue #154) — НЕЗАВИСИМЫЙ эталонный слой.
//
// Правило контракта: golden-эталон нельзя получить запуском production-кода.
// Всё в этом файле реализовано заново по опубликованным источникам, названным
// в комментарии к каждой функции. Если production и этот файл разойдутся —
// это сигнал дефекта, а не повод «подогнать» эталон.
//
// Основной источник: Jean Meeus, «Astronomical Algorithms», 2nd ed. (1998).
// Ссылки на главы даны в формате (Meeus, гл. N / формула N.M).

import { DEG, RAD, norm360 } from './core.mjs';

// ── Юлианская дата (Meeus, гл. 7) ────────────────────────────────────
// JD = floor(365.25(Y+4716)) + floor(30.6001(M+1)) + D + B − 1524.5
// B = 2 − A + floor(A/4), A = floor(Y/100)  — григорианский календарь.
export function julianDay(year, month, day /* может быть дробным */) {
  let y = year, m = month;
  if (m <= 2) { y -= 1; m += 12; }
  const A = Math.floor(y / 100);
  const B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + day + B - 1524.5;
}

// JD из ISO-даты и времени UTC.
export function julianDayFromUTC(isoDate, hh = 0, mm = 0, ss = 0) {
  const [Y, M, D] = isoDate.split('-').map(Number);
  return julianDay(Y, M, D + (hh + mm / 60 + ss / 3600) / 24);
}

// Юлианские столетия от J2000.0 (JD 2451545.0).
export const julianCenturies = jd => (jd - 2451545.0) / 36525;

// ── Средний наклон эклиптики (Meeus, формула 22.2) ───────────────────
// ε0 = 23°26'21.448" − 46.8150"T − 0.00059"T² + 0.001813"T³
export function meanObliquity(T) {
  const base = 23 + 26 / 60 + 21.448 / 3600;
  return base - (46.8150 * T + 0.00059 * T * T - 0.001813 * T * T * T) / 3600;
}
// Значение на эпоху J2000.0 (T=0) — именно его production «зашивает» константой.
export const OBLIQUITY_J2000 = meanObliquity(0);   // 23.439291111...°

// ── Эклиптика → экватор (Meeus, формулы 13.3 и 13.4) ─────────────────
// Для точки НА эклиптике (широта β = 0) формулы вырождаются в:
//   α = atan2(sin λ · cos ε, cos λ)
//   δ = asin(sin ε · sin λ)
export function eclipticToEquatorial(lambdaDeg, epsDeg, betaDeg = 0) {
  const l = lambdaDeg * DEG, e = epsDeg * DEG, b = betaDeg * DEG;
  const ra = Math.atan2(Math.sin(l) * Math.cos(e) - Math.tan(b) * Math.sin(e), Math.cos(l));
  const dec = Math.asin(Math.sin(b) * Math.cos(e) + Math.cos(b) * Math.sin(e) * Math.sin(l));
  return { ra: norm360(ra * RAD), dec: dec * RAD };
}

// ── Высота над горизонтом (Meeus, формула 13.6) ──────────────────────
// sin h = sin φ · sin δ + cos φ · cos δ · cos H,  H = LST − α
export function altitude(raDeg, decDeg, lstDeg, latDeg) {
  const H = (lstDeg - raDeg) * DEG, d = decDeg * DEG, phi = latDeg * DEG;
  return Math.asin(Math.sin(phi) * Math.sin(d) + Math.cos(phi) * Math.cos(d) * Math.cos(H)) * RAD;
}

// Часовой угол, нормализованный в (−180, 180]. H < 0 ⇒ объект ВОСТОЧНЕЕ
// меридиана (ещё поднимается); H > 0 ⇒ западнее (уже опускается).
export function hourAngle(raDeg, lstDeg) {
  const H = norm360(lstDeg - raDeg);
  return H > 180 ? H - 360 : H;
}

// ── Дома: системы с тривиальным определением ─────────────────────────
// Whole-sign: куспид 1 — 0° знака, в котором стоит Asc; далее по 30°.
export function wholeSignCusps(ascDeg) {
  const start = Math.floor(norm360(ascDeg) / 30) * 30;
  return Array.from({ length: 12 }, (_, k) => norm360(start + k * 30));
}
// Equal: куспид 1 — сам Asc; далее по 30°.
export function equalCusps(ascDeg) {
  return Array.from({ length: 12 }, (_, k) => norm360(ascDeg + k * 30));
}

// ── Жребий Фортуны (классическое определение) ────────────────────────
// День:  Asc + Луна − Солнце;  ночь:  Asc + Солнце − Луна.
export function partOfFortune(ascDeg, sunDeg, moonDeg, isDay) {
  return isDay ? norm360(ascDeg + moonDeg - sunDeg) : norm360(ascDeg + sunDeg - moonDeg);
}

// ── Гармоника n (определение гармонической карты) ────────────────────
export const harmonic = (lonDeg, n) => norm360(lonDeg * n);

// ── Линейная аянамша ─────────────────────────────────────────────────
// Модель production: значение на J2000 плюс постоянная прецессия.
// Здесь она пересчитана независимо, чтобы поймать дрейф коэффициента.
export const PRECESSION_ARCSEC_PER_YEAR = 50.2888;
export function ayanamshaLinear(valueAtJ2000, daysFromJ2000) {
  return valueAtJ2000 + (PRECESSION_ARCSEC_PER_YEAR / 3600) * (daysFromJ2000 / 365.25);
}

// ── Опубликованные астрономические константы ─────────────────────────
// Средний синодический месяц (Meeus, гл. 49): 29.530588861 сут.
export const MEAN_SYNODIC_MONTH = 29.530588861;
// Средний тропический год (Meeus, гл. 27): 365.242190 сут.
export const MEAN_TROPICAL_YEAR = 365.242190;

// ── Видимая долгота Солнца (Meeus, гл. 25, «low accuracy» ~0.01°) ────
// L0 = 280.46646 + 36000.76983T + 0.0003032T²
// M  = 357.52911 + 35999.05029T − 0.0001537T²
// C  = (1.914602 − 0.004817T − 0.000014T²)sinM + (0.019993 − 0.000101T)sin2M + 0.000289 sin3M
// λ_apparent = L0 + C − 0.00569 − 0.00478 sin Ω,  Ω = 125.04 − 1934.136T
export function solarApparentLongitude(T) {
  const L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T;
  const M = (357.52911 + 35999.05029 * T - 0.0001537 * T * T) * DEG;
  const C = (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(M)
          + (0.019993 - 0.000101 * T) * Math.sin(2 * M)
          + 0.000289 * Math.sin(3 * M);
  const omega = (125.04 - 1934.136 * T) * DEG;
  return norm360(L0 + C - 0.00569 - 0.00478 * Math.sin(omega));
}

// ── Полудиурнальная дуга точки эклиптики (сферическая астрономия) ────
// SDA = 90° + AD, sin(AD) = tan φ · tan δ. |AD| ограничен (циркумполярность).
export function semiDiurnalArc(decDeg, latDeg) {
  const x = Math.tan(latDeg * DEG) * Math.tan(decDeg * DEG);
  if (Math.abs(x) > 1) return null;          // точка не восходит/не заходит
  return 90 + Math.asin(x) * RAD;
}

// ── Асцендент независимым поиском корня ──────────────────────────────
// Определение: точка эклиптики с нулевой высотой, находящаяся в ВОСХОДЯЩЕЙ
// полусфере (часовой угол < 0). Никакой замкнутой формулы production здесь
// не воспроизводится — только определение + бисекция.
export function ascendantByRootFinding(lstDeg, epsDeg, latDeg) {
  const altOf = lam => {
    const { ra, dec } = eclipticToEquatorial(lam, epsDeg);
    return { alt: altitude(ra, dec, lstDeg, latDeg), H: hourAngle(ra, lstDeg) };
  };
  // Эклиптика пересекает горизонт ровно дважды: Asc (восточная полусфера,
  // часовой угол < 0) и Desc (западная, > 0). Направление изменения высоты
  // ПО λ признаком не является — критерий именно знак часового угла.
  let prev = altOf(0);
  for (let i = 1; i <= 3600; i++) {
    const lam = i * 0.1;
    const cur = altOf(lam);
    const crosses = (prev.alt < 0 && cur.alt >= 0) || (prev.alt >= 0 && cur.alt < 0);
    if (crosses && cur.H < 0) {
      let lo = lam - 0.1, hi = lam;
      const sign0 = Math.sign(altOf(lo).alt) || 1;
      for (let k = 0; k < 60; k++) {
        const mid = (lo + hi) / 2;
        (Math.sign(altOf(mid).alt) === sign0) ? lo = mid : hi = mid;
      }
      return norm360((lo + hi) / 2);
    }
    prev = cur;
  }
  return null;
}

// ── Параметр «позиционного круга» для квадрантных систем ─────────────
// И Campanus, и Regiomontanus строят куспиды на больших кругах, проходящих
// через точки СЕВЕРА и ЮГА горизонта. Такие круги образуют пучок вокруг оси
// N–S, поэтому каждый однозначно задаётся одним параметром. Нормаль любого
// такого круга лежит в плоскости первого вертикала (E–зенит).
// Для точки P (в горизонтальной системе) параметр ψ = atan2(−P_E, P_Z):
//   ψ = 0°  — плоскость меридиана (содержит MC);
//   ψ = 90° — плоскость горизонта (содержит Asc).
// Campanus делит на равные 30° именно ψ (первый вертикал).
export function positionCircleAngle(lambdaDeg, epsDeg, lstDeg, latDeg) {
  const { ra, dec } = eclipticToEquatorial(lambdaDeg, epsDeg);
  const H = (lstDeg - ra) * DEG, d = dec * DEG, phi = latDeg * DEG;
  // Горизонтальные орты: Z (зенит), E (восток), N (север по горизонту).
  const pZ = Math.sin(phi) * Math.sin(d) + Math.cos(phi) * Math.cos(d) * Math.cos(H);
  const pE = -Math.cos(d) * Math.sin(H);
  return norm360(Math.atan2(-pE, pZ) * RAD);
}

// Часовой угол пересечения позиционного круга точки с ЭКВАТОРОМ —
// параметр деления для Regiomontanus (он делит на равные 30° именно экватор).
//
// Вывод: плоскость позиционного круга содержит ось N–S горизонта, поэтому её
// нормаль не имеет N-компоненты: n = a·E + b·Z. Из n·P = 0 следует
// (a, b) ∝ (p_Z, −p_E). Точка экватора (δ = 0) с часовым углом H₀ имеет
// p_Z = cos φ · cos H₀ и p_E = −sin H₀. Подставляя в n·P = 0:
//   −p_Z·sin H₀ − p_E·cos φ·cos H₀ = 0  ⇒  tan H₀ = −p_E · cos φ / p_Z.
export function positionCircleEquatorHA(lambdaDeg, epsDeg, lstDeg, latDeg) {
  const { ra, dec } = eclipticToEquatorial(lambdaDeg, epsDeg);
  const H = (lstDeg - ra) * DEG, d = dec * DEG, phi = latDeg * DEG;
  const pZ = Math.sin(phi) * Math.sin(d) + Math.cos(phi) * Math.cos(d) * Math.cos(H);
  const pE = -Math.cos(d) * Math.sin(H);
  return Math.atan2(-pE * Math.cos(phi), pZ) * RAD;
}
