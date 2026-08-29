# ADR-003 — Integer minor-unit money

**Status:** Accepted

All authoritative currency values are stored as safe integer minor units (`amount_minor`, `balance_minor`, etc.). Floating-point money is prohibited. Currency metadata is explicit where more than one currency can exist.

This replaces widespread `Float` financial fields in the reference schema.
