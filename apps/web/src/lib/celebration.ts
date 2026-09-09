export type CelebrationKind =
  | "booking-submitted"
  | "onboarding-submitted"
  | "achievement-submitted"
  | "topup-confirmed";

export const CELEBRATION_EVENT = "cogito:celebrate";

export function celebrate(kind: CelebrationKind) {
  window.dispatchEvent(
    new CustomEvent<CelebrationKind>(CELEBRATION_EVENT, { detail: kind }),
  );
}
