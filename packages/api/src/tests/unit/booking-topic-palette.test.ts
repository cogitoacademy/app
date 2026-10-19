import { describe, expect, test } from "bun:test";

import { applyBookingTopicPalettes } from "../../modules/booking/booking-topic-palette";
import type { BookingSessionTopic } from "@cogito-app/db/schema";
import type { CompetitionPalette } from "../../modules/competition-catalog/competition-catalog.types";

const topic: BookingSessionTopic = {
  categoryId: "archived-parent-id",
  categorySlug: "catalog-parent",
  categoryName: "Saved parent label",
  subcategoryId: "archived-child-id",
  subcategorySlug: "catalog-child",
  subcategoryName: "Saved child label",
};

const palette: CompetitionPalette = {
  lightTextColor: "oklch(0.2 0.02 250)",
  lightBackgroundColor: "oklch(0.96 0.03 250)",
  darkTextColor: "oklch(0.92 0.02 250)",
  darkBackgroundColor: "oklch(0.25 0.04 250)",
};

describe("booking topic palette projection", () => {
  test("uses the current palette for an archived saved category without changing snapshots", async () => {
    const result = await applyBookingTopicPalettes(
      [
        {
          id: "booking-1",
          sessionTopic: topic,
          priceSnapshot: { totalMarks: 42 },
        },
      ],
      async (references) => {
        expect(references).toEqual([
          { id: "archived-parent-id", slug: "catalog-parent" },
        ]);
        return [palette];
      },
    );

    expect(result[0]?.sessionTopic).toEqual({
      ...topic,
      parentColors: palette,
    });
    expect(result[0]?.priceSnapshot).toEqual({ totalMarks: 42 });
  });

  test("keeps saved topic labels when a catalog palette cannot be resolved", async () => {
    const result = await applyBookingTopicPalettes(
      [{ id: "booking-1", sessionTopic: topic }],
      async () => [null],
    );

    expect(result[0]?.sessionTopic).toEqual(topic);
  });

  test("resolves topic palettes in a single ordered batch", async () => {
    const secondTopic = {
      ...topic,
      categoryId: "parent-2",
      categorySlug: "parent-2",
    };
    const requests: Array<Array<{ id?: string | null; slug?: string | null }>> =
      [];
    const result = await applyBookingTopicPalettes(
      [
        { id: "booking-1", sessionTopic: topic },
        { id: "booking-2", sessionTopic: null },
        { id: "booking-3", sessionTopic: secondTopic },
      ],
      async (references) => {
        requests.push([...references]);
        return [palette, null];
      },
    );

    expect(requests).toEqual([
      [
        { id: "archived-parent-id", slug: "catalog-parent" },
        { id: "parent-2", slug: "parent-2" },
      ],
    ]);
    expect(result[0]?.sessionTopic).toEqual({
      ...topic,
      parentColors: palette,
    });
    expect(result[1]?.sessionTopic).toBeNull();
    expect(result[2]?.sessionTopic).toEqual(secondTopic);
  });
});
