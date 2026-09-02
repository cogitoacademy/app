import { describe, expect, test } from "bun:test";
import { formatBookingEventTitle } from "../../modules/booking/booking-event-title";

describe("formatBookingEventTitle", () => {
  const munTopic = {
    categorySlug: "competition-model-united-nations",
    categoryName: "Model United Nations",
  };

  test("matches the Google Meet title format for solo bookings", () => {
    expect(
      formatBookingEventTitle({
        targetGroupSize: 1,
        sessionTopic: munTopic,
        tutorName: "Tutor One",
        proposerName: "Student One",
      }),
    ).toBe("Cogito - MUN | Tutor One x Student One");
  });

  test("uses the proposer and Friends label for group bookings", () => {
    expect(
      formatBookingEventTitle({
        targetGroupSize: 4,
        sessionTopic: munTopic,
        tutorName: "Tutor One",
        proposerName: "Chani Kynes",
      }),
    ).toBe("Cogito - MUN | Tutor One x Chani Kynes & Friends");
  });

  test("keeps legacy bookings readable when topic or names are unavailable", () => {
    expect(
      formatBookingEventTitle({
        targetGroupSize: 1,
      }),
    ).toBe("Cogito - Session | Cogito tutor x Student");
  });
});
