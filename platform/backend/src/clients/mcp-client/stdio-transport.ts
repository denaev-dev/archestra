import { spawn, type ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import logger from "@/logging";

export interface StdioTransportOptions {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
}

/**
 * MCP Stdio Transport that spawns a local process.
 * Based on the 2026 MCP standard and Archestra security mandates.
 * Uses tree-kill for clean shutdown when available.
 */
export class StdioTransport implements Transport {
  private childProcess?: ChildProcess;
  private isStarted = false;

  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;

  constructor(private options: StdioTransportOptions) {}

  async start(): Promise<void> {
    if (this.isStarted) {
      return;
    }

    const { command, args = [], env = {}, cwd } = this.options;

    logger.info(
      { command, args, cwd },
      `Spawning MCP Stdio server process: ${command}`,
    );

    try {
      this.childProcess = spawn(command, args, {
        env: { ...process.env, ...env },
        cwd,
        shell: false,
      });

      this.isStarted = true;

      // Capture and log stderr but don't mix it with stdout (as per TECH_SPEC.md)
      this.childProcess.stderr?.on("data", (data) => {
        logger.debug(
          { command, stderr: data.toString() },
          `MCP server [${command}] stderr:`,
        );
      });

      // Handle process exit
      this.childProcess.on("exit", (code, signal) => {
        logger.info(
          { command, code, signal },
          `MCP server [${command}] exited`,
        );
        this.isStarted = false;
        this.onclose?.();
      });

      this.childProcess.on("error", (error) => {
        logger.error({ err: error, command }, `MCP server [${command}] error`);
        this.onerror?.(error);
      });

      // Implement Readline interface for stdout to handle JSON-RPC messages line-by-line
      if (this.childProcess.stdout) {
        const rl = createInterface({
          input: this.childProcess.stdout,
          terminal: false,
        });

        rl.on("line", (line) => {
          if (!line.trim()) return;
          try {
            const message = JSON.parse(line) as JSONRPCMessage;
            this.onmessage?.(message);
          } catch (error) {
            logger.debug(
              { err: error, line, command },
              "Failed to parse JSON-RPC message from MCP server stdout - skipping invalid line",
            );
          }
        });
      }

      // Small delay to ensure process has actually started
      await new Promise((resolve) => setTimeout(resolve, 100));
    } catch (error) {
      logger.error({ err: error, command }, "Failed to spawn MCP server process");
      this.isStarted = false;
      throw error;
    }
  }

  async send(message: JSONRPCMessage): Promise<void> {
    if (!this.isStarted || !this.childProcess?.stdin) {
      throw new Error("Transport not started or stdin unavailable");
    }

    const serialized = JSON.stringify(message) + "\n";
    this.childProcess.stdin.write(serialized);
  }

  async close(): Promise<void> {
    if (!this.childProcess) {
      this.isStarted = false;
      return;
    }

    const pid = this.childProcess.pid;
    if (pid) {
      try {
        // Attempt to use tree-kill for clean shutdown if available
        const treeKill = (await import("tree-kill")).default;
        return new Promise((resolve) => {
          treeKill(pid, "SIGTERM", (err) => {
            if (err) {
              logger.warn({ err, pid }, "Failed to tree-kill MCP process - fallback to kill()");
              this.childProcess?.kill("SIGKILL");
            }
            this.childProcess = undefined;
            this.isStarted = false;
            resolve();
          });
        });
      } catch (err) {
        // Fallback to native kill() if tree-kill is not available
        logger.debug({ pid, command: this.options.command }, "tree-kill not available - using native kill()");
        this.childProcess.kill("SIGTERM");
        
        // Windows often requires SIGKILL to actually terminate the process
        if (process.platform === "win32") {
          this.childProcess.kill("SIGKILL");
        }
        
        this.childProcess = undefined;
        this.isStarted = false;
      }
    } else {
      this.childProcess.kill();
      this.childProcess = undefined;
      this.isStarted = false;
    }
  }
}
