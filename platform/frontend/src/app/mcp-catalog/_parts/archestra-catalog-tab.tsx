"use client";

import {
  type archestraApiTypes,
  type archestraCatalogTypes,
  E2eTestId,
} from "@shared";

import {
  ArrowRight,
  BookOpen,
  Github,
  Info,
  Loader2,
  Search,
  Sparkles,
} from "lucide-react";
import { useMemo, useState } from "react";
import { AccessLevelSelector } from "@/components/access-level-selector";
import { DebouncedInput } from "@/components/debounced-input";
import { TruncatedText } from "@/components/truncated-text";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useHasPermissions } from "@/lib/auth.query";
import {
  useMcpRegistryServersInfinite,
  useMcpServerCategories,
} from "@/lib/external-mcp-catalog.query";
import {
  useCreateInternalMcpCatalogItem,
  useInternalMcpCatalog,
  useUpdateInternalMcpCatalogItem,
} from "@/lib/internal-mcp-catalog.query";
import { useTeams } from "@/lib/team.query";
import type { SelectedCategory } from "./CatalogFilters";
import { DetailsDialog } from "./details-dialog";
import { parseDockerArgsToLocalConfig } from "./docker-args-parser";
import { RequestInstallationDialog } from "./request-installation-dialog";
import { TransportBadges } from "./transport-badges";

type ServerType = "all" | "remote" | "local";

type CatalogItem =
  archestraApiTypes.GetInternalMcpCatalogResponses["200"][number];

export function ArchestraCatalogTab({
  catalogItems: initialCatalogItems,
  onClose,
  onSuccess,
}: {
  catalogItems?: archestraApiTypes.GetInternalMcpCatalogResponses["200"];
  onClose: () => void;
  onSuccess?: (createdItem: CatalogItem) => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [readmeServer, setReadmeServer] =
    useState<archestraCatalogTypes.ArchestraMcpServerManifest | null>(null);
  const [requestServer, setRequestServer] =
    useState<archestraCatalogTypes.ArchestraMcpServerManifest | null>(null);
  const [filters, setFilters] = useState<{
    type: ServerType;
    category: SelectedCategory;
  }>({
    type: "all",
    category: "all",
  });

  // Get catalog items for filtering (with live updates)
  const { data: catalogItems } = useInternalMcpCatalog({
    initialData: initialCatalogItems,
  });

  // Scope selection dialog state
  const [pendingServer, setPendingServer] =
    useState<archestraCatalogTypes.ArchestraMcpServerManifest | null>(null);
  const [selectedScope, setSelectedScope] = useState<
    "personal" | "team" | "org"
  >("org");
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([]);

  // Fetch available categories
  const { data: availableCategories = [] } = useMcpServerCategories();

  // Permissions for scope selector
  const { data: canCreateCatalogItem = false } = useHasPermissions({
    internalMcpCatalog: ["create"],
  });
  const { data: isAdmin } = useHasPermissions({
    internalMcpCatalog: ["admin"],
  });
  const { data: isTeamAdmin } = useHasPermissions({
    internalMcpCatalog: ["team-admin"],
  });
  const { data: teams } = useTeams();

  // Use server-side search and category filtering
  const {
    data,
    isLoading,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useMcpRegistryServersInfinite(searchQuery, filters.category);

  // Mutation for adding servers to catalog
  const createMutation = useCreateInternalMcpCatalogItem();

  const handleAddToCatalog = async (
    server: archestraCatalogTypes.ArchestraMcpServerManifest,
  ) => {
    const getValue = (
      config: NonNullable<
        archestraCatalogTypes.ArchestraMcpServerManifest["user_config"]
      >[string],
    ) => {
      if (config.type === "boolean") {
        return typeof config.default === "boolean"
          ? String(config.default)
          : "false";
      }
      if (config.type === "number" && typeof config.default === "number") {
        return String(config.default);
      }
      return undefined;
    };

    // For local servers, construct environment from server.env and user_config
    if (server.server.type === "local") {
      // Track which user_config keys are referenced in server.env
      const referencedUserConfigKeys = new Set<string>();

      const getEnvVarType = (
        userConfigEntry: NonNullable<
          archestraCatalogTypes.ArchestraMcpServerManifest["user_config"]
        >[string],
      ) => {
        if (userConfigEntry.sensitive) return "secret" as const;
        if (userConfigEntry.type === "boolean") return "boolean" as const;
        if (userConfigEntry.type === "number") return "number" as const;
        return "plain_text" as const;
      };

      // First pass: Parse server.env entries
      const envFromServerEnv = server.server.env
        ? Object.entries(server.server.env).map(([envKey, envValue]) => {
            // Check if value is ${user_config.xxx} placeholder
            const match = envValue.match(/^\$\{user_config\.(.+)\}$/);

            if (match && server.user_config) {
              const userConfigKey = match[1];
              const userConfigEntry = server.user_config[userConfigKey];
              referencedUserConfigKeys.add(userConfigKey);

              if (userConfigEntry) {
                return {
                  key: envKey, // Use env var name (e.g., CONFLUENCE_URL)
                  type: getEnvVarType(userConfigEntry),
                  value: "", // Empty - will be prompted
                  promptOnInstallation: true,
                  required: userConfigEntry.required ?? false,
                  description: [
                    userConfigEntry.title,
                    userConfigEntry.description,
                  ]
                    .filter(Boolean)
                    .join(": "),
                  default: Array.isArray(userConfigEntry.default)
                    ? undefined
                    : userConfigEntry.default,
                  mounted: (
                    userConfigEntry as typeof userConfigEntry & {
                      mounted?: boolean;
                    }
                  ).mounted,
                };
              }
            }

            // Static env var (no user_config reference)
            return {
              key: envKey,
              type: "plain_text" as const,
              value: envValue,
              promptOnInstallation: false,
              required: false,
              description: "",
              default: undefined,
            };
          })
        : [];

      // Second pass: Add user_config entries NOT referenced in server.env
      const envFromUnreferencedUserConfig = server.user_config
        ? Object.entries(server.user_config)
            .filter(([key]) => !referencedUserConfigKeys.has(key))
            .map(([key, config]) => ({
              key,
              type: getEnvVarType(config),
              value: getValue(config),
              promptOnInstallation: true,
              required: config.required ?? false,
              description: [config.title, config.description]
                .filter(Boolean)
                .join(": "),
              default: Array.isArray(config.default)
                ? undefined
                : config.default,
              mounted: (config as typeof config & { mounted?: boolean })
                .mounted,
            }))
        : [];

      const environment = [
        ...envFromServerEnv,
        ...envFromUnreferencedUserConfig,
      ];
      await addServerToCatalog(server, environment);
      return;
    }

    // For remote servers, proceed with direct addition
    await addServerToCatalog(server, undefined);
  };

  const addServerToCatalog = async (
    server: archestraCatalogTypes.ArchestraMcpServerManifest,
    environment?: Array<{
      key: string;
      type: "plain_text" | "secret" | "boolean" | "number";
      value?: string;
      promptOnInstallation: boolean;
      required?: boolean;
      description?: string;
      default?: string | number | boolean;
      mounted?: boolean;
    }>,
  ) => {
    // Rewrite redirect URIs to prefer platform callback (port 3000)
    const rewrittenOauth =
      server.oauth_config && !server.oauth_config.requires_proxy
        ? {
            ...server.oauth_config,
            redirect_uris: server.oauth_config.redirect_uris?.map((u) =>
              u === "http://localhost:8080/oauth/callback"
                ? `${window.location.origin}/oauth-callback`
                : u,
            ),
          }
        : undefined;

    let localConfig:
      | archestraApiTypes.CreateInternalMcpCatalogItemData["body"]["localConfig"]
      | undefined;
    if (server.server.type === "local") {
      const dockerConfig = parseDockerArgsToLocalConfig(
        server.server.command,
        server.server.args,
        server.server.docker_image,
      );
      if (dockerConfig) {
        const serviceAccount = (
          server.server as typeof server.server & { service_account?: string }
        ).service_account;
        localConfig = {
          command: dockerConfig.command,
          arguments: dockerConfig.arguments,
          dockerImage: dockerConfig.dockerImage,
          transportType: dockerConfig.transportType,
          httpPort: dockerConfig.httpPort,
          serviceAccount: serviceAccount
            ? serviceAccount.replace(
                /\{\{ARCHESTRA_RELEASE_NAME\}\}/g,
                "{{HELM_RELEASE_NAME}}",
              )
            : undefined,
          environment:
            environment ||
            (server.server.env
              ? Object.entries(server.server.env).map(([key, value]) => ({
                  key,
                  type: "plain_text" as const,
                  value,
                  promptOnInstallation: false,
                }))
              : undefined),
        };
      } else {
        const serviceAccount = (
          server.server as typeof server.server & { service_account?: string }
        ).service_account;
        localConfig = {
          command: server.server.command,
          arguments: server.server.args,
          dockerImage: server.server.docker_image,
          serviceAccount: serviceAccount
            ? serviceAccount.replace(
                /\{\{ARCHESTRA_RELEASE_NAME\}\}/g,
                "{{HELM_RELEASE_NAME}}",
              )
            : undefined,
          environment:
            environment ||
            (server.server.env
              ? Object.entries(server.server.env).map(([key, value]) => ({
                  key,
                  type: "plain_text" as const,
                  value,
                  promptOnInstallation: false,
                }))
              : undefined),
        };
      }
    }

    const createdItem = await createMutation.mutateAsync({
      name: server.name,
      version: undefined, // No version in archestra catalog
      instructions: server.instructions,
      serverType: server.server.type,
      serverUrl:
        server.server.type === "remote" ? server.server.url : undefined,
      docsUrl:
        server.server.type === "remote"
          ? (server.server.docs_url ?? undefined)
          : undefined,
      localConfig,
      userConfig: server.user_config,
      oauthConfig: rewrittenOauth,
      scope: selectedScope,
      teams: selectedScope === "team" ? selectedTeamIds : undefined,
    });

    // Close the dialog after adding
    onClose();
    if (createdItem) {
      onSuccess?.(createdItem);
    }
  };

  const handleRequestInstallation = async (
    server: archestraCatalogTypes.ArchestraMcpServerManifest,
  ) => {
    // Just open the request dialog with the server data
    setRequestServer(server);
  };

  // Flatten all pages into a single array of servers
  const servers = useMemo(() => {
    if (!data) return [];
    return data.pages.flatMap((page) => page.servers);
  }, [data]);

  // Apply client-side type filter only (categories are filtered backend-side)
  const filteredServers = useMemo(() => {
    let filtered = servers;

    // Filter by type (client-side since API doesn't support this)
    if (filters.type !== "all") {
      filtered = filtered.filter(
        (server) => server.server.type === filters.type,
      );
    }

    return filtered;
  }, [servers, filters.type]);

  // Create a Map from name to array of catalog items for scope-aware lookup
  const catalogItemsByName = useMemo(() => {
    const map = new Map<string, CatalogItem[]>();
    for (const item of catalogItems ?? []) {
      const existing = map.get(item.name) ?? [];
      existing.push(item);
      map.set(item.name, existing);
    }
    return map;
  }, [catalogItems]);

  return (
    <div className="w-full space-y-2 mt-4">
      <div className="flex items-end gap-4 ml-1">
        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <DebouncedInput
              placeholder="Search servers by name..."
              initialValue={searchQuery}
              onChange={setSearchQuery}
              className="pl-9"
              autoFocus
            />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-muted-foreground">
            Type
          </span>
          <Select
            value={filters.type}
            onValueChange={(value) =>
              setFilters({ ...filters, type: value as ServerType })
            }
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Select type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="remote">Remote</SelectItem>
              <SelectItem value="local">Local</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-muted-foreground">
            Category
          </span>
          <Select
            value={filters.category}
            onValueChange={(value) =>
              setFilters({ ...filters, category: value as SelectedCategory })
            }
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Select category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {availableCategories.map((category) => (
                <SelectItem key={category} value={category}>
                  {category}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading && (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from(
            { length: 4 },
            (_, i) => `skeleton-${i}-${Date.now()}`,
          ).map((key) => (
            <Card key={key}>
              <CardHeader>
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-4 w-1/2 mt-2" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full mt-2" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {error && (
        <div className="text-center py-12">
          <p className="text-destructive mb-2">
            Failed to load servers from the external catalog
          </p>
          <p className="text-sm text-muted-foreground">
            {error instanceof Error ? error.message : "Unknown error"}
          </p>
        </div>
      )}

      {!isLoading && !error && filteredServers && (
        <>
          <div className="flex items-center justify-between ml-1">
            <p className="text-sm text-muted-foreground">
              {filteredServers.length}{" "}
              {filteredServers.length === 1 ? "server" : "servers"} found
            </p>
          </div>

          {filteredServers.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">
                No servers match your search criteria.
              </p>
            </div>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-2 overflow-y-auto">
                {filteredServers.map((server, index) => (
                  <ServerCard
                    key={`${server.name}-${index}`}
                    server={server}
                    onAddToCatalog={(s) => {
                      const existing = catalogItemsByName.get(s.name) ?? [];
                      const hasPersonal = existing.some(
                        (i) => i.scope === "personal",
                      );
                      const hasOrg = existing.some((i) => i.scope === "org");
                      const coveredTeamIds = new Set(
                        existing
                          .filter((i) => i.scope === "team")
                          .flatMap((i) => i.teams?.map((t) => t.id) ?? []),
                      );
                      // Pick first available scope: org > team > personal
                      let defaultScope: "personal" | "team" | "org" = isAdmin
                        ? "org"
                        : isTeamAdmin
                          ? "team"
                          : "personal";
                      const availableTeams = (teams ?? []).filter(
                        (t) => !coveredTeamIds.has(t.id),
                      );
                      if (defaultScope === "org" && hasOrg)
                        defaultScope =
                          availableTeams.length > 0 ? "team" : "personal";
                      if (
                        defaultScope === "team" &&
                        availableTeams.length === 0
                      )
                        defaultScope = "personal";
                      if (defaultScope === "personal" && hasPersonal)
                        defaultScope = hasOrg ? "team" : "org";

                      setSelectedScope(defaultScope);
                      setSelectedTeamIds([]);
                      setPendingServer(s);
                    }}
                    onRequestInstallation={handleRequestInstallation}
                    isAdding={createMutation.isPending}
                    onOpenReadme={setReadmeServer}
                    existingCatalogItems={
                      catalogItemsByName.get(server.name) ?? []
                    }
                    teams={teams}
                    canCreateCatalogItem={canCreateCatalogItem}
                    isAdmin={!!isAdmin}
                    isTeamAdmin={!!isTeamAdmin}
                  />
                ))}
              </div>

              {hasNextPage && (
                <div className="flex justify-center mt-6">
                  <Button
                    onClick={() => fetchNextPage()}
                    disabled={isFetchingNextPage}
                    variant="outline"
                    size="lg"
                  >
                    {isFetchingNextPage ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Loading more...
                      </>
                    ) : (
                      "Load more"
                    )}
                  </Button>
                </div>
              )}
            </>
          )}
        </>
      )}

      <DetailsDialog
        server={readmeServer}
        onClose={() => setReadmeServer(null)}
      />

      <RequestInstallationDialog
        server={requestServer}
        onClose={() => setRequestServer(null)}
      />

      <ScopeDialog
        pendingServer={pendingServer}
        onClose={() => {
          setPendingServer(null);
          setSelectedScope("org");
          setSelectedTeamIds([]);
        }}
        selectedScope={selectedScope}
        onScopeChange={(newScope) => {
          setSelectedScope(newScope);
          if (newScope !== "team") {
            setSelectedTeamIds([]);
          }
        }}
        selectedTeamIds={selectedTeamIds}
        onTeamIdsChange={setSelectedTeamIds}
        isAdmin={!!isAdmin}
        isTeamAdmin={!!isTeamAdmin}
        teams={teams}
        existingCatalogItems={
          pendingServer
            ? (catalogItemsByName.get(pendingServer.name) ?? [])
            : []
        }
        isPending={createMutation.isPending}
        onConfirm={() => {
          if (pendingServer) {
            handleAddToCatalog(pendingServer);
            setPendingServer(null);
          }
        }}
      />
    </div>
  );
}

// Server card component for a single server
function ServerCard({
  server,
  onAddToCatalog,
  onRequestInstallation,
  isAdding,
  onOpenReadme,
  existingCatalogItems,
  teams,
  canCreateCatalogItem,
  isAdmin,
  isTeamAdmin,
}: {
  server: archestraCatalogTypes.ArchestraMcpServerManifest;
  onAddToCatalog: (
    server: archestraCatalogTypes.ArchestraMcpServerManifest,
  ) => void;
  onRequestInstallation: (
    server: archestraCatalogTypes.ArchestraMcpServerManifest,
  ) => void;
  isAdding: boolean;
  onOpenReadme: (
    server: archestraCatalogTypes.ArchestraMcpServerManifest,
  ) => void;
  existingCatalogItems: CatalogItem[];
  teams: Array<{ id: string; name: string }> | undefined;
  canCreateCatalogItem: boolean;
  isAdmin: boolean;
  isTeamAdmin: boolean;
}) {
  // Compute whether all possible scopes are covered
  const isFullyCovered = useMemo(() => {
    if (existingCatalogItems.length === 0) return false;
    const hasPersonal = existingCatalogItems.some(
      (i) => i.scope === "personal",
    );
    const hasOrg = existingCatalogItems.some((i) => i.scope === "org");
    if (hasOrg) return true; // org-wide item covers everything
    const coveredTeamIds = new Set(
      existingCatalogItems
        .filter((i) => i.scope === "team")
        .flatMap((i) => i.teams?.map((t) => t.id) ?? []),
    );
    const allTeamsCovered =
      (teams ?? []).length > 0
        ? (teams ?? []).every((t) => coveredTeamIds.has(t.id))
        : true;

    // Factor in permissions: if user can't create at a scope, it doesn't need covering
    const orgCovered = !isAdmin;
    const teamCovered = allTeamsCovered || !(isAdmin || isTeamAdmin);
    const personalCovered = hasPersonal;

    return orgCovered && teamCovered && personalCovered;
  }, [existingCatalogItems, teams, isAdmin, isTeamAdmin]);

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <div className="flex items-start">
          <div className="flex items-start gap-2 flex-1 min-w-0">
            {server.icon && (
              <img
                src={server.icon}
                alt={`${server.name} icon`}
                className="w-8 h-8 rounded flex-shrink-0 mt-0.5"
              />
            )}
            <CardTitle className="text-base">
              <TruncatedText
                message={server.display_name || server.name}
                maxLength={40}
              />
            </CardTitle>
          </div>
          <div className="flex flex-wrap gap-1 items-center flex-shrink-0 mt-1">
            {server.category && (
              <Badge variant="outline" className="text-xs">
                {server.category}
              </Badge>
            )}
            {!server.oauth_config?.requires_proxy && (
              <Badge variant="secondary" className="text-xs">
                OAuth
              </Badge>
            )}
          </div>
        </div>
        {server.display_name && server.display_name !== server.name && (
          <p className="text-xs text-muted-foreground font-mono">
            {server.name}
          </p>
        )}
        <TransportBadges
          isRemote={server.server.type === "remote"}
          className="mt-1"
        />
      </CardHeader>
      <CardContent className="flex-1 flex flex-col space-y-3">
        {server.description && (
          <p className="text-sm text-muted-foreground line-clamp-2">
            {server.description}
          </p>
        )}

        <div className="flex flex-col gap-2 mt-auto pt-3 justify-end">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenReadme(server)}
              className="flex-1"
            >
              <Info className="h-4 w-4 mr-1" />
              Details
            </Button>
            {server.github_info?.url && (
              <Button variant="outline" size="sm" asChild className="flex-1">
                <a
                  href={server.github_info.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Github className="h-4 w-4 mr-1" />
                  Code
                </a>
              </Button>
            )}
            {(server.homepage || server.documentation) && (
              <Button variant="outline" size="sm" asChild className="flex-1">
                <a
                  href={server.homepage || server.documentation}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <BookOpen className="h-4 w-4 mr-1" />
                  Docs
                </a>
              </Button>
            )}
          </div>
          <Button
            onClick={() =>
              canCreateCatalogItem
                ? onAddToCatalog(server)
                : onRequestInstallation(server)
            }
            disabled={isAdding || isFullyCovered}
            size="sm"
            className="w-full"
            data-testid={E2eTestId.AddCatalogItemButton}
          >
            {isFullyCovered
              ? "Added"
              : canCreateCatalogItem
                ? "Add to Your Registry"
                : "Request to add to internal registry"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// Scope selection dialog with warnings about existing installations
function ScopeDialog({
  pendingServer,
  onClose,
  selectedScope,
  onScopeChange,
  selectedTeamIds,
  onTeamIdsChange,
  isAdmin,
  isTeamAdmin,
  teams,
  existingCatalogItems,
  isPending,
  onConfirm,
}: {
  pendingServer: archestraCatalogTypes.ArchestraMcpServerManifest | null;
  onClose: () => void;
  selectedScope: "personal" | "team" | "org";
  onScopeChange: (scope: "personal" | "team" | "org") => void;
  selectedTeamIds: string[];
  onTeamIdsChange: (ids: string[]) => void;
  isAdmin: boolean;
  isTeamAdmin: boolean;
  teams: Array<{ id: string; name: string }> | undefined;
  existingCatalogItems: CatalogItem[];
  isPending: boolean;
  onConfirm: () => void;
}) {
  const updateMutation = useUpdateInternalMcpCatalogItem();

  const hasPersonal = existingCatalogItems.some((i) => i.scope === "personal");
  const hasOrg = existingCatalogItems.some((i) => i.scope === "org");
  const personalItem = existingCatalogItems.find((i) => i.scope === "personal");
  const coveredTeamIds = new Set(
    existingCatalogItems
      .filter((i) => i.scope === "team")
      .flatMap((i) => i.teams?.map((t) => t.id) ?? []),
  );
  const existingTeamNames = existingCatalogItems
    .filter((i) => i.scope === "team")
    .flatMap((i) => i.teams?.map((t) => t.name) ?? []);

  // Compute available teams and disabled scopes
  const availableTeams = hasOrg
    ? []
    : (teams ?? []).filter((t) => !coveredTeamIds.has(t.id));
  const disabledScopes: Partial<Record<"personal" | "team" | "org", string>> =
    {};
  if (hasOrg) {
    disabledScopes.personal = "Already available org-wide";
    disabledScopes.team = "Already available org-wide";
    disabledScopes.org = "Already added org-wide";
  } else {
    if (hasPersonal) disabledScopes.personal = "Already added as personal";
    if ((teams ?? []).length > 0 && availableTeams.length === 0) {
      disabledScopes.team = "Already added for all your teams";
    }
  }

  // Contextual promote banner: show when user selects team scope and has a personal item
  const showPromoteBanner =
    selectedScope === "team" && hasPersonal && personalItem;

  // Contextual info banner: show existing installations context
  const infoParts: string[] = [];
  if (hasOrg) infoParts.push("available org-wide");
  if (existingTeamNames.length > 0)
    infoParts.push(`added for ${existingTeamNames.join(", ")}`);
  if (hasPersonal) infoParts.push("has a personal installation");

  const handlePromoteToTeam = async () => {
    if (!personalItem || selectedTeamIds.length === 0) return;
    await updateMutation.mutateAsync({
      id: personalItem.id,
      data: { scope: "team", teams: selectedTeamIds },
    });
    onClose();
  };

  return (
    <Dialog open={!!pendingServer} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-start gap-3">
            {pendingServer?.icon && (
              <img
                src={pendingServer.icon}
                alt=""
                className="w-10 h-10 rounded-lg flex-shrink-0"
              />
            )}
            <DialogTitle>Who can install this MCP server</DialogTitle>
          </div>
        </DialogHeader>

        <AccessLevelSelector
          scope={selectedScope}
          onScopeChange={(newScope) => {
            onScopeChange(newScope);
            if (newScope !== "team") {
              onTeamIdsChange([]);
            }
          }}
          isAdmin={isAdmin}
          isTeamAdmin={isTeamAdmin}
          resourceLabel="MCP server"
          teams={availableTeams}
          assignedTeamIds={selectedTeamIds}
          onTeamIdsChange={onTeamIdsChange}
          hasNoAvailableTeams={availableTeams.length === 0}
          disabledScopes={disabledScopes}
          variant="full"
          verb="install"
          hideLabel
        />

        {/* Promote banner */}
        {showPromoteBanner && selectedTeamIds.length > 0 && (
          <div className="flex items-start gap-3 rounded-xl bg-primary/5 border border-primary/20 p-4">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Sparkles className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0 space-y-2">
              <div>
                <p className="text-sm font-semibold">
                  You already have a personal installation.
                </p>
                <p className="text-xs text-muted-foreground">
                  Promote it to share with your team — no duplicate needed.
                </p>
              </div>
              <Button
                size="sm"
                onClick={handlePromoteToTeam}
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    Promoting...
                  </>
                ) : (
                  <>
                    Promote to Team
                    <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Info context for other existing installations */}
        {infoParts.length > 0 &&
          !(showPromoteBanner && selectedTeamIds.length > 0) && (
            <div className="flex items-start gap-3 rounded-xl bg-primary/5 border border-primary/20 p-4">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Sparkles className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">
                  Already in your registry
                </p>
                <p className="text-xs text-muted-foreground">
                  This server is already {infoParts.join(" and ")}.
                </p>
              </div>
            </div>
          )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={
              isPending ||
              (selectedScope === "team" && selectedTeamIds.length === 0)
            }
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Adding...
              </>
            ) : (
              "Add"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
