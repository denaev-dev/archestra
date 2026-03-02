import { archestraApiSdk, type archestraApiTypes } from "@shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

const {
  getMcpRateLimits,
  createMcpRateLimit,
  getMcpRateLimit,
  updateMcpRateLimit,
  deleteMcpRateLimit,
} = archestraApiSdk;

export function useMcpRateLimits(params?: {
  agentId?: string;
  limitType?: "mcp_server_calls" | "tool_calls";
}) {
  return useQuery({
    queryKey: ["mcpRateLimits", params],
    queryFn: async () => {
      const response = await getMcpRateLimits({
        query: params
          ? {
              ...(params.agentId && { agentId: params.agentId }),
              ...(params.limitType && { limitType: params.limitType }),
            }
          : undefined,
      });
      return response.data ?? [];
    },
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
  });
}

export function useMcpRateLimit(id: string) {
  return useQuery({
    queryKey: ["mcpRateLimits", id],
    queryFn: async () => {
      const response = await getMcpRateLimit({ path: { id } });
      return response.data;
    },
    enabled: !!id,
  });
}

export function useCreateMcpRateLimit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      data: archestraApiTypes.CreateMcpRateLimitData["body"],
    ) => {
      const response = await createMcpRateLimit({ body: data });
      return response.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["mcpRateLimits"] });
      toast.success("MCP rate limit created successfully");
    },
    onError: (error) => {
      console.error("Create MCP rate limit error:", error);
      toast.error("Failed to create MCP rate limit");
    },
  });
}

export function useUpdateMcpRateLimit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...data
    }: {
      id: string;
    } & Partial<archestraApiTypes.UpdateMcpRateLimitData["body"]>) => {
      const response = await updateMcpRateLimit({
        path: { id },
        body: data,
      });
      return response.data;
    },
    onSuccess: async (_, variables) => {
      await queryClient.invalidateQueries({ queryKey: ["mcpRateLimits"] });
      await queryClient.invalidateQueries({
        queryKey: ["mcpRateLimits", variables.id],
      });
      toast.success("MCP rate limit updated successfully");
    },
    onError: (error) => {
      console.error("Update MCP rate limit error:", error);
      toast.error("Failed to update MCP rate limit");
    },
  });
}

export function useDeleteMcpRateLimit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const response = await deleteMcpRateLimit({ path: { id } });
      return response.data;
    },
    onSuccess: async (_, variables) => {
      await queryClient.invalidateQueries({ queryKey: ["mcpRateLimits"] });
      queryClient.removeQueries({
        queryKey: ["mcpRateLimits", variables.id],
      });
      toast.success("MCP rate limit deleted successfully");
    },
    onError: (error) => {
      console.error("Delete MCP rate limit error:", error);
      toast.error("Failed to delete MCP rate limit");
    },
  });
}
