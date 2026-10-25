# Phase 3: spending and estimated savings

The existing app now supports configurable pouch/cigarette pricing, immutable-at-log-time price snapshots, explicit historical corrections, deletion Undo, financial reports, and theme-aware Recharts visualizations. The pouch timer, Google authentication, cigar price panel, and two themes remain in place. XP, achievements, and the performance calendar are still upcoming.

## Individual cigar pricing update

Settings → Nicotine Pricing now has a dedicated **Cigar Pricing** section below Cigarettes. Three editable CAD prices default to $1.90, $2.30 and $2.50 when an older pricing document has no cigar settings. Save pricing persists them as `cigarPresetsCents` in `users/{uid}/settings/pricing`. The existing real-time listener synchronizes saved changes across devices.

Log Cigar uses the saved presets and offers an optional custom individual price. The last selected actual price is remembered, including custom prices. History corrections accept individual prices with preset suggestions, and the cigar baseline asks only for a per-cigar reference price. There are no cigar pack-price or quantity inputs. Each cigar retains its actual price; the existing snapshot schema uses a fixed internal quantity of one for backward compatibility. Preset changes never rewrite records or saved baseline versions.

Deploy the updated `firestore.rules` with the command below before saving presets. No new indexes or collections are needed. Existing documents without `cigarPresetsCents` remain valid. Validation accepts exactly three nonnegative integer-cent presets and rejects malformed arrays. Custom prices accept up to two decimal places and use the same monetary bound as the existing pricing system.

Update validation: **43 unit/browser tests passed**, **24 local Firestore emulator rule checks passed**, **strict TypeScript passed**, and **production build passed**. Tests cover default/edited presets, simulated session synchronization, remembered selections, custom-price validation, historical preservation/correction, spending, charts, savings, and mobile layouts. Live cross-device Firebase verification was not performed. The existing non-blocking main-bundle size warning remains.

Update files: `src/utils/cigarPricing.ts`, `src/components/CigarLogPanel.tsx`, and `tests/cigar-pricing.spec.ts` were added; `src/types/finance.ts`, `src/services/finance.ts`, `src/services/entries.ts`, `src/components/QuickLog.tsx`, `src/components/EntryEditor.tsx`, `src/components/finance/PricingSettings.tsx`, `src/components/finance/BaselineSettings.tsx`, `src/styles.css`, `firestore.rules`, `tests/firestore-rules.mjs`, and this guide were updated.

## Configure and use

1. Deploy the updated security rules before using the financial settings:

   ```powershell
   firebase deploy --only firestore:rules --project YOUR_PROJECT_ID
   ```

   No new composite index is required. The existing Phase 2 index declaration remains intact; the shared ledger now uses a single-field ordered query.

2. Run `npm run dev`, sign in, and open **Settings → Nicotine Pricing**. Enter the actual CAD container/pack price and quantity for pouches and cigarettes. Both fields blank means unconfigured/unknown, not free. A zero price is accepted only when explicitly entered with a valid quantity. Unit cost previews show four decimal places. No example prices are prefilled.
3. Log entries normally. The cigar selector offers your three saved individual prices (initially $1.90, $2.30 and $2.50 CAD), allows a custom price, and remembers the last choice. New entries snapshot their applicable cost. Changing Settings affects future logs only.
4. In **History**, each record shows its recorded unit cost or **Unknown cost**. Edit time alone to preserve the price, or explicitly select **Assign / correct this entry’s price** to change only that record. Cigars accept an individual price with preset suggestions. Deleting removes the financial contribution; the success toast offers Undo for eight seconds, restoring the original ID, time, price snapshot, and creation timestamp. Restoration requires a connection and refuses to overwrite an already-existing document.
5. Configure **Settings → Savings baseline** with the categories you want, daily quantities, reference prices, and an effective start date. Reference prices are independent from current logging prices. Save a version to activate it. The first version may start in the past; subsequent versions must start today or later and after the latest version’s date. Saved versions are append-only.
6. For a historical suggestion, choose a date range whose days you have confirmed complete, calculate the suggestion, and explicitly accept it into the form. This fills daily quantities only (rounded to three decimal places); you still choose categories, reference prices, and save the baseline. No history is automatically assumed to be typical consumption.
7. In **Stats → Confirm a complete tracking day**, confirm a past day only after every use has been recorded. Confirming a day with no entries explicitly means zero use. You can mark the day incomplete again. Today cannot be confirmed early.

## How reports work

All reporting boundaries use `America/Toronto`; weeks start Monday. Statistics offer 7 days, 30 days, this month, this year, and all time. A compact Home summary keeps the timer prominent and shows today's known spending and monthly spending/savings.

**Spending** adds the known costs of recorded entries. Missing-cost records are counted and labelled; they are never silently treated as free. Totals may also be incomplete when days have not been confirmed. Category totals and daily/monthly/weekly/yearly/all-time totals update from the live ledger after creates, corrections, moves, deletions, and restores.

**Precision:** Firestore stores integer pack cents and integer unit quantity. Calculations use exact rational cents backed by `BigInt`, so a $12.99/20 snapshot stays 1299/20 cents internally. Two hundred such entries total exactly $129.90. Each entry is not rounded to two decimals before summation. Currency output uses `Intl.NumberFormat('en-CA', {currency: 'CAD'})`; charts convert aggregate values to numbers only for plotting. Display rounding can make the visible rounded category amounts differ from the rounded total by a cent.

**Savings** compares a day's baseline reference spending with that day's recorded spending for the configured categories. A day is eligible only when it is finished, explicitly confirmed complete, has an active baseline version, and has known actual costs for every selected category. Zero-use days must be confirmed. Missing days and unpriced selected-category entries are excluded, never inferred as savings. Negative savings remain negative.

The selected-period and cumulative figures are **subtotals over eligible days**, with the number of included days displayed. Category estimates and reduction percentages use those same days and baseline versions. The cumulative estimate starts at baseline activation, not the beginning of account history. Today shows actual known spending and a separately labelled full-day reference, but no claimed full-day savings or extrapolated savings projection.

Average, maximum, and minimum spending use only completed, confirmed, fully priced days. Comparable-period change excludes today and compares the preceding equal number of completed calendar days; the compared dates are displayed. It is unavailable if any compared day lacks confirmation or price information, or when All time is selected. A percentage is unavailable when the prior spending denominator is zero.

Charts include daily category bars, known-spending distribution, and cumulative eligible-day savings. Empty states and missing-day gaps are explicit. A supporting daily data/coverage table is available below the charts. Both palettes use CSS variables. The Stats module is loaded separately so chart code is not part of the initial main-app bundle.

## Firestore data and compatibility

All paths remain under `users/{uid}`:

| Path | Purpose |
| --- | --- |
| `entries/{entryId}` | Existing entry fields plus optional `priceSnapshot: {packCents, quantity}`. Legacy `costCents` remains readable. |
| `settings/pricing` | `pouch` and `cigarette` snapshots, each nullable, plus optional `cigarPresetsCents` containing three individual prices. |
| `baselines/{YYYY-MM-DD}` | Immutable version: `id`, `effectiveOn`, `createdAt`, and selected `categories`, each containing `dailyCountMilli` and a reference price snapshot. |
| `settings/baselineState` | Latest effective date, updated atomically with each new baseline to prevent overlapping/out-of-order appends. |
| `coverage/{YYYY-MM-DD}` | Toronto calendar date, explicit `complete` boolean, and server update timestamp. |

Existing entries are never migrated or repriced automatically. Phase 2 cigars with integer `costCents` still count correctly; older unpriced pouches/cigarettes show unknown cost. Timestamp-only edits omit the price field entirely. Historical corrections are explicit user actions.

Rules still isolate users. They now additionally validate financial shapes and integer bounds, reject malformed prices/coverage, and make baseline versions immutable with atomic state updates. The former broad recursive write grant excludes financial sections so it cannot bypass those checks. Existing profile, preferences, schedule, and entry ownership behaviour is preserved. New rules were tested locally but **not deployed to your live project**.

## Loading, offline behaviour, and scale

One shared real-time entry ledger supplies the existing timer/counts/history and all financial views. Three small additional listeners supply pricing, baseline history, and coverage. Components do not start duplicate entry listeners, and no periodic financial writes occur.

Exact all-time calculations read the full entry history once on subscription, then receive changed-document updates. This stays within the Spark-compatible client SDK architecture but is not a promise of unlimited free reads: initial read volume and browser memory grow with account history. Very large histories would benefit from a future aggregation design. History management still displays the latest 100 entries.

Pending changes and cache-only results are labelled. Ordinary writes use the existing in-memory queue; keep the tab open until synchronization completes. Pending writes are not guaranteed to survive browser closure. Baseline append and restoration use transactions and require connectivity. On a cold offline launch, pouch/cigarette logging waits for authoritative saved pricing rather than silently ignoring a possibly configured price. Cigars retain their explicit selected price. Failed loads/saves display errors and retry actions. No Cloud Functions, Blaze upgrade, paid service, persistent database cache, or new runtime dependency was introduced.

## Validation and manual checks

```powershell
npm test
npm run typecheck
npm run build
# Requires Firebase CLI on PATH and Java 21+; uses only a demo emulator project:
npm run test:rules
```

Automated coverage includes exact/fractional unit costs, all cigar prices, historical snapshots, time-only edits, corrections, date/weekly/monthly boundaries, versioned and negative savings, partial-day exclusion, missing prices, confirmation requirements, suggestion acceptance, deletion/restoration, theme-aware charts, and 320/375/390/1440px layouts. UI tests use an intercepted test-only service layer and do not write to the configured live project. Local rules tests use `demo-pouchtracker` on `127.0.0.1:8180` and cover owner isolation, invalid input denial, append-only baselines, and Phase 2 compatibility.

Final results: **39 unit/browser tests passed**, **20 local Firestore emulator rule checks passed**, **strict TypeScript passed**, and **production build passed on Node 24**. Mobile financial charts and supporting reports were visually inspected. No new runtime dependencies were installed.

Manual checks after rule deployment:

- Configure actual prices, log each product, change the configured price, and verify the older record still displays its original cost.
- Correct an unknown historical entry, move it across a Toronto day/week/month boundary, delete it, and use Undo. Check the period totals and timer after each operation.
- Set a baseline, confirm a fully logged prior day (or a genuine zero-use day), and verify the estimate. Add a future version and verify prior-day estimates are unchanged.
- Open the account on another device, change pricing/log entries, and verify the other device receives updates. Check pending/offline labels during a temporary disconnection.

Real OAuth persistence, live Firestore/cross-device synchronization, and physical iPhone behaviour were **not** claimed as tested in this phase. The build retains a non-blocking size warning for the Firebase-containing main chunk.

## Files created

```text
docs/PHASE3.md
firebase.rules-test.json
src/types/finance.ts
src/utils/money.ts
src/utils/financeDates.ts
src/utils/finance.ts
src/services/finance.ts
src/contexts/FinanceContext.tsx
src/hooks/useFinancialReport.ts
src/components/finance/PriceFields.tsx
src/components/finance/PricingSettings.tsx
src/components/finance/BaselineSettings.tsx
src/components/finance/CoverageControl.tsx
src/components/finance/FinanceStatus.tsx
src/components/finance/HomeFinance.tsx
src/components/finance/FinancialCharts.tsx
tests/finance-utils.spec.ts
tests/finance-flows.spec.ts
tests/firestore-rules.mjs
```

## Files modified

```text
README.md
package.json
firestore.rules
src/App.tsx
src/types/data.ts
src/services/entries.ts
src/contexts/EntriesContext.tsx
src/components/layout/AppLayout.tsx
src/components/ui/TrackingFeedback.tsx
src/components/ui/StatCard.tsx
src/components/EntryEditor.tsx
src/pages/Home.tsx
src/pages/History.tsx
src/pages/Settings.tsx
src/pages/Stats.tsx
src/styles.css
tests/fixtures/browser.ts
tests/fixtures/tracking.ts
```

Your `.env.local`, `chagpt.txt`, package dependencies, and existing nicotine records were not changed.
