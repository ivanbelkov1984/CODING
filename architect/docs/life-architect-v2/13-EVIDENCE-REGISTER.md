# Evidence register

This register supports architectural decisions; it is not a substitute for legal or clinical advice.

## Product/repository evidence

- `architect/ENGINE.md`: actionable insights, lagged patterns, years-long memory, honesty by sample size.
- `architect/PSY_CONTOUR.md`: method «Зачем?» and no-invention rule.
- existing health/JITAI briefing: local personalised risk and no server personal-data ML.
- `architect/AGENT_BRIEF.md`: vanilla JS, local/E2EE, build/test/design constraints.

## Momentary affect

- Betella A, Verschure PFMJ. The Affective Slider: A Digital Self-Assessment Scale for the Measurement of Human Emotions. PLoS One. 2016;11(2):e0148037. https://doi.org/10.1371/journal.pone.0148037
  - Supports quick digital pleasure/valence and arousal self-report, smartphone/tablet suitability.
  - Does not validate personal color diagnosis or all daily-life constructs.

## Behavior and intervention

- Michie S, van Stralen MM, West R. The behaviour change wheel. Implementation Science. 2011;6:42. https://doi.org/10.1186/1748-5908-6-42
  - Supports COM-B as capability/opportunity/motivation conditions of target behavior.
  - Does not create a universal numerical readiness score.

- JITAI and micro-randomized trial literature distinguishes decision points, tailoring variables, intervention options, decision rules, proximal/distal outcomes and causal experimentation.
  - Product implication: descriptive/adaptive prompts first; causal optimisation later.

## Dynamic modelling

- Killick R, Fearnhead P, Eckley IA. Optimal Detection of Changepoints With a Linear Computational Cost. JASA. 2012.
  - PELT is retrospective penalised optimisation; probability is not intrinsic.

- Adams RP, MacKay DJC. Bayesian Online Changepoint Detection. 2007.
  - Supports posterior distribution over run length under specified hazard/observation model.

## Prediction standards

- Collins GS et al. TRIPOD+AI statement. BMJ. 2024;385:e078378. https://doi.org/10.1136/bmj-2023-078378
  - Reporting, not development recipe; 27-item transparency framework.

- Moons KGM et al. PROBAST+AI. BMJ. 2025;388:e082505. https://doi.org/10.1136/bmj-2024-082505
  - Quality, risk-of-bias and applicability assessment.

## Health interoperability

- HL7 FHIR R4 resources: Observation, DiagnosticReport, DocumentReference, Condition, AllergyIntolerance, MedicationRequest, MedicationStatement.
  - Product implication: lightweight internal contracts with export mapping, not hospital EHR clone.

- LOINC licence: commercial/noncommercial use subject to licence/attribution and third-party content conditions. https://loinc.org/kb/license/
- UCUM licence: no-charge use including commercial applications, with integrity/attribution obligations. https://ucum.org/license
- SNOMED CT vendor licensing: affiliate licence, member/nonmember jurisdiction and reporting considerations. https://docs.snomed.org/snomed-ct-practical-guides/vendor-introduction-to-snomed-ct/7-licensing

## EU law and guidance

- Regulation (EU) 2016/679 (GDPR): health data are special-category data; privacy-by-design, security, transparency and DPIA obligations may apply.
- Regulation (EU) 2017/745 (MDR), Rule 11 and MDCG 2019-11 rev.1 (June 2025): qualification depends on intended purpose and function; storage/simple search differs from medical analysis/decision support.
- Regulation (EU) 2024/1689 (AI Act), Article 6 and Annex I: some AI connected to regulated products can be high-risk.
- Regulation (EU) 2025/327 (EHDS): entered into force 26 March 2025, staged application and implementing acts; EHR/wellness interoperability must be tracked.

## Competitor pattern evidence

Official product documentation supports feature comparisons only:

- Apple Health Medications: medication/vitamin/supplement schedules, taken/skipped/PRN and export; limited interaction feature jurisdiction.
- MyTherapy: reminders, intake, supply, symptoms/measurements and doctor report.
- Medisafe: reminders/caregiver/reporting and interaction claims.
- Guava: records, labs, symptoms, medications, devices, document extraction and visit summary.

These do not prove clinical accuracy or privacy implementation beyond published claims.
