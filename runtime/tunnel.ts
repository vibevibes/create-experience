/**
 * Cloudflare Tunnel for `vibevibes dev --share`.
 *
 * Uses `cloudflared tunnel --url` (quick tunnel) — no account, no config, free.
 * Spawns cloudflared as a child process, parses the assigned URL from stderr,
 * and returns it. The tunnel lives as long as the dev server process.
 */

import { spawn } from "child_process";

export async function startTunnel(port: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("cloudflared", ["tunnel", "--url", `http://localhost:${port}`], {
      stdio: ["ignore", "ignore", "pipe"],
    });

    let resolved = false;

    child.stderr.on("data", (chunk: Buffer) => {
      const line = chunk.toString();

      // cloudflared prints the URL to stderr like:
      // "INF |  https://some-random-words.trycloudflare.com"
      const match = line.match(/https:\/\/[^\s]+\.trycloudflare\.com/);
      if (match && !resolved) {
        resolved = true;
        resolve(match[0]);
      }
    });

    child.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "ENOENT") {
        console.error("\n  cloudflared not found.\n");
        console.error("  Install it to use --share:");
        console.error("    macOS:   brew install cloudflared");
        console.error("    Windows: winget install Cloudflare.cloudflared");
        console.error("    Linux:   https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/\n");
      }
      reject(err);
    });

    child.on("exit", (code) => {
      if (!resolved) {
        reject(new Error(`cloudflared exited with code ${code} before providing a URL`));
      }
    });

    // Clean up tunnel when main process exits
    process.on("exit", () => child.kill());
    process.on("SIGINT", () => {
      child.kill();
      process.exit();
    });
    process.on("SIGTERM", () => {
      child.kill();
      process.exit();
    });
  });
}
