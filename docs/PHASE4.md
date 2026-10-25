# Phase 4 — Performance calendar

## What changed

The Calendar route now provides a Monday-first Toronto calendar, selectable daily reports, weekly and monthly summaries, daily consumption and spacing charts, six-month progress, comparable date ranges, and verified personal bests. Forest Green and Ocean Blue retain the existing application design. No XP, rewards, achievements, or Phase 5 features were added.

Calendar navigation supports month/year buttons and a month picker. Adjacent-month cells are selectable; today and the selected day have independent indicators. The accessible labels and legend identify classifications without relying on color. Daily details reuse `EntryEditor` and the shared deletion/Undo actions. All money comes from Phase 3's exact rational-cent calculations and immutable entry price snapshots, including custom individual cigar prices.

## Scoring

The pure implementation is `src/utils/performance.ts`; adjustable weights, minimum interval count and thresholds live in `src/config/performance.ts`.

For a confirmed, completed Toronto day with a scheduled positive pouch-spacing target and at least **two eligible consecutive pouch intervals**:

* `A = eligible intervals >= target / eligible interval count`.
* `S = clamp(mean eligible interval / target, 0, 1)`.
* `R = clamp(1 - daily pouch count / effective baseline daily pouch count, 0, 1)`.
* With a valid positive pouch baseline: `round(60*A + 25*S + 15*R)`.
* Without one: `round(100*(60*A + 25*S)/85)`.

Baseline quantities retain Phase 3's thousandths precision and effective-date versions. Cigarette-only or cigar-only baselines do not invent a pouch baseline; a zero pouch baseline cannot be a reduction denominator. Financial savings never enter this score. More intervals or uses do not earn points; the score measures proportions, not volume. Contributions saturate at 100%, so exceeding the minimum target cannot reduce a score. The minimum evidence rule can leave a low-use day unrated; the explanation explicitly says not to consume more to obtain a score.

Rounded integer classifications: Excellent 90–100; On Target 75–89; Below Target 50–74; Significantly Below Target 0–49. Unconfirmed days, today, future dates, missing targets, and too few intervals are Unrated. A confirmed zero-use day receives explicit nicotine-free recognition without fabricating interval data or a numerical score. These are motivational indicators, not medical assessments.

## Toronto dates, sleep and DST

Settings adds a daily sleep window, default **23:00–09:00 America/Toronto**. This is an analytics exclusion window, not a claim that the user slept. Both times are editable and synchronize through Firestore. Equal times and malformed times are rejected.

Intervals pair consecutive pouches only. Cigarettes and cigars remain in consumption/financial reports and do not reset pouch spacing. An eligible pair must have positive elapsed time, both events on the same Toronto calendar date, and no overlap with the sleep window. An endpoint at sleep start is excluded; sleep end is awake. Pairs crossing midnight are excluded even for an unusual sleep setting. Cross-month pairs consequently cannot become overnight personal records.

Real elapsed milliseconds determine duration. Eligibility checks endpoints and every real minute boundary within an interval, so both occurrences of a repeated fall-back hour are checked. A skipped spring-forward hour adds no imaginary elapsed time. The sleep window has minute precision. Work is bounded by the real minutes between disjoint consecutive pairs in each loaded day. UTC arithmetic is used only for calendar labels; Firestore boundaries resolve Toronto midnights, allowing 23-hour and 25-hour days.

Changing sleep settings recalculates historical analytics; sleep settings are not versioned. It never edits entries, recorded prices, or the Home timer. Historical timestamps and actual elapsed time remain intact.

## Tracking confirmation and corrections

Calendar and Stats use the same `users/{uid}/coverage/{YYYY-MM-DD}` documents. Confirmation means **all pouches, cigarettes and cigars are recorded**, including zero-use days. Only past days can be confirmed in the application. Existence of records never automatically confirms a day. Revoke is always available for a confirmed past day.

Creation batches the entry with an unconfirmed coverage record. Historical time/price edits transactionally read the current entry and revoke both its actual old day and its new day. Deletion revokes the deleted entry's actual day. Restore revokes its original day and preserves its original timestamp and price. This avoids stale client timestamps leaving a previously moved day falsely confirmed. The user reviews and reconfirms affected days; savings and scores are withheld meanwhile. Undo of an unacknowledged create waits for its write to complete before deleting it, preventing a server-read race.

Historical edits/deletes/restores use Firestore transactions and therefore **require a connection**; they do not promise durable offline queuing. Normal new logs retain batched offline writes, and existing persistent cache behavior is retained. Queued new-log Undo waits for connectivity. Cached reports have an explicit warning and may not represent all server records. Errors surface through the existing tracking feedback; do not assume an optimistic success message means a server acknowledgement.

## Aggregation and comparisons

Monthly summaries and Monday–Sunday weekly summaries show confirmed-day consumption, weighted average eligible interval duration, known spending, eligible savings, and classification counts. The number of confirmed days versus the period length is explicit. Unconfirmed recorded activity remains visible in the daily report; it is not extrapolated into complete totals. Future days are not considered confirmed, scored, or included in averages. Unknown prices remain unknown, never zero.

Daily comparison uses the immediately preceding calendar day only if both days are confirmed; it does not silently skip missing days. Both targets and actual spacing durations are shown.

The period explorer defaults to selected month versus previous month. It also accepts two completed months or arbitrary date ranges. It compares the first **N confirmed completed dates** in chronological order in each range, where N is the smaller available count. This makes totals use equal exposure even for different month lengths; missing dates are never imputed. The exact included dates and selected boundaries are expandable. Samples can be nonconsecutive, so these descriptive comparisons do not establish trends for untracked days or control weekday differences. Percentage changes require a positive denominator. Raw duration and target-relative spacing are separate metrics. Savings show their own eligible-day counts; unequal financial eligibility is explicitly not a like-for-like savings change.

Charts use null gaps for unconfirmed/missing observations. Targets remain visible as scheduled reference values. Daily and monthly charts include readable data alternatives and empty-state explanations. Existing financial charts remain on Stats.

Personal bests initially cover the selected month. “Load all-time bests” explicitly queries from the earliest confirmed coverage date through today, covering all potentially eligible evidence. Only confirmed completed days count. Unknown days break streaks. A streak day requires either a confirmed nicotine-free day or at least two eligible intervals with 100% target success. Best reduction uses the positive date-effective pouch baseline; unavailable baselines are excluded.

## Firestore schema, queries and deployment

New optional document:

```text
users/{uid}/settings/sleep
  start: "23:00"  // HH:mm, Toronto
  end:   "09:00"  // HH:mm, different from start
```

Missing sleep settings use defaults without automatically writing over remote data. No new entry fields, summary collections, duplicated confirmations, or financial data are introduced. No migration is required. Derived reports are memoized in memory and rebuild after live snapshots; no materialized scores can become stale.

On `/calendar`, the shared Finance provider subscribes to pricing, baselines and coverage, but disables its whole-entry-ledger listener. Calendar makes one bounded entries query covering visible Monday–Sunday weeks plus one previous day for the daily comparison, and a `limit(1)` preceding-pouch query. Month-boundary pairs are available for context but intentionally excluded from same-day scoring. There are no per-cell listeners. Broader comparison ranges, six-month progress, and all-time records load only when opened, and unsubscribe when closed. Metadata (coverage and baseline versions) remains a shared full collection subscription; other existing routes retain Phase 3's ledger behavior.

The range uses `occurredAt >= startTorontoMidnight` and `< midnightAfterEnd`, ordered descending. The predecessor uses `kind == pouch`, `occurredAt < start`, descending, limit 1. The existing `kind ASC / occurredAt DESC` index in `firestore.indexes.json` supports it; no new index definition is needed. The emulator checks result boundaries and ownership but does not prove that a production composite index is deployed.

**Deploy the updated `firestore.rules`** to validate the new sleep document. Deploy the existing indexes if not already deployed:

```powershell
firebase deploy --only firestore:rules,firestore:indexes
```

No deployment was performed during implementation. Every query/document remains under the authenticated UID. Rules validate the sleep document and exclude it from the generic settings-write allowance. Existing coverage rules accept atomic revocation. No Cloud Functions, Blaze plan, scheduled jobs, or paid services are needed. Existing owner-controlled entry rules remain; unsupported direct console/API edits or older clients can bypass application-level coverage invalidation and require manual review/reconfirmation.

## Files

Created:

* `src/config/performance.ts` — centralized score configuration.
* `src/utils/performance.ts` — calendar, sleep, score, summary, comparison and best calculations.
* `src/services/performance.ts` — bounded live queries and sleep persistence.
* `src/hooks/usePerformance.ts` — scoped subscriptions and loading/error/retry state.
* `src/components/SleepSettings.tsx` — sleep settings form.
* `src/components/performance/Reports.tsx` — daily report, summaries and bests.
* `src/components/performance/Charts.tsx` — consumption, spacing and monthly charts.
* `src/components/performance/PeriodExplorer.tsx` — custom comparisons and optional extended queries.
* `tests/performance-utils.spec.ts` — deterministic analytics tests.
* `tests/performance-flows.spec.ts` — browser interactions, corrections and responsive themes.
* `docs/PHASE4.md` — this guide.

Modified:

* `src/pages/Calendar.tsx` — replaces the placeholder.
* `src/pages/Settings.tsx` — includes sleep settings.
* `src/App.tsx` — lazy Calendar route; chart code stays out of the initial route bundle.
* `src/styles.css` — calendar colors, responsive reports, charts and controls.
* `src/contexts/FinanceContext.tsx`, `src/services/finance.ts` — suppress full entry subscription on Calendar.
* `src/services/entries.ts` — atomic coverage invalidation with entry mutations.
* `src/contexts/EntriesContext.tsx` — wait for a pending create before transactional Undo.
* `firestore.rules` — sleep validation and ownership.
* `tests/fixtures/browser.ts`, `tests/fixtures/tracking.ts` — isolated range/sleep services and coverage invalidation.
* `tests/firestore-rules.mjs` — sleep rules, bounded queries and atomic correction checks.
* `README.md` — Phase 4 overview and guide link.

## Validation

Commands:

```powershell
npm test
npm run typecheck
npm run build
npm run test:rules
```

Use Node 24.12+ and Java 21 for the emulator. On this machine Node 24 was invoked with `npx --yes --package=node@24 -c "npm run build"`; the emulator used a temporary portable Java 21 installation. The demo emulator project is `demo-pouchtracker`, Firestore at `127.0.0.1:8180`. Automated browsers intercept Firebase services and never contact `.env.local`'s project.

Results: 59 unit/browser tests pass, including all Phase 1–3 regression tests and 16 Phase 4 tests. 34 local Firestore emulator checks pass. Strict TypeScript and the production/PWA build pass. Vite reports the existing non-blocking initial chunk-size warning (about 904 kB before gzip); Calendar and shared chart code are separately loaded. Browser tests cover both themes at 320, 375, 390 and 1440px with no horizontal overflow or browser exceptions. Mobile screenshots were reviewed. Tests cover DST, leap years, Monday grids, thresholds, baseline absence, sleep crossings, insufficient evidence, confirmed zeros, missing prices, effective targets, comparisons, edits/deletes/restore, cross-day invalidation, remote snapshot updates and error recovery.

The emulator verifies date-boundary query results and rule enforcement; browser service doubles verify UI behavior. These are **not live Firebase, production-index, physical iPhone, or real cross-device tests**. Production sign-in, two-device synchronization, actual offline persistence and connection-loss recovery still need manual verification.

## Manual verification

1. Sign in, open Calendar, verify Toronto today, Monday headings, previous/next month/year, February 2024 and February 2025.
2. Select an unconfirmed empty past day. It must remain Unrated. Confirm all use only if truly complete; a zero-use day gets nicotine-free recognition. Revoke and verify that recognition disappears.
3. Review a past day with at least three daytime pouches. Check target, intervals, score inputs, counts, exact prices and savings. Confirm tracking and compare the displayed score with the formula above.
4. Edit a timestamp or price using the timeline. Move an entry to another day; verify both dates need reconfirmation. Delete and Undo, checking the original price is restored and coverage still needs review. Compare the same confirmation state in Stats.
5. Change sleep start/end in Settings; revisit the calendar and verify excluded intervals. The Home timer and original History timestamps must remain unchanged. On a second signed-in device verify the setting and calendar update (manual live test).
6. Open weekly summaries, custom month/date comparisons, six-month charts and all-time bests. Confirm partial counts, exact included dates, null gaps and unknown-price warnings. Compare dates with different scheduled targets using actual duration as well as target success.
7. Switch both themes and test 320px/iPhone portrait, landscape and desktop. Keyboard-select dates, expand chart data, open/close EntryEditor with Escape, and check focus and selected-date indicators.
8. Test offline cached reading and queued new logs with browser network controls. Reconnect before historical mutation; verify errors and retry if disconnected. Confirm no duplicate log or late success toast survives Undo of a pending log.

## Remaining limits

The score is a documented heuristic, not a health outcome or diagnosis. It intentionally leaves low-evidence days unrated. Sleep is a fixed current window, not actual sleep sensing or a versioned schedule. Previous-day comparison does not search all history for a substitute date. Matched comparison samples can have different weekday composition. Large all-time requests intentionally read all potentially confirmed history and may consume more Spark reads; they require an explicit action. Historical transactions require connectivity. Cached data may be incomplete, and older clients/direct database edits require manual coverage review. No live account, production deployment, or cross-device synchronization was exercised.
