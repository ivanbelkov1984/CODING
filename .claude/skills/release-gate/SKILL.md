---
name: release-gate
description: Verify calculation, security, privacy, licensing, tests and documentation before an astrology-related release.
effort: xhigh
context: fork
agent: integration-release-manager
---

# Release Gate

Read `06-TEST_AND_RELEASE_GATES.md`. Verify every BLOCKING gate with evidence. Run all repository tests. Confirm no personal data, keys, unlicensed corpus or Swiss artifacts entered git. Confirm UI shows uncertainty/fallback and scenario outputs do not overclaim probabilities. Produce signed-off checklist; do not merge/deploy red gates.
