#!/usr/bin/env node

/**
 * create-experience — scaffold a new vibevibes experience.
 *
 * Usage:
 *   npx create-experience my-app
 *   npx create-experience my-app --template dungeon
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_DIR = path.resolve(__dirname, "..");

const TEMPLATES = ["vibe-studio", "worldbuilder", "dashboard", "dungeon"];

// Parse args: <name> [--template <template>]
const args = process.argv.slice(2);
const templateIdx = args.indexOf("--template");
const template = templateIdx !== -1 ? args[templateIdx + 1] : "vibe-studio";

// Skip flags and flag values when finding the project name
const flagValues = new Set();
if (templateIdx !== -1) { flagValues.add(templateIdx); flagValues.add(templateIdx + 1); }
const name = args.find((a, i) => !a.startsWith("-") && !flagValues.has(i));

if (!name) {
  console.log(`
  Usage: npx @vibevibes/create-experience <project-name> [--template <template>]

  Templates: ${TEMPLATES.join(", ")}

  Example:
    npx @vibevibes/create-experience my-app
    npx @vibevibes/create-experience my-app --template dungeon
    cd my-app
    npm run dev
`);
  process.exit(0);
}

if (!TEMPLATES.includes(template)) {
  console.error(`\n  Error: Unknown template "${template}". Available: ${TEMPLATES.join(", ")}\n`);
  process.exit(1);
}

const targetDir = path.resolve(process.cwd(), name);

if (fs.existsSync(targetDir)) {
  console.error(`\n  Error: Directory "${name}" already exists.\n`);
  process.exit(1);
}

// Files/dirs to copy from the package (runtime infra)
const COPY = [
  "runtime",
  "scripts",
  "tsconfig.json",
  "CLAUDE.md",
];

// Files to skip when copying directories
const SKIP = [
  "node_modules",
  ".git",
  "bin",
  "package-lock.json",
];

console.log(`\n  Creating experience: ${name} (template: ${template})\n`);

// Create target directory
fs.mkdirSync(targetDir, { recursive: true });

// Copy template files
function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (SKIP.includes(entry.name)) continue;
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// Copy runtime infrastructure
for (const item of COPY) {
  const srcPath = path.join(TEMPLATE_DIR, item);
  const destPath = path.join(targetDir, item);
  if (!fs.existsSync(srcPath)) continue;

  const stat = fs.statSync(srcPath);
  if (stat.isDirectory()) {
    copyDir(srcPath, destPath);
  } else {
    fs.copyFileSync(srcPath, destPath);
  }
}

// Copy all template source files into src/ (multi-file templates)
const templateDir = path.join(TEMPLATE_DIR, "templates", template);
if (fs.existsSync(templateDir)) {
  const destSrc = path.join(targetDir, "src");
  fs.mkdirSync(destSrc, { recursive: true });
  copyDir(templateDir, destSrc);
}

// Generate fresh package.json with the project name
const pkg = {
  name: name,
  version: "0.0.1",
  private: true,
  type: "module",
  scripts: {
    dev: "tsx scripts/dev.ts",
    "dev:share": "tsx scripts/dev.ts --share",
    build: "tsx runtime/bundler.ts",
    test: "tsx scripts/test.ts",
  },
  dependencies: {
    "@vibevibes/sdk": "^0.1.0",
    react: "^18.2.0",
    "react-dom": "^18.2.0",
    zod: "^3.22.4",
    esbuild: "^0.27.2",
    express: "^4.18.2",
    ws: "^8.19.0",
    "zod-to-json-schema": "^3.22.4",
  },
  devDependencies: {
    tsx: "^4.7.0",
    typescript: "^5.3.3",
    "@types/express": "^4.17.21",
    "@types/ws": "^8.18.1",
    "@types/react": "^18.2.48",
    "@types/node": "^20.11.5",
  },
};

fs.writeFileSync(
  path.join(targetDir, "package.json"),
  JSON.stringify(pkg, null, 2) + "\n"
);

// Generate fresh .mcp.json
const mcpConfig = {
  mcpServers: {
    vibevibes: {
      command: "npx",
      args: ["-y", "@vibevibes/mcp"],
      env: {
        VIBEVIBES_SERVER_URL: "http://localhost:4321",
      },
    },
  },
};

fs.writeFileSync(
  path.join(targetDir, ".mcp.json"),
  JSON.stringify(mcpConfig, null, 2) + "\n"
);

// Install dependencies
console.log("  Installing dependencies...\n");
try {
  execSync("npm install", { cwd: targetDir, stdio: "inherit" });
} catch {
  console.log("\n  Warning: npm install failed. Run it manually.\n");
}

// Done
console.log(`
  Done! Your experience is ready. (template: ${template})

  cd ${name}
  npm run dev        Start local dev server (you + AI agents)
  npm run dev:share  Share with friends via public URL (no signup!)
  npm test           Run inline tool handler tests

  Edit files in src/ to build your experience.
  Entry point: src/index.tsx
`);
