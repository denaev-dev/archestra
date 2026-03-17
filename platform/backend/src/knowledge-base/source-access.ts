import { userHasPermission } from "@/auth/utils";
import { TeamModel } from "@/models";
import type {
  KnowledgeBase,
  KnowledgeBaseConnector,
  KnowledgeBaseVisibility,
  KnowledgeSourceVisibility,
} from "@/types";

type VisibilityScopedKnowledgeSource = {
  visibility: KnowledgeSourceVisibility | KnowledgeBaseVisibility;
  teamIds: string[];
};

export interface KnowledgeSourceAccessContext {
  canReadAll: boolean;
  teamIds: string[];
}

class KnowledgeSourceAccessService {
  async buildAccessContext(params: {
    userId: string;
    organizationId: string;
  }): Promise<KnowledgeSourceAccessContext> {
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
    access: KnowledgeSourceAccessContext,
    knowledgeBase: KnowledgeBase,
  ) {
    return this.canAccessSource(access, knowledgeBase);
  }

  canAccessConnector(
    access: KnowledgeSourceAccessContext,
    connector: KnowledgeBaseConnector,
  ) {
    return this.canAccessSource(access, connector);
  }

  filterKnowledgeBases(
    access: KnowledgeSourceAccessContext,
    knowledgeBases: KnowledgeBase[],
  ) {
    return knowledgeBases.filter((knowledgeBase) =>
      this.canAccessKnowledgeBase(access, knowledgeBase),
    );
  }

  filterConnectors(
    access: KnowledgeSourceAccessContext,
    connectors: KnowledgeBaseConnector[],
  ) {
    return connectors.filter((connector) =>
      this.canAccessConnector(access, connector),
    );
  }

  private canAccessSource(
    access: KnowledgeSourceAccessContext,
    source: VisibilityScopedKnowledgeSource,
  ) {
    if (access.canReadAll) {
      return true;
    }

    if (source.visibility !== "team-scoped") {
      return true;
    }

    return source.teamIds.some((teamId) => access.teamIds.includes(teamId));
  }
}

export const knowledgeSourceAccessService = new KnowledgeSourceAccessService();
