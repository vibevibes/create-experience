/**
 * Experience bundler — produces server and client bundles from src/index.tsx.
 *
 * Server bundle: CJS, eval'd via new Function() to extract tools + manifest.
 * Client bundle: ESM, loaded in browser via blob URL + dynamic import().
 */

import * as esbuild from "esbuild";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");

const EXTERNALS = ["react", "react/jsx-runtime", "react-dom", "yjs", "zod", "@vibevibes/sdk"];

/**
 * Strip import/export statements for external packages.
 * The runtime provides these via globalThis (browser) or function args (server).
 */
function stripExternalImports(code: string): string {
  let result = code;
  for (const ext of EXTERNALS) {
    const escaped = ext.replace(/[.*+?^${}()|[\]\\\/]/g, "\\$&");
    // ESM: import X from "pkg"; or import { X } from "pkg";
    result = result.replace(
      new RegExp(`import\\s+[^;]*?from\\s+["']${escaped}["'];?`, "g"),
      ""
    );
    // Type-only imports
    result = result.replace(
      new RegExp(`import\\s+type\\s+[^;]*?from\\s+["']${escaped}["'];?`, "g"),
      ""
    );
    // CJS: var import_X = __toESM(require("pkg"), N); or var import_X = require("pkg");
    // Match the entire line including optional __toESM wrapper and trailing args
    result = result.replace(
      new RegExp(`var\\s+\\w+\\s*=\\s*(?:__toESM\\()?require\\(["']${escaped}["']\\)[^;]*;`, "g"),
      ""
    );
  }
  return result;
}

/**
 * Base CJS shim definitions for esbuild-generated variable references.
 * esbuild uses the last path segment: "react" → import_react, "zod" → import_zod, etc.
 */
const CJS_BASE_SHIMS: Record<string, string> = {
  import_react: "{ default: React, __esModule: true, createElement: React.createElement, Fragment: React.Fragment, useState: React.useState, useEffect: React.useEffect, useCallback: React.useCallback, useMemo: React.useMemo, useRef: React.useRef }",
  import_zod: "{ z: z, default: z }",
  import_yjs: "{ default: Y }",
  import_sdk: "{ defineExperience: defineExperience, defineTool: defineTool, defineTest: defineTest, undoTool: undoTool, defineRoomConfig: defineRoomConfig, default: { defineExperience: defineExperience, defineTool: defineTool, defineTest: defineTest, undoTool: undoTool, defineRoomConfig: defineRoomConfig } }",
  import_vibevibes_sdk: "{ defineExperience: defineExperience, defineTool: defineTool, defineTest: defineTest, undoTool: undoTool, defineRoomConfig: defineRoomConfig, default: { defineExperience: defineExperience, defineTool: defineTool, defineTest: defineTest, undoTool: undoTool, defineRoomConfig: defineRoomConfig } }",
};

/**
 * Inject CJS shim variables so that esbuild's generated references resolve correctly.
 * When multiple files import the same external, esbuild creates numbered variants
 * (import_react2, import_react3, etc). We detect those and alias them to the base shim.
 */
function injectCjsShims(code: string): string {
  const lines: string[] = [];

  // Emit base shims
  for (const [name, value] of Object.entries(CJS_BASE_SHIMS)) {
    lines.push(`var ${name} = ${value};`);
  }

  // Scan for numbered variants (e.g. import_react2, import_zod3) and alias them
  for (const baseName of Object.keys(CJS_BASE_SHIMS)) {
    const pattern = new RegExp(`\\b(${baseName}(\\d+))\\b`, "g");
    const seen = new Set<string>();
    let match;
    while ((match = pattern.exec(code)) !== null) {
      const numberedName = match[1];
      if (!seen.has(numberedName)) {
        seen.add(numberedName);
        lines.push(`var ${numberedName} = ${baseName};`);
      }
    }
  }

  return lines.join("\n");
}

/**
 * Bundle for server-side tool execution (Node.js eval).
 * Returns the raw ExperienceModule extracted via new Function().
 */
export async function bundleForServer(entryPath: string) {
  const result = await esbuild.build({
    entryPoints: [entryPath],
    bundle: true,
    format: "cjs",
    platform: "node",
    target: "es2022",
    write: false,
    external: EXTERNALS,
    jsx: "transform",
    jsxFactory: "React.createElement",
    jsxFragment: "React.Fragment",
    logLevel: "silent",
  });

  let code = result.outputFiles[0].text;
  code = stripExternalImports(code);

  // Strip user-code React hook destructuring (already provided by CJS shims)
  code = code.replace(
    /(?:const|let|var)\s+\{[^}]*?\b(?:useState|useEffect|useCallback|useMemo|useRef|useContext|useReducer)\b[^}]*?\}\s*=\s*(?:React|import_react\w*)\s*;/g,
    "/* [vibevibes] stripped duplicate React destructuring */"
  );

  // Inject CJS shims for esbuild-generated variable references
  // Pass code so we can detect numbered variants (import_react2, etc.)
  code = injectCjsShims(code) + "\n" + code;

  // Replace module.exports/export default with variable assignment
  code = code.replace(
    /module\.exports\s*=\s*/g,
    "var __experience_export__ = "
  );
  code = code.replace(
    /exports\.default\s*=\s*/g,
    "var __experience_export__ = "
  );

  return code;
}

/**
 * Evaluate a server bundle and extract the ExperienceModule.
 */
export async function evalServerBundle(serverCode: string): Promise<any> {
  const { defineExperience, defineTool, defineTest, undoTool, defineRoomConfig } = await import("@vibevibes/sdk");
  // Stub React for server-side (tools don't render)
  const noop = () => null;
  const stubReact = {
    createElement: noop, Fragment: "Fragment",
    useState: noop, useEffect: noop, useCallback: noop,
    useMemo: noop, useRef: noop, useContext: noop, useReducer: noop,
    createContext: noop, forwardRef: noop, memo: (x: any) => x,
  };
  const zodModule = await import("zod");
  const z = zodModule.z ?? zodModule.default ?? zodModule;

  const fn = new Function(
    "React", "Y", "z",
    "defineExperience", "defineTool", "defineTest", "undoTool",
    "defineRoomConfig",
    "require", "exports", "module", "console",
    `"use strict";\n${serverCode}\nreturn typeof __experience_export__ !== 'undefined' ? __experience_export__ : (typeof module !== 'undefined' ? module.exports : undefined);`
  );

  const fakeModule = { exports: {} };
  const result = fn(
    stubReact, {}, z,
    defineExperience, defineTool, defineTest, undoTool,
    defineRoomConfig,
    () => ({}), fakeModule.exports, fakeModule, console,
  );

  return result?.default ?? result ?? fakeModule.exports?.default ?? fakeModule.exports;
}

/**
 * Bundle for client-side Canvas rendering (browser eval).
 * Returns ESM source string that can be loaded via blob URL + dynamic import().
 */
export async function bundleForClient(entryPath: string): Promise<string> {
  const result = await esbuild.build({
    entryPoints: [entryPath],
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2020",
    write: false,
    external: EXTERNALS,
    jsx: "transform",
    jsxFactory: "React.createElement",
    jsxFragment: "React.Fragment",
    logLevel: "silent",
  });

  let code = result.outputFiles[0].text;
  code = stripExternalImports(code);

  // Strip user-code React hook destructuring that would collide with injected globals.
  // Pattern: `const { useState, useEffect, ... } = React;` or `var { useState } = React;`
  // These are already provided by the injected baseGlobals below, so duplicates cause
  // "Identifier 'X' has already been declared" at runtime.
  code = code.replace(
    /(?:const|let|var)\s+\{[^}]*?\b(?:useState|useEffect|useCallback|useMemo|useRef|useContext|useReducer)\b[^}]*?\}\s*=\s*React\s*;/g,
    "/* [vibevibes] stripped duplicate React destructuring */"
  );

  // Inject globalThis accessors at the top
  const baseGlobals = `
const React = globalThis.React;
const { useState, useEffect, useCallback, useMemo, useRef, useContext, useReducer, createContext, forwardRef, memo, Fragment, createElement } = React;
// JSX Runtime (used when esbuild generates jsx-runtime imports)
// Automatic runtime: jsx(type, {children, ...props}, key) — key is 3rd arg
// createElement:     createElement(type, props, ...children)  — children are 3rd+ args
function jsx(type, props, key) {
  const { children, ...rest } = props || {};
  if (key !== undefined) rest.key = key;
  return Array.isArray(children)
    ? createElement(type, rest, ...children)
    : children !== undefined
      ? createElement(type, rest, children)
      : createElement(type, rest);
}
function jsxs(type, props, key) { return jsx(type, props, key); }
function jsxDEV(type, props, key) { return jsx(type, props, key); }
const Y = globalThis.Y || {};
const z = globalThis.z;
const defineExperience = globalThis.defineExperience || ((m) => m);
const defineTool = globalThis.defineTool || ((c) => ({ risk: "low", capabilities_required: [], ...c }));
const defineTest = globalThis.defineTest || ((c) => c);
const defineRoomConfig = globalThis.defineRoomConfig || ((c) => c);
const quickTool = globalThis.quickTool;
const { useToolCall, useSharedState, useOptimisticTool, useParticipants, useAnimationFrame, useFollow, useTypingIndicator, useUndo, useDebounce, useThrottle } = globalThis.vibevibesHooks || {};
const { Button, Card, Input, Badge, Stack, Grid, Slider, Textarea, Modal, ColorPicker, Dropdown, Tabs } = globalThis.vibevibesComponents || {};
const undoTool = globalThis.undoTool || (() => ({}));
`;

  // When multiple files import the same external, esbuild ESM creates numbered
  // variable references (React2, z2, etc). Alias them back to the base global.
  const esmAliases: Record<string, string> = {
    React: "React",
    useState: "useState",
    useEffect: "useEffect",
    useCallback: "useCallback",
    useMemo: "useMemo",
    useRef: "useRef",
    useContext: "useContext",
    useReducer: "useReducer",
    Y: "Y",
    z: "z",
    defineExperience: "defineExperience",
    defineTool: "defineTool",
    defineTest: "defineTest",
  };

  const aliasLines: string[] = [];
  for (const [baseName, target] of Object.entries(esmAliases)) {
    // Match e.g. React2, React3, z2 — but not React.createElement or ReactDOM
    const pattern = new RegExp(`\\b(${baseName}(\\d+))\\b`, "g");
    const seen = new Set<string>();
    let match;
    while ((match = pattern.exec(code)) !== null) {
      const numbered = match[1];
      if (!seen.has(numbered)) {
        seen.add(numbered);
        aliasLines.push(`const ${numbered} = ${target};`);
      }
    }
  }

  return baseGlobals + aliasLines.join("\n") + "\n" + code;
}

/**
 * Build both bundles from an entry file. Defaults to src/index.tsx.
 */
export async function buildExperience(entry?: string) {
  const entryPath = entry || path.join(PROJECT_ROOT, "src", "index.tsx");
  const [serverCode, clientCode] = await Promise.all([
    bundleForServer(entryPath),
    bundleForClient(entryPath),
  ]);
  return { serverCode, clientCode };
}

// Run directly: tsx runtime/bundler.ts
if (process.argv[1] && process.argv[1].includes("bundler")) {
  buildExperience()
    .then(({ serverCode, clientCode }) => {
      console.log(`Server bundle: ${serverCode.length} bytes`);
      console.log(`Client bundle: ${clientCode.length} bytes`);
    })
    .catch((err) => {
      console.error("Build failed:", err);
      process.exit(1);
    });
}
