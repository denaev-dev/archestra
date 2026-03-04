"use client";

import {
  type archestraApiTypes,
  E2eTestId,
  type McpDeploymentStatusEntry,
} from "@shared";
import {
  Bot,
  Building2,
  CheckCircle2,
  Code,
  FileText,
  Info,
  Link2,
  MoreVertical,
  Pencil,
  RefreshCw,
  Route,
  Trash2,
  Unlink,
  User,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { LabelTags } from "@/components/label-tags";
import { WithPermissions } from "@/components/roles/with-permissions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { PermissionButton } from "@/components/ui/permission-button";
import { useProfiles } from "@/lib/agent.query";
import { useHasPermissions } from "@/lib/auth.query";
import { authClient } from "@/lib/clients/auth/auth-client";
import { useFeatureFlag } from "@/lib/features.hook";
import { useCatalogTools } from "@/lib/internal-mcp-catalog.query";
import { useMcpServers, useMcpServerTools } from "@/lib/mcp-server.query";
import { useTeams } from "@/lib/team.query";
import { DeploymentStatusIndicator } from "./deployment-status";
import { InstallationProgress } from "./installation-progress";
import { ManageUsersDialog } from "./manage-users-dialog";
import { McpAssignmentsDialog } from "./mcp-assignments-dialog";
import { McpLogsDialog } from "./mcp-logs-dialog";
import { UninstallServerDialog } from "./uninstall-server-dialog";
import { YamlConfigDialog } from "./yaml-config-dialog";

export type CatalogItem =
  archestraApiTypes.GetInternalMcpCatalogResponses["200"][number];

export type CatalogItemWithOptionalLabel = CatalogItem & {
  label?: string | null;
};

export type InstalledServer =
  archestraApiTypes.GetMcpServersResponses["200"][number];

export type InstallScope = "personal" | "team" | "org";

export type McpServerCardProps = {
  item: CatalogItemWithOptionalLabel;
  installedServer?: InstalledServer | null;
  installingItemId: string | null;
  installationStatus?:
    | "error"
    | "pending"
    | "success"
    | "idle"
    | "discovering-tools"
    | null;
  deploymentStatuses: Record<string, McpDeploymentStatusEntry>;
  onInstallRemoteServer: (installScope?: InstallScope) => void;
  onInstallLocalServer: (installScope?: InstallScope) => void;
  onReinstall: () => void;
  onDetails: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onCancelInstallation?: (serverId: string) => void;
  /** When true, auto-opens the assignments dialog */
  autoOpenAssignmentsDialog?: boolean;
  /** Called when the auto-opened assignments dialog is closed */
  onAssignmentsDialogClose?: () => void;
  /** When true, renders as a built-in Playwright server (non-editable, personal-only) */
  isBuiltInPlaywright?: boolean;
};

export type McpServerCardVariant = "remote" | "local" | "builtin";

export type McpServerCardBaseProps = McpServerCardProps & {
  variant: McpServerCardVariant;
};

export function McpServerCard({
  variant,
  item,
  installedServer,
  installingItemId,
  installationStatus,
  deploymentStatuses,
  onInstallRemoteServer,
  onInstallLocalServer,
  onReinstall,
  onDetails,
  onEdit,
  onDelete,
  onCancelInstallation,
  autoOpenAssignmentsDialog,
  onAssignmentsDialogClose,
  isBuiltInPlaywright = false,
}: McpServerCardBaseProps) {
  const isBuiltin = variant === "builtin";
  const isPlaywrightVariant = isBuiltInPlaywright;

  // For builtin servers, fetch tools by catalog ID
  // For regular MCP servers, fetch by server ID
  const { data: mcpServerTools } = useMcpServerTools(
    !isBuiltin ? (installedServer?.id ?? null) : null,
  );
  const { data: catalogTools } = useCatalogTools(isBuiltin ? item.id : null);

  const tools = isBuiltin ? catalogTools : mcpServerTools;

  const isByosEnabled = useFeatureFlag("byosEnabled");
  const session = authClient.useSession();
  const currentUserId = session.data?.user?.id;
  const { data: userIsMcpServerAdmin } = useHasPermissions({
    mcpServer: ["admin"],
  });
  const isLocalMcpEnabled = useFeatureFlag("orchestrator-k8s-runtime");

  // Fetch all MCP servers to get installations for logs dropdown
  const { data: allMcpServers } = useMcpServers();
  const { data: teams } = useTeams();

  // Fetch all profiles for assignment count computation
  const { data: allProfiles = [] } = useProfiles();

  // Dialog state
  const [isToolsDialogOpen, setIsToolsDialogOpen] = useState(false);
  const [isManageUsersDialogOpen, setIsManageUsersDialogOpen] = useState(false);
  const [isLogsDialogOpen, setIsLogsDialogOpen] = useState(false);
  const [isYamlConfigDialogOpen, setIsYamlConfigDialogOpen] = useState(false);
  const [uninstallingServer, setUninstallingServer] = useState<{
    id: string;
    name: string;
  } | null>(null);

  // Auto-open assignments dialog when requested by parent
  // Ensure other dialogs are closed when auto-opening
  useEffect(() => {
    if (autoOpenAssignmentsDialog) {
      setIsToolsDialogOpen(true);
      setIsManageUsersDialogOpen(false);
      setIsLogsDialogOpen(false);
    }
  }, [autoOpenAssignmentsDialog]);

  // Handle assignments dialog close - notify parent if it was auto-opened
  const handleToolsDialogOpenChange = (open: boolean) => {
    setIsToolsDialogOpen(open);
    if (!open && autoOpenAssignmentsDialog) {
      onAssignmentsDialogClose?.();
    }
  };

  // Aggregate all installations for this catalog item (for logs dropdown)
  let localInstalls: NonNullable<typeof allMcpServers> = [];
  if (
    installedServer?.catalogId &&
    variant === "local" &&
    allMcpServers &&
    allMcpServers.length > 0
  ) {
    localInstalls = allMcpServers
      .filter(({ catalogId, serverType }) => {
        return (
          catalogId === installedServer.catalogId && serverType === "local"
        );
      })
      .sort((a, b) => {
        // Sort by createdAt ascending (oldest first, most recent last)
        return (
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
      });
  }

  const needsReinstall = installedServer?.reinstallRequired;
  const hasError = installedServer?.localInstallationStatus === "error";
  const errorMessage = installedServer?.localInstallationError;

  const isInstalling = Boolean(
    installingItemId === item.id ||
      installationStatus === "pending" ||
      (installationStatus === "discovering-tools" && installedServer),
  );

  const isCurrentUserAuthenticated =
    currentUserId && installedServer?.users
      ? installedServer.users.includes(currentUserId)
      : false;

  const isRemoteVariant = variant === "remote";
  const isBuiltinVariant = variant === "builtin";

  // Check if logs are available (local variant with at least one installation)
  const hasLocalInstallations = localInstalls.length > 0;
  const isLogsAvailable = variant === "local" && hasLocalInstallations;

  // Collect server IDs for deployment status indicator
  const deploymentServerIds = (allMcpServers ?? [])
    .filter((s) => s.catalogId === item.id && s.serverType === "local")
    .map((s) => s.id);

  // --- Scope and connection computations ---
  const itemScope = (item as Record<string, unknown>).scope as
    | "personal"
    | "team"
    | "org"
    | undefined;
  const serversForCatalog =
    allMcpServers?.filter((s) => s.catalogId === item.id) ?? [];

  // Personal connection: server owned by current user without team assignment and not org-wide
  const personalServer = serversForCatalog.find(
    (s) =>
      s.ownerId === currentUserId &&
      !s.teamDetails &&
      !(s as Record<string, unknown>).isOrgWide,
  );
  const isPersonalConnected = !!personalServer;

  // Team connections: servers with team assignments
  const teamServers = serversForCatalog.filter((s) => !!s.teamDetails);
  const teamsWithInstallation = new Set(teamServers.map((s) => s.teamId));
  const availableTeams =
    teams?.filter((t) => !teamsWithInstallation.has(t.id)) ?? [];
  const canAddMoreTeams = availableTeams.length > 0;
  const connectedTeamsCount = teamServers.length;

  // Org connection status
  const orgServer = serversForCatalog.find(
    (s) => (s as Record<string, unknown>).isOrgWide,
  );
  const isOrgConnected = !!orgServer;

  // Scope row visibility
  const showTeamRow =
    (itemScope === "team" || itemScope === "org") && !isPlaywrightVariant;
  const showOrgRow = itemScope === "org" && !isPlaywrightVariant;

  // Connect handler based on variant
  const onConnect = (installScope?: InstallScope) =>
    isRemoteVariant
      ? onInstallRemoteServer(installScope)
      : onInstallLocalServer(installScope);

  // --- Assignment counts ---
  const { agentAssignmentCount, gatewayAssignmentCount } = useMemo(() => {
    if (!tools || !allProfiles.length)
      return { agentAssignmentCount: 0, gatewayAssignmentCount: 0 };

    // Collect all unique assigned profile IDs across all tools
    const assignedIds = new Set(
      tools.flatMap((t) => t.assignedAgents.map((a) => a.id)),
    );

    // Build a lookup of profile ID -> agentType
    const profileTypeMap = new Map(allProfiles.map((p) => [p.id, p.agentType]));

    let agents = 0;
    let gateways = 0;
    for (const id of assignedIds) {
      const type = profileTypeMap.get(id);
      if (type === "agent") agents++;
      else if (type === "mcp_gateway") gateways++;
    }

    return { agentAssignmentCount: agents, gatewayAssignmentCount: gateways };
  }, [tools, allProfiles]);

  // --- JSX parts ---

  const manageCatalogItemDropdownMenu = (
    <div className="flex flex-wrap gap-1 items-center flex-shrink-0">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onEdit}>
            <Pencil className="mr-2 h-4 w-4" />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onDetails}>
            <Info className="mr-2 h-4 w-4" />
            About
          </DropdownMenuItem>
          {isLogsAvailable && (
            <DropdownMenuItem onClick={() => setIsLogsDialogOpen(true)}>
              <FileText className="mr-2 h-4 w-4" />
              Logs
            </DropdownMenuItem>
          )}
          {variant === "local" && (
            <DropdownMenuItem onClick={() => setIsYamlConfigDialogOpen(true)}>
              <Code className="mr-2 h-4 w-4" />
              Edit K8s Deployment YAML
            </DropdownMenuItem>
          )}
          {!isPlaywrightVariant && (
            <DropdownMenuItem onClick={onDelete} className="text-destructive">
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  // Show error banner with links to logs and edit dialog (hide during reinstall)
  const errorBanner = isCurrentUserAuthenticated &&
    hasError &&
    errorMessage &&
    !isInstalling && (
      <div
        className="text-sm text-destructive px-3 py-2 bg-destructive/10 rounded-md"
        data-testid={`${E2eTestId.McpServerError}-${item.name}`}
      >
        Failed to start MCP server,{" "}
        <button
          type="button"
          onClick={() => setIsLogsDialogOpen(true)}
          className="text-primary hover:underline cursor-pointer"
          data-testid={`${E2eTestId.McpLogsViewButton}-${item.name}`}
        >
          view the logs
        </button>{" "}
        or{" "}
        <button
          type="button"
          onClick={onEdit}
          className="text-primary hover:underline cursor-pointer"
          data-testid={`${E2eTestId.McpLogsEditConfigButton}-${item.name}`}
        >
          edit your config
        </button>
        .
      </div>
    );

  // Link icon button for connecting
  const connectButton = (testId?: string, installScope?: InstallScope) => {
    const isLocalDisabled = variant === "local" && !isLocalMcpEnabled;
    return (
      <PermissionButton
        permissions={{ mcpServer: ["create"] }}
        onClick={() => onConnect(installScope)}
        disabled={isLocalDisabled}
        size="icon"
        variant="ghost"
        className="h-8 w-8 text-muted-foreground hover:text-foreground"
        data-testid={testId}
      >
        <Link2 className="h-4 w-4" />
      </PermissionButton>
    );
  };

  // Unlink icon button for disconnecting
  const revokeButton = (server: { id: string; name: string }) => (
    <button
      type="button"
      className="h-8 w-8 inline-flex items-center justify-center text-muted-foreground/40 hover:text-destructive transition-colors"
      onClick={() => setUninstallingServer(server)}
    >
      <Unlink className="h-4 w-4" />
    </button>
  );

  // Scope row helper
  const scopeRow = ({
    connected,
    icon: Icon,
    title,
    right,
    key,
  }: {
    connected: boolean;
    icon: React.ComponentType<{ className?: string }>;
    title: string;
    right: React.ReactNode;
    key?: string;
  }) => (
    <div
      key={key}
      className={`flex items-center gap-2.5 px-2 py-1.5 rounded-lg ${connected ? "bg-green-50 dark:bg-green-950/20" : ""}`}
    >
      {connected && (
        <CheckCircle2 className="h-6 w-6 text-green-600 shrink-0" />
      )}
      <Icon
        className={`h-4 w-4 shrink-0 ${connected ? "text-foreground" : "text-muted-foreground"}`}
      />
      <span
        className={`text-sm font-medium min-w-0 flex-1 ${connected ? "text-foreground" : "text-muted-foreground"}`}
      >
        {title}
      </span>
      <div className="shrink-0">{right}</div>
    </div>
  );

  // --- Scope connection rows ---
  const scopeConnectionRows = (!isBuiltinVariant || isPlaywrightVariant) && (
    <div className="flex flex-col">
      {/* Personal row */}
      {scopeRow({
        connected: isPersonalConnected,
        icon: User,
        title: "Personal",
        right:
          isPersonalConnected && personalServer
            ? revokeButton(personalServer)
            : !isInstalling && !isByosEnabled
              ? connectButton(
                  `${E2eTestId.ConnectCatalogItemButton}-${item.name}`,
                  "personal",
                )
              : null,
      })}

      {/* Team row with badges + connect + manage */}
      {showTeamRow && (
        <div
          className={`flex items-center gap-2.5 px-2 py-1.5 rounded-lg ${connectedTeamsCount > 0 ? "bg-green-50 dark:bg-green-950/20" : ""}`}
        >
          {connectedTeamsCount > 0 && (
            <CheckCircle2 className="h-6 w-6 text-green-600 shrink-0" />
          )}
          <Users
            className={`h-4 w-4 shrink-0 ${connectedTeamsCount > 0 ? "text-foreground" : "text-muted-foreground"}`}
          />
          {connectedTeamsCount > 0 ? (
            <div className="flex items-center gap-1 min-w-0 flex-1 overflow-hidden">
              {teamServers.slice(0, 2).map((ts) => (
                <Badge
                  key={ts.id}
                  variant="secondary"
                  className="bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 shrink-0"
                >
                  {ts.teamDetails?.name ?? "Team"}
                </Badge>
              ))}
              {connectedTeamsCount > 2 && (
                <Popover>
                  <PopoverTrigger asChild>
                    <button type="button" className="cursor-pointer">
                      <Badge
                        variant="secondary"
                        className="bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 shrink-0 hover:bg-green-200 dark:hover:bg-green-900/60 transition-all hover:scale-110"
                      >
                        +{connectedTeamsCount - 2}
                      </Badge>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-72 p-0">
                    <div className="flex items-center justify-between px-4 pt-3 pb-2">
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-sm font-semibold">Teams</span>
                        <span className="text-sm text-muted-foreground">
                          {connectedTeamsCount}/{teams?.length ?? 0} connected
                        </span>
                      </div>
                    </div>
                    <div className="border-t" />
                    <div className="flex flex-col gap-1 p-2">
                      {teamServers.map((ts) => (
                        <div
                          key={ts.id}
                          className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg bg-green-50 dark:bg-green-950/20"
                        >
                          <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
                          <span className="text-sm font-medium text-green-800 dark:text-green-300 flex-1">
                            {ts.teamDetails?.name ?? "Team"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              )}
            </div>
          ) : (
            <span className="text-sm font-medium min-w-0 flex-1 text-muted-foreground">
              Team
            </span>
          )}
          <div className="flex items-center gap-1 shrink-0">
            {!isInstalling &&
              canAddMoreTeams &&
              connectButton(undefined, "team")}
            {connectedTeamsCount > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="h-8 w-8 inline-flex items-center justify-center text-muted-foreground/40 hover:text-destructive transition-colors"
                  >
                    <Unlink className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {teamServers.map((ts) => (
                    <DropdownMenuItem
                      key={ts.id}
                      onClick={() =>
                        setUninstallingServer({
                          id: ts.id,
                          name: ts.name,
                        })
                      }
                      className="text-destructive"
                    >
                      <Unlink className="mr-2 h-4 w-4" />
                      {ts.teamDetails?.name ?? "Team"}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      )}

      {showOrgRow &&
        scopeRow({
          connected: isOrgConnected,
          icon: Building2,
          title: "Organization",
          right:
            isOrgConnected && orgServer
              ? revokeButton(orgServer)
              : !isInstalling
                ? connectButton(undefined, "org")
                : null,
        })}
    </div>
  );

  // --- Bottom action buttons (horizontal) ---
  const actionButtons = (
    <WithPermissions
      permissions={{ tool: ["update"], agent: ["update"] }}
      noPermissionHandle="hide"
    >
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1 text-muted-foreground"
          onClick={() => setIsToolsDialogOpen(true)}
          disabled={serversForCatalog.length === 0}
        >
          <Bot className="h-4 w-4 mr-1.5" />
          Agents
          <Badge variant="secondary" className="ml-1.5 px-1.5 py-0 text-xs">
            {agentAssignmentCount}
          </Badge>
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="flex-1 text-muted-foreground"
          onClick={() => setIsToolsDialogOpen(true)}
          disabled={serversForCatalog.length === 0}
        >
          <Route className="h-4 w-4 mr-1.5" />
          MCP Gateways
          <Badge variant="secondary" className="ml-1.5 px-1.5 py-0 text-xs">
            {gatewayAssignmentCount}
          </Badge>
        </Button>
      </div>
    </WithPermissions>
  );

  const dialogs = (
    <>
      <McpAssignmentsDialog
        open={isToolsDialogOpen}
        onOpenChange={handleToolsDialogOpenChange}
        catalogId={item.id}
        serverName={item.label || item.name}
        isBuiltin={isBuiltin}
      />

      <McpLogsDialog
        open={isLogsDialogOpen}
        onOpenChange={setIsLogsDialogOpen}
        serverName={installedServer?.name ?? item.name}
        installs={localInstalls}
        deploymentStatuses={deploymentStatuses}
      />

      <ManageUsersDialog
        catalogId={item.id}
        isOpen={isManageUsersDialogOpen}
        onClose={() => setIsManageUsersDialogOpen(false)}
        label={item.label || item.name}
      />

      <UninstallServerDialog
        server={uninstallingServer}
        onClose={() => setUninstallingServer(null)}
        isCancelingInstallation={isInstalling}
        onCancelInstallation={onCancelInstallation}
      />

      <YamlConfigDialog
        item={isYamlConfigDialogOpen ? item : null}
        onClose={() => setIsYamlConfigDialogOpen(false)}
      />
    </>
  );

  return (
    <Card
      className="flex flex-col relative pt-4 gap-2 h-full"
      data-testid={`${E2eTestId.McpServerCard}-${item.name}`}
    >
      <CardHeader className="gap-0">
        <div className="flex items-start justify-between gap-4 overflow-hidden">
          <div className="min-w-0 flex-1">
            <div
              className="flex items-center gap-2 mb-1 overflow-hidden w-full"
              title={item.name}
            >
              <span className="text-lg font-semibold whitespace-nowrap text-ellipsis overflow-hidden">
                {item.name}
              </span>
              <DeploymentStatusIndicator
                serverIds={deploymentServerIds}
                deploymentStatuses={deploymentStatuses}
              />
            </div>
            <div className="flex items-center gap-2 flex-wrap min-h-[1.5rem]">
              {item.labels && item.labels.length > 0 && (
                <LabelTags labels={item.labels} />
              )}
            </div>
          </div>
          {userIsMcpServerAdmin && manageCatalogItemDropdownMenu}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 flex-grow">
        {/* Scope connection rows */}
        {scopeConnectionRows}

        {/* Error banner */}
        {errorBanner}

        {/* Reconnect/reinstall button */}
        {isCurrentUserAuthenticated &&
          (needsReinstall || hasError) &&
          !isInstalling && (
            <PermissionButton
              permissions={{ mcpServer: ["update"] }}
              onClick={onReinstall}
              size="sm"
              variant="default"
              className="w-full"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              {needsReinstall && !hasError
                ? "Reinstall Required"
                : "Reconnect Required"}
            </PermissionButton>
          )}

        {/* Installation progress */}
        {isInstalling && (
          <InstallationProgress
            status={
              installationStatus === "pending" ||
              installationStatus === "discovering-tools"
                ? installationStatus
                : "pending"
            }
            serverId={installedServer?.id}
            serverName={installedServer?.name}
          />
        )}

        {/* Action buttons pinned to bottom */}
        <div className="mt-auto">
          <div className="border-t mb-3" />
          {actionButtons}
        </div>
      </CardContent>
      {dialogs}
    </Card>
  );
}
