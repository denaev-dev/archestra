import { eq } from "drizzle-orm";
import db, { schema } from "@/database";
import { describe, expect, test } from "@/test";
import AccountModel from "./account";

describe("AccountModel", () => {
  describe("getByUserId", () => {
    test("should return account when user has account", async ({
      makeUser,
      makeAccount,
    }) => {
      const user = await makeUser();
      const account = await makeAccount(user.id, {
        accountId: "oauth-account-123",
        providerId: "google",
        accessToken: "access-token-123",
      });

      const found = await AccountModel.getByUserId(user.id);

      expect(found).toBeDefined();
      expect(found?.id).toBe(account.id);
      expect(found?.userId).toBe(user.id);
      expect(found?.accountId).toBe("oauth-account-123");
      expect(found?.providerId).toBe("google");
      expect(found?.accessToken).toBe("access-token-123");
    });

    test("should return undefined when user has no account", async ({
      makeUser,
    }) => {
      const user = await makeUser();
      const account = await AccountModel.getByUserId(user.id);
      expect(account).toBeUndefined();
    });
  });

  describe("getAllByUserId", () => {
    test("should return all accounts for a user ordered by updatedAt DESC", async ({
      makeUser,
      makeAccount,
    }) => {
      const user = await makeUser();

      // Create multiple accounts
      const account1 = await makeAccount(user.id, {
        accountId: "google-123",
        providerId: "google",
        accessToken: "access-token-1",
      });
      const account2 = await makeAccount(user.id, {
        accountId: "github-123",
        providerId: "github",
        accessToken: "access-token-2",
      });

      const accounts = await AccountModel.getAllByUserId(user.id);

      expect(accounts).toHaveLength(2);
      // Most recently updated should be first
      expect(accounts.map((a) => a.id)).toContain(account1.id);
      expect(accounts.map((a) => a.id)).toContain(account2.id);
    });

    test("should return empty array when user has no accounts", async ({
      makeUser,
    }) => {
      const user = await makeUser();
      const accounts = await AccountModel.getAllByUserId(user.id);
      expect(accounts).toEqual([]);
    });
  });

  describe("getLatestSsoAccountByUserIdAndProviderId", () => {
    test("returns the most recently updated account for the provider", async ({
      makeUser,
      makeAccount,
    }) => {
      const user = await makeUser();
      const older = await makeAccount(user.id, {
        providerId: "okta",
        idToken: "older-id-token",
      });
      const latest = await makeAccount(user.id, {
        providerId: "okta",
        idToken: "latest-id-token",
      });
      await db
        .update(schema.accountsTable)
        .set({ updatedAt: new Date("2026-01-01T00:00:00.000Z") })
        .where(eq(schema.accountsTable.id, older.id));
      await db
        .update(schema.accountsTable)
        .set({ updatedAt: new Date("2026-01-01T00:00:01.000Z") })
        .where(eq(schema.accountsTable.id, latest.id));
      await makeAccount(user.id, {
        providerId: "github",
        idToken: "other-provider-token",
      });

      const found = await AccountModel.getLatestSsoAccountByUserIdAndProviderId(
        user.id,
        "okta",
      );

      expect(found?.id).toBe(latest.id);
      expect(found?.providerId).toBe("okta");
      expect(found?.idToken).toBe("latest-id-token");
    });

    test("returns undefined when the user has no account for the provider", async ({
      makeUser,
      makeAccount,
    }) => {
      const user = await makeUser();
      await makeAccount(user.id, { providerId: "github" });

      const found = await AccountModel.getLatestSsoAccountByUserIdAndProviderId(
        user.id,
        "okta",
      );

      expect(found).toBeUndefined();
    });
  });
});
