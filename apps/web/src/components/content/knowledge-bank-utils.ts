const categoryLabels: Record<string, string> = {
  academic: "Academic",
  competition: "Competition",
  general: "General",
  other: "Other",
  "position-paper": "Position Paper",
  "resolution-bank": "Resolution Bank",
  "study-guide": "Study Guide",
};

function titleCaseCategory(category: string) {
  return category
    .replaceAll(/[-_]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(
      (word) => `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`,
    )
    .join(" ");
}

export function getCategoryLabel(category: string) {
  const normalizedCategory = category.trim().toLowerCase();
  return (
    categoryLabels[normalizedCategory] ?? titleCaseCategory(normalizedCategory)
  );
}
