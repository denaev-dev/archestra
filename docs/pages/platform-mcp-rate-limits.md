---
title: "Rate Limits"
category: MCP Gateway
order: 5
description: "Per-server and per-tool rate limiting for MCP tool calls"
lastUpdated: 2026-03-02
---

<!--
Check ../docs_writer_prompt.md before changing this file.
-->

MCP Rate Limits control how frequently tool calls can be made through the MCP Gateway. Limits use a sliding window counter and are scoped per agent or MCP gateway.

## Limit Types

- **Per Server** (`mcp_server_calls`) — limits total calls to any tool on a given MCP server within a time window.
- **Per Tool** (`tool_calls`) — limits calls to a specific tool on a given MCP server within a time window.

Multiple limits can apply to the same call (e.g., both a server-level and tool-level limit). All applicable limits are checked — the first exceeded limit triggers the rejection.

## Configuration

Navigate to **MCP & Tools > MCP Rate Limits** and click **Add Rate Limit**. Each limit requires:

| Field | Description |
|-------|-------------|
| Agent / MCP Gateway | The profile (agent, MCP gateway, or profile) the limit applies to |
| Type | Per Server or Per Tool |
| MCP Server | Which MCP server the limit covers |
| Tool | (Per Tool only) The specific tool name |
| Window | Time window: 1 minute, 1 hour, 1 day, 1 week, or 1 month |
| Max Calls | Maximum number of calls allowed within the window |

## Enforcement

Limits are checked before each tool execution. When a limit is exceeded, the tool call returns an error result (not HTTP 429) with a message including the limit value, window, and approximate retry time:

```
Rate limit exceeded for MCP server 'github': 100 calls per 1 hour. Try again in approximately 1423 seconds.
```

## Usage Tracking

The rate limits table shows real-time usage for each limit as a progress bar with percentage. Usage data refreshes every 5 seconds.

- **Safe** — below 75% of the limit
- **Near Limit** — 75–90% of the limit
- **Exceeded** — above 90% of the limit

## Monitoring

Rate limit rejections are tracked via the `mcp_rate_limit_rejections_total` Prometheus metric with labels `agent_id`, `agent_name`, `mcp_server_name`, `tool_name`, `limit_type`, and `entity_type`.

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/mcp-rate-limits` | List all rate limits (with current usage) |
| POST | `/api/mcp-rate-limits` | Create a new rate limit |
| GET | `/api/mcp-rate-limits/:id` | Get a single rate limit |
| PATCH | `/api/mcp-rate-limits/:id` | Update a rate limit |
| DELETE | `/api/mcp-rate-limits/:id` | Delete a rate limit |
