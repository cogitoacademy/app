import { expect, test, type Page } from "@playwright/test";

// Rendering coverage uses synthetic responses and never seeds or writes a database.
async function openTutorProfile(
  page: Page,
  profile: Record<string, unknown> = {},
) {
  const user = {
    id: "profile-render-tutor",
    name: "Profile Tutor",
    email: "profile-render@example.test",
    emailVerified: true,
    image: null,
    role: "tutor",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await page.route("**/api/auth/get-session**", (route) =>
    route.fulfill({
      json: {
        user,
        session: {
          id: "profile-render-session",
          userId: user.id,
          expiresAt: "2099-01-01T00:00:00.000Z",
        },
      },
    }),
  );
  await page.route("**/rpc/**", (route) => {
    const isProfile =
      new URL(route.request().url()).pathname === "/rpc/tutor/getMyProfile";
    return route.fulfill({
      json: {
        json: isProfile
          ? {
              id: "profile-render-fixture",
              onboardingStatus: "draft",
              user,
              subjects: [],
              prices: {},
              pendingProfileChanges: null,
              ...profile,
            }
          : route.request().url().includes("/notification/")
            ? { items: [], count: 0 }
            : [],
        meta: [],
      },
    });
  });
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/profile");
  return errors;
}

test("tutor profile renders the tax introduction and editable identity fields", async ({
  page,
}) => {
  const errors = await openTutorProfile(page);
  await expect(
    page.getByText("Tax identity for payouts", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Legal name", { exact: true })).toBeVisible();
  await expect(
    page.getByText(
      "Complete your legal name and 16-digit NIK before a new payout is prepared.",
      { exact: false },
    ),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("ongoing experience keeps year controls aligned and stable", async ({
  page,
}) => {
  const errors = await openTutorProfile(page, {
    experiences: [
      {
        role: "Tutor",
        organization: "Academy",
        startYear: 2023,
        endYear: 2025,
        description: "Teaching students.",
      },
    ],
  });
  const ongoing = page.getByRole("checkbox", {
    name: "I currently work in this role",
  });
  const start = page.getByLabel("Start year", { exact: true });
  const end = page.getByLabel("End year", { exact: true });
  await expect(ongoing).not.toBeChecked();
  await expect(end).toHaveValue("2025");
  await end.scrollIntoViewIfNeeded();
  const before = await end.boundingBox();
  const startBox = await start.boundingBox();
  expect(Math.abs(before!.y - startBox!.y)).toBeLessThan(2);
  await ongoing.check();
  await expect(end).toBeDisabled();
  await expect(end).toHaveValue("");
  const after = await end.boundingBox();
  expect(after!.y).toBe(before!.y);
  expect(after!.height).toBe(before!.height);
  await ongoing.uncheck();
  await expect(end).toBeEnabled();
  await expect(end).toHaveValue(String(new Date().getFullYear()));
  await end.focus();
  await end.press("ControlOrMeta+a");
  await end.pressSequentially("2024");
  await end.blur();
  await expect(ongoing).not.toBeChecked();
  await expect(end).toHaveValue("2024");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(ongoing).toBeVisible();
  expect(errors).toEqual([]);
});

test("saved ongoing experience starts checked with disabled end year", async ({
  page,
}) => {
  const errors = await openTutorProfile(page, {
    experiences: [
      {
        role: "Tutor",
        organization: "Academy",
        startYear: 2023,
        endYear: null,
        description: "Teaching students.",
      },
    ],
  });
  await expect(
    page.getByRole("checkbox", { name: "I currently work in this role" }),
  ).toBeChecked();
  await expect(page.getByLabel("End year", { exact: true })).toBeDisabled();
  expect(errors).toEqual([]);
});

/* eslint-disable no-await-in-loop -- Viewport checks navigate the same page sequentially. */
test("education section keeps its info button beside a wrapping title", async ({
  page,
}) => {
  const errors = await openTutorProfile(page);
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.reload();
    const title = page
      .locator('[data-slot="card-title"]')
      .filter({ hasText: "Education, Achievements & Experiences" });
    const info = title.getByRole("button", {
      name: "More information about Education, Achievements & Experiences",
    });
    await info.scrollIntoViewIfNeeded();
    const label = await title.locator("span").first().boundingBox();
    const button = await info.boundingBox();
    expect(button!.x).toBeGreaterThanOrEqual(label!.x + label!.width);
    expect(button!.y).toBeGreaterThanOrEqual(label!.y);
    expect(button!.y + button!.height).toBeLessThanOrEqual(
      label!.y + label!.height + 1,
    );
    await expect(info).toBeVisible();
  }
  expect(errors).toEqual([]);
});

/* eslint-enable no-await-in-loop */

for (const state of [
  { status: "published", edit: "none", badge: "Published", notice: null },
  {
    status: "published",
    edit: "pending_review",
    badge: "Published",
    notice: "Your profile is live. Your latest edits are awaiting review.",
  },
  {
    status: "published",
    edit: "changes_requested",
    badge: "Published",
    notice:
      "Your profile is live, but the admin requested revisions to your proposed changes.",
  },
  {
    status: "draft",
    edit: "none",
    badge: "Draft",
    notice:
      "Complete the required sections below. You can save a draft at any time before submitting for review.",
  },
  {
    status: "pending_review",
    edit: "none",
    badge: "Needs review",
    notice:
      "Your profile is under review. You will be notified once an admin approves it.",
  },
  {
    status: "approved_unpublished",
    edit: "none",
    badge: "Approved",
    notice:
      "Your profile has been approved and is waiting for publication by an admin.",
  },
  {
    status: "suspended",
    edit: "none",
    badge: "Suspended",
    notice:
      "Your tutor profile has been suspended. Please contact admin for details.",
  },
]) {
  test(`compact profile status: ${state.status}/${state.edit}`, async ({
    page,
  }) => {
    const errors = await openTutorProfile(page, {
      onboardingStatus: state.status,
      profileEditStatus: state.edit,
      profileEditAdminNote:
        state.edit === "changes_requested"
          ? "Please update your affiliation."
          : null,
    });
    const header = page
      .locator("header")
      .filter({ has: page.getByRole("heading", { level: 1 }) });
    await expect(header.getByText(state.badge, { exact: true })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Profile status", exact: true }),
    ).toHaveCount(0);
    if (state.notice) {
      await expect(header.getByRole("status")).toHaveText(state.notice);
    } else {
      await expect(header.getByRole("status")).toHaveCount(0);
    }
    if (state.edit === "changes_requested") {
      await expect(
        page.getByText("Please update your affiliation.", { exact: true }),
      ).toBeVisible();
    }
    if (state.edit === "pending_review") {
      await page.screenshot({
        path: test.info().outputPath("profile-status-desktop.png"),
      });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await expect(header.getByText(state.badge, { exact: true })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    if (state.edit === "pending_review") {
      await page.screenshot({
        path: test.info().outputPath("profile-status-mobile.png"),
      });
    }
    expect(errors).toEqual([]);
  });
}
