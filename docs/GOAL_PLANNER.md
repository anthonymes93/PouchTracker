# Progressive Pouch Spacing Goals

## Building a plan

Open Settings > Manage Goals, or Manage Goals beneath Home's spacing progress. The page is `/settings/goals`.

The builder shows only explicitly configured weeks. It starts with the corrected four-week schedule:

| Week | Toronto dates | Target |
| --- | --- | --- |
| 1 | October 18-24, 2026 | 1 hr |
| 2 | October 25-31, 2026 | 1.5 hrs |
| 3 | November 1-7, 2026 | 2 hrs |
| 4 | November 8-14, 2026 | 3 hrs |

Week 2 is current on October 26. Week 4 remains 3 hrs because this already exceeds Week 3 by the default minimum increase. There is no rolling 52-week calendar and no automatic row creation.

**+ Add Next Week** opens a review for exactly one additional week. Save changes commits it; Cancel leaves the plan unchanged. Add as many as you need, up to 52 configured weeks total, including completed weeks. Dates normally advance seven calendar days. If the plan expired long ago, adding resumes on the next Toronto Sunday without inventing intervening historical rows; the last target continues throughout that gap.

Every current/upcoming row has an Edit button. Use the hours/minutes picker (15-minute increments, up to 24 hours), review the resulting chain, and Save or Cancel. Completed weeks are locked. The final upcoming week can be removed after confirmation; other rows cannot be deleted through the builder. Removal never deletes nicotine entries or audit records.

Beyond the last explicitly configured week, its goal continues indefinitely. Home does not invent a next goal or week number. No scheduled functions or background jobs are needed.

## Progression and maintenance

Minimum Weekly Increase offers 15 min, **30 min (default)**, and 1 hr. Change progression opens a preview before applying an increment change. Automatic increases can explicitly be **Paused**, allowing equal or lower targets and leaving later weeks unchanged.

While enabled, future rows are evaluated in date order:

```
minimumNextGoal = previousWeekGoal + configuredIncrement
nextWeekGoal = max(existingNextWeekGoal, minimumNextGoal)
```

For example, editing Week 3 from 2 hrs to 3 hrs raises Week 4 from 3 hrs to 3.5 hrs. If Week 4 already has 4 hrs, it stays at 4 hrs. The calculation continues through all later configured weeks, never creating additional ones. Preview labels automatically adjusted targets. A requested lower target is raised to the required minimum while progression is enabled; pause progression first to intentionally plan maintenance or step-down weeks.

Changing progression preferences never changes completed weeks or the current goal. Editing the current week is explicit and includes a warning about scores and provisional XP. Subsequent future weeks cascade from its new value. Disabling progression does not undo earlier saved increases.

If a cascade would exceed 24 hours, the entire change is rejected before saving; it is never clamped into equal targets. Use a smaller increment, fewer weeks, or pause progression. The 52-week count is a maximum, not a target to fill automatically.

## Versioned Firestore schema

The authoritative document remains `users/{uid}/settings/schedule`:

```json
{
  "schemaVersion": 3,
  "revision": 1,
  "timeZone": "America/Toronto",
  "progressionEnabled": true,
  "incrementMinutes": 30,
  "steps": [
    { "week": 1, "startsOn": "2026-10-18", "minimumMinutes": 60 },
    { "week": 2, "startsOn": "2026-10-25", "minimumMinutes": 90 },
    { "week": 3, "startsOn": "2026-11-01", "minimumMinutes": 120 },
    { "week": 4, "startsOn": "2026-11-08", "minimumMinutes": 180 }
  ]
}
```

In version 3, every saved step is an initial migrated week, a user-added week, or a week explicitly retained through migration review. No generated placeholder rows are written.

Every save uses a transaction that re-reads the document, verifies the reviewed fingerprint/revision, constructs and validates the complete result, writes it with the next revision, appends an immutable `settings/schedule/history/{revision}` event, and increments `settings/rewardState.sourceRevision`. Audit events retain complete before/after plans, reason, revision and server timestamp. This includes migration trims and removed future targets.

Listeners synchronize across devices. Stale drafts are rejected with an instruction to cancel and review the latest plan. Offline saves fail visibly and are not queued. Cached settings are labelled; drafts remain available after a save error. Account changes unmount drafts and unsubscribe old listeners. Corrupt/unsupported settings surface an error rather than being overwritten.

## Safe migration from the old planner

Migration never assumes that 52 stored entries were intentional or that repeated values prove a row was generated.

- Missing settings initialize only the corrected four weeks.
- The exact original four-week Friday default is corrected to the Sunday dates above.
- Valid unversioned/version-2 schedules with at most four rows retain customized dates and targets. They gain version-3 progression preferences. Existing custom maintenance/step-down plans start paused so their goals are not silently changed.
- Older plans with more than four rows are **not automatically trimmed or rewritten**. The main builder shows a compact Review existing plan prompt rather than 52 rows. The existing saved schedule remains authoritative on all other pages while review is pending.
- Review lets the user inspect all existing values, choose how many leading weeks to retain, and enable or pause progression. Keep all preserves all weeks; pause also preserves every target exactly. A shorter plan requires reviewing every removed target, including customized values, before saving. Current and historical weeks cannot be removed. Cancel makes no change.
- Removed rows remain in immutable before/after audit history. Existing audit documents and usage data are never deleted.

Because version 2 did not record whether each week was generated or deliberately configured, confirmation is required rather than guessing from values. Old plans exceeding 52 rows can be retained intact for historical safety, but cannot add more; new version-3 plans cannot exceed 52. No automatic migration or add operation silently changes historical weeks.

## Shared calculations and historical integrity

`utils/spacingSchedule.ts` is the shared selector and plan-construction service. Home, Calendar/Stats, performance reports and reward evaluation use the same saved effective dates. Toronto local calendar dates determine transitions; actual DST elapsed time remains handled by the existing timestamp utilities.

Home uses today's effective target. Daily performance uses each day's historical target. Ordinary XP and interval achievements retain the existing interval-start policy: an interval crossing Sunday keeps the goal effective at its starting pouch, while Home can show the new current-week goal. Daily scores exclude cross-midnight/sleep intervals under the existing evidence rules. A current-week edit can recalculate earlier days in that same week; future edits cannot rewrite completed weeks.

Changes increment the reward source revision atomically. The existing reconciler re-evaluates evidence on Home, Rewards or the builder, invalidates unsupported awards, restores supported ones, and records corrections under deterministic award IDs without duplicate XP. Pending review/errors remain visible and reconciliation resumes after reconnection.

Nicotine entries, prices, baselines, savings records and coverage are not written by this service. Log Pouch remains directly beneath the live timer; Other Logging remains at the bottom. Both Forest Green and Ocean Blue themes are preserved.

## Duration formatting

`formatMinutes` is display-only. Below one hour it uses minutes; whole/half hours use `1 hr`, `1.5 hrs`, `2 hrs`; other values use `1 hr 15 min`. Measured fractional minutes display to one decimal. The main live timer remains HH:MM:SS. Storage and calculations remain minutes/milliseconds.

## Deployment and testing

Redeploy **firestore.rules before releasing this app**, then deploy the app using the existing Vercel workflow:

```sh
firebase deploy --only firestore:rules
```

Rules accept the version-3 progression fields, enforce supported increments, prevent version downgrades, bound configured counts while retaining oversized legacy history, and require an atomic audit/reward revision update. Owner-only access and immutable audit rules remain. The variable-length step values and edit policy are validated in the shared service; these personal records are not tamper-proof competitive scores.

No new indexes, environment variables, OAuth changes, paid services, or manual document edits are needed. Sign in to the new app and follow Review existing plan if shown. Tests use isolated fixtures and the demo Firestore emulator, never the live account or `.env.local`.

Use Node 24.12+; emulator tests require Java 21:

```sh
npm run typecheck
npm test
npx playwright test tests/goal-planner-flows.spec.ts tests/home-layout.spec.ts --browser=webkit
npm run test:rules
npm run build
```

Coverage includes individual additions, 52-week cap, increments and pause, sequential cascades, higher custom targets, no phantom weeks, deletion confirmation, ambiguous generated-plan review, immutable migration history, real emulator listeners/concurrent saves, unchanged tracking/pricing, historical XP correction, mobile themes, and Home action positioning.

Physical iPhone and live cross-device testing have not been performed. Existing custom non-Sunday effective dates remain preserved; arbitrary historical corrections require a deliberate audited administrative workflow. The existing non-blocking Vite large-chunk warning may remain.

Validation: 107 unit/Chromium tests passed with four workers, 8 WebKit builder/Home tests passed, and 52 Firestore emulator checks passed. Strict TypeScript and the production/PWA build passed. An initial high-concurrency run hit a timing failure in an existing timer test; its isolated rerun and the complete four-worker run both passed. Mobile preview rendering was inspected at 320px in both themes; two WebKit builder tests were repeated after correcting preview punctuation.
