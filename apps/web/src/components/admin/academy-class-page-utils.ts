type VersionedAcademyClass = {
  id: string;
  version: number;
};

export function mergeAcademyClassQueryResults<T extends VersionedAcademyClass>(
  published: readonly T[],
  postponed: readonly T[],
): T[] {
  const recordsById = new Map<string, T>();

  for (const record of [...published, ...postponed]) {
    const existing = recordsById.get(record.id);
    if (!existing || record.version > existing.version) {
      recordsById.set(record.id, record);
    }
  }

  return [...recordsById.values()];
}
