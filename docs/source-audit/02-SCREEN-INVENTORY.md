# 02 — Screen inventory

## Verified primary views

- Authentication / onboarding screen
- Profile
- Dashboard
- Meal configuration
- Resident meal booking/toggles
- Kitchen operations
- Billing hub
- Payments
- Expenses hub
- Purchases
- Products
- Resident funds
- Monthly closing
- Formula engine / variables
- Users / resident management
- Resident 360 dialog
- Notifications hub
- Announcements
- Calendar / holidays
- Reports
- Settings hub
- System hub
- Audit view
- Personalization/theme controls

## Current navigation behavior

The source is effectively a client-side single-screen application controlled by Zustand `view` state rather than URL-addressable feature routes. `LazyViewRouter` does perform feature-level `React.lazy()` loading, which is a useful performance pattern to retain conceptually.

## Rewrite UX direction

- Use React Router routes for shareable/back-button-safe navigation.
- Preserve mobile bottom navigation and responsive shell behavior where it improves usability.
- Keep glass surfaces, animated background, transitions, skeletons and micro-interactions.
- Remove the need for a monolithic state switch to represent navigation.
- Financial actions must surface explicit status, immutable history and correction paths.
- No fake financial values while an API is unavailable.

## Phase 01 verification still required

Nested dialogs/sheets and admin subviews must be mapped to individual parity rows before the audit exit gate is marked complete.
