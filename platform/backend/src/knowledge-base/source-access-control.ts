import { userHasPermission } from "@/auth/utils";
import { TeamModel } from "@/models";
import type {
  AclEntry,
  KnowledgeBase,
  KnowledgeBaseConnector,
  KnowledgeBaseVisibility,
  KnowledgeSourceVisibility,
} from "@/types";

type VisibilityScopedKnowledgeSource = {
  visibility: KnowledgeSourceVisibility | KnowledgeBaseVisibility;
  teamIds: string[];
};

export interface KnowledgeSourceAccessControlContext {
  canReadAll: boolean;
  teamIds: string[];
}

export function buildDocumentAccessControlList(params: {
  visibility: KnowledgeBaseVisibility;
  teamIds: string[];
  permissions?: {
    users?: string[];
    groups?: string[];
    isPublic?: boolean;
  };
}): AclEntry[] {
  switch (params.visibility) {
    case "org-wide":
      return ["org:*"];
    case "team-scoped":
      return params.teamIds.map((id): AclEntry => `team:${id}`);
    case "auto-sync-permissions": {
      const acl: AclEntry[] = [];
      if (params.permissions?.isPublic) {
        acl.push("org:*");
      }
      if (params.permissions?.users) {
        acl.push(
          ...params.permissions.users.map(
            (user): AclEntry => `user_email:${user}`,
          ),
        );
      }
      if (params.permissions?.groups) {
        acl.push(
          ...params.permissions.groups.map(
            (group): AclEntry => `group:${group}`,
          ),
        );
      }
      if (acl.length === 0) {
        acl.push("org:*");
      }
      return acl;
    }
  }
}

export function buildUserAccessControlList(params: {
  userEmail: string;
  teamIds: string[];
  visibility: KnowledgeBaseVisibility;
}): AclEntry[] {
  const acl: AclEntry[] = [];

  if (params.visibility === "org-wide") {
    acl.push("org:*");
  }

  acl.push(`user_email:${params.userEmail}`);

  for (const teamId of params.teamIds) {
    acl.push(`team:${teamId}`);
  }

  return acl;
}

class KnowledgeSourceAccessControlService {
  async buildAccessControlContext(params: {
    userId: string;
    organizationId: string;
  }): Promise<KnowledgeSourceAccessControlContext> {
    const [canReadAll, teamIds] = await Promise.all([
      userHasPermission(
        params.userId,
        params.organizationId,
        "knowledgeSources",
        "admin",
      ),
      TeamModel.getUserTeamIds(params.userId),
    ]);

    return {
      canReadAll,
      teamIds,
    };
  }

  canAccessKnowledgeBase(
    accessControl: KnowledgeSourceAccessControlContext,
    knowledgeBase: KnowledgeBase,
  ) {
    return this.canAccessSource(accessControl, knowledgeBase);
  }

  canAccessConnector(
    accessControl: KnowledgeSourceAccessControlContext,
    connector: KnowledgeBaseConnector,
  ) {
    return this.canAccessSource(accessControl, connector);
  }

  filterKnowledgeBases(
    accessControl: KnowledgeSourceAccessControlContext,
    knowledgeBases: KnowledgeBase[],
  ) {
    return knowledgeBases.filter((knowledgeBase) =>
      this.canAccessKnowledgeBase(accessControl, knowledgeBase),
    );
  }

  filterConnectors(
    accessControl: KnowledgeSourceAccessControlContext,
    connectors: KnowledgeBaseConnector[],
  ) {
    return connectors.filter((connector) =>
      this.canAccessConnector(accessControl, connector),
    );
  }

  private canAccessSource(
    accessControl: KnowledgeSourceAccessControlContext,
    source: VisibilityScopedKnowledgeSource,
  ) {
    if (accessControl.canReadAll) {
      return true;
    }

    if (source.visibility !== "team-scoped") {
      return true;
    }

    return source.teamIds.some((teamId) =>
      accessControl.teamIds.includes(teamId),
    );
  }
}

export const knowledgeSourceAccessControlService =
  new KnowledgeSourceAccessControlService();
