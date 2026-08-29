# 09 — Animation inventory

## Verified patterns

- Ambient animated mesh/background.
- Page/view enter transitions.
- Lazy-view skeleton shimmer.
- Animated counters.
- Button/tap/hover motion through glass primitives.
- Dialog/sheet/menu motion through the UI component layer.
- Navigation transition behavior.

## Rewrite performance contract

- Prefer `transform` and `opacity`.
- CSS for ambient infinite motion; Motion for interaction/state transitions.
- Do not continuously animate blur/filter/shadow when avoidable.
- Do not stack many backdrop-filter surfaces on scrolling content.
- Pause/reduce ambient motion when the document is hidden.
- Honor `prefers-reduced-motion`.
- Measure frame consistency on mobile and low-power integrated graphics.

Animation is a feature, not expendable decoration; optimization targets implementation cost.
