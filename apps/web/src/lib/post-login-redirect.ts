export type PostLoginDestinationInput = {
  role?: string;
  tutorOnboardingStatus?: string | null;
  redirectPath?: string;
};

const TUTOR_PROFILE_REQUIRED_STATUSES = new Set(["draft", "changes_requested"]);

/**
 * Selects the default destination after authentication.
 *
 * A validated return path remains an explicit caller choice. Without one,
 * tutors who still need to complete or correct onboarding go to their profile
 * editor; all other roles and completed/reviewed tutor profiles go to the
 * dashboard.
 */
export function getPostLoginDestination({
  role,
  tutorOnboardingStatus,
  redirectPath,
}: PostLoginDestinationInput): string {
  if (redirectPath) return redirectPath;

  if (role === "tutor") {
    const needsProfile =
      tutorOnboardingStatus === undefined ||
      tutorOnboardingStatus === null ||
      TUTOR_PROFILE_REQUIRED_STATUSES.has(tutorOnboardingStatus);

    return needsProfile ? "/profile" : "/dashboard";
  }

  return "/dashboard";
}

/**
 * Reads tutor onboarding state without turning a successful auth handoff into
 * an error when the profile is not available yet or the read is temporarily
 * unavailable. A missing or unavailable read is handled conservatively by
 * the destination helper above.
 */
export async function readTutorOnboardingStatus(
  readProfile: () => Promise<{ onboardingStatus: string | null }>,
): Promise<string | undefined> {
  try {
    return (await readProfile()).onboardingStatus ?? undefined;
  } catch {
    return undefined;
  }
}
