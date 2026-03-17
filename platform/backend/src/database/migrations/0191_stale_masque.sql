ALTER TABLE "knowledge_base_connectors" ADD COLUMN "visibility" text DEFAULT 'org-wide' NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge_base_connectors" ADD COLUMN "team_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;

-- Data migration: Rename RBAC resource "knowledgeBases" to "knowledgeSources"
-- in custom role permissions, then implicitly grant knowledgeSources:admin
-- to roles that already have knowledgeSources:create.
--
-- Note: Uses text LIKE checks instead of jsonb ? operator for PGlite compatibility.
-- Key matching uses '"key":' pattern (with colon) to match exact JSON keys.

-- Step 1a: Rename "knowledgeBases" to "knowledgeSources" when the new key does not yet exist.
UPDATE "organization_role"
SET "permission" = (
  ("permission"::jsonb - 'knowledgeBases') || jsonb_build_object(
    'knowledgeSources',
    "permission"::jsonb->'knowledgeBases'
  )
)::text
WHERE "permission"::text LIKE '%"knowledgeBases":%'
  AND NOT "permission"::text LIKE '%"knowledgeSources":%';

-- Step 1b: Union "knowledgeBases" into "knowledgeSources" when both keys exist.
UPDATE "organization_role"
SET "permission" = (
  ("permission"::jsonb - 'knowledgeBases') || jsonb_build_object(
    'knowledgeSources',
    (
      SELECT jsonb_agg(DISTINCT val)
      FROM (
        SELECT jsonb_array_elements_text("permission"::jsonb->'knowledgeSources') AS val
        UNION
        SELECT jsonb_array_elements_text("permission"::jsonb->'knowledgeBases') AS val
      ) combined
    )
  )
)::text
WHERE "permission"::text LIKE '%"knowledgeBases":%'
  AND "permission"::text LIKE '%"knowledgeSources":%';

-- Step 2: Implicitly grant "admin" to any role that has "knowledgeSources:create".
UPDATE "organization_role"
SET "permission" = (
  ("permission"::jsonb - 'knowledgeSources') || jsonb_build_object(
    'knowledgeSources',
    (
      SELECT jsonb_agg(DISTINCT val)
      FROM (
        SELECT jsonb_array_elements_text("permission"::jsonb->'knowledgeSources') AS val
        UNION
        SELECT 'admin' AS val
      ) combined
    )
  )
)::text
WHERE "permission"::text LIKE '%"knowledgeSources":%'
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements_text("permission"::jsonb->'knowledgeSources') AS action(val)
    WHERE action.val = 'create'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements_text("permission"::jsonb->'knowledgeSources') AS action(val)
    WHERE action.val = 'admin'
  );
