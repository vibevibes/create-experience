/**
 * Dev server entry point.
 * Starts the local runtime server with hot reload.
 *
 * Usage:
 *   npm run dev              # local only
 *   npm run dev:share        # local + Cloudflare Tunnel (anyone can join)
 */

import crypto from "crypto";
import { startServer, setPublicUrl, setRoomToken } from "../runtime/server.js";
import { startTunnel } from "../runtime/tunnel.js";

const share = process.argv.includes("--share");

async function main() {
  if (share) {
    // Start tunnel first so we have the URL before the server prints its banner
    console.log("\n  Starting Cloudflare Tunnel...");
    const PORT = parseInt(process.env.PORT || "4321");
    const tunnelUrl = await startTunnel(PORT);
    setPublicUrl(tunnelUrl);

    // Generate a random room token to protect mutation endpoints
    const token = crypto.randomUUID().split("-")[0]; // short 8-char hex token
    setRoomToken(token);
  }

  await startServer();
}

main().catch((err) => {
  console.error("Failed to start dev server:", err);
  process.exit(1);
});
