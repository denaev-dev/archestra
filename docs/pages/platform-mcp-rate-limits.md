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

## Usage Tracking

The rate limits table shows real-time usage for each limit as a progress bar with percentage. Usage data refreshes every 5 seconds.

- **Safe** — below 75% of the limit
- **Near Limit** — 75–90% of the limit
- **Exceeded** — above 90% of the limit

## Monitoring

Rate limit rejections are tracked via the `mcp_rate_limit_rejections_total` Prometheus metric with labels `agent_id`, `agent_name`, `mcp_server_name`, `tool_name`, `limit_type`, and `entity_type`.

## API Endpoints

| Method | Endpoint                   | Description                               |
| ------ | -------------------------- | ----------------------------------------- |
| GET    | `/api/mcp-rate-limits`     | List all rate limits (with current usage) |
| POST   | `/api/mcp-rate-limits`     | Create a new rate limit                   |
| GET    | `/api/mcp-rate-limits/:id` | Get a single rate limit                   |
| PATCH  | `/api/mcp-rate-limits/:id` | Update a rate limit                       |
| DELETE | `/api/mcp-rate-limits/:id` | Delete a rate limit                       |
