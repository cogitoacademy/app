import type { ComponentType } from "react";
import {
  IconAdjustments,
  IconAlertTriangle,
  IconAward,
  IconBook,
  IconCalendarEvent,
  IconCalendarShare,
  IconCheck,
  IconClock,
  IconCoins,
  IconCreditCard,
  IconHeadset,
  IconMail,
  IconMapPin,
  IconMessageCircle,
  IconNotes,
  IconRefresh,
  IconRoute,
  IconSchool,
  IconSearch,
  IconShieldCheck,
  IconSparkles,
  IconUserCheck,
  IconUserPlus,
  IconUsersGroup,
  IconVideo,
  IconWallet,
} from "@tabler/icons-react";

export const GUIDE_VIEWS = ["student", "tutor", "admin"] as const;
export type GuideView = (typeof GUIDE_VIEWS)[number];

export type GuideTone =
  | "primary"
  | "secondary"
  | "tertiary"
  | "info"
  | "success"
  | "warning"
  | "danger";

export type GuideIcon = ComponentType<{
  className?: string;
  size?: number | string;
  stroke?: number;
}>;

export type GuideRoute =
  | "/dashboard"
  | "/balance"
  | "/bookings"
  | "/classes"
  | "/calendar"
  | "/achievements"
  | "/tutors"
  | "/knowledge-bank"
  | "/notifications"
  | "/profile"
  | "/availability"
  | "/my-classes"
  | "/class-reports"
  | "/referrals"
  | "/faq"
  | "/admin"
  | "/admin-operations"
  | "/admin-tutors"
  | "/admin-tutor-payouts"
  | "/admin-classes"
  | "/admin-payments"
  | "/admin-economy"
  | "/admin-referrals"
  | "/admin-competitions"
  | "/admin-achievements"
  | "/admin-knowledge-bank"
  | "/admin-admins"
  | "/admin-audit"
  | "/admin-blog"
  | "/activities";

export type GuideCta = {
  label: string;
  to: GuideRoute;
};

export type GuideStatus = {
  label: string;
  variant: GuideTone;
};

export type GuideBranch = {
  title: string;
  trigger: string;
  outcome: string;
  variant: GuideTone;
  cta?: GuideCta;
};

export type GuideStep = {
  id: string;
  title: string;
  summary: string;
  actor: string;
  icon: GuideIcon;
  details: string[];
  statuses?: GuideStatus[];
  branches?: GuideBranch[];
  cta?: GuideCta;
};

export type GuideChapter = {
  id: string;
  title: string;
  description: string;
  icon: GuideIcon;
  steps: GuideStep[];
};

export type GuideHighlight = {
  label: string;
  value: string;
  description: string;
  icon: GuideIcon;
  variant: GuideTone;
};

export type GuideContent = {
  label: string;
  title: string;
  description: string;
  highlights: GuideHighlight[];
  chapters: GuideChapter[];
};

export const GUIDE_VIEW_ACCESS: Record<GuideView, readonly GuideView[]> = {
  student: ["student"],
  tutor: ["tutor", "student"],
  admin: ["admin", "tutor", "student"],
};

export const GUIDE_VIEW_META: Record<
  GuideView,
  { label: string; shortLabel: string; description: string }
> = {
  student: {
    label: "Student journey",
    shortLabel: "Student",
    description:
      "Create your account, choose a tutor or class, and follow every Mark.",
  },
  tutor: {
    label: "Tutor journey",
    shortLabel: "Tutor",
    description:
      "Get approved, teach private sessions and classes, and track your payout.",
  },
  admin: {
    label: "Admin operations",
    shortLabel: "Admin",
    description:
      "Run operations, finance, classes, content, and access from one guide.",
  },
};

export function normalizeGuideRole(role?: string): GuideView {
  if (role === "tutor" || role === "admin") return role;
  return "student";
}

export function getAllowedGuideViews(role?: string): readonly GuideView[] {
  return GUIDE_VIEW_ACCESS[normalizeGuideRole(role)];
}

export function getDefaultGuideView(role?: string): GuideView {
  return normalizeGuideRole(role);
}

export function canViewGuide(role: string | undefined, view: GuideView) {
  return getAllowedGuideViews(role).includes(view);
}

export function resolveGuideView(
  role: string | undefined,
  requestedView?: GuideView,
): GuideView {
  const defaultView = getDefaultGuideView(role);
  return requestedView && canViewGuide(role, requestedView)
    ? requestedView
    : defaultView;
}

const sharedBookingBranches: GuideBranch[] = [
  {
    title: "The tutor declines",
    trigger:
      "The tutor has **12 hours** to respond or suggest another time, unless the session starts sooner.",
    outcome:
      "The booking ends as declined or expired. Held Marks are released; if it expires or scheduling fails, the hold returns within **12 hours** of that event.",
    variant: "danger",
    cta: { label: "Browse other tutors", to: "/tutors" },
  },
  {
    title: "The tutor suggests another time",
    trigger:
      "The tutor proposes another time because the original schedule does not work.",
    outcome:
      "Review the counter-proposal within its **24-hour** proposal window. The booking stays in negotiation until every required participant accepts.",
    variant: "warning",
    cta: { label: "Open my bookings", to: "/bookings" },
  },
  {
    title: "A group member is still deciding",
    trigger:
      "A group or series invitee has not confirmed within the **12-hour** response window, or before the session starts if sooner.",
    outcome:
      "The booking waits for participant confirmation. If the deadline passes, it can expire and held Marks return within **12 hours** after expiry. Below **2** confirmed students the group can expire; with **2 or more** but below target, the price is recalculated and everyone reconfirms.",
    variant: "info",
  },
];

const tutorBookingBranches: GuideBranch[] = [
  {
    title: "You decline the request",
    trigger:
      "The request does not fit your schedule or teaching setup. Enter a written reason within **12 hours**, unless the session starts sooner.",
    outcome:
      "The booking ends as declined or expired. The student's held Marks are released, and the student can look for another tutor.",
    variant: "danger",
    cta: { label: "Open booking requests", to: "/bookings" },
  },
  {
    title: "You suggest another time",
    trigger:
      "The learning goal fits, but the original time does not. Counter-propose a different time.",
    outcome:
      "The student reviews the proposal within its **24-hour** window. The booking stays in negotiation until every required participant accepts.",
    variant: "warning",
    cta: { label: "Review my bookings", to: "/bookings" },
  },
  {
    title: "A group member is still deciding",
    trigger:
      "A group or series invitee has not confirmed within the **12-hour** response window, or before the session starts if sooner.",
    outcome:
      "The booking waits for participant confirmation. If the deadline passes, it can expire and held Marks return. Below **2** confirmed students the group can expire; with **2 or more** but below target, the price is recalculated and everyone reconfirms.",
    variant: "info",
  },
];

const sharedRescheduleBranches: GuideBranch[] = [
  {
    title: "Everyone accepts",
    trigger:
      "The tutor and every active confirmed student accept the proposal.",
    outcome:
      "The new time becomes authoritative and the booking continues toward confirmation or scheduling.",
    variant: "success",
  },
  {
    title: "Someone rejects or the proposal expires",
    trigger: "Any voter rejects, or the **24-hour** proposal window expires.",
    outcome:
      "The original schedule remains in place. Existing Marks holds follow the original booking lifecycle.",
    variant: "warning",
  },
];

const sharedSessionBranches: GuideBranch[] = [
  {
    title: "The online meeting needs a retry",
    trigger: "Google Meet creation fails after the booking is confirmed.",
    outcome:
      "The booking stays confirmed while Cogito tries again every **5 minutes**, for up to **3 attempts**. The tutor or an admin can add a manual link when needed.",
    variant: "warning",
    cta: { label: "Check booking status", to: "/bookings" },
  },
  {
    title: "The tutor is late or absent",
    trigger:
      "Attendance is not confirmed after the **15-minute** lateness window.",
    outcome:
      "The session is sent to the admin for review. If the tutor is absent past **15 minutes**, affected students' held Marks follow the no-show policy. Anyone in the booking can send a support report from the booking details.",
    variant: "danger",
    cta: { label: "Open booking detail", to: "/bookings" },
  },
];

const sharedClassBranches: GuideBranch[] = [
  {
    title: "The class is postponed",
    trigger:
      "The admin postpones a cohort after the minimum-enrollment check. A class can be postponed only once.",
    outcome:
      "The new schedule is announced to enrolled students and the tutor. Enrolled students receive a **3-day** penalty-free withdrawal window.",
    variant: "warning",
  },
  {
    title: "A session time changes",
    trigger:
      "The admin reschedules an ordinary undelivered class session and notifies affected students.",
    outcome:
      "Only the affected undelivered session can be cancelled. The deadline is the earlier of **24 hours after notification** and the new session start. Delivered sessions and earned fees do not change.",
    variant: "info",
  },
];

const studentClassBranches: GuideBranch[] =
  sharedClassBranches.map<GuideBranch>((branch) => ({
    ...branch,
    cta: { label: "Open class details", to: "/classes" },
  }));

const adminClassBranches: GuideBranch[] = sharedClassBranches.map<GuideBranch>(
  (branch) => ({
    ...branch,
    cta: { label: "Manage classes", to: "/admin-classes" },
  }),
);

const studentContent: GuideContent = {
  label: "Student guide",
  title: "From your first Mark to your next finished session.",
  description:
    "See how to join, choose a tutor or class, manage your schedule, and keep your learning record.",
  highlights: [
    {
      label: "Wallet",
      value: "Available, held, total",
      description:
        "Marks stay held until a session is delivered. Total equals available plus held.",
      icon: IconCoins,
      variant: "primary",
    },
    {
      label: "Session length",
      value: "90 minutes",
      description:
        "Private sessions and class sessions follow their published schedule.",
      icon: IconClock,
      variant: "info",
    },
    {
      label: "Support",
      value: "30 minutes in hours",
      description:
        "Support targets 30 minutes during business hours and 4 hours outside.",
      icon: IconHeadset,
      variant: "warning",
    },
  ],
  chapters: [
    {
      id: "student-start",
      title: "Create your account",
      description:
        "Verify your email, set your learning profile, and understand how Marks move through your wallet.",
      icon: IconSparkles,
      steps: [
        {
          id: "student-account",
          title: "Set up your account",
          summary:
            "Create a verified student account and optionally apply one friend or KOL code at signup.",
          actor: "You",
          icon: IconUserPlus,
          details: [
            "Email signup uses a **6-digit code**. Send it to your email, then enter it before you create the account.",
            "Changing the email clears the code and proof state. Changing only the referral code does not.",
            "A Google signup skips the email code. A new Google account with a code continues to the referral choice step once.",
            "You can enter one friend or KOL code. A valid code gives the welcome reward; no code gives no welcome reward. The saved choice cannot be changed later.",
            "Default referral rewards are **15 Marks** for the new student and **15 Marks** for a friend referrer after the first eligible completed session. The friend reward cap is **75 Marks** per semester.",
          ],
          statuses: [
            { label: "Email verified", variant: "success" },
            { label: "Referral choice saved", variant: "info" },
          ],
          cta: { label: "Open my profile", to: "/profile" },
        },
        {
          id: "student-profile",
          title: "Complete your learning profile",
          summary:
            "Add the details tutors need and choose how other students may contact you.",
          actor: "You",
          icon: IconNotes,
          details: [
            "Account identity and learning profile are separate. You can edit your photo and personal learning details in one place.",
            "The profile tracks school, grade, phone, parent or guardian details, and contact privacy.",
            "Contact privacy lets you allow or block new contact requests from other students.",
            "A profile with no saved row opens as an empty form, not an error.",
          ],
          statuses: [
            { label: "Profile incomplete", variant: "warning" },
            { label: "Profile ready", variant: "success" },
          ],
          cta: { label: "Update my profile", to: "/profile" },
        },
        {
          id: "student-balance",
          title: "Fund your Marks balance",
          summary:
            "Choose a package or an exact amount, compare the recommendation, and complete payment.",
          actor: "You and Midtrans",
          icon: IconCreditCard,
          details: [
            "Balance shows available Marks, held Marks, and total Marks. Every ledger row shows the change and the resulting balance.",
            "Package cards show Marks, IDR price, and the rate per Mark. Exact amount accepts any custom Mark value and shows its IDR price.",
            "When a custom amount costs at least as much as a package, both choices stay visible with the better-value recommendation.",
            "Only an authoritative payment success credits Marks once. Returning to the browser alone does not credit the wallet.",
            "Purchased and bonus Marks do not expire. A class checkout reservation lasts **15 minutes** before the seats are released.",
          ],
          statuses: [
            { label: "Payment pending", variant: "warning" },
            { label: "Marks credited", variant: "success" },
          ],
          branches: [
            {
              title: "Payment succeeds after the reservation expires",
              trigger:
                "The provider confirms payment after the **15-minute** seat reservation has expired.",
              outcome:
                "The wallet is credited once. The seat is not promised. Check current capacity and enroll again only when a seat is available.",
              variant: "warning",
              cta: { label: "Review my balance", to: "/balance" },
            },
            {
              title: "The payment fails or is retried",
              trigger:
                "The provider reports a failure, or you retry the same purchase.",
              outcome:
                "A failed attempt does not create a second credit. The same purchase identity credits Marks at most once when success arrives.",
              variant: "info",
            },
          ],
          cta: { label: "Open my balance", to: "/balance" },
        },
      ],
    },
    {
      id: "student-discover",
      title: "Find a tutor or class",
      description:
        "Compare published tutors and scheduled classes before you commit Marks.",
      icon: IconSearch,
      steps: [
        {
          id: "student-tutors",
          title: "Browse published tutors",
          summary:
            "Filter by competition, specialization, and online or offline mode, then open a tutor profile.",
          actor: "You",
          icon: IconSearch,
          details: [
            "Only published tutor profiles appear in discovery.",
            "Filters cover competition, specialization, and modality. Clear each filter when you want the full list again.",
            "A tutor card shows name, mode, affiliation, specializations, bio, and starting price.",
            "The profile shows the pricing table, education, achievements, experience, and future availability. Public data never includes NIK, NPWP, bank details, or internal finance fields.",
          ],
          statuses: [{ label: "Published tutor", variant: "success" }],
          cta: { label: "Explore tutors", to: "/tutors" },
        },
        {
          id: "student-classes",
          title: "Compare cohorts and masterclasses",
          summary:
            "Browse the class catalog, check upcoming sessions, and open the class that fits your goal.",
          actor: "You",
          icon: IconSchool,
          details: [
            "A cohort has multiple scheduled sessions. A masterclass has exactly **1 session**.",
            "The catalog shows class type, competition, session count, start date, tutor, and starting price.",
            "The Upcoming classes section lists future sessions from the filtered catalog, ordered by start time. Cancelled and past sessions are hidden.",
            "Class detail shows the curriculum, schedule, session status, format, tutor, and enrollment choices.",
          ],
          statuses: [
            { label: "Published class", variant: "success" },
            { label: "Upcoming session", variant: "info" },
          ],
          cta: { label: "Browse classes", to: "/classes" },
        },
      ],
    },
    {
      id: "student-booking",
      title: "Book a private session",
      description:
        "Create a solo, group, or series request and follow it while the tutor and participants respond.",
      icon: IconCalendarEvent,
      steps: [
        {
          id: "student-request",
          title: "Create a solo, group, or series booking",
          summary:
            "Choose a specialization, add your goal, select one or more 90-minute starts, and invite other students when needed.",
          actor: "You",
          icon: IconCalendarShare,
          details: [
            "A specialization is required. It comes from the active competition catalog.",
            "One selected start creates a solo or group booking. **2 to 4** selected starts create a series. You can invite up to **5** other students, for a group of up to **6**.",
            "The summary shows tutor, specialization, participants, sessions, format, schedule, session price, reserved now, and balance after reservation.",
            "Marks are held atomically when the request is created. Conflicting or duplicate slots are rejected before any hold.",
            "The tutor response, participant confirmation, reconfirmation, and offline room approval each allow **12 hours**, unless the session starts sooner.",
            "If a booking expires or scheduling fails, held Marks return within **12 hours** of the event.",
          ],
          statuses: [
            { label: "Waiting for tutor review", variant: "warning" },
            { label: "Waiting for participant confirmation", variant: "info" },
            { label: "Awaiting room approval", variant: "warning" },
          ],
          branches: sharedBookingBranches,
          cta: { label: "See my bookings", to: "/bookings" },
        },
        {
          id: "student-confirmed",
          title: "Confirm the group and prepare access",
          summary:
            "Once the tutor and required participants agree, Cogito confirms the booking and prepares the room or online meeting.",
          actor: "Tutor, participants, and Cogito",
          icon: IconUserCheck,
          details: [
            "The booking proposer is accepted automatically. Every other required participant must confirm.",
            "If the confirmed group falls below **2** students, the group expires. With **2 or more** students but below target, the price is recalculated and everyone reconfirms.",
            "A confirmed participant can withdraw before H-2. That triggers repricing and reconfirmation. After H-2, late-cancel or no-show handling applies.",
            "Online bookings receive a meeting link when Google Meet creation succeeds. Offline bookings wait for a room large enough for the group.",
            "The booking detail always shows the current state, next action, participants, and Marks impact.",
          ],
          statuses: [
            { label: "Confirmed", variant: "success" },
            { label: "Scheduled", variant: "primary" },
            { label: "Awaiting room approval", variant: "warning" },
          ],
          branches: [
            {
              title: "Offline room needs approval",
              trigger:
                "The session uses an offline location that needs an admin room decision.",
              outcome:
                "The booking stays visible while the admin assigns, relocates, or cancels the room request. The room capacity must cover the group. The decision allows **12 hours**, capped at session start when it is sooner.",
              variant: "info",
            },
            {
              title: "A meeting link is delayed",
              trigger:
                "The provider needs another attempt to create the online meeting.",
              outcome:
                "The booking stays confirmed while Cogito retries every **5 minutes**, for up to **3 attempts**. An admin or the tutor can add a manual link.",
              variant: "warning",
            },
          ],
          cta: { label: "Open booking status", to: "/bookings" },
        },
      ],
    },
    {
      id: "student-class-enrollment",
      title: "Enroll in a class",
      description:
        "Choose a full, half, or single plan, pay any second installment, and manage each seat.",
      icon: IconSchool,
      steps: [
        {
          id: "student-enroll",
          title: "Choose the class plan",
          summary:
            "Select the sessions you will attend and review the exact hold before you confirm.",
          actor: "You",
          icon: IconBook,
          details: [
            "Cohort plans are full, half, or single. A masterclass has one fixed plan and one session.",
            "With default class rates, a full cohort seat is **20 Marks** per session, a half seat is **22**, a single seat is **25**, and a masterclass seat is **5**. The published class rate is authoritative at checkout.",
            "A full plan holds every selected session now. A half plan holds the first installment now and schedules the second. A single plan holds one session.",
            "A checkout reservation lasts **15 minutes**. The whole plan succeeds atomically or leaves no seats and no partial holds.",
            "You cannot hold overlapping or duplicate entitlement to the same session, even through another plan.",
          ],
          statuses: [
            { label: "Checkout reserved", variant: "info" },
            { label: "Enrollment active", variant: "success" },
            { label: "Seat unavailable", variant: "danger" },
          ],
          cta: { label: "Open classes", to: "/classes" },
        },
        {
          id: "student-installment",
          title: "Pay the second installment",
          summary:
            "A half plan shows the second amount, its deadline, and a Pay action before the second half starts.",
          actor: "You",
          icon: IconCreditCard,
          details: [
            "Reminders arrive **7 days** and **1 day** before the first session in the relevant installment.",
            "A half plan reserves both halves' selected sessions until the second-installment deadline. Other buyers can use only remaining unreserved capacity.",
            "Pay before the first session of the second installment. At or after that deadline, unpaid future seats are released.",
            "Paid first-installment seats, history, and completed sessions remain. Rejoining after removal is a new quote at the current half rate for future sessions only.",
            "You cannot switch plans on an existing enrollment.",
          ],
          statuses: [
            { label: "Second installment due", variant: "warning" },
            { label: "Second installment paid", variant: "success" },
            { label: "Unpaid seats released", variant: "danger" },
          ],
          cta: { label: "Manage my classes", to: "/classes" },
        },
        {
          id: "student-class-cancel",
          title: "Cancel a seat or withdraw",
          summary:
            "Review the exact fee and return before you confirm. Returns go to available Marks, never cash.",
          actor: "You",
          icon: IconRefresh,
          details: [
            "Cancel an eligible seat at least **24 hours** before its start. The fee is the rounded **20%** of that seat's Marks; the rest returns to available.",
            "A full-plan seat at 20 Marks returns 16 Marks after a 4-Mark fee. A half-plan seat at 22 returns 18 after 4. A single seat at 25 returns 20 after 5. A masterclass seat at 5 returns 4 after 1.",
            "Cancelling inside **24 hours** keeps the funded seat held for session completion and applies the normal charge.",
            "A withdrawal charges the rounded **20%** on applicable remaining held Marks. It never triggers the next half payment automatically.",
            "If a cohort is postponed, the **3-day** penalty-free withdrawal window is shown before you confirm. A changed session has its own earlier deadline: the earlier of **24 hours after notification** and the new start.",
            "Delivered sessions and already earned tutor fees are never reversed by a later class cancellation.",
          ],
          statuses: [
            { label: "Cancellation available", variant: "info" },
            { label: "Inside 24 hours", variant: "danger" },
            { label: "Penalty-free window", variant: "success" },
          ],
          branches: studentClassBranches,
          cta: { label: "Review my classes", to: "/classes" },
        },
        {
          id: "student-class-attend",
          title: "Join the session",
          summary:
            "Use the meeting link or room details for each session you hold a funded seat in.",
          actor: "You and your tutor",
          icon: IconVideo,
          details: [
            "Online sessions show Join meeting only when your seat is funded and the meeting link is ready.",
            "In-person sessions show the assigned room name and location.",
            "Completed sessions show Session completed instead of a join action.",
            "A cancelled or unpaid seat does not show meeting data.",
            "If the link is delayed, the session stays scheduled while Cogito retries meeting creation every **5 minutes**, up to **3 attempts**.",
          ],
          statuses: [
            { label: "Session scheduled", variant: "primary" },
            { label: "Session in progress", variant: "info" },
            { label: "Session completed", variant: "secondary" },
          ],
          branches: sharedSessionBranches,
          cta: { label: "Open my classes", to: "/classes" },
        },
      ],
    },
    {
      id: "student-schedule",
      title: "Change or cancel a booking",
      description:
        "Move a session when plans change, or cancel it with a clear outcome.",
      icon: IconRefresh,
      steps: [
        {
          id: "student-reschedule",
          title: "Propose a new time",
          summary:
            "A tutor or booking proposer can suggest a new time while the original schedule remains active.",
          actor: "Tutor, you, and confirmed students",
          icon: IconRefresh,
          details: [
            "The person who proposes a time is automatically counted as accepted. Every other required voter must accept.",
            "The new time only replaces the old one after unanimous acceptance.",
            "A proposal stays open for **24 hours**. A rejection or expiry returns the booking to its original schedule.",
            "Series sessions are negotiated independently. The header action is hidden for a series; each session has its own proposal action.",
            "A student proposal must be made before H-2. After H-2, use support or admin review for an exceptional change.",
          ],
          statuses: [{ label: "Reschedule proposed", variant: "warning" }],
          branches: sharedRescheduleBranches,
          cta: { label: "Review bookings", to: "/bookings" },
        },
        {
          id: "student-cancel-booking",
          title: "Cancel a private booking",
          summary:
            "Review the reason field and Marks outcome before you confirm a cancellation.",
          actor: "You",
          icon: IconAlertTriangle,
          details: [
            "Student self-service cancellation closes at the scheduled start.",
            "Before **H-2 (2 hours before start)**, a normal cancellation releases held Marks.",
            "Inside H-2, the booking becomes late-cancelled and forfeits its held Marks. The preview shows the exact outcome before you confirm.",
            "After the start, the cancellation action is blocked. Use a support report or admin review instead.",
            "A required written reason is saved in the booking history and shared with the tutor.",
          ],
          statuses: [
            { label: "Cancelled", variant: "danger" },
            { label: "Late cancelled", variant: "warning" },
            { label: "Cancellation deadline passed", variant: "danger" },
          ],
          cta: { label: "Open my bookings", to: "/bookings" },
        },
      ],
    },
    {
      id: "student-learning",
      title: "Keep your learning record",
      description:
        "Read reports, track referrals and achievements, and use the learning library.",
      icon: IconBook,
      steps: [
        {
          id: "student-reports",
          title: "Read and download session reports",
          summary:
            "Each delivered session gets one report with discussion, strengths, and improvement feedback.",
          actor: "Your tutor and Cogito",
          icon: IconNotes,
          details: [
            "A report has three fields: session discussion, strengths observed, and areas for improvement. Each field allows up to **600 characters**.",
            "A report is available only for a session where you held a chargeable seat. Early-cancelled, unpaid, or released seats do not unlock it.",
            "Select up to **100** eligible reports from the last **3 calendar months**, newest first.",
            "Download one branded PDF with one current-format report per page, your name, session metadata, feedback, generation date, and page number.",
            "A tutor records the report after delivery. An admin can correct report text later; the correction does not change Marks or tutor fees.",
          ],
          statuses: [
            { label: "Report pending", variant: "warning" },
            { label: "Report recorded", variant: "success" },
            { label: "Report corrected", variant: "info" },
          ],
          cta: { label: "Open session reports", to: "/class-reports" },
        },
        {
          id: "student-referrals",
          title: "Share your referral code",
          summary:
            "Invite friends with your code and track semester rewards and the remaining cap.",
          actor: "You",
          icon: IconUsersGroup,
          details: [
            "The referral page shows your unique code, copy actions, and invite message.",
            "A new student who signs up with your code gets the welcome reward. You get the friend reward after that friend's first eligible completed Marks-costing session.",
            "A free class does not qualify. A no-show penalty alone does not qualify.",
            "The default reward is **15 Marks**, with a **75 Marks** cap per semester. The cap is evaluated at the friend's first eligible completion; unused cap does not roll over.",
            "The page shows earned Marks, remaining allowance, semester end date, invited friends, and each friend's status.",
          ],
          statuses: [
            { label: "Account created", variant: "info" },
            { label: "First session completed", variant: "success" },
            { label: "Reward pending cap", variant: "warning" },
          ],
          cta: { label: "Open my referrals", to: "/referrals" },
        },
        {
          id: "student-achievements",
          title: "Submit achievements",
          summary:
            "Add competition results with proof, then follow the admin review decision.",
          actor: "You and an admin",
          icon: IconAward,
          details: [
            "The form collects event or competition, category, award, proof link, level, date, location, description, and skills.",
            "A proof link is required. Use a Google Drive link or another accessible source.",
            "A submission enters moderation. It is not public by default.",
            "An admin approves or rejects it. A rejection includes a note so you know what to correct.",
            "Only approved achievements can appear in your learning record or public profile.",
          ],
          statuses: [
            { label: "Pending review", variant: "warning" },
            { label: "Approved", variant: "success" },
            { label: "Rejected", variant: "danger" },
          ],
          cta: { label: "Open achievements", to: "/achievements" },
        },
        {
          id: "student-resources",
          title: "Use the Knowledge Bank and calendar",
          summary:
            "Unlock learning resources, plan competitions, read the FAQ, and keep notifications under control.",
          actor: "You",
          icon: IconBook,
          details: [
            "Knowledge Bank opens when your total balance reaches **35 Marks**. Held Marks count toward eligibility.",
            "A temporary admin grant can open access without the Marks threshold. It expires automatically.",
            "Resources are grouped by competition category, and private files are not public URLs.",
            "Competition Calendar supports month and agenda views, competition filters, and event detail with dates, location, organizer, registration deadline, and links.",
            "Notifications collect booking, class, payment, refund, report, and system updates. The guide and FAQ explain platform rules; WhatsApp support is available from the sidebar.",
          ],
          statuses: [
            { label: "35 Marks unlock", variant: "info" },
            { label: "Temporary access", variant: "primary" },
          ],
          branches: [
            {
              title: "A resource is still locked",
              trigger:
                "Your total balance is below **35 Marks** and no temporary grant is active.",
              outcome:
                "Held Marks still count toward the threshold. Ask support about a temporary grant only when you need access before you reach it.",
              variant: "warning",
              cta: { label: "Open Knowledge Bank", to: "/knowledge-bank" },
            },
            {
              title: "You want to plan a competition",
              trigger: "A registration deadline or event date is coming up.",
              outcome:
                "Switch between month and agenda views, filter by competition, and open an event for its dates, location, organizer, and links.",
              variant: "info",
              cta: { label: "Open competition calendar", to: "/calendar" },
            },
          ],
          cta: { label: "Open Knowledge Bank", to: "/knowledge-bank" },
        },
      ],
    },
  ],
};

const tutorContent: GuideContent = {
  label: "Tutor guide",
  title: "From invitation to your next payout.",
  description:
    "Get approved, manage private bookings and assigned classes, then reconcile every earned fee.",
  highlights: [
    {
      label: "Invitation",
      value: "7 days",
      description:
        "Each invite is single-use and bound to the invited email address.",
      icon: IconMail,
      variant: "info",
    },
    {
      label: "Profile gate",
      value: "Admin reviewed",
      description: "Only published profiles appear in student discovery.",
      icon: IconShieldCheck,
      variant: "success",
    },
    {
      label: "After teaching",
      value: "One fee per session",
      description:
        "A delivered, reported session creates one earned fee for its assigned tutor.",
      icon: IconWallet,
      variant: "warning",
    },
  ],
  chapters: [
    {
      id: "tutor-setup",
      title: "Join and get approved",
      description:
        "Claim your invitation, complete your public profile, pass review, and set your teaching terms.",
      icon: IconUserPlus,
      steps: [
        {
          id: "tutor-invite",
          title: "Claim your tutor invitation",
          summary:
            "Create or sign in to the invited account, then claim the invitation tied to your email.",
          actor: "You and Cogito",
          icon: IconMail,
          details: [
            "The invitation is single-use, expires after **7 days**, and must match the invited email address.",
            "Google and email/password accounts use the same claim path.",
            "Claiming consumes the invitation and creates your tutor profile in one transaction.",
            "An admin account is never silently demoted. Resending an invitation invalidates the old token.",
            "After claiming, your tutor profile becomes the place to complete setup.",
          ],
          statuses: [
            { label: "Invitation sent", variant: "info" },
            { label: "Invitation accepted", variant: "success" },
            { label: "Expired or revoked", variant: "danger" },
          ],
          cta: { label: "Open tutor profile", to: "/profile" },
        },
        {
          id: "tutor-profile",
          title: "Complete your teaching profile",
          summary:
            "Add your bio, affiliation, specializations, proof, education, achievements, and experience before review.",
          actor: "You",
          icon: IconNotes,
          details: [
            "Upload and crop a profile photo. Add a bio and affiliation.",
            "Select active specializations from the competition catalog. Up to **7** specializations can be selected.",
            "Education allows **2** entries. Achievements and experience allow **5** each. Add proof links where the form asks for evidence.",
            "Save changes as a draft while you gather information, then submit them for admin review.",
            "Accept the Tutor Terms of Service before you submit. Unfinished edits stay private.",
          ],
          statuses: [{ label: "Draft", variant: "secondary" }],
          branches: [
            {
              title: "Changes are requested",
              trigger:
                "An admin needs a correction before the profile can be published.",
              outcome:
                "The profile returns to an editable state with review feedback. Update it and submit again.",
              variant: "warning",
              cta: { label: "Update my profile", to: "/profile" },
            },
            {
              title: "Your published profile is edited",
              trigger:
                "A trust-sensitive change needs review after publication.",
              outcome:
                "Approved public values stay visible while the new change is reviewed.",
              variant: "info",
            },
          ],
          cta: { label: "Set up my profile", to: "/profile" },
        },
        {
          id: "tutor-review",
          title: "Move through profile review",
          summary:
            "Track whether your profile is waiting for review, approved, published, or suspended.",
          actor: "Admin",
          icon: IconShieldCheck,
          details: [
            "Pending review means an admin is checking the profile.",
            "Approved means the profile can be published; published means students can discover it.",
            "An admin can unpublish or suspend a profile when a trust or policy issue needs resolution.",
            "A photo or proof change applies only after approval.",
            "The review action, actor, and time are recorded.",
          ],
          statuses: [
            { label: "Pending review", variant: "warning" },
            { label: "Approved", variant: "info" },
            { label: "Published", variant: "success" },
            { label: "Suspended", variant: "danger" },
          ],
          cta: { label: "Check profile status", to: "/profile" },
        },
        {
          id: "tutor-availability",
          title: "Set your availability",
          summary:
            "Publish weekly teaching windows and individual date overrides for online and offline sessions.",
          actor: "You",
          icon: IconCalendarEvent,
          details: [
            "Weekly hours cover Monday to Sunday. Choose the mode, add hours, and apply them to the selected weekdays.",
            "Date overrides cover single or multiple dates. Use them when a week does not follow your normal pattern.",
            "Start must be before end, and windows must not overlap.",
            "Each student booking is exactly **90 minutes**. Students choose a valid start inside your published window.",
            "The seven-day calendar preview reflects saved weekly windows and date overrides.",
          ],
          statuses: [
            { label: "Availability saved", variant: "success" },
            { label: "No future windows", variant: "warning" },
          ],
          cta: { label: "Open availability", to: "/availability" },
        },
        {
          id: "tutor-payout-profile",
          title: "Add payout and tax details",
          summary:
            "Provide your bank account and legal identity before an admin can prepare a payout.",
          actor: "You",
          icon: IconWallet,
          details: [
            "Bank, account number, holder name, opening city, ownership, and transfer confirmation are required.",
            "Legal name and a **16-digit NIK** are required before a new payout is prepared. NPWP is optional.",
            "Default tax rates are **2.50%** with NIK and NPWP, and **3.00%** with NIK only, no tax identity, or a tutor override.",
            "Tax identity stays private to you and payout admins.",
            "Saved bank and tax values are snapshotted into each payout. Later profile edits do not recalculate recorded payouts.",
          ],
          statuses: [
            { label: "Payout account ready", variant: "success" },
            { label: "Tax identity missing", variant: "warning" },
          ],
          cta: { label: "Open payout details", to: "/profile" },
        },
      ],
    },
    {
      id: "tutor-bookings",
      title: "Manage private bookings",
      description:
        "Review requests, guide group confirmation, and complete each delivered session.",
      icon: IconCalendarEvent,
      steps: [
        {
          id: "tutor-review-booking",
          title: "Accept, decline, or counter a request",
          summary:
            "Open pending requests to see the student's goal, schedule, format, participants, honorarium, and Marks context.",
          actor: "You",
          icon: IconMessageCircle,
          details: [
            "Accept when the request works for your schedule and teaching setup. Online acceptance triggers meeting setup.",
            "Decline with a written reason when you cannot take it. The student can look for another tutor.",
            "Counter-propose a different time when the goal fits but the schedule does not.",
            "Respond within **12 hours**, unless the session starts sooner.",
            "The decision, reason, actor, and time are recorded in booking history.",
          ],
          statuses: [
            { label: "Waiting for tutor review", variant: "warning" },
            { label: "Confirmed", variant: "success" },
            { label: "Declined", variant: "danger" },
          ],
          branches: tutorBookingBranches,
          cta: { label: "Open booking requests", to: "/bookings" },
        },
        {
          id: "tutor-confirm-group",
          title: "Wait for group confirmation",
          summary:
            "Group and series requests may need every active student to accept before the schedule is final.",
          actor: "Students and Cogito",
          icon: IconUsersGroup,
          details: [
            "The proposer is accepted automatically; other required participants remain pending.",
            "Each confirmation or reconfirmation step allows **12 hours**, capped by the session start when it is sooner.",
            "If confirmed headcount is below **2**, the group expires. With **2 or more** participants but below target, the price is recalculated and everyone reconfirms.",
            "A confirmed participant withdrawal before H-2 triggers repricing and reconfirmation; after H-2, late-cancel or no-show handling applies.",
            "Series sessions confirm independently.",
          ],
          statuses: [
            { label: "Waiting for participants", variant: "info" },
            { label: "Expired", variant: "danger" },
          ],
          cta: { label: "Monitor bookings", to: "/bookings" },
        },
        {
          id: "tutor-reschedule",
          title: "Propose a new time",
          summary:
            "Propose or respond to a new time while the original schedule remains authoritative.",
          actor: "You and the participants",
          icon: IconRefresh,
          details: [
            "You can counter-propose outside the published availability window when the time does not overlap another active booking.",
            "The proposal is counted as accepted by you. Every active student must accept before the new time applies.",
            "A proposal stays open for **24 hours**. Rejection or expiry keeps the original schedule.",
            "Series sessions are negotiated independently, and each session row has its own action.",
            "A written reason is required for the proposal.",
          ],
          statuses: [{ label: "Reschedule proposed", variant: "warning" }],
          branches: sharedRescheduleBranches,
          cta: { label: "Review bookings", to: "/bookings" },
        },
        {
          id: "tutor-complete",
          title: "Complete a delivered session",
          summary:
            "Record the three-field report after the session ends. Completion deducts the correct student allocations and creates one earned fee.",
          actor: "You and Cogito",
          icon: IconCheck,
          details: [
            "Complete a session only after it ends. A report before the session end is rejected.",
            "The report has three required fields: session discussion, strengths observed, and areas for improvement. Each field allows up to **600 characters** after normalization.",
            "The first submission completes the delivery, deducts the correct student allocations once, and creates exactly one tutor fee.",
            "A missing report keeps the student hold pending and creates no payable fee. Reminders continue until the report is recorded.",
            "A repeated submission with the same request returns the same report and does not create a second fee.",
            "An admin can correct report text later with a reason. The correction changes text and version only, never the fee or wallet outcome.",
          ],
          statuses: [
            { label: "Completed", variant: "success" },
            { label: "Report pending", variant: "warning" },
            { label: "No-show review", variant: "danger" },
          ],
          cta: { label: "Open session reports", to: "/class-reports" },
        },
      ],
    },
    {
      id: "tutor-classes",
      title: "Teach assigned classes",
      description:
        "See the sessions you teach, report absence when needed, and record each class report.",
      icon: IconSchool,
      steps: [
        {
          id: "tutor-class-list",
          title: "Open your assigned classes",
          summary:
            "Use the Classes area to see every cohort and masterclass session assigned to you.",
          actor: "You",
          icon: IconSchool,
          details: [
            "The list shows class and session title, a CLS reference, Jakarta date and time, format, and status.",
            "Upcoming sessions sort first. Open a class to see its description, assigned sessions, curriculum, and format.",
            "Online sessions show Join meeting when the stored Google Meet link is ready.",
            "In-person sessions show the assigned room name and location.",
            "A started session links to the report workspace so you can record or view its report.",
          ],
          statuses: [
            { label: "Scheduled", variant: "primary" },
            { label: "Awaiting report", variant: "warning" },
            { label: "Completed", variant: "success" },
          ],
          cta: { label: "Open my classes", to: "/my-classes" },
        },
        {
          id: "tutor-absence",
          title: "Report an absence",
          summary:
            "Notify Cogito before or after the start while the session is not completed.",
          actor: "You and Admin",
          icon: IconAlertTriangle,
          details: [
            "Report an absence from the assigned class session. A written reason is required.",
            "The server records the notice time. A notice strictly under **24 hours** before the start is marked late.",
            "You can report after the start while the session is not completed.",
            "An admin sees your per-tutor absence history with the reason and WIB timestamp.",
            "The admin can replace you at the same date and time. The replacement preserves the schedule, fee identity, and student allocations; it grants no new student exit right.",
          ],
          statuses: [
            { label: "Notice recorded", variant: "info" },
            { label: "Late notice", variant: "warning" },
            { label: "Tutor replaced", variant: "success" },
          ],
          branches: [
            {
              title: "The admin replaces you",
              trigger:
                "You report an absence and the admin finds a compatible replacement at the same time.",
              outcome:
                "The replacement is validated against schedule, mode, capacity, and conflicts. Earned fee ownership never moves to the replacement for an already delivered session.",
              variant: "info",
              cta: { label: "Open my classes", to: "/my-classes" },
            },
          ],
          cta: { label: "Open my classes", to: "/my-classes" },
        },
        {
          id: "tutor-class-report",
          title: "Record the class session report",
          summary:
            "Submit the same three feedback fields for a delivered cohort or masterclass session.",
          actor: "You and Cogito",
          icon: IconNotes,
          details: [
            "A report is required for each delivered class session, just like a private booking.",
            "The three fields are nonempty, line-based, and limited to **600 characters** each.",
            "Reporting completes the session, spends the correct funded allocations, and creates one earned fee for the assigned tutor.",
            "A session with no report keeps its holds pending and has no payable fee.",
            "Recorded private reports can be corrected only by an administrator. Class report corrections follow the same rule.",
          ],
          statuses: [
            { label: "Report pending", variant: "warning" },
            { label: "Report recorded", variant: "success" },
            { label: "Corrected by admin", variant: "info" },
          ],
          cta: { label: "Open session reports", to: "/class-reports" },
        },
      ],
    },
    {
      id: "tutor-finance",
      title: "Track earnings and payout",
      description:
        "Understand gross honorarium, deductions, and the external transfer that pays you.",
      icon: IconWallet,
      steps: [
        {
          id: "tutor-earnings",
          title: "Review unpaid sessions and net payout",
          summary:
            "The dashboard shows unpaid sessions, gross honorarium, tax, transfer fee, and estimated net.",
          actor: "You and Admin",
          icon: IconCoins,
          details: [
            "Each delivered, reported session creates one earned fee. A cohort or masterclass fee is the flat class fee per session; a private fee comes from the booking snapshot.",
            "The summary shows unpaid sessions, gross, applicable tax rate, withholding, transfer fee, and net.",
            "BCA transfers use a zero fee; other banks use a **2,500 IDR** transfer fee, charged once per payout batch.",
            "Later profile, bank, or tax edits never recalculate a recorded payout.",
            "Recent payout history shows covered sessions and recorded transfer status.",
          ],
          statuses: [
            { label: "Unpaid fee", variant: "warning" },
            { label: "Payout prepared", variant: "info" },
            { label: "Transfer recorded", variant: "success" },
          ],
          cta: { label: "Open my dashboard", to: "/dashboard" },
        },
        {
          id: "tutor-payout-lifecycle",
          title: "Follow the payout lifecycle",
          summary:
            "An admin prepares a batch, transfers the money outside Cogito, then records the exact transfer.",
          actor: "Admin",
          icon: IconWallet,
          details: [
            "The admin selects unpaid session fees and prepares a fixed snapshot of bank, tax, fee, and net values.",
            "One earned fee cannot be included in two active payout allocations. Partial tutor payouts are not supported.",
            "The actual transfer must equal the calculated net to mark the batch paid. The admin records the actual amount, actual date, and optional reference or proof.",
            "A mismatch blocks the paid action. The admin must refresh the preview and review the new numbers.",
            "Voiding keeps the transfer history and returns included sessions to unpaid. If money moved, the admin must reconcile that transfer before repaying.",
            "The monthly tax CSV uses recorded transfer dates and snapshots, not current profiles.",
          ],
          statuses: [
            { label: "Prepared", variant: "info" },
            { label: "Paid", variant: "success" },
            { label: "Voided", variant: "danger" },
          ],
          cta: { label: "View payout history", to: "/dashboard" },
        },
      ],
    },
    {
      id: "tutor-tools",
      title: "Use tutor resources",
      description:
        "The guide, FAQ, calendar, Knowledge Bank, and notifications support your teaching work.",
      icon: IconBook,
      steps: [
        {
          id: "tutor-resources",
          title: "Open role resources",
          summary:
            "Check schedules, read answers, browse resources, and respond to class or booking updates.",
          actor: "You",
          icon: IconBook,
          details: [
            "Competition Calendar is available to every authenticated role.",
            "Knowledge Bank uses the same access rules as the student library. Tutors can browse resources they are eligible to read.",
            "FAQ explains common platform rules. WhatsApp support is available from the sidebar.",
            "Notifications cover class publication, schedule changes, report reminders, absence events, and session reviews.",
            "Notification links open the relevant class, booking, or report surface.",
          ],
          statuses: [
            { label: "Resource access", variant: "info" },
            { label: "Action needed", variant: "warning" },
          ],
          branches: [
            {
              title: "You need the competition calendar",
              trigger:
                "You want to check event dates or registration deadlines.",
              outcome:
                "The calendar uses the same month and agenda views as the student app and opens event details directly.",
              variant: "info",
              cta: { label: "Open competition calendar", to: "/calendar" },
            },
          ],
          cta: { label: "Read the FAQ", to: "/faq" },
        },
      ],
    },
  ],
};

const adminContent: GuideContent = {
  label: "Admin guide",
  title: "One operating guide for every admin task.",
  description:
    "Run the daily queue, keep classes and tutors moving, reconcile money, moderate records, and publish content.",
  highlights: [
    {
      label: "Daily work",
      value: "Bookings, rooms, support",
      description:
        "Start with the operations queue and the items that need a decision.",
      icon: IconRoute,
      variant: "primary",
    },
    {
      label: "Money controls",
      value: "Payments and payouts",
      description:
        "Every financial action carries a reason, a snapshot, and an audit record.",
      icon: IconWallet,
      variant: "warning",
    },
    {
      label: "Content",
      value: "Catalog, classes, library",
      description:
        "Keep public offerings, learning records, and website content accurate.",
      icon: IconAdjustments,
      variant: "info",
    },
  ],
  chapters: [
    {
      id: "admin-operations",
      title: "Run daily operations",
      description:
        "Use the dashboard, booking queue, rooms, wallet lookup, and support inbox to resolve exceptions.",
      icon: IconRoute,
      steps: [
        {
          id: "admin-dashboard",
          title: "Start with the admin dashboard",
          summary:
            "See escalations, exceptions, reviews, and business metrics in one place.",
          actor: "Admin",
          icon: IconRoute,
          details: [
            "The dashboard counts escalated bookings, booking exceptions, tutor reviews, and achievement reviews separately.",
            "Selected-period metrics cover bookings, completion rate, active proposers, and account activity.",
            "Business insights separate IDR top-up receipts, delivered services in Marks and sessions, current future commitments, and earned tutor costs.",
            "The funnel follows one cohort of student accounts created in the selected period. Booked, completed, and paid steps remain subsets, so percentages never exceed 100%.",
            "Supply and demand compares the top booked categories with approved or published tutor counts.",
            "Support SLA is a current snapshot of open and in-progress tickets split into due-within-4-hours and breached. Missing private rates or payment dates show an explicit notice, never a guessed total.",
          ],
          statuses: [
            { label: "No action", variant: "success" },
            { label: "Needs attention", variant: "warning" },
            { label: "Escalated", variant: "danger" },
          ],
          cta: { label: "Open admin dashboard", to: "/admin" },
        },
        {
          id: "admin-booking-queue",
          title: "Work the booking queue",
          summary:
            "Find stalled bookings, inspect the timeline, and take the next action from the canonical booking detail.",
          actor: "Admin",
          icon: IconAdjustments,
          details: [
            "Filter the queue by booking number, override category, urgency, and SLA.",
            "Rows show the booking, schedule, status, override, affected state, SLA, held Marks, and detail or override actions.",
            "The canonical booking detail shows student, tutor, schedule, mode, status, participants, notes, state history, holds, refunds, and tutor honorarium.",
            "Waiting steps allow **12 hours** for a response unless the session starts sooner. Student reschedule proposals close at **H-2 (2 hours before start)**.",
            "Student cancellation remains available until the scheduled start. Inside H-2, the cancellation forfeits held Marks and an exception needs audited admin review.",
            "Override categories are tutor no-show, medical emergency, technical failure, admin correction, student no-show, and force cancel.",
            "Every override requires a reason and writes an audit record. A terminal booking cannot be overridden again.",
            "Marks choices are: leave Marks unchanged, return held Marks, return held Marks plus equal compensation, or deduct held Marks as a penalty. Student no-show forfeits holds and keeps the tutor payout-eligible; other categories return holds and make the tutor ineligible.",
          ],
          statuses: [
            { label: "Needs attention", variant: "warning" },
            { label: "Scheduled", variant: "primary" },
            { label: "Completed", variant: "success" },
          ],
          cta: { label: "Open operations", to: "/admin-operations" },
        },
        {
          id: "admin-rooms",
          title: "Approve offline rooms",
          summary:
            "Assign, relocate, edit, deactivate, or cancel a room while keeping capacity and history correct.",
          actor: "Admin",
          icon: IconMapPin,
          details: [
            "Offline bookings enter the room queue after participants confirm. Decide within **12 hours**, or before the session starts when that is sooner.",
            "The room capacity must cover the booking group. A capacity-1 room cannot host a 2-person group or a larger class session.",
            "Assigning a room schedules the booking and notifies participants. Relocation keeps the booking and records the old and new room.",
            "Use Add room to create a room. In Active rooms, Edit changes the name, location, or capacity. Deactivate removes an unused room from new bookings but keeps its history.",
            "If no room works, cancel the room booking with a reason so the participant outcome and Marks rules stay clear.",
          ],
          statuses: [
            { label: "Awaiting room approval", variant: "warning" },
            { label: "Room confirmed", variant: "success" },
            { label: "Relocated", variant: "info" },
          ],
          branches: [
            {
              title: "No suitable room exists",
              trigger:
                "The room queue cannot satisfy the requested format, schedule, or capacity.",
              outcome:
                "Cancel the room booking with a reason so the participant-facing outcome and Marks rules remain visible.",
              variant: "danger",
              cta: { label: "Open operations", to: "/admin-operations" },
            },
          ],
          cta: { label: "Open room approvals", to: "/admin-operations" },
        },
        {
          id: "admin-support",
          title: "Handle wallet lookup and support tickets",
          summary:
            "Inspect a wallet, then resolve lateness, no-show, and issue tickets against their SLA.",
          actor: "Admin",
          icon: IconHeadset,
          details: [
            "Wallet lookup searches a user and shows available, held, and total Marks with the ledger.",
            "Support tickets appear in their own tab beside the booking queue and room approvals.",
            "A lateness or issue report can be sent after the scheduled start. Lateness reports become eligible after the **15-minute** tolerance window.",
            "Support targets **30 minutes** during business hours (Monday to Saturday, **09:00 to 21:00 WIB**) and **4 hours** outside business hours.",
            "Overdue open tickets are marked, and late tickets are escalated in the queue. Resolve a ticket through the support action.",
            "The booking queue uses booking override SLAs; it does not include support tickets.",
          ],
          statuses: [
            { label: "Open ticket", variant: "warning" },
            { label: "Escalated", variant: "danger" },
            { label: "Resolved", variant: "success" },
          ],
          cta: { label: "Open support tickets", to: "/admin-operations" },
        },
      ],
    },
    {
      id: "admin-tutors",
      title: "Manage tutors",
      description:
        "Invite tutors, review their public profile, and keep payout identities valid.",
      icon: IconUsersGroup,
      steps: [
        {
          id: "admin-invite",
          title: "Invite a tutor",
          summary:
            "Send a single-use invitation and confirm the account before onboarding starts.",
          actor: "Admin",
          icon: IconMail,
          details: [
            "Enter the email address, optional recipient name, and optional internal notes.",
            "Check the preflight result: it shows the existing account role and linked auth methods when the email is already registered.",
            "An invite link expires after **7 days**, works once, and stops working when revoked.",
            "Resend creates a new token and invalidates the old one. If email delivery fails, copy the current link and send it manually.",
            "The invitation list shows status and last update. An admin account cannot be silently demoted by a tutor claim.",
          ],
          statuses: [
            { label: "Invited", variant: "info" },
            { label: "Accepted", variant: "success" },
            { label: "Expired or revoked", variant: "danger" },
          ],
          cta: { label: "Manage tutor invites", to: "/admin-tutors" },
        },
        {
          id: "admin-review-tutor",
          title: "Review and publish tutor profiles",
          summary:
            "Check the profile, specializations, proof, photo, and payout account before students can find the tutor.",
          actor: "Admin",
          icon: IconShieldCheck,
          details: [
            "The review page shows the profile, teaching mode, specializations, credentials, education, achievements, experience, proofs, photo, and payout account.",
            "Approve a profile, ask for changes, publish, unpublish, or suspend it when needed.",
            "A photo or proof edit applies only on approval. Published public values stay visible while a new change is reviewed.",
            "If you ask for changes, the tutor can edit and submit again.",
            "The action, actor, time, and before/after state are audited.",
          ],
          statuses: [
            { label: "Pending review", variant: "warning" },
            { label: "Approved", variant: "info" },
            { label: "Published", variant: "success" },
            { label: "Changes requested", variant: "danger" },
            { label: "Suspended", variant: "danger" },
          ],
          cta: { label: "Review tutor profiles", to: "/admin-tutors" },
        },
        {
          id: "admin-tutor-tax",
          title: "Check payout and tax identity",
          summary:
            "Confirm the bank, legal name, NIK, and optional NPWP before a new payout batch.",
          actor: "Admin",
          icon: IconWallet,
          details: [
            "A tutor needs a bank account, holder name, opening city, ownership confirmation, legal name, and **16-digit NIK** before a new payout is prepared.",
            "NPWP is optional. Tax rates default to **2.50%** with NIK and NPWP, **3.00%** with NIK only or no tax identity, and a tutor override can replace either.",
            "Tax identity is visible only to the tutor and payout admins.",
            "Values are snapshotted into each payout. A later profile edit never recalculates a recorded payout.",
            "Existing published tutors may continue teaching, but payout preparation waits for a valid tax profile.",
          ],
          statuses: [
            { label: "Tax profile ready", variant: "success" },
            { label: "Tax profile missing", variant: "danger" },
          ],
          cta: { label: "Open tutor payouts", to: "/admin-tutor-payouts" },
        },
      ],
    },
    {
      id: "admin-classes",
      title: "Build and run classes",
      description:
        "Create cohorts and masterclasses, publish meetings, and manage every session change.",
      icon: IconSchool,
      steps: [
        {
          id: "admin-class-studio",
          title: "Create and publish a class",
          summary:
            "Build the class, sessions, tutors, capacity, rates, and fee before publication.",
          actor: "Admin",
          icon: IconSchool,
          details: [
            "Choose cohort or masterclass. A masterclass has exactly **1 session**. A cohort can have multiple sessions.",
            "Add competition, title, description, capacity, dates, session tutors, curriculum, and the agreed flat tutor fee. New forms start at Rp400,000 per cohort session or Rp300,000 per masterclass; these are editable defaults.",
            "Each session has a date, time, duration, capacity, mode, tutor, and online or offline access settings. A tutor can differ per session.",
            "Publication requires an active competition, active rates, valid tutors, and session fees that match the class fee.",
            "Saving a draft and publishing require a reason and write an audit. Editing a published class saves pending changes first.",
            "Publishing queues one Google Meet per online session. Re-publish or retry cannot create a duplicate active meeting. In-person sessions use an existing admin-managed room.",
            "Changes notify affected students and tutors without an acceptance step.",
          ],
          statuses: [
            { label: "Draft", variant: "secondary" },
            { label: "Published", variant: "success" },
            { label: "Meeting pending", variant: "warning" },
          ],
          cta: { label: "Open class studio", to: "/admin-classes" },
        },
        {
          id: "admin-class-lifecycle",
          title: "Run the class lifecycle",
          summary:
            "Check minimum enrollment, postpone once, reschedule, replace a tutor, or cancel without erasing delivered fees.",
          actor: "Admin",
          icon: IconCalendarEvent,
          details: [
            "The minimum-enrollment check allows continue, postpone once, or cancel. The decision requires a reason and is notified to students and the tutor.",
            "A postponement grants enrolled students a **3-day** penalty-free withdrawal window.",
            "A schedule change applies to one undelivered session. Affected students get the earlier of **24 hours after notification** and the new start to cancel that session. Delivered sessions are not refunded.",
            "Same-time tutor replacement validates profile, mode, capacity, and conflicts. It preserves the schedule, fee identity, and allocations, and grants no new exit right.",
            "Cancelling a session returns unspent holds. Cancelling a running class returns remaining holds but never erases fees for sessions already delivered.",
            "The session accordion shows capacity, format, meeting, room, tutor, absence history, and the actions for time changes, replacement, cancellation, and meeting retry.",
          ],
          statuses: [
            { label: "Minimum check due", variant: "warning" },
            { label: "Postponed", variant: "info" },
            { label: "Cancelled", variant: "danger" },
          ],
          branches: adminClassBranches,
          cta: { label: "Manage classes", to: "/admin-classes" },
        },
      ],
    },
    {
      id: "admin-finance",
      title: "Reconcile money",
      description:
        "Handle payments and refunds, tutor payouts, economy revisions, and referral settlement.",
      icon: IconWallet,
      steps: [
        {
          id: "admin-payments",
          title: "Review payments and start a refund",
          summary:
            "Use the read-only payment list to find a purchase, then refund through the audited wallet path.",
          actor: "Admin",
          icon: IconCreditCard,
          details: [
            "The Payments page lists purchases newest first with user identity, purchase label, amount, Marks, status, provider reference, and provider refund facts.",
            "Filters cover status, a **2–100 character** search over user name, email, or provider reference, and a WIB date range.",
            "The list is cursor-paginated and returns a server-side total for the current filters. It makes no provider call.",
            "The refund action is available only for **PAID** and **SETTLED** rows. It requires a reason and reuses the audited wallet correction path.",
            "If the credited Marks were already spent, a blind refund is blocked. Use a compensating correction instead.",
          ],
          statuses: [
            { label: "Paid", variant: "success" },
            { label: "Settled", variant: "primary" },
            { label: "Refunded", variant: "warning" },
          ],
          cta: { label: "Open payments", to: "/admin-payments" },
        },
        {
          id: "admin-payouts",
          title: "Pay tutors and reconcile transfers",
          summary:
            "Prepare a batch, record the external transfer, void with history, and export tax data.",
          actor: "Admin",
          icon: IconWallet,
          details: [
            "Select unpaid session fees to prepare a versioned batch with saved bank, tax rate, transfer fee, and net values.",
            "Gross, withholding, transfer fee, and net are snapshotted for the preview. An earned fee cannot enter two active payout allocations. Partial tutor payouts are not supported.",
            "After the bank transfer happens outside Cogito, record the exact net amount, actual date, and optional reference or proof.",
            "The actual amount must equal the calculated net. A mismatch cannot be marked paid; refresh the preview if the tutor profile or tax configuration changed.",
            "Voiding keeps transfer evidence and returns fees to unpaid. If money moved, reconcile the external transfer with an audited reason before repayment.",
            "Download the monthly tax CSV from recorded paid snapshots, using actual payment dates and not current profiles.",
          ],
          statuses: [
            { label: "Prepared", variant: "info" },
            { label: "Paid", variant: "success" },
            { label: "Void pending reconciliation", variant: "danger" },
          ],
          cta: { label: "Open tutor payouts", to: "/admin-tutor-payouts" },
        },
        {
          id: "admin-economy",
          title: "Manage economy settings",
          summary:
            "Edit the V3 rate card, preview prices, save a draft, then activate it with a reason.",
          actor: "Admin",
          icon: IconCoins,
          details: [
            "The active rate card is separate from the latest saved revision and from unsaved edits.",
            "Edit package Marks and prices, exact-amount surcharge, competition solo Marks and tutor fees, online increments, and offline adjustments.",
            "Preview solo, group, online, and offline prices for **1 to 6** students before saving a draft.",
            "Saving a draft does not activate it. Existing quotes, bookings, and classes keep their saved revision.",
            "Activation requires the latest saved revision, the expected active revision, and a reason. A stale activation returns a conflict.",
            "Package Marks must be unique and ascending, every price positive, and every required competition mapped.",
          ],
          statuses: [
            { label: "Draft saved", variant: "info" },
            { label: "Active revision", variant: "success" },
            { label: "Stale conflict", variant: "danger" },
          ],
          cta: { label: "Open economy settings", to: "/admin-economy" },
        },
        {
          id: "admin-referrals",
          title: "Manage referrals and KOL settlement",
          summary:
            "Audit saved signup choices, edit reward settings, run campaigns, and reconcile commissions.",
          actor: "Admin",
          icon: IconUsersGroup,
          details: [
            "The Activity tab lists saved signup choices with attribution, email verification, welcome credit, friend completion decision, and KOL payment evidence. Totals use linked ledger credits, not current wallet balances.",
            "Referral settings edit the welcome Marks, friend reward, and semester cap. The save sends the loaded version and a required reason; a stale version returns an error.",
            "A KOL campaign needs a unique uppercase code of **4–32** letters or digits, a name, an expiry, an attribution window, and at least one nonzero flat or percentage commission.",
            "Campaign terms lock at signup. Saved terms cannot be edited. Pausing stops new sign-ups only; existing choices keep their attribution window.",
            "One first successful IDR purchase creates one commission, even when provider events repeat. Calculated, transferred, and outstanding amounts stay separate; overpayment remains visible.",
            "A transfer binds to one commission decision. Adjustments require a reason, expected obligation, and before/after audit. A full invalidation voids the effective obligation while keeping cash history.",
            "The monthly CSV lists attributed users, qualifying purchases, calculated, transferred, and outstanding amounts.",
          ],
          statuses: [
            { label: "Attribution saved", variant: "info" },
            { label: "Commission outstanding", variant: "warning" },
            { label: "Settled", variant: "success" },
          ],
          cta: { label: "Open referrals", to: "/admin-referrals" },
        },
      ],
    },
    {
      id: "admin-records",
      title: "Moderate learning records",
      description:
        "Review achievements and session reports without changing settled finance.",
      icon: IconAward,
      steps: [
        {
          id: "admin-achievements",
          title: "Review student achievements",
          summary:
            "Check evidence, correct a pending submission, then approve or reject with a clear reason.",
          actor: "Admin",
          icon: IconAward,
          details: [
            "Tabs show all, pending, approved, and rejected counts.",
            "A submission shows student, event, category, award, level, date, location, description, skills, and proof link.",
            "You can correct a pending submission before you decide.",
            "Approval publishes the achievement. Rejection requires a note and notifies the student.",
            "Every decision is audited.",
          ],
          statuses: [
            { label: "Pending review", variant: "warning" },
            { label: "Approved", variant: "success" },
            { label: "Rejected", variant: "danger" },
          ],
          cta: { label: "Review achievements", to: "/admin-achievements" },
        },
        {
          id: "admin-session-reports",
          title: "Search, export, and correct reports",
          summary:
            "Open any eligible student's report history and keep report text and finance separate.",
          actor: "Admin",
          icon: IconNotes,
          details: [
            "Search by student name or email, then open their eligible reports.",
            "You can export a PDF for any eligible student. Reports cover the last **3 calendar months**, newest first, up to **100** selected reports.",
            "To record on a tutor's behalf, provide all three fields, confirm delivery, and enter a reason. The tutor is notified.",
            "A correction changes report text and version only. It records the acting role and time. It never changes Marks, referrals, or earned fees.",
            "Use an audited financial adjustment when money must change.",
          ],
          statuses: [
            { label: "Report pending", variant: "warning" },
            { label: "Recorded", variant: "success" },
            { label: "Corrected", variant: "info" },
          ],
          cta: { label: "Open session reports", to: "/class-reports" },
        },
      ],
    },
    {
      id: "admin-content",
      title: "Publish and govern content",
      description:
        "Maintain the competition catalog, library, calendar, FAQ, activities, blog, and access records.",
      icon: IconBook,
      steps: [
        {
          id: "admin-competitions",
          title: "Manage the competition catalog",
          summary:
            "Create parents and child specializations that feed tutors, classes, bookings, pricing, and public labels.",
          actor: "Admin",
          icon: IconAdjustments,
          details: [
            "The catalog has two levels: parent competition and child specialization. A child belongs to one parent.",
            "English is required and Indonesian is optional. The app shows the English label.",
            "Parent competition owns the rates and four theme colors: light text, light background, dark text, and dark background. A child inherits both.",
            "Archive hides an entry from new selections while existing tutors, bookings, classes, reports, and prices keep their history and agreed terms.",
            "Delete only unused entries. A referenced entry returns a conflict and must be archived instead.",
            "Every write requires a reason and uses an expected version. A stale edit returns a conflict instead of overwriting another admin.",
          ],
          statuses: [
            { label: "Active", variant: "success" },
            { label: "Draft", variant: "secondary" },
            { label: "Archived", variant: "warning" },
          ],
          cta: { label: "Open competition catalog", to: "/admin-competitions" },
        },
        {
          id: "admin-knowledge-bank",
          title: "Manage Knowledge Bank resources",
          summary:
            "Publish private PDF resources and grant temporary access to eligible students.",
          actor: "Admin",
          icon: IconBook,
          details: [
            "A resource has a title, description, category, active state, version, and private PDF.",
            "Save requires a reason and rejects a stale version.",
            "Imported records can be archived but not hard-deleted.",
            "Student access opens at **35 total Marks** or through a temporary grant that expires automatically.",
            "Private files deny anonymous and ineligible access. They are never public URLs.",
            "Grant access from the admin Knowledge Bank page, with an expiry and note. Removing a grant keeps the audit history.",
          ],
          statuses: [
            { label: "Published resource", variant: "success" },
            { label: "Temporary grant", variant: "info" },
            { label: "Grant expired", variant: "warning" },
          ],
          cta: {
            label: "Open Knowledge Bank access",
            to: "/admin-knowledge-bank",
          },
        },
        {
          id: "admin-calendar",
          title: "Manage the competition calendar",
          summary:
            "Add events, categories, and dates that feed the app and public calendar.",
          actor: "Admin",
          icon: IconCalendarEvent,
          details: [
            "An event has a title, description, category links, start and end date, location, organizer, registration deadline, and links.",
            "Knowledge Bank and calendar entries use one title, one description, and one location value. Enter them in the available language; no English and Indonesian pair is required.",
            "Save requires a reason and detects a stale version.",
            "The calendar dedupes by event identity and displayed date. Distinct events with the same title stay separate.",
            "Archived imported records remain readable and cannot be hard-deleted.",
          ],
          statuses: [
            { label: "Draft event", variant: "secondary" },
            { label: "Published event", variant: "success" },
            { label: "Archived", variant: "warning" },
          ],
          cta: { label: "Open competition calendar", to: "/calendar" },
        },
        {
          id: "admin-website-content",
          title: "Publish FAQ, activities, and blog",
          summary:
            "Keep public explanations and articles current while preserving language and publish rules.",
          actor: "Admin",
          icon: IconBook,
          details: [
            "FAQ requires an English question and answer. Indonesian is optional. Order, active, and Show on landing are editable.",
            "All active FAQ entries appear on the full page. The landing page shows active entries with the landing flag, capped at **6**, in the same order.",
            "Activities articles include a cover, title, description, rich body, WIB schedule, location, and draft or published state. Registration links live inside the body.",
            "Blog articles have shared fields and up to two locale versions. Each locale publishes independently. A slug locks after its first publish.",
            "The blog publish gate checks required editorial fields, hero media and alt text, key facts, and gallery alt text. Body images require alt text.",
            "Content saves invalidate public caches. Deactivating FAQ hides it from both pages even when the landing flag remains on.",
          ],
          statuses: [
            { label: "Draft", variant: "secondary" },
            { label: "Published", variant: "success" },
            { label: "Archived", variant: "warning" },
          ],
          branches: [
            {
              title: "Write a blog article",
              trigger:
                "An article needs shared fields, locale versions, and approved media.",
              outcome:
                "The editor stores structured rich text, checks image alt text, and publishes each locale independently. A slug locks after its first publish.",
              variant: "info",
              cta: { label: "Open blog admin", to: "/admin-blog" },
            },
            {
              title: "Add an activity article",
              trigger:
                "A simulation day, townhall, or other community activity needs a public article.",
              outcome:
                "The article editor collects the cover, bilingual title and description, rich body, WIB schedule, location, and draft or published state.",
              variant: "info",
              cta: { label: "Open activities", to: "/activities" },
            },
          ],
          cta: { label: "Manage FAQ", to: "/faq" },
        },
        {
          id: "admin-governance",
          title: "Manage admins and review the audit log",
          summary:
            "Super admins control admin access; every admin can read the audit history.",
          actor: "Super admin and Admin",
          icon: IconShieldCheck,
          details: [
            "The admin roster is available only to super admins. It lists current access levels and lets a super admin promote an existing account by email or remove admin access.",
            "The person must sign up first. There is no account creation, suspension, ban, or session-revocation flow from this page.",
            "The last-admin guard prevents removing the final admin. Fixed super-admin emails cannot be demoted or removed.",
            "Each grant or revoke writes the existing role-change audit event.",
            "The Audit Log is read-only. Filter by action, target type, target ID, actor ID, and date. Action and target-type filters match partial text; IDs must match exactly.",
            "The viewer does not expose a mutation endpoint and does not change audit writers.",
          ],
          statuses: [
            { label: "Super admin", variant: "primary" },
            { label: "Admin", variant: "info" },
            { label: "Access removed", variant: "warning" },
          ],
          branches: [
            {
              title: "Promote or remove an admin",
              trigger:
                "An existing account needs admin access, or an admin should return to student access.",
              outcome:
                "A super admin uses the roster page by email. The last-admin guard and fixed super-admin protection still apply, and every change is audited.",
              variant: "warning",
              cta: { label: "Open admin roster", to: "/admin-admins" },
            },
          ],
          cta: { label: "Open audit log", to: "/admin-audit" },
        },
      ],
    },
  ],
};

export const GUIDE_CONTENT: Record<GuideView, GuideContent> = {
  student: studentContent,
  tutor: tutorContent,
  admin: adminContent,
};
