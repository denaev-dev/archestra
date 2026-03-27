import type { ModelInputModality, ModelOutputModality } from "@shared";

type ModalityOption<T extends string> = {
  value: T;
  label: string;
  description: string;
};

const INPUT_MODALITY_OPTION_MAP: Record<
  ModelInputModality,
  ModalityOption<ModelInputModality>
> = {
  text: {
    value: "text",
    label: "Text",
    description: "Chat prompts, .txt uploads, and .csv uploads",
  },
  image: {
    value: "image",
    label: "Image",
    description: "Image file uploads",
  },
  audio: {
    value: "audio",
    label: "Audio",
    description: "Audio file uploads",
  },
  video: {
    value: "video",
    label: "Video",
    description: "Video file uploads",
  },
  pdf: {
    value: "pdf",
    label: "PDF",
    description: "PDF file uploads",
  },
};

const OUTPUT_MODALITY_OPTION_MAP: Record<
  ModelOutputModality,
  ModalityOption<ModelOutputModality>
> = {
  text: {
    value: "text",
    label: "Text",
    description: "Standard text responses",
  },
  image: {
    value: "image",
    label: "Image",
    description: "Generated image responses",
  },
  audio: {
    value: "audio",
    label: "Audio",
    description: "Generated audio responses",
  },
};

export const INPUT_MODALITY_OPTIONS = Object.values(INPUT_MODALITY_OPTION_MAP);

export const OUTPUT_MODALITY_OPTIONS = Object.values(
  OUTPUT_MODALITY_OPTION_MAP,
);
