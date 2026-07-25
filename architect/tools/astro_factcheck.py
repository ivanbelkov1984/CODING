#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ШАГ 4 — автоматическая проверка сгенерированных текстов против таблицы
истинности (astro_ground_truth.json): ищем УТВЕРЖДЕНИЯ, которых не было
в промпте (чужой управитель, чужая стихия, чужое качество), плюс жаргон
и объём. Флаги — на ручную проверку, ничего не удаляется автоматически.

Использование:
  python3 astro_factcheck.py batch_output.jsonl        (сырой результат батча)
  python3 astro_factcheck.py interpretation_rules.json (собранная база)
"""
import json, re, sys, os

GT = json.load(open(os.path.join(os.path.dirname(__file__), "astro_ground_truth.json"), encoding="utf-8"))
SIGNS = GT["signs"]
RASHI2SIGN = {"Меша": "Овен", "Вришабха": "Телец", "Митхуна": "Близнецы", "Карка": "Рак",
              "Симха": "Лев", "Канья": "Дева", "Тула": "Весы", "Вришчика": "Скорпион",
              "Дхану": "Стрелец", "Макара": "Козерог", "Кумбха": "Водолей", "Мина": "Рыбы"}
PLANET_NAMES = ["Солнце", "Луна", "Меркурий", "Венера", "Марс", "Юпитер", "Сатурн", "Уран", "Нептун", "Плутон"]
ELEMENT_PAT = {"огонь": r"огн[её]м|огненн|стихи[яи] огня|огонь",
               "земля": r"земн(?:ой|ая|ое|ых|ым)|стихи[яи] земли",
               "воздух": r"воздушн|стихи[яи] воздуха|воздух[ае]?\b",
               "вода": r"водн(?:ый|ая|ое|ых|ым)|стихи[яи] воды"}
QUALITY_PAT = {"кардинальный": r"кардинальн", "фиксированный": r"фиксированн", "мутабельный": r"мутабельн"}
JARGON = re.compile(r"\bквадрат|\bоппозици|\bтрин\b|\bсекстил|\bорб|градус|[°]", re.I)
RULER_CTX = re.compile(r"(управ|прав[ия]т)", re.I)


def sign_of(rule_id):
    p = rule_id.split(".")
    if p[0] in ("planetInSign", "pointInSign", "houseCusp") and p[-1] in SIGNS:
        return p[-1]
    if p[0] in ("ascInSign", "antivertexInSign", "eastPointInSign", "progSunInSign") and p[1] in SIGNS:
        return p[1]
    if p[0] == "grahaInRashi":
        return RASHI2SIGN.get(p[-1])
    return None


def check(rule_id, text):
    flags = []
    words = len(text.split())
    if not (150 <= words <= 260):
        flags.append(f"объём {words} слов")
    if JARGON.search(text):
        flags.append("жаргон/градусы")
    sign = sign_of(rule_id)
    if sign:
        g = SIGNS[sign]
        vedic = rule_id.startswith("grahaInRashi")
        allowed_rulers = [g["ruler"][-1]] if vedic else g["ruler"]
        # 1) Чужая стихия: упомянут элемент, не совпадающий с истинным.
        for el, pat in ELEMENT_PAT.items():
            if el != g["element"] and re.search(pat, text, re.I):
                flags.append(f"чужая стихия «{el}» (истина: {g['element']})")
        # 2) Чужое качество.
        for q, pat in QUALITY_PAT.items():
            if q != g["quality"] and re.search(pat, text, re.I):
                flags.append(f"чужое качество «{q}» (истина: {g['quality']})")
        # 3) Чужой управитель: возле слов «управляет/правит» стоит не та планета.
        for m in RULER_CTX.finditer(text):
            window = text[max(0, m.start() - 60):m.start() + 90]
            for pl in PLANET_NAMES:
                if pl in window and pl not in allowed_rulers and pl not in rule_id:
                    flags.append(f"возможный чужой управитель «{pl}» (истина: {'/'.join(allowed_rulers)})")
    return flags


def iter_texts(path):
    if path.endswith(".jsonl"):
        for line in open(path, encoding="utf-8"):
            rec = json.loads(line)
            try:
                yield rec["custom_id"], rec["response"]["body"]["choices"][0]["message"]["content"].strip()
            except (KeyError, IndexError, TypeError):
                yield rec.get("custom_id", "?"), None
    else:
        data = json.load(open(path, encoding="utf-8"))["rules"]
        for rid, r in data.items():
            yield rid, r["text"]


def main(path):
    total, empty, flagged = 0, 0, {}
    for rid, text in iter_texts(path):
        total += 1
        if not text:
            empty += 1
            flagged[rid] = ["пустой ответ"]
            continue
        f = check(rid, text)
        if f:
            flagged[rid] = f
    print(f"Проверено: {total} · пустых: {empty} · с флагами: {len(flagged)}")
    by_type = {}
    for fl in flagged.values():
        for f in fl:
            key = f.split(" «")[0].split(" (")[0]
            by_type[key] = by_type.get(key, 0) + 1
    for k, n in sorted(by_type.items(), key=lambda x: -x[1]):
        print(f"  {k}: {n}")
    print("\nПримеры флагов (до 25):")
    for rid, fl in list(flagged.items())[:25]:
        print(f"  {rid}: {'; '.join(fl)}")
    json.dump(flagged, open("factcheck_flags.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("\nПолный список → factcheck_flags.json")


if __name__ == "__main__":
    main(sys.argv[1])
