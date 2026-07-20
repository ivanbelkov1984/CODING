'use strict';

// Additive metadata seam for Life Architect v2.
// Classic-script global by design: app.js remains a non-module PWA runtime.
(function installRecordMetadata(root) {
  const METADATA_VERSION = 1;
  const HISTORY_LIMIT = 20;
  const ID_COLLECTIONS = ['insights','dreams','patterns','evolution','spiritual','checkins','bots','digests','spheres','sphereLogs','chats','cravings'];

  const COLLECTION_POLICY = Object.freeze({
    insights:   { recordClass: 'UserSelfReport',      privacyClass: 'sensitive_personal' },
    dreams:     { recordClass: 'UserSelfReport',      privacyClass: 'sensitive_personal' },
    patterns:   { recordClass: 'UserSelfReport',      privacyClass: 'sensitive_personal' },
    evolution:  { recordClass: 'DescriptiveState',    privacyClass: 'sensitive_personal' },
    spiritual:  { recordClass: 'UserSelfReport',      privacyClass: 'sensitive_personal' },
    checkins:   { recordClass: 'ContextObservation',  privacyClass: 'health_sensitive' },
    bots:       { recordClass: 'BehavioralEvent',     privacyClass: 'personal' },
    digests:    { recordClass: 'LLMExplanation',      privacyClass: 'sensitive_personal' },
    spheres:    { recordClass: 'ContextObservation',  privacyClass: 'personal' },
    sphereLogs: { recordClass: 'BehavioralEvent',     privacyClass: 'personal' },
    chats:      { recordClass: 'UserSelfReport',      privacyClass: 'sensitive_personal' },
    cravings:   { recordClass: 'ContextObservation',  privacyClass: 'health_sensitive' },
  });

  const ALLOWED_SOURCES = new Set(['user_local','portable_import','legacy_import','system_generated','unknown_legacy']);
  const ALLOWED_VERIFICATION = new Set(['unverified','user_confirmed','source_confirmed','observational','repeated_personal_pattern','model_supported','validated_for_use']);

  const isObject = value => !!value && typeof value === 'object' && !Array.isArray(value);
  const iso = value => {
    const date = value ? new Date(value) : new Date();
    return Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
  };
  const policyFor = collection => COLLECTION_POLICY[collection] || { recordClass: 'UserSelfReport', privacyClass: 'personal' };
  const safeSource = value => ALLOWED_SOURCES.has(value) ? value : 'unknown_legacy';
  const safeVerification = value => ALLOWED_VERIFICATION.has(value) ? value : 'unverified';

  function inspectRecord(record, options = {}) {
    const existing = isObject(record && record._meta) ? record._meta : {};
    const existingProvenance = isObject(existing.provenance) ? existing.provenance : {};
    const existingCorrection = isObject(existing.correction) ? existing.correction : {};
    const collection = options.collection || existing.collection || '';
    const policy = policyFor(collection);
    const at = iso(options.at || existingProvenance.lastTouchedAt || existingProvenance.firstMetadataAt || record?.updatedAt || record?.createdAt);
    const origin = safeSource(existingProvenance.origin || options.source || 'unknown_legacy');
    const history = Array.isArray(existingCorrection.history) ? existingCorrection.history.slice(-HISTORY_LIMIT) : [];

    return {
      ...existing,
      metadataVersion: METADATA_VERSION,
      collection: collection || existing.collection || undefined,
      recordClass: existing.recordClass || options.recordClass || policy.recordClass,
      privacyClass: existing.privacyClass || options.privacyClass || policy.privacyClass,
      verificationStatus: safeVerification(existing.verificationStatus || options.verificationStatus || 'unverified'),
      provenance: {
        ...existingProvenance,
        origin,
        firstMetadataAt: existingProvenance.firstMetadataAt || at,
        lastTouchedAt: existingProvenance.lastTouchedAt || at,
      },
      correction: {
        ...existingCorrection,
        status: existingCorrection.status || 'current',
        revision: Number.isInteger(existingCorrection.revision) && existingCorrection.revision >= 0 ? existingCorrection.revision : 0,
        history,
      },
    };
  }

  function touchRecord(record, options = {}) {
    if (!isObject(record)) return record;
    const hadMetadata = isObject(record._meta);
    const at = iso(options.at);
    const meta = inspectRecord(record, { ...options, at, source: options.source || (hadMetadata ? record._meta?.provenance?.origin : 'user_local') });
    const correction = { ...meta.correction };

    if (hadMetadata && options.correction !== false) {
      const event = { at, kind: options.correctionKind || 'user_edit' };
      correction.status = 'corrected';
      correction.revision = (Number(correction.revision) || 0) + 1;
      correction.history = [...(Array.isArray(correction.history) ? correction.history : []), event].slice(-HISTORY_LIMIT);
    }

    record._meta = {
      ...meta,
      provenance: { ...meta.provenance, lastTouchedAt: at },
      correction,
    };
    return record;
  }

  function markImportedRecord(record, options = {}) {
    if (!isObject(record)) return record;
    const at = iso(options.importedAt);
    const source = options.source || (Number(options.exportVersion) >= 2 ? 'portable_import' : 'legacy_import');
    const existing = inspectRecord(record, { ...options, at, source });
    const originalOrigin = existing.provenance.origin;

    record._meta = {
      ...existing,
      provenance: {
        ...existing.provenance,
        origin: originalOrigin === 'unknown_legacy' ? safeSource(source) : originalOrigin,
        importedAt: at,
        sourceFormat: options.sourceFormat || (Number(options.exportVersion) >= 2 ? 'architect-json-v2' : 'architect-json-legacy'),
        lastTouchedAt: existing.provenance.lastTouchedAt || at,
      },
    };
    return record;
  }

  function markImportedDB(db, options = {}) {
    if (!isObject(db)) return 0;
    let count = 0;
    for (const collection of ID_COLLECTIONS) {
      const records = Array.isArray(db[collection]) ? db[collection] : [];
      for (const record of records) {
        if (!isObject(record)) continue;
        markImportedRecord(record, { ...options, collection });
        count++;
      }
    }
    return count;
  }

  function readRecordMetadata(record, options = {}) {
    return inspectRecord(record, options);
  }

  root.ARCH_METADATA = Object.freeze({
    METADATA_VERSION,
    HISTORY_LIMIT,
    ID_COLLECTIONS: Object.freeze([...ID_COLLECTIONS]),
    COLLECTION_POLICY,
    touchRecord,
    markImportedRecord,
    markImportedDB,
    readRecordMetadata,
  });
})(typeof globalThis !== 'undefined' ? globalThis : window);
