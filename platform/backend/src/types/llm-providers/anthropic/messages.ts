import { z } from "zod";

const RoleSchema = z.enum(["user", "assistant"]);

const TextBlockSchema = z.object({
  citations: z.array(z.any()).nullable(),
  text: z.string(),
  type: z.enum(["text"]),
});

const ToolUseBlockSchema = z.object({
  id: z.string(),
  input: z.any(),
  name: z.string(),
  type: z.enum(["tool_use"]),
});

const ServerToolUseBlockSchema = z.any();
const WebSearchToolResultBlockSchema = z.any();

export const MessageContentBlockSchema = z.union([
  TextBlockSchema,
  ToolUseBlockSchema,
  ServerToolUseBlockSchema,
  WebSearchToolResultBlockSchema,
]);

const TextBlockParamSchema = z.object({
  text: z.string(),
  type: z.enum(["text"]),
  cache_control: z.any().nullable().optional(),
  citations: z.array(z.any()).nullable().optional(),
});

const ImageBlockParamSchema = z.object({
  type: z.enum(["image"]),
  source: z.object({
    type: z.enum(["base64"]),
    media_type: z.string(),
    data: z.string(),
  }),
  cache_control: z.any().nullable().optional(),
});

const DocumentBlockParamSchema = z.object({
  type: z.enum(["document"]),
  source: z.union([
    z.object({
      type: z.enum(["base64"]),
      media_type: z.enum(["application/pdf"]),
      data: z.string(),
    }),
    z.object({
      type: z.enum(["text"]),
      media_type: z.enum(["text/plain"]),
      data: z.string(),
    }),
    z.object({
      type: z.enum(["url"]),
      url: z.string().url(),
    }),
  ]),
  title: z.string().optional(),
  context: z.string().optional(),
  citations: z
    .object({
      enabled: z.boolean(),
    })
    .optional(),
  cache_control: z.any().nullable().optional(),
});

// const SearchResultBlockParamSchema = z.any();
const ToolUseBlockParamSchema = z.object({
  id: z.string(),
  input: z.any(),
  name: z.string(),
  type: z.enum(["tool_use"]),
  cache_control: z.any().nullable().optional(),
});
const ToolResultBlockParamSchema = z.object({
  tool_use_id: z.string(),
  type: z.enum(["tool_result"]),
  cache_control: z.any().nullable().optional(),
  content: z
    .union([
      z.string(),
      z.array(
        z.union([
          TextBlockParamSchema,
          ImageBlockParamSchema,
          DocumentBlockParamSchema,
          // SearchResultBlockParamSchema,
        ]),
      ),
    ])
    .optional(),
  is_error: z.boolean().optional(),
});
// const ServerToolUseBlockParamSchema = z.any();
// const WebSearchToolResultBlockParamSchema = z.any();

const ContentBlockParamSchema = z.union([
  TextBlockParamSchema,
  ImageBlockParamSchema,
  DocumentBlockParamSchema,
  // SearchResultBlockParamSchema,
  ToolUseBlockParamSchema,
  ToolResultBlockParamSchema,
  // ServerToolUseBlockParamSchema,
  // WebSearchToolResultBlockParamSchema,
]);

export const MessageParamSchema = z.object({
  content: z.union([z.string(), z.array(ContentBlockParamSchema)]),
  role: RoleSchema,
});
