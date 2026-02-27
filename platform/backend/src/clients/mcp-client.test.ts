import { MCP_CATALOG_INSTALL_PATH } from "@shared";
import { vi } from "vitest";
import config from "@/config";
import {
  AgentModel,
  AgentToolModel,
  InternalMcpCatalogModel,
  McpHttpSessionModel,
  McpServerModel,
  ToolModel,
} from "@/models";
import { secretManager } from "@/secrets-manager";
import { beforeEach, describe, expect, test } from "@/test";
import mcpClient from "./mcp-client";

// Mock the MCP SDK
const mockCallTool = vi.fn();
const mockConnect = vi.fn();
const mockClose = vi.fn();
const mockListTools = vi.fn();
const mockPing = vi.fn();

vi.mock("@modelcontextprotocol/sdk/client/index.js", () => ({
  // biome-ignore lint/suspicious/noExplicitAny: test..
  Client: vi.fn(function (this: any) {
    this.connect = mockConnect;
    this.callTool = mockCallTool;
    this.close = mockClose;
    this.listTools = mockListTools;
    this.ping = mockPing;
  }),
}));

vi.mock(
  "@modelcontextprotocol/sdk/client/streamableHttp.js",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("@modelcontextprotocol/sdk/client/streamableHttp.js")
      >();
    return {
      ...actual,
      StreamableHTTPClientTransport: vi.fn(),
    };
  },
);

// Mock McpServerRuntimeManager - use vi.hoisted to avoid initialization errors
const {
  mockUsesStreamableHttp,
  mockGetHttpEndpointUrl,
  mockGetRunningPodHttpEndpoint,
  mockGetOrLoadDeployment,
} = vi.hoisted(() => ({
  mockUsesStreamableHttp: vi.fn(),
  mockGetHttpEndpointUrl: vi.fn(),
  mockGetRunningPodHttpEndpoint: vi.fn(),
  mockGetOrLoadDeployment: vi.fn(),
}));

vi.mock("@/mcp-server-runtime", () => ({
  McpServerRuntimeManager: {
    usesStreamableHttp: mockUsesStreamableHttp,
    getHttpEndpointUrl: mockGetHttpEndpointUrl,
    getRunningPodHttpEndpoint: mockGetRunningPodHttpEndpoint,
    getOrLoadDeployment: mockGetOrLoadDeployment,
  },
}));

describe("McpClient", () => {
  let agentId: string;
  let mcpServerId: string;
  let catalogId: string;

  beforeEach(async () => {
    // Create test agent
    const agent = await AgentModel.create({
      name: "Test Agent",
      scope: "org",
      teams: [],
    });
    agentId = agent.id;

    // Create secret with access token
    const secret = await secretManager().createSecret(
      { access_token: "test-github-token-123" },
      "testmcptoken",
    );

    // Create catalog entry for the MCP server
    const catalogItem = await InternalMcpCatalogModel.create({
      name: "github-mcp-server",
      serverType: "remote",
      serverUrl: "https://api.githubcopilot.com/mcp/",
    });
    catalogId = catalogItem.id;

    // Create MCP server for testing with secret and catalog reference
    const mcpServer = await McpServerModel.create({
      name: "github-mcp-server",
      secretId: secret.id,
      catalogId: catalogItem.id,
      serverType: "remote",
    });
    mcpServerId = mcpServer.id;

    // Reset all mocks
    vi.clearAllMocks();
    mockCallTool.mockReset();
    mockConnect.mockReset();
    mockClose.mockReset();
    mockListTools.mockReset();
    mockPing.mockReset();
    mockUsesStreamableHttp.mockReset();
    mockGetHttpEndpointUrl.mockReset();
    mockGetRunningPodHttpEndpoint.mockReset();
    mockGetOrLoadDeployment.mockReset();

    // Spy on McpHttpSessionModel to prevent real DB writes during mcp-client tests
    // and to avoid errors from session persistence in the background
    vi.spyOn(
      McpHttpSessionModel,
      "findRecordByConnectionKey",
    ).mockResolvedValue(null);
    vi.spyOn(McpHttpSessionModel, "upsert").mockResolvedValue(undefined);
    vi.spyOn(McpHttpSessionModel, "deleteByConnectionKey").mockResolvedValue(
      undefined,
    );
    vi.spyOn(McpHttpSessionModel, "deleteStaleSession").mockResolvedValue(
      undefined,
    );
    vi.spyOn(McpHttpSessionModel, "deleteExpired").mockResolvedValue(0);

    // Default: listTools returns empty list (fallback to stripped name)
    mockListTools.mockResolvedValue({ tools: [] });
  });

  describe("executeToolCall", () => {
    test("returns error when tool not found for agent", async () => {
      const toolCall = {
        id: "call_123",
        name: "non_mcp_tool",
        arguments: { param: "value" },
      };

      const result = await mcpClient.executeToolCall(toolCall, agentId);
      expect(result).toMatchObject({
        id: "call_123",
        isError: true,
        error: expect.stringContaining("Tool not found"),
      });
    });

    describe("Response Modifier Templates", () => {
      test("applies simple text template to tool response", async () => {
        // Create MCP tool with response modifier template
        const tool = await ToolModel.createToolIfNotExists({
          name: "github-mcp-server__test_tool",
          description: "Test MCP tool",
          parameters: {},
          catalogId,
        });

        // Assign tool to agent with response modifier
        await AgentToolModel.create(agentId, tool.id, {
          credentialSourceMcpServerId: mcpServerId,
          responseModifierTemplate:
            'Modified: {{{lookup (lookup response 0) "text"}}}',
        });

        // Mock the MCP client response with realistic GitHub issues data
        mockCallTool.mockResolvedValueOnce({
          content: [
            {
              type: "text",
              text: '{"issues":[{"id":3550499726,"number":816,"state":"OPEN","title":"Add authentication for MCP gateways"}]}',
            },
          ],
          isError: false,
        });

        const toolCall = {
          id: "call_1",
          name: "github-mcp-server__test_tool",
          arguments: {},
        };

        const result = await mcpClient.executeToolCall(toolCall, agentId);

        expect(result).toEqual({
          id: "call_1",
          content: [
            {
              type: "text",
              text: 'Modified: {"issues":[{"id":3550499726,"number":816,"state":"OPEN","title":"Add authentication for MCP gateways"}]}',
            },
          ],
          isError: false,
          name: "github-mcp-server__test_tool",
        });
      });

      test("applies JSON template to tool response", async () => {
        // Create MCP tool with JSON response modifier template
        const tool = await ToolModel.createToolIfNotExists({
          name: "github-mcp-server__json_tool",
          description: "Test MCP tool with JSON",
          parameters: {},
          catalogId,
        });

        await AgentToolModel.create(agentId, tool.id, {
          credentialSourceMcpServerId: mcpServerId,
          responseModifierTemplate:
            '{{#with (lookup response 0)}}{"formatted": true, "data": "{{{this.text}}}"}{{/with}}',
        });

        mockCallTool.mockResolvedValueOnce({
          content: [{ type: "text", text: "test data" }],
          isError: false,
        });

        const toolCall = {
          id: "call_1",
          name: "github-mcp-server__json_tool",
          arguments: {},
        };

        const result = await mcpClient.executeToolCall(toolCall, agentId);

        expect(result).toEqual({
          id: "call_1",
          content: { formatted: true, data: "test data" },
          isError: false,
          name: "github-mcp-server__json_tool",
        });
      });

      test("transforms GitHub issues to id:title mapping using json helper", async () => {
        const tool = await ToolModel.createToolIfNotExists({
          name: "github-mcp-server__github_issues",
          description: "GitHub issues tool",
          parameters: {},
          catalogId,
        });

        await AgentToolModel.create(agentId, tool.id, {
          credentialSourceMcpServerId: mcpServerId,
          responseModifierTemplate: `{{#with (lookup response 0)}}{{#with (json this.text)}}
  {
  {{#each this.issues}}
    "{{this.id}}": "{{{escapeJson this.title}}}"{{#unless @last}},{{/unless}}
  {{/each}}
}
{{/with}}{{/with}}`,
        });

        // Realistic GitHub MCP response with stringified JSON
        mockCallTool.mockResolvedValueOnce({
          content: [
            {
              type: "text",
              text: '{"issues":[{"id":3550499726,"number":816,"state":"OPEN","title":"Add authentication for MCP gateways"},{"id":3550391199,"number":815,"state":"OPEN","title":"ERROR: role \\"postgres\\" already exists"}]}',
            },
          ],
          isError: false,
        });

        const toolCall = {
          id: "call_1",
          name: "github-mcp-server__github_issues",
          arguments: {},
        };

        const result = await mcpClient.executeToolCall(toolCall, agentId);

        expect(result).toEqual({
          id: "call_1",
          content: {
            "3550499726": "Add authentication for MCP gateways",
            "3550391199": 'ERROR: role "postgres" already exists',
          },
          isError: false,
          name: "github-mcp-server__github_issues",
        });
      });

      test("uses {{response}} to access full response content", async () => {
        const tool = await ToolModel.createToolIfNotExists({
          name: "github-mcp-server__content_tool",
          description: "Test tool accessing full content",
          parameters: {},
          catalogId,
        });

        await AgentToolModel.create(agentId, tool.id, {
          credentialSourceMcpServerId: mcpServerId,
          responseModifierTemplate: "{{{json response}}}",
        });

        mockCallTool.mockResolvedValueOnce({
          content: [
            { type: "text", text: "Line 1" },
            { type: "text", text: "Line 2" },
          ],
          isError: false,
        });

        const toolCall = {
          id: "call_1",
          name: "github-mcp-server__content_tool",
          arguments: {},
        };

        const result = await mcpClient.executeToolCall(toolCall, agentId);

        expect(result?.content).toEqual([
          { type: "text", text: "Line 1" },
          { type: "text", text: "Line 2" },
        ]);
      });

      test("falls back to original content when template fails", async () => {
        const tool = await ToolModel.createToolIfNotExists({
          name: "github-mcp-server__bad_template",
          description: "Test tool with bad template",
          parameters: {},
          catalogId,
        });

        // Invalid Handlebars template
        await AgentToolModel.create(agentId, tool.id, {
          credentialSourceMcpServerId: mcpServerId,
          responseModifierTemplate: "{{#invalid",
        });

        const originalContent = [{ type: "text", text: "Original" }];
        mockCallTool.mockResolvedValueOnce({
          content: originalContent,
          isError: false,
        });

        const toolCall = {
          id: "call_1",
          name: "github-mcp-server__bad_template",
          arguments: {},
        };

        const result = await mcpClient.executeToolCall(toolCall, agentId);

        // Should fall back to original content when template fails

        expect(result).toEqual({
          id: "call_1",
          content: originalContent,
          isError: false,
          name: "github-mcp-server__bad_template",
        });
      });

      test("handles non-text content gracefully", async () => {
        const tool = await ToolModel.createToolIfNotExists({
          name: "github-mcp-server__image_tool",
          description: "Test tool with image content",
          parameters: {},
          catalogId,
        });

        await AgentToolModel.create(agentId, tool.id, {
          credentialSourceMcpServerId: mcpServerId,
          responseModifierTemplate:
            'Type: {{lookup (lookup response 0) "type"}}',
        });

        // Response with image instead of text
        mockCallTool.mockResolvedValueOnce({
          content: [{ type: "image", data: "base64data" }],
          isError: false,
        });

        const toolCall = {
          id: "call_1",
          name: "github-mcp-server__image_tool",
          arguments: {},
        };

        const result = await mcpClient.executeToolCall(toolCall, agentId);

        expect(result?.content).toEqual([
          { type: "text", text: "Type: image" },
        ]);
      });

      test("executes tool without template when none is set", async () => {
        const tool = await ToolModel.createToolIfNotExists({
          name: "github-mcp-server__no_template",
          description: "Test tool without template",
          parameters: {},
          catalogId,
        });

        // Assign tool without response modifier template
        await AgentToolModel.create(agentId, tool.id, {
          credentialSourceMcpServerId: mcpServerId,
          responseModifierTemplate: null,
        });

        const originalContent = [{ type: "text", text: "Unmodified" }];
        mockCallTool.mockResolvedValueOnce({
          content: originalContent,
          isError: false,
        });

        const toolCall = {
          id: "call_1",
          name: "github-mcp-server__no_template",
          arguments: {},
        };

        const result = await mcpClient.executeToolCall(toolCall, agentId);

        expect(result).toEqual({
          id: "call_1",
          content: originalContent,
          isError: false,
          name: "github-mcp-server__no_template",
        });
      });

      test("applies different templates to different tools", async () => {
        // Create two tools with different templates
        const tool1 = await ToolModel.createToolIfNotExists({
          name: "github-mcp-server__tool1",
          description: "First tool",
          parameters: {},
          catalogId,
        });

        const tool2 = await ToolModel.createToolIfNotExists({
          name: "github-mcp-server__tool2",
          description: "Second tool",
          parameters: {},
          catalogId,
        });

        await AgentToolModel.create(agentId, tool1.id, {
          credentialSourceMcpServerId: mcpServerId,
          responseModifierTemplate:
            'Template 1: {{lookup (lookup response 0) "text"}}',
        });

        await AgentToolModel.create(agentId, tool2.id, {
          credentialSourceMcpServerId: mcpServerId,
          responseModifierTemplate:
            'Template 2: {{lookup (lookup response 0) "text"}}',
        });

        mockCallTool
          .mockResolvedValueOnce({
            content: [{ type: "text", text: "Response 1" }],
            isError: false,
          })
          .mockResolvedValueOnce({
            content: [{ type: "text", text: "Response 2" }],
            isError: false,
          });

        const toolCall1 = {
          id: "call_1",
          name: "github-mcp-server__tool1",
          arguments: {},
        };

        const toolCall2 = {
          id: "call_2",
          name: "github-mcp-server__tool2",
          arguments: {},
        };

        const result1 = await mcpClient.executeToolCall(toolCall1, agentId);
        const result2 = await mcpClient.executeToolCall(toolCall2, agentId);

        expect(result1).toEqual({
          id: "call_1",
          content: [{ type: "text", text: "Template 1: Response 1" }],
          isError: false,
          name: "github-mcp-server__tool1",
        });
        expect(result2).toEqual({
          id: "call_2",
          content: [{ type: "text", text: "Template 2: Response 2" }],
          isError: false,
          name: "github-mcp-server__tool2",
        });
      });
    });

    describe("Secrets caching (N+1 prevention)", () => {
      test("caches secret lookups across consecutive tool calls to same server", async () => {
        // Create two tools assigned to the same MCP server (same catalog)
        const tool1 = await ToolModel.createToolIfNotExists({
          name: "github-mcp-server__tool_a",
          description: "Tool A",
          parameters: {},
          catalogId,
        });
        const tool2 = await ToolModel.createToolIfNotExists({
          name: "github-mcp-server__tool_b",
          description: "Tool B",
          parameters: {},
          catalogId,
        });

        await AgentToolModel.create(agentId, tool1.id, {
          credentialSourceMcpServerId: mcpServerId,
        });
        await AgentToolModel.create(agentId, tool2.id, {
          credentialSourceMcpServerId: mcpServerId,
        });

        mockCallTool
          .mockResolvedValueOnce({
            content: [{ type: "text", text: "Result A" }],
            isError: false,
          })
          .mockResolvedValueOnce({
            content: [{ type: "text", text: "Result B" }],
            isError: false,
          });

        // Spy on secretManager to count calls
        const getSecretSpy = vi.spyOn(secretManager(), "getSecret");

        const resultA = await mcpClient.executeToolCall(
          { id: "call_a", name: "github-mcp-server__tool_a", arguments: {} },
          agentId,
        );
        const resultB = await mcpClient.executeToolCall(
          { id: "call_b", name: "github-mcp-server__tool_b", arguments: {} },
          agentId,
        );

        expect(resultA.isError).toBe(false);
        expect(resultB.isError).toBe(false);

        // Secret should only be fetched once due to caching
        expect(getSecretSpy).toHaveBeenCalledTimes(1);

        getSecretSpy.mockRestore();
      });
    });

    describe("Concurrency limiter", () => {
      test("bypasses limiter when browser streaming is disabled", async () => {
        const originalBrowserStreaming =
          config.features.browserStreamingEnabled;
        config.features.browserStreamingEnabled = false;

        const clientWithInternals = mcpClient as unknown as {
          connectionLimiter: {
            runWithLimit: (
              connectionKey: string,
              limit: number,
              fn: () => Promise<unknown>,
            ) => Promise<unknown>;
          };
          getTransport: (
            catalogItem: unknown,
            targetLocalMcpServerId: string,
            secrets: Record<string, unknown>,
          ) => Promise<unknown>;
          getTransportWithKind: (
            catalogItem: unknown,
            targetLocalMcpServerId: string,
            secrets: Record<string, unknown>,
            transportKind: "stdio" | "http",
          ) => Promise<unknown>;
        };

        const runWithLimitSpy = vi.spyOn(
          clientWithInternals.connectionLimiter,
          "runWithLimit",
        );
        const getTransportSpy = vi.spyOn(clientWithInternals, "getTransport");

        try {
          const tool = await ToolModel.createToolIfNotExists({
            name: "github-mcp-server__limiter_disabled",
            description: "Limiter disabled tool",
            parameters: {},
            catalogId,
          });

          await AgentToolModel.create(agentId, tool.id, {
            credentialSourceMcpServerId: mcpServerId,
          });

          mockCallTool.mockResolvedValueOnce({
            content: [{ type: "text", text: "Limiter disabled" }],
            isError: false,
          });

          const toolCall = {
            id: "call_limiter_disabled",
            name: "github-mcp-server__limiter_disabled",
            arguments: {},
          };

          const result = await mcpClient.executeToolCall(toolCall, agentId);

          expect(runWithLimitSpy).not.toHaveBeenCalled();
          expect(getTransportSpy).toHaveBeenCalled();

          expect(result).toEqual({
            id: "call_limiter_disabled",
            content: [{ type: "text", text: "Limiter disabled" }],
            isError: false,
            name: "github-mcp-server__limiter_disabled",
          });
        } finally {
          config.features.browserStreamingEnabled = originalBrowserStreaming;
          runWithLimitSpy.mockRestore();
          getTransportSpy.mockRestore();
        }
      });

      test("limits HTTP concurrency to 4 when browser streaming is enabled", async () => {
        const originalBrowserStreaming =
          config.features.browserStreamingEnabled;
        config.features.browserStreamingEnabled = true;

        const clientWithInternals = mcpClient as unknown as {
          connectionLimiter: {
            runWithLimit: (
              connectionKey: string,
              limit: number,
              fn: () => Promise<unknown>,
            ) => Promise<unknown>;
          };
          getTransport: (
            catalogItem: unknown,
            targetLocalMcpServerId: string,
            secrets: Record<string, unknown>,
          ) => Promise<unknown>;
          getTransportWithKind: (
            catalogItem: unknown,
            targetLocalMcpServerId: string,
            secrets: Record<string, unknown>,
            transportKind: "stdio" | "http",
          ) => Promise<unknown>;
        };

        const runWithLimitSpy = vi.spyOn(
          clientWithInternals.connectionLimiter,
          "runWithLimit",
        );
        const getTransportSpy = vi.spyOn(clientWithInternals, "getTransport");
        const getTransportWithKindSpy = vi.spyOn(
          clientWithInternals,
          "getTransportWithKind",
        );

        try {
          const tool = await ToolModel.createToolIfNotExists({
            name: "github-mcp-server__limiter_http",
            description: "Limiter http tool",
            parameters: {},
            catalogId,
          });

          await AgentToolModel.create(agentId, tool.id, {
            credentialSourceMcpServerId: mcpServerId,
          });

          mockCallTool.mockResolvedValueOnce({
            content: [{ type: "text", text: "Limiter http" }],
            isError: false,
          });

          const toolCall = {
            id: "call_limiter_http",
            name: "github-mcp-server__limiter_http",
            arguments: {},
          };

          const result = await mcpClient.executeToolCall(toolCall, agentId);

          expect(runWithLimitSpy).toHaveBeenCalled();
          expect(runWithLimitSpy.mock.calls[0]?.[1]).toBe(4);
          expect(getTransportSpy).not.toHaveBeenCalled();
          expect(getTransportWithKindSpy).toHaveBeenCalled();

          expect(result).toEqual({
            id: "call_limiter_http",
            content: [{ type: "text", text: "Limiter http" }],
            isError: false,
            name: "github-mcp-server__limiter_http",
          });
        } finally {
          config.features.browserStreamingEnabled = originalBrowserStreaming;
          runWithLimitSpy.mockRestore();
          getTransportSpy.mockRestore();
          getTransportWithKindSpy.mockRestore();
        }
      });
    });

    describe("Streamable HTTP Transport (Local Servers)", () => {
      let localMcpServerId: string;
      let localCatalogId: string;

      beforeEach(async ({ makeUser }) => {
        // Create test user for local MCP servers
        const testUser = await makeUser({
          email: "test-local-mcp@example.com",
        });

        // Create catalog entry for local streamable-http server
        const localCatalog = await InternalMcpCatalogModel.create({
          name: "local-streamable-http-server",
          serverType: "local",
          localConfig: {
            command: "npx",
            arguments: [
              "@modelcontextprotocol/server-everything",
              "streamableHttp",
            ],
            transportType: "streamable-http",
            httpPort: 3001,
            httpPath: "/mcp",
          },
        });
        localCatalogId = localCatalog.id;

        // Create MCP server for local streamable-http testing
        const localMcpServer = await McpServerModel.create({
          name: "local-streamable-http-server",
          catalogId: localCatalogId,
          serverType: "local",
          userId: testUser.id,
        });
        localMcpServerId = localMcpServer.id;

        // Reset mocks
        mockUsesStreamableHttp.mockReset();
        mockGetHttpEndpointUrl.mockReset();
        mockCallTool.mockReset();
        mockConnect.mockReset();
      });

      test("executes tools using HTTP transport for streamable-http servers", async () => {
        // Create tool assigned to agent
        const tool = await ToolModel.createToolIfNotExists({
          name: "local-streamable-http-server__test_tool",
          description: "Test tool",
          parameters: {},
          catalogId: localCatalogId,
        });

        await AgentToolModel.create(agentId, tool.id, {
          executionSourceMcpServerId: localMcpServerId,
        });

        // Mock runtime manager responses
        mockUsesStreamableHttp.mockResolvedValue(true);
        mockGetHttpEndpointUrl.mockReturnValue("http://localhost:30123/mcp");

        // Mock successful tool call
        mockCallTool.mockResolvedValue({
          content: [{ type: "text", text: "Success from HTTP transport" }],
          isError: false,
        });

        const toolCall = {
          id: "call_1",
          name: "local-streamable-http-server__test_tool",
          arguments: { input: "test" },
        };

        const result = await mcpClient.executeToolCall(toolCall, agentId);

        // Verify HTTP transport was detected
        expect(mockUsesStreamableHttp).toHaveBeenCalledWith(localMcpServerId);
        expect(mockGetHttpEndpointUrl).toHaveBeenCalledWith(localMcpServerId);

        // Verify tool was called via HTTP client
        expect(mockCallTool).toHaveBeenCalledWith({
          name: "test_tool", // Server prefix stripped
          arguments: { input: "test" },
        });

        // Verify result

        expect(result).toEqual({
          id: "call_1",
          content: [{ type: "text", text: "Success from HTTP transport" }],
          isError: false,
          name: "local-streamable-http-server__test_tool",
        });
      });

      test("returns error when HTTP endpoint URL is missing", async () => {
        // Create tool assigned to agent
        const tool = await ToolModel.createToolIfNotExists({
          name: "local-streamable-http-server__test_tool",
          description: "Test tool",
          parameters: {},
          catalogId: localCatalogId,
        });

        await AgentToolModel.create(agentId, tool.id, {
          executionSourceMcpServerId: localMcpServerId,
        });

        // Mock runtime manager responses - no endpoint URL
        mockUsesStreamableHttp.mockResolvedValue(true);
        mockGetHttpEndpointUrl.mockReturnValue(undefined);

        const toolCall = {
          id: "call_1",
          name: "local-streamable-http-server__test_tool",
          arguments: { input: "test" },
        };

        const result = await mcpClient.executeToolCall(toolCall, agentId);

        // Verify error result

        expect(result).toEqual({
          id: "call_1",
          content: [
            {
              type: "text",
              text: expect.stringContaining("No HTTP endpoint URL found"),
            },
          ],
          isError: true,
          error: expect.stringContaining("No HTTP endpoint URL found"),
          name: "local-streamable-http-server__test_tool",
        });
      });

      test("applies response modifier template with streamable-http", async () => {
        // Create tool with response modifier template
        const tool = await ToolModel.createToolIfNotExists({
          name: "local-streamable-http-server__formatted_tool",
          description: "Tool with template",
          parameters: {},
          catalogId: localCatalogId,
        });

        await AgentToolModel.create(agentId, tool.id, {
          executionSourceMcpServerId: localMcpServerId,
          responseModifierTemplate:
            'Result: {{{lookup (lookup response 0) "text"}}}',
        });

        // Mock runtime manager responses
        mockUsesStreamableHttp.mockResolvedValue(true);
        mockGetHttpEndpointUrl.mockReturnValue("http://localhost:30123/mcp");

        // Mock tool call response
        mockCallTool.mockResolvedValue({
          content: [{ type: "text", text: "Original content" }],
          isError: false,
        });

        const toolCall = {
          id: "call_1",
          name: "local-streamable-http-server__formatted_tool",
          arguments: {},
        };

        const result = await mcpClient.executeToolCall(toolCall, agentId);

        // Verify template was applied

        expect(result).toEqual({
          id: "call_1",
          content: [{ type: "text", text: "Result: Original content" }],
          isError: false,
          name: "local-streamable-http-server__formatted_tool",
        });
      });

      test("uses K8s attach transport when streamable-http is false", async () => {
        // Create tool assigned to agent
        const tool = await ToolModel.createToolIfNotExists({
          name: "local-streamable-http-server__stdio_tool",
          description: "Tool using K8s attach",
          parameters: {},
          catalogId: localCatalogId,
        });

        await AgentToolModel.create(agentId, tool.id, {
          executionSourceMcpServerId: localMcpServerId,
        });

        // Mock runtime manager to indicate stdio transport (not HTTP)
        mockUsesStreamableHttp.mockResolvedValue(false);

        // Mock K8sDeployment instance
        const mockK8sDeployment = {
          k8sAttachClient: {} as import("@kubernetes/client-node").Attach,
          k8sNamespace: "default",
          deploymentName: "mcp-test-deployment",
          getRunningPodName: vi.fn().mockResolvedValue("mcp-test-pod-actual"),
        };
        mockGetOrLoadDeployment.mockResolvedValue(mockK8sDeployment);

        // Mock the tool call response
        mockCallTool.mockResolvedValue({
          content: [{ type: "text", text: "Success from K8s attach" }],
          isError: false,
        });

        const toolCall = {
          id: "call_1",
          name: "local-streamable-http-server__stdio_tool",
          arguments: { input: "test" },
        };

        const result = await mcpClient.executeToolCall(toolCall, agentId);

        // Verify K8s attach transport was used (not HTTP transport)
        expect(mockUsesStreamableHttp).toHaveBeenCalledWith(localMcpServerId);
        expect(mockGetHttpEndpointUrl).not.toHaveBeenCalled();
        expect(mockGetOrLoadDeployment).toHaveBeenCalledWith(localMcpServerId);
        expect(mockK8sDeployment.getRunningPodName).toHaveBeenCalled();

        // Verify MCP SDK client was used
        expect(mockCallTool).toHaveBeenCalledWith({
          name: "stdio_tool",
          arguments: { input: "test" },
        });

        // Verify result
        expect(result).toMatchObject({
          id: "call_1",
          content: [{ type: "text", text: "Success from K8s attach" }],
          isError: false,
        });
      });

      test("limits stdio concurrency to 1 when browser streaming is enabled", async () => {
        const originalBrowserStreaming =
          config.features.browserStreamingEnabled;
        config.features.browserStreamingEnabled = true;

        const clientWithInternals = mcpClient as unknown as {
          connectionLimiter: {
            runWithLimit: (
              connectionKey: string,
              limit: number,
              fn: () => Promise<unknown>,
            ) => Promise<unknown>;
          };
        };

        const runWithLimitSpy = vi.spyOn(
          clientWithInternals.connectionLimiter,
          "runWithLimit",
        );

        try {
          const tool = await ToolModel.createToolIfNotExists({
            name: "local-streamable-http-server__limiter_stdio",
            description: "Limiter stdio tool",
            parameters: {},
            catalogId: localCatalogId,
          });

          await AgentToolModel.create(agentId, tool.id, {
            executionSourceMcpServerId: localMcpServerId,
          });

          mockUsesStreamableHttp.mockResolvedValue(false);

          const mockK8sDeployment = {
            k8sAttachClient: {} as import("@kubernetes/client-node").Attach,
            k8sNamespace: "default",
            deploymentName: "mcp-test-deployment",
            getRunningPodName: vi.fn().mockResolvedValue("mcp-test-pod-actual"),
          };
          mockGetOrLoadDeployment.mockResolvedValue(mockK8sDeployment);

          mockCallTool.mockResolvedValue({
            content: [{ type: "text", text: "Limiter stdio" }],
            isError: false,
          });

          const toolCall = {
            id: "call_limiter_stdio",
            name: "local-streamable-http-server__limiter_stdio",
            arguments: {},
          };

          const result = await mcpClient.executeToolCall(toolCall, agentId);

          expect(runWithLimitSpy).toHaveBeenCalled();
          expect(runWithLimitSpy.mock.calls[0]?.[1]).toBe(1);

          expect(result).toMatchObject({
            id: "call_limiter_stdio",
            content: [{ type: "text", text: "Limiter stdio" }],
            isError: false,
          });
        } finally {
          config.features.browserStreamingEnabled = originalBrowserStreaming;
          runWithLimitSpy.mockRestore();
        }
      });

      test("strips catalogName prefix when mcpServerName includes userId suffix (Issue #1179)", async () => {
        // Create tool with catalogName prefix (how local server tools are actually created)
        const tool = await ToolModel.createToolIfNotExists({
          name: "local-streamable-http-server__prefix_test_tool",
          description: "Tool for testing prefix stripping fallback",
          parameters: {},
          catalogId: localCatalogId,
        });

        await AgentToolModel.create(agentId, tool.id, {
          executionSourceMcpServerId: localMcpServerId,
        });

        // Mock runtime manager responses
        mockUsesStreamableHttp.mockResolvedValue(true);
        mockGetHttpEndpointUrl.mockReturnValue("http://localhost:30123/mcp");

        // Mock successful tool call
        mockCallTool.mockResolvedValue({
          content: [{ type: "text", text: "Prefix stripping works!" }],
          isError: false,
        });

        const toolCall = {
          id: "call_prefix_test",
          name: "local-streamable-http-server__prefix_test_tool",
          arguments: {},
        };

        const result = await mcpClient.executeToolCall(toolCall, agentId);

        // Verify the tool was called with just the tool name (stripped using catalogName)
        expect(mockCallTool).toHaveBeenCalledWith({
          name: "prefix_test_tool",
          arguments: {},
        });

        expect(result).toMatchObject({
          id: "call_prefix_test",
          content: [{ type: "text", text: "Prefix stripping works!" }],
          isError: false,
        });
      });

      test("falls back to stripping mcpServerName when catalogName prefix is missing", async () => {
        // Create catalog with different name to ensure catalog prefix doesn't match
        const otherCatalog = await InternalMcpCatalogModel.create({
          name: "other-catalog",
          serverType: "local",
        });

        const tool = await ToolModel.createToolIfNotExists({
          name: "custom-server-name__fallback_tool",
          description: "Tool using server name prefix",
          parameters: {},
          catalogId: otherCatalog.id,
        });

        // Ensure mcpServerName is 'custom-server-name' for this test
        await McpServerModel.update(localMcpServerId, {
          name: "custom-server-name",
        });

        await AgentToolModel.create(agentId, tool.id, {
          executionSourceMcpServerId: localMcpServerId,
        });

        mockUsesStreamableHttp.mockResolvedValue(true);
        mockGetHttpEndpointUrl.mockReturnValue("http://localhost:30123/mcp");

        mockCallTool.mockResolvedValue({
          content: [{ type: "text", text: "Fallback works!" }],
          isError: false,
        });

        const toolCall = {
          id: "call_fallback_test",
          name: "custom-server-name__fallback_tool",
          arguments: {},
        };

        const result = await mcpClient.executeToolCall(toolCall, agentId);

        // Verify stripping worked using mcpServerName fallback
        expect(mockCallTool).toHaveBeenCalledWith({
          name: "fallback_tool",
          arguments: {},
        });

        expect(result).toMatchObject({
          id: "call_fallback_test",
          content: [{ type: "text", text: "Fallback works!" }],
          isError: false,
        });
      });

      test("does not modify tool name when no prefix matches (Identity Case)", async () => {
        // Create tool with a name that doesn't follow the prefix convention
        const tool = await ToolModel.createToolIfNotExists({
          name: "standalone_tool_name",
          description: "Tool without standard prefix",
          parameters: {},
          catalogId: localCatalogId,
        });

        await AgentToolModel.create(agentId, tool.id, {
          executionSourceMcpServerId: localMcpServerId,
        });

        mockUsesStreamableHttp.mockResolvedValue(true);
        mockGetHttpEndpointUrl.mockReturnValue("http://localhost:30123/mcp");

        mockCallTool.mockResolvedValue({
          content: [{ type: "text", text: "Identity works!" }],
          isError: false,
        });

        const toolCall = {
          id: "call_identity_test",
          name: "standalone_tool_name",
          arguments: {},
        };

        const result = await mcpClient.executeToolCall(toolCall, agentId);

        // Verify the tool name was not mangled since no prefix matched
        expect(mockCallTool).toHaveBeenCalledWith({
          name: "standalone_tool_name",
          arguments: {},
        });

        expect(result).toMatchObject({
          id: "call_identity_test",
          content: [{ type: "text", text: "Identity works!" }],
          isError: false,
        });
      });
    });

    describe("createErrorResult includes error in content", () => {
      test("error results include error message in content array", async () => {
        const toolCall = {
          id: "call_error_content",
          name: "non_existent_tool",
          arguments: {},
        };

        const result = await mcpClient.executeToolCall(toolCall, agentId);

        expect(result).toMatchObject({
          id: "call_error_content",
          isError: true,
          error: expect.any(String),
        });
        // content should be an array with the error text, not null
        expect(result?.content).toEqual([
          { type: "text", text: expect.any(String) },
        ]);
      });
    });

    describe("Dynamic credential auth link", () => {
      test("returns install URL when no server found for user with dynamic credential", async ({
        makeUser,
      }) => {
        const testUser = await makeUser({ email: "dynauth@example.com" });

        // Create a separate catalog + tool for dynamic credential testing
        const dynCatalog = await InternalMcpCatalogModel.create({
          name: "jira-mcp-server",
          serverType: "remote",
          serverUrl: "https://mcp.atlassian.com/v1/mcp",
        });

        const tool = await ToolModel.createToolIfNotExists({
          name: "jira-mcp-server__search_issues",
          description: "Search Jira issues",
          parameters: {},
          catalogId: dynCatalog.id,
        });

        // Assign tool to agent with dynamic team credential enabled
        await AgentToolModel.createOrUpdateCredentials(
          agentId,
          tool.id,
          null, // no credentialSourceMcpServerId
          null, // no executionSourceMcpServerId
          true, // useDynamicTeamCredential
        );

        const toolCall = {
          id: "call_dynauth",
          name: "jira-mcp-server__search_issues",
          arguments: { query: "test" },
        };

        const result = await mcpClient.executeToolCall(toolCall, agentId, {
          tokenId: "test-token",
          teamId: null,
          isOrganizationToken: false,
          userId: testUser.id,
        });

        // Should return an error with the install URL
        expect(result).toMatchObject({
          isError: true,
        });
        expect(result?.error).toContain(
          `Authentication required for "jira-mcp-server"`,
        );
        expect(result?.error).toContain(`user: ${testUser.id}`);
        expect(result?.error).toContain(
          `${config.frontendBaseUrl}${MCP_CATALOG_INSTALL_PATH}?install=${dynCatalog.id}`,
        );
        expect(result?.error).toContain(
          "Once you have completed authentication, retry this tool call.",
        );

        // Content should also contain the error message
        expect(result?.content).toEqual([
          { type: "text", text: result?.error },
        ]);
      });

      test("returns install URL with team context when team token has no server", async ({
        makeUser,
        makeTeam,
        makeOrganization,
      }) => {
        const org = await makeOrganization();
        const testUser = await makeUser({ email: "teamauth@example.com" });
        const team = await makeTeam(org.id, testUser.id, {
          name: "Test Team",
        });

        // Create catalog + tool
        const dynCatalog = await InternalMcpCatalogModel.create({
          name: "jira-team-server",
          serverType: "remote",
          serverUrl: "https://mcp.atlassian.com/v1/mcp",
        });

        const tool = await ToolModel.createToolIfNotExists({
          name: "jira-team-server__get_issue",
          description: "Get Jira issue",
          parameters: {},
          catalogId: dynCatalog.id,
        });

        await AgentToolModel.createOrUpdateCredentials(
          agentId,
          tool.id,
          null,
          null,
          true,
        );

        const toolCall = {
          id: "call_team_dynauth",
          name: "jira-team-server__get_issue",
          arguments: { key: "PROJ-1" },
        };

        const result = await mcpClient.executeToolCall(toolCall, agentId, {
          tokenId: "team-token",
          teamId: team.id,
          isOrganizationToken: false,
        });

        expect(result).toMatchObject({
          isError: true,
        });
        expect(result?.error).toContain(`team: ${team.id}`);
        expect(result?.error).toContain(
          `${MCP_CATALOG_INSTALL_PATH}?install=${dynCatalog.id}`,
        );
      });

      test("returns auth-required error with team context when servers exist but no owner is in team", async ({
        makeUser,
        makeTeam,
        makeOrganization,
      }) => {
        const org = await makeOrganization();
        // Two users: one owns the server, the other is in the team
        const serverOwner = await makeUser({
          email: "server-owner@example.com",
        });
        const teamMember = await makeUser({
          email: "team-member@example.com",
        });
        const team = await makeTeam(org.id, teamMember.id, {
          name: "Marketing Team",
        });
        // serverOwner is NOT added to the team

        // Create catalog + server owned by serverOwner
        const dynCatalog = await InternalMcpCatalogModel.create({
          name: "slack-mcp-server",
          serverType: "remote",
          serverUrl: "https://mcp.slack.com/v1/mcp",
        });

        const ownerSecret = await secretManager().createSecret(
          { access_token: "owner-slack-token" },
          "slack-owner-secret",
        );

        await McpServerModel.create({
          name: "slack-mcp-server",
          catalogId: dynCatalog.id,
          secretId: ownerSecret.id,
          serverType: "remote",
          ownerId: serverOwner.id,
        });

        const tool = await ToolModel.createToolIfNotExists({
          name: "slack-mcp-server__send_message",
          description: "Send a Slack message",
          parameters: {},
          catalogId: dynCatalog.id,
        });

        await AgentToolModel.createOrUpdateCredentials(
          agentId,
          tool.id,
          null,
          null,
          true,
        );

        const toolCall = {
          id: "call_team_no_member_cred",
          name: "slack-mcp-server__send_message",
          arguments: { channel: "#general", text: "hello" },
        };

        // Call with teamMember's team token - serverOwner is NOT in this team
        const result = await mcpClient.executeToolCall(toolCall, agentId, {
          tokenId: "team-token-no-cred",
          teamId: team.id,
          isOrganizationToken: false,
        });

        expect(result).toMatchObject({ isError: true });
        expect(result?.error).toContain(
          `Authentication required for "slack-mcp-server"`,
        );
        expect(result?.error).toContain(`team: ${team.id}`);
        expect(result?.error).toContain(
          `${config.frontendBaseUrl}${MCP_CATALOG_INSTALL_PATH}?install=${dynCatalog.id}`,
        );
        expect(result?.error).toContain(
          "Once you have completed authentication, retry this tool call.",
        );
        expect(result?.content).toEqual([
          { type: "text", text: result?.error },
        ]);
      });
    });

    describe("Stale session retry", () => {
      let localMcpServerId: string;
      let localCatalogId: string;

      beforeEach(async ({ makeUser }) => {
        const testUser = await makeUser({
          email: "test-stale-session@example.com",
        });

        const localCatalog = await InternalMcpCatalogModel.create({
          name: "stale-session-server",
          serverType: "local",
          localConfig: {
            dockerImage: "mcr.microsoft.com/playwright/mcp",
            transportType: "streamable-http",
            httpPort: 8080,
          },
        });
        localCatalogId = localCatalog.id;

        const localMcpServer = await McpServerModel.create({
          name: "stale-session-server",
          catalogId: localCatalogId,
          serverType: "local",
          userId: testUser.id,
        });
        localMcpServerId = localMcpServer.id;

        mockUsesStreamableHttp.mockReset();
        mockGetHttpEndpointUrl.mockReset();
        mockCallTool.mockReset();
        mockConnect.mockReset();
        mockPing.mockReset();

        // Make StreamableHTTPClientTransport mock store sessionId from options
        // so getOrCreateClient can detect stored sessions via `transport.sessionId`
        const { StreamableHTTPClientTransport } = await import(
          "@modelcontextprotocol/sdk/client/streamableHttp.js"
        );
        vi.mocked(StreamableHTTPClientTransport).mockImplementation(function (
          this: { sessionId?: string },
          _url: URL,
          options?: { sessionId?: string },
        ) {
          this.sessionId = options?.sessionId;
        } as
          // biome-ignore lint/suspicious/noExplicitAny: cast required for mock constructor
          any);
      });

      test("uses stored endpoint URL when resuming HTTP session", async () => {
        const { StreamableHTTPClientTransport } = await import(
          "@modelcontextprotocol/sdk/client/streamableHttp.js"
        );

        const tool = await ToolModel.createToolIfNotExists({
          name: "stale-session-server__stored_endpoint",
          description: "Test tool",
          parameters: {},
          catalogId: localCatalogId,
        });

        await AgentToolModel.create(agentId, tool.id, {
          executionSourceMcpServerId: localMcpServerId,
        });

        mockUsesStreamableHttp.mockResolvedValue(true);
        mockGetHttpEndpointUrl.mockReturnValue("http://service-url:8080/mcp");
        vi.spyOn(
          McpHttpSessionModel,
          "findRecordByConnectionKey",
        ).mockResolvedValueOnce({
          sessionId: "stored-session-id",
          sessionEndpointUrl: "http://10.42.1.88:8080/mcp",
          sessionEndpointPodName: "mcp-stale-session-server-abc123",
        });

        mockConnect.mockResolvedValue(undefined);
        mockCallTool.mockResolvedValue({
          content: [{ type: "text", text: "ok" }],
          isError: false,
        });

        const result = await mcpClient.executeToolCall(
          {
            id: "call_stored_endpoint",
            name: "stale-session-server__stored_endpoint",
            arguments: {},
          },
          agentId,
          undefined,
          { conversationId: "conv-1" },
        );

        expect(result.isError).toBe(false);
        expect(vi.mocked(StreamableHTTPClientTransport)).toHaveBeenCalledWith(
          new URL("http://10.42.1.88:8080/mcp"),
          expect.objectContaining({ sessionId: "stored-session-id" }),
        );
      });

      test("retries with fresh session when stale session is detected", async () => {
        const tool = await ToolModel.createToolIfNotExists({
          name: "stale-session-server__test_tool",
          description: "Test tool",
          parameters: {},
          catalogId: localCatalogId,
        });

        await AgentToolModel.create(agentId, tool.id, {
          executionSourceMcpServerId: localMcpServerId,
        });

        mockUsesStreamableHttp.mockResolvedValue(true);
        mockGetHttpEndpointUrl.mockReturnValue("http://localhost:30123/mcp");

        // First call: findRecordByConnectionKey returns a stored session
        // Second call (retry): findRecordByConnectionKey returns null (session was deleted)
        vi.spyOn(McpHttpSessionModel, "findRecordByConnectionKey")
          .mockResolvedValueOnce({
            sessionId: "stale-session-id",
            sessionEndpointUrl: null,
            sessionEndpointPodName: null,
          })
          .mockResolvedValueOnce(null);

        // First connect fails (stale session), second connect succeeds
        mockConnect
          .mockRejectedValueOnce(new Error("Session not found"))
          .mockResolvedValueOnce(undefined);

        mockCallTool.mockResolvedValue({
          content: [{ type: "text", text: "Success after retry" }],
          isError: false,
        });

        const toolCall = {
          id: "call_stale_retry",
          name: "stale-session-server__test_tool",
          arguments: {},
        };

        const result = await mcpClient.executeToolCall(toolCall, agentId);

        // Should succeed after retry
        expect(result).toMatchObject({
          id: "call_stale_retry",
          content: [{ type: "text", text: "Success after retry" }],
          isError: false,
        });

        // deleteStaleSession should have been called
        expect(McpHttpSessionModel.deleteStaleSession).toHaveBeenCalled();

        // connect should have been called twice (first stale, then fresh)
        expect(mockConnect).toHaveBeenCalledTimes(2);
      });

      test("does not retry more than once for stale sessions", async () => {
        const tool = await ToolModel.createToolIfNotExists({
          name: "stale-session-server__no_double_retry",
          description: "Test tool",
          parameters: {},
          catalogId: localCatalogId,
        });

        await AgentToolModel.create(agentId, tool.id, {
          executionSourceMcpServerId: localMcpServerId,
        });

        mockUsesStreamableHttp.mockResolvedValue(true);
        mockGetHttpEndpointUrl.mockReturnValue("http://localhost:30123/mcp");

        // Both calls return stored session IDs
        vi.spyOn(McpHttpSessionModel, "findRecordByConnectionKey")
          .mockResolvedValueOnce({
            sessionId: "stale-session-1",
            sessionEndpointUrl: null,
            sessionEndpointPodName: null,
          })
          .mockResolvedValueOnce({
            sessionId: "stale-session-2",
            sessionEndpointUrl: null,
            sessionEndpointPodName: null,
          });

        // Both connect attempts fail
        mockConnect
          .mockRejectedValueOnce(new Error("Session not found"))
          .mockRejectedValueOnce(new Error("Session not found again"));

        const toolCall = {
          id: "call_no_double_retry",
          name: "stale-session-server__no_double_retry",
          arguments: {},
        };

        const result = await mcpClient.executeToolCall(toolCall, agentId);

        // Should return error (no infinite retry loop)
        expect(result).toMatchObject({
          id: "call_no_double_retry",
          isError: true,
        });
      });

      test("retries when callTool throws StreamableHTTPError with 'Session not found'", async () => {
        const { StreamableHTTPError } = await import(
          "@modelcontextprotocol/sdk/client/streamableHttp.js"
        );

        const tool = await ToolModel.createToolIfNotExists({
          name: "stale-session-server__http_error_retry",
          description: "Test tool",
          parameters: {},
          catalogId: localCatalogId,
        });

        await AgentToolModel.create(agentId, tool.id, {
          executionSourceMcpServerId: localMcpServerId,
        });

        mockUsesStreamableHttp.mockResolvedValue(true);
        mockGetHttpEndpointUrl.mockReturnValue("http://localhost:30123/mcp");

        // First call: findRecordByConnectionKey returns a stored session
        // Second call (retry): findRecordByConnectionKey returns null (session was deleted)
        vi.spyOn(McpHttpSessionModel, "findRecordByConnectionKey")
          .mockResolvedValueOnce({
            sessionId: "stale-session-id",
            sessionEndpointUrl: null,
            sessionEndpointPodName: null,
          })
          .mockResolvedValueOnce(null);

        // connect() succeeds both times (SDK skips initialization for resumed sessions)
        mockConnect.mockResolvedValue(undefined);

        // First callTool throws StreamableHTTPError "Session not found",
        // second callTool succeeds (after retry with fresh session)
        mockCallTool
          .mockRejectedValueOnce(
            new StreamableHTTPError(
              404,
              "Error POSTing to endpoint: Session not found",
            ),
          )
          .mockResolvedValueOnce({
            content: [{ type: "text", text: "Success after retry" }],
            isError: false,
          });

        const toolCall = {
          id: "call_http_error_retry",
          name: "stale-session-server__http_error_retry",
          arguments: {},
        };

        const result = await mcpClient.executeToolCall(toolCall, agentId);

        // Should succeed after retry
        expect(result).toMatchObject({
          id: "call_http_error_retry",
          content: [{ type: "text", text: "Success after retry" }],
          isError: false,
        });

        // deleteStaleSession should have been called
        expect(McpHttpSessionModel.deleteStaleSession).toHaveBeenCalled();

        // callTool should have been called twice (first stale, then fresh)
        expect(mockCallTool).toHaveBeenCalledTimes(2);
      });
    });

    describe("Tool name casing resolution", () => {
      test("resolves camelCase tool name from remote server", async () => {
        // Create tool with lowercased name (as slugifyName produces)
        const tool = await ToolModel.createToolIfNotExists({
          name: "github-mcp-server__getuserinfo",
          description: "Get user info",
          parameters: { type: "object", properties: {} },
          catalogId,
        });

        await AgentToolModel.create(agentId, tool.id, {
          credentialSourceMcpServerId: mcpServerId,
        });

        // Remote server reports tool with camelCase name
        mockListTools.mockResolvedValueOnce({
          tools: [
            { name: "getUserInfo", inputSchema: { type: "object" } },
            { name: "searchIssues", inputSchema: { type: "object" } },
          ],
        });

        mockCallTool.mockResolvedValueOnce({
          content: [{ type: "text", text: "success" }],
          isError: false,
        });

        const toolCall = {
          id: "call_casing_1",
          name: "github-mcp-server__getuserinfo",
          arguments: {},
        };

        await mcpClient.executeToolCall(toolCall, agentId);

        // Verify callTool was called with the original camelCase name
        expect(mockCallTool).toHaveBeenCalledWith({
          name: "getUserInfo",
          arguments: {},
        });
      });

      test("resolves PascalCase tool name from remote server", async () => {
        const tool = await ToolModel.createToolIfNotExists({
          name: "github-mcp-server__getrepository",
          description: "Get repository",
          parameters: { type: "object", properties: {} },
          catalogId,
        });

        await AgentToolModel.create(agentId, tool.id, {
          credentialSourceMcpServerId: mcpServerId,
        });

        // Remote server reports tool with PascalCase name
        mockListTools.mockResolvedValueOnce({
          tools: [{ name: "GetRepository", inputSchema: { type: "object" } }],
        });

        mockCallTool.mockResolvedValueOnce({
          content: [{ type: "text", text: "success" }],
          isError: false,
        });

        const toolCall = {
          id: "call_casing_2",
          name: "github-mcp-server__getrepository",
          arguments: {},
        };

        await mcpClient.executeToolCall(toolCall, agentId);

        expect(mockCallTool).toHaveBeenCalledWith({
          name: "GetRepository",
          arguments: {},
        });
      });

      test("falls back to stripped name when listTools fails", async () => {
        const tool = await ToolModel.createToolIfNotExists({
          name: "github-mcp-server__sometool",
          description: "Some tool",
          parameters: { type: "object", properties: {} },
          catalogId,
        });

        await AgentToolModel.create(agentId, tool.id, {
          credentialSourceMcpServerId: mcpServerId,
        });

        // listTools throws an error
        mockListTools.mockRejectedValueOnce(new Error("Connection timeout"));

        mockCallTool.mockResolvedValueOnce({
          content: [{ type: "text", text: "success" }],
          isError: false,
        });

        const toolCall = {
          id: "call_casing_3",
          name: "github-mcp-server__sometool",
          arguments: {},
        };

        await mcpClient.executeToolCall(toolCall, agentId);

        // Falls back to the lowercased stripped name
        expect(mockCallTool).toHaveBeenCalledWith({
          name: "sometool",
          arguments: {},
        });
      });

      test("falls back to stripped name when tool not in server list", async () => {
        const tool = await ToolModel.createToolIfNotExists({
          name: "github-mcp-server__missingtool",
          description: "Missing tool",
          parameters: { type: "object", properties: {} },
          catalogId,
        });

        await AgentToolModel.create(agentId, tool.id, {
          credentialSourceMcpServerId: mcpServerId,
        });

        // Server returns tools, but not the one we're looking for
        mockListTools.mockResolvedValueOnce({
          tools: [{ name: "otherTool", inputSchema: { type: "object" } }],
        });

        mockCallTool.mockResolvedValueOnce({
          content: [{ type: "text", text: "success" }],
          isError: false,
        });

        const toolCall = {
          id: "call_casing_4",
          name: "github-mcp-server__missingtool",
          arguments: {},
        };

        await mcpClient.executeToolCall(toolCall, agentId);

        // Falls back to stripped name since no match found
        expect(mockCallTool).toHaveBeenCalledWith({
          name: "missingtool",
          arguments: {},
        });
      });

      test("preserves already-correct lowercase tool name", async () => {
        const tool = await ToolModel.createToolIfNotExists({
          name: "github-mcp-server__search_issues",
          description: "Search issues",
          parameters: { type: "object", properties: {} },
          catalogId,
        });

        await AgentToolModel.create(agentId, tool.id, {
          credentialSourceMcpServerId: mcpServerId,
        });

        // Server also uses lowercase (snake_case)
        mockListTools.mockResolvedValueOnce({
          tools: [{ name: "search_issues", inputSchema: { type: "object" } }],
        });

        mockCallTool.mockResolvedValueOnce({
          content: [{ type: "text", text: "success" }],
          isError: false,
        });

        const toolCall = {
          id: "call_casing_5",
          name: "github-mcp-server__search_issues",
          arguments: {},
        };

        await mcpClient.executeToolCall(toolCall, agentId);

        expect(mockCallTool).toHaveBeenCalledWith({
          name: "search_issues",
          arguments: {},
        });
      });
    });

    describe("Credential resolution priority (JWKS auth)", () => {
      test("JWKS auth with upstream credentials uses upstream token, not JWT (remote server)", async () => {
        // The existing setup creates a remote server with access_token: "test-github-token-123"
        const tool = await ToolModel.createToolIfNotExists({
          name: "github-mcp-server__jwks_cred_test",
          description: "Test JWKS credential priority",
          parameters: {},
          catalogId,
        });

        await AgentToolModel.create(agentId, tool.id, {
          credentialSourceMcpServerId: mcpServerId,
        });

        mockCallTool.mockResolvedValueOnce({
          content: [{ type: "text", text: "GitHub response" }],
          isError: false,
        });

        const toolCall = {
          id: "call_jwks_cred",
          name: "github-mcp-server__jwks_cred_test",
          arguments: {},
        };

        // Call with JWKS tokenAuth — the gateway has both the JWT and upstream credentials
        await mcpClient.executeToolCall(toolCall, agentId, {
          tokenId: "ext-token",
          teamId: null,
          isOrganizationToken: false,
          isExternalIdp: true,
          rawToken: "keycloak-jwt-should-not-be-forwarded",
          userId: "ext-user-123",
        });

        // Verify the transport was created with the upstream GitHub token, NOT the Keycloak JWT
        const { StreamableHTTPClientTransport } = await import(
          "@modelcontextprotocol/sdk/client/streamableHttp.js"
        );
        const transportCalls = vi.mocked(StreamableHTTPClientTransport).mock
          .calls;
        expect(transportCalls.length).toBeGreaterThan(0);
        const lastCall = transportCalls[transportCalls.length - 1];
        const headers = lastCall[1]?.requestInit?.headers as Headers;
        expect(headers.get("authorization")).toBe(
          "Bearer test-github-token-123",
        );
      });

      test("JWKS auth without upstream credentials falls back to JWT propagation (remote server)", async () => {
        // Create a remote server WITHOUT credentials
        const noCredCatalog = await InternalMcpCatalogModel.create({
          name: "jwks-echo-server",
          serverType: "remote",
          serverUrl: "https://jwks-echo.example.com/mcp",
        });

        const noCredServer = await McpServerModel.create({
          name: "jwks-echo-server",
          catalogId: noCredCatalog.id,
          serverType: "remote",
          // No secretId — this server has no upstream credentials
        });

        const tool = await ToolModel.createToolIfNotExists({
          name: "jwks-echo-server__get_info",
          description: "Get info with JWT passthrough",
          parameters: {},
          catalogId: noCredCatalog.id,
        });

        await AgentToolModel.create(agentId, tool.id, {
          credentialSourceMcpServerId: noCredServer.id,
        });

        mockCallTool.mockResolvedValueOnce({
          content: [{ type: "text", text: "JWT validated" }],
          isError: false,
        });

        const toolCall = {
          id: "call_jwks_passthrough",
          name: "jwks-echo-server__get_info",
          arguments: {},
        };

        await mcpClient.executeToolCall(toolCall, agentId, {
          tokenId: "ext-token",
          teamId: null,
          isOrganizationToken: false,
          isExternalIdp: true,
          rawToken: "keycloak-jwt-for-passthrough",
          userId: "ext-user-456",
        });

        // Verify the transport was created with the Keycloak JWT (fallback)
        const { StreamableHTTPClientTransport } = await import(
          "@modelcontextprotocol/sdk/client/streamableHttp.js"
        );
        const transportCalls = vi.mocked(StreamableHTTPClientTransport).mock
          .calls;
        expect(transportCalls.length).toBeGreaterThan(0);
        const lastCall = transportCalls[transportCalls.length - 1];
        const headers = lastCall[1]?.requestInit?.headers as Headers;
        expect(headers.get("authorization")).toBe(
          "Bearer keycloak-jwt-for-passthrough",
        );
      });

      test("JWKS auth with raw_access_token uses raw token (remote server)", async () => {
        // Create a server with raw_access_token instead of access_token
        const rawTokenCatalog = await InternalMcpCatalogModel.create({
          name: "raw-token-server",
          serverType: "remote",
          serverUrl: "https://raw-token.example.com/mcp",
        });

        const rawTokenSecret = await secretManager().createSecret(
          { raw_access_token: "Token github_pat_raw_abc123" },
          "raw-token-secret",
        );

        const rawTokenServer = await McpServerModel.create({
          name: "raw-token-server",
          secretId: rawTokenSecret.id,
          catalogId: rawTokenCatalog.id,
          serverType: "remote",
        });

        const tool = await ToolModel.createToolIfNotExists({
          name: "raw-token-server__list_items",
          description: "List items with raw token",
          parameters: {},
          catalogId: rawTokenCatalog.id,
        });

        await AgentToolModel.create(agentId, tool.id, {
          credentialSourceMcpServerId: rawTokenServer.id,
        });

        mockCallTool.mockResolvedValueOnce({
          content: [{ type: "text", text: "Raw token response" }],
          isError: false,
        });

        const toolCall = {
          id: "call_jwks_raw",
          name: "raw-token-server__list_items",
          arguments: {},
        };

        await mcpClient.executeToolCall(toolCall, agentId, {
          tokenId: "ext-token",
          teamId: null,
          isOrganizationToken: false,
          isExternalIdp: true,
          rawToken: "keycloak-jwt-should-not-be-used",
          userId: "ext-user-789",
        });

        // Verify raw_access_token was used (not the JWT)
        const { StreamableHTTPClientTransport } = await import(
          "@modelcontextprotocol/sdk/client/streamableHttp.js"
        );
        const transportCalls = vi.mocked(StreamableHTTPClientTransport).mock
          .calls;
        expect(transportCalls.length).toBeGreaterThan(0);
        const lastCall = transportCalls[transportCalls.length - 1];
        const headers = lastCall[1]?.requestInit?.headers as Headers;
        expect(headers.get("authorization")).toBe(
          "Token github_pat_raw_abc123",
        );
      });

      test("non-JWKS auth (OAuth/Bearer) still uses upstream credentials", async () => {
        const tool = await ToolModel.createToolIfNotExists({
          name: "github-mcp-server__oauth_cred_test",
          description: "Test OAuth credential behavior",
          parameters: {},
          catalogId,
        });

        await AgentToolModel.create(agentId, tool.id, {
          credentialSourceMcpServerId: mcpServerId,
        });

        mockCallTool.mockResolvedValueOnce({
          content: [{ type: "text", text: "OAuth response" }],
          isError: false,
        });

        const toolCall = {
          id: "call_oauth_cred",
          name: "github-mcp-server__oauth_cred_test",
          arguments: {},
        };

        // Call with standard (non-JWKS) tokenAuth — isExternalIdp is false
        await mcpClient.executeToolCall(toolCall, agentId, {
          tokenId: "user-token",
          teamId: null,
          isOrganizationToken: false,
          isUserToken: true,
          userId: "user-123",
        });

        // Verify upstream credentials are used (unchanged behavior)
        const { StreamableHTTPClientTransport } = await import(
          "@modelcontextprotocol/sdk/client/streamableHttp.js"
        );
        const transportCalls = vi.mocked(StreamableHTTPClientTransport).mock
          .calls;
        expect(transportCalls.length).toBeGreaterThan(0);
        const lastCall = transportCalls[transportCalls.length - 1];
        const headers = lastCall[1]?.requestInit?.headers as Headers;
        expect(headers.get("authorization")).toBe(
          "Bearer test-github-token-123",
        );
      });

      test("JWKS auth with dynamic credentials resolves server and uses its credentials", async ({
        makeUser,
      }) => {
        const testUser = await makeUser({
          email: "jwks-dynamic@example.com",
        });

        // Create a catalog with dynamic credentials enabled
        const dynCatalog = await InternalMcpCatalogModel.create({
          name: "github-dynamic",
          serverType: "remote",
          serverUrl: "https://api.github.com/mcp",
        });

        // Create a server owned by the test user with credentials
        const dynSecret = await secretManager().createSecret(
          { access_token: "ghp_dynamic_user_token" },
          "github-dynamic-secret",
        );

        await McpServerModel.create({
          name: "github-dynamic",
          catalogId: dynCatalog.id,
          secretId: dynSecret.id,
          serverType: "remote",
          ownerId: testUser.id,
        });

        const tool = await ToolModel.createToolIfNotExists({
          name: "github-dynamic__list_repos",
          description: "List repos",
          parameters: {},
          catalogId: dynCatalog.id,
        });

        // Enable dynamic credential resolution
        await AgentToolModel.createOrUpdateCredentials(
          agentId,
          tool.id,
          null,
          null,
          true, // useDynamicTeamCredential
        );

        mockCallTool.mockResolvedValueOnce({
          content: [{ type: "text", text: "Dynamic response" }],
          isError: false,
        });

        const toolCall = {
          id: "call_jwks_dynamic",
          name: "github-dynamic__list_repos",
          arguments: {},
        };

        // Call with JWKS tokenAuth, userId matching the server owner
        await mcpClient.executeToolCall(toolCall, agentId, {
          tokenId: "ext-dynamic-token",
          teamId: null,
          isOrganizationToken: false,
          isExternalIdp: true,
          rawToken: "keycloak-jwt-not-for-github",
          userId: testUser.id,
        });

        // Verify the dynamically resolved server credentials were used
        const { StreamableHTTPClientTransport } = await import(
          "@modelcontextprotocol/sdk/client/streamableHttp.js"
        );
        const transportCalls = vi.mocked(StreamableHTTPClientTransport).mock
          .calls;
        expect(transportCalls.length).toBeGreaterThan(0);
        const lastCall = transportCalls[transportCalls.length - 1];
        const headers = lastCall[1]?.requestInit?.headers as Headers;
        expect(headers.get("authorization")).toBe(
          "Bearer ghp_dynamic_user_token",
        );
      });

      test("JWKS auth with local streamable-http server uses upstream credentials over JWT", async ({
        makeUser,
      }) => {
        const testUser = await makeUser({
          email: "jwks-local@example.com",
        });

        // Create local server with credentials
        const localCatalog = await InternalMcpCatalogModel.create({
          name: "local-github-jwks",
          serverType: "local",
          localConfig: {
            command: "npx",
            arguments: ["github-mcp-server"],
            transportType: "streamable-http",
            httpPort: 3001,
            httpPath: "/mcp",
          },
        });

        const localSecret = await secretManager().createSecret(
          { access_token: "ghp_local_server_token" },
          "local-github-secret",
        );

        const localServer = await McpServerModel.create({
          name: "local-github-jwks",
          catalogId: localCatalog.id,
          secretId: localSecret.id,
          serverType: "local",
          userId: testUser.id,
        });

        const tool = await ToolModel.createToolIfNotExists({
          name: "local-github-jwks__get_repos",
          description: "Get repos",
          parameters: {},
          catalogId: localCatalog.id,
        });

        await AgentToolModel.create(agentId, tool.id, {
          executionSourceMcpServerId: localServer.id,
        });

        mockUsesStreamableHttp.mockResolvedValue(true);
        mockGetHttpEndpointUrl.mockReturnValue("http://localhost:30456/mcp");

        mockCallTool.mockResolvedValueOnce({
          content: [{ type: "text", text: "Local GitHub response" }],
          isError: false,
        });

        const toolCall = {
          id: "call_jwks_local",
          name: "local-github-jwks__get_repos",
          arguments: {},
        };

        await mcpClient.executeToolCall(toolCall, agentId, {
          tokenId: "ext-local-token",
          teamId: null,
          isOrganizationToken: false,
          isExternalIdp: true,
          rawToken: "keycloak-jwt-not-for-local",
          userId: "ext-user-local",
        });

        // Verify local server used upstream credentials, not JWT
        const { StreamableHTTPClientTransport } = await import(
          "@modelcontextprotocol/sdk/client/streamableHttp.js"
        );
        const transportCalls = vi.mocked(StreamableHTTPClientTransport).mock
          .calls;
        expect(transportCalls.length).toBeGreaterThan(0);
        const lastCall = transportCalls[transportCalls.length - 1];
        const headers = lastCall[1]?.requestInit?.headers as Headers;
        expect(headers.get("authorization")).toBe(
          "Bearer ghp_local_server_token",
        );
      });
    });
  });
});
