"use client";

import type { archestraApiTypes } from "@shared";
import {
  ChevronsUpDown,
  Edit,
  Plus,
  Save,
  Settings,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useState } from "react";
import { WithPermissions } from "@/components/roles/with-permissions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PermissionButton } from "@/components/ui/permission-button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useModelsWithApiKeys } from "@/lib/chat-models.query";
import {
  useCreateLimit,
  useDeleteLimit,
  useLimits,
  useUpdateLimit,
} from "@/lib/limits.query";
import {
  useOrganization,
  useUpdateOrganization,
} from "@/lib/organization.query";
import { useTeams } from "@/lib/team.query";

// Type aliases for better readability
type LimitData = archestraApiTypes.GetLimitsResponses["200"][number];
type TokenPriceData = {
  model: string;
  provider: string;
  pricePerMillionInput: string;
  pricePerMillionOutput: string;
};
type TeamData = archestraApiTypes.GetTeamsResponses["200"][number];
type UsageStatus = "safe" | "warning" | "danger";

// Loading skeleton component
function LoadingSkeleton({ count, prefix }: { count: number; prefix: string }) {
  const skeletons = Array.from(
    { length: count },
    (_, i) => `${prefix}-skeleton-${i}`,
  );

  return (
    <div className="space-y-3">
      {skeletons.map((key) => (
        <div key={key} className="h-16 bg-muted animate-pulse rounded" />
      ))}
    </div>
  );
}

// Inline Form Component for adding/editing limits
function LimitInlineForm({
  initialData,
  onSave,
  onCancel,
  teams,
  tokenPrices,
  organizationId,
}: {
  initialData?: LimitData;
  onSave: (data: archestraApiTypes.CreateLimitData["body"]) => void;
  onCancel: () => void;
  teams: TeamData[];
  tokenPrices: TokenPriceData[];
  organizationId: string;
}) {
  const [formData, setFormData] = useState<{
    entityType: "organization" | "team";
    entityId: string;
    mcpServerName: string;
    limitValue: string;
    model: string[];
  }>({
    entityType: (initialData?.entityType as "organization" | "team") || "team",
    entityId: initialData?.entityId || "",
    mcpServerName: initialData?.mcpServerName || "",
    limitValue: initialData?.limitValue?.toString() || "",
    model: (initialData?.model as string[]) || [],
  });

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      onSave({
        ...formData,
        limitValue: parseInt(formData.limitValue, 10),
        entityId:
          formData.entityType === "organization"
            ? organizationId
            : formData.entityId,
      });
    },
    [formData, onSave, organizationId],
  );

  const isValid =
    formData.limitValue &&
    (formData.entityType === "organization" || formData.entityId) &&
    Array.isArray(formData.model) &&
    formData.model.length > 0;

  return (
    <tr className="border-b">
      <td colSpan={5} className="p-4 bg-muted/30">
        <TooltipProvider>
          <form
            onSubmit={handleSubmit}
            className="flex flex-wrap items-center gap-4"
          >
            <div className="flex items-center gap-2">
              <Label htmlFor="entityType" className="text-sm whitespace-nowrap">
                Apply To
              </Label>
              <Select
                value={formData.entityType}
                onValueChange={(value) =>
                  setFormData({
                    ...formData,
                    entityType: value as "organization" | "team",
                    entityId: "",
                  })
                }
              >
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="team">Team</SelectItem>
                  <SelectItem value="organization">
                    The whole organization
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {formData.entityType === "team" && (
              <div className="flex items-center gap-2">
                <Label htmlFor="team" className="text-sm whitespace-nowrap">
                  Team
                </Label>
                <Select
                  value={formData.entityId}
                  onValueChange={(value) =>
                    setFormData({ ...formData, entityId: value })
                  }
                >
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Select a team" />
                  </SelectTrigger>
                  <SelectContent>
                    {teams.length === 0 ? (
                      <div className="px-2 py-1.5 text-sm text-muted-foreground">
                        No teams available
                      </div>
                    ) : (
                      teams.map((team) => (
                        <SelectItem key={team.id} value={team.id}>
                          {team.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}

            {
              <div className="flex items-center gap-2">
                <Label htmlFor="model" className="text-sm whitespace-nowrap">
                  Models
                </Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      className="flex-1 justify-between"
                    >
                      {Array.isArray(formData.model) &&
                      formData.model.length > 0
                        ? `${formData.model.length} model${formData.model.length > 1 ? "s" : ""} selected`
                        : "Select models"}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[300px] p-0" align="start">
                    <div className="max-h-[300px] overflow-y-auto p-2">
                      {tokenPrices?.map((price) => (
                        <button
                          key={price.model}
                          type="button"
                          className="flex items-center space-x-2 p-2 hover:bg-accent rounded-sm cursor-pointer w-full text-left"
                          onClick={() => {
                            const currentModels = Array.isArray(formData.model)
                              ? formData.model
                              : [];
                            const isSelected = currentModels.includes(
                              price.model,
                            );
                            const newModels = isSelected
                              ? currentModels.filter((m) => m !== price.model)
                              : [...currentModels, price.model];
                            setFormData((prev) => ({
                              ...prev,
                              model: newModels,
                            }));
                          }}
                        >
                          <Checkbox
                            checked={
                              Array.isArray(formData.model) &&
                              formData.model.includes(price.model)
                            }
                            onCheckedChange={() => {
                              // Handled by parent onClick
                            }}
                          />
                          <span className="flex-1 cursor-pointer text-sm">
                            {price.model}
                          </span>
                        </button>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
                {Array.isArray(formData.model) && formData.model.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {formData.model.map((modelName) => (
                      <Badge
                        key={modelName}
                        variant="secondary"
                        className="text-xs"
                      >
                        {modelName}
                        <button
                          type="button"
                          onClick={() => {
                            const newModels = formData.model.filter(
                              (m: string) => m !== modelName,
                            );
                            setFormData((prev) => ({
                              ...prev,
                              model: newModels,
                            }));
                          }}
                          className="ml-1 hover:text-destructive"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            }

            <div className="flex items-center gap-2">
              <Label htmlFor="limitValue" className="text-sm whitespace-nowrap">
                Limit Value (cost $)
              </Label>
              <Input
                id="limitValue"
                type="text"
                value={
                  formData.limitValue
                    ? parseInt(formData.limitValue, 10).toLocaleString()
                    : ""
                }
                onChange={(e) => {
                  // Remove commas and keep only numbers
                  const value = e.target.value.replace(/[^0-9]/g, "");
                  setFormData({ ...formData, limitValue: value });
                }}
                placeholder={"e.g. 100,000"}
                min="1"
                required
                className="w-32"
              />
            </div>

            <div className="flex gap-2 flex-shrink-0">
              <Button type="submit" disabled={!isValid} size="sm">
                <Save className="h-4 w-4 mr-1" />
                Save
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
                size="sm"
              >
                <X className="h-4 w-4 mr-1" />
                Cancel
              </Button>
            </div>
          </form>
        </TooltipProvider>
      </td>
    </tr>
  );
}

// Limit Row Component for displaying/editing individual limits
function LimitRow({
  limit,
  isEditing,
  onEdit,
  onSave,
  onCancel,
  onDelete,
  teams,
  tokenPrices,
  getEntityName,
  getUsageStatus,
  organizationId,
}: {
  limit: LimitData;
  isEditing: boolean;
  onEdit: () => void;
  onSave: (data: archestraApiTypes.UpdateLimitData["body"]) => void;
  onCancel: () => void;
  onDelete: () => void;
  teams: TeamData[];
  tokenPrices: TokenPriceData[];
  getEntityName: (limit: LimitData) => string;
  getUsageStatus: (
    limitValue: number,
    modelUsage?: Array<{
      model: string;
      tokensIn: number;
      tokensOut: number;
      cost: number;
    }>,
  ) => {
    percentage: number;
    status: UsageStatus;
    actualUsage: number;
    actualLimit: number;
  };
  organizationId: string;
}) {
  if (isEditing) {
    return (
      <LimitInlineForm
        initialData={limit}
        onSave={onSave}
        onCancel={onCancel}
        teams={teams}
        tokenPrices={tokenPrices}
        organizationId={organizationId}
      />
    );
  }

  const { percentage, status, actualUsage, actualLimit } = getUsageStatus(
    limit.limitValue,
    limit.modelUsage,
  );

  return (
    <tr className="border-b hover:bg-muted/30">
      <td className="p-4">
        <div className="flex items-center gap-2">
          <Badge
            variant={
              status === "danger"
                ? "destructive"
                : status === "warning"
                  ? "secondary"
                  : "default"
            }
          >
            {status === "danger"
              ? "Exceeded"
              : status === "warning"
                ? "Near Limit"
                : "Safe"}
          </Badge>
        </div>
      </td>
      <td className="p-4 text-sm text-muted-foreground">
        {getEntityName(limit)}
      </td>
      <td className="p-4">
        <div className="flex flex-wrap gap-1">
          {Array.isArray(limit.model) && limit.model.length > 0 ? (
            (limit.model as string[]).map((modelName: string) => (
              <Badge key={modelName} variant="outline" className="text-xs">
                {modelName}
              </Badge>
            ))
          ) : (
            <span className="text-muted-foreground">-</span>
          )}
        </div>
      </td>
      <td className="p-4">
        <div className="space-y-1">
          <div className="flex justify-between text-sm">
            <span>
              {`$${actualUsage.toFixed(2)} / $${actualLimit.toFixed(2)}`}
            </span>
            <span>{percentage.toFixed(1)}%</span>
          </div>
          <Progress
            value={Math.min(percentage, 100)}
            className={`h-2 ${
              status === "danger"
                ? "bg-red-100"
                : status === "warning"
                  ? "bg-orange-100"
                  : ""
            }`}
          />
        </div>
      </td>
      <td className="p-4">
        <div className="flex items-center gap-2">
          <PermissionButton
            permissions={{ llmTokenLimit: ["update"] }}
            variant="ghost"
            size="sm"
            onClick={onEdit}
          >
            <Edit className="h-4 w-4" />
          </PermissionButton>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <PermissionButton
                permissions={{ llmTokenLimit: ["delete"] }}
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </PermissionButton>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Limit</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete this limit? This action cannot
                  be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={onDelete}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </td>
    </tr>
  );
}

export default function LimitsPage() {
  const [editingLimitId, setEditingLimitId] = useState<string | null>(null);
  const [isAddingLlmLimit, setIsAddingLlmLimit] = useState(false);

  // Data fetching hooks
  const { data: limits = [], isLoading: limitsLoading } = useLimits();
  const { data: teams = [] } = useTeams();
  const { data: organizationDetails } = useOrganization();
  const { data: modelsWithApiKeys = [] } = useModelsWithApiKeys();
  const tokenPrices: TokenPriceData[] = modelsWithApiKeys.map((m) => ({
    model: m.modelId,
    provider: m.provider,
    pricePerMillionInput: m.capabilities?.pricePerMillionInput ?? "0",
    pricePerMillionOutput: m.capabilities?.pricePerMillionOutput ?? "0",
  }));

  const updateCleanupInterval = useUpdateOrganization(
    "Cleanup interval updated successfully",
    "Failed to update cleanup interval",
  );
  const deleteLimit = useDeleteLimit();
  const createLimit = useCreateLimit();
  const updateLimit = useUpdateLimit();

  const llmLimits = limits;

  // Helper function to get entity name
  const getEntityName = useCallback(
    (limit: LimitData) => {
      if (limit.entityType === "team") {
        const team = teams.find((t) => t.id === limit.entityId);
        return team?.name || "Unknown Team";
      }
      if (limit.entityType === "organization") {
        return "The whole organization";
      }
      return "Unknown Profile";
    },
    [teams],
  );

  // Helper function to get usage percentage and status
  const getUsageStatus = useCallback(
    (
      limitValue: number,
      modelUsage?: Array<{
        model: string;
        tokensIn: number;
        tokensOut: number;
        cost: number;
      }>,
    ) => {
      const actualLimit = limitValue;
      // Use precise per-model cost sum from backend
      const actualUsage =
        modelUsage && modelUsage.length > 0
          ? modelUsage.reduce((sum, usage) => sum + usage.cost, 0)
          : 0;

      const percentage = (actualUsage / actualLimit) * 100;
      let status: UsageStatus = "safe";

      if (percentage >= 90) status = "danger";
      else if (percentage >= 75) status = "warning";

      return { percentage, status, actualUsage, actualLimit };
    },
    [],
  );

  const handleDeleteLimit = useCallback(
    async (id: string) => {
      await deleteLimit.mutateAsync({ id });
    },
    [deleteLimit],
  );

  const handleCreateLimit = useCallback(
    async (data: archestraApiTypes.CreateLimitData["body"]) => {
      try {
        await createLimit.mutateAsync(data);
        setIsAddingLlmLimit(false);
      } catch (error) {
        console.error("Failed to create limit:", error);
      }
    },
    [createLimit],
  );

  const handleUpdateLimit = useCallback(
    async (id: string, data: archestraApiTypes.UpdateLimitData["body"]) => {
      try {
        await updateLimit.mutateAsync({ id, ...data });
        setEditingLimitId(null);
      } catch (error) {
        console.error("Failed to update limit:", error);
      }
    },
    [updateLimit],
  );

  const handleCancelEdit = useCallback(() => {
    setEditingLimitId(null);
    setIsAddingLlmLimit(false);
  }, []);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Auto-cleanup interval</CardTitle>
            <WithPermissions
              permissions={{ llmTokenLimit: ["update"] }}
              noPermissionHandle="tooltip"
            >
              {({ hasPermission }) => (
                <Select
                  value={organizationDetails?.limitCleanupInterval || "1h"}
                  onValueChange={(value) => {
                    updateCleanupInterval.mutate({
                      limitCleanupInterval: value as NonNullable<
                        archestraApiTypes.UpdateOrganizationData["body"]
                      >["limitCleanupInterval"],
                    });
                  }}
                  disabled={updateCleanupInterval.isPending || !hasPermission}
                >
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1h">Every hour</SelectItem>
                    <SelectItem value="12h">Every 12 hours</SelectItem>
                    <SelectItem value="24h">Every 24 hours</SelectItem>
                    <SelectItem value="1w">Every week</SelectItem>
                    <SelectItem value="1m">Every month</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </WithPermissions>
          </div>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xl">LLM Limits</CardTitle>
              <CardDescription>
                Token cost limits for LLM usage across teams and organization
              </CardDescription>
            </div>
            <PermissionButton
              permissions={{ llmTokenLimit: ["create"] }}
              onClick={() => setIsAddingLlmLimit(true)}
              size="sm"
              disabled={isAddingLlmLimit || editingLimitId !== null}
            >
              <Plus className="h-4 w-4 mr-1" />
              Add LLM Limit
            </PermissionButton>
          </div>
        </CardHeader>
        <CardContent>
          {limitsLoading ? (
            <LoadingSkeleton count={3} prefix="llm-limits" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Applied to</TableHead>
                  <TableHead>Models</TableHead>
                  <TableHead>Usage</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isAddingLlmLimit && (
                  <LimitInlineForm
                    onSave={handleCreateLimit}
                    onCancel={handleCancelEdit}
                    teams={teams}
                    tokenPrices={tokenPrices}
                    organizationId={organizationDetails?.id || ""}
                  />
                )}
                {llmLimits.length === 0 && !isAddingLlmLimit ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="text-center py-8 text-muted-foreground"
                    >
                      <Settings className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>No LLM limits configured</p>
                      <p className="text-sm">
                        Click "Add LLM Limit" to get started
                      </p>
                    </TableCell>
                  </TableRow>
                ) : (
                  llmLimits.map((limit) => (
                    <LimitRow
                      key={limit.id}
                      limit={limit}
                      isEditing={editingLimitId === limit.id}
                      onEdit={() => setEditingLimitId(limit.id)}
                      onSave={(data) => handleUpdateLimit(limit.id, data)}
                      onCancel={handleCancelEdit}
                      onDelete={() => handleDeleteLimit(limit.id)}
                      teams={teams}
                      tokenPrices={tokenPrices}
                      getEntityName={getEntityName}
                      getUsageStatus={getUsageStatus}
                      organizationId={organizationDetails?.id || ""}
                    />
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
