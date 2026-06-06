"use client";

import { Select, SelectItem, SelectList, SelectPopup, SelectTrigger, SelectValue } from "@cogito-app/ui/components/selia/select";

const CATEGORIES = [
  "All",
  "MUN",
  "WSC",
  "Olympiad",
  "Debate",
  "Science",
  "Arts",
  "Sports",
  "Academic",
  "Leadership",
] as const;

const STATUSES = ["All", "Pending", "Approved", "Rejected"] as const;

type AchievementFiltersProps = {
  category: string;
  status: string;
  onCategoryChange: (value: string) => void;
  onStatusChange: (value: string) => void;
};

export function AchievementFilters({
  category,
  status,
  onCategoryChange,
  onStatusChange,
}: AchievementFiltersProps) {
  return (
    <div className="flex flex-wrap gap-3">
      <Select value={category} onValueChange={(v) => onCategoryChange(v as string)}>
        <SelectTrigger className="w-full sm:w-40">
          <SelectValue placeholder="Category" />
        </SelectTrigger>
        <SelectPopup>
          <SelectList>
            {CATEGORIES.map((cat) => (
              <SelectItem key={cat} value={cat}>
                {cat}
              </SelectItem>
            ))}
          </SelectList>
        </SelectPopup>
      </Select>
      <Select value={status} onValueChange={(v) => onStatusChange(v as string)}>
        <SelectTrigger className="w-full sm:w-40">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectPopup>
          <SelectList>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectList>
        </SelectPopup>
      </Select>
    </div>
  );
}