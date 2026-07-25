// ═══════════════════════════════════════════════════════════════
//  Астро-интерпретации: серверный запуск OpenAI Batch API.
//  OPENAI_API_KEY живёт ТОЛЬКО в env Railway — клиенту не отдаётся.
//  Защита от злоупотребления: фиксированное содержимое батча (реестр
//  зашит в код), не чаще одного запуска в 24 часа, статус текущего
//  батча хранится в PostgreSQL.
//  Реестр зеркалит architect/tools/astro_texts_batch.py (1861 позиция).
// ═══════════════════════════════════════════════════════════════

const MODEL = process.env.OPENAI_MODEL || 'gpt-5.4';
// Если запрошенная модель недоступна аккаунту — берём первую доступную из списка.
const MODEL_FALLBACKS = ['gpt-5.4', 'gpt-5.2', 'gpt-5.1', 'gpt-5', 'gpt-4.1', 'gpt-4o'];
const API = 'https://api.openai.com/v1';

const PLANETS = [['Sun','Солнце'],['Moon','Луна'],['Mercury','Меркурий'],['Venus','Венера'],['Mars','Марс'],['Jupiter','Юпитер'],['Saturn','Сатурн'],['Uranus','Уран'],['Neptune','Нептун'],['Pluto','Плутон']];
const SIGNS = ['Овен','Телец','Близнецы','Рак','Лев','Дева','Весы','Скорпион','Стрелец','Козерог','Водолей','Рыбы'];
const ASPECTS = ['соединение','трин','секстиль','квадрат','оппозиция'];
const POINTS = [['Chiron','Хирон'],['Ceres','Церера'],['Pallas','Паллада'],['Juno','Юнона'],['Vesta','Веста'],['Lilith','Лилит (средний апогей Луны)'],['Fortune','Точка Судьбы (Парс Фортуны)'],['Vertex','Вертекс']];
const GRAHAS = [['Surya','Сурья (Солнце)'],['Chandra','Чандра (Луна)'],['Mangala','Мангала (Марс)'],['Budha','Будха (Меркурий)'],['Guru','Гуру (Юпитер)'],['Shukra','Шукра (Венера)'],['Shani','Шани (Сатурн)'],['Rahu','Раху'],['Ketu','Кету']];
const RASHI = ['Меша (Овен)','Вришабха (Телец)','Митхуна (Близнецы)','Карка (Рак)','Симха (Лев)','Канья (Дева)','Тула (Весы)','Вришчика (Скорпион)','Дхану (Стрелец)','Макара (Козерог)','Кумбха (Водолей)','Мина (Рыбы)'];
const NAKSHATRAS = ['Ашвини','Бхарани','Криттика','Рохини','Мригашира','Ардра','Пунарвасу','Пушья','Ашлеша','Магха','Пурва-Пхалгуни','Уттара-Пхалгуни','Хаста','Читра','Свати','Вишакха','Анурадха','Джйештха','Мула','Пурва-Ашадха','Уттара-Ашадха','Шравана','Дхаништха','Шатабхиша','Пурва-Бхадрапада','Уттара-Бхадрапада','Ревати'];
const DASHA_LORDS = ['Кету','Венера','Солнце','Луна','Марс','Раху','Юпитер','Сатурн','Меркурий'];
const HOUSES_RU = ['1-й дом (личность, начало)','2-й дом (ресурсы, самоценность)','3-й дом (общение, учёба)','4-й дом (дом, корни)','5-й дом (творчество, радость)','6-й дом (уклад, мастерство)','7-й дом (партнёрство)','8-й дом (глубокие перемены)','9-й дом (смысл, горизонты)','10-й дом (призвание)','11-й дом (друзья, будущее)','12-й дом (внутренний мир)'];

// ── ШАГ 0: таблица истинности (зеркало tools/astro_ground_truth.json) ──
// Только проверяемые факты классики; GPT их ТОЛЬКО оформляет литературно.
const GT_SIGNS = {
  'Овен':     { ruler: ['Марс'],             element: 'огонь',  quality: 'кардинальный',  kw: 'инициатива, смелость, прямота, импульс' },
  'Телец':    { ruler: ['Венера'],           element: 'земля',  quality: 'фиксированный', kw: 'устойчивость, терпение, чувственность, практичность' },
  'Близнецы': { ruler: ['Меркурий'],         element: 'воздух', quality: 'мутабельный',   kw: 'любопытство, общение, гибкость, обмен идеями' },
  'Рак':      { ruler: ['Луна'],             element: 'вода',   quality: 'кардинальный',  kw: 'забота, чувствительность, дом, память' },
  'Лев':      { ruler: ['Солнце'],           element: 'огонь',  quality: 'фиксированный', kw: 'творчество, достоинство, щедрость, самовыражение' },
  'Дева':     { ruler: ['Меркурий'],         element: 'земля',  quality: 'мутабельный',   kw: 'точность, анализ, служение, польза' },
  'Весы':     { ruler: ['Венера'],           element: 'воздух', quality: 'кардинальный',  kw: 'гармония, партнёрство, справедливость, вкус' },
  'Скорпион': { ruler: ['Плутон', 'Марс'],   element: 'вода',   quality: 'фиксированный', kw: 'глубина, интенсивность, трансформация, воля' },
  'Стрелец':  { ruler: ['Юпитер'],           element: 'огонь',  quality: 'мутабельный',   kw: 'смысл, свобода, оптимизм, дальние горизонты' },
  'Козерог':  { ruler: ['Сатурн'],           element: 'земля',  quality: 'кардинальный',  kw: 'цель, дисциплина, ответственность, структура' },
  'Водолей':  { ruler: ['Уран', 'Сатурн'],   element: 'воздух', quality: 'фиксированный', kw: 'независимость, новизна, дружба, будущее' },
  'Рыбы':     { ruler: ['Нептун', 'Юпитер'], element: 'вода',   quality: 'мутабельный',   kw: 'сочувствие, воображение, интуиция, растворение границ' },
};
const GT_PLANETS = {
  'Солнце': 'ядро личности и жизненная сила (воля, самовыражение, идентичность)',
  'Луна': 'эмоциональная природа и потребности (чувства, безопасность, привычки, отклик)',
  'Меркурий': 'мышление и обмен информацией (ум, речь, обучение, связи)',
  'Венера': 'любовь и чувство ценного (привязанность, красота, ценности, притяжение)',
  'Марс': 'энергия действия и напор (действие, желание, решимость, защита своего)',
  'Юпитер': 'рост и расширение возможностей (вера, оптимизм, смысл)',
  'Сатурн': 'структура, границы и зрелость (дисциплина, ответственность, опыт)',
  'Уран': 'свобода и внезапное обновление (независимость, новаторство, своеобразие)',
  'Нептун': 'воображение и тонкая чувствительность (мечты, идеалы, сострадание)',
  'Плутон': 'глубинная трансформация (глубина, перерождение, внутренняя сила)',
};
const GT_ASPECTS = {
  'соединение': 'природа: нейтральное слияние — энергии действуют как одна, усиливая друг друга',
  'трин': 'природа: гармония-поток — лёгкое естественное взаимодействие без усилий',
  'секстиль': 'природа: гармония-возможность — мягкая поддержка, раскрывающаяся при небольшом усилии',
  'квадрат': 'природа: напряжение-действие — трение, которое побуждает решать и расти',
  'оппозиция': 'природа: напряжение-баланс — противостояние полюсов, требующее равновесия',
};
const GT_HOUSES = ['личность, внешнее «я», начало', 'ресурсы, самоценность, владение', 'общение, учёба, ближний круг',
  'дом, семья, корни', 'творчество, радость, самовыражение', 'повседневный уклад, работа, мастерство',
  'партнёрство, союзы', 'глубокие перемены, совместные ресурсы', 'смысл, убеждения, дальние горизонты',
  'призвание, репутация, вершина', 'друзья, единомышленники, будущее', 'внутренний мир, уединение, незримое'];
const GT_POINTS = {
  Chiron: 'чувствительное место и путь бережного исцеления', Ceres: 'забота, питание, взращивание',
  Pallas: 'стратегия, распознавание закономерностей, мудрое решение', Juno: 'устойчивый союз, верность, договорённости в паре',
  Vesta: 'сосредоточенность, преданность делу, внутренний огонь', Lilith: 'вытесненное, дикая природа, непокорность',
  Fortune: 'область естественной лёгкости и удачи', Vertex: 'значимые встречи и поворотные пересечения',
};
const GT_GRAHAS = {
  Surya: 'душа, достоинство, ясность', Chandra: 'ум, чувства, восприимчивость', Mangala: 'энергия, решимость, защита',
  Budha: 'интеллект, речь, обмен', Guru: 'мудрость, рост, благословение', Shukra: 'любовь, красота, наслаждение',
  Shani: 'дисциплина, терпение, урок', Rahu: 'сильное желание, новизна, усиление', Ketu: 'отпускание, прошлый опыт, глубинное знание',
};
const NAK_LORDS = ['Кету', 'Венера', 'Солнце', 'Луна', 'Марс', 'Раху', 'Юпитер', 'Сатурн', 'Меркурий'];
const DASHA_YEARS = { 'Кету': 7, 'Венера': 20, 'Солнце': 6, 'Луна': 10, 'Марс': 7, 'Раху': 18, 'Юпитер': 16, 'Сатурн': 19, 'Меркурий': 17 };

// P2: неподвижные звёзды — традиционная природа по Птолемею («Тетрабиблос» I.9;
// согласуется с классификацией Брейди). Королевские звёзды помечены.
const GT_STARS = {
  Algol:      { ru: 'Альголь',    bayer: 'бета Персея',      nature: 'Сатурн и Юпитер', themes: 'интенсивность, испытание, самообладание', note: 'традиционно считается непростой звездой — подавать спокойно, как тему выдержки' },
  Alcyone:    { ru: 'Альциона',   bayer: 'эта Тельца (Плеяды)', nature: 'Луна и Марс',   themes: 'чувствительность, внутреннее видение, объединение людей', note: '' },
  Aldebaran:  { ru: 'Альдебаран', bayer: 'альфа Тельца',     nature: 'Марс',            themes: 'стойкость, честность, достижение', note: 'королевская звезда, страж Востока' },
  Betelgeuse: { ru: 'Бетельгейзе', bayer: 'альфа Ориона',    nature: 'Марс и Меркурий', themes: 'деятельная сила, заметный успех', note: '' },
  Sirius:     { ru: 'Сириус',     bayer: 'альфа Большого Пса', nature: 'Юпитер и Марс', themes: 'яркость, известность, размах', note: '' },
  Regulus:    { ru: 'Регул',      bayer: 'альфа Льва',       nature: 'Марс и Юпитер',   themes: 'достоинство, лидерство, честь', note: 'королевская звезда, страж Севера' },
  Spica:      { ru: 'Спика',      bayer: 'альфа Девы',       nature: 'Венера и Марс',   themes: 'дар, талант, защищённость', note: '' },
  Antares:    { ru: 'Антарес',    bayer: 'альфа Скорпиона',  nature: 'Марс и Юпитер',   themes: 'интенсивность, смелость, кульминация', note: 'королевская звезда, страж Запада' },
  Vega:       { ru: 'Вега',       bayer: 'альфа Лиры',       nature: 'Венера и Меркурий', themes: 'артистизм, харизма, вдохновение', note: '' },
  Fomalhaut:  { ru: 'Фомальгаут', bayer: 'альфа Южной Рыбы', nature: 'Венера и Меркурий', themes: 'идеализм, мечта, чистота намерений', note: 'королевская звезда, страж Юга' },
};
// P2: арабские точки (формулы зафиксированы в приложении; историческая техника).
const GT_ARABIC = {
  Spirit:   { ru: 'Точка Духа',    facts: 'классическая формула: Асцендент + Солнце − Луна днём (наоборот ночью); тема — дух, инициатива, то, что человек отдаёт миру; зеркальна Точке Судьбы' },
  Marriage: { ru: 'Точка Брака',   facts: 'классическая формула: Асцендент + Десцендент − Венера; тема — образ значимого союза и партнёрства' },
  Sickness: { ru: 'Точка Болезни', facts: 'историческая техника из средневековых трактатов; формула с Марсом и Сатурном; подача строго нейтральная: это исторический слой символики уязвимых мест, НЕ медицинское утверждение и не диагноз' },
  Death:    { ru: 'Точка Смерти',  facts: 'историческая техника из средневековых трактатов; формула с 8-м домом и Луной; подача строго нейтральная: исторический символ темы завершений и трансформаций, НЕ событие и не предсказание' },
};
// P2: смысл гармоник (техника Джона Аддея; числовая символика общеизвестна).
const GT_HARMONICS = {
  2: 'полярность и осознание противоположностей', 3: 'радость, лёгкость, естественная гармония',
  4: 'структура, устойчивость, преодоление', 5: 'творческий стиль, форма, индивидуальный почерк',
  6: 'ритм, сотрудничество, служение', 7: 'вдохновение, тонкое, иррациональное',
  8: 'интеграция, воплощение, результат', 9: 'идеал, завершённость, внутренний покой',
  10: 'реализация, мастерство, положение', 11: 'новаторство, независимость, неожиданное',
  12: 'синтез, сострадание, растворение',
};

const signFacts = (s, vedic) => {
  const g = GT_SIGNS[s];
  const ruler = vedic ? g.ruler[g.ruler.length - 1] : g.ruler.join(' (совр.) / ') + (g.ruler.length > 1 ? ' (традиц.)' : '');
  return `знак ${s}: стихия ${g.element}, качество ${g.quality}, управитель ${ruler}; ключевые слова: ${g.kw}`;
};

export const PROMPT_VERSION = 'grounded-v2';
const SYSTEM = 'Ты профессиональный астролог с 20-летним опытом и хороший литературный редактор. '
  + 'Твоя задача — ЛИТЕРАТУРНО ОФОРМИТЬ переданные проверенные факты, ничего не добавляя от себя. '
  + 'Пишешь на живом связном русском языке без астрологического жаргона (никаких терминов «квадрат», «орб», градусов и номеров домов в тексте). '
  + 'СТРОГО ЗАПРЕЩЕНО добавлять астрологические факты, которых нет в задании: других управителей, стихии, числа, дома, аспекты. '
  + 'Тон описательный, не судьбоносный: никаких предсказаний событий, диагнозов и оценок личности; обращение на «вы». '
  + 'Это символическое описание для личного дневника, не прогноз.';
const TEMPLATE = (entity, facts) => `Литературно оформи проверенные факты в связный текст. СУЩНОСТЬ: ${entity}. `
  + `ПРОВЕРЕННЫЕ ФАКТЫ: ${facts}. Объём 180–220 слов. `
  + 'Структура (без подзаголовков, связным текстом): суть механики; проявления в жизни с конкретными примерами; сильная сторона; зона роста (мягкая формулировка). '
  + 'Используй только эти факты.';

// Реестр с ЗАЗЕМЛЁННЫМИ фактами: [id, сущность, факты-для-оформления].
export function registry() {
  const out = [];
  const P = pr => `планета ${pr} — ${GT_PLANETS[pr]}`;
  for (const [pb, pr] of PLANETS) for (const s of SIGNS)
    out.push([`planetInSign.${pb}.${s}`, `${pr} в знаке ${s} (натальная карта)`, `${P(pr)}; ${signFacts(s)}`]);
  for (const [pb, pr] of PLANETS) GT_HOUSES.forEach((h, i) =>
    out.push([`planetInHouse.${pb}.${i + 1}`, `${pr} в ${i + 1}-м доме натальной карты`, `${P(pr)}; сфера дома: ${h}`]));
  for (const s of SIGNS)
    out.push([`ascInSign.${s}`, `Асцендент в знаке ${s}`, `Асцендент — то, как человека видят при первой встрече, его внешняя манера; ${signFacts(s)}`]);
  GT_HOUSES.forEach((h, i) => { for (const s of SIGNS)
    out.push([`houseCusp.${i + 1}.${s}`, `${i + 1}-й дом, начинающийся в знаке ${s}`, `сфера дома: ${h}; ${signFacts(s)}`]); });
  for (let i = 0; i < PLANETS.length; i++) for (let j = i + 1; j < PLANETS.length; j++) for (const a of ASPECTS)
    out.push([`aspectMeaning.${PLANETS[i][0]}-${PLANETS[j][0]}.${a}`, `натальный аспект «${a}» между ${PLANETS[i][1]} и ${PLANETS[j][1]}`,
      `${P(PLANETS[i][1])}; ${P(PLANETS[j][1])}; аспект «${a}» — ${GT_ASPECTS[a]}`]);
  for (const [tb, tr] of PLANETS) for (const [nb, nr] of PLANETS) for (const a of ASPECTS)
    out.push([`transit.${tb}.${a}.${nb}`, `транзитный ${tr} в аспекте «${a}» к натальному ${nr}`,
      `транзит — ВРЕМЕННОЕ влияние текущего периода, не черта характера; транзитная ${P(tr)}; натальная ${P(nr)}; аспект «${a}» — ${GT_ASPECTS[a]}`]);
  for (const [qb, qr] of POINTS) for (const s of SIGNS)
    out.push([`pointInSign.${qb}.${s}`, `${qr} в знаке ${s} (натальная карта)`, `${qr}: ${GT_POINTS[qb]}; ${signFacts(s)}`]);
  for (const [gb, gr] of GRAHAS) for (const r of RASHI)
    out.push([`grahaInRashi.${gb}.${r.split(' ')[0]}`, `${gr} в знаке ${r} (ведическая карта)`,
      `ведическая традиция, сидерический зодиак; граха ${gr}: ${GT_GRAHAS[gb]}; ${signFacts(r.replace(/^[^(]*\(/, '').replace(')', ''), true)}`]);
  NAKSHATRAS.forEach((n, i) =>
    out.push([`nakshatraMoon.${n}`, `Луна в накшатре ${n}`,
      `ведическая традиция; Луна — ум и чувства; накшатра ${n} (№${i + 1} из 27), правитель по циклу Вимшоттари — ${NAK_LORDS[i % 9]}; других фактов о накшатре не добавляй`]));
  for (const d of DASHA_LORDS)
    out.push([`mahadasha.${d}`, `период маха-даша ${d}`,
      `ведическая система Вимшоттари; большой период планеты ${d} длительностью ${DASHA_YEARS[d]} лет; архетип: ${GT_PLANETS[d] || GT_GRAHAS[d === 'Раху' ? 'Rahu' : 'Ketu'] || ''}`]);
  for (const [ab, ar] of PLANETS) for (const [bb, br] of PLANETS) for (const a of ASPECTS)
    out.push([`synastry.${ab}.${a}.${bb}`, `синастрия: ${ar} человека к ${br} партнёра, аспект «${a}»`,
      `взаимодействие двух людей; у человека ${P(ar)}; у партнёра ${P(br)}; аспект «${a}» — ${GT_ASPECTS[a]}`]);
  // ── P2-расширение (118): звёзды, арабские точки, доп. точки, гармоники,
  //    прогрессированное Солнце, профекции, мидпоинт-пары ──
  for (const [k, st] of Object.entries(GT_STARS))
    out.push([`star.${k}`, `соединение точки карты с неподвижной звездой ${st.ru}`,
      `звезда ${st.ru} (${st.bayer})${st.note ? '; ' + st.note : ''}; традиционная природа по Птолемею: ${st.nature}; темы: ${st.themes}; соединение окрашивает точку карты этими темами; историко-символический слой, подавать БЕЗ драматизации`]);
  for (const [k, ap] of Object.entries(GT_ARABIC))
    out.push([`arabicPart.${k}`, `${ap.ru} (арабская точка)`, ap.facts + '; арабские точки — историческая расчётная техника, символический слой личной карты']);
  for (const s of SIGNS) {
    out.push([`antivertexInSign.${s}`, `Антивертекс в знаке ${s}`, `Антивертекс — восточный конец оси Вертекса: то, что человек сам привносит в значимые встречи, его сознательная сторона связей; ${signFacts(s)}`]);
    out.push([`eastPointInSign.${s}`, `Восточная точка в знаке ${s}`, `Восточная точка (East Point) — вспомогательная точка самоподачи, оттенок того, как человек заявляет о себе; ${signFacts(s)}`]);
    out.push([`progSunInSign.${s}`, `прогрессированное Солнце в знаке ${s}`, `вторичные прогрессии (символический тайминг «день за год»): прогрессированное Солнце показывает тему ТЕКУЩЕГО жизненного этапа, а не черту характера; этап окрашен так: ${signFacts(s)}`]);
  }
  for (const [n, gloss] of Object.entries(GT_HARMONICS))
    out.push([`harmonic.${n}`, `гармоническая карта H${n} (техника Аддея)`,
      `гармоника ${n} — карта, где долготы умножены на ${n}; числовая символика гармоники: ${gloss}; соединения в такой карте показывают, какие энергии человека объединяются в этой теме`]);
  GT_HOUSES.forEach((h, i) =>
    out.push([`profectionYear.${i + 1}`, `год профекции ${i + 1}-го дома`,
      `годовые профекции (эллинистический тайминг: каждый год жизни активирует следующий дом, цикл 12); в год ${i + 1}-го дома в фокусе сфера: ${h}; это символический акцент года, не событие`]));
  for (let i = 0; i < PLANETS.length; i++) for (let j = i + 1; j < PLANETS.length; j++)
    out.push([`midpointPair.${PLANETS[i][0]}-${PLANETS[j][0]}`, `мидпоинт (середина дуги) ${PLANETS[i][1]}/${PLANETS[j][1]}`,
      `уранская техника: мидпоинт — точка синтеза двух планетных начал; ${P(PLANETS[i][1])}; ${P(PLANETS[j][1])}; планета, стоящая на этой середине, объединяет и выражает обе темы сразу`]);
  return out;
}

function jsonl(model, combos) {
  return (combos || registry()).map(([id, entity, facts]) => JSON.stringify({
    custom_id: id, method: 'POST', url: '/v1/chat/completions',
    body: { model, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: TEMPLATE(entity, facts) }], max_completion_tokens: 900 },
  })).join('\n');
}

// Выбор реально доступной модели: запрошенная, иначе первый доступный fallback.
// Если /models недоступен (нестабильность OpenAI) — используем MODEL напрямую:
// она уже доказанно работала в предыдущих батчах.
async function pickModel() {
  let list;
  try { list = await (await oa('/models')).json(); }
  catch (e) { if (e.noKey) throw e; console.error('pickModel: /models недоступен, беру', MODEL, '-', e.message.slice(0, 120)); return MODEL; }
  const have = new Set((list.data || []).map(m => m.id));
  if (have.has(MODEL)) return MODEL;
  for (const m of MODEL_FALLBACKS) if (have.has(m)) return m;
  // Последний шанс: любой gpt-* чат (самый «старший» по имени).
  const gpts = [...have].filter(id => /^gpt-[45]/.test(id) && !/audio|realtime|image|search|transcribe|tts/.test(id)).sort().reverse();
  if (gpts.length) return gpts[0];
  throw new Error('Ни одна подходящая gpt-модель недоступна этому ключу');
}

async function oa(path, opts = {}) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw Object.assign(new Error('OPENAI_API_KEY не задан на сервере'), { noKey: true });
  const res = await fetch(API + path, { ...opts, headers: { Authorization: `Bearer ${key}`, ...(opts.headers || {}) } });
  if (!res.ok) throw new Error(`OpenAI ${path}: ${res.status} ${(await res.text()).slice(0, 300)}`);
  return res;
}

export default function mountAstroBatch(app, pool) {
  const ready = pool.query(`CREATE TABLE IF NOT EXISTS astro_batches (
    id SERIAL PRIMARY KEY, batch_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'created',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now())`)
    .then(() => pool.query("ALTER TABLE astro_batches ADD COLUMN IF NOT EXISTS prompt_version TEXT NOT NULL DEFAULT 'v1'"))
    .catch(e => console.error('astro_batches schema:', e.message));

  // Диагностика: есть ли ключ на сервере (сам ключ не раскрывается).
  app.get('/api/astro-batch/health', (_req, res) => {
    res.json({ keyPresent: !!process.env.OPENAI_API_KEY, model: MODEL, combos: registry().length, promptVersion: PROMPT_VERSION });
  });

  // Запуск: фиксированный реестр, не чаще 1 раза в 24 ч, один активный батч.
  // Готовые custom_id по ВСЕМ завершённым батчам текущей версии промптов.
  async function collectDoneIds() {
    const rows = (await pool.query('SELECT * FROM astro_batches WHERE prompt_version=$1 ORDER BY id', [PROMPT_VERSION])).rows;
    const done = new Set();
    for (const row of rows) {
      try {
        const b = await (await oa(`/batches/${row.batch_id}`)).json();
        if (b.status === 'completed' && b.output_file_id) {
          const txt = await (await oa(`/files/${b.output_file_id}/content`)).text();
          for (const line of txt.split('\n')) {
            if (!line.trim()) continue;
            try {
              const rec = JSON.parse(line);
              if (rec.response && rec.response.status_code === 200) done.add(rec.custom_id);
            } catch (e) { /* пропуск битой строки */ }
          }
        }
      } catch (e) { /* батч недоступен — пропускаем */ }
    }
    return done;
  }

  // Запуск. ?resume=1 — дозапуск ТОЛЬКО недостающих комбинаций (после
  // пополнения баланса не платим заново за готовые).
  app.post('/api/astro-batch/run', async (req, res) => {
    try {
      await ready;
      const resume = req.query.resume === '1';
      const last = (await pool.query('SELECT * FROM astro_batches ORDER BY id DESC LIMIT 1')).rows[0];
      const sameVersion = last && last.prompt_version === PROMPT_VERSION;
      let lastState = null;
      if (last) { try { lastState = await (await oa(`/batches/${last.batch_id}`)).json(); } catch (e) {} }
      const terminal = !lastState || ['completed', 'failed', 'cancelled', 'expired'].includes(lastState.status);
      if (!terminal) return res.status(409).json({ error: `Предыдущий батч ещё выполняется (${lastState.status})`, batch_id: last.batch_id });
      let combos = registry();
      if (resume) {
        const done = await collectDoneIds();
        combos = combos.filter(([id]) => !done.has(id));
        if (!combos.length) return res.status(409).json({ error: 'Дозапускать нечего — все комбинации уже готовы', done: done.size });
      } else if (last && sameVersion && Date.now() - new Date(last.created_at).getTime() < 24 * 3600e3) {
        // Полный перезапуск той же версии — только если прошлый закончился пусто.
        const rc = (lastState && lastState.request_counts) || {};
        const dead = !lastState || ['failed', 'cancelled', 'expired'].includes(lastState.status) || (lastState.status === 'completed' && !lastState.output_file_id && !rc.completed);
        if (!dead) return res.status(409).json({ error: 'Полный батч уже запускался за 24 часа; для дозапуска недостающих используй ?resume=1', batch_id: last.batch_id, status: lastState.status });
      }
      const model = await pickModel();
      const content = jsonl(model, combos);
      const fd = new FormData();
      fd.append('purpose', 'batch');
      fd.append('file', new Blob([content], { type: 'application/jsonl' }), 'astro_batch.jsonl');
      const up = await (await oa('/files', { method: 'POST', body: fd })).json();
      const batch = await (await oa('/batches', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input_file_id: up.id, endpoint: '/v1/chat/completions', completion_window: '24h' }),
      })).json();
      await pool.query('INSERT INTO astro_batches (batch_id, status, prompt_version) VALUES ($1, $2, $3)', [batch.id, batch.status || 'created', PROMPT_VERSION]);
      res.json({ batch_id: batch.id, status: batch.status, requests: combos.length, resume, model, promptVersion: PROMPT_VERSION });
    } catch (e) {
      res.status(e.noKey ? 503 : 500).json({ error: e.message });
    }
  });

  // Объединённый результат всех завершённых батчей текущей версии (jsonl).
  app.get('/api/astro-batch/result-all', async (_req, res) => {
    try {
      await ready;
      const rows = (await pool.query('SELECT * FROM astro_batches WHERE prompt_version=$1 ORDER BY id', [PROMPT_VERSION])).rows;
      if (!rows.length) return res.status(404).json({ error: 'Батчей этой версии не было' });
      const seen = new Set(); const out = [];
      for (const row of rows) {
        try {
          const b = await (await oa(`/batches/${row.batch_id}`)).json();
          if (b.status !== 'completed' || !b.output_file_id) continue;
          const txt = await (await oa(`/files/${b.output_file_id}/content`)).text();
          for (const line of txt.split('\n')) {
            if (!line.trim()) continue;
            try {
              const rec = JSON.parse(line);
              if (rec.response && rec.response.status_code === 200 && !seen.has(rec.custom_id)) { seen.add(rec.custom_id); out.push(line); }
            } catch (e) { /* пропуск */ }
          }
        } catch (e) { /* пропуск батча */ }
      }
      res.setHeader('Content-Type', 'application/jsonl; charset=utf-8');
      res.send(out.join('\n'));
    } catch (e) { res.status(e.noKey ? 503 : 500).json({ error: e.message }); }
  });

  // Статус последнего батча (форвард из OpenAI + обновление в БД).
  app.get('/api/astro-batch/status', async (_req, res) => {
    try {
      await ready;
      const last = (await pool.query('SELECT * FROM astro_batches ORDER BY id DESC LIMIT 1')).rows[0];
      if (!last) return res.json({ status: 'none' });
      const b = await (await oa(`/batches/${last.batch_id}`)).json();
      if (b.status !== last.status) await pool.query('UPDATE astro_batches SET status=$1 WHERE id=$2', [b.status, last.id]);
      res.json({ batch_id: b.id, status: b.status, counts: b.request_counts || null, output_file_id: b.output_file_id || null });
    } catch (e) { res.status(e.noKey ? 503 : 500).json({ error: e.message }); }
  });

  // Диагностика: первые строки error-файла последнего батча (почему упали запросы).
  app.get('/api/astro-batch/errors', async (_req, res) => {
    try {
      await ready;
      const last = (await pool.query('SELECT * FROM astro_batches ORDER BY id DESC LIMIT 1')).rows[0];
      if (!last) return res.status(404).json({ error: 'Батчей не было' });
      const b = await (await oa(`/batches/${last.batch_id}`)).json();
      if (!b.error_file_id) return res.json({ batch_id: b.id, status: b.status, errors: b.errors || null, note: 'error-файла нет' });
      const txt = await (await oa(`/files/${b.error_file_id}/content`)).text();
      res.json({ batch_id: b.id, status: b.status, sample: txt.split('\n').slice(0, 3) });
    } catch (e) { res.status(e.noKey ? 503 : 500).json({ error: e.message }); }
  });

  // Результат завершённого батча (jsonl-стрим; это сгенерированные тексты, не секрет).
  app.get('/api/astro-batch/result', async (_req, res) => {
    try {
      await ready;
      const last = (await pool.query('SELECT * FROM astro_batches ORDER BY id DESC LIMIT 1')).rows[0];
      if (!last) return res.status(404).json({ error: 'Батчей не было' });
      const b = await (await oa(`/batches/${last.batch_id}`)).json();
      if (b.status !== 'completed' || !b.output_file_id) return res.status(409).json({ error: `Батч ещё не готов (${b.status})` });
      const out = await oa(`/files/${b.output_file_id}/content`);
      res.setHeader('Content-Type', 'application/jsonl; charset=utf-8');
      res.send(Buffer.from(await out.arrayBuffer()));
    } catch (e) { res.status(e.noKey ? 503 : 500).json({ error: e.message }); }
  });
}
