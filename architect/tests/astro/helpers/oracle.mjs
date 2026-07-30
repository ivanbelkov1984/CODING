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
