export function getTutorSubjectIdsForSave(
  selectedSubjectIds: readonly string[],
  initialSubjectIds: readonly string[],
  preservedArchivedSubjectIds: readonly string[],
): string[] | undefined {
  if (
    selectedSubjectIds.length === 0 ||
    (selectedSubjectIds.length === initialSubjectIds.length &&
      selectedSubjectIds.every((id) => initialSubjectIds.includes(id)))
  ) {
    return undefined;
  }

  return [...new Set([...preservedArchivedSubjectIds, ...selectedSubjectIds])];
}

export function requiresActiveTutorSubjectSelection(input: {
  isPublished: boolean;
  selectedSubjectIds: readonly string[];
  initialSubjectIds: readonly string[];
  preservedArchivedSubjectIds: readonly string[];
}) {
  if (input.selectedSubjectIds.length > 0) return false;
  return !(
    input.isPublished &&
    input.initialSubjectIds.length === 0 &&
    input.preservedArchivedSubjectIds.length > 0
  );
}
