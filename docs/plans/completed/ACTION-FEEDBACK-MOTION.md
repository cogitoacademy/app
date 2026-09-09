# Action Feedback Motion

Status: Completed locally 2026-09-09

## Goal

Make meaningful milestones feel responsive and rewarding without turning the
product into a distracting or animation-heavy interface.

## Delivered

- A shared, route-stable centered success moment for submitted bookings,
  student achievements, tutor profiles, and confirmed Marks top-ups.
- Sparse one-shot particles and a check animation made with theme-token CSS;
  no GIF or runtime animation dependency.
- A short staggered entrance for tutor onboarding sections.
- Payment confirmation tracking so top-up feedback appears only after the
  wallet provider reports a paid/settled purchase.
- A dismissible success stage with rings, orbit, icon motion, sparse particles,
  staggered copy, and an explicit Continue action so the experience is more
  intentional than a toast.
- Polite assistive-technology announcement, manual dismissal, automatic
  dismissal, and a static `prefers-reduced-motion` experience.

## Verification

- `bun run --filter web check-types`
- `bun run --filter web build`
