export const DEFAULT_STUDENT_EMAIL = "cogito.andre@yopmail.com";

export function createRunScopedStudentEmail(runId: string) {
  return `cogito.e2e.${runId}@yopmail.com`;
}

export function resolveStudentEmail(env: { E2E_STUDENT_EMAIL?: string }) {
  return env.E2E_STUDENT_EMAIL?.trim().toLowerCase() || DEFAULT_STUDENT_EMAIL;
}
