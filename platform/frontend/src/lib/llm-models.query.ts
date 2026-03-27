import {
  archestraApiSdk,
  type archestraApiTypes,
  type SupportedProvider,
} from "@shared";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useMemo } from "react";
import { toast } from "sonner";
import { handleApiError } from "@/lib/utils";

const { getLlmModels, getModelsWithApiKeys, updateModel, syncLlmModels } =
  archestraApiSdk;
type LlmModelsQuery = NonNullable<archestraApiTypes.GetLlmModelsData["query"]>;
type LlmModelsParams = Partial<LlmModelsQuery>;

export type LlmModel = archestraApiTypes.GetLlmModelsResponses["200"][number];
export type ModelCapabilities = NonNullable<LlmModel["capabilities"]>;
export type ModelWithApiKeys =
  archestraApiTypes.GetModelsWithApiKeysResponses["200"][number];
export type LinkedApiKey = ModelWithApiKeys["apiKeys"][number];

export function useLlmModels(params?: LlmModelsParams) {
  const apiKeyId = params?.apiKeyId;
  return useQuery({
    queryKey: ["llm-models", apiKeyId ?? null],
    queryFn: async (): Promise<LlmModel[]> => {
      const { data, error } = await getLlmModels({
        query: apiKeyId ? { apiKeyId } : undefined,
      });
      if (error) {
        handleApiError(error);
        return [];
      }
      return data ?? [];
    },
    placeholderData: keepPreviousData,
  });
}

export function useLlmModelsByProvider(params?: LlmModelsParams) {
  const query = useLlmModels(params);

  const modelsByProvider = useMemo(() => {
    if (!query.data) return {} as Record<SupportedProvider, LlmModel[]>;
    return query.data.reduce(
      (acc, model) => {
        if (!acc[model.provider]) {
          acc[model.provider] = [];
        }
        acc[model.provider].push(model);
        return acc;
      },
      {} as Record<SupportedProvider, LlmModel[]>,
    );
  }, [query.data]);

  return {
    ...query,
    modelsByProvider,
    isPlaceholderData: query.isPlaceholderData,
  };
}

export function useModelsWithApiKeys() {
  return useQuery({
    queryKey: ["models-with-api-keys"],
    queryFn: async (): Promise<ModelWithApiKeys[]> => {
      const { data, error } = await getModelsWithApiKeys();
      if (error) {
        handleApiError(error);
        return [];
      }
      return data ?? [];
    },
  });
}

export function useUpdateModel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      params: archestraApiTypes.UpdateModelData["body"] & { id: string },
    ) => {
      const { id, ...body } = params;
      const { data, error } = await updateModel({
        path: { id },
        body,
      });
      if (error) {
        handleApiError(error);
        return null;
      }
      return data;
    },
    onSuccess: () => {
      toast.success("Model updated");
      queryClient.invalidateQueries({ queryKey: ["models-with-api-keys"] });
      queryClient.invalidateQueries({ queryKey: ["llm-models"] });
    },
    onError: () => {
      toast.error("Failed to update model");
    },
  });
}

export function useSyncLlmModels() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data: responseData, error } = await syncLlmModels();
      if (error) {
        handleApiError(error);
        throw error;
      }
      return responseData;
    },
    onSuccess: (data) => {
      if (!data) return;
      toast.success("Models synced");
      queryClient.invalidateQueries({ queryKey: ["llm-models"] });
      queryClient.invalidateQueries({ queryKey: ["models-with-api-keys"] });
    },
  });
}
