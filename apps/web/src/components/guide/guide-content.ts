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
  IconHeadset,
  IconMail,
  IconMapPin,
  IconMessageCircle,
  IconNotes,
  IconRefresh,
  IconRoute,
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
  | "/calendar"
  | "/achievements"
  | "/tutors"
  | "/knowledge-bank"
  | "/notifications"
  | "/onboarding"
  | "/availability"
  | "/admin"
  | "/admin-tutors"
  | "/admin-operations"
  | "/admin-achievements"
  | "/admin-economy";

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
    description: "From finding a tutor to finishing a learning session.",
  },
  tutor: {
    label: "Tutor journey",
    shortLabel: "Tutor",
    description: "From profile review to teaching and getting paid.",
  },
  admin: {
    label: "Admin operations",
    shortLabel: "Admin",
    description: "The queues and decisions that keep every session moving.",
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
      "Review the counter-proposal within its **24-hour** proposal window. The booking stays in negotiation until the required participants accept it.",
    variant: "warning",
    cta: { label: "Open my bookings", to: "/bookings" },
  },
  {
    title: "A group member is still deciding",
    trigger:
      "A group or series invitee has not confirmed within the **12-hour** response window, or before the session starts if sooner.",
    outcome:
      "The booking waits for participant confirmation. If the deadline passes, it can expire and held Marks return within **12 hours** after expiry.",
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
      "The booking remains confirmed while the scheduler retries every **5 minutes**, for up to **3 attempts**. The assigned tutor or an admin can add a manual link when needed.",
    variant: "warning",
    cta: { label: "Check booking status", to: "/bookings" },
  },
  {
    title: "The tutor is late or absent",
    trigger:
      "Attendance is not confirmed after the **15-minute** lateness window.",
    outcome:
      "The session is flagged for admin review. If the tutor is absent past **15 minutes**, affected students' held Marks are released according to the no-show policy. A participant can submit a support report from the booking detail.",
    variant: "danger",
    cta: { label: "Open booking detail", to: "/bookings" },
  },
];

const studentContent: GuideContent = {
  label: "Student guide",
  title: "From finding a tutor to finishing your session.",
  description:
    "Follow the next move and see what happens to your Marks along the way.",
  highlights: [
    {
      label: "Session length",
      value: "90 minutes",
      description: "Every booking session has a fixed duration.",
      icon: IconClock,
      variant: "primary",
    },
    {
      label: "Learning currency",
      value: "Marks",
      description: "Marks are held while a booking is being confirmed.",
      icon: IconCoins,
      variant: "warning",
    },
    {
      label: "Session format",
      value: "Online or offline",
      description: "The confirmed booking explains where to meet.",
      icon: IconVideo,
      variant: "info",
    },
  ],
  chapters: [
    {
      id: "student-start",
      title: "Start with a learning goal",
      description:
        "Set up your account, understand Marks, and find the right tutor for what you want to learn.",
      icon: IconSparkles,
      steps: [
        {
          id: "student-account",
          title: "Set up your account",
          summary:
            "Verify your account, add your learning profile, and make sure you have enough Marks for a booking.",
          actor: "You",
          icon: IconUserPlus,
          details: [
            "Your Marks balance is ready when you enter the app and shows what you can use for a session.",
            "Your learning profile helps tutors prepare for your level and goals.",
            "Balance shows what you have, what is held, and what has changed.",
            "**Purchased Marks do not expire.**",
          ],
          statuses: [
            { label: "Profile ready", variant: "success" },
            { label: "Marks available", variant: "info" },
          ],
          cta: { label: "View my balance", to: "/balance" },
        },
        {
          id: "student-discover",
          title: "Find a tutor",
          summary:
            "Browse published tutors by subject, expertise, and session format, then inspect their availability.",
          actor: "You",
          icon: IconSearch,
          details: [
            "Use the subject and modality filters to narrow the list.",
            "Open a tutor profile to compare their teaching setup, pricing, and future availability.",
            "Choose one session for a solo booking or multiple dates for a series.",
          ],
          statuses: [{ label: "Published tutor", variant: "success" }],
          cta: { label: "Explore tutors", to: "/tutors" },
        },
      ],
    },
    {
      id: "student-booking",
      title: "Request a session",
      description:
        "Choose the format, schedule, and goal. Then follow the booking as the other participants respond.",
      icon: IconCalendarEvent,
      steps: [
        {
          id: "student-request",
          title: "Create a solo, group, or series booking",
          summary:
            "Select a 90-minute start time, add your learning goal, and invite other students when needed.",
          actor: "You",
          icon: IconCalendarShare,
          details: [
            "A single selected session creates a one-time booking; **2 to 4 sessions** create a series commitment.",
            "A group booking keeps the per-student amount and participant confirmation visible.",
            "Marks are held according to the booking before the request moves through review.",
            "Tutor response, participant confirmation, and reconfirmation each have a **12-hour** window, capped by the session start when it is sooner.",
            "If a booking expires or scheduling fails, held Marks return within **12 hours** of the event.",
          ],
          statuses: [
            { label: "Waiting for tutor review", variant: "warning" },
            { label: "Waiting for participant confirmation", variant: "info" },
          ],
          branches: sharedBookingBranches,
          cta: { label: "See my bookings", to: "/bookings" },
        },
        {
          id: "student-confirmed",
          title: "Wait for confirmation and scheduling",
          summary:
            "Once the tutor and required participants agree, the booking becomes confirmed and the access details are prepared.",
          actor: "Tutor, participants, and Cogito",
          icon: IconUserCheck,
          details: [
            "Confirmed means the agreed schedule is locked into the booking lifecycle.",
            "Online bookings receive a meeting link; offline bookings may wait for room approval.",
            "The detail page explains the current state, next action, and Marks impact.",
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
                "The booking remains visible while the admin assigns, relocates, or cancels the room request. The room decision has a **12-hour** window, capped at session start if it is sooner.",
              variant: "info",
            },
            {
              title: "A meeting link is delayed",
              trigger:
                "The provider needs another attempt to create the online meeting.",
              outcome:
                "The booking stays confirmed while the scheduler retries every **5 minutes**, for up to **3 attempts**. The detail page shows when scheduling is still being retried.",
              variant: "warning",
            },
          ],
          cta: { label: "Open booking status", to: "/bookings" },
        },
      ],
    },
    {
      id: "student-session",
      title: "Attend, adapt, and finish",
      description:
        "The schedule can still change before the session, and support remains available if the session does not go as planned.",
      icon: IconVideo,
      steps: [
        {
          id: "student-reschedule",
          title: "Reschedule when plans change",
          summary:
            "A tutor or booking proposer can suggest a new time. The original schedule stays active until everyone accepts.",
          actor: "Tutor, you, and confirmed students",
          icon: IconRefresh,
          details: [
            "Series sessions are negotiated independently by session.",
            "The person who proposes a time is automatically counted as accepted.",
            "Every other required voter must accept before the new time takes effect.",
            "Student self-service cancel or reschedule is available only before **H-2 (2 hours before the session)**. After H-2, self-service changes are blocked and an admin exception is required.",
          ],
          statuses: [{ label: "Reschedule proposed", variant: "warning" }],
          branches: sharedRescheduleBranches,
          cta: { label: "Review bookings", to: "/bookings" },
        },
        {
          id: "student-attend",
          title: "Join the session",
          summary:
            "Use the meeting link or room information on the booking detail and bring the learning goal you submitted.",
          actor: "You and your tutor",
          icon: IconMapPin,
          details: [
            "Online bookings show the meeting access when scheduling succeeds.",
            "Offline bookings show the assigned room and location.",
            "Keep notes and follow-up context in the booking after the lesson.",
          ],
          statuses: [{ label: "Scheduled", variant: "primary" }],
          branches: sharedSessionBranches,
          cta: { label: "Open booking status", to: "/bookings" },
        },
        {
          id: "student-finish",
          title: "Complete the learning cycle",
          summary:
            "After the session, the booking records the outcome and applies the final Marks and payout rules.",
          actor: "Cogito and the session participants",
          icon: IconCheck,
          details: [
            "Completed sessions move the booking to its final completed state.",
            "Before **H-2 (2 hours before the session)**, a normal cancellation releases held Marks. After H-2, late cancellation or no-show forfeits them unless an admin override is recorded.",
            "If something went wrong, submit a support report from the booking flow so an admin can investigate.",
          ],
          statuses: [
            { label: "Completed", variant: "success" },
            { label: "Cancelled or refunded", variant: "danger" },
          ],
          branches: [
            {
              title: "The session is cancelled",
              trigger:
                "A participant cancels before or after **H-2**, or an admin cancels before the session is complete.",
              outcome:
                "Before H-2, held Marks are released. After H-2, the late-cancellation rule applies and Marks are not automatically refunded unless an admin override is recorded.",
              variant: "warning",
            },
            {
              title: "You need help",
              trigger:
                "The tutor is late, absent, or the booking has another issue.",
              outcome:
                "Create a support report; lateness reports become eligible after the **15-minute** tolerance window.",
              variant: "danger",
              cta: { label: "Open booking detail", to: "/bookings" },
            },
          ],
          cta: { label: "Review my bookings", to: "/bookings" },
        },
      ],
    },
    {
      id: "student-tools",
      title: "Keep learning between sessions",
      description:
        "The rest of Cogito helps you plan, track, and continue your learning outside a single booking.",
      icon: IconBook,
      steps: [
        {
          id: "knowledge-bank",
          title: "Use your learning tools",
          summary:
            "Check competitions, record achievements, and unlock Knowledge Bank resources when your Marks balance qualifies.",
          actor: "You",
          icon: IconAward,
          details: [
            "Competition Calendar is available to every authenticated role.",
            "Achievements are submitted by students and reviewed by admins.",
            "Knowledge Bank opens at **35 total Marks**; held Marks count toward eligibility.",
            "Notifications keep booking, payment, refund, and system updates in one place.",
          ],
          statuses: [
            { label: "35 Marks unlock", variant: "info" },
            { label: "Admin review", variant: "warning" },
          ],
          cta: { label: "Open the calendar", to: "/calendar" },
        },
      ],
    },
  ],
};

const tutorContent: GuideContent = {
  label: "Tutor guide",
  title: "From approval to your next session.",
  description:
    "Set up your profile, make booking decisions, and track each session through payout.",
  highlights: [
    {
      label: "Profile gate",
      value: "Admin reviewed",
      description: "Only published profiles appear in tutor discovery.",
      icon: IconShieldCheck,
      variant: "success",
    },
    {
      label: "Availability",
      value: "Your windows",
      description:
        "Students choose a 90-minute start inside your published windows.",
      icon: IconCalendarEvent,
      variant: "primary",
    },
    {
      label: "After teaching",
      value: "Payout",
      description: "Completed sessions contribute to your payout summary.",
      icon: IconWallet,
      variant: "warning",
    },
  ],
  chapters: [
    {
      id: "tutor-setup",
      title: "Become discoverable",
      description:
        "Claim your invitation, prepare the profile students will see, and submit it for review.",
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
            "After claiming, your tutor profile becomes the place to complete setup.",
          ],
          statuses: [
            { label: "Invitation sent", variant: "info" },
            { label: "Invitation accepted", variant: "success" },
          ],
          cta: { label: "Open tutor profile", to: "/onboarding" },
        },
        {
          id: "tutor-profile",
          title: "Complete your teaching profile",
          summary:
            "Add your bio, subjects, prices, proof, teaching formats, and availability before asking for review.",
          actor: "You",
          icon: IconNotes,
          details: [
            "Select active child subjects from the normalized subject catalog.",
            "Set future non-overlapping availability windows; each student booking is exactly 90 minutes.",
            "Save as a draft while collecting the required information, then submit when ready.",
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
              cta: { label: "Update my profile", to: "/onboarding" },
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
          cta: { label: "Set up my profile", to: "/onboarding" },
        },
        {
          id: "tutor-review",
          title: "Move through profile review",
          summary:
            "Track whether your profile is waiting for review, approved but unpublished, published, or suspended.",
          actor: "Admin",
          icon: IconShieldCheck,
          details: [
            "Pending review means an admin is checking the profile.",
            "Approved means the profile can be published; published means students can discover it.",
            "Suspended profiles leave discovery until the admin resolves the issue.",
          ],
          statuses: [
            { label: "Pending review", variant: "warning" },
            { label: "Approved", variant: "info" },
            { label: "Published", variant: "success" },
            { label: "Suspended", variant: "danger" },
          ],
          cta: { label: "Check profile status", to: "/onboarding" },
        },
      ],
    },
    {
      id: "tutor-bookings",
      title: "Make booking decisions",
      description:
        "Review goals and schedules, then guide each request toward a confirmed lesson.",
      icon: IconCalendarEvent,
      steps: [
        {
          id: "tutor-review-booking",
          title: "Review, accept, decline, or counter",
          summary:
            "Open pending requests to see the student's goal, schedule, format, participants, and Marks context.",
          actor: "You",
          icon: IconMessageCircle,
          details: [
            "Accept when the request works for your schedule and teaching setup.",
            "Decline when you cannot take it; the student can look for another tutor.",
            "Counter-propose a different time when the goal is a fit but the schedule is not.",
            "Respond within **12 hours**, unless the session starts sooner.",
          ],
          statuses: [
            { label: "Waiting for tutor review", variant: "warning" },
            { label: "Confirmed", variant: "success" },
            { label: "Declined", variant: "danger" },
          ],
          branches: sharedBookingBranches,
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
            "Each confirmation or reconfirmation step has a **12-hour** response window, capped by the session start when it is sooner.",
            "If confirmed headcount is below **2**, the group expires. With **2 or more** participants but below target, the price is recalculated and everyone reconfirms.",
            "A confirmed participant withdrawal before **H-2** triggers repricing and reconfirmation; after H-2, late-cancel or no-show handling applies.",
          ],
          statuses: [
            { label: "Waiting for participants", variant: "info" },
            { label: "Expired", variant: "danger" },
          ],
          cta: { label: "Monitor bookings", to: "/bookings" },
        },
      ],
    },
    {
      id: "tutor-teaching",
      title: "Prepare and teach",
      description:
        "Once confirmed, use the access details and learning goal to deliver the session.",
      icon: IconVideo,
      steps: [
        {
          id: "tutor-scheduled",
          title: "Get the session scheduled",
          summary:
            "Online sessions receive a meeting link; offline sessions may wait for the admin room queue.",
          actor: "Cogito and Admin",
          icon: IconVideo,
          details: [
            "A successful online meeting creation moves the booking to scheduled.",
            "An offline booking can remain in room approval until a room is assigned or relocated. The approval window is **12 hours**, capped at session start if it is sooner.",
            "The booking detail keeps the latest access state visible to participants.",
          ],
          statuses: [
            { label: "Confirmed", variant: "success" },
            { label: "Scheduled", variant: "primary" },
            { label: "Awaiting room approval", variant: "warning" },
          ],
          branches: sharedSessionBranches,
          cta: { label: "Open bookings", to: "/bookings" },
        },
        {
          id: "tutor-reschedule",
          title: "Handle a schedule change",
          summary:
            "Propose or respond to a new time while the original schedule remains authoritative.",
          actor: "You and the participants",
          icon: IconRefresh,
          details: [
            "A tutor can counter-propose outside the published availability window when the time does not overlap another active booking.",
            "Series sessions are negotiated independently.",
            "The new time only replaces the old one after unanimous acceptance.",
            "A reschedule proposal stays open for **24 hours**; the original schedule remains active until everyone accepts.",
          ],
          statuses: [{ label: "Reschedule proposed", variant: "warning" }],
          branches: sharedRescheduleBranches,
          cta: { label: "Review bookings", to: "/bookings" },
        },
        {
          id: "tutor-complete",
          title: "Complete the session and payout",
          summary:
            "Record the outcome, keep session notes useful, and follow the booking through completion and payout.",
          actor: "You and Cogito",
          icon: IconWallet,
          details: [
            "Completed sessions contribute to your payout summary according to the booking snapshot.",
            "Tutor lateness is tolerated for **15 minutes**. If the tutor does not arrive after that, the meeting is considered cancelled and affected student holds are returned.",
            "If tutor attendance is not confirmed, the session can be flagged for admin review.",
          ],
          statuses: [
            { label: "Completed", variant: "success" },
            { label: "No-show review", variant: "danger" },
          ],
          cta: { label: "View my bookings", to: "/bookings" },
        },
      ],
    },
  ],
};

const adminContent: GuideContent = {
  label: "Admin guide",
  title: "Keep every session moving.",
  description:
    "Review tutors, resolve booking exceptions, and close the loop on support and Marks.",
  highlights: [
    {
      label: "Primary view",
      value: "All bookings",
      description:
        "See the complete lifecycle and intervene when a queue needs it.",
      icon: IconRoute,
      variant: "primary",
    },
    {
      label: "Operations",
      value: "Exceptions",
      description:
        "Prioritize rooms, attendance, support, and meeting fallbacks.",
      icon: IconAlertTriangle,
      variant: "warning",
    },
    {
      label: "Governance",
      value: "Review + rules",
      description:
        "Moderate profiles and achievements, and manage Marks settings.",
      icon: IconAdjustments,
      variant: "info",
    },
  ],
  chapters: [
    {
      id: "admin-tutors",
      title: "Bring trusted tutors into the marketplace",
      description:
        "Invite tutors, inspect their profile, and make the publishing decision that controls discovery.",
      icon: IconUsersGroup,
      steps: [
        {
          id: "admin-invite",
          title: "Invite and support tutor account setup",
          summary:
            "Create an invite, verify its delivery state, and help the tutor claim the right account.",
          actor: "Admin",
          icon: IconMail,
          details: [
            "Invites store a digest, not plaintext secrets; a pending invite can be safely rotated.",
            "An invite link expires after **7 days**, is single-use, and cannot be accepted after revocation.",
            "The invite form preflights the normalized email and shows existing account methods and role.",
            "If delivery fails, the current usable link can be copied for manual handoff.",
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
            "Check profile completeness, subjects, pricing, proof, and review feedback before making a tutor discoverable.",
          actor: "Admin",
          icon: IconShieldCheck,
          details: [
            "Approve a profile for publication, request changes, or suspend an already published profile.",
            "A published profile remains visible while non-trust-sensitive edits are handled according to review status.",
            "Changes requested send the tutor back to an editable workflow.",
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
      ],
    },
    {
      id: "admin-bookings",
      title: "Operate the booking lifecycle",
      description:
        "Read the shared booking state machine, then act only when a participant, room, meeting, or attendance exception needs intervention.",
      icon: IconCalendarEvent,
      steps: [
        {
          id: "admin-booking-queue",
          title: "Monitor booking states and participants",
          summary:
            "Use the all-bookings view and state history to understand who has acted and what the next action is.",
          actor: "Admin",
          icon: IconRoute,
          details: [
            "Review awaiting tutor review, participant confirmation, reconfirmation, confirmed, scheduled, and reschedule-proposed bookings.",
            "Terminal outcomes include declined, cancelled, late-cancelled, no-show, expired, and completed.",
            "The transition timeline shows actor, reason, timestamp, and the destination status.",
            "Each waiting booking step has a **12-hour** response window unless the session starts sooner. Expired or failed scheduling holds return within **12 hours** of the event.",
            "Student self-service cancellation and reschedule close at **H-2 (2 hours before start)**; later exceptions require an auditable admin override.",
          ],
          statuses: [
            { label: "Needs attention", variant: "warning" },
            { label: "Scheduled", variant: "primary" },
            { label: "Completed", variant: "success" },
          ],
          cta: { label: "Open all bookings", to: "/bookings" },
        },
        {
          id: "admin-room",
          title: "Resolve offline room requests",
          summary:
            "Assign a suitable room, relocate the booking, or cancel when no room can be provided.",
          actor: "Admin",
          icon: IconMapPin,
          details: [
            "Offline bookings can wait in the room approval queue after participant confirmation. Admin has **12 hours** to approve the room, capped at session start if it is sooner.",
            "Assigning a room schedules the booking and notifies the participants.",
            "Relocation preserves the booking while replacing the room; cancellation closes the room path when no option is available.",
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
                "The room queue cannot satisfy the requested format and schedule.",
              outcome:
                "Cancel the room booking with a reason so the participant-facing outcome and Marks rules remain visible.",
              variant: "danger",
              cta: { label: "Open operations", to: "/admin-operations" },
            },
          ],
          cta: { label: "Open operations", to: "/admin-operations" },
        },
        {
          id: "admin-meeting",
          title: "Keep online access available",
          summary:
            "Watch failed meeting creation retries and add a manual link when the provider cannot recover in time.",
          actor: "Cogito and Admin",
          icon: IconVideo,
          details: [
            "A failed Google Meet attempt leaves the booking confirmed for scheduled retry.",
            "The scheduler retries failed meetings every **5 minutes**, for up to **3 attempts**.",
            "A tutor or admin manual link is the fallback when a participant needs access before provider recovery.",
          ],
          statuses: [
            { label: "Confirmed, retrying", variant: "warning" },
            { label: "Manual link added", variant: "info" },
            { label: "Scheduled", variant: "success" },
          ],
          cta: { label: "Open operations", to: "/admin-operations" },
        },
      ],
    },
    {
      id: "admin-support",
      title: "Handle attendance and support exceptions",
      description:
        "Protect the participant experience when the scheduled session does not go to plan.",
      icon: IconHeadset,
      steps: [
        {
          id: "admin-lateness",
          title: "Review lateness and no-show reports",
          summary:
            "Investigate reports after the **15-minute** tolerance window, keep the participant informed, and resolve the operational outcome.",
          actor: "Admin",
          icon: IconAlertTriangle,
          details: [
            "A lateness report is time-gated until **15 minutes** after the scheduled start.",
            "The scheduler flags bookings where tutor attendance is still unknown.",
            "For booking exceptions and emergency overrides, the support SLA is **30 minutes** during business hours (Monday to Saturday, **09:00 to 21:00 WIB**) and **4 hours** outside business hours.",
            "Support tickets escalate after their SLA deadline and keep the escalation status in the operations queue.",
          ],
          statuses: [
            { label: "Open support ticket", variant: "warning" },
            { label: "Escalated", variant: "danger" },
            { label: "Resolved", variant: "success" },
          ],
          cta: { label: "Open operations", to: "/admin-operations" },
        },
        {
          id: "admin-reschedule",
          title: "Understand reschedule proposals",
          summary:
            "Use state history to explain why a proposal is waiting, accepted, rejected, or expired.",
          actor: "Admin, tutor, and students",
          icon: IconRefresh,
          details: [
            "The original schedule remains authoritative while a proposal is pending.",
            "Any voter can reject; the proposal creator is automatically accepted.",
            "A proposal expires after **24 hours** and returns the booking to its prior scheduling path.",
          ],
          statuses: [{ label: "Reschedule proposed", variant: "warning" }],
          branches: sharedRescheduleBranches,
          cta: { label: "Open all bookings", to: "/bookings" },
        },
      ],
    },
    {
      id: "admin-governance",
      title: "Moderate learning signals and Marks rules",
      description:
        "Keep student achievements trustworthy and ensure future booking economics follow the active configuration.",
      icon: IconAdjustments,
      steps: [
        {
          id: "admin-achievements",
          title: "Review student achievements",
          summary:
            "Approve or reject submitted competitions, certifications, and awards with clear feedback.",
          actor: "Admin",
          icon: IconAward,
          details: [
            "Students own the submission workflow; admins own the review decision.",
            "A rejection should include a useful note so the student knows what to improve.",
            "Approved achievements can contribute to the student's visible learning record.",
          ],
          statuses: [
            { label: "Pending review", variant: "warning" },
            { label: "Approved", variant: "success" },
            { label: "Rejected", variant: "danger" },
          ],
          cta: { label: "Review achievements", to: "/admin-achievements" },
        },
        {
          id: "admin-economy",
          title: "Manage Marks and pricing rules",
          summary:
            "Review the active economy configuration and understand that existing booking snapshots remain unchanged.",
          actor: "Admin",
          icon: IconCoins,
          details: [
            "Economy settings define future pricing floors, tutor honoraria, and the Cogito take schedule.",
            "Valid changes use the configured IDR minimum and increment rules.",
            "Existing bookings keep their stored snapshots; new bookings and repricing use the active version.",
          ],
          statuses: [{ label: "Active configuration", variant: "info" }],
          cta: { label: "Open economy settings", to: "/admin-economy" },
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
