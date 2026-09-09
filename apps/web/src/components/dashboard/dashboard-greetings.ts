export type DashboardRole = "student" | "tutor" | "admin";
export type DayPeriod = "morning" | "midday" | "afternoon" | "evening";

type GreetingContext = {
  hasUpcomingLesson?: boolean;
  reviewCount?: number;
  priorityCount?: number;
};

const GREETINGS: Record<DashboardRole, Record<DayPeriod, readonly string[]>> = {
  student: {
    morning: [
      "Good morning, {name} — ready to learn?",
      "Rise, shine, and stay curious, {name}",
      "A fresh morning for a fresh idea, {name}",
      "Morning, {name}! Let's make progress",
      "Your next breakthrough starts here, {name}",
    ],
    midday: [
      "Good afternoon, {name} — keep exploring",
      "Midday momentum looks good on you, {name}",
      "Hello, {name}! What's next on the learning list?",
      "A bright idea could be one session away, {name}",
      "Keep the curiosity going, {name}",
    ],
    afternoon: [
      "Good afternoon, {name} — finish strong",
      "Still plenty of time to learn something brilliant, {name}",
      "Afternoon, {name}! One more step forward",
      "Turn this afternoon into progress, {name}",
      "Your learning streak continues, {name}",
    ],
    evening: [
      "Good evening, {name} — wind down with a win",
      "Evening, {name}! A little progress still counts",
      "Quiet hours, bright ideas, {name}",
      "End the day a little wiser, {name}",
      "One last spark of curiosity, {name}?",
    ],
  },
  tutor: {
    morning: [
      "Good morning, {name} — ready to inspire?",
      "A new day to make learning click, {name}",
      "Morning, {name}! Your students are counting on you",
      "Fresh coffee, fresh perspectives, {name}",
      "Let's set the tone for great teaching, {name}",
    ],
    midday: [
      "Good afternoon, {name} — keep the momentum going",
      "Midday check-in, {name}: ready for the next learner?",
      "Hello, {name}! Time to turn questions into clarity",
      "Your teaching day is in motion, {name}",
      "Another session, another chance to inspire, {name}",
    ],
    afternoon: [
      "Good afternoon, {name} — guide the next breakthrough",
      "Afternoon, {name}! Keep those lightbulb moments coming",
      "Your expertise still has places to go today, {name}",
      "Finish the teaching day with impact, {name}",
      "Keep making the complex feel possible, {name}",
    ],
    evening: [
      "Good evening, {name} — let's wrap up the teaching day",
      "Evening, {name}! Time to review and reset",
      "A calm close to a day of impact, {name}",
      "Your students made progress today because of you, {name}",
      "One last look before you call it a day, {name}",
    ],
  },
  admin: {
    morning: [
      "Good morning, {name} — let's keep Cogito moving",
      "Morning, {name}! The command center is ready",
      "A fresh day for smooth operations, {name}",
      "Good morning, {name} — priorities first",
      "Let's set the academy up for a great day, {name}",
    ],
    midday: [
      "Good afternoon, {name} — systems are in motion",
      "Midday pulse check, {name}",
      "Hello, {name}! Let's keep every queue moving",
      "The academy is humming, {name}",
      "Time to turn the next priority green, {name}",
    ],
    afternoon: [
      "Good afternoon, {name} — let's clear the runway",
      "Afternoon, {name}! Keep operations on course",
      "A few smart decisions can finish the day strong, {name}",
      "Keep the academy running beautifully, {name}",
      "The final stretch starts here, {name}",
    ],
    evening: [
      "Good evening, {name} — one last operations check",
      "Evening, {name}! Let's leave a clean slate",
      "Close the loops, then call it a day, {name}",
      "A calm dashboard is a good night, {name}",
      "Let's wrap today's priorities, {name}",
    ],
  },
};

const DEFAULT_DESCRIPTIONS: Record<DashboardRole, readonly string[]> = {
  student: [
    "Choose a learning goal, find the right tutor, and make today count.",
    "Every question is a starting point. Your next step is waiting.",
    "Small, focused sessions can build surprisingly big momentum.",
  ],
  tutor: [
    "Check student requests, upcoming sessions, and your teaching availability.",
    "Keep every learner supported and your teaching schedule on track.",
    "A quick review now keeps the rest of your teaching day flowing.",
  ],
  admin: [
    "Review time-sensitive operations, tutor applications, and achievements.",
    "Keep the academy moving by clearing the most important queue first.",
    "A quick operational sweep keeps students and tutors moving forward.",
  ],
};

export function getDayPeriod(hour: number): DayPeriod {
  if (hour >= 5 && hour < 11) return "morning";
  if (hour >= 11 && hour < 15) return "midday";
  if (hour >= 15 && hour < 18) return "afternoon";
  return "evening";
}

function pick<T>(items: readonly T[], randomValue: number) {
  return items[Math.floor(randomValue * items.length) % items.length]!;
}

export function createDashboardGreeting(
  role: DashboardRole,
  name: string,
  hour: number,
  randomValue: number,
  context: GreetingContext = {},
) {
  const fallback =
    role === "student" ? "Student" : role === "tutor" ? "Tutor" : "Admin";
  const firstName =
    role === "admin" ? "Admin" : name.trim().split(/\s+/)[0] || fallback;
  const title = pick(GREETINGS[role][getDayPeriod(hour)], randomValue).replace(
    "{name}",
    firstName,
  );

  let descriptions = DEFAULT_DESCRIPTIONS[role];
  if (role === "student" && context.hasUpcomingLesson) {
    descriptions = [
      "Your next learning session is on the calendar. Keep the momentum going.",
      "Your next lesson is lined up — arrive curious and ready to grow.",
      "A learning session is coming up. A quick review now will go a long way.",
    ];
  } else if (role === "tutor" && (context.reviewCount ?? 0) > 0) {
    descriptions = [
      `You have ${context.reviewCount} student ${context.reviewCount === 1 ? "request" : "requests"} waiting for review.`,
      `${context.reviewCount} ${context.reviewCount === 1 ? "learner is" : "learners are"} waiting for your response.`,
      "Start with the student request queue, then check your next session.",
    ];
  } else if (role === "admin" && (context.priorityCount ?? 0) > 0) {
    descriptions = [
      `${context.priorityCount} priority ${context.priorityCount === 1 ? "item needs" : "items need"} your attention.`,
      "Time-sensitive work is waiting. Clear the priority queue first.",
      "Start with escalations, then move through tutor and achievement reviews.",
    ];
  }

  return {
    title,
    description: pick(descriptions, (randomValue * 1.61803398875) % 1),
  };
}
