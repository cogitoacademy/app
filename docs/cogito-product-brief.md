# Cogito Product Brief

## Web product, user flows, competition taxonomy, and tutor acquisition context

This document is a product dossier for Cogito / Cogito Academy. It describes the current web product, the roles that use it, the end-to-end journeys, the competition taxonomy, the booking and payment rules, and the implications for tutor acquisition.

It is intentionally written as product information, not as a slide-deck outline and not as a master prompt. It can be used as source context by a client, designer, copywriter, deck-generation tool, or internal product team.

Product facts should be read with the status labels below:

- **Current product behavior:** represented in the web application, API, database, or current product documentation.
- **Configurable value:** can be changed by an authorized admin or by the tutor within platform limits.
- **Reference economics:** current configuration or architecture values that should be reconfirmed before public marketing.
- **Client input:** information that is not present in the repository and must be supplied before publication.

---

## 1. Product at a glance

| Item                 | Product information                                                                                                     |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Product name         | Cogito / Cogito Academy                                                                                                 |
| Primary market       | Indonesia                                                                                                               |
| Product type         | Two-sided academic competition tutoring and coaching platform                                                           |
| Primary users        | Students, tutors, and administrators                                                                                    |
| Main session         | One 90-minute tutoring or coaching session                                                                              |
| Session formats      | Solo, group of 2–6 students, one-time, or series of 2–4 sessions                                                        |
| Modalities           | Online and offline, subject to tutor settings and room availability                                                     |
| Student payment unit | Marks, a closed-loop in-platform learning credit                                                                        |
| Tutor compensation   | IDR honorarium; tutors do not receive or convert student Marks                                                          |
| Tutor discovery      | Published tutor profiles, competition categories, specializations, modality, pricing, and availability                  |
| Operational model    | Booking request, tutor review, student or participant confirmation, session delivery, completion, and payout processing |

### What Cogito does

Cogito connects students seeking academic competition coaching with tutors who have relevant expertise. The product handles the operational layer around that relationship:

1. inviting and onboarding tutors;
2. collecting tutor credentials, achievements, experience, specializations, teaching modality, pricing, and availability;
3. reviewing and publishing tutor profiles;
4. helping students discover a relevant tutor;
5. collecting student Marks and placing them on hold for a booking;
6. coordinating tutor acceptance, participant confirmation, rescheduling, online meetings, and offline rooms;
7. recording attendance and session completion;
8. calculating the tutor's IDR honorarium and supporting payout operations.

### What Cogito does not promise

The current product information does not support promises of guaranteed student volume, guaranteed income, instant approval, zero fees, automatic full classes, instant payout, exclusivity-free participation, public tutor ratings, or cash conversion of Marks.

The product is best described as a structured, reviewed, and bookable marketplace and operations system for specialist academic coaching.

### Core product loop

```text
Tutor expertise
  → reviewed tutor profile
  → competition/specialization discovery
  → published availability
  → student booking request
  → tutor review and confirmation
  → online or offline session
  → completion and attendance
  → IDR tutor honorarium processing
```

---

## 2. Product model and roles

### Student

The student is the learner and booking customer. A student can:

- create and verify an account;
- maintain a learning profile and relevant context;
- purchase and manage Marks;
- browse and filter published tutors;
- inspect tutor credentials, achievements, experience, specializations, modality, availability, and student-facing pricing;
- choose a session topic, modality, date, and start time;
- request a solo, group, or recurring series booking;
- invite registered students to a group booking;
- write Session Notes for tutor preparation;
- accept, reject, or reconfirm booking and reschedule proposals where applicable;
- attend an online Google Meet session or an offline session in an assigned room;
- view booking history, wallet ledger, notifications, achievements, competition events, and Knowledge Bank resources;
- report booking, lateness, no-show, delivery, or other issues to support.

### Tutor

The tutor is an invited specialist who provides academic coaching. A tutor can:

- claim an invitation using the invited email account;
- create and maintain a tutor profile;
- provide education, achievements, competition achievements, experience, proof links, and a short bio;
- select up to seven active competition specializations;
- choose online, offline, or both modalities;
- set an IDR base honorarium within the platform constraints;
- publish recurring weekly availability and date-specific overrides;
- review incoming booking requests;
- accept, decline, or propose another schedule;
- view participants, topic, Session Notes, modality, schedule, and Marks-related booking information needed for operations;
- teach the session through Google Meet, a manually supplied online link, or an assigned offline room;
- mark tutor attendance and participant no-shows when allowed;
- add or review Session Notes;
- complete the session;
- see completed sessions and unpaid IDR honorarium awaiting payout processing;
- maintain private bank-account information for payout.

### Admin

The admin operates the marketplace and manages trust, exceptions, and economics. An admin can:

- invite, resend, revoke, and inspect tutor invitations;
- review, request changes to, approve, publish, unpublish, suspend, and moderate tutor profiles;
- review pending profile edits and normalize relevant profile copy;
- manage competition taxonomy and profile visibility;
- manage packages, Marks economics, take-rate configuration, and operational settings;
- inspect all bookings, participant states, booking history, holds, exceptions, and audit data;
- manage offline rooms and room conflicts;
- respond to meeting, room, lateness, no-show, cancellation, and reschedule exceptions;
- moderate student achievements;
- provide support and make auditable booking or Marks corrections;
- record tutor payout operations and see unpaid honorarium reports;
- view operational and business analytics for configured periods.

---

## 3. Web information architecture

The web application uses role-aware navigation. The same authenticated route may render different data and actions depending on whether the user is a student, tutor, or admin.

### Public and authentication routes

| Route            | Purpose                                 |
| ---------------- | --------------------------------------- |
| /                | Product landing or entry page           |
| /login           | Email/password and Google sign-in entry |
| /verify-email    | Email verification flow                 |
| /forgot-password | Password-reset request                  |
| /reset-password  | Password-reset completion               |
| /invite          | Tutor invitation claim entry            |
| /auth/callback   | Frontend OAuth callback                 |

### Shared authenticated routes

| Route                | Purpose                                   |
| -------------------- | ----------------------------------------- |
| /dashboard           | Role-aware dashboard                      |
| /bookings            | Booking list for the current role         |
| /bookings/:bookingId | Booking detail and available actions      |
| /guide               | How Cogito Works role-aware journey guide |
| /calendar            | Competition Calendar                      |
| /knowledge-bank      | Knowledge Bank resource library           |
| /notifications       | In-app notifications                      |
| /profile             | Current user's profile or tutor profile   |

### Student routes

| Route                 | Purpose                                                                     |
| --------------------- | --------------------------------------------------------------------------- |
| /tutors               | Search and filter published tutors                                          |
| /tutors/:tutorId/book | Select specialization, modality, date, format, and booking details          |
| /balance              | Marks balance, package purchase, wallet ledger, and eligibility information |
| /achievements         | Student achievement submission and status                                   |

Student navigation:

```text
Dashboard → Tutors → My Bookings → Balance → Achievements
```

### Tutor routes

| Route         | Purpose                                                                             |
| ------------- | ----------------------------------------------------------------------------------- |
| /dashboard    | Tutor setup, review requests, next sessions, profile status, and honorarium summary |
| /bookings     | Tutor booking list and review actions                                               |
| /availability | Weekly availability, date overrides, modality, and conflict management              |
| /profile      | Tutor profile, specializations, pricing, payout, and onboarding edits               |
| /onboarding   | Compatibility entry or redirect for tutor onboarding                                |

Tutor navigation:

```text
Dashboard → Bookings → Availability → Tutor Profile
```

### Admin routes

| Route                                 | Purpose                                                          |
| ------------------------------------- | ---------------------------------------------------------------- |
| /admin                                | Admin dashboard and business insights                            |
| /admin-operations                     | Operational queues and exception handling                        |
| /admin-operations/bookings/:bookingId | Admin booking detail and overrides                               |
| /bookings                             | Admin-visible all-bookings view                                  |
| /admin-tutors                         | Invitations, tutor profiles, review, publication, and moderation |
| /admin-tutor-payouts                  | Operational tutor honorarium review and payout recording         |
| /admin-economy                        | Marks packages and economic configuration                        |
| /admin-achievements                   | Student achievement moderation                                   |

Admin navigation:

```text
Dashboard → Operations → Bookings → Tutors → Tutor payouts → Economy → Achievements
```

### Shared resources

The application exposes three cross-role resources:

- **How Cogito Works:** role-aware product guide with timing rules and exception branches.
- **Competition Calendar:** published competition events, independent of tutor availability.
- **Knowledge Bank:** learning resources with a student wallet eligibility threshold; tutors and admins bypass that student threshold.

The older /tutor-bookings route is a compatibility redirect to /bookings, not a separate tutor product surface.

---

## 4. Competition taxonomy

### Is there information about competition types and sub-classifications?

Yes. The active web taxonomy contains **7 parent competition categories and 33 selectable specializations**.

For the example in the question:

```text
Model United Nations → Writing
```

This is the specialization label that appears as **Writing** under the **Model United Nations** parent category. Product copy can call it “MUN Writing” when clarity is useful, but the canonical product hierarchy is the parent category plus the child specialization.

### Active taxonomy

| Parent category      | Active specializations                                                                                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Model United Nations | Research; Writing; Speech; Negotiation                                                                                                                                   |
| World Scholar’s Cup  | Writing; Debate; Subjects                                                                                                                                                |
| Essay & Writing      | Academic Essay; Creative Writing; Scientific Research; College Application Essay; Journalistic Writing                                                                   |
| Debate               | British Parliamentary; Asian Parliamentary; World Schools (WSDC); Bahasa Indonesia (LDBI)                                                                                |
| Business             | Business Model Canvas; Business Plan; Business Case                                                                                                                      |
| Olympiad             | Mathematics (SMP); Natural Sciences (SMP); Social Sciences (SMP); Mathematics; Physics; Chemistry; Biology; Informatics; Astronomy; Earth Sciences; Economics; Geography |
| Public Speaking      | Persuasive Speech; Storytelling                                                                                                                                          |

### Taxonomy behavior in the web product

- Tutor onboarding shows parent category cards and child specialization checkboxes.
- A tutor must select at least one active specialization before submitting the profile for review.
- A tutor can select no more than seven active specializations.
- Students can filter tutor discovery by parent category, child specialization, and modality.
- Search normalizes text and can search tutor names or specialization labels.
- An empty category or specialization filter means all available values.
- Published tutor cards and profile drawers show specialization badges.
- The interface can display a child label without repeating the parent label when the context already makes the parent clear.
- A new booking selects one active specialization offered by the selected tutor.
- The server stores a snapshot of the selected category and specialization on the booking, so the session topic remains stable even if the tutor later changes their profile.
- Calendar and Google Meet metadata use the stored topic snapshot.
- Older source-informed specialization rows were archived in the database rather than deleted. Existing legacy profile references may therefore remain for compatibility, but legacy values are not the normal new-selection path.

### Examples of tutor positioning by specialization

These are product examples, not claims that every specialization currently has available tutors:

- MUN Research, Writing, Speech, or Negotiation;
- World Scholar’s Cup Writing, Debate, or Subjects;
- British Parliamentary or Asian Parliamentary debate;
- WSDC or Bahasa Indonesia debate;
- Academic Essay or Scientific Research;
- Business Model Canvas, Business Plan, or Business Case;
- Mathematics, Physics, Chemistry, Biology, Informatics, Astronomy, Earth Sciences, Economics, or Geography olympiad;
- Persuasive Speech or Storytelling.

---

## 5. Tutor product and end-to-end tutor journey

### 5.1 Invitation and account claim

1. An admin creates a tutor invitation for a target email address.
2. The invitation is sent with a single-use claim link.
3. The invitation expires after 7 days.
4. The claim flow reminds the recipient which email address was invited.
5. The tutor signs in or creates an account using the invited email.
6. Email/password and Google sign-in can lead through the same claim path.
7. Email matching is case-insensitive.
8. Claiming consumes the invitation and creates or attaches the tutor profile onboarding record.
9. Claiming an invitation does not publish the tutor automatically.

### 5.2 Tutor profile information

The tutor profile has a review-facing and public-facing layer.

#### Public or reviewable profile fields

- canonical name;
- profile image;
- short bio;
- education;
- structured competition achievements;
- other achievements or credentials;
- teaching, work, mentoring, or relevant experience;
- proof links;
- active competition specializations;
- teaching modality;
- IDR base honorarium;
- student-facing pricing for class sizes 1 through 6.

Current validation and capacity rules include:

- short bio: no more than 50 whitespace-delimited words and no more than 2,000 characters;
- education: up to 2 entries;
- structured achievements: up to 5 entries;
- experience: up to 5 entries;
- competition specializations: at least 1 and no more than 7;
- proof links: bounded HTTP(S) URLs;
- the product guidance recommends one Google Drive folder for achievement and experience evidence with “Anyone with the link can view”.

#### Private payout information

The tutor supplies payout details that are required for payout processing but are not public tutor-profile information:

- bank name;
- bank account number;
- account holder name;
- account-opening city;
- account ownership, such as self or trusted person;
- acknowledgment of the bank-transfer disclaimer.

### 5.3 Profile and publication states

The tutor-facing experience separates saving a draft from submitting for review.

```text
Draft
  → Pending review
  → Approved but unpublished
  → Published
```

Other paths include:

- **Changes requested:** the admin sends the profile back for correction;
- **Suspended:** a previously published profile is taken out of discovery;
- **Published edit pending review:** trust-sensitive edits to a published profile wait for admin approval;
- **Unpublished:** a profile is no longer shown to students but may remain in admin records.

The important product implication is that a tutor can prepare and save a profile, but public discoverability depends on review and publication. Approval is not instant or automatic.

### 5.4 Pricing and modality

Tutors work in IDR, not Marks.

- The tutor sets a one-student base honorarium.
- The input uses IDR 5,000 increments.
- The current validation floor is IDR 50,000.
- Online class honorarium adds IDR 30,000 for each additional student.
- Offline class honorarium adds IDR 40,000 for each additional student.
- The UI previews the honorarium for class sizes 1 through 6.
- A published rate change applies to future bookings.
- Existing bookings preserve their original price snapshot for payout.

The student-facing UI shows the final Marks requirement. It should not be described as the tutor receiving Marks.

### 5.5 Availability

The tutor can configure:

- recurring weekly availability;
- date-specific overrides;
- one or more time ranges;
- online, offline, or both modalities;
- future dates that do not overlap;
- removal of a previously published availability window.

Availability is a bookable window, not a pre-created 90-minute appointment. A student chooses a concrete start time whose complete 90-minute session fits inside the active window.

Date-specific overrides take priority over the recurring weekly schedule. The availability page is responsible for future-window validation, conflict checks, modality selection, and clear removal behavior.

### 5.6 Tutor dashboard

The tutor dashboard can show:

- profile status and setup progress;
- review requests that need action;
- upcoming sessions;
- next lesson;
- completed sessions;
- unpaid honorarium;
- availability coverage;
- estimated next payout after the applicable transfer fee;
- booking-list tabs such as Needs action, Upcoming, Series, History, and All.

The dashboard is an operational workspace, not an income guarantee.

### 5.7 Tutor review of a booking

For an incoming request, the tutor can review:

- student or participant information available to the tutor;
- competition category and specialization;
- Session Notes;
- modality;
- proposed start and end time;
- solo, group, or series format;
- current participants and confirmation state;
- the booking's student-side Marks requirement;
- applicable schedule and response deadline.

The tutor can:

- accept the request;
- decline with a reason;
- propose or counter-propose another time;
- set or supply a manual online meeting link where the recovery flow requires it;
- review or update permitted session information.

Tutor response and participant confirmation windows are generally 12 hours, capped at the session start when the session is sooner.

### 5.8 Teaching and completion

#### Online

- The system attempts to create a Google Meet and calendar event for a confirmed online booking.
- If provider creation fails, the booking remains in its confirmed operational path while retries occur.
- Meeting creation retries are scheduled every 5 minutes for up to 3 attempts.
- A tutor or admin can use a manual link recovery path where supported.
- A failed meeting provider call does not by itself mean the session was delivered.

#### Offline

- The booking can wait for admin room approval.
- The admin assigns or relocates a suitable room.
- A room conflict can lead to an operational exception or cancellation if no room can be provided.
- The room assignment and calendar metadata are synchronized with the booking.

#### Session completion

- The session duration is exactly 90 minutes.
- Tutor attendance can be marked within the configured attendance window around the start time.
- Participant no-show handling becomes available after 15 minutes from session start.
- Unresolved tutor lateness is surfaced to admin review; it is not silently converted into a normal completion.
- The tutor completes the session after delivery.
- Completed session data becomes the basis for tutor honorarium and payout reporting.

### 5.9 Tutor payout

Tutor payout is IDR-denominated and tied to completed bookings.

The tutor payout view can show:

- completed sessions;
- gross honorarium;
- transfer fee;
- net honorarium;
- unpaid amount since the latest cutoff;
- bank information summary;
- paid status and paid timestamp after admin recording.

Current transfer-fee logic is exact-name based:

- bank name exactly equal to BCA has no transfer fee;
- other bank names incur a Rp2,500 transfer fee.

Therefore BCA Syariah, blu, and other names are not the same as the exact BCA case unless the operational policy is changed.

The API records the payout and audit trail; the current product behavior does not claim that the application directly executes the bank transfer. A weekly operational cadence can be used in business communication only after the payout cutoff, responsible team, and transfer process are confirmed by the client.

### 5.10 Tutor agreement and trust-sensitive wording

The current tutor Terms of Service component contains important commercial and restriction language, including:

- an independent service and honorarium relationship;
- an active-partnership routing expectation for competition-coaching requests received through external networks;
- restrictions concerning directly competing tutoring businesses;
- a 12-month post-termination buffer in the displayed terms;
- potential consequences for violations.

This language is material to tutor acquisition. It should not be hidden behind a persuasive acquisition narrative. Before any external deck or recruitment page is published, the client and qualified legal counsel should confirm whether the current displayed terms are final, enforceable, and intended to be summarized in recruitment material.

---

## 6. Student product and end-to-end student journey

### 6.1 Account and profile

The student verifies an email account and can use Google sign-in where configured. The profile stores the information needed for learning context, booking, participant identity, and safe operations. Only the information needed for a given role and action should be exposed to other users.

### 6.2 Marks wallet

Marks are the student-side payment and access unit.

The Balance page can show:

- total balance;
- available balance;
- held balance;
- ledger history;
- package purchase options;
- payment status;
- Knowledge Bank eligibility;
- links to find and book tutors.

Ledger actions include credit, hold, release, deduct, and compensate or correct.

Purchased Marks do not expire in the current product guide. They are not a tutor payout instrument, are not transferable between users, and cannot be cashed out by students.

### 6.3 Purchasing Marks

The basic purchase flow is:

1. Student selects a package.
2. The application creates a payment intent.
3. The student completes the hosted payment or QRIS flow.
4. Marks are credited after the payment provider confirms the successful purchase.
5. The wallet and ledger update.

Payment-provider and production settlement wording should be verified before it is used in public marketing. A payment sandbox or test configuration is not a user-facing promise.

### 6.4 Tutor discovery

The student can browse published tutors and search by:

- tutor name;
- parent competition category;
- specialization;
- modality.

A tutor card or detail drawer can show:

- photo;
- name and short bio;
- education;
- achievements;
- experience;
- specialization badges;
- available modality;
- starting or class-size pricing in Marks;
- future availability;
- a booking action.

Private tutor payout information is not exposed to students. Only published profiles are included in student discovery.

### 6.5 Booking request

The booking form captures:

- selected tutor;
- one active specialization offered by that tutor;
- session modality;
- concrete start date and time;
- Session Notes, up to 2,000 characters;
- one-time or series format;
- solo or group format;
- registered invitees for a group booking;
- price and Marks-hold preview;
- the student's available balance.

Rules:

- one selected session means one-time;
- two to four selected sessions means a series;
- group capacity is 2 through 6 students;
- an inviter can invite registered students, up to the target group size;
- group-series participants commit to the full series once confirmed and cannot opt out of individual sessions under the normal rule;
- every session lasts exactly 90 minutes;
- the selected specialization is snapshotted into the booking;
- active bookings cannot overlap for the same relevant participant or tutor.

### 6.6 Marks hold and booking lifecycle

The normal lifecycle is:

```text
Student submits request
  → Marks are held
  → Awaiting tutor review
  → Tutor accepts
  → Participant confirmation or reconfirmation
  → Confirmed
  → Meeting or room scheduling
  → Scheduled
  → Session delivered
  → Completed
  → Held Marks are deducted
```

Other outcomes include:

- declined;
- cancelled before the relevant deadline;
- late-cancelled with the applicable Marks consequence;
- expired with hold release where the lifecycle permits;
- no-show;
- reschedule proposed;
- awaiting offline room approval;
- confirmed with online meeting creation retry;
- admin correction or refund/reconciliation state.

Marks are held before tutor acceptance or participant completion so that the booking has a financial commitment. The final deduction or release depends on the lifecycle outcome.

### 6.7 Timing rules

Important current timing rules include:

- tutor response window: generally 12 hours, capped at session start;
- participant confirmation and reconfirmation window: generally 12 hours, capped at session start;
- offline room approval window: generally 12 hours, capped at session start;
- reschedule proposal expiration: 24 hours;
- student self-service cancellation or reschedule: before H-2, meaning at least 2 hours before the relevant start;
- post-H-2 issues: support or admin review rather than normal student self-service cancellation;
- participant no-show: evaluated after 15 minutes from session start;
- meeting retry interval: 5 minutes, up to 3 attempts.

The product must explain that H-2 is a cutoff and not a guarantee that a late cancellation will be refunded.

### 6.8 Reschedule negotiation

The tutor or booking proposer can propose a different time in eligible pre-terminal states.

- A new proposal supersedes the prior pending proposal.
- Series sessions are negotiated independently by session.
- The proposal creator is automatically accepted.
- The tutor and every active confirmed student must accept.
- Any voter may reject.
- The original schedule remains authoritative until unanimous acceptance.
- A rejected proposal preserves the original schedule.
- A proposal expires after 24 hours.
- The new slot must still satisfy overlap and H-2 rules applicable to the actor and booking.

### 6.9 Online and offline branches

#### Online branch

```text
Confirmed online booking
  → Google Meet and calendar creation attempt
  → Scheduled when meeting metadata is ready
  → Retry or manual-link recovery if provider creation fails
  → Session
```

#### Offline branch

```text
Confirmed offline booking
  → Awaiting admin room approval
  → Room assigned or relocated
  → Scheduled
  → Session
```

If a room cannot be provided, admin operations may cancel the booking and apply the documented Marks handling. An offline booking is not proof that a physical room is already secured until the room state is confirmed.

### 6.10 Group sessions and series

Group sessions distribute the total Marks requirement among participants. Because each student's per-person price is rounded up to whole Marks, the pooled student-side Marks can be slightly higher than the computational total.

For a group series:

- participants accept the full series;
- each participant's required Marks hold covers the series commitment;
- participants cannot normally opt out of only one session after confirmation;
- a participant change can trigger repricing and reconfirmation;
- an underfunded or unconfirmed group can expire or require admin handling.

### 6.11 Completion, no-show, and support

After a session:

- the tutor marks attendance or the platform surfaces a missing-attendance exception;
- a tutor can mark an eligible participant as no-show;
- no-show and lateness actions use the 15-minute rule;
- a student cannot use ordinary cancellation after the session has started;
- delivery problems are routed through support and admin review;
- the booking state and Marks decision should be auditable.

### 6.12 Post-completion participant contact

For completed group sessions, the product supports a controlled contact-exchange flow rather than general in-app chat:

- a participant can request contact;
- another participant can accept and share an email;
- the recipient can decline;
- the email is not exposed before consent.

---

## 7. Admin product and operational flow

### 7.1 Admin dashboard

The admin dashboard can include:

- booking volume;
- completion or resolution rate;
- active learners;
- new students and tutors;
- gross Marks;
- platform-take Marks;
- live booking-state breakdown;
- modality and category breakdown;
- 7-day, 30-day, and 90-day periods;
- operational queues and unresolved exceptions.

Analytics use WIB calendar-day logic where documented.

### 7.2 Tutor operations

The admin tutor workspace covers:

- checking whether an invitation email already belongs to an account;
- creating and sending invitations;
- resending or rotating a claim link;
- inspecting invited, accepted, expired, or revoked status;
- reviewing tutor profile fields and evidence;
- resolving subject or specialization labels;
- requesting changes;
- approving an unpublished profile;
- publishing or unpublishing;
- suspending;
- reviewing published-profile edits;
- approving or rejecting pending edits;
- recording admin notes and audit events.

Operational tutor payout processing is intentionally separate at
`/admin-tutor-payouts`. It reviews unpaid honorarium, completed sessions,
private payout details, transfer fee/net calculations, and records **Mark as
paid** after confirmation. Manage Tutors remains focused on invitations and
profile review.

### 7.3 Booking operations

Admin operations can inspect:

- booking number;
- tutor, proposer, and participant roster;
- selected competition and specialization snapshot;
- modality;
- schedule;
- Marks holds and ledger history;
- booking state history;
- attendance and lateness;
- meeting status;
- offline room status;
- reschedule proposals;
- cancellation or no-show reasons;
- override and correction metadata.

Admin overrides should have an explicit reason and an audit record. They are exception handling, not a replacement for the normal student or tutor flow.

### 7.4 Offline rooms

The room workflow supports:

- room inventory;
- room availability checking;
- requested rooms;
- admin approval;
- assignment;
- relocation;
- room conflict handling;
- cancellation where no room is available;
- calendar synchronization.

### 7.5 Economy configuration

Admin economy settings can include:

- active Marks packages;
- online Cogito base take;
- online per-student increment;
- offline Cogito base take;
- offline per-student increment;
- version or optimistic-lock protection;
- future-booking scope.

Changing the take schedule affects future bookings and new repricing snapshots. Existing booking snapshots remain unchanged. Tutor IDR settings and student-facing Marks previews are separate concerns.

### 7.6 Achievements and support

Admin achievement moderation can approve, reject, archive, or publish student achievement records.

Support operations can handle:

- tutor lateness;
- participant no-show;
- meeting failure;
- room failure;
- booking cancellation after H-2;
- payment or wallet corrections;
- safety or contact concerns;
- profile or proof-link concerns.

The current guide displays a support operating target of 30 minutes during Monday–Saturday 09:00–21:00 WIB and 4 hours outside those hours. This should be presented as an internal or intended SLA only after the client confirms that it is an external promise.

---

## 8. Booking and session state model

The product exposes the following important booking states or equivalent operational meanings:

| State or meaning                  | Product interpretation                                                      |
| --------------------------------- | --------------------------------------------------------------------------- |
| awaiting_tutor_review             | Student request is waiting for tutor action                                 |
| awaiting_participant_confirmation | A group participant must accept                                             |
| awaiting_reconfirmation           | Headcount, price, or schedule changed and participants must reconfirm       |
| confirmed                         | Required acceptance exists; meeting or room scheduling remains              |
| awaiting_admin_room_approval      | Offline booking is waiting for room operations                              |
| reschedule_proposed               | A schedule proposal is pending                                              |
| scheduled                         | Meeting or room data is ready for the session                               |
| completed                         | Session delivery is complete and payout basis exists                        |
| declined                          | Tutor declined the request                                                  |
| cancelled                         | Booking ended under a normal cancellation path                              |
| late_cancelled                    | Booking ended after the late-cancellation cutoff with applicable forfeiture |
| expired                           | A response, confirmation, or group-funding deadline elapsed                 |
| no_show                           | A participant or tutor attendance issue was recorded or resolved            |

### State principles

- Marks holds are tied to participant and booking state.
- The original schedule remains authoritative during reschedule negotiation.
- Series sessions can have their own session-level state.
- Tutor acceptance is separate from Google Meet creation or offline room approval.
- A failed Google Meet call does not automatically mean the booking was completed.
- Offline bookings require room handling before they are treated as fully scheduled.
- Terminal bookings do not reserve tutor availability.
- The system keeps state history, action reasons, and audit information for operational review.

### Booking metadata

The booking or session record can include:

- booking number;
- tutor and participant identities;
- parent competition category;
- child specialization;
- immutable topic snapshot;
- Session Notes;
- modality;
- scheduled start and derived end;
- timezone;
- Marks price snapshot;
- tutor honorarium snapshot;
- participant hold amounts;
- meeting or room metadata;
- attendance;
- payout and correction metadata.

### Calendar and meeting naming

Canonical event title:

```text
Cogito - {Competition} | {Tutor} x {Student}
```

Group title:

```text
Cogito - {Competition} | {Tutor} x {Student} & Friends
```

The description includes tutor, student or participants, session topic, Session Notes, and the booking link where applicable.

---

## 9. Marks and pricing economics

### 9.1 Marks principles

- 1 Mark has a computational value of Rp5,000.
- Marks are closed-loop prepaid learning credits or digital vouchers.
- Students use Marks to book classes and meet product access thresholds such as the Knowledge Bank.
- Marks are credited after a successful payment confirmation.
- Booking creation moves Marks into a hold.
- Cancellation, expiry, completion, or admin correction releases, deducts, or compensates Marks according to the documented state.
- Purchased Marks have no cash surrender value.
- Students do not transfer Marks to tutors or other students.
- Tutors do not hold, receive, cash out, or convert student Marks.
- Tutors receive an IDR honorarium from Cogito's operating process.

The regulatory framing in the economics architecture is a product-design rationale, not a substitute for Indonesian legal or financial advice.

### 9.2 Reference student packages

| Package       | Marks | Price per Mark | Total price |    Reference spread |
| ------------- | ----: | -------------: | ----------: | ------------------: |
| Starter Pack  |    50 |        Rp6,250 |   Rp312,500 |  Rp62,500, or 20.0% |
| Learner Pack  |   120 |        Rp5,750 |   Rp690,000 |  Rp90,000, or 13.0% |
| Explorer Pack |   200 |        Rp5,350 | Rp1,070,000 |   Rp70,000, or 6.5% |
| Pioneer Pack  |   400 |        Rp5,000 | Rp2,000,000 | Rp0 volume baseline |

These are current reference package values and must be reconfirmed before publication.

### 9.3 Tutor honorarium formulas

Class size is capped at 1 through 6 students.

```text
Online tutor honorarium  = tutor base rate + (N − 1) × Rp30,000
Offline tutor honorarium = tutor base rate + (N − 1) × Rp40,000
```

The tutor sets the base rate in IDR, in Rp5,000 increments, subject to the current floor of Rp50,000.

The reference baseline examples in the economics architecture use:

- online base honorarium: Rp175,000;
- offline base honorarium: Rp225,000.

The actual tutor profile can use a different valid base rate.

### 9.4 Cogito take-rate formulas

The reference platform take schedule is:

```text
Online Cogito take  = Rp50,000 + (N − 1) × Rp20,000
Offline Cogito take = Rp90,000 + (N − 1) × Rp40,000
```

The admin can configure the take schedule for future bookings. This is why public material should distinguish current reference economics from immutable product behavior.

### 9.5 Conversion and rounding

```text
Total IDR          = tutor honorarium + Cogito take
Total Marks        = ceiling(Total IDR ÷ Rp5,000)
Marks per student  = ceiling(Total Marks ÷ N)
Actual pooled Marks = Marks per student × N
```

The student-facing group price is rounded up per student. Therefore, the actual pooled Marks can be higher than the exact computational total.

### 9.6 Illustrative online baseline

Reference tutor base: Rp175,000. Reference Cogito take: Rp50,000 plus Rp20,000 per additional student.

| Students | Tutor honorarium | Cogito take | Total IDR | Total Marks | Marks per student | Actual pooled Marks |
| -------: | ---------------: | ----------: | --------: | ----------: | ----------------: | ------------------: |
|        1 |        Rp175,000 |    Rp50,000 | Rp225,000 |          45 |                45 |                  45 |
|        2 |        Rp205,000 |    Rp70,000 | Rp275,000 |          55 |                28 |                  56 |
|        3 |        Rp235,000 |    Rp90,000 | Rp325,000 |          65 |                22 |                  66 |
|        4 |        Rp265,000 |   Rp110,000 | Rp375,000 |          75 |                19 |                  76 |
|        5 |        Rp295,000 |   Rp130,000 | Rp425,000 |          85 |                17 |                  85 |
|        6 |        Rp325,000 |   Rp150,000 | Rp475,000 |          95 |                16 |                  96 |

### 9.7 Illustrative offline baseline

Reference tutor base: Rp225,000. Reference Cogito take: Rp90,000 plus Rp40,000 per additional student.

| Students | Tutor honorarium | Cogito take | Total IDR | Total Marks | Marks per student | Actual pooled Marks |
| -------: | ---------------: | ----------: | --------: | ----------: | ----------------: | ------------------: |
|        1 |        Rp225,000 |    Rp90,000 | Rp315,000 |          63 |                63 |                  63 |
|        2 |        Rp265,000 |   Rp130,000 | Rp395,000 |          79 |                40 |                  80 |
|        3 |        Rp305,000 |   Rp170,000 | Rp475,000 |          95 |                32 |                  96 |
|        4 |        Rp345,000 |   Rp210,000 | Rp555,000 |         111 |                28 |                 112 |
|        5 |        Rp385,000 |   Rp250,000 | Rp635,000 |         127 |                26 |                 130 |
|        6 |        Rp425,000 |   Rp290,000 | Rp715,000 |         143 |                24 |                 144 |

### 9.8 Extreme examples in the reference architecture

These examples are useful for internal economics review, not tutor-income promises:

- With a Rp75,000 online base rate and one student, the reference calculation is Rp75,000 tutor honorarium plus Rp50,000 Cogito take, or Rp125,000 total and 25 Marks.
- With a Rp75,000 online base rate and four students, the reference calculation is Rp165,000 tutor honorarium plus Rp110,000 Cogito take, or Rp275,000 total and 55 total Marks, or 14 Marks per student after rounding.
- With a Rp500,000 offline base rate and one student, the reference calculation is Rp500,000 tutor honorarium plus Rp90,000 Cogito take, or Rp590,000 total and 118 Marks.
- With a Rp500,000 offline base rate and six students, the reference calculation is Rp700,000 tutor honorarium plus Rp290,000 Cogito take, or Rp990,000 total and 198 total Marks, or 33 Marks per student.

### 9.9 Tutor payout economics

The payout basis is the stored IDR honorarium snapshot from completed bookings.

The payout report can show:

- gross tutor honorarium;
- transfer fee;
- net honorarium;
- completed-booking count;
- unpaid amount since the latest admin-paid cutoff;
- paid records and audit trail.

The payout module records the payout operation; it does not currently make a blanket claim that a bank transfer is executed automatically by the application. The client should confirm:

- payout day and cutoff;
- responsible payout operator;
- transfer provider or banking process;
- exact bank-fee policy;
- whether the public message should say “weekly payout processing” or a more cautious phrase such as “weekly payout cycle”.

---

## 10. Supporting ecosystem

### Competition Calendar

The Competition Calendar is a published event reference for students, tutors, and admins. It has month and agenda-style views and event detail. It is not the same thing as tutor availability.

### Knowledge Bank

The Knowledge Bank is a resource library available to authenticated students, tutors, and admins.

- Students need at least 35 Marks in total balance.
- Held Marks count toward the student threshold.
- Tutors and admins bypass the student wallet threshold.
- Opening or viewing a resource does not deduct Marks.
- Resource metadata can include category, title, description, and protected file access.

The 35-Mark rule is an access threshold, not a class price.

### Achievements

Students can submit achievement records that enter an admin moderation flow. Admins can approve, reject, archive, or publish them. Tutor competition achievements are part of the tutor profile and can be used as evidence of relevant expertise.

### Notifications

Notifications support invitations, booking requests, group invitations, confirmation or reconfirmation, reschedule proposals, meeting readiness, room status, completion, payout, and support actions. Email and in-app notification content should remain consistent with the current lifecycle.

### Support

Support is the human exception layer for issues that cannot be safely resolved by normal self-service controls, including late cancellation, no-show, lateness, room failure, meeting failure, wallet correction, and safety concerns.

---

## 11. Privacy, safety, and trust model

The product's trust model is reflected in both UI and backend rules:

- only published tutor profiles appear in student discovery;
- private tutor bank information is not public;
- profile edits that affect trust or public representation can wait for admin review;
- proof links are bounded and can be reviewed;
- tutor invitations are single-use and time-limited;
- participant emails used for group lookup are not returned as general search results;
- controlled contact exchange requires participant consent;
- student, tutor, and admin data access is role-scoped;
- booking state, Marks movements, corrections, and admin decisions have audit history;
- wallet and payment operations use idempotent and snapshot-based patterns;
- tutor pricing, category, specialization, and honorarium values are snapshotted where needed so later profile changes do not rewrite historical bookings;
- there is no documented public tutor ratings or reviews feature in the current acquisition context.

Do not add tutor ratings, testimonials, social proof, or review claims to public material unless the client provides them and confirms that the product supports them.

---

## 12. Tutor acquisition positioning

The strongest accurate reasons for a specialist tutor to join Cogito are:

1. **Build a credible public profile:** present education, competition achievements, experience, specialization, and proof links in one reviewed profile.
2. **Be discoverable by relevant learners:** appear in a structured directory organized by competition category and specialization.
3. **Keep control over teaching setup:** choose online, offline, or both, set the teaching windows, and define an IDR base honorarium.
4. **Support multiple teaching formats:** offer solo, group, or recurring series sessions for class sizes of 1 to 6.
5. **Reduce coordination overhead:** let the platform handle booking requests, participant confirmation, scheduling metadata, meeting or room operations, and notifications.
6. **Receive transparent IDR honorarium reporting:** completed bookings produce a stored honorarium basis and payout status without asking tutors to handle student Marks.

### Accurate positioning statement

Cogito gives competition-focused tutors a structured way to present their expertise, get discovered by students looking for specific coaching, define when and how they teach, manage booking requests, deliver online or offline sessions, and track IDR honorarium through platform-managed operations.

### Messaging boundaries

Use:

- reviewed tutor profile;
- published profile;
- competition specialization;
- academic coaching;
- availability;
- online or offline;
- solo, group, or series;
- 90-minute session;
- IDR honorarium;
- platform-managed booking operations;
- payout processing or payout status.

Avoid:

- guaranteed students;
- guaranteed income;
- instant approval;
- instant payout;
- zero fees;
- “all students are matched to you”;
- “fill your classes automatically”;
- “convert Marks into cash”;
- “earn Marks”;
- “salary” unless there is a formal employment arrangement;
- “commission” unless the client explicitly chooses that commercial term;
- “exclusive access” unless the client confirms it;
- “Google Meet is guaranteed for every session”;
- “offline campus room is guaranteed”;
- “top-rated tutor” or “reviews” without a current ratings system and evidence.

### Important terminology

- **Marks:** student-side closed-loop learning credits.
- **IDR honorarium:** tutor-side compensation basis.
- **Published profile:** tutor profile visible to students after review and publication.
- **Specialization:** the selectable child node under a competition category.
- **Availability window:** time in which a student may request a 90-minute start.
- **Booking request:** not a confirmed session until the required parties and scheduling operations are complete.
- **Payout processing:** the operational step that records and sends, where applicable, the tutor's IDR honorarium.

---

## 13. Product constraints and non-claims

Any external explanation of Cogito should preserve these constraints:

- Tutor access begins through an admin invitation or the configured onboarding entry.
- An invitation is not approval and approval is not publication.
- A tutor must submit complete required information and at least one active specialization.
- A public tutor profile may be suspended, unpublished, or sent back for changes.
- Student discovery shows published profiles only.
- Tutor pricing is configured in IDR, not Marks.
- Student pricing is shown in Marks after the platform calculation.
- Tutors do not receive, withdraw, or convert Marks.
- A booking is not confirmed merely because a student submitted a request.
- A Google Meet creation failure can trigger retry or manual recovery.
- An offline booking is not fully scheduled until room operations confirm a room.
- H-2 is the normal student self-service cutoff.
- A late cancellation may forfeit held Marks.
- Group and series bookings have participant-confirmation and reconfirmation rules.
- Group-series participants commit to the full series after confirmation under the normal rules.
- Student Marks are not a direct payout or peer-to-peer transfer system.
- Existing bookings use price and specialization snapshots.
- Economics values can be configured and should be reconfirmed before external publication.
- The current web product does not document public tutor ratings or reviews.
- The current repository does not establish an active tutor count, student count, testimonials, conversion rate, or student-demand guarantee.

---

## 14. Client inputs still needed

The following are not established by the current repository and should remain placeholders until the client confirms them:

- final brand name: Cogito or Cogito Academy;
- final logo, color, typography, and image assets;
- final tutor application or CTA URL;
- final contact channel, such as WhatsApp or email;
- launch date or recruitment deadline;
- target tutor profile and priority specializations;
- acquisition target, such as number of tutors or timeline;
- active tutor count;
- registered or active student count;
- completed-session count;
- verified testimonials or case studies;
- actual current tutor availability and demand;
- final package prices and Marks economics;
- final tutor-rate defaults and take-rate configuration;
- final payout cadence and bank-fee wording;
- final Terms of Service and exclusivity wording;
- legal review of the closed-loop Marks and independent-tutor model;
- whether the acquisition material should mention online only, offline only, or both;
- which modules are in scope for the client-facing explanation;
- which economics detail belongs in the main narrative versus an appendix.

---

## 15. Source of truth and verification map

When a statement conflicts across artifacts, use the most recent implementation and product documentation, then ask the client to resolve business-policy ambiguity.

Primary repository sources:

1. docs/CONTEXT.md — architecture, implemented modules, known gaps, operational notes, and plans.
2. docs/MODULE-REFERENCE.md — module behavior, business rules, states, and service boundaries.
3. docs/API-REFERENCE.md — web/API behavior, role scope, inputs, outputs, and payout/economy details.
4. docs/marks-economy-architecture.md — Marks model, package reference values, pricing formulas, and regulatory rationale.
5. docs/booking-scheduling-and-reschedule-spec.md — 90-minute sessions, availability windows, specializations, booking topics, reschedule negotiation, and calendar metadata.
6. packages/db/src/migrations/0029_competition_taxonomy.sql — active 7-category, 33-specialization taxonomy.
7. packages/db/src/migrations/0041_seed_mark_packages.sql — current seeded Marks package values.
8. packages/api/src/modules/economy/economy.types.ts — economy configuration shapes and limits.
9. packages/api/src/modules/economy/pricing.service.ts — pricing and Marks calculation behavior.
10. apps/web/src/components/guide/guide-content.ts — user-facing timing rules and role journeys.
11. apps/web/src/components/dashboard/app-sidebar.tsx — role-specific web navigation.
12. apps/web/src/components/tutor/tutor-terms-of-service.tsx — currently displayed tutor agreement language.

This dossier is product context. It is not a legal opinion, a final commercial policy, an income guarantee, or a confirmation that every reference value is ready for public release.
