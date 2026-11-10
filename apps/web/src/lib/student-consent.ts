import {
  studentTermsConsentSchema,
  STUDENT_TERMS_VERSION,
  type StudentTermsConsent,
} from "@cogito-app/auth/student-terms";

const GOOGLE_CONSENT_KEY = "cogito.signup.google-consent.2026-11";

export type StudentConsentState = {
  ageGroup: "adult" | "minor" | "";
  termsAccepted: boolean;
  guardianName: string;
  guardianRelationship: "father" | "mother" | "guardian" | "";
  guardianAccepted: boolean;
};

export const emptyStudentConsent: StudentConsentState = {
  ageGroup: "",
  termsAccepted: false,
  guardianName: "",
  guardianRelationship: "",
  guardianAccepted: false,
};

export function toStudentConsent(
  value: StudentConsentState,
): StudentTermsConsent | null {
  if (!value.termsAccepted || !value.ageGroup) return null;
  if (value.ageGroup === "minor") {
    if (
      !value.guardianName.trim() ||
      !value.guardianRelationship ||
      !value.guardianAccepted
    )
      return null;
    return {
      termsAccepted: true as const,
      termsVersion: STUDENT_TERMS_VERSION,
      ageGroup: "minor" as const,
      guardianName: value.guardianName.trim(),
      guardianRelationship: value.guardianRelationship,
      guardianAccepted: true as const,
    };
  }
  return {
    termsAccepted: true as const,
    termsVersion: STUDENT_TERMS_VERSION,
    ageGroup: "adult" as const,
  };
}

export function rememberGoogleConsent(value: StudentConsentState) {
  try {
    sessionStorage.setItem(
      GOOGLE_CONSENT_KEY,
      JSON.stringify(toStudentConsent(value)),
    );
  } catch {
    // The next screen will ask again if session storage is unavailable.
  }
}

export function readGoogleConsent(): StudentConsentState {
  try {
    const result = studentTermsConsentSchema.safeParse(
      JSON.parse(sessionStorage.getItem(GOOGLE_CONSENT_KEY) ?? "null"),
    );
    if (!result.success) return emptyStudentConsent;
    return { ...emptyStudentConsent, ...result.data };
  } catch {
    return emptyStudentConsent;
  }
}

export function clearGoogleConsent() {
  try {
    sessionStorage.removeItem(GOOGLE_CONSENT_KEY);
  } catch {
    /* Storage is optional. */
  }
}
