/**
 * Dev server entry point.
 * Starts the local runtime server with hot reload.
 *
 * Usage:
 *   npm run dev                                              # local only
 *   npm run dev:share                                        # random URL (quick tunnel)
 *   VIBEVIBES_SHARE_HOST=app.play.egemen.ai npm run dev:share  # deterministic URL (named tunnel)
 */

import { execSync } from "child_process";
import { startServer, setPublicUrl } from "../runtime/server.js";
import { startTunnel } from "../runtime/tunnel.js";

const share = process.argv.includes("--share");

/** Kill any process holding the port so we never hit EADDRINUSE. */
function freePort(port: number) {
  try {
    if (process.platform === "win32") {
      // Find PID listening on the port, then kill it
      const out = execSync(`netstat -ano | findstr :${port} | findstr LISTENING`, { encoding: "utf8", timeout: 5000 });
      const pids = new Set(out.trim().split(/\r?\n/).map(l => l.trim().split(/\s+/).pop()!).filter(Boolean));
      for (const pid of pids) {
        try { execSync(`taskkill /F /PID ${pid}`, { stdio: "ignore", timeout: 5000 }); } catch {}
      }
    } else {
      execSync(`lsof -ti:${port} | xargs kill -9 2>/dev/null`, { stdio: "ignore", timeout: 5000 });
    }
  } catch {
    // Nothing on the port — that's fine
  }
}

// Read hostname from env or --share-host flag
function getShareHost(): string | undefined {
  if (process.env.VIBEVIBES_SHARE_HOST) return process.env.VIBEVIBES_SHARE_HOST;
  const idx = process.argv.indexOf("--share-host");
  if (idx !== -1 && process.argv[idx + 1]) return process.argv[idx + 1];
  return undefined;
}

async function main() {
  const PORT = parseInt(process.env.PORT || "4321");
  freePort(PORT);

  if (share) {
    const hostname = getShareHost();

    if (hostname) {
      console.log(`\n  Starting named Cloudflare Tunnel → ${hostname}...`);
    } else {
      console.log("\n  Starting Cloudflare Tunnel...");
    }

    const tunnelUrl = await startTunnel(PORT, hostname);
    setPublicUrl(tunnelUrl);
  }

  await startServer();
}

main().catch((err) => {
  console.error("Failed to start dev server:", err);
  process.exit(1);
});
