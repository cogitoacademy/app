import type {
  TutorInviteRow,
  TutorProfileRow,
  InviteStatus,
  OnboardingStatus,
} from "./admin-tutor.repo";
import {
  type ReviewAction,
  type AdminTutorService,
} from "./admin-tutor.service";

export interface CreateInviteInput {
  email: string;
  displayName: string;
  internalNotes?: string;
}

export interface ListInvitesInput {
  status?: InviteStatus;
  limit?: number;
  offset?: number;
}

export interface ListTutorProfilesInput {
  status?: OnboardingStatus;
  limit?: number;
  offset?: number;
}

export interface ReviewTutorProfileInput {
  tutorProfileId: string;
  action: ReviewAction;
  adminNote?: string;
}

export type AdminTutorHandler = ReturnType<typeof createAdminTutorHandler>;

export function createAdminTutorHandler(deps: {
  adminTutorService: AdminTutorService;
}) {
  const { adminTutorService } = deps;

  async function createInvite(
    adminId: string,
    input: CreateInviteInput,
  ): Promise<TutorInviteRow> {
    return adminTutorService.createInvite(adminId, input);
  }

  async function listInvites(
    input: ListInvitesInput = {},
  ): Promise<TutorInviteRow[]> {
    return adminTutorService.listInvites(input);
  }

  async function resendInvite(
    adminId: string,
    inviteId: string,
  ): Promise<TutorInviteRow> {
    return adminTutorService.resendInvite(adminId, inviteId);
  }

  async function revokeInvite(
    adminId: string,
    inviteId: string,
  ): Promise<TutorInviteRow> {
    return adminTutorService.revokeInvite(adminId, inviteId);
  }

  async function listTutorProfiles(input: ListTutorProfilesInput = {}) {
    return adminTutorService.listTutorProfiles(input);
  }

  async function reviewTutorProfile(
    adminId: string,
    input: ReviewTutorProfileInput,
  ): Promise<TutorProfileRow> {
    return adminTutorService.reviewTutorProfile(adminId, input);
  }

  return {
    createInvite,
    listInvites,
    resendInvite,
    revokeInvite,
    listTutorProfiles,
    reviewTutorProfile,
  };
}
