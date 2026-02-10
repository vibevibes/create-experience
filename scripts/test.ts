/**
 * Test runner for experience inline tests.
 *
 * Bundles src/index.tsx, extracts the experience module,
 * runs any tests defined via defineTest(), and reports results.
 */

import path from "path";
import { fileURLToPath } from "url";
import { bundleForServer, evalServerBundle } from "../runtime/bundler.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");

// ── ExpectChain implementation ────────────────────────────────

function createExpectChain<T>(actual: T, negated = false): any {
  function assert(condition: boolean, message: string) {
    const pass = negated ? !condition : condition;
    if (!pass) throw new Error(message);
  }

  return {
    toBe(expected: any) {
      assert(actual === expected,
        `Expected ${JSON.stringify(actual)} ${negated ? "not " : ""}to be ${JSON.stringify(expected)}`);
    },
    toEqual(expected: any) {
      assert(JSON.stringify(actual) === JSON.stringify(expected),
        `Expected ${JSON.stringify(actual)} ${negated ? "not " : ""}to equal ${JSON.stringify(expected)}`);
    },
    toBeTruthy() {
      assert(!!actual,
        `Expected ${JSON.stringify(actual)} ${negated ? "not " : ""}to be truthy`);
    },
    toBeFalsy() {
      assert(!actual,
        `Expected ${JSON.stringify(actual)} ${negated ? "not " : ""}to be falsy`);
    },
    toContain(item: any) {
      const contains = Array.isArray(actual)
        ? (actual as any[]).includes(item)
        : String(actual).includes(String(item));
      assert(contains,
        `Expected ${JSON.stringify(actual)} ${negated ? "not " : ""}to contain ${JSON.stringify(item)}`);
    },
    toHaveProperty(key: string, value?: any) {
      const obj = actual as any;
      const has = obj != null && key in obj;
      if (value !== undefined) {
        assert(has && obj[key] === value,
          `Expected property '${key}' ${negated ? "not " : ""}to be ${JSON.stringify(value)}, got ${JSON.stringify(obj?.[key])}`);
      } else {
        assert(has,
          `Expected ${negated ? "not " : ""}to have property '${key}'`);
      }
    },
    get not() {
      return createExpectChain(actual, !negated);
    },
  };
}

// ── TestHelpers factory ──────────────────────────────────────

function createTestHelpers(tools: any[]) {
  const snapshots = new Map<string, any>();

  return {
    tool(name: string) {
      const t = tools.find((t: any) => t.name === name);
      if (!t) throw new Error(`Tool '${name}' not found. Available: ${tools.map((t: any) => t.name).join(", ")}`);
      return t;
    },
    ctx(opts: { state?: Record<string, any>; actorId?: string; roomId?: string; owner?: string; roomConfig?: Record<string, any> } = {}) {
      const mock: any = {
        roomId: opts.roomId || "test-room",
        actorId: opts.actorId || "test-human-1",
        owner: opts.owner || "test",
        state: { ...(opts.state || {}) },
        setState(newState: Record<string, any>) { mock.state = newState; },
        timestamp: Date.now(),
        memory: {} as Record<string, any>,
        setMemory(_updates: Record<string, any>) {},
        roomConfig: opts.roomConfig || {},
        getState() { return mock.state; },
      };
      return mock;
    },
    expect: <T>(actual: T) => createExpectChain(actual),
    snapshot(label: string, value: any) {
      if (snapshots.has(label)) {
        const prev = snapshots.get(label);
        if (JSON.stringify(prev) !== JSON.stringify(value)) {
          throw new Error(`Snapshot '${label}' changed:\n  Before: ${JSON.stringify(prev)}\n  After:  ${JSON.stringify(value)}`);
        }
      } else {
        snapshots.set(label, value);
      }
    },
  };
}

// ── Main ─────────────────────────────────────────────────────

import fs from "fs";

function resolveEntry(): string {
  const registryPath = path.join(PROJECT_ROOT, "vibevibes.registry.json");
  try {
    const raw = JSON.parse(fs.readFileSync(registryPath, "utf-8"));
    if (raw.host && raw.experiences?.[raw.host]?.path) {
      const resolved = path.resolve(path.dirname(registryPath), raw.experiences[raw.host].path);
      if (fs.existsSync(resolved)) return resolved;
    }
  } catch {}
  return path.join(PROJECT_ROOT, "src", "index.tsx");
}

async function main() {
  const entryPath = resolveEntry();

  console.log(`Bundling ${path.relative(PROJECT_ROOT, entryPath)}...\n`);
  const serverCode = await bundleForServer(entryPath);
  const experience = await evalServerBundle(serverCode);

  if (!experience?.tools) {
    console.error("Error: Could not extract experience module.");
    process.exit(1);
  }

  if (!experience.tests || experience.tests.length === 0) {
    console.log("No tests found. Add tests via defineTest() in your experience.\n");
    process.exit(0);
  }

  console.log(`Running ${experience.tests.length} test(s)...\n`);

  let passed = 0;
  let failed = 0;

  for (const test of experience.tests) {
    const helpers = createTestHelpers(experience.tools);
    try {
      await test.run(helpers);
      console.log(`  \x1b[32mPASS\x1b[0m  ${test.name}`);
      passed++;
    } catch (err: any) {
      console.log(`  \x1b[31mFAIL\x1b[0m  ${test.name}`);
      console.log(`        ${err.message}\n`);
      failed++;
    }
  }

  console.log(`\n${passed} passed, ${failed} failed, ${passed + failed} total`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Test runner failed:", err.message || err);
  process.exit(1);
});
