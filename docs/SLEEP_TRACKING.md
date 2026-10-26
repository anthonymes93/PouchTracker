# Flexible Sleep Tracking

## Using it

Home has a compact, secondary **Sleep tracking** disclosure after the pouch timer/goal card. Log Pouch stays in its existing primary position. Settings links to `/settings/sleep` for the full tracker.

- **I'm Going to Sleep** records a start timestamp, at any time of day.
- **I'm Awake** ends the active sleep period. It does not assume that subsequent time stays awake.
- Multiple periods per day are supported, including naps and interrupted sleep.
- **Add sleep period** records historical sleep. **Confirm awake period** records a finite range that the user explicitly knows was awake.
- Edit can correct times or change the period type. Delete requires confirmation and leaves an audit record. An uncovered range becomes unknown again.
- If a pouch is logged while sleep is active, the pouch and the sleep end commit in one transaction, using the pouch's original timestamp. A persistent prompt asks whether the user returned to sleep. **I'm Going Back to Sleep Now** explicitly starts a new period. **Not now** dismisses the question without creating sleep or awake coverage. Earlier return times can be entered on the full tracker.

The main timer is unchanged: it measures elapsed wall-clock time since the last pouch, including sleep. Deleting/Undoing a pouch never automatically restarts sleep; correct the sleep period explicitly if necessary.

## Sleep, awake, and unknown

There are no fixed nighttime hours. Unrecorded time is **unknown**, even during the day. Migration does not classify the old 11 PM–9 AM window as sleep, nor its complement as awake.

The shared `sleepEvidence` utility clips actual timestamp ranges, merges overlaps, and subtracts recorded sleep from explicitly confirmed awake ranges. Overlapping sleep wins over an awake confirmation, preventing double counting or inflated XP. To correct a mistaken sleep period, edit/delete it rather than adding a conflicting awake confirmation. Sleep need not align with midnight, a calendar date, or a timezone offset.

Only confirmed awake milliseconds contribute to ordinary spacing thresholds. A threshold reached using confirmed portions separated by unknown gaps remains provisional until the interval's coverage and usage records are reviewed. With no recorded awake evidence, no new ordinary spacing milestones are fabricated.

Daily performance retains its existing same-Toronto-day pouch-pair scope; within each pair it subtracts sleep rather than discarding a pair merely for touching recorded sleep. A pair with unknown coverage is excluded from verified metrics, and a day with such gaps has an Unrated/provisional score and an explanation. Daily reports do not attribute cross-midnight pouch pairs to a single day. Ordinary XP can span midnight and multiple sleep periods, counting confirmed awake portions across dates. Interval-start goal selection is unchanged.

Spacing achievements and personal bests use confirmed awake durations. Confirmed pouch-free/smoke-free days and consumption reductions still rely on complete nicotine-use evidence, not on proving every moment awake. Their existing reward rules remain independent of ordinary awake-time spacing.

## Migration and historical rewards

The old `users/{uid}/settings/sleep` document is migrated transactionally to version 2. Its complete previous contents are retained in immutable history. Migration creates **zero** sleep or awake periods and increments the reward source revision. Missing settings initialize the same empty evidence state. No nicotine entries, pricing, savings, goals, achievements, or old award documents are deleted.

Existing ordinary XP/spacing achievements unsupported because sleep coverage is unknown become **provisional**, excluded from verified XP totals while awaiting review. Their IDs, prior evidence, first-recorded timestamp and correction history remain. Reviewed contradictory sleep evidence can invalidate an award; confirmed awake evidence can restore it. The existing reconciler writes new audit revisions instead of duplicate rewards. Pending review and failures remain visible.

Sleep edits, deletion, awake confirmations, migration and pouch interruption atomically increment `settings/rewardState.sourceRevision`, invalidating cached evaluations. Home, Rewards and Sleep Tracking perform resumable reconciliation. Calendar/Stats immediately recompute from the same sleep evidence. No background functions or paid scheduling services are used.

## Firestore schema

`users/{uid}/settings/sleep` stores:

```text
schemaVersion: 2
revision: positive integer
periods: [
  { id: string, kind: "sleep" | "awake",
    start: Firestore Timestamp, end: Firestore Timestamp | null }
]
interruption: null | { entryId: string, at: Firestore Timestamp }
```

Only sleep can have a null end, and only one sleep period can be active. Awake confirmations always have a finite end. The application uses milliseconds internally and converts to/from real Firestore Timestamp fields at the persistence boundary. Timestamps cannot be saved in the future, and an end cannot precede its start. Zero-duration sleep is allowed when a pouch is logged immediately after starting sleep.

`users/{uid}/settings/sleep/history/{revision}` contains full `before`/`after` snapshots, `revision`, `reason`, and server timestamp `at`. No history entries are modified or deleted.

Every edit compares the draft revision/fingerprint with the transaction's current document. Concurrent/stale drafts fail visibly rather than overwriting another device's changes. Pouch creation reads current sleep within its transaction, so it does not rely on a stale local active-sleep flag. Snapshot listeners synchronize the result across devices. Account changes discard open editors and unsubscribe old listeners.

## Timezones and daylight saving

Start/stop timestamps are real instants; elapsed durations use millisecond subtraction. Toronto is used for display, manual input and daily attribution only. Overnight periods and the 23/25-hour DST days do not require special duration corrections.

Manual editing rejects nonexistent spring-forward times. For repeated fall-back hours, separate start/end controls allow choosing the first or second occurrence. Existing records preserve their original occurrence by default. Timestamp-based editing also preserves the distinction when both occurrences have the same displayed clock time.

## Deployment

Deploy the changed rules before deploying the app:

```sh
firebase deploy --only firestore:rules
```

Then deploy through the existing Vercel workflow and open the app while signed in. Migration runs automatically; do not manually delete the old sleep document. No new indexes, environment variables, OAuth changes, scheduled functions or billing upgrades are needed.

Rules enforce owner access, the version/revision envelope, bounded record count, matching immutable audit events and atomic reward revision updates. Legacy clock-window writes and deletion of the settings/audit documents are rejected. Detailed interval validation is in the shared application service; these remain personal records rather than tamper-proof competitive statistics.

## Validation and limitations

Run with Node 24.12+ and Java 21 for the emulator:

```sh
npm run typecheck
npx playwright test --workers=3
npx playwright test tests/sleep-flows.spec.ts tests/home-layout.spec.ts --browser=webkit
npm run test:rules
npm run build
```

Tests cover daytime/irregular sleep, multiple periods, interruption at the exact pouch timestamp, explicit return, unknown coverage, historical edit/delete/awake confirmation, midnight/DST, real Firestore timestamps, migration/audit preservation, two-client synchronization/conflicts, and actual XP provisional/invalidation/restoration without duplicate IDs. Regression tests use explicit synthetic recorded sleep/awake fixtures instead of the old production default window. Emulator tests bundle production services against demo-only clients and never use the live account.

- **Connection required:** sleep mutations and pouch creation now use transactions to keep pouch interruption atomic. They cannot be queued offline. Failures are shown; reconnect and retry. Existing saved records remain intact. Cigarette/cigar logging retains its existing write behavior.
- Tracking is optional and user-reported. Forgetting to stop sleep requires a manual correction; the app does not infer wakefulness from the clock or invent awake periods after a wake action.
- The settings document supports up to 3,000 periods. Historical audit snapshots and the Firestore document-size limit bound this design; a long-term archive/export workflow is not part of this change. Nothing is silently pruned.
- Daily spacing scores keep their prior same-day interval scope, while ordinary XP handles overnight intervals with explicit evidence.
- Physical iPhone and live cross-device testing have not been performed. Automated browser engines, small viewports and two real emulator clients provide the available coverage.

Validation completed: 117 regression tests, 6 additional WebKit mobile tests, and 57 Firestore emulator checks passed. TypeScript validation and the production build passed. Mobile screenshots were inspected; Log Pouch remains above the fold in both themes. The existing non-blocking Vite large-chunk warning remains.
