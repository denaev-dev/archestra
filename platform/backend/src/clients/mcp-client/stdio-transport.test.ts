import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { StdioTransport } from "./stdio-transport";
import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";

vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

vi.mock("tree-kill", () => ({
  default: vi.fn((pid, signal, callback) => callback?.()),
}));

describe("StdioTransport", () => {
  let mockProcess: any;

  beforeEach(() => {
    mockProcess = new EventEmitter();
    mockProcess.stdin = { write: vi.fn() };
    mockProcess.stdout = new EventEmitter();
    mockProcess.stderr = new EventEmitter();
    mockProcess.pid = 1234;
    mockProcess.kill = vi.fn();
    
    (spawn as any).mockReturnValue(mockProcess);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should spawn a process with the given command and args", async () => {
    const transport = new StdioTransport({
      command: "node",
      args: ["test.js"],
      env: { TEST: "true" },
    });

    await transport.start();

    expect(spawn).toHaveBeenCalledWith("node", ["test.js"], expect.objectContaining({
      env: expect.objectContaining({ TEST: "true" }),
      shell: false,
    }));
  });

  it("should emit messages when stdout receives data", async () => {
    const transport = new StdioTransport({ command: "node" });
    const onmessage = vi.fn();
    transport.onmessage = onmessage;

    await transport.start();

    const message = { jsonrpc: "2.0", id: 1, result: { value: "test" } };
    mockProcess.stdout.emit("data", Buffer.from(JSON.stringify(message) + "\n"));

    expect(onmessage).toHaveBeenCalledWith(message);
  });

  it("should send messages to stdin", async () => {
    const transport = new StdioTransport({ command: "node" });
    await transport.start();

    const message = { jsonrpc: "2.0", method: "test", id: 2 };
    await transport.send(message as any);

    expect(mockProcess.stdin.write).toHaveBeenCalledWith(JSON.stringify(message) + "\n");
  });

  it("should close the process on close()", async () => {
    const transport = new StdioTransport({ command: "node" });
    await transport.start();

    await transport.close();

    // tree-kill is called (mocked)
    const treeKill = (await import("tree-kill")).default;
    expect(treeKill).toHaveBeenCalledWith(1234, "SIGTERM", expect.any(Function));
  });
});
