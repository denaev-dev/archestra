import { describe, expect, test } from "vitest";
import {
  getAcceptedFileTypes,
  getSupportedFileTypesDescription,
  supportsFileUploads,
} from "./chat";

describe("chat file upload helpers", () => {
  test("treats text modality as supporting txt and csv uploads", () => {
    expect(getAcceptedFileTypes(["text"])).toBe(
      [
        "text/plain",
        "text/csv",
        "application/csv",
        "application/vnd.ms-excel",
      ].join(","),
    );
    expect(supportsFileUploads(["text"])).toBe(true);
    expect(getSupportedFileTypesDescription(["text"])).toBe("text files, CSVs");
  });

  test("deduplicates mime types across modalities", () => {
    expect(getAcceptedFileTypes(["text", "text", "pdf"])).toBe(
      [
        "text/plain",
        "text/csv",
        "application/csv",
        "application/vnd.ms-excel",
        "application/pdf",
      ].join(","),
    );
  });

  test("returns no file types when modalities are missing", () => {
    expect(getAcceptedFileTypes(null)).toBeUndefined();
    expect(getAcceptedFileTypes(undefined)).toBeUndefined();
    expect(getAcceptedFileTypes([])).toBeUndefined();
    expect(supportsFileUploads(null)).toBe(false);
    expect(getSupportedFileTypesDescription(undefined)).toBeNull();
  });

  test("builds a readable description for multiple upload modalities", () => {
    expect(
      getSupportedFileTypesDescription(["text", "image", "pdf", "audio"]),
    ).toBe("text files, CSVs, images, PDFs, audio");
  });
});
