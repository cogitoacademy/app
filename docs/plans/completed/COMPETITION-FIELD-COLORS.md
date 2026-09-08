# Competition Field Colors

**Status:** Completed locally 2026-09-08

## Goal

Bring the canonical Cogito Academy field colors into Cogito App as reusable, accessible background/foreground token pairs.

## Completed

- Extracted all seven `coreCategory` colors from `cogito-acad` without importing its component or Tailwind implementation.
- Converted the source hex values to equivalent OKLCH theme values in accordance with Selia's token system.
- Added foreground partners with readable contrast: white for the darker Olympiad and Debate colors, and a fixed dark neutral for the brighter MUN, WSC, Research & Essay, Business Plan, and Speech colors.
- Added reusable `soft` and `solid` class mappings with a Research & Essay fallback.
- Migrated Competition Calendar field styling from generic status colors to the new field tokens.
- Confirmed that the change is presentation-only and requires no API, data, or operational migration.
