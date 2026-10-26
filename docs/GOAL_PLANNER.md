# Pouch Spacing Goals

## Corrected schedule

All schedule dates are America/Toronto calendar dates. Weeks start at local midnight on Sunday and end Saturday.

| Week | Dates (2026) | Minutes stored | Display |
| --- | --- | --- | --- |
| 1 | October 18–24 | 60 | 1 hr |
| 2 | October 25–31 | 90 | 1.5 hrs |
| 3 | November 1–7 | 120 | 2 hrs |
| 4 | November 8–14 | 180 | 3 hrs |

Week 2 is current on both October 25 and October 26, 2026. Weeks 5 onward hold 180 minutes until explicitly edited. No automatic increases, background jobs, or Cloud Functions are involved. An app reopened after a weekly boundary derives its target from the local Toronto date. Calendar-label arithmetic avoids treating a DST week as exactly 168 elapsed hours.

## Using the planner

Open Settings → Manage Goals, or the small Manage Goals link below Home's spacing target. The dedicated page is `/settings/goals`.

Months contain compact, collapsible weekly rows. Each row shows its dates, week number, formatted target, and Completed/Current/Upcoming status. The current month opens initially. Completed weeks are locked; the app deliberately has no historical edit control.

Edit a current or future week using Hours and Minutes, from 15 minutes through 24 hours in 15-minute increments. Copy previous week copies its target into the draft. Review changes, then Save changes; Cancel leaves saved goals intact. The current-week warning explains that today's progress, earlier scores within the current week, and provisional XP can change.

Plan future weeks supports a chosen range and three operations: apply one target, increase each existing target by a specified increment, or reset the range to the target immediately preceding it. Reset requires reviewing an explicit confirmation. Every bulk operation lists all old/new targets before saving; it is committed atomically. Lower targets and repeated targets are permitted.

The initial saved plan contains Weeks 1–52. The view rolls forward to the current week plus 51 upcoming weeks, retaining past rows for review. Thus, on October 25 it includes completed Week 1 and the horizon of Weeks 2–53. Unconfigured trailing weeks inherit the last saved target. Saving materializes the horizon so changing one week cannot silently change later weeks. Earlier records and dates are retained.

## Persistence and migration

The authoritative document remains `users/{uid}/settings/schedule`:

```json
{
  "schemaVersion": 2,
  "revision": 1,
  "timeZone": "America/Toronto",
  "steps": [
    { "week": 1, "startsOn": "2026-10-18", "minimumMinutes": 60 },
    { "week": 2, "startsOn": "2026-10-25", "minimumMinutes": 90 }
  ]
}
```

The example abbreviates the steps list. All calculations remain in minutes/milliseconds.

On authenticated profile initialization, and when the schedule listener receives an unversioned server document, the production service runs a transaction:

1. Read the current persisted document, never a stale default copy.
2. If missing, initialize the corrected plan.
3. If its timezone, four dates, week numbers, and targets exactly match the old default (October 23/30, November 6/13; 60/90/120/180), correct it to the new schedule. Map property order does not affect matching.
4. Otherwise preserve valid customized effective dates and values, adding version metadata only. A version-2 document is not remigrated.
5. Write the schedule, immutable `settings/schedule/history/{revision}` event, and increment `settings/rewardState.sourceRevision` in the same transaction.

Each audit event stores `revision`, full `before` and `after` schedules, a `reason`, and server timestamp `at`. Historical migration is therefore reviewable even though manual past-week editing is disabled. Corrupt, duplicate, unsupported-version or non-Toronto configurations surface an error and are never replaced with guessed defaults.

Every user save compares the reviewed schedule's canonical fingerprint/revision with a fresh transaction read. If another device changed it, saving fails with instructions to cancel and reopen the draft. The SDK can retry transaction contention, but a stale user's choices never overwrite a newer plan. A confirmed peer migration is accepted if the emulator/server reports a permission conflict instead of a transaction retry; other permission errors remain errors.

Listeners synchronize saved changes. Cached goals are labelled. Offline saves fail visibly and preserve the draft; they are not queued. Retrying requires reconnection. Account changes unmount the editor and unsubscribe the previous account's listeners. These operations use the existing Spark-compatible client SDK; they do not require paid backend infrastructure. See [Firebase's transaction guidance](https://firebase.google.com/docs/firestore/manage-data/transactions).

## Schedule and reward consistency

`utils/spacingSchedule.ts` supplies target selection, migration, horizon generation, validation, and edit construction. Home, performance reporting, Calendar/Stats, and reward evaluation consume the same persisted plan through this shared selection logic.

- Home uses the target effective on today's Toronto date.
- Completed daily scores, comparisons and personal bests recompute from entries, coverage, and the target effective on each historical date. They are not frozen copies of today's goal.
- Ordinary XP and consecutive-interval achievements retain the existing **interval-start target** policy. An interval crossing Sunday keeps the target effective at its starting pouch. Home can therefore show the new weekly target while an already-running reward interval still explains its older start target. No usage entry is invented at the boundary.
- Daily performance continues to exclude cross-midnight/sleep intervals under the existing evidence policy; only same-day eligible intervals contribute to that day's spacing score.
- A current-week edit changes that week's effective target, including earlier days in the same week. Future edits do not change completed weeks.
- The atomic source-revision increment invalidates reward caches. On Home, Rewards, or the planner, the existing reconciler re-evaluates evidence and updates deterministic award IDs, appending correction history. Unsupported awards become invalidated, supported awards can be restored, and unchanged awards are not duplicated. Pending review and errors stay visible. Reconciliation resumes after reconnect; no background job is required.

Nicotine entries, coverage, pricing snapshots, baselines, spending and savings are not written by the schedule service. Home keeps Log Pouch directly under the live timer and Other Logging at the bottom.

## Duration display

`formatMinutes` is display-only: below one hour it uses minutes; whole/half hours use `1 hr`, `1.5 hrs`, `2 hrs`, etc.; other values use `1 hr 15 min` or `2 hrs 15 min`. Measured fractional intervals display to one decimal minute. Unknown values display Unavailable. Home, performance tables/charts, comparisons, rewards/evidence and planner controls share it. The main live timer remains HH:MM:SS. Achievement requirements expressed as percentages or counts remain percentages/counts.

## Deployment

Deploy the updated `firestore.rules` before releasing the app:

```sh
firebase deploy --only firestore:rules
```

Schedule writes now require version increments, an atomic matching audit event, and a reward source-revision increment. Owners may read their schedule/audit trail; other accounts cannot. Schedule deletion and history modification/deletion are denied. Rules validate the document envelope, bounds, revision and audit/reward consistency; client validation checks every variable-length step and planner constraint. These personal records are not a tamper-proof competitive system.

No new indexes, environment variables, OAuth configuration, manual document deletion, or billing changes are needed. Deploy the app through the existing Vercel workflow. Opening the deployed app while signed in performs the persisted migration; the development/test runs do not mutate the production account. If a custom plan is preserved, it will continue to show its own targets rather than forcing the default 90 minutes.

## Testing

Use Node 24.12+ and Java 21 for the Firestore emulator:

```sh
npm run typecheck
npm test
npx playwright test tests/goal-planner-flows.spec.ts tests/home-layout.spec.ts --browser=webkit
npm run test:rules
npm run build
```

`goal-planner-utils.spec.ts` covers all 52 dates, Sunday/DST transitions, formatting, increments, current/future/bulk edits, custom preservation, historical scores and XP invalidation/restoration. `goal-planner-flows.spec.ts` covers mobile themes, reviews, copy/reset, synchronization, conflicts, errors/offline state, corruption, sign-out, refresh and unchanged entries/pricing. Existing Home tests assert above-fold Log Pouch and bottom-only Other Logging at five mobile sizes.

`schedule-emulator.mjs` bundles the actual production service against isolated clients. It seeds old records through the emulator admin endpoint, then tests migration, concurrent saves, listeners, audit immutability, authorization, missing/corrupt configuration and preserved pricing/entries. `rewards-emulator.mjs` tests actual reconciliation, invalidation/restoration and duplicate prevention. The harness rejects non-emulator execution and never reads `.env.local`.

## Known limitations

- Physical iPhone and live cross-device testing have not been performed. Browser engines, simulated small viewports, and two real emulator clients provide automated coverage.
- Existing customized non-Sunday effective dates are preserved rather than silently shifted; new trailing weeks use Sundays. Arbitrary historical/custom dates require deliberate administrative correction outside this planner, preserving an audit record and updating reward revision.
- History is retained in the schedule document, with a defensive 5,200-step read/rules bound and Firestore's document-size limit. This is ample for the requested yearly planner; a multi-decade archive could eventually need a separate storage design.
- Missing/corrupt settings cannot be repaired offline. A corrupt schedule requires inspection rather than automatic destructive reset.
- Reconciliation can take several transactions for a long history. It is resumable and reports pending state; saved XP should be treated as under review until it completes.

Validation completed October 26, 2026: **105 unit/Chromium browser tests**, **7 WebKit planner/Home tests**, and **50 Firestore emulator checks** passed. Strict TypeScript and the production/PWA build passed. The existing non-blocking Vite large-chunk warning remains. The WebKit corruption test explicitly waits for initial settings to load before injecting corrupt data, avoiding a test setup race.
