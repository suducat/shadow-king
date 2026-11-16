# Court interface upgrade · 2026-11-16

## Scope

Presentation only: dedicated three-piece home portrait, explicit rule/opponent selection, separate AI confirmation and badge portraits, compact public battle information, contextual ritual ownership text, mobile board viewport and touch instructions. Game rules, AI search and observation are unchanged. No new assets, keys, backends or APIs.

## Local verification

- `npm test`: 110 passed.
- `npm run build`: passed (existing large main-chunk warning remains).
- Real Chrome/WebGL `tests/browser.cjs`: passed, including deployment swaps, device privacy, anonymous opponent models, corner/body clicks, transformed canvas input, capture animations, all classic endings, a complete game, mobile DPR=2 touch and zero console/page errors.
- Updated two obsolete test assumptions: transformed canvas dimensions follow actual responsive width; illegal empty-cell clicks clear selection as the existing input handler specifies.
- `scripts/visual-review.cjs`: 25 layout checks across 1440×960, 1280×720, 390×844, 360×800, 844×390; projected corners visible, no horizontal overflow, no page errors. Ritual charge/occupation/counter scenarios captured.
- `scripts/capture-pages.cjs before|after`: same-view screenshots for home, rules/mode, opponents, setup and play.
- Screenshots are local in `artifacts/before`, `artifacts/after`; `artifacts/comparison.html` presents side-by-side comparisons. They are intentionally excluded from the production bundle.

## Limits

Browser tests use local Chrome and software WebGL. Physical iOS Safari/Android browser chrome and device GPU performance were not measured. Ritual screenshots use deterministic existing test fixtures, rather than a complete manually played ritual game. AI difficulty descriptions express relative behavior, not measured player ratings. Main bundle remains roughly 900 kB before compression.
