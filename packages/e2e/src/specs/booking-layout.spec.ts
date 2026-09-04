import { expect, test } from "@playwright/test";

for (const viewport of [
  { width: 170, height: 688 },
  { width: 390, height: 844 },
]) {
  test(`booking layout stays inside a ${viewport.width}px viewport`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/bookings?tab=upcoming");

    await expect(
      page.getByRole("heading", { name: "Bookings", exact: true }).last(),
    ).toBeVisible();
    await expect(
      page
        .locator('[data-slot="empty-state"], [data-slot="booking-row"]')
        .first(),
    ).toBeVisible();

    const metrics = await page.evaluate(() => {
      const tablist = document.querySelector(
        '[data-slot="booking-tab-scroller"]',
      );
      const emptyState = document.querySelector('[data-slot="empty-state"]');
      const emptyCard = emptyState?.closest('[data-slot="card"]') ?? null;
      const tablistRect = tablist?.getBoundingClientRect() ?? null;
      const emptyCardRect = emptyCard?.getBoundingClientRect() ?? null;
      const emptyStateRect = emptyState?.getBoundingClientRect() ?? null;
      const bookingRows = Array.from(
        document.querySelectorAll('[data-slot="booking-row"]'),
      ).map((row) => {
        const rect = row.getBoundingClientRect();
        return { left: rect.left, right: rect.right };
      });

      return {
        viewport: { width: window.innerWidth, height: window.innerHeight },
        document: {
          clientWidth: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
        },
        tablist: {
          rect: tablistRect
            ? {
                left: tablistRect.left,
                right: tablistRect.right,
                top: tablistRect.top,
                bottom: tablistRect.bottom,
              }
            : null,
          clientWidth: tablist?.clientWidth ?? null,
          scrollWidth: tablist?.scrollWidth ?? null,
          overflowX: tablist ? getComputedStyle(tablist).overflowX : null,
          overflowY: tablist ? getComputedStyle(tablist).overflowY : null,
        },
        emptyCard: emptyCardRect
          ? {
              left: emptyCardRect.left,
              right: emptyCardRect.right,
              top: emptyCardRect.top,
              bottom: emptyCardRect.bottom,
              overflow: getComputedStyle(emptyCard!).overflow,
            }
          : null,
        emptyState: emptyStateRect
          ? {
              left: emptyStateRect.left,
              right: emptyStateRect.right,
              top: emptyStateRect.top,
              bottom: emptyStateRect.bottom,
            }
          : null,
        bookingRows,
      };
    });

    expect(metrics.document.scrollWidth).toBe(metrics.document.clientWidth);
    expect(metrics.emptyCard ?? metrics.bookingRows[0] ?? null).not.toBeNull();
    if (metrics.emptyCard) {
      expect(metrics.emptyCard.left).toBeGreaterThanOrEqual(0);
      expect(metrics.emptyCard.right).toBeLessThanOrEqual(
        metrics.viewport.width,
      );
      expect(metrics.emptyCard.overflow).toBe("hidden");
    }
    for (const row of metrics.bookingRows) {
      expect(row.left).toBeGreaterThanOrEqual(0);
      expect(row.right).toBeLessThanOrEqual(metrics.viewport.width);
    }
    expect(metrics.tablist?.overflowX).toBe("auto");
    expect(metrics.tablist?.overflowY).toBe("hidden");
    expect(metrics.tablist?.rect?.left ?? -1).toBeGreaterThanOrEqual(0);
    expect(metrics.tablist?.rect?.right ?? Infinity).toBeLessThanOrEqual(
      metrics.viewport.width,
    );
    expect(metrics.tablist?.scrollWidth ?? 0).toBeGreaterThanOrEqual(
      metrics.tablist?.clientWidth ?? 0,
    );
  });
}
