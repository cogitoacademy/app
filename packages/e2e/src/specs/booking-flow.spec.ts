import { expect, test, type Browser, type Page } from "@playwright/test";

const SEED_EMAIL = "student.seed@cogitoacademy.id";
const SEED_PASSWORD = "Student123!";
const FRIEND_EMAIL = "student.friend1.seed@cogitoacademy.id";
const TUTOR_EMAIL = "tutor.seed@cogitoacademy.id";
const TUTOR_PASSWORD = "Tutor123!";

async function login(page: Page, email = SEED_EMAIL, password = SEED_PASSWORD) {
  if (email === SEED_EMAIL) {
    await page.goto("/dashboard");
    if (/\/dashboard(?:$|\/)/.test(new URL(page.url()).pathname)) return;
  } else {
    await page.context().clearCookies();
  }
  await page.goto("/login");
  const pathsAfterLoginPage: string[] = [];
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) {
      pathsAfterLoginPage.push(new URL(frame.url()).pathname);
    }
  });
  await page.getByLabel("Email").fill(email);
  await page.locator("input#password").fill(password);
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await page.waitForURL(/\/(dashboard|onboarding|admin-tutors)(?:$|\/)/);
  expect(pathsAfterLoginPage).not.toContain("/login");
}

async function openBookingPage(page: Page) {
  await page.goto("/tutors");
  await expect(
    page.getByRole("heading", { name: "Tutors" }).first(),
  ).toBeVisible();

  const seedTutorCard = page
    .locator('[data-slot="card"]')
    .filter({ hasText: "Mathematics" })
    .first();
  await expect(seedTutorCard).toBeVisible();
  await seedTutorCard.click();

  const drawer = page.locator('[data-slot="drawer-popup"]').first();
  await expect(
    drawer.getByRole("heading", { name: "[seed] Tutor" }),
  ).toBeVisible();
  // The sticky drawer footer is rendered outside `drawer-popup`; use the
  // button's accessible name instead of scoping the CTA to the content pane.
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Book [seed] Tutor", exact: true })
    .click();
  await page.waitForURL(/\/tutors\/[^/]+\/book$/);
  await expect(
    page.getByRole("heading", { name: "Book [seed] Tutor" }),
  ).toBeVisible();
}

async function chooseAvailableSlot(page: Page, index = 0) {
  const slot = page.getByRole("button", { name: /WIB/ }).nth(index);
  await expect(slot).toBeVisible();
  await slot.click();
}

async function createSoloBooking(
  page: Page,
  slotIndex: number,
  learningGoal: string,
) {
  await login(page);
  await openBookingPage(page);
  await page.getByLabel("What do you want to learn?").fill(learningGoal);
  await chooseAvailableSlot(page, slotIndex);
  const submit = page.getByRole("button", {
    name: "Send booking request",
    exact: true,
  });
  await expect(submit).toBeEnabled();
  await submit.click();
  await page.waitForURL(/\/bookings\/[^/]+$/);
  return new URL(page.url()).pathname.split("/").pop()!;
}

async function findBookingActionLink(
  page: Page,
  bookingId: string,
  action: RegExp,
) {
  const link = page
    .locator(`a[href="/bookings/${bookingId}"]`)
    .filter({ hasText: action })
    .first();
  await expect(link).toBeVisible();
  return link;
}

async function openTutorBooking(browser: Browser, bookingId: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page, TUTOR_EMAIL, TUTOR_PASSWORD);
  await page.goto("/bookings?tab=pending");
  await expect(
    page.getByRole("heading", { name: "Bookings", exact: true }).last(),
  ).toBeVisible();
  const reviewLink = await findBookingActionLink(
    page,
    bookingId,
    /Review request/,
  );
  await reviewLink.click();
  await page.waitForURL(`/bookings/${bookingId}`);
  await expect(
    page.getByRole("heading", { name: /booking request/i }),
  ).toBeVisible();
  return { context, page };
}

async function tutorAcceptsBooking(page: Page, bookingId: string) {
  await page
    .getByRole("button", { name: "Accept booking", exact: true })
    .first()
    .click();
  const dialog = page.getByRole("dialog").last();
  await expect(
    dialog.getByText("Accept booking request?", { exact: true }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Accept booking", exact: true })
    .click();
  await expect(
    page.getByText("Booking accepted", { exact: true }),
  ).toBeVisible();
  await expectAcceptedBooking(page);
  expect(bookingId).toMatch(/^[^/]+$/);
}

async function expectAcceptedBooking(page: Page) {
  await expect(page.getByText(/^(Scheduled|Confirmed)$/).first()).toBeVisible({
    timeout: 15_000,
  });

  if ((await page.getByText("Confirmed", { exact: true }).count()) > 0) {
    await expect(
      page.getByRole("button", { name: /About meeting status:/ }).first(),
    ).toBeVisible();
  }
}

test("student can log in and see starting balance", async ({ page }) => {
  await login(page);
  await page.goto("/balance");
  await expect(page.getByText("200").first()).toBeVisible();
  await expect(page.getByText("Ready to spend")).toBeVisible();
});

test("student can book a solo session from tutor discovery", async ({
  page,
}) => {
  await login(page);
  await openBookingPage(page);
  await page
    .getByLabel("What do you want to learn?")
    .fill("Review quadratic equations before the next exam.");
  await chooseAvailableSlot(page);
  const submit = page.getByRole("button", {
    name: "Send booking request",
    exact: true,
  });
  await expect(submit).toBeEnabled();
  await submit.click();

  await page.waitForURL(/\/bookings\/[^/]+$/);
  await expect(
    page.getByRole("heading", { name: /Session with \[seed\] Tutor/ }),
  ).toBeVisible();
  await expect(page.getByText("Respond by")).toBeVisible();
  await expect(page.getByText("Online", { exact: true }).first()).toBeVisible();
});

test("student can configure an offline group booking and see the target hold", async ({
  page,
}) => {
  await login(page);
  await openBookingPage(page);

  await page
    .getByLabel("What do you want to learn?")
    .fill("Practice a group problem-solving session.");

  const modality = page.getByRole("combobox").first();
  await modality.click();
  await page.getByRole("option", { name: "Offline" }).click();
  await expect(
    page.getByText("Room information appears after approval.", { exact: true }),
  ).toBeVisible();

  const studentSearch = page.getByPlaceholder("Type a name or email");
  await studentSearch.fill("student.friend1.seed");
  const friend = page
    .getByRole("button")
    .filter({ hasText: "[seed] Alya Friend" })
    .last();
  await expect(friend).toBeVisible();
  await friend.click();
  await chooseAvailableSlot(page, 1);

  await expect(page.getByText("Temporary hold", { exact: true })).toBeVisible();
  await expect(page.getByText("80 Marks", { exact: true })).toBeVisible();
  await expect(
    page.getByText(
      "A temporary hold covers 2 target participants. Excess Marks are released as invitees confirm.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Send group booking request" }),
  ).toBeEnabled();
});

test("group invitee can accept and tutor can accept the full online booking", async ({
  page,
  browser,
}) => {
  await login(page);
  await openBookingPage(page);
  await page
    .getByLabel("What do you want to learn?")
    .fill("Solve a group set of quadratic-equation problems.");

  const studentSearch = page.getByPlaceholder("Type a name or email");
  await studentSearch.fill("student.friend1.seed");
  const friend = page
    .getByRole("button")
    .filter({ hasText: "[seed] Alya Friend" })
    .last();
  await expect(friend).toBeVisible();
  await friend.click();
  await chooseAvailableSlot(page, 1);

  const submit = page.getByRole("button", {
    name: "Send group booking request",
    exact: true,
  });
  await expect(submit).toBeEnabled();
  await submit.click();
  await page.waitForURL(/\/bookings\/[^/]+$/);
  const bookingId = new URL(page.url()).pathname.split("/").pop()!;

  const inviteeContext = await browser.newContext();
  const inviteePage = await inviteeContext.newPage();
  try {
    await login(inviteePage, FRIEND_EMAIL, SEED_PASSWORD);
    await inviteePage.goto(`/bookings/${bookingId}`);
    await expect(
      inviteePage.getByRole("button", {
        name: "Accept invitation",
        exact: true,
      }),
    ).toBeVisible();
    await inviteePage
      .getByRole("button", { name: "Accept invitation", exact: true })
      .click();
    await expect(
      inviteePage.getByText("Group invitation accepted", { exact: true }),
    ).toBeVisible();
  } finally {
    await inviteeContext.close();
  }

  const tutor = await openTutorBooking(browser, bookingId);
  try {
    await tutorAcceptsBooking(tutor.page, bookingId);
  } finally {
    await tutor.context.close();
  }

  await page.reload();
  await expectAcceptedBooking(page);
});

test("tutor can decline a request and the student sees the terminal state", async ({
  page,
  browser,
}) => {
  const bookingId = await createSoloBooking(
    page,
    2,
    "Review a difficult mechanics problem before the exam.",
  );
  const tutor = await openTutorBooking(browser, bookingId);
  try {
    await tutor.page
      .getByRole("button", { name: "Decline request", exact: true })
      .first()
      .click();
    const dialog = tutor.page.getByRole("dialog").last();
    await expect(
      dialog.getByText("Decline booking request?", { exact: true }),
    ).toBeVisible();
    const reason = dialog.getByLabel("Reason", { exact: true });
    const decline = dialog.getByRole("button", {
      name: "Decline request",
      exact: true,
    });
    await expect(decline).toBeDisabled();
    await reason.fill("I am unavailable at this time.");
    await expect(decline).toBeEnabled();
    await decline.click();
    await expect(
      tutor.page.getByText("Booking declined", { exact: true }),
    ).toBeVisible();
    await expect(
      tutor.page.getByText("Declined", { exact: true }).last(),
    ).toBeVisible();
  } finally {
    await tutor.context.close();
  }

  await page.reload();
  await expect(
    page.getByText("Declined", { exact: true }).last(),
  ).toBeVisible();
});

test("another student cannot open the seed student's booking", async ({
  page,
  browser,
}) => {
  const bookingId = await createSoloBooking(
    page,
    3,
    "Keep this booking private to the proposer.",
  );
  const otherContext = await browser.newContext();
  const otherPage = await otherContext.newPage();
  try {
    await login(otherPage, FRIEND_EMAIL, SEED_PASSWORD);
    await otherPage.goto(`/bookings/${bookingId}`);
    await expect(
      otherPage.getByRole("heading", {
        name: "Booking details are unavailable",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      otherPage.getByRole("heading", { name: /Session with/ }),
    ).toHaveCount(0);
  } finally {
    await otherContext.close();
  }
});
