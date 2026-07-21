import type { UpdateProfileInput } from "./tutor.repo";
import type { TutorService } from "./tutor.service";

export function createTutorHandler(deps: { tutorService: TutorService }) {
  const { tutorService } = deps;

  async function getMyProfile(userId: string) {
    return tutorService.getMyProfile(userId);
  }

  async function updateMyProfile(userId: string, input: UpdateProfileInput) {
    return tutorService.updateMyProfile(userId, input);
  }

  async function submitForReview(userId: string) {
    return tutorService.submitForReview(userId);
  }

  async function listAvailability(userId: string) {
    return tutorService.listAvailability(userId);
  }

  async function upsertAvailability(
    userId: string,
    input: {
      id?: string;
      startDate: string | Date;
      endDate: string | Date;
      modality: "online" | "offline" | "both";
      isRecurring?: boolean;
      recurrenceRule?: string;
      isActive?: boolean;
    },
  ) {
    return tutorService.upsertAvailability(userId, input);
  }

  async function deleteAvailability(userId: string, slotId: string) {
    return tutorService.deleteAvailability(userId, slotId);
  }

  return {
    getMyProfile,
    updateMyProfile,
    submitForReview,
    listAvailability,
    upsertAvailability,
    deleteAvailability,
  };
}

export type TutorHandler = ReturnType<typeof createTutorHandler>;
