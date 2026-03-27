import type { ModelInputModality, ModelOutputModality } from "@shared";

type ModalityOption<T extends string> = {
  value: T;
  label: string;
  description: string;
};

export const INPUT_MODALITY_OPTIONS: ModalityOption<ModelInputModality>[] = [
  {
    value: "text",
    label: "Text",
    description: "Chat prompts, .txt uploads, and .csv uploads",
  },
  {
    value: "image",
    label: "Image",
    description: "Image file uploads",
  },
  {
    value: "audio",
    label: "Audio",
    description: "Audio file uploads",
  },
  {
    value: "video",
    label: "Video",
    description: "Video file uploads",
  },
  {
    value: "pdf",
    label: "PDF",
    description: "PDF file uploads",
  },
];

export const OUTPUT_MODALITY_OPTIONS: ModalityOption<ModelOutputModality>[] = [
  {
    value: "text",
    label: "Text",
    description: "Standard text responses",
  },
  {
    value: "image",
    label: "Image",
    description: "Generated image responses",
  },
  {
    value: "audio",
    label: "Audio",
    description: "Generated audio responses",
  },
];
