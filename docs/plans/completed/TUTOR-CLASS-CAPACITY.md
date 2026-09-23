# Tutor Class Capacity

Status: Completed locally 2026-09-22

## Goal

Let tutors decline group classes or cap new online/offline class requests at a
smaller student count without relying on manual rejection.

## Delivered

- Added checked online/offline maximum class-size fields (1–6), default 6.
- Added tutor-facing capacity selectors; size 1 is presented as Private only.
- Limited discovery pricing maps and pricing previews to supported sizes.
- Capped and explained invitees on the student booking form, including safe
  trimming when the selected modality has a lower capacity.
- Enforced the live tutor limit in group and group-series creation before any
  wallet hold or persistence.
- Kept existing bookings unchanged; capacity applies to new requests only.
- Added migration, unit coverage, and synchronized product/operational docs.
