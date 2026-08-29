# 02 — Screen inventory

## Verified primary views and major subviews

- Authentication/onboarding/verification/reset flows
- Profile, security, sessions and personalization
- Dashboard
- Meal configuration and resident meal selection
- Kitchen operations
- Billing hub and bill detail/actions
- Payments and payment administration
- Expenses hub
- Purchases and products/units
- Resident funds and ledger history
- Monthly closing/readiness
- Formula engine and variables
- Users/resident management and resident 360
- Notifications and announcements
- Calendar/holidays
- Reports with financial, meals, purchases, outstanding and residents tabs plus export paths
- Settings/policies/institution configuration
- Audit
- Tasks/background-work status
- System/data export and backup administration concept

## Navigation architecture observed

The source is effectively a client-side single-screen application whose primary destination is stored as a Zustand `view` key. `LazyViewRouter` uses feature-level `React.lazy()` boundaries, which is a positive performance pattern.

## Rewrite UX disposition

Use URL-addressable React Router routes, preserve responsive mobile bottom navigation where useful, preserve glass/motion/skeleton/animated-background product DNA, and expose explicit draft/approved/published/reversed states for financial records. Permission-driven navigation replaces the source admin boolean/list approach.

Phase 01 screen inventory is complete. Detailed component behavior must be re-read again immediately before the corresponding feature phase is implemented.
