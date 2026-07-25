#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Генерация базы профессиональных астро-интерпретаций через OpenAI Batch API.

Режимы (по порядку):
  python3 astro_texts_batch.py registry            — ШАГ 1: реестр и количества
  python3 astro_texts_batch.py generate            — ШАГ 2: batch_input.jsonl
  python3 astro_texts_batch.py submit              — ШАГ 3: загрузка + создание batch
  python3 astro_texts_batch.py poll <batch_id>     — ШАГ 4а: статус / скачивание
  python3 astro_texts_batch.py build <output.jsonl>— ШАГ 4б: interpretation_rules.json
  python3 astro_texts_batch.py sample <rules.json> — ШАГ 5: 15 случайных примеров

Требует: переменную окружения OPENAI_API_KEY (для submit/poll).
Только stdlib — никаких зависимостей. Batch-режим = 50% скидка и без
rate-limit-гонок. source каждого текста: "gpt5.4_batch_v1".
"""
import json, os, random, re, sys, time, urllib.request

MODEL = "gpt-5.4"
SOURCE = "gpt5.4_batch_v1"
API = "https://api.openai.com/v1"

PLANETS = [("Sun", "Солнце"), ("Moon", "Луна"), ("Mercury", "Меркурий"), ("Venus", "Венера"),
           ("Mars", "Марс"), ("Jupiter", "Юпитер"), ("Saturn", "Сатурн"), ("Uranus", "Уран"),
           ("Neptune", "Нептун"), ("Pluto", "Плутон")]
SIGNS = ["Овен", "Телец", "Близнецы", "Рак", "Лев", "Дева", "Весы", "Скорпион",
         "Стрелец", "Козерог", "Водолей", "Рыбы"]
ASPECTS = ["соединение", "трин", "секстиль", "квадрат", "оппозиция"]
POINTS = [("Chiron", "Хирон"), ("Ceres", "Церера"), ("Pallas", "Паллада"), ("Juno", "Юнона"),
          ("Vesta", "Веста"), ("Lilith", "Лилит (средний апогей Луны)"),
          ("Fortune", "Точка Судьбы (Парс Фортуны)"), ("Vertex", "Вертекс")]
GRAHAS = [("Surya", "Сурья (Солнце)"), ("Chandra", "Чандра (Луна)"), ("Mangala", "Мангала (Марс)"),
          ("Budha", "Будха (Меркурий)"), ("Guru", "Гуру (Юпитер)"), ("Shukra", "Шукра (Венера)"),
          ("Shani", "Шани (Сатурн)"), ("Rahu", "Раху"), ("Ketu", "Кету")]
RASHI = ["Меша (Овен)", "Вришабха (Телец)", "Митхуна (Близнецы)", "Карка (Рак)", "Симха (Лев)",
         "Канья (Дева)", "Тула (Весы)", "Вришчика (Скорпион)", "Дхану (Стрелец)",
         "Макара (Козерог)", "Кумбха (Водолей)", "Мина (Рыбы)"]
NAKSHATRAS = ["Ашвини", "Бхарани", "Криттика", "Рохини", "Мригашира", "Ардра", "Пунарвасу",
              "Пушья", "Ашлеша", "Магха", "Пурва-Пхалгуни", "Уттара-Пхалгуни", "Хаста",
              "Читра", "Свати", "Вишакха", "Анурадха", "Джйештха", "Мула", "Пурва-Ашадха",
              "Уттара-Ашадха", "Шравана", "Дхаништха", "Шатабхиша", "Пурва-Бхадрапада",
              "Уттара-Бхадрапада", "Ревати"]
DASHA_LORDS = ["Кету", "Венера", "Солнце", "Луна", "Марс", "Раху", "Юпитер", "Сатурн", "Меркурий"]
HOUSES_RU = ["1-й дом (личность, начало)", "2-й дом (ресурсы, самоценность)",
             "3-й дом (общение, учёба)", "4-й дом (дом, корни)", "5-й дом (творчество, радость)",
             "6-й дом (уклад, мастерство)", "7-й дом (партнёрство)", "8-й дом (глубокие перемены)",
             "9-й дом (смысл, горизонты)", "10-й дом (призвание)", "11-й дом (друзья, будущее)",
             "12-й дом (внутренний мир)"]

SYSTEM = ("Ты профессиональный астролог с 20-летним опытом и хороший литературный редактор. "
          "Пишешь на живом связном русском языке без астрологического жаргона (никаких терминов "
          "«квадрат», «орб», градусов и номеров домов в тексте). Тон описательный, не судьбоносный: "
          "никаких предсказаний событий, диагнозов и оценок личности; обращение на «вы». "
          "Это символическое описание для личного дневника, не прогноз.")

TEMPLATE = ("Напиши развёрнутую интерпретацию: {entity}. Объём 180–220 слов. "
            "Структура (без подзаголовков, связным текстом): суть механики; проявления в жизни "
            "с конкретными примерами; сильная сторона; зона роста (мягкая формулировка).")


def registry():
    """ШАГ 1 — точный реестр комбинаций. Возвращает список (rule_id, entity_ru, category)."""
    combos = []
    for pb, pr in PLANETS:                      # 1. Планета в знаке: 10×12 = 120
        for s in SIGNS:
            combos.append((f"planetInSign.{pb}.{s}", f"{pr} в знаке {s} (натальная карта)", "planet_in_sign"))
    for pb, pr in PLANETS:                      # 2. Планета в доме: 10×12 = 120
        for i, h in enumerate(HOUSES_RU):
            combos.append((f"planetInHouse.{pb}.{i+1}", f"{pr} в {h} натальной карты", "planet_in_house"))
    for s in SIGNS:                             # 3. Асцендент в знаке: 12
        combos.append((f"ascInSign.{s}", f"Асцендент в знаке {s} (как человека видят при встрече)", "asc_in_sign"))
    for i, h in enumerate(HOUSES_RU):           # 4. Знак на куспиде дома: 12×12 = 144
        for s in SIGNS:
            combos.append((f"houseCusp.{i+1}.{s}", f"{h}, начинающийся в знаке {s}", "house_sign_on_cusp"))
    for i in range(len(PLANETS)):               # 5. Аспекты (полная матрица): C(10,2)×5 = 225
        for j in range(i + 1, len(PLANETS)):
            for a in ASPECTS:
                pa, pb_ = PLANETS[i][1], PLANETS[j][1]
                combos.append((f"aspectMeaning.{PLANETS[i][0]}-{PLANETS[j][0]}.{a}",
                               f"натальный аспект «{a}» между {pa} и {pb_}", "aspect_meaning"))
    for tb, tr in PLANETS:                      # 6. Транзитные аспекты: 10×10×5 = 500
        for nb, nr in PLANETS:
            for a in ASPECTS:
                combos.append((f"transit.{tb}.{a}.{nb}",
                               f"транзитный {tr} в аспекте «{a}» к натальному {nr} (временное влияние периода)",
                               "transit_aspect_meaning"))
    for qb, qr in POINTS:                       # 7. Точки/астероиды в знаке: 8×12 = 96
        for s in SIGNS:
            combos.append((f"pointInSign.{qb}.{s}", f"{qr} в знаке {s} (натальная карта)", "point_in_sign"))
    for gb, gr in GRAHAS:                       # 8а. Ведич.: граха в раши: 9×12 = 108
        for r in RASHI:
            combos.append((f"grahaInRashi.{gb}.{r.split(' ')[0]}",
                           f"{gr} в знаке {r} (ведическая карта, сидерический зодиак)", "jyotish_graha_in_rashi"))
    for n in NAKSHATRAS:                        # 8б. Накшатра Луны: 27
        combos.append((f"nakshatraMoon.{n}", f"Луна в накшатре {n} (ведическая традиция)", "jyotish_nakshatra"))
    for d in DASHA_LORDS:                       # 8в. Маха-даши: 9
        combos.append((f"mahadasha.{d}", f"период маха-даша {d} (Вимшоттари, ведическая традиция)", "jyotish_mahadasha"))
    for ab, ar in PLANETS:                      # 9. Синастрия (направленная): 10×10×5 = 500
        for bb, br in PLANETS:
            for a in ASPECTS:
                combos.append((f"synastry.{ab}.{a}.{bb}",
                               f"синастрический аспект «{a}»: {ar} человека к {br} партнёра (взаимодействие в паре)",
                               "synastry_aspect"))
    return combos


def cmd_registry():
    combos = registry()
    cats = {}
    for _, _, c in combos:
        cats[c] = cats.get(c, 0) + 1
    print("РЕЕСТР ИНТЕРПРЕТАЦИЙ (ШАГ 1)")
    for c, n in cats.items():
        print(f"  {c:28s} {n:5d}")
    print(f"  {'ИТОГО':28s} {len(combos):5d}")


def cmd_generate(path="batch_input.jsonl"):
    combos = registry()
    with open(path, "w", encoding="utf-8") as f:
        for rule_id, entity, _cat in combos:
            req = {
                "custom_id": rule_id,
                "method": "POST", "url": "/v1/chat/completions",
                "body": {
                    "model": MODEL,
                    "messages": [{"role": "system", "content": SYSTEM},
                                 {"role": "user", "content": TEMPLATE.format(entity=entity)}],
                    "max_tokens": 700, "temperature": 0.8,
                },
            }
            f.write(json.dumps(req, ensure_ascii=False) + "\n")
    print(f"OK: {len(combos)} промптов → {path}")


def _api(path, data=None, headers=None, method=None, raw=False):
    key = os.environ.get("OPENAI_API_KEY")
    if not key:
        sys.exit("ОСТАНОВКА: нет OPENAI_API_KEY в окружении — нужен ключ владельца.")
    h = {"Authorization": f"Bearer {key}"}
    h.update(headers or {})
    req = urllib.request.Request(API + path, data=data, headers=h, method=method)
    with urllib.request.urlopen(req) as r:
        body = r.read()
    return body if raw else json.loads(body)


def cmd_submit(path="batch_input.jsonl"):
    # multipart-загрузка файла (stdlib)
    boundary = "----astrobatch"
    with open(path, "rb") as f:
        content = f.read()
    body = (f"--{boundary}\r\nContent-Disposition: form-data; name=\"purpose\"\r\n\r\nbatch\r\n"
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{os.path.basename(path)}\"\r\n"
            f"Content-Type: application/jsonl\r\n\r\n").encode() + content + f"\r\n--{boundary}--\r\n".encode()
    up = _api("/files", data=body, headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
    batch = _api("/batches", data=json.dumps({
        "input_file_id": up["id"], "endpoint": "/v1/chat/completions", "completion_window": "24h",
    }).encode(), headers={"Content-Type": "application/json"})
    print(f"OK: batch создан: {batch['id']} (статус {batch['status']}). Дальше: poll {batch['id']}")


def cmd_poll(batch_id):
    b = _api(f"/batches/{batch_id}")
    print(f"Статус: {b['status']} · выполнено {b.get('request_counts', {})}")
    if b["status"] == "completed" and b.get("output_file_id"):
        out = _api(f"/files/{b['output_file_id']}/content", raw=True)
        with open("batch_output.jsonl", "wb") as f:
            f.write(out)
        print("OK: результаты → batch_output.jsonl. Дальше: build batch_output.jsonl")


JARGON = re.compile(r"\bквадрат|\bоппозици|\bтрин\b|\bсекстил|\bорб|градус|[°]", re.I)


def cmd_build(path):
    combos = {rid: cat for rid, _e, cat in registry()}
    rules, warns = {}, []
    with open(path, encoding="utf-8") as f:
        for line in f:
            rec = json.loads(line)
            rid = rec["custom_id"]
            try:
                text = rec["response"]["body"]["choices"][0]["message"]["content"].strip()
            except (KeyError, IndexError, TypeError):
                warns.append(f"{rid}: пустой/ошибочный ответ")
                continue
            words = len(text.split())
            if not (150 <= words <= 260):
                warns.append(f"{rid}: {words} слов (вне 180-220±)")
            if JARGON.search(text):
                warns.append(f"{rid}: жаргон/градусы в тексте")
            rules[rid] = {"text": text, "source": SOURCE, "category": combos.get(rid, "?"), "words": words}
    with open("interpretation_rules.json", "w", encoding="utf-8") as f:
        json.dump({"version": SOURCE, "rules": rules}, f, ensure_ascii=False, indent=1)
    print(f"OK: {len(rules)} текстов → interpretation_rules.json; предупреждений: {len(warns)}")
    for w in warns[:30]:
        print("  !", w)


def cmd_sample(path):
    data = json.load(open(path, encoding="utf-8"))["rules"]
    by_cat = {}
    for rid, r in data.items():
        by_cat.setdefault(r["category"], []).append((rid, r))
    picks = []
    cats = list(by_cat)
    random.shuffle(cats)
    while len(picks) < 15 and cats:
        for c in list(cats):
            if by_cat[c]:
                picks.append(by_cat[c].pop(random.randrange(len(by_cat[c]))))
                if len(picks) >= 15:
                    break
            else:
                cats.remove(c)
    for rid, r in picks:
        print(f"\n═══ {rid} ({r['category']}, {r['words']} слов) ═══\n{r['text']}")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "registry"
    if cmd == "registry":
        cmd_registry()
    elif cmd == "generate":
        cmd_generate(*sys.argv[2:3])
    elif cmd == "submit":
        cmd_submit(*sys.argv[2:3])
    elif cmd == "poll":
        cmd_poll(sys.argv[2])
    elif cmd == "build":
        cmd_build(sys.argv[2])
    elif cmd == "sample":
        cmd_sample(sys.argv[2])
    else:
        sys.exit("режимы: registry | generate | submit | poll <id> | build <file> | sample <file>")
