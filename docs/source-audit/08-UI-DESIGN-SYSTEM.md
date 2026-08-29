# 08 — UI design system

## Visual DNA verified in source

The source already centralizes a meaningful amount of visual identity:

- light/dark OKLCH color tokens;
- glass background/border/shadow tokens;
- mesh/glow colors;
- large rounded radii;
- responsive safe-area helpers;
- `GlassCard`, `GlassButton`, `GlassInput`, `GlassNav`-style primitives;
- animated background;
- animated counters;
- page transitions;
- shimmer skeletons;
- loading/error/empty states;
- Framer Motion interactions.

## Valuable source choices to retain

- Feature-level lazy loading.
- A glass mode / blur-intensity concept.
- Solid/translucent large surfaces with blur reserved for smaller premium surfaces.
- Safe-area awareness on mobile.
- Reduced-motion support must be complete in rewrite.

## Rewrite design token groups

`background`, `foreground`, `card`, `glass-bg`, `glass-border`, `glass-shadow`, `primary`, `secondary`, `muted`, `destructive`, `success`, `warning`, `info`, gradients, mesh colors, glow colors, radii, spacing, typography, elevation, blur levels and motion timings.

The rewrite must not become a generic flat admin dashboard.
