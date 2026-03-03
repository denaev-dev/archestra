---
title: "Access Control"
category: Archestra Platform
description: "Role-based access control (RBAC) system for managing user permissions in Archestra"
order: 4
lastUpdated: 2026-03-03
---
<!--
Check ../docs_writer_prompt.md before changing this file.

This document is human-built, shouldn't be updated with AI. Don't change anything here.
-->

Archestra uses a role-based access control (RBAC) system to manage user permissions within organizations. This system provides both predefined roles for common use cases and the flexibility to create custom roles with specific permission combinations.

Permissions in Archestra are defined using a `resource:action` format, where:

- **Resource**: The type of object or feature being accessed (e.g., `agent`, `tool`, `organization`)
- **Action**: The operation being performed (`create`, `read`, `update`, `delete`, `admin`)

For example, the permission `agent:create` allows creating new automation agents, `mcpGateway:create` allows creating MCP gateways, `llmProxy:create` allows creating LLM proxies, and `organization:read` allows viewing organization information.

## Predefined Roles

The following roles are built into Archestra and cannot be modified or deleted:

| Role | Description | Granted Permissions |
|------|-------------|--------------------|
| **admin** | Full administrative access to all organization resources | `organization:read`<br /><br />`organization:update`<br /><br />`organization:delete`<br /><br />`member:create`<br /><br />`member:update`<br /><br />`member:delete`<br /><br />`invitation:create`<br /><br />`invitation:cancel`<br /><br />`team:create`<br /><br />`team:read`<br /><br />`team:update`<br /><br />`team:delete`<br /><br />`team:admin`<br /><br />`ac:create`<br /><br />`ac:read`<br /><br />`ac:update`<br /><br />`ac:delete`<br /><br />`agent:create`<br /><br />`agent:read`<br /><br />`agent:update`<br /><br />`agent:delete`<br /><br />`agent:team-admin`<br /><br />`agent:admin`<br /><br />`mcpGateway:create`<br /><br />`mcpGateway:read`<br /><br />`mcpGateway:update`<br /><br />`mcpGateway:delete`<br /><br />`mcpGateway:team-admin`<br /><br />`mcpGateway:admin`<br /><br />`llmProxy:create`<br /><br />`llmProxy:read`<br /><br />`llmProxy:update`<br /><br />`llmProxy:delete`<br /><br />`llmProxy:team-admin`<br /><br />`llmProxy:admin`<br /><br />`tool:create`<br /><br />`tool:read`<br /><br />`tool:update`<br /><br />`tool:delete`<br /><br />`policy:create`<br /><br />`policy:read`<br /><br />`policy:update`<br /><br />`policy:delete`<br /><br />`dualLlmConfig:create`<br /><br />`dualLlmConfig:read`<br /><br />`dualLlmConfig:update`<br /><br />`dualLlmConfig:delete`<br /><br />`dualLlmResult:create`<br /><br />`dualLlmResult:read`<br /><br />`dualLlmResult:update`<br /><br />`dualLlmResult:delete`<br /><br />`interaction:create`<br /><br />`interaction:read`<br /><br />`interaction:update`<br /><br />`interaction:delete`<br /><br />`identityProvider:create`<br /><br />`identityProvider:read`<br /><br />`identityProvider:update`<br /><br />`identityProvider:delete`<br /><br />`internalMcpCatalog:create`<br /><br />`internalMcpCatalog:read`<br /><br />`internalMcpCatalog:update`<br /><br />`internalMcpCatalog:delete`<br /><br />`mcpServer:create`<br /><br />`mcpServer:read`<br /><br />`mcpServer:update`<br /><br />`mcpServer:delete`<br /><br />`mcpServer:admin`<br /><br />`mcpServerInstallationRequest:create`<br /><br />`mcpServerInstallationRequest:read`<br /><br />`mcpServerInstallationRequest:update`<br /><br />`mcpServerInstallationRequest:delete`<br /><br />`mcpServerInstallationRequest:admin`<br /><br />`mcpToolCall:read`<br /><br />`conversation:create`<br /><br />`conversation:read`<br /><br />`conversation:update`<br /><br />`conversation:delete`<br /><br />`llmTokenLimit:create`<br /><br />`llmTokenLimit:read`<br /><br />`llmTokenLimit:update`<br /><br />`llmTokenLimit:delete`<br /><br />`mcpRateLimit:create`<br /><br />`mcpRateLimit:read`<br /><br />`mcpRateLimit:update`<br /><br />`mcpRateLimit:delete`<br /><br />`llmModels:create`<br /><br />`llmModels:read`<br /><br />`llmModels:update`<br /><br />`llmModels:delete`<br /><br />`chatSettings:create`<br /><br />`chatSettings:read`<br /><br />`chatSettings:update`<br /><br />`chatSettings:delete` |
| **editor** | Power user with full CRUD access to most resources but no admin privileges | `agent:create`<br /><br />`agent:read`<br /><br />`agent:update`<br /><br />`agent:delete`<br /><br />`agent:team-admin`<br /><br />`mcpGateway:create`<br /><br />`mcpGateway:read`<br /><br />`mcpGateway:update`<br /><br />`mcpGateway:delete`<br /><br />`mcpGateway:team-admin`<br /><br />`llmProxy:create`<br /><br />`llmProxy:read`<br /><br />`llmProxy:update`<br /><br />`llmProxy:delete`<br /><br />`llmProxy:team-admin`<br /><br />`tool:create`<br /><br />`tool:read`<br /><br />`tool:update`<br /><br />`tool:delete`<br /><br />`policy:create`<br /><br />`policy:read`<br /><br />`policy:update`<br /><br />`policy:delete`<br /><br />`interaction:create`<br /><br />`interaction:read`<br /><br />`interaction:update`<br /><br />`interaction:delete`<br /><br />`dualLlmConfig:read`<br /><br />`dualLlmResult:read`<br /><br />`internalMcpCatalog:create`<br /><br />`internalMcpCatalog:read`<br /><br />`internalMcpCatalog:update`<br /><br />`internalMcpCatalog:delete`<br /><br />`mcpServer:create`<br /><br />`mcpServer:read`<br /><br />`mcpServer:update`<br /><br />`mcpServer:delete`<br /><br />`mcpServerInstallationRequest:create`<br /><br />`mcpServerInstallationRequest:read`<br /><br />`mcpServerInstallationRequest:update`<br /><br />`mcpServerInstallationRequest:delete`<br /><br />`organization:read`<br /><br />`team:read`<br /><br />`mcpToolCall:read`<br /><br />`conversation:create`<br /><br />`conversation:read`<br /><br />`conversation:update`<br /><br />`conversation:delete`<br /><br />`llmTokenLimit:create`<br /><br />`llmTokenLimit:read`<br /><br />`llmTokenLimit:update`<br /><br />`llmTokenLimit:delete`<br /><br />`mcpRateLimit:create`<br /><br />`mcpRateLimit:read`<br /><br />`mcpRateLimit:update`<br /><br />`mcpRateLimit:delete`<br /><br />`llmModels:create`<br /><br />`llmModels:read`<br /><br />`llmModels:update`<br /><br />`llmModels:delete`<br /><br />`chatSettings:create`<br /><br />`chatSettings:read`<br /><br />`chatSettings:update`<br /><br />`chatSettings:delete`<br /><br /><br /><br /><br /><br /><br /><br /> |
| **member** | Standard user with limited access to organization resources | `agent:create`<br /><br />`agent:read`<br /><br />`agent:update`<br /><br />`agent:delete`<br /><br />`mcpGateway:create`<br /><br />`mcpGateway:read`<br /><br />`mcpGateway:update`<br /><br />`mcpGateway:delete`<br /><br />`llmProxy:create`<br /><br />`llmProxy:read`<br /><br />`llmProxy:update`<br /><br />`llmProxy:delete`<br /><br />`tool:create`<br /><br />`tool:read`<br /><br />`tool:update`<br /><br />`tool:delete`<br /><br />`policy:read`<br /><br />`interaction:create`<br /><br />`interaction:read`<br /><br />`interaction:update`<br /><br />`interaction:delete`<br /><br />`dualLlmConfig:read`<br /><br />`dualLlmResult:read`<br /><br />`internalMcpCatalog:read`<br /><br />`mcpServer:create`<br /><br />`mcpServer:read`<br /><br />`mcpServer:delete`<br /><br />`mcpServerInstallationRequest:create`<br /><br />`mcpServerInstallationRequest:read`<br /><br />`mcpServerInstallationRequest:update`<br /><br />`organization:read`<br /><br />`team:read`<br /><br />`mcpToolCall:read`<br /><br />`conversation:create`<br /><br />`conversation:read`<br /><br />`conversation:update`<br /><br />`conversation:delete`<br /><br />`llmTokenLimit:read`<br /><br />`mcpRateLimit:read`<br /><br />`llmModels:read`<br /><br />`chatSettings:read`<br /><br /><br /><br /><br /><br /><br /><br /> |


## Custom Roles

Organization administrators can create custom roles by selecting specific permission combinations. Custom roles allow fine-grained access control tailored to your organization's needs.

### Permission Requirements

- **Role Creation**: Only users with `organization:update` permission can create custom roles
- **Permission Granting**: You can only grant permissions that you already possess
- **Role Limits**: Up to 50 custom roles per organization

### Available Permissions

The following table lists all available permissions that can be assigned to custom roles:

| Permission | Description |
|------------|-------------|
| `ac:create` | Create new RBAC roles |
| `ac:read` | View and list RBAC roles |
| `ac:update` | Modify existing RBAC roles |
| `ac:delete` | Remove existing RBAC roles |
| `agent:create` | Create new Automation agents with prompts and configurations |
| `agent:read` | View and list Automation agents with prompts and configurations |
| `agent:update` | Modify existing Automation agents with prompts and configurations |
| `agent:delete` | Remove existing Automation agents with prompts and configurations |
| `agent:team-admin` | Team-level administrative control over the resource Automation agents with prompts and configurations |
| `agent:admin` | Administrative control over Automation agents with prompts and configurations |
| `chatSettings:create` | Create new Chat feature configuration and settings |
| `chatSettings:read` | View and list Chat feature configuration and settings |
| `chatSettings:update` | Modify existing Chat feature configuration and settings |
| `chatSettings:delete` | Remove existing Chat feature configuration and settings |
| `conversation:create` | Create new Chat conversations with automation experts |
| `conversation:read` | View and list Chat conversations with automation experts |
| `conversation:update` | Modify existing Chat conversations with automation experts |
| `conversation:delete` | Remove existing Chat conversations with automation experts |
| `dualLlmConfig:create` | Create new Dual LLM security configuration settings |
| `dualLlmConfig:read` | View and list Dual LLM security configuration settings |
| `dualLlmConfig:update` | Modify existing Dual LLM security configuration settings |
| `dualLlmConfig:delete` | Remove existing Dual LLM security configuration settings |
| `dualLlmResult:create` | Create new Results from dual LLM security validation |
| `dualLlmResult:read` | View and list Results from dual LLM security validation |
| `dualLlmResult:update` | Modify existing Results from dual LLM security validation |
| `dualLlmResult:delete` | Remove existing Results from dual LLM security validation |
| `identityProvider:create` | Create new Identity providers for authentication |
| `identityProvider:read` | View and list Identity providers for authentication |
| `identityProvider:update` | Modify existing Identity providers for authentication |
| `identityProvider:delete` | Remove existing Identity providers for authentication |
| `interaction:create` | Create new Conversation history and agent interactions |
| `interaction:read` | View and list Conversation history and agent interactions |
| `interaction:update` | Modify existing Conversation history and agent interactions |
| `interaction:delete` | Remove existing Conversation history and agent interactions |
| `internalMcpCatalog:create` | Create new Internal MCP server catalog management |
| `internalMcpCatalog:read` | View and list Internal MCP server catalog management |
| `internalMcpCatalog:update` | Modify existing Internal MCP server catalog management |
| `internalMcpCatalog:delete` | Remove existing Internal MCP server catalog management |
| `invitation:create` | Create new Member invitations and onboarding |
| `invitation:cancel` | Cancel Member invitations and onboarding |
| `llmModels:create` | Create new LLM models and pricing configuration |
| `llmModels:read` | View and list LLM models and pricing configuration |
| `llmModels:update` | Modify existing LLM models and pricing configuration |
| `llmModels:delete` | Remove existing LLM models and pricing configuration |
| `llmProxy:create` | Create new LLM Proxies for security, observability, and cost management |
| `llmProxy:read` | View and list LLM Proxies for security, observability, and cost management |
| `llmProxy:update` | Modify existing LLM Proxies for security, observability, and cost management |
| `llmProxy:delete` | Remove existing LLM Proxies for security, observability, and cost management |
| `llmProxy:team-admin` | Team-level administrative control over the resource LLM Proxies for security, observability, and cost management |
| `llmProxy:admin` | Administrative control over LLM Proxies for security, observability, and cost management |
| `llmTokenLimit:create` | Create new LLM token usage limits and quotas |
| `llmTokenLimit:read` | View and list LLM token usage limits and quotas |
| `llmTokenLimit:update` | Modify existing LLM token usage limits and quotas |
| `llmTokenLimit:delete` | Remove existing LLM token usage limits and quotas |
| `mcpGateway:create` | Create new MCP Gateways that provide unified MCP endpoints for tools |
| `mcpGateway:read` | View and list MCP Gateways that provide unified MCP endpoints for tools |
| `mcpGateway:update` | Modify existing MCP Gateways that provide unified MCP endpoints for tools |
| `mcpGateway:delete` | Remove existing MCP Gateways that provide unified MCP endpoints for tools |
| `mcpGateway:team-admin` | Team-level administrative control over the resource MCP Gateways that provide unified MCP endpoints for tools |
| `mcpGateway:admin` | Administrative control over MCP Gateways that provide unified MCP endpoints for tools |
| `mcpRateLimit:create` | Create new MCP rate limits for tool calls |
| `mcpRateLimit:read` | View and list MCP rate limits for tool calls |
| `mcpRateLimit:update` | Modify existing MCP rate limits for tool calls |
| `mcpRateLimit:delete` | Remove existing MCP rate limits for tool calls |
| `mcpServer:create` | Create new MCP servers for tool integration |
| `mcpServer:read` | View and list MCP servers for tool integration |
| `mcpServer:update` | Modify existing MCP servers for tool integration |
| `mcpServer:delete` | Remove existing MCP servers for tool integration |
| `mcpServer:admin` | Administrative control over MCP servers for tool integration |
| `mcpServerInstallationRequest:create` | Create new Requests for new MCP server installations |
| `mcpServerInstallationRequest:read` | View and list Requests for new MCP server installations |
| `mcpServerInstallationRequest:update` | Modify existing Requests for new MCP server installations |
| `mcpServerInstallationRequest:delete` | Remove existing Requests for new MCP server installations |
| `mcpServerInstallationRequest:admin` | Administrative control over Requests for new MCP server installations |
| `mcpToolCall:read` | View and list Tool execution logs and results |
| `member:create` | Create new Organization members and their roles |
| `member:update` | Modify existing Organization members and their roles |
| `member:delete` | Remove existing Organization members and their roles |
| `organization:read` | View and list Organization settings |
| `organization:update` | Modify existing Organization settings |
| `organization:delete` | Remove existing Organization settings |
| `policy:create` | Create new Tool invocation and trusted data policies for security |
| `policy:read` | View and list Tool invocation and trusted data policies for security |
| `policy:update` | Modify existing Tool invocation and trusted data policies for security |
| `policy:delete` | Remove existing Tool invocation and trusted data policies for security |
| `team:create` | Create new Teams for organizing members and access control |
| `team:read` | View and list Teams for organizing members and access control |
| `team:update` | Modify existing Teams for organizing members and access control |
| `team:delete` | Remove existing Teams for organizing members and access control |
| `team:admin` | Administrative control over Teams for organizing members and access control |
| `tool:create` | Create new Individual tools that can be assigned to agents |
| `tool:read` | View and list Individual tools that can be assigned to agents |
| `tool:update` | Modify existing Individual tools that can be assigned to agents |
| `tool:delete` | Remove existing Individual tools that can be assigned to agents |


## Best Practices

### Principle of Least Privilege

Grant users only the minimum permissions necessary for their role. Start with the member role and add specific permissions as needed.

### Team-Based Organization

Combine roles with team-based access control for fine-grained resource access:

1. **Create teams** for different groups (e.g., "Data Scientists", "Developers")
2. **Assign agents and MCP servers** to specific teams
3. **Add members to teams** based on their role and responsibilities

#### Default Team

New members are automatically added to the "Default Team" when they accept an invitation. This ensures all users have immediate access to Archestra resources assigned to this team.

#### Team Access Control Rules

**For Agents (MCP Gateways, LLM Proxies, Automation Agents):**

- Team members can only see agents assigned to teams they belong to
- Exception: Users with `agent:admin` permission can see all agents
- Exception: Agents with no team assignment are visible to all organization members

**For MCP Servers:**

- Team members can only access MCP servers assigned to teams they belong to
- Exception: Users with `mcpServer:admin` permission can access all MCP servers
- Exception: MCP servers with no team assignment are accessible to all organization members

**Associated Artifacts:**

Team-based access extends to related resources like interaction logs, policies, and tool assignments. Members can only view these artifacts for agents and MCP servers they have access to.

### Regular Review

Periodically review custom roles and member assignments to ensure they align with current organizational needs and security requirements.

### Role Naming

Use clear, descriptive names for custom roles that indicate their purpose (e.g., "Agent-Manager", "Read-Only-Analyst", "Tool-Developer").
