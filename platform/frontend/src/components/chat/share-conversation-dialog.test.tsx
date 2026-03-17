"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ShareConversationDialog } from "./share-conversation-dialog";

vi.mock("@/lib/chat-share.query", () => ({
  useConversationShare: () => ({
    data: null,
    isLoading: false,
  }),
  useShareConversation: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useUnshareConversation: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
}));

function renderDialog() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <ShareConversationDialog
        conversationId="conversation-1"
        open
        onOpenChange={vi.fn()}
      />
    </QueryClientProvider>,
  );
}

describe("ShareConversationDialog", () => {
  it("renders chat visibility options inside the standard dialog layout", () => {
    renderDialog();

    expect(
      screen.getByRole("heading", { name: "Chat Visibility" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Private/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Shared with Your Organization/i }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Close" })).toHaveLength(2);
  });
});
