# Phase 02 — Calendar archive regression correction

## User-reported failure
The local admin UI exposed an **Archive** action for the seeded `Founders Day` calendar closure, but the end-to-end archive path had not been exercised by CI. The route depended on a status-update trigger to reverse meal effects, so the checkpoint was considered green without proving the actual authenticated archive + restoration workflow.

## Correction
Commit `e7f5fa24e400dc0c3490abd3a6e7014df4a3a0c9` makes the archive use case explicit:
- `migrations/0006_calendar_archive_fix.sql` removes the implicit archive-restoration trigger.
- `calendar-archive.ts` owns the administrator DELETE command before the generic calendar router.
- event archival, safe meal restoration, meal-effect finalization, meal history, and the audit event execute in one D1 batch.
- the response confirms that the archived state persisted.
- failures return a safe error instead of reporting success after a partial command.

## Regression coverage
CI run `33254681042` logs in as the resident, materializes the Founders Day meal state as OFF + locked, logs in as admin, archives `calendar-closure-001`, verifies calendar meal service is open again, and verifies the still-editable resident meal state is restored ON + unlocked.

The run completed successfully.

## Status
FIXED AND REGRESSION-TESTED.
