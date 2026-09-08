export const competitionFieldClasses = {
  mun: {
    soft: "bg-competition-mun/15 text-competition-mun hover:bg-competition-mun/25 border-competition-mun",
    solid:
      "bg-competition-mun text-competition-mun-foreground border-competition-mun",
  },
  olimpiade: {
    soft: "bg-competition-olympiad/15 text-competition-olympiad hover:bg-competition-olympiad/25 border-competition-olympiad",
    solid:
      "bg-competition-olympiad text-competition-olympiad-foreground border-competition-olympiad",
  },
  wsc: {
    soft: "bg-competition-wsc/15 text-competition-wsc hover:bg-competition-wsc/25 border-competition-wsc",
    solid:
      "bg-competition-wsc text-competition-wsc-foreground border-competition-wsc",
  },
  kti: {
    soft: "bg-competition-research/15 text-competition-research hover:bg-competition-research/25 border-competition-research",
    solid:
      "bg-competition-research text-competition-research-foreground border-competition-research",
  },
  debat: {
    soft: "bg-competition-debate/15 text-competition-debate hover:bg-competition-debate/25 border-competition-debate",
    solid:
      "bg-competition-debate text-competition-debate-foreground border-competition-debate",
  },
  business: {
    soft: "bg-competition-business/15 text-competition-business hover:bg-competition-business/25 border-competition-business",
    solid:
      "bg-competition-business text-competition-business-foreground border-competition-business",
  },
  pidato: {
    soft: "bg-competition-speech/15 text-competition-speech hover:bg-competition-speech/25 border-competition-speech",
    solid:
      "bg-competition-speech text-competition-speech-foreground border-competition-speech",
  },
} as const;

export type CompetitionField = keyof typeof competitionFieldClasses;
export type CompetitionColorStyle =
  keyof (typeof competitionFieldClasses)[CompetitionField];

const fallbackCompetitionField: CompetitionField = "kti";

const competitionFieldAliases: Record<string, CompetitionField> = {
  mun: "mun",
  "model-united-nations": "mun",
  "competition-model-united-nations": "mun",
  olimpiade: "olimpiade",
  olympiad: "olimpiade",
  "competition-olympiad": "olimpiade",
  wsc: "wsc",
  "world-scholars-cup": "wsc",
  "competition-world-scholars-cup": "wsc",
  kti: "kti",
  "essay-scientific-writing": "kti",
  "competition-essay-writing": "kti",
  debat: "debat",
  debate: "debat",
  "competition-debate": "debat",
  business: "business",
  "business-plan": "business",
  "competition-business": "business",
  pidato: "pidato",
  "public-speaking": "pidato",
  "competition-public-speaking": "pidato",
};

export function getCompetitionField(field: string | undefined) {
  if (!field) return fallbackCompetitionField;

  const normalized = field.trim().toLowerCase();
  const exactMatch = competitionFieldAliases[normalized];
  if (exactMatch) return exactMatch;

  if (normalized.includes("united-nations") || normalized.startsWith("mun-"))
    return "mun";
  if (normalized.includes("world-scholar") || normalized.startsWith("wsc-"))
    return "wsc";
  if (normalized.includes("olympiad") || normalized.includes("olimpiade"))
    return "olimpiade";
  if (normalized.includes("debate") || normalized.includes("debat"))
    return "debat";
  if (normalized.includes("business")) return "business";
  if (
    normalized.includes("public-speaking") ||
    normalized.includes("speech") ||
    normalized.includes("pidato")
  )
    return "pidato";
  if (
    normalized.includes("essay") ||
    normalized.includes("writing") ||
    normalized.includes("research") ||
    normalized.includes("kti")
  )
    return "kti";

  return fallbackCompetitionField;
}

export function getCompetitionFieldClass(
  field: string | undefined,
  style: CompetitionColorStyle = "soft",
) {
  return competitionFieldClasses[getCompetitionField(field)][style];
}
