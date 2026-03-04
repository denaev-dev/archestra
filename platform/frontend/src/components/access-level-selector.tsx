"use client";

import { Building2, CheckIcon, ChevronDown, User, Users } from "lucide-react";
import { useState } from "react";
import { Label } from "@/components/ui/label";
import { MultiSelectCombobox } from "@/components/ui/multi-select-combobox";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type Scope = "personal" | "team" | "org";

function getScopeOptions(resourceLabel: string, verb: "access" | "install") {
  return [
    {
      value: "personal" as const,
      label: "Personal",
      description: `Only you can ${verb} this ${resourceLabel}`,
      icon: User,
    },
    {
      value: "team" as const,
      label: "Teams",
      description:
        verb === "install"
          ? `Members of selected teams can install this ${resourceLabel}`
          : `Share ${resourceLabel} with selected teams`,
      icon: Users,
    },
    {
      value: "org" as const,
      label: "Organization",
      description: `Anyone in your org can ${verb} this ${resourceLabel}`,
      icon: Building2,
    },
  ];
}

export function AccessLevelSelector({
  scope,
  onScopeChange,
  isAdmin,
  isTeamAdmin,
  initialScope,
  resourceLabel,
  teams,
  assignedTeamIds,
  onTeamIdsChange,
  hasNoAvailableTeams,
  disabledScopes,
  variant = "dropdown",
  verb,
  hideLabel,
}: {
  scope: Scope;
  onScopeChange: (scope: Scope) => void;
  isAdmin: boolean;
  isTeamAdmin?: boolean;
  initialScope?: Scope;
  resourceLabel: string;
  teams: Array<{ id: string; name: string }> | undefined;
  assignedTeamIds: string[];
  onTeamIdsChange: (ids: string[]) => void;
  hasNoAvailableTeams: boolean;
  disabledScopes?: Partial<Record<Scope, string>>;
  variant?: "dropdown" | "full";
  verb?: "access" | "install";
  hideLabel?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const scopeOptions = getScopeOptions(resourceLabel, verb ?? "access");
  const selected =
    scopeOptions.find((o) => o.value === scope) ?? scopeOptions[0];

  const canManageTeamScope = isAdmin || (isTeamAdmin ?? false);

  const isOptionDisabled = (value: string) => {
    if (disabledScopes?.[value as Scope]) return true;
    if (value === "personal" && initialScope && initialScope !== "personal")
      return true;
    if (value === "team" && !canManageTeamScope) return true;
    if (value === "org" && !isAdmin) return true;
    return false;
  };

  const getDisabledReason = (value: string) => {
    if (disabledScopes?.[value as Scope]) return disabledScopes[value as Scope];
    if (value === "personal" && initialScope && initialScope !== "personal")
      return "Shared items cannot be made personal";
    if (value === "team" && !canManageTeamScope)
      return "You need team-admin permission to share with teams";
    if (value === "org" && !isAdmin)
      return "You need admin permission to make this available org-wide";
    return "";
  };

  const showExpanded = variant === "full" || expanded;

  return (
    <div className="space-y-4">
      {/* ACCESS LEVEL */}
      <div className="space-y-2">
        {!hideLabel && <Label>Who can use this {resourceLabel}</Label>}

        {showExpanded ? (
          <div className="space-y-1.5">
            {scopeOptions.map((option) => {
              const Icon = option.icon;
              const disabled = isOptionDisabled(option.value);
              const isSelected = scope === option.value;
              return (
                <TooltipProvider key={option.value}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => {
                          if (!disabled) {
                            onScopeChange(option.value);
                            if (variant !== "full") setExpanded(false);
                          }
                        }}
                        className={`w-full flex items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                          isSelected
                            ? "bg-primary text-primary-foreground border-primary"
                            : disabled
                              ? "opacity-50 cursor-not-allowed"
                              : "hover:bg-muted/50 cursor-pointer"
                        }`}
                      >
                        <div
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${
                            isSelected ? "bg-primary-foreground/20" : "bg-muted"
                          }`}
                        >
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium">
                            {option.label}
                          </div>
                          <div
                            className={`text-xs ${
                              isSelected
                                ? "text-primary-foreground/70"
                                : "text-muted-foreground"
                            }`}
                          >
                            {option.description}
                          </div>
                          {disabled && disabledScopes?.[option.value] && (
                            <div className="text-xs text-muted-foreground/70 mt-0.5">
                              {disabledScopes[option.value]}
                            </div>
                          )}
                        </div>
                        <div
                          className={`h-4 w-4 shrink-0 rounded-full border-2 flex items-center justify-center ${
                            isSelected
                              ? "border-primary-foreground"
                              : "border-muted-foreground/30"
                          }`}
                        >
                          {isSelected && <CheckIcon className="h-2.5 w-2.5" />}
                        </div>
                      </button>
                    </TooltipTrigger>
                    {disabled && (
                      <TooltipContent>
                        {getDisabledReason(option.value)}
                      </TooltipContent>
                    )}
                  </Tooltip>
                </TooltipProvider>
              );
            })}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="w-full flex items-center gap-3 rounded-lg border p-3 text-left hover:bg-muted/50 transition-colors cursor-pointer"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
              <selected.icon className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">{selected.label}</div>
              <div className="text-xs text-muted-foreground">
                {selected.description}
              </div>
            </div>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        )}
      </div>

      {/* SHARE WITH — only shown for team-scoped */}
      {scope === "team" && (
        <div className="space-y-2">
          <Label>Teams</Label>
          <MultiSelectCombobox
            disabled={!canManageTeamScope || hasNoAvailableTeams}
            options={
              teams?.map((team) => ({
                value: team.id,
                label: team.name,
              })) || []
            }
            value={assignedTeamIds}
            onChange={onTeamIdsChange}
            placeholder={
              hasNoAvailableTeams ? "No teams available" : "Search teams..."
            }
          />
        </div>
      )}
    </div>
  );
}
