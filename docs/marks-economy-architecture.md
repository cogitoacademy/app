# Marks Economy, Regulatory Compliance & Engineering Blueprint

> **Document status:** Reference architecture / proposed implementation
> **Version:** 1.0.0
> **Owner:** Cogito Academy Digital Platform Development & Compliance
> **Last updated:** 2026-08-15
> **Source:** `Marks Economy Architecture, Regulatory Compliance & Engineering Blueprint.docx`

This document is the readable Markdown version of the source blueprint. It describes the closed-loop internal currency system, the pricing model, the regulatory structure, and the engineering changes required to implement it.

## Document Control

| Version | Date       | Change                                                                                                                                 |
| ------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 1.0.0   | 2026-08-15 | Converted the source DOCX to Markdown; replaced LaTeX-like expressions with readable text/Unicode and preserved code as fenced blocks. |

## 1. Marks Economy & Package Architecture

The Cogito digital platform uses a closed-loop internal currency called **Marks** to streamline class bookings, gamify student engagement, and optimize unit economics while following Indonesian financial regulatory requirements.

### 1.1 Core Conversion & Structural Mechanism

- **Platform base value:** 1 Mark = IDR 5,000. This is the standard computational unit for class pricing, platform take rates, and conversion calculations.
- **Volume-tiered acquisition pricing:** Students buy Marks packages priced from IDR 6,250 per Mark down to IDR 5,000 per Mark.
- **Platform spread margin:** Class costs and platform fees are calculated at 1 Mark = IDR 5,000. Any premium paid on smaller packages is retained by Cogito Academy as platform spread when the package is purchased.
- **Closed-loop utility:** Marks are prepaid learning credits/digital vouchers. They can only be used internally to book classes or meet access thresholds such as the Knowledge Bank. They have no cash surrender value and are non-refundable and non-transferable.

### 1.2 Student Purchase Packages

| Package       | Marks | Price per Mark |   Total price |  Platform spread margin |
| ------------- | ----: | -------------: | ------------: | ----------------------: |
| Starter Pack  |    50 |      IDR 6,250 |   IDR 312,500 |      IDR 62,500 (20.0%) |
| Learner Pack  |   120 |      IDR 5,750 |   IDR 690,000 |      IDR 90,000 (13.0%) |
| Explorer Pack |   200 |      IDR 5,350 | IDR 1,070,000 |       IDR 70,000 (6.5%) |
| Pioneer Pack  |   400 |      IDR 5,000 | IDR 2,000,000 | IDR 0 (volume baseline) |

## 2. Take Rates, Tutor Compensation & Scenario Analysis

### 2.1 Mathematical Formulas & Constraints

- **Group capacity:** Class size is capped at `N ∈ {1, 2, 3, 4, 5, 6}`.
- **Tutor base-rate adjustment:** Tutors may change their one-student base rate only in IDR 5,000 increments.

Tutor honorarium:

```text
Online:  T_online(N)  = base rate + (N − 1) × IDR 30,000
Offline: T_offline(N) = base rate + (N − 1) × IDR 40,000
```

Default one-student base rates:

- Online: IDR 175,000
- Offline: IDR 225,000

Cogito platform take rate:

```text
Online:  C_online(N)  = IDR 50,000 + (N − 1) × IDR 20,000
Offline: C_offline(N) = IDR 90,000 + (N − 1) × IDR 40,000
```

Class total and per-student calculation:

```text
Total IDR      = tutor honorarium + Cogito take rate
Total Marks    = Total IDR ÷ 5,000
Marks/student  = ceiling(Total Marks ÷ N)
```

### 2.2 Baseline Online Class

Tutor baseline: **IDR 175,000**, increasing by **IDR 30,000 per additional student**.

| Class size | Tutor honorarium |  Cogito fee |   Total IDR | Total Marks | Marks per student | Actual Marks pooled |
| ---------: | ---------------: | ----------: | ----------: | ----------: | ----------------: | ------------------: |
|          1 |      IDR 175,000 |  IDR 50,000 | IDR 225,000 |          45 |                45 |                  45 |
|          2 |      IDR 205,000 |  IDR 70,000 | IDR 275,000 |          55 |                28 |                  56 |
|          3 |      IDR 235,000 |  IDR 90,000 | IDR 325,000 |          65 |                22 |                  66 |
|          4 |      IDR 265,000 | IDR 110,000 | IDR 375,000 |          75 |                19 |                  76 |
|          5 |      IDR 295,000 | IDR 130,000 | IDR 425,000 |          85 |                17 |                  85 |
|          6 |      IDR 325,000 | IDR 150,000 | IDR 475,000 |          95 |                16 |                  96 |

### 2.3 Baseline Offline Class at Cogito Campus

Tutor baseline: **IDR 225,000**, increasing by **IDR 40,000 per additional student**.

| Class size | Tutor honorarium |  Cogito fee |   Total IDR | Total Marks | Marks per student | Actual Marks pooled |
| ---------: | ---------------: | ----------: | ----------: | ----------: | ----------------: | ------------------: |
|          1 |      IDR 225,000 |  IDR 90,000 | IDR 315,000 |          63 |                63 |                  63 |
|          2 |      IDR 265,000 | IDR 130,000 | IDR 395,000 |          79 |                40 |                  80 |
|          3 |      IDR 305,000 | IDR 170,000 | IDR 475,000 |          95 |                32 |                  96 |
|          4 |      IDR 345,000 | IDR 210,000 | IDR 555,000 |         111 |                28 |                 112 |
|          5 |      IDR 385,000 | IDR 250,000 | IDR 635,000 |         127 |                26 |                 130 |
|          6 |      IDR 425,000 | IDR 290,000 | IDR 715,000 |         143 |                24 |                 144 |

### 2.4 Extreme Price-Point Scenarios

**Extreme low end — junior online coach at IDR 75,000 base rate**

- 1 student: IDR 75,000 tutor honorarium + IDR 50,000 Cogito fee = **IDR 125,000 (25 Marks)**.
- 4 students: IDR 165,000 tutor honorarium + IDR 110,000 Cogito fee = **IDR 275,000 (55 Marks total / 14 Marks per student)**.
- Cogito's base operational margin remains protected regardless of how low a tutor prices the service.

**Extreme high end — specialist offline masterclass at IDR 500,000 base rate**

- 1 student: IDR 500,000 tutor honorarium + IDR 90,000 Cogito fee = **IDR 590,000 (118 Marks)**.
- 6 students: IDR 700,000 tutor honorarium + IDR 290,000 Cogito fee = **IDR 990,000 (198 Marks total / 33 Marks per student)**.
- Per-student pricing falls to 33 Marks (approximately IDR 165,000) for a premium offline workshop.

## 3. Regulatory & Legal Risk Analysis

### 3.1 Previous Regulatory Exposure

The source blueprint states that under Bank Indonesia regulations (including PBI No. 22/23/PBI/2020 on Payment Systems and PBI No. 23/6/PBI/2021 on Payment Service Providers/PJP), a system in which users top up internal balances that can later be cashed out by third-party instructors may constitute administration of sources of funds/e-money. The blueprint identifies a Category 1 PJP license, paid-up capital requirements, and compliance certifications as potential requirements for that model.

### 3.2 Closed-Loop Implementation

- **Unilateral closed-loop prepaid utility:** Define Marks in the platform Terms of Service as non-refundable digital access credits/study vouchers. Marks have no cash surrender value and cannot be transferred between users or withdrawn into fiat currency by students.
- **No direct inter-user monetary exchange:** Tutors do not receive, hold, or convert Marks. They work under an independent service/honorarium agreement and are paid in IDR from Cogito's corporate operating account through standard banking/disbursement APIs.
- **Access gating:** For students, a minimum balance such as 35 Marks for the Knowledge Bank functions as a loyalty or membership rule. Authenticated tutors and admins can access the Knowledge Bank without that student wallet threshold. Marks remain owned and spendable by the student.
- **Revenue accounting:** Student top-ups are recorded as deferred revenue for digital services. Tutor payouts are recorded as cost of goods sold (COGS)/instructor fees.

> The regulatory points above are reproduced from the source blueprint and should be validated with qualified Indonesian legal and financial counsel before production launch.

## 4. Engineering Roadmap

The following changes implement the economic and regulatory transition.

### 4.1 Tutor Interface & Database Refactoring

- **Remove Marks conversion from tutor views:** Remove references to Marks, the old IDR 7,000 conversion rate, and coin wallets from tutor dashboards. Tutors should work exclusively in IDR.
- **Use an IDR-denominated base input:** Replace the old Marks-based pricing form with an IDR input constrained to IDR 5,000 increments.

```html
<input type="number" step="5000" min="50000" />
```

- **Show the dynamic honorarium breakdown:** Render exact tutor earnings for class sizes 1–6.

```text
Online earnings  = baseRateIDR + ((N − 1) × 30,000)
Offline earnings = baseRateIDR + ((N − 1) × 40,000)
```

- **Rename payout actions:** Change `Withdraw Marks`/`Cash Out Coins` to `Claim Honorarium`/`Payout Request` in the UI and code.

### 4.2 Student Booking Engine & Frontend Refactoring

When a student selects a class size and tutor, the backend calculates the fees automatically:

```ts
const cogitoTakeRate = isOffline
  ? 90000 + (N - 1) * 40000
  : 50000 + (N - 1) * 20000;

const totalIDR = tutorBaseRate + tutorIncrement + cogitoTakeRate;
const totalMarks = Math.ceil(totalIDR / 5000);
const marksPerStudent = Math.ceil(totalMarks / N);
```

Students should see only the final **Marks per Student** required to join the session, with a clear class-size indicator: `N = 1 … 6`.

Knowledge Bank gating for students:

```ts
student.wallet.marks >= 35;
```

Authenticated tutors and admins bypass the student wallet threshold.

The UI should state:

> For students, Knowledge Bank is unlocked while the account holds at least 35 Marks. Tutors and admins can access it without a wallet threshold. No Marks are deducted to view it.

### 4.3 System Architecture Summary

| Domain            | Old implementation                                                         | New mandated implementation                                                        |
| ----------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Tutor dashboard   | Tutor sets price in Marks with IDR 7,000 cash-out.                         | Tutor sets price in IDR in IDR 5,000 increments and receives an IDR honorarium.    |
| Student dashboard | Students purchase Marks at variable high tiers (IDR 8,500–7,250).          | Students purchase closed-loop Marks at IDR 6,250–5,000 and spend them on bookings. |
| Financial flow    | Peer-to-peer coin transfer, creating potential e-money licensing exposure. | Closed-loop voucher redemption plus direct contractor disbursement.                |
