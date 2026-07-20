# Phase 0 Native Readiness Report

Status: `DOCUMENTATION_ONLY`

## Observed repository fact

| Native readiness area | Evidence | Observed behavior | Confidence | Native implication |
|---|---|---|---|---|
| Core app | `architect/index.html`; line 15. `architect/app.js`; global state line 84. | Existing PWA is web-first vanilla JS. | High | Capacitor wrapper can be future wrapper, not rewrite. |
| Manifest | `architect/manifest.json`; full file | App declares standalone display, portrait orientation, icons, Russian metadata. | High | Good PWA base; native assets/config still missing. |
| Offline | `architect/sw.js`; lines 8-52 | App shell is cacheable; API/AI requests are not cached. | High | WebView wrapper should test offline startup and cache invalidation. |
| Storage | `architect/app.js`; localStorage profile keys lines 100-170; IDB media line 1164 | Main DB uses localStorage; media uses IndexedDB. | High | Native wrapper must validate WKWebView/Android WebView storage persistence, backup, quota, and app reinstall behavior. |
| Crypto | `architect/app.js`; `encryptPayload` lines 3738-3747; `decryptPayload` lines 3748-3769 | Uses WebCrypto APIs. | High | Verify WebCrypto availability in target WebViews. |
| Notifications | `architect/app.js`; push support lines 3616-3648; `architect/sw.js` lines 59-72 | Web Push exists where supported. | High | iOS/Android native push will require platform-specific bridge/entitlements and probably cannot be assumed from web push alone. |
| External AI | `architect/app.js`; provider fetches lines 4216, 4254, 4275 | Browser directly calls provider APIs with local keys. | High | App Store/privacy review needs clear disclosure and secure key handling. |
| Accessibility/mobile CSS | `architect/styles.css`; focus visible line 107; reduced motion lines 108, 898-900, 1287; mobile breakpoint lines 1044-1049; safe area line 191 | CSS includes focus, reduced-motion, safe-area padding, and mobile nav breakpoint. | High | Needs device screenshots and VoiceOver/TalkBack checks before native packaging. |

## Architectural inference

The app is moderately ready for a future Capacitor wrapper only after storage, crypto, push, privacy disclosures, app lifecycle, and mobile CI are proven. Confidence: medium-high.

## Risks

1. localStorage persistence can behave differently in mobile WebViews than Safari PWA.
2. Web Push implementation does not equal native push readiness.
3. Browser-side API keys in localStorage may be unacceptable for native distribution without disclosure/mitigation.
4. Health/craving features require intended-purpose review before app-store positioning.

## Recommendation

Do not add Capacitor in Phase 0 or Phase 1 foundation. Create a later native-readiness spike with synthetic data, storage persistence tests, notification strategy, privacy labels, and rollback to PWA-only.

## Open questions

1. Is native packaging intended for private owner use first or public distribution?
2. Will AI provider keys remain BYO in native builds?
3. What backup/export UX is required before a native wrapper can be trusted?
