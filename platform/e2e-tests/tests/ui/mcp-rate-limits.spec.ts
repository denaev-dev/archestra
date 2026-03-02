import { archestraApiSdk } from "@shared";
import { expect, test } from "../../fixtures";

test.describe("MCP Rate Limits", () => {
  let agentId: string;
  let cookieHeaders: string;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext({
      storageState: "e2e-tests/playwright/.auth/admin.json",
    });
    const page = await context.newPage();
    cookieHeaders = (await context.cookies())
      .map((c) => `${c.name}=${c.value}`)
      .join("; ");

    // Create a dedicated agent for rate limit tests
    const createResult = await archestraApiSdk.createAgent({
      headers: { Cookie: cookieHeaders },
      body: { name: "E2E Rate Limit Agent", teams: [], scope: "org" },
    });

    if (createResult.error || !createResult.data) {
      throw new Error(
        `Failed to create test agent: ${JSON.stringify(createResult.error)}`,
      );
    }
    agentId = createResult.data.id;
    await context.close();
  });

  test.afterAll(async ({ browser }) => {
    if (!agentId) return;
    const context = await browser.newContext({
      storageState: "e2e-tests/playwright/.auth/admin.json",
    });
    cookieHeaders = (await context.cookies())
      .map((c) => `${c.name}=${c.value}`)
      .join("; ");

    await archestraApiSdk.deleteAgent({
      headers: { Cookie: cookieHeaders },
      path: { id: agentId },
    });
    await context.close();
  });

  test("shows empty state when no rate limits exist", async ({
    page,
    goToPage,
  }) => {
    test.setTimeout(60_000);
    await goToPage(page, "/mcp-rate-limits");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByText("No MCP rate limits configured")).toBeVisible({
      timeout: 15_000,
    });
  });

  test("can create a per-server rate limit", async ({
    page,
    goToPage,
    extractCookieHeaders,
  }) => {
    test.setTimeout(120_000);
    await goToPage(page, "/mcp-rate-limits");
    await page.waitForLoadState("domcontentloaded");

    // Click "Add Rate Limit"
    await page.getByRole("button", { name: "Add Rate Limit" }).click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 10_000 });

    // Select agent
    await page.getByLabel("Agent / MCP Gateway").click();
    await page
      .getByRole("option", { name: "E2E Rate Limit Agent" })
      .click();

    // Type defaults to "Per Server"
    await expect(page.getByLabel("Type")).toHaveText(/Per Server/);

    // Select MCP server name - enter manually since there may be no catalog items
    // The MCP Server select may be empty. We need to fill mcpServerName.
    // Since the UI uses a Select, we need a server to exist. Let's use a known server name.
    // Actually, the select dropdown uses catalog items. If none exist, we can't select one.
    // Let's check if there are options and handle both cases.
    await page.getByLabel("MCP Server").click();
    // Select the first available option, or skip if none
    const serverOptions = page.getByRole("option");
    const serverCount = await serverOptions.count();
    if (serverCount > 0) {
      await serverOptions.first().click();
    } else {
      // Close the dropdown and skip - no servers available to test with
      await page.keyboard.press("Escape");
      test.skip(true, "No MCP servers available in catalog");
      return;
    }

    // Set window to "1 hour" (default)
    // Window defaults to 1 hour, no change needed

    // Set max calls
    await page.getByLabel("Max Calls").fill("500");

    // Submit
    await page.getByRole("button", { name: "Create Rate Limit" }).click();

    // Wait for dialog to close
    await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: 15_000 });

    // Verify the row appears in the table
    await expect(page.getByText("E2E Rate Limit Agent")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText("Per Server")).toBeVisible();
    await expect(page.getByText("500 calls")).toBeVisible();

    // Clean up: delete the rate limit via API
    const cookies = await extractCookieHeaders(page);
    const limitsResult = await archestraApiSdk.getMcpRateLimits({
      headers: { Cookie: cookies },
    });
    if (limitsResult.data) {
      const limit = limitsResult.data.find((l) => l.agentId === agentId);
      if (limit) {
        await archestraApiSdk.deleteMcpRateLimit({
          headers: { Cookie: cookies },
          path: { id: limit.id },
        });
      }
    }
  });

  test("can create a per-tool rate limit", async ({
    page,
    goToPage,
    extractCookieHeaders,
  }) => {
    test.setTimeout(120_000);
    await goToPage(page, "/mcp-rate-limits");
    await page.waitForLoadState("domcontentloaded");

    // Click "Add Rate Limit"
    await page.getByRole("button", { name: "Add Rate Limit" }).click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 10_000 });

    // Select agent
    await page.getByLabel("Agent / MCP Gateway").click();
    await page
      .getByRole("option", { name: "E2E Rate Limit Agent" })
      .click();

    // Change type to "Per Tool"
    await page.getByLabel("Type").click();
    await page.getByRole("option", { name: "Per Tool" }).click();

    // Select MCP server
    await page.getByLabel("MCP Server").click();
    const serverOptions = page.getByRole("option");
    const serverCount = await serverOptions.count();
    if (serverCount > 0) {
      await serverOptions.first().click();
    } else {
      await page.keyboard.press("Escape");
      test.skip(true, "No MCP servers available in catalog");
      return;
    }

    // Enter tool name (manual input since agent likely has no tools assigned)
    await page.getByPlaceholder("Enter tool name manually").fill("test-tool");

    // Set max calls
    await page.getByLabel("Max Calls").fill("100");

    // Submit
    await page.getByRole("button", { name: "Create Rate Limit" }).click();

    // Wait for dialog to close
    await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: 15_000 });

    // Verify the row appears
    await expect(page.getByText("Per Tool")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("test-tool")).toBeVisible();

    // Clean up via API
    const cookies = await extractCookieHeaders(page);
    const limitsResult = await archestraApiSdk.getMcpRateLimits({
      headers: { Cookie: cookies },
    });
    if (limitsResult.data) {
      for (const limit of limitsResult.data.filter(
        (l) => l.agentId === agentId,
      )) {
        await archestraApiSdk.deleteMcpRateLimit({
          headers: { Cookie: cookies },
          path: { id: limit.id },
        });
      }
    }
  });

  test("can edit a rate limit", async ({
    page,
    goToPage,
    extractCookieHeaders,
  }) => {
    test.setTimeout(120_000);

    // Create a rate limit via API
    const cookies = await extractCookieHeaders(page);

    // We need a valid MCP server name. Get the first catalog item.
    const catalogResult = await archestraApiSdk.getInternalMcpCatalog({
      headers: { Cookie: cookies },
    });
    if (
      !catalogResult.data ||
      catalogResult.data.length === 0
    ) {
      test.skip(true, "No MCP servers available in catalog");
      return;
    }
    const serverName = catalogResult.data[0].name;

    const createResult = await archestraApiSdk.createMcpRateLimit({
      headers: { Cookie: cookies },
      body: {
        agentId,
        limitType: "mcp_server_calls",
        mcpServerName: serverName,
        maxCalls: 200,
        windowSeconds: 3600,
      },
    });
    if (createResult.error || !createResult.data) {
      throw new Error(
        `Failed to create test rate limit: ${JSON.stringify(createResult.error)}`,
      );
    }
    const limitId = createResult.data.id;

    try {
      await goToPage(page, "/mcp-rate-limits");
      await page.waitForLoadState("domcontentloaded");

      // Wait for the table to show
      await expect(page.getByText("E2E Rate Limit Agent")).toBeVisible({
        timeout: 15_000,
      });

      // Click the edit button (pencil icon) on the row
      const row = page.getByRole("row").filter({
        hasText: "E2E Rate Limit Agent",
      });
      await row.getByRole("button").first().click();

      // Wait for the edit dialog to appear
      await expect(page.getByText("Edit Rate Limit")).toBeVisible({
        timeout: 10_000,
      });

      // Update max calls
      const maxCallsInput = page.getByLabel("Max Calls");
      await maxCallsInput.clear();
      await maxCallsInput.fill("999");

      // Save changes
      await page.getByRole("button", { name: "Save Changes" }).click();

      // Wait for dialog to close
      await expect(page.getByRole("dialog")).not.toBeVisible({
        timeout: 15_000,
      });

      // Verify updated value appears in the table
      await expect(page.getByText("999 calls")).toBeVisible({
        timeout: 10_000,
      });
    } finally {
      // Clean up
      await archestraApiSdk.deleteMcpRateLimit({
        headers: { Cookie: cookies },
        path: { id: limitId },
      });
    }
  });

  test("can delete a rate limit", async ({
    page,
    goToPage,
    extractCookieHeaders,
  }) => {
    test.setTimeout(120_000);

    // Create a rate limit via API
    const cookies = await extractCookieHeaders(page);

    const catalogResult = await archestraApiSdk.getInternalMcpCatalog({
      headers: { Cookie: cookies },
    });
    if (
      !catalogResult.data ||
      catalogResult.data.length === 0
    ) {
      test.skip(true, "No MCP servers available in catalog");
      return;
    }
    const serverName = catalogResult.data[0].name;

    await archestraApiSdk.createMcpRateLimit({
      headers: { Cookie: cookies },
      body: {
        agentId,
        limitType: "mcp_server_calls",
        mcpServerName: serverName,
        maxCalls: 300,
        windowSeconds: 3600,
      },
    });

    await goToPage(page, "/mcp-rate-limits");
    await page.waitForLoadState("domcontentloaded");

    // Wait for the table to show
    await expect(page.getByText("E2E Rate Limit Agent")).toBeVisible({
      timeout: 15_000,
    });

    // Click the delete button (trash icon) on the row
    const row = page.getByRole("row").filter({
      hasText: "E2E Rate Limit Agent",
    });
    // The delete button is the second button in the actions column (after edit)
    const deleteButton = row
      .getByRole("button")
      .filter({ has: page.locator("svg.text-destructive, .text-destructive") })
      .first();
    await deleteButton.click();

    // Confirm deletion in the alert dialog
    await expect(page.getByText("Delete MCP Rate Limit")).toBeVisible({
      timeout: 10_000,
    });
    await page
      .getByRole("button", { name: "Delete" })
      .filter({ hasNotText: "Delete MCP Rate Limit" })
      .click();

    // Verify the row is removed
    await expect(page.getByText("E2E Rate Limit Agent")).not.toBeVisible({
      timeout: 15_000,
    });

    // Verify empty state is shown
    await expect(page.getByText("No MCP rate limits configured")).toBeVisible({
      timeout: 10_000,
    });
  });
});
