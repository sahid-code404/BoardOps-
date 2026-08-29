# 03 — Domain inventory

## Source model groups

### Identity and access
`User`, `UserSession`, `TrustedDevice`, `LoginHistory`, `RegistrationRequest`, `Role`, `Permission`, `RolePermission`.

### Meals and residence operations
`MealConfiguration`, `MealEntry`, `MealHistory`, `MealOverride`, `MealPreset`, `MealPresetItem`, `LeaveApplication`, `GuestMeal`.

### Calculation and closing
`Variable`, `Formula`, `FormulaVersion`, `BillingCycle`, `MonthlySnapshot`.

### Financial operations
`Bill`, `Payment`, `Expense`, `Unit`, `Product`, `Purchase`, `PurchaseItem`, `Refund`, `RefundTransaction`, `Adjustment`, `LedgerEntry`, `ReferenceSequence`.

### Controls and communication
`Restriction`, `Holiday`, `Notification`, `Announcement`, `AuditLog`, `BackgroundTask`.

### Institution / people
`StaffRecord`, `Setting`, `Institution`.

## Structural conflicts to resolve in rewrite

- `User.role` is a string while a separate Role/Permission relational model also exists. The relational permission model must become canonical.
- Financial state mixes mutable documents (`Bill`, `Payment`, `Refund`) with ledger entries but lacks database-level immutable-event constraints.
- Many relations use cascade deletion. Authoritative financial/audit records must not disappear because a parent record is deleted.
- Money uses floating-point columns. Rewrite uses integer minor units throughout authoritative financial tables.
- Snapshot data is mostly JSON. The rewrite may keep immutable serialized snapshots for provenance, but must also preserve queryable keys/hashes needed for reconciliation and reproducibility.
- `LedgerEntry.runningBalance` is a cached mutable derivative. The authoritative balance is the immutable entry sum; any cached balance must have a safe, rebuildable mechanism.
