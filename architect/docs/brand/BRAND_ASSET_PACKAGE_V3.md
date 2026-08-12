# Архитектор жизни — Brand Asset Package v3

Owner-approved branding package prepared from the supplied mockup.

## Important
The source is a presentation PNG mockup, not a native SVG/vector master. The current production raster master is extracted from the largest icon rendition in that mockup. If a clean SVG/1024 source is supplied later, replace the master while keeping this integration map.

## Canonical assets expected in the branding PR

- `01-app-icon-master-1024.png` — canonical raster master.
- `02-app-icon-512.png` — PWA any.
- `03-app-icon-192.png` — PWA any.
- `04-apple-touch-icon-180.png` — iOS Home Screen.
- `05-favicon-64.png`, `06-favicon-32.png` — browser favicon.
- `07-header-brand-icon-96.png`, `08-header-brand-icon-64.png` — topbar/header.
- `09-about-brand-icon-256.png` — Settings/About.
- `10-app-icon-maskable-512.png`, `11-app-icon-maskable-192.png` — maskable PWA icons, critical artwork inside 72% safe zone.
- `12-splash-brand-1024.png` — startup/first-launch identity if the current app already has such a state.
- `20-brand-lockup-full-safe.png` — exact approved right-side composition reference with icon, full title, subtitle and decorative star.
- `21-wordmark-title-safe.png` — full `Архитектор жизни` wordmark, safe margins.
- `22-wordmark-subtitle-safe.png` — clean subtitle only.
- `23-wordmark-title-subtitle-safe.png` — title + subtitle, decorative star intentionally omitted.
- `24-brand-lockup-icon-title-safe.png` — canonical icon + full title.
- `25-brand-lockup-compact-safe.png` — compact horizontal icon + full title.
- `26-brand-lockup-icon-title-subtitle-safe.png` — canonical icon + title + subtitle, universal identity lockup.
- `00-source-mockup-reference.png` — reference only; NEVER runtime.

## Visual QA already performed

The earlier v2 lockups had real crop defects (bottom of icon, right end of `жизни`, and stray pixels/star fragments in subtitle crops). v3 was rebuilt and visually checked.

PASS conditions:
- rounded-square icon and glow fully visible;
- `Архитектор жизни` fully visible, no clipped final letters;
- subtitle clean, no title/star fragments;
- compact/full lockups have safe outer margins;
- maskable variants preserve all meaningful artwork within safe center;
- all icon size derivatives come from the same canonical master for consistent sharpness/style.

## Runtime rules

- Use `object-fit: contain`, never `cover` for any brand lockup.
- Preserve intrinsic aspect ratio; never stretch lockups.
- If live HTML text `Архитектор жизни` is already shown beside the image, render only the brand icon to avoid duplicate title.
- Keep Diary/Psychology/Health/Astrology and other section icons functional; do not replace them with the product logo.
- Do not repeat the full lockup on every screen.
- No CSS invert/filter.
- No remote/CDN brand assets.
- `00-source-mockup-reference.png` must never enter runtime manifests or service-worker precache.

## Responsive verification required

Test at 320, 375/390, 430 phone widths; 768/834 tablet; desktop; and landscape phone. Confirm no image clipping, no horizontal overflow, stable topbar height/tap targets, no collision with search/add/settings controls, iOS standalone safe-area correctness.

## Delivery governance

Brand integration must be a separate Draft PR from accepted MAIN, after the active bridge PR is accepted. Do not merge or enable auto-merge autonomously.
