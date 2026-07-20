# Phase 0 Mobile CI and Preview Plan

Status: `DOCUMENTATION_ONLY`

## Observed repository fact

| Area | Evidence | Observed behavior | Confidence |
|---|---|---|---|
| CI trigger | `.github/workflows/ci.yml`; lines 1-12 | CI runs on pushes to MAIN/claude branches and PRs touching `architect/**`. | High |
| CI commands | `.github/workflows/ci.yml`; lines 13-24 | CI installs deps, installs Chromium, and runs `npm test` in `architect`. | High |
| Deploy trigger | `.github/workflows/deploy.yml`; lines 1-20 | Deploy waits for successful CI on MAIN or manual dispatch. | High |
| Deploy artifact | `.github/workflows/deploy.yml`; lines 34-45 | `node build.mjs` publishes `architect/dist` to gh-pages. | High |
| PWA shell | `architect/sw.js`; lines 8-52 | App shell and assets cached; API/AI are pass-through. | High |

## Architectural inference

The repository has production deploy but no branch preview workflow. Mobile-only owner review therefore needs a Phase 1 CI/preview task that either publishes safe artifacts or provides a private preview URL without requiring the owner to use a desktop terminal. Confidence: high.

## Recommended preview ladder

1. Reuse existing GitHub Pages build output as downloadable PR artifact for audit/docs and static UI review.
2. Add a branch-preview workflow only after owner approves deploy-scope changes.
3. For implementation PRs, add Playwright screenshot artifacts for: `390x844`, `430x932`, `834x1194`, `1194x834`.
4. Include both themes, reduced motion, safe-area assumptions, offline reload, and PWA standalone notes.
5. Keep Codespaces as manual fallback, not required owner workflow.

## Risk

Current CI can be green while mobile layout or offline/PWA behavior regresses because the visible workflow only runs `npm test` and does not publish mobile screenshots. Confidence: high.

## Open questions

1. Which hosting provider should serve branch previews, if any, given existing gh-pages production deploy?
2. Should PR previews be public, private artifact-only, or temporary Codespaces URLs?
3. Should mobile screenshots be CI-blocking immediately or advisory during first Phase 1 slice?
