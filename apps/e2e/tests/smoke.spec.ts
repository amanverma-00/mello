import { test, expect } from "@playwright/test";

test.describe("Smoke Tests", () => {
  test("health endpoint returns ok", async ({ request }) => {
    const resp = await request.get("http://localhost:3001/api/v1/health");
    expect(resp.ok()).toBeTruthy();
    const body = await resp.json();
    expect(body.status).toBe("ok");
    expect(body.redis).toBe("connected");
    expect(body.postgres).toBe("connected");
  });

  test("landing page loads", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/melo/i);
  });

  test("landing page has host and join entry points", async ({ page }) => {
    await page.goto("/");
    // Host CTA
    const hostButton = page.getByRole("button", { name: /start.*session|host|create/i });
    await expect(hostButton.or(page.getByRole("link", { name: /start.*session|host|create|spotify/i }))).toBeVisible();
  });

  test("join page renders with code input", async ({ page }) => {
    await page.goto("/join/ABC123");
    // Should show a name input or code field
    const nameInput = page.getByPlaceholder(/name/i);
    const codeInput = page.getByPlaceholder(/code/i);
    await expect(nameInput.or(codeInput)).toBeVisible();
  });

  test("API returns 401 for unauthenticated session creation", async ({
    request,
  }) => {
    const resp = await request.post("http://localhost:3001/api/v1/sessions");
    expect(resp.status()).toBe(401);
  });

  test("API returns 404 for nonexistent session", async ({ request }) => {
    const resp = await request.post(
      "http://localhost:3001/api/v1/sessions/XXXXXX/join",
      {
        data: { displayName: "TestUser" },
        headers: { "Content-Type": "application/json" },
      },
    );
    expect(resp.status()).toBe(404);
  });
});

test.describe("Navigation", () => {
  test("unknown routes show fallback or redirect", async ({ page }) => {
    const resp = await page.goto("/nonexistent-route");
    // Should either 404 or redirect to home (SPA behaviour)
    expect(resp?.status()).toBeLessThan(500);
  });
});
