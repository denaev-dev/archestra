"use client";

import type { archestraApiTypes } from "@shared";
import type { ColumnDef, SortingState } from "@tanstack/react-table";
import {
  Check,
  ChevronDown,
  ChevronsUpDown,
  ChevronUp,
  Edit,
  Plus,
  Settings,
  Trash2,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import type { CatalogItem } from "@/app/mcp/registry/_parts/mcp-server-card";
import { PageLayout } from "@/components/page-layout";
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
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { DataTable } from "@/components/ui/data-table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogForm,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useProfiles } from "@/lib/agent.query";
import { useInternalMcpCatalog } from "@/lib/internal-mcp-catalog.query";
import {
  useCreateMcpRateLimit,
  useDeleteMcpRateLimit,
  useMcpRateLimits,
  useUpdateMcpRateLimit,
} from "@/lib/mcp-rate-limits.query";
import { cn } from "@/lib/utils";

type AgentData = archestraApiTypes.GetAllAgentsResponses["200"][number];
type McpRateLimitData =
  archestraApiTypes.GetMcpRateLimitsResponses["200"][number];
type UsageStatus = "safe" | "warning" | "danger";
type McpLimitType = "mcp_server_calls" | "tool_calls";

const WINDOW_PRESETS = [
  { label: "1 minute", value: 60 },
  { label: "1 hour", value: 3_600 },
  { label: "1 day", value: 86_400 },
  { label: "1 week", value: 604_800 },
  { label: "1 month", value: 2_592_000 },
] as const;

export default function McpRateLimitsClient() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingLimit, setEditingLimit] = useState<McpRateLimitData | null>(
    null,
  );
  const [sorting, setSorting] = useState<SortingState>([]);

  const { data: limits = [], isLoading } = useMcpRateLimits();
  const { data: mcpServers = [] } = useInternalMcpCatalog();
  const { data: agents = [] } = useProfiles({
    filters: { agentTypes: ["mcp_gateway", "agent", "profile"] },
  });

  const deleteMcpRateLimit = useDeleteMcpRateLimit();
  const createMcpRateLimit = useCreateMcpRateLimit();
  const updateMcpRateLimit = useUpdateMcpRateLimit();

  const getAgentName = useCallback(
    (limit: McpRateLimitData) => {
      const agent = agents.find((a) => a.id === limit.agentId);
      return agent?.name || limit.agentId;
    },
    [agents],
  );

  const handleCreate = useCallback(
    async (data: archestraApiTypes.CreateMcpRateLimitData["body"]) => {
      try {
        await createMcpRateLimit.mutateAsync(data);
        setDialogOpen(false);
      } catch {
        // Error handled by mutation hook
      }
    },
    [createMcpRateLimit],
  );

  const handleUpdate = useCallback(
    async (
      id: string,
      data: archestraApiTypes.CreateMcpRateLimitData["body"],
    ) => {
      try {
        await updateMcpRateLimit.mutateAsync({ id, ...data });
        setEditingLimit(null);
      } catch {
        // Error handled by mutation hook
      }
    },
    [updateMcpRateLimit],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      await deleteMcpRateLimit.mutateAsync({ id });
    },
    [deleteMcpRateLimit],
  );

  const columns: ColumnDef<McpRateLimitData>[] = [
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => {
        const limit = row.original;
        const mcpUsage = (limit.mcpUsage as number | undefined) ?? 0;
        const percentage = (mcpUsage / limit.maxCalls) * 100;
        const status = getUsageStatus(percentage);
        return (
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
        );
      },
    },
    {
      id: "agent",
      accessorFn: (row) => getAgentName(row),
      header: ({ column }) => (
        <Button
          variant="ghost"
          className="h-auto !p-0 font-medium hover:bg-transparent"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Agent / MCP Gateway
          <SortIcon isSorted={column.getIsSorted()} />
        </Button>
      ),
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {getAgentName(row.original)}
        </span>
      ),
    },
    {
      id: "type",
      header: "Type",
      cell: ({ row }) => (
        <Badge variant="outline">
          {row.original.limitType === "tool_calls" ? "Per Tool" : "Per Server"}
        </Badge>
      ),
    },
    {
      id: "target",
      header: "Target",
      cell: ({ row }) => {
        const limit = row.original;
        const target =
          limit.limitType === "tool_calls" && limit.toolName
            ? limit.toolName
            : limit.mcpServerName || "-";
        return (
          <span className="text-muted-foreground font-mono text-xs">
            {target}
          </span>
        );
      },
    },
    {
      id: "window",
      accessorFn: (row) => row.windowSeconds,
      header: ({ column }) => (
        <Button
          variant="ghost"
          className="h-auto !p-0 font-medium hover:bg-transparent"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Window
          <SortIcon isSorted={column.getIsSorted()} />
        </Button>
      ),
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {formatWindowSeconds(row.original.windowSeconds)}
        </span>
      ),
    },
    {
      id: "usage",
      header: "Usage",
      size: 200,
      cell: ({ row }) => {
        const limit = row.original;
        const mcpUsage = (limit.mcpUsage as number | undefined) ?? 0;
        const percentage = (mcpUsage / limit.maxCalls) * 100;
        const status = getUsageStatus(percentage);
        return (
          <div className="space-y-1">
            <div className="flex justify-between text-sm">
              <span>
                {mcpUsage.toLocaleString()} / {limit.maxCalls.toLocaleString()}{" "}
                calls
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
        );
      },
    },
    {
      id: "actions",
      header: "Actions",
      enableHiding: false,
      cell: ({ row }) => {
        const limit = row.original;
        return (
          <div className="flex items-center gap-2">
            <PermissionButton
              permissions={{ mcpRateLimit: ["update"] }}
              variant="ghost"
              size="sm"
              onClick={() => setEditingLimit(limit)}
            >
              <Edit className="h-4 w-4" />
            </PermissionButton>
            <DeleteLimitConfirmation onDelete={() => handleDelete(limit.id)} />
          </div>
        );
      },
    },
  ];

  return (
    <PageLayout
      title="MCP Rate Limits"
      description="Rate limits for MCP tool calls per agent / MCP gateway. Limits can be applied per MCP server or per individual tool using a sliding window."
      actionButton={
        <PermissionButton
          permissions={{ mcpRateLimit: ["create"] }}
          onClick={() => setDialogOpen(true)}
        >
          <Plus className="mr-2 h-4 w-4" />
          Add Rate Limit
        </PermissionButton>
      }
    >
      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div
              key={`mcp-skeleton-${i}`}
              className="h-16 bg-muted animate-pulse rounded"
            />
          ))}
        </div>
      ) : limits.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Settings className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>No MCP rate limits configured</p>
          <p className="text-sm">
            Click &quot;Add Rate Limit&quot; to get started
          </p>
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={limits}
          sorting={sorting}
          onSortingChange={setSorting}
        />
      )}

      <McpRateLimitDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        agents={agents}
        mcpServers={mcpServers}
        onSave={handleCreate}
        isSaving={createMcpRateLimit.isPending}
      />

      <McpRateLimitDialog
        open={!!editingLimit}
        onOpenChange={(open) => !open && setEditingLimit(null)}
        agents={agents}
        mcpServers={mcpServers}
        initialData={editingLimit}
        onSave={(data) =>
          editingLimit ? handleUpdate(editingLimit.id, data) : undefined
        }
        isSaving={updateMcpRateLimit.isPending}
      />
    </PageLayout>
  );
}

function SortIcon({ isSorted }: { isSorted: false | "asc" | "desc" }) {
  const upArrow = <ChevronUp className="h-3 w-3" />;
  const downArrow = <ChevronDown className="h-3 w-3" />;
  if (isSorted === "asc") return upArrow;
  if (isSorted === "desc") return downArrow;
  return (
    <div className="text-muted-foreground/50 flex flex-col items-center">
      {upArrow}
      <span className="mt-[-4px]">{downArrow}</span>
    </div>
  );
}

function getUsageStatus(percentage: number): UsageStatus {
  if (percentage >= 90) return "danger";
  if (percentage >= 75) return "warning";
  return "safe";
}

function formatWindowSeconds(windowSeconds: number): string {
  const preset = WINDOW_PRESETS.find((p) => p.value === windowSeconds);
  if (preset) return preset.label;
  if (windowSeconds < 60) return `${windowSeconds}s`;
  if (windowSeconds < 3600) return `${Math.floor(windowSeconds / 60)}m`;
  return `${Math.floor(windowSeconds / 3600)}h`;
}

function DeleteLimitConfirmation({ onDelete }: { onDelete: () => void }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <PermissionButton
          permissions={{ mcpRateLimit: ["delete"] }}
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </PermissionButton>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete MCP Rate Limit</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete this rate limit? This action cannot
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
  );
}

function ToolSearchCombobox({
  value,
  onChange,
  tools,
}: {
  value: string;
  onChange: (value: string) => void;
  tools: Array<{ name: string; description: string | null }>;
}) {
  const [open, setOpen] = useState(false);

  const selectedTool = tools.find((t) => t.name === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="w-full justify-between font-normal"
        >
          {selectedTool ? (
            <span className="truncate">{selectedTool.name}</span>
          ) : (
            <span className="text-muted-foreground">Select a tool...</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
        <Command>
          <CommandInput placeholder="Search tools..." />
          <CommandList>
            <CommandEmpty>No tools found.</CommandEmpty>
            <CommandGroup>
              {tools.map((tool) => (
                <CommandItem
                  key={tool.name}
                  value={`${tool.name} ${tool.description || ""}`}
                  onSelect={() => {
                    onChange(tool.name);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === tool.name ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <div className="flex flex-col gap-0.5 overflow-hidden">
                    <span className="font-mono text-sm truncate">
                      {tool.name}
                    </span>
                    {tool.description && (
                      <span className="text-xs text-muted-foreground truncate">
                        {tool.description}
                      </span>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function McpRateLimitDialog({
  open,
  onOpenChange,
  agents,
  mcpServers,
  initialData,
  onSave,
  isSaving,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agents: AgentData[];
  mcpServers: CatalogItem[];
  initialData?: McpRateLimitData | null;
  onSave: (data: archestraApiTypes.CreateMcpRateLimitData["body"]) => void;
  isSaving: boolean;
}) {
  const [agentId, setAgentId] = useState(initialData?.agentId || "");
  const [limitType, setLimitType] = useState<McpLimitType>(
    (initialData?.limitType as McpLimitType) || "mcp_server_calls",
  );
  const [mcpServerName, setMcpServerName] = useState(
    initialData?.mcpServerName || "",
  );
  const [toolName, setToolName] = useState(initialData?.toolName || "");
  const [maxCalls, setMaxCalls] = useState(
    initialData?.maxCalls?.toString() || "",
  );
  const [windowSeconds, setWindowSeconds] = useState(
    initialData?.windowSeconds?.toString() || "3600",
  );

  // Get tools for the selected agent
  const selectedAgent = agents.find((a) => a.id === agentId);
  const agentTools = useMemo(() => {
    if (!selectedAgent) return [];
    return selectedAgent.tools
      .filter((t) => !t.delegateToAgentId)
      .map((t) => ({ name: t.name, description: t.description }));
  }, [selectedAgent]);

  // Group agents by type for the select dropdown
  const mcpGateways = useMemo(
    () => agents.filter((a) => a.agentType === "mcp_gateway"),
    [agents],
  );
  const agentTypeAgents = useMemo(
    () => agents.filter((a) => a.agentType === "agent"),
    [agents],
  );
  const profiles = useMemo(
    () => agents.filter((a) => a.agentType === "profile"),
    [agents],
  );

  // Reset form when dialog opens/closes or initialData changes
  const resetForm = useCallback(() => {
    setAgentId(initialData?.agentId || "");
    setLimitType(
      (initialData?.limitType as McpLimitType) || "mcp_server_calls",
    );
    setMcpServerName(initialData?.mcpServerName || "");
    setToolName(initialData?.toolName || "");
    setMaxCalls(initialData?.maxCalls?.toString() || "");
    setWindowSeconds(initialData?.windowSeconds?.toString() || "3600");
  }, [initialData]);

  // Reset when dialog opens
  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      if (newOpen) {
        resetForm();
      }
      onOpenChange(newOpen);
    },
    [onOpenChange, resetForm],
  );

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const parsedMaxCalls = Number.parseInt(maxCalls, 10);
      const parsedWindowSeconds = Number.parseInt(windowSeconds, 10);
      if (Number.isNaN(parsedMaxCalls) || parsedMaxCalls <= 0) return;
      if (Number.isNaN(parsedWindowSeconds) || parsedWindowSeconds <= 0) return;

      onSave({
        agentId,
        limitType,
        maxCalls: parsedMaxCalls,
        mcpServerName,
        ...(limitType === "tool_calls" && { toolName }),
        windowSeconds: parsedWindowSeconds,
      });
    },
    [
      agentId,
      limitType,
      mcpServerName,
      toolName,
      maxCalls,
      windowSeconds,
      onSave,
    ],
  );

  const isValid =
    maxCalls &&
    Number.parseInt(maxCalls, 10) > 0 &&
    !Number.isNaN(Number.parseInt(maxCalls, 10)) &&
    mcpServerName &&
    windowSeconds &&
    agentId &&
    (limitType === "mcp_server_calls" || toolName);

  const isEdit = !!initialData;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit Rate Limit" : "Add Rate Limit"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update the rate limit configuration."
              : "Configure a new rate limit for MCP tool calls."}
          </DialogDescription>
        </DialogHeader>
        <DialogForm onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Agent / MCP Gateway</Label>
              <Select value={agentId} onValueChange={setAgentId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select an agent or MCP gateway" />
                </SelectTrigger>
                <SelectContent>
                  {agents.length === 0 ? (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">
                      No agents or MCP gateways available
                    </div>
                  ) : (
                    <>
                      {mcpGateways.length > 0 && (
                        <SelectGroup>
                          <SelectLabel>MCP Gateways</SelectLabel>
                          {mcpGateways.map((agent) => (
                            <SelectItem key={agent.id} value={agent.id}>
                              {agent.name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      )}
                      {agentTypeAgents.length > 0 && (
                        <SelectGroup>
                          <SelectLabel>Agents</SelectLabel>
                          {agentTypeAgents.map((agent) => (
                            <SelectItem key={agent.id} value={agent.id}>
                              {agent.name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      )}
                      {profiles.length > 0 && (
                        <SelectGroup>
                          <SelectLabel>Profiles</SelectLabel>
                          {profiles.map((agent) => (
                            <SelectItem key={agent.id} value={agent.id}>
                              {agent.name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      )}
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label>Type</Label>
              <Select
                value={limitType}
                onValueChange={(value) => {
                  setLimitType(value as McpLimitType);
                  setToolName("");
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mcp_server_calls">Per Server</SelectItem>
                  <SelectItem value="tool_calls">Per Tool</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label>MCP Server</Label>
              <Select value={mcpServerName} onValueChange={setMcpServerName}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select server" />
                </SelectTrigger>
                <SelectContent>
                  {mcpServers.length === 0 ? (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">
                      No MCP servers available
                    </div>
                  ) : (
                    mcpServers.map((server) => (
                      <SelectItem key={server.id} value={server.name}>
                        {server.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            {limitType === "tool_calls" && (
              <div className="grid gap-2">
                <Label>Tool</Label>
                <p className="text-xs text-muted-foreground">
                  Shows tools assigned to the selected agent / MCP gateway.
                  {agentId && agentTools.length === 0 && (
                    <>
                      {" "}
                      No tools are currently assigned — you can enter a tool
                      name manually, or{" "}
                      <a
                        href="/mcp/gateways"
                        className="underline hover:text-foreground"
                      >
                        assign tools
                      </a>{" "}
                      first.
                    </>
                  )}
                </p>
                {agentTools.length > 0 ? (
                  <ToolSearchCombobox
                    value={toolName}
                    onChange={setToolName}
                    tools={agentTools}
                  />
                ) : (
                  <Input
                    type="text"
                    value={toolName}
                    onChange={(e) => setToolName(e.target.value)}
                    placeholder={
                      agentId
                        ? "Enter tool name manually"
                        : "Select an agent / MCP gateway first"
                    }
                    className="w-full"
                  />
                )}
              </div>
            )}

            <div className="grid gap-2">
              <Label>Window</Label>
              <Select value={windowSeconds} onValueChange={setWindowSeconds}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WINDOW_PRESETS.map((preset) => (
                    <SelectItem
                      key={preset.value}
                      value={preset.value.toString()}
                    >
                      {preset.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label>Max Calls</Label>
              <Input
                type="text"
                value={
                  maxCalls ? Number.parseInt(maxCalls, 10).toLocaleString() : ""
                }
                onChange={(e) => {
                  const value = e.target.value.replace(/[^0-9]/g, "");
                  setMaxCalls(value);
                }}
                placeholder="e.g. 1,000"
                min="1"
                required
                className="w-full"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!isValid || isSaving}>
              {isSaving
                ? isEdit
                  ? "Saving..."
                  : "Creating..."
                : isEdit
                  ? "Save Changes"
                  : "Create Rate Limit"}
            </Button>
          </DialogFooter>
        </DialogForm>
      </DialogContent>
    </Dialog>
  );
}
