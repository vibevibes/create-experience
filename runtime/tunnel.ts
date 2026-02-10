/**
 * Cloudflare Tunnel for `vibevibes dev --share`.
 *
 * Two modes:
 *   1. Named tunnel (deterministic URL) — requires Cloudflare account + domain.
 *      Set VIBEVIBES_SHARE_HOST=myapp.play.egemen.ai or use --share-host flag.
 *      Creates/reuses a named tunnel and routes DNS automatically.
 *
 *   2. Quick tunnel (random URL) — no account, no config, free.
 *      Fallback when no hostname is configured.
 */

import { spawn, execSync } from "child_process";
import { existsSync } from "fs";
import { join } from "path";

function findCloudflared(): string {
  // 1. Check npm global node_modules (works for `npm i -g cloudflared`)
  try {
    const globalRoot = execSync("npm root -g", { encoding: "utf8" }).trim();
    for (const name of ["cloudflared.exe", "cloudflared"]) {
      const p = join(globalRoot, "cloudflared", "bin", name);
      if (existsSync(p)) return p;
    }
  } catch {}
  // 2. Try `where`/`which` to find it on PATH
  try {
    const cmd = process.platform === "win32" ? "where cloudflared" : "which cloudflared";
    const found = execSync(cmd, { encoding: "utf8" }).trim().split(/\r?\n/)[0];
    if (found && existsSync(found)) return found;
  } catch {}
  // 3. Fallback to bare command
  return "cloudflared";
}

function showInstallHelp() {
  console.error("\n  cloudflared not found.\n");
  console.error("  Install it to use --share:");
  console.error("    macOS:   brew install cloudflared");
  console.error("    Windows: winget install Cloudflare.cloudflared");
  console.error("    Linux:   https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/\n");
}

/** Derive a tunnel name from a hostname (e.g. "app.play.egemen.ai" → "app-play-egemen-ai") */
function tunnelNameFromHostname(hostname: string): string {
  return hostname.replace(/\./g, "-");
}

/** Check if a named tunnel already exists. */
function tunnelExists(cmd: string, tunnelName: string): boolean {
  try {
    const output = execSync(`"${cmd}" tunnel list -o json`, { encoding: "utf8", timeout: 15000 });
    const tunnels = JSON.parse(output);
    // `tunnel list -o json` returns null when empty
    if (!Array.isArray(tunnels)) return false;
    return tunnels.some((t: any) => t.name === tunnelName && !t.deleted_at);
  } catch {
    return false;
  }
}

/** Create a named tunnel if it doesn't exist. Idempotent. */
function ensureTunnel(cmd: string, tunnelName: string): void {
  if (tunnelExists(cmd, tunnelName)) return;
  try {
    console.log(`  Creating tunnel "${tunnelName}"...`);
    execSync(`"${cmd}" tunnel create ${tunnelName}`, { encoding: "utf8", timeout: 30000 });
  } catch (err: any) {
    // "already exists" is fine — race condition or stale list cache
    if (err.stderr?.includes("already exists") || err.message?.includes("already exists")) {
      return;
    }
    throw err;
  }
}

/** Route DNS for the tunnel. Idempotent — safe to call if route already exists. */
function routeDns(cmd: string, tunnelName: string, hostname: string): void {
  try {
    console.log(`  Routing DNS: ${hostname} → tunnel "${tunnelName}"...`);
    execSync(`"${cmd}" tunnel route dns ${tunnelName} ${hostname}`, { encoding: "utf8", timeout: 30000, stdio: ["ignore", "pipe", "pipe"] });
  } catch (err: any) {
    // "already exists" is fine — means DNS was already routed
    if (err.stderr?.includes("already exists") || err.message?.includes("already exists")) {
      return;
    }
    throw err;
  }
}

/** Start a named tunnel (deterministic URL). */
async function startNamedTunnel(port: number, hostname: string): Promise<string> {
  const cmd = findCloudflared();
  const tunnelName = tunnelNameFromHostname(hostname);

  // Ensure tunnel exists (idempotent)
  ensureTunnel(cmd, tunnelName);

  // Ensure DNS route exists
  routeDns(cmd, tunnelName, hostname);

  // Run the tunnel
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, ["tunnel", "run", "--url", `http://localhost:${port}`, tunnelName], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let resolved = false;

    // Named tunnels log connection info to stderr
    child.stderr.on("data", (chunk: Buffer) => {
      const line = chunk.toString();
      // Look for successful connection registration
      if (!resolved && (line.includes("Registered tunnel connection") || line.includes("Connection registered"))) {
        resolved = true;
        resolve(`https://${hostname}`);
      }
    });

    // Also check stdout
    child.stdout.on("data", (chunk: Buffer) => {
      const line = chunk.toString();
      if (!resolved && (line.includes("Registered tunnel connection") || line.includes("Connection registered"))) {
        resolved = true;
        resolve(`https://${hostname}`);
      }
    });

    // Resolve after a short timeout if we haven't seen the registration message
    // (the tunnel may already be connected and we missed the log line)
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve(`https://${hostname}`);
      }
    }, 10000);

    child.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "ENOENT") showInstallHelp();
      reject(err);
    });

    child.on("exit", (code) => {
      if (!resolved) {
        reject(new Error(`cloudflared exited with code ${code} before tunnel was ready`));
      }
    });

    // Clean up tunnel when main process exits
    process.on("exit", () => child.kill());
    process.on("SIGINT", () => { child.kill(); process.exit(); });
    process.on("SIGTERM", () => { child.kill(); process.exit(); });
  });
}

/** Start a quick tunnel (random URL, no account needed). */
async function startQuickTunnel(port: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const cmd = findCloudflared();
    const child = spawn(cmd, ["tunnel", "--url", `http://localhost:${port}`], {
      stdio: ["ignore", "ignore", "pipe"],
    });

    let resolved = false;

    child.stderr.on("data", (chunk: Buffer) => {
      const line = chunk.toString();
      const match = line.match(/https:\/\/[^\s]+\.trycloudflare\.com/);
      if (match && !resolved) {
        resolved = true;
        resolve(match[0]);
      }
    });

    child.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "ENOENT") showInstallHelp();
      reject(err);
    });

    child.on("exit", (code) => {
      if (!resolved) {
        reject(new Error(`cloudflared exited with code ${code} before providing a URL`));
      }
    });

    process.on("exit", () => child.kill());
    process.on("SIGINT", () => { child.kill(); process.exit(); });
    process.on("SIGTERM", () => { child.kill(); process.exit(); });
  });
}

/**
 * Start a Cloudflare tunnel.
 *
 * If `hostname` is provided, uses a named tunnel for a deterministic URL.
 * Otherwise falls back to a quick tunnel with a random URL.
 */
export async function startTunnel(port: number, hostname?: string): Promise<string> {
  if (hostname) {
    return startNamedTunnel(port, hostname);
  }
  return startQuickTunnel(port);
}
