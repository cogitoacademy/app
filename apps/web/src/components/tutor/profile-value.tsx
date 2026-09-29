"use client";

import { Badge } from "@cogito-app/ui/components/selia/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from "@cogito-app/ui/components/selia/table";
import { Text } from "@cogito-app/ui/components/selia/text";
import { CogitoMarks } from "@/components/cogito-marks";
import {
  TutorAchievementsDisplay,
  type TutorAchievement,
  type TutorEducationEntry,
} from "./tutor-achievements";
import {
  TutorExperiencesDisplay,
  type TutorExperience,
} from "./tutor-experiences";
import { getCompetitionFieldClass } from "@/lib/competition-colors";
import { resolveProfileImageUrl } from "@/lib/profile-image-url";
import {
  getTutorProfileFieldKind,
  getTutorProfileFieldRoot,
  getTutorStatusLabel,
} from "./profile-field-presentation";

type SubjectLabelMaps = {
  subjectLabels?: ReadonlyMap<string, string>;
  subjectFieldSlugs?: ReadonlyMap<string, string>;
};

export type TutorProfileValueProps = SubjectLabelMaps & {
  path: string;
  value: unknown;
  emptyLabel?: string;
  idPrefix?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readEducation(value: unknown): TutorEducationEntry[] | null {
  if (!Array.isArray(value)) return null;
  const entries: TutorEducationEntry[] = [];
  for (const entry of value) {
    if (
      !isRecord(entry) ||
      typeof entry.university !== "string" ||
      typeof entry.degree !== "string"
    ) {
      return null;
    }
    entries.push({ university: entry.university, degree: entry.degree });
  }
  return entries;
}

function readAchievements(value: unknown): TutorAchievement[] | null {
  if (!Array.isArray(value)) return null;
  const entries: TutorAchievement[] = [];
  for (const entry of value) {
    if (
      !isRecord(entry) ||
      typeof entry.competitionName !== "string" ||
      typeof entry.year !== "number" ||
      !Array.isArray(entry.awards) ||
      entry.awards.some((award) => typeof award !== "string")
    ) {
      return null;
    }
    entries.push({
      competitionName: entry.competitionName,
      year: entry.year,
      awards: entry.awards,
    });
  }
  return entries;
}

function readExperiences(value: unknown): TutorExperience[] | null {
  if (!Array.isArray(value)) return null;
  const entries: TutorExperience[] = [];
  for (const entry of value) {
    if (
      !isRecord(entry) ||
      typeof entry.role !== "string" ||
      typeof entry.organization !== "string" ||
      typeof entry.startYear !== "number" ||
      (entry.endYear !== null && typeof entry.endYear !== "number") ||
      typeof entry.description !== "string"
    ) {
      return null;
    }
    entries.push({
      role: entry.role,
      organization: entry.organization,
      startYear: entry.startYear,
      endYear: entry.endYear,
      description: entry.description,
    });
  }
  return entries;
}

function isEmptyValue(value: unknown) {
  return (
    value === null ||
    value === undefined ||
    value === "" ||
    (Array.isArray(value) && value.length === 0) ||
    (isRecord(value) && Object.keys(value).length === 0)
  );
}

function formatNumber(value: number) {
  return value.toLocaleString("id-ID");
}

function formatMoney(value: unknown) {
  return typeof value === "number" ? `Rp${formatNumber(value)}` : null;
}

function formatModality(value: unknown) {
  if (value === "online") return "Online";
  if (value === "offline") return "Offline (Campus)";
  if (value === "both") return "Online & offline";
  return typeof value === "string" && value ? value : "Not specified";
}

function formatOwnership(value: unknown) {
  if (value === "self") return "Self-owned";
  if (value === "trusted_person") return "Trusted person";
  return typeof value === "string" && value ? value : "Not specified";
}

function formatDate(value: unknown) {
  if (typeof value !== "string" && !(value instanceof Date)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

function formatScalar(path: string, value: unknown) {
  if (isEmptyValue(value)) return null;
  const root = getTutorProfileFieldRoot(path);
  if (typeof value === "boolean") return value ? "Accepted" : "Not accepted";
  if (typeof value === "number") {
    if (root === "baseRatesIdr") return formatMoney(value);
    return formatNumber(value);
  }
  if (typeof value === "string") {
    if (root === "modality") return formatModality(value);
    if (root === "bankAccountOwnership") return formatOwnership(value);
    if (root === "onboardingStatus" || root === "profileEditStatus") {
      return getTutorStatusLabel(value);
    }
    return value;
  }
  return null;
}

function SubjectValue({
  value,
  subjectLabels,
  subjectFieldSlugs,
}: {
  value: unknown;
  subjectLabels?: ReadonlyMap<string, string>;
  subjectFieldSlugs?: ReadonlyMap<string, string>;
}) {
  if (!Array.isArray(value) || value.length === 0) {
    return <Text className="text-sm text-dimmed">No specializations</Text>;
  }
  return (
    <div className="flex min-w-0 flex-wrap gap-1.5">
      {value.map((subjectId) => {
        const id = String(subjectId);
        const label =
          subjectLabels?.get(id) ?? `Specialization unavailable (${id})`;
        const field = subjectFieldSlugs?.get(id);
        return (
          <Badge
            key={id}
            variant="secondary"
            className={getCompetitionFieldClass(field ?? "", "solid")}
          >
            {label}
          </Badge>
        );
      })}
    </div>
  );
}

function UrlValue({ value }: { value: unknown }) {
  if (!Array.isArray(value) || value.length === 0) {
    return <Text className="text-sm text-dimmed">No links</Text>;
  }
  return (
    <ul className="space-y-1">
      {value.map((entry) => {
        const url = String(entry);
        return (
          <li key={url}>
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="break-all text-sm underline underline-offset-2"
            >
              {url}
            </a>
          </li>
        );
      })}
    </ul>
  );
}

function MoneyValue({ value }: { value: unknown }) {
  if (!isRecord(value)) {
    return <Text className="text-sm">{formatMoney(value) ?? "Not set"}</Text>;
  }
  const rates = Object.entries(value).filter(
    ([, rate]) => typeof rate === "number",
  );
  if (rates.length === 0)
    return <Text className="text-sm text-dimmed">Not set</Text>;
  return (
    <div className="overflow-hidden rounded-lg border border-item-border">
      <Table className="text-sm">
        <TableBody>
          {rates.map(([mode, rate]) => (
            <TableRow key={mode}>
              <TableCell className="py-1.5! text-muted">
                {formatModality(mode)}
              </TableCell>
              <TableCell className="py-1.5! text-right font-medium">
                {formatMoney(rate)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function MarksValue({ value }: { value: unknown }) {
  if (!isRecord(value)) {
    return (
      <Text className="text-sm">
        {typeof value === "number" ? <CogitoMarks value={value} /> : "Not set"}
      </Text>
    );
  }
  const rows = Object.entries(value).filter(
    ([, price]) => typeof price === "number",
  );
  if (rows.length === 0)
    return <Text className="text-sm text-dimmed">Not set</Text>;
  return (
    <div className="overflow-hidden rounded-lg border border-item-border">
      <Table className="text-sm">
        <TableBody>
          {rows.map(([size, price]) => (
            <TableRow key={size}>
              <TableCell className="py-1.5! text-muted">
                {size} {size === "1" ? "student" : "students"}
              </TableCell>
              <TableCell className="py-1.5! text-right font-medium">
                <CogitoMarks value={price} size="3" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ImageValue({ value }: { value: unknown }) {
  const source = typeof value === "string" ? value : null;
  const url = resolveProfileImageUrl(source) ?? source;
  if (!url) return <Text className="text-sm text-dimmed">No photo</Text>;
  return (
    <a href={url} target="_blank" rel="noreferrer">
      <img
        src={url}
        alt="Tutor profile"
        width={96}
        height={96}
        className="size-24 rounded-lg object-cover"
      />
    </a>
  );
}

function UnknownValue({ value }: { value: unknown }) {
  if (typeof value === "string" || typeof value === "number") {
    return (
      <Text className="whitespace-pre-line break-words text-sm">
        {String(value)}
      </Text>
    );
  }
  if (typeof value === "boolean") {
    return (
      <Text className="text-sm">{value ? "Accepted" : "Not accepted"}</Text>
    );
  }
  return (
    <pre className="max-w-full overflow-x-auto whitespace-pre-wrap break-words text-xs text-muted">
      {JSON.stringify(value, null, 2) ?? "Not set"}
    </pre>
  );
}

export function TutorProfileValue({
  path,
  value,
  subjectLabels,
  subjectFieldSlugs,
  emptyLabel = "Not set",
  idPrefix = "tutor-profile-value",
}: TutorProfileValueProps) {
  if (isEmptyValue(value))
    return <Text className="text-sm text-dimmed">{emptyLabel}</Text>;

  const kind = getTutorProfileFieldKind(path);
  switch (kind) {
    case "subjects":
      return (
        <SubjectValue
          value={value}
          subjectLabels={subjectLabels}
          subjectFieldSlugs={subjectFieldSlugs}
        />
      );
    case "education": {
      const entries = readEducation(value);
      return entries ? (
        <TutorAchievementsDisplay
          education={entries}
          achievements={[]}
          idPrefix={`${idPrefix}-education`}
        />
      ) : (
        <UnknownValue value={value} />
      );
    }
    case "achievements": {
      const entries = readAchievements(value);
      return entries ? (
        <TutorAchievementsDisplay
          education={[]}
          achievements={entries}
          idPrefix={`${idPrefix}-achievements`}
        />
      ) : (
        <UnknownValue value={value} />
      );
    }
    case "experiences": {
      const entries = readExperiences(value);
      return entries ? (
        <TutorExperiencesDisplay
          experiences={entries}
          idPrefix={`${idPrefix}-experiences`}
        />
      ) : (
        <UnknownValue value={value} />
      );
    }
    case "urls":
      return <UrlValue value={value} />;
    case "money":
      return <MoneyValue value={value} />;
    case "marks":
      return <MarksValue value={value} />;
    case "modality":
      return <Badge variant="info">{formatModality(value)}</Badge>;
    case "capacity":
      return (
        <Text className="text-sm">
          {formatScalar(path, value) ?? emptyLabel} students
        </Text>
      );
    case "status":
      return (
        <Badge variant="secondary">
          {formatScalar(path, value) ?? emptyLabel}
        </Badge>
      );
    case "date":
      return <Text className="text-sm">{formatDate(value) ?? emptyLabel}</Text>;
    case "boolean":
      return (
        <Text className="text-sm">
          {formatScalar(path, value) ?? emptyLabel}
        </Text>
      );
    case "image":
      return <ImageValue value={value} />;
    case "prose":
    case "text":
      return (
        <Text className="whitespace-pre-line break-words text-sm">
          {formatScalar(path, value) ?? emptyLabel}
        </Text>
      );
    default:
      return <UnknownValue value={value} />;
  }
}

export function formatTutorProfileValueSummary(
  path: string,
  value: unknown,
  subjectLabels?: ReadonlyMap<string, string>,
) {
  if (isEmptyValue(value)) return "Not set";
  const root = getTutorProfileFieldRoot(path);
  if (root === "subjectIds" && Array.isArray(value)) {
    const labels = value.map(
      (id) => subjectLabels?.get(String(id)) ?? String(id),
    );
    return labels.join(", ");
  }
  if (
    root === "education" ||
    root === "achievements" ||
    root === "experiences"
  ) {
    const count = Array.isArray(value) ? value.length : 0;
    return `${count} ${root === "education" ? "education" : root.slice(0, -1)} ${count === 1 ? "entry" : "entries"}`;
  }
  if (root === "achievementProofUrls" || root === "experienceProofUrls") {
    const count = Array.isArray(value) ? value.length : 0;
    return `${count} proof link${count === 1 ? "" : "s"}`;
  }
  if (root === "prices" && isRecord(value)) {
    return `${Object.keys(value).length} group-size price${Object.keys(value).length === 1 ? "" : "s"}`;
  }
  const scalar = formatScalar(path, value);
  if (scalar)
    return scalar.length > 120 ? `${scalar.slice(0, 117)}...` : scalar;
  return JSON.stringify(value) ?? "Not set";
}
