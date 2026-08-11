# Claude Code — Brand Integration v3

Use only the owner-approved Brand Asset Package v3. Do not use earlier v1/v2 assets.

## Scope
Integrate the product identity of `Архитектор жизни` professionally across PWA/iOS/browser/header/splash/About without redesigning the product, changing IA, or touching bridge/backfill logic.

## Before code
1. Fetch fresh accepted `MAIN`.
2. Audit existing manifest, favicon/apple-touch-icon, splash/loading, topbar/header, Settings/About, service-worker/build precache, installability and responsive shell.
3. Reuse existing asset paths/contracts where safe; do not create duplicate manifest/cache systems.
4. Brand work must be a separate fresh branch/Draft PR after the active data/bridge PR is accepted.

## Required mapping
- canonical app icon: `01-app-icon-master-1024.png`
- manifest any: `03-app-icon-192.png`, `02-app-icon-512.png`
- manifest maskable: `11-app-icon-maskable-192.png`, `10-app-icon-maskable-512.png`
- iOS: `04-apple-touch-icon-180.png`
- favicon: `06-favicon-32.png`, `05-favicon-64.png`
- header: `08-header-brand-icon-64.png` / `07-header-brand-icon-96.png`
- About: `09-about-brand-icon-256.png`
- splash: `12-splash-brand-1024.png`
- full identity/onboarding/About when appropriate: `26-brand-lockup-icon-title-subtitle-safe.png`
- compact identity only when there is no duplicate live title: `25-brand-lockup-compact-safe.png`
- exact approved visual reference: `20-brand-lockup-full-safe.png`
- `00-source-mockup-reference.png` is NEVER runtime.

## Critical visual rules
- no cropping: CSS `object-fit: contain`; preserve aspect ratio.
- never `object-fit: cover` for lockups.
- no fixed wrapper that clips rounded-square glow or final letters.
- if live HTML title `Архитектор жизни` already exists next to the logo, use ICON ONLY; do not repeat a raster title.
- keep section/domain icons (Diary/Psychology/Health/Astrology/etc.) as functional icons.
- no giant repeated logo on every screen.
- no CSS invert/filter.
- do not alter global design tokens just because the logo has gold/blue colors.

## Placement
1. Installed PWA / Home Screen — square icon only.
2. Browser tab/bookmark — favicon only.
3. Main product header/topbar — compact icon 36–44 CSS px mobile, 40–48 px larger screens; only if current shell has appropriate product identity position.
4. Existing first-launch/startup/splash — use new identity without adding startup delay or a new animation framework.
5. Settings/About/release info — logo + live app name/build/version.
6. Onboarding/restore/empty-profile global state — full/compact lockup if the current product has such a state.
7. Section navigation/cards — retain domain icons, not the product logo.

## Accessibility
- icon beside visible title: `alt=""` and/or `aria-hidden="true"`.
- standalone identity image: accessible name `Архитектор жизни`.
- no duplicate screen-reader announcement.

## Responsive acceptance
Verify screenshots and layout at:
- 320 px phone
- 375/390 px phone
- 430 px phone
- landscape phone
- 768/834 px tablet
- desktop

Must prove:
- entire icon visible;
- full wordmark visible whenever used;
- no horizontal page overflow;
- no collision with search/add/settings controls;
- topbar height and navigation tap targets unchanged;
- iOS standalone/PWA safe-area intact.

## PWA/offline acceptance
- all manifest paths exist;
- 192/512 and maskable icons load;
- apple-touch-icon loads;
- favicons load;
- assets are local and included through existing build/SW mechanism;
- offline installed app still launches;
- no external network request caused by branding.

## Tests/evidence
Add focused assertions/evidence for broken asset URLs, manifest references, header rendering, responsive overflow/clipping, splash non-blocking behavior, offline load, accessibility, and no JS errors.

## Delivery
One small Draft PR from fresh accepted MAIN. Do not merge and do not enable auto-merge. Return exact changed asset paths, manifest/SW changes, responsive before/after evidence and CI results for owner review.
