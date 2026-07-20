# Privacy, regulation and safety

## Data classes

- personal;
- sensitive psychological;
- health special-category;
- birth/time/location sensitive synthesis;
- credentials/secrets;
- nonpersonal configuration.

Privacy class propagates upward: combining low-risk facts may create sensitive inference.

## GDPR architecture

Before public release health/psychological processing requires documented purpose, lawful basis, Article 9 condition, transparent notice, minimization, retention, access/correction/deletion/export, privacy by design, security controls and DPIA where high risk is likely. Consent is granular and revocable; withdrawal stops future optional processing without falsifying historical audit.

## Cloud AI consent

Consent receipt includes provider, data categories, purpose, destination, retention, training policy, subprocessors, transfer mechanism, model/version and expiry. Local-only path remains usable.

## Security requirements

- encryption before IndexedDB and sync;
- key never sent to server;
- CSP and XSS controls;
- no health/diary content in URL, analytics or crash logs;
- encrypted export with explicit plaintext warning;
- source-file temp cleanup;
- session lock and re-auth for health;
- least privilege provider payload;
- synthetic fixtures only;
- threat model and incident response.

PWA note: native Android `allowBackup=false` is not applicable. Security is achieved through encrypted storage/cache policy/key management.

## Medical device boundary

MDCG qualification depends on intended purpose and actual function. Storage/simple search/general information may fall outside MDSW; processing/analyzing/interpreting medical information for a medical purpose may qualify. Rule 11 classification can be IIa/IIb/III depending on decision impact. A disclaimer cannot neutralize medical intended purpose.

## AI Act

If AI is itself a regulated product/safety component under Annex I and requires third-party conformity assessment, Article 6 can make it high-risk. Reassess when a quarantined medical module is proposed.

## EHDS

Architecture is FHIR-compatible personal health record, not an EHDS-certified EHR. Track 2027 implementing acts and staged 2029/2031 obligations. Wellness-app interoperability claims require fresh legal assessment.

## Licences

- LOINC: licence/attribution and third-party content checks;
- UCUM: licence and semantic integrity;
- SNOMED CT: affiliate/jurisdiction/reporting gate;
- questionnaires: instrument and translation rights gate;
- Swiss Ephemeris: distribution/licence gate;
- medicine knowledge base: commercial licence and update SLA.

## Human gates

Architecture/research can be completed by AI, but before public release:

- EU digital-health/privacy lawyer confirms intended purpose and notices;
- clinician/pharmacist reviews safety copy and any alert policy;
- security review validates E2EE/key/export;
- licensed content owner confirms terminology/questionnaire rights.
