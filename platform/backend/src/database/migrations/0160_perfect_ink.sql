CREATE TABLE "mcp_rate_limits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"limit_type" varchar NOT NULL,
	"mcp_server_name" varchar(255) NOT NULL,
	"tool_name" varchar(255),
	"max_calls" integer NOT NULL,
	"window_seconds" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "limits" ADD COLUMN "window_seconds" integer;--> statement-breakpoint
ALTER TABLE "mcp_rate_limits" ADD CONSTRAINT "mcp_rate_limits_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mcp_rate_limits_agent_idx" ON "mcp_rate_limits" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "mcp_rate_limits_agent_server_idx" ON "mcp_rate_limits" USING btree ("agent_id","mcp_server_name");

-- RBAC resource rename: "limit" -> "llmTokenLimit" in custom roles
-- Also copy "limit" permissions to "mcpRateLimit" for backward compatibility
UPDATE "organization_role"
SET "permission" = (
  ("permission"::jsonb - 'limit')
  || jsonb_build_object('llmTokenLimit', "permission"::jsonb->'limit')
  || jsonb_build_object('mcpRateLimit', "permission"::jsonb->'limit')
)::text
WHERE "permission"::text LIKE '%"limit"%';