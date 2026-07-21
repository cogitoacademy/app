import type { AuthRepo } from "./auth.repo";
import type { AuthService, MeResult, UpdateProfileInput } from "./auth.service";

export type { MeResult };

export type AuthHandler = ReturnType<typeof createAuthHandler>;

export function createAuthHandler(deps: {
  authRepo: AuthRepo;
  walletPort: unknown;
  authService: AuthService;
}) {
  const { authService } = deps;

  return {
    me: async (userId: string) => authService.me(userId),
    getProfile: async (userId: string) => authService.getProfile(userId),
    updateProfile: async (userId: string, input: UpdateProfileInput) =>
      authService.updateProfile(userId, input),
  };
}
