### Task C7: G19 — Pricing extra-take rule (PRD FR-05, FR-19, DL-22, TC-06)

**Files:**

- Modify: `packages/api/src/shared/constants.ts` (add baseline tables)
- Modify: `packages/api/src/modules/pricing/pricing.service.ts` (rewrite `computeSplit`)
- Modify: `packages/api/src/modules/booking/index.ts` (`BookingPricingPort`)
- Modify: `packages/api/src/modules/tutor/index.ts` (`TutorPricingPort`)
- Modify: `packages/api/src/modules/booking/booking.service.ts` (3 call sites: 273, 694, 1069 + hold/originalMarks at 327/748/1125/1147)
- Modify: `packages/db/src/schema/booking.ts` (`priceSnapshot` jsonb type: add fields)
- Modify: `packages/api/src/tests/unit/pricing.service.test.ts` (rewrite computeSplit tests vs PRD TC-06)

**Interfaces:**

- Produces:
  - `computeSplit(modality: Modality, tutorPricePerStudent: number, confirmedHeadcount: GroupSize): PriceSnapshot`
  - `PriceSnapshot` extends to: `{ perStudent, baseline, tutorShare, cogitoTake, baselineCogitoTake, baselineTutorShare, extraTotal, cogitoExtraTake, tutorExtraShare }`

**PRD data (source of truth, `docs/prd.tex:768-816`):**

| Modality | Size | Floor/student | Tutor | Cogito |
| -------- | ---- | ------------- | ----- | ------ |
| online   | 1    | 42            | 30    | 12     |
| online   | 2    | 35            | 54    | 16     |
| online   | 3    | 28            | 64    | 20     |
| online   | 4    | 24            | 74    | 22     |
| online   | 5    | 21            | 81    | 24     |
| online   | 6    | 19            | 88    | 26     |
| offline  | 1    | 50            | 35    | 15     |
| offline  | 2    | 45            | 70    | 20     |
| offline  | 3    | 40            | 95    | 25     |
| offline  | 4    | 35            | 115   | 25     |
| offline  | 5    | 30            | 120   | 30     |
| offline  | 6    | 27            | 127   | 35     |

Rule: `extraTotal = tutorTotal − baselineTotal`; `cogitoExtraTake = floor(extraTotal / 5)`; `tutorExtraShare = extraTotal − cogitoExtraTake`; final Cogito = baseline Cogito + cogitoExtraTake; final tutor = baseline tutor + tutorExtraShare. `EXTRA_TAKE_DIVISOR = 5` already in constants.

- [ ] **Step 1:** Add baseline tables to `packages/api/src/shared/constants.ts`:

```ts
export const ONLINE_BASELINE_SPLIT: Record<
  number,
  { tutor: number; cogito: number }
> = {
  1: { tutor: 30, cogito: 12 },
  2: { tutor: 54, cogito: 16 },
  3: { tutor: 64, cogito: 20 },
  4: { tutor: 74, cogito: 22 },
  5: { tutor: 81, cogito: 24 },
  6: { tutor: 88, cogito: 26 },
};

export const OFFLINE_BASELINE_SPLIT: Record<
  number,
  { tutor: number; cogito: number }
> = {
  1: { tutor: 35, cogito: 15 },
  2: { tutor: 70, cogito: 20 },
  3: { tutor: 95, cogito: 25 },
  4: { tutor: 115, cogito: 25 },
  5: { tutor: 120, cogito: 30 },
  6: { tutor: 127, cogito: 35 },
};
```

- [ ] **Step 2:** Rewrite `computeSplit` in `pricing.service.ts`:

```ts
import {
  ONLINE_BASELINE_SPLIT,
  OFFLINE_BASELINE_SPLIT,
  EXTRA_TAKE_DIVISOR,
} from "../../shared/constants";

export interface PriceSnapshot {
  perStudent: number;
  baseline: number;
  tutorShare: number;
  cogitoTake: number;
  baselineCogitoTake: number;
  baselineTutorShare: number;
  extraTotal: number;
  cogitoExtraTake: number;
  tutorExtraShare: number;
}

function getBaselineSplit(modality: Modality, size: GroupSize) {
  const table =
    modality === MODALITY.OFFLINE
      ? OFFLINE_BASELINE_SPLIT
      : ONLINE_BASELINE_SPLIT;
  return table[size];
}

function computeSplit(
  modality: Modality,
  tutorPricePerStudent: number,
  confirmedHeadcount: GroupSize,
): PriceSnapshot {
  const perStudent = Math.floor(tutorPricePerStudent);
  const tutorTotal = perStudent * confirmedHeadcount;
  const baseline = getBaselineSplit(modality, confirmedHeadcount);
  const baselineTotal = baseline.tutor + baseline.cogito;
  const extraTotal = tutorTotal - baselineTotal;
  const cogitoExtraTake =
    extraTotal > 0 ? Math.floor(extraTotal / EXTRA_TAKE_DIVISOR) : 0;
  const tutorExtraShare = extraTotal - cogitoExtraTake;

  const baselineCogitoTake = baseline.cogito;
  const baselineTutorShare = baseline.tutor;
  const cogitoTake = baselineCogitoTake + cogitoExtraTake;
  const tutorShare = baselineTutorShare + tutorExtraShare;

  return {
    perStudent,
    baseline: baselineTotal,
    tutorShare,
    cogitoTake,
    baselineCogitoTake,
    baselineTutorShare,
    extraTotal,
    cogitoExtraTake,
    tutorExtraShare,
  };
}
```

Update `PricingPort`:

```ts
export interface PricingPort {
  validatePrices(
    prices: Record<string, number>,
    modality: Modality,
  ): string | null;
  computeSplit(
    modality: Modality,
    tutorPricePerStudent: number,
    confirmedHeadcount: GroupSize,
  ): PriceSnapshot;
}
```

> `COGITO_TAKE_RATE` is no longer used by `computeSplit`; remove it from the import. Do **not** delete the constant (used by G16/payout later); keep it in constants.

- [ ] **Step 3:** Update ports in `booking/index.ts` and `tutor/index.ts` to the new signature:

```ts
computeSplit(
  modality: Modality,
  tutorPricePerStudent: number,
  confirmedHeadcount: GroupSize,
): PriceSnapshot;
```

(both `booking/index.ts:32` and `tutor/index.ts:21`).

- [ ] **Step 4:** Update the 3 call sites in `booking.service.ts`:

Solo (line 273):

```ts
const priceSnapshot = pricing.computeSplit(
  modality,
  (profile.prices?.["1"] ?? DEFAULT_SOLO_PRICE) as number,
  1,
);
```

Group (line 694):

```ts
const priceSnapshot = pricing.computeSplit(
  modality,
  (profile.prices?.[String(size)] ?? DEFAULT_SOLO_PRICE) as number,
  size as 1 | 2 | 3 | 4 | 5 | 6,
);
```

Series (line 1069):

```ts
const priceSnapshot = pricing.computeSplit(modality, pricePerStudent, 1);
```

> `modality` is already in scope in each function. **Hold/originalMarks decision:** `originalMarks`/`holdAmount` must equal the actual charge `tutorTotal` (`priceSnapshot.perStudent × headcount`), NOT `baseline`. Update lines 327/748/1125/1147: set `originalMarks: priceSnapshot.perStudent * headcount` and `holdAmount: <same>`. Solo headcount 1; group uses `size`; series per-session = `perStudent`.

- [ ] **Step 5:** Extend the DB schema type for `priceSnapshot` (`packages/db/src/schema/booking.ts:68` and `:258`):

```ts
priceSnapshot: jsonb("price_snapshot").$type<{
  perStudent: number;
  baseline: number;
  tutorShare: number;
  cogitoTake: number;
  baselineCogitoTake: number;
  baselineTutorShare: number;
  extraTotal: number;
  cogitoExtraTake: number;
  tutorExtraShare: number;
}>(),
```

> jsonb is schemaless in Postgres — no migration needed. Verify with `bun run db:generate` (should produce no new migration).

- [ ] **Step 6:** Rewrite `computeSplit` tests vs PRD TC-06 in `pricing.service.test.ts`:

```ts
describe("computeSplit (extra-take rule)", () => {
  const pricing = createPricingService();

  test("online class for 1 at floor (42) → tutor 30, Cogito 12", () => {
    const r = pricing.computeSplit("online", 42, 1);
    expect(r.tutorShare).toBe(30);
    expect(r.cogitoTake).toBe(12);
    expect(r.extraTotal).toBe(0);
    expect(r.cogitoExtraTake).toBe(0);
  });

  test("online class for 1 at 50 → tutor 37, Cogito 13 (extra 8, Cogito extra 1)", () => {
    const r = pricing.computeSplit("online", 50, 1);
    expect(r.extraTotal).toBe(8);
    expect(r.cogitoExtraTake).toBe(1);
    expect(r.tutorExtraShare).toBe(7);
    expect(r.tutorShare).toBe(37);
    expect(r.cogitoTake).toBe(13);
  });

  test("online class for 3 at floor (28) → tutor 64, Cogito 20", () => {
    const r = pricing.computeSplit("online", 28, 3);
    expect(r.tutorShare).toBe(64);
    expect(r.cogitoTake).toBe(20);
  });

  test("online class for 3 at 32 → tutor 74, Cogito 22 (extra 12, Cogito extra 2)", () => {
    const r = pricing.computeSplit("online", 32, 3);
    expect(r.extraTotal).toBe(12);
    expect(r.cogitoExtraTake).toBe(2);
    expect(r.tutorShare).toBe(74);
    expect(r.cogitoTake).toBe(22);
  });

  test("offline class for 2 at floor (45) → tutor 70, Cogito 20", () => {
    const r = pricing.computeSplit("offline", 45, 2);
    expect(r.tutorShare).toBe(70);
    expect(r.cogitoTake).toBe(20);
  });

  test("extra total of 4 → Cogito extra 0, all to tutor", () => {
    const r = pricing.computeSplit("online", 46, 1); // baseline 42, extra 4
    expect(r.cogitoExtraTake).toBe(0);
    expect(r.tutorShare).toBe(34);
  });

  test("extra total of 5 → Cogito extra 1, 4 to tutor", () => {
    const r = pricing.computeSplit("online", 47, 1); // baseline 42, extra 5
    expect(r.cogitoExtraTake).toBe(1);
    expect(r.tutorShare).toBe(36);
  });
});
```

- [ ] **Step 7:** Update mock-based tests that stub `computeSplit(totalMarks, groupSize)` — search `packages/api/src/tests` for `computeSplit` mocks (`booking.service.test.ts`, `tutor.service.test.ts`) and update to the 3-arg signature.

- [ ] **Step 8:** Verify.

Run: `bun test --env-file apps/server/.env packages/api/src/tests/unit/pricing.service.test.ts packages/api/src/tests/unit/booking.service.test.ts`
Run: `bun run check-types`
Run: `bun run test:coverage`
Expected: PASS; coverage gates hold (add tests if coverage drops).

- [ ] **Step 9: Commit**

```bash
git add packages/api/src packages/db/src/schema/booking.ts
git commit -m "fix(pricing): implement PRD extra-take split rule (G19)"
```

---

## PR D — Test Realignment (mock-heavy remediation)
