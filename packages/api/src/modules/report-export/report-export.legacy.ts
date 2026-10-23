export function isLegacyFeedbackVersion(
  history: ReadonlyArray<{ version: number; actorRole: string }>,
  version: number,
) {
  const currentVersion = history.find((entry) => entry.version === version);
  return !currentVersion || currentVersion.actorRole === "legacy";
}
