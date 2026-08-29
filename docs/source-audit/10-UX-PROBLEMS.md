# 10 — UX problems

## Confirmed structural issues

1. Primary navigation state is stored as a Zustand `view` key rather than URL routes. Deep linking, browser history semantics and shareability are weaker than necessary.
2. Frontend access checks are based on an `isAdmin` boolean and a hardcoded admin-only view list. This cannot represent fine-grained permissions.
3. Several feature components are very large (tens of kilobytes of source in single files), which increases cognitive load and makes state/error handling harder to reason about.
4. Financial mutation semantics are not visible enough in the route model: edit/void/delete paths exist where the product should instead guide users through correction/reversal history.
5. The source contains both old/new patterns and backward-compatibility behavior, increasing surprise and making the product harder to explain.

## Rewrite opportunities

- URL-addressable feature routes and nested dialogs where appropriate.
- Permission-driven navigation rather than role-name checks.
- Clear draft/post/approve/reverse states for financial documents.
- Human-readable immutable history on every financial detail view.
- Mobile-first forms with sticky primary actions and no hidden destructive semantics.
- Explicit loading/empty/error states; never synthetic financial numbers.
- Global search/command palette only after routes/permissions are canonical.
