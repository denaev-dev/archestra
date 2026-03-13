"use client";

import { RefreshCw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PermissionButton } from "@/components/ui/permission-button";
import { useSecretsType, useTestVaultConnection } from "@/lib/secrets.query";

export function TestVaultConnectionSection() {
  const { data: secretsType } = useSecretsType();
  const testMutation = useTestVaultConnection();

  // Only show when using Vault or BYOS Vault
  if (!secretsType || secretsType.type !== "Vault") {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Test Vault Connection</CardTitle>
        <CardDescription>
          Creates and immediately deletes a test secret at the configured Vault
          secret path to verify connectivity and write permissions.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <PermissionButton
          permissions={{ secret: ["update"] }}
          onClick={() => testMutation.mutate()}
          disabled={testMutation.isPending}
        >
          {testMutation.isPending && (
            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
          )}
          Test Vault Connection
        </PermissionButton>

        {testMutation.isError && (
          <Alert variant="destructive">
            <AlertTitle>Connection Failed</AlertTitle>
            <AlertDescription>
              {testMutation.error?.message || "Failed to connect to Vault"}
            </AlertDescription>
          </Alert>
        )}

        {testMutation.isSuccess && testMutation.data && (
          <Alert>
            <AlertTitle>Connection Successful</AlertTitle>
            <AlertDescription>{testMutation.data.message}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
