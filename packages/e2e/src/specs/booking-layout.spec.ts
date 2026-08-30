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
    await expect(page.locator('[data-slot="empty-state"]')).toBeVisible();

    const metrics = await page.evaluate(() => {
      const tablist = document.querySelector(
        '[data-slot="booking-tab-scroller"]',
      );
      const emptyState = document.querySelector('[data-slot="empty-state"]');
      const emptyCard = emptyState?.closest('[data-slot="card"]') ?? null;
      const tablistRect = tablist?.getBoundingClientRect() ?? null;
      const emptyCardRect = emptyCard?.getBoundingClientRect() ?? null;
      const emptyStateRect = emptyState?.getBoundingClientRect() ?? null;

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
      };
    });

    expect(metrics.document.scrollWidth).toBe(metrics.document.clientWidth);
    expect(metrics.emptyCard?.left ?? -1).toBeGreaterThanOrEqual(0);
    expect(metrics.emptyCard?.right ?? Infinity).toBeLessThanOrEqual(
      metrics.viewport.width,
    );
    expect(metrics.emptyCard?.overflow).toBe("hidden");
    expect(metrics.tablist?.overflowX).toBe("auto");
    expect(metrics.tablist?.overflowY).toBe("hidden");
    expect(metrics.tablist?.scrollWidth ?? 0).toBeGreaterThan(
      metrics.tablist?.clientWidth ?? 0,
    );
  });
}
