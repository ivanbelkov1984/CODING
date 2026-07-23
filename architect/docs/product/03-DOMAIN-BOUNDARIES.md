# 03 — DOMAIN BOUNDARIES

> Жёсткие границы продукта. Нарушение любой — стоп-условие. Провенанс: `CLAUDE.md` §9, `claude-handoff/03`, `life-architect-v2/07,08,16` (reference), полный handoff Ивана §6–12.

## 1. Эпистемические границы

- **LLM hypothesis ≠ fact.** Гипотеза ИИ — отдельный класс с evidence spans, alternatives, expiry, подтверждением. Не превращается молча в факт или score.
- **Self-report ≠ objective truth.** Слова пользователя — правда о сообщённом опыте, не о причине/диагнозе.
- **Correlation ≠ causation.** Последовательность во времени не доказывает причинность. `CausalEffectEstimate` — только при обоснованном (quasi-)экспериментальном дизайне.
- **Number ≠ probability.** 0–1 не называется вероятностью без вероятностной семантики.

## 2. Психология

- **Psychology ≠ diagnosis.** ИИ формулирует гипотезы о процессе, не выдаёт их за установленную личность/намерение (в т.ч. третьих лиц).
- **COM-B** используется только как таксономия условий конкретного поведения (Capability/Opportunity/Motivation) — **не тест личности**, не единый readiness score.
- Метод «Зачем?» — гайд рефлексии, результат сохраняется как `LLMExtractedProcessHypothesis` с alternatives/expiry/confirmation.
- Нельзя усиливать зависимость от модели; нельзя подменять кризисную помощь литературным/мистическим объяснением.

## 3. Readiness / действия (PDRE)

- **Readiness многомерна** (capability, opportunity, motivation, self-efficacy, emotional load, contextual friction, values alignment, consistency, recovery, health limitations, uncertainty, data quality). **Не сводится к одному score.**
- **REJECT:** универсальная экспонента роста, единый Psychological Inertia score, гарантированная точка прорыва, произвольные вероятности будущего, смешивание астрологии с эмпирической моделью. «Personal Singularity» — только метафора.
- **Missed action ≠ avoidance.** Planning ≠ автоматически слабое действие. **Health barrier ≠ psychological weakness.**

## 4. Физическое здоровье

- **Health organizer ≠ treatment engine.** Разрешено: медистория, лекарства/OTC/витамины/добавки, планы приёма, фактический intake, симптомы, показатели, анализы, PDF-документы, source-bound объяснения, графики подтверждённых значений, подготовка отчёта врачу.
- **Оригинальный медицинский документ — immutable.** Draft extraction (OCR/LLM) **не попадает** в графики до верификации пользователем.
- **Regulatory quarantine (запрещено без owner-approved контракта):** диагноз, назначение/изменение дозы, объявление сочетания безопасным, drug-interaction engine, disease prognosis, therapy selection, clinical critical-value alerts.
- Внутренняя модель **FHIR-compatible**, но **не** hospital EHR clone. Разделять: PrescriptionEvidence / MedicationPlan / MedicationUseStatement / MedicationIntakeEvent / PerceivedEffect / AdverseEffectObservation.

## 5. Астрология

- **Astrology ≠ empirical predictor.** Explicit opt-in; **symbolic only**; не causal, не health predictor, не psychological diagnosis.
- Не влияет на: readiness, action trajectory, PredictionEstimate, CausalEffectEstimate, JITAI.
- Разрешено только: **отдельно помеченный символический контекст** в ScenarioOutlook / reflection prompt / LLM explanation.
- Расчётная часть (astronomy/time/geometry) отделена от интерпретационной школы. Цепочка: birth evidence → normalization → astronomy → geometry → school rules → interpretive claim → SymbolicAstrologyAnnotation.

## 6. Цвет (в Momentary State)

Персональный exploratory signal. **Не** тест Люшера, **не** диагноз, **нет** универсального значения цветов; используется только после повторных личных наблюдений.

## 7. Сценарии

- **Scenario planning ≠ prophecy.** Прогноз — сценарный: условия, альтернативы, временной горизонт, неопределённость, триггеры инвалидции. Никаких изобретённых вероятностей.

## 8. Голос и безопасность LLM

- Роль: **EvidenceGroundedDirectMentor** («отрезвляющий наставник»). Отклонена роль «Проницательный Оракул».
- Прямой, тёплый, опирающийся на факты; **без**: чтения мыслей, приписывания скрытых мотивов как фактов, унижения/обвинения, фатализма («это неизбежно»), смешивания астрологии с причинностью, медицинских рекомендаций.
- Формула ответа: точный факт → честная граница вывода → возможные объяснения → прямой смысл → конкретный следующий шаг.
- Tone modes: `direct_supportive · neutral_analytical · gentle_stabilizing · clinical_boundary · crisis_safe`.
- Validators (вводить на choke-point `callClaude`, `app.js:4350`): grounding · unsupported psychology · astrology isolation · health safety · tone/shame · numeric · temporal · uncertainty · alternative explanations · crisis adaptation.

## 9. Privacy / безопасность (сводка; крипто — `SECURITY_MODEL.md`)

- В git/CI/fixtures — только synthetic data. Реальные дневники/health/даты рождения/ключи — никогда.
- Секреты (passphrase, recovery, API keys) и device-local поля (`apiUrl, spaceKey, lastSync`) не входят в переносимый export.
- При E2EE сервер не получает открытый payload. Нельзя обещать, что AI-провайдер не видит отправленный текст — видит ровно отправленное.
- Пароли не остаются в UI после завершения/закрытия.

## 10. Git / процесс / UX (сводка)

- Один активный implementation-task; нет direct push/force-push в `MAIN`; ветка от актуального base; после merge удаляется.
- Крупный домен — только с task-контрактом, тестами, rollback; один вертикальный срез на PR; «тест не запущен» ≠ «covered».
- Все критические операции — с iPhone/iPad; разрушительные действия — явное подтверждение; offline/reload — обязательная проверка для storage/backup/SW.

## 11. Стоп-условия

Остановиться и сообщить владельцу, если требуется: миграция/удаление реальных данных, force-push, изменение криптографии/медицинской логики/privacy boundary без отдельного контракта, либо невозможна мобильная проверка критического пути.
