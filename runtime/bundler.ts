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
  import_sdk: "{ defineExperience: defineExperience, defineTool: defineTool, defineTest: defineTest, defineStream: defineStream, quickTool: quickTool, phaseTool: phaseTool, undoTool: undoTool, defineRoomConfig: defineRoomConfig, createChatTools: createChatTools, useChat: useChat, ChatPanel: ChatPanel, createBugReportTools: createBugReportTools, ReportBug: ReportBug, useBlob: useBlob, useUndo: useUndo, usePhase: usePhase, useParticipants: useParticipants, ColorPicker: ColorPicker, Slider: Slider, Button: Button, Badge: Badge, SceneRenderer: SceneRenderer, useSceneTweens: useSceneTweens, useParticleTick: useParticleTick, useSceneInteraction: useSceneInteraction, useSceneDrag: useSceneDrag, useSceneSelection: useSceneSelection, useSceneViewport: useSceneViewport, createScene: createScene, createNode: createNode, sceneTools: sceneTools, createSceneTools: createSceneTools, walkNodes: walkNodes, nodeById: nodeById, findNodes: findNodes, allNodeIds: allNodeIds, nodeCount: nodeCount, cloneScene: cloneScene, removeNodeById: removeNodeById, findParent: findParent, PathBuilder: PathBuilder, createSceneSchemas: createSceneSchemas, easingFunctions: easingFunctions, interpolateTween: interpolateTween, createRuleTools: createRuleTools, ruleTools: ruleTools, useRuleTick: useRuleTick, nodeMatchesSelector: nodeMatchesSelector, default: { defineExperience: defineExperience, defineTool: defineTool, defineTest: defineTest, defineStream: defineStream, quickTool: quickTool, phaseTool: phaseTool, undoTool: undoTool, defineRoomConfig: defineRoomConfig, createChatTools: createChatTools, useChat: useChat, ChatPanel: ChatPanel, createBugReportTools: createBugReportTools, ReportBug: ReportBug } }",
  import_vibevibes_sdk: "{ defineExperience: defineExperience, defineTool: defineTool, defineTest: defineTest, defineStream: defineStream, quickTool: quickTool, phaseTool: phaseTool, undoTool: undoTool, defineRoomConfig: defineRoomConfig, createChatTools: createChatTools, useChat: useChat, ChatPanel: ChatPanel, createBugReportTools: createBugReportTools, ReportBug: ReportBug, useBlob: useBlob, useUndo: useUndo, usePhase: usePhase, useParticipants: useParticipants, ColorPicker: ColorPicker, Slider: Slider, Button: Button, Badge: Badge, SceneRenderer: SceneRenderer, useSceneTweens: useSceneTweens, useParticleTick: useParticleTick, useSceneInteraction: useSceneInteraction, useSceneDrag: useSceneDrag, useSceneSelection: useSceneSelection, useSceneViewport: useSceneViewport, createScene: createScene, createNode: createNode, sceneTools: sceneTools, createSceneTools: createSceneTools, walkNodes: walkNodes, nodeById: nodeById, findNodes: findNodes, allNodeIds: allNodeIds, nodeCount: nodeCount, cloneScene: cloneScene, removeNodeById: removeNodeById, findParent: findParent, PathBuilder: PathBuilder, createSceneSchemas: createSceneSchemas, easingFunctions: easingFunctions, interpolateTween: interpolateTween, createRuleTools: createRuleTools, ruleTools: ruleTools, useRuleTick: useRuleTick, nodeMatchesSelector: nodeMatchesSelector, default: { defineExperience: defineExperience, defineTool: defineTool, defineTest: defineTest, defineStream: defineStream, quickTool: quickTool, phaseTool: phaseTool, undoTool: undoTool, defineRoomConfig: defineRoomConfig, createChatTools: createChatTools, useChat: useChat, ChatPanel: ChatPanel, createBugReportTools: createBugReportTools, ReportBug: ReportBug } }",
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
  const sdk = await import("@vibevibes/sdk");
  const { defineExperience, defineTool, defineTest, undoTool, defineRoomConfig, quickTool } = sdk as any;
  const phaseTool = (sdk as any).phaseTool ?? ((zod: any, validPhases?: readonly string[]) => ({
    name: "_phase.set",
    description: "Transition to a new phase/stage of the experience",
    input_schema: zod.object({ phase: validPhases ? zod.enum(validPhases as [string, ...string[]]) : zod.string() }),
    risk: "low", capabilities_required: ["state.write"],
    handler: async (ctx: any, input: { phase: string }) => { ctx.setState({ ...ctx.state, phase: input.phase }); return { phase: input.phase }; },
  }));
  const defineStream = (sdk as any).defineStream ?? ((c: any) => c);
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

  // Stubs for browser-only components and hooks (referenced in CJS shims)
  const createChatTools = (sdk as any).createChatTools ?? (() => []);
  const useChat = noop;
  const ChatPanel = noop;
  const createBugReportTools = (sdk as any).createBugReportTools ?? (() => []);
  const ReportBug = noop;
  const useBlob = noop;
  const useUndo = noop;
  const usePhase = noop;
  const useParticipants = noop;
  const ColorPicker = noop;
  const Slider = noop;
  const Button = noop;
  const Badge = noop;

  // Scene-related exports (tools work server-side, renderers/hooks are stubs)
  const SceneRenderer = noop;
  const useSceneTweens = noop;
  const useParticleTick = noop;
  const useSceneInteraction = noop;
  const useSceneDrag = noop;
  const useSceneSelection = noop;
  const useSceneViewport = noop;
  const createScene = (sdk as any).createScene ?? ((opts: any) => ({ _sceneVersion: 1, root: { id: 'root', type: 'group', children: [] }, camera: { x: 400, y: 300, zoom: 1 }, background: opts?.background ?? '#1a1a2e', width: opts?.width ?? 800, height: opts?.height ?? 600, gradients: [], filters: [] }));
  const createNode = (sdk as any).createNode ?? noop;
  const sceneTools = (sdk as any).sceneTools ?? (() => []);
  const createSceneTools = (sdk as any).createSceneTools ?? (() => []);
  const walkNodes = (sdk as any).walkNodes ?? noop;
  const nodeById = (sdk as any).nodeById ?? noop;
  const findNodes = (sdk as any).findNodes ?? (() => []);
  const allNodeIds = (sdk as any).allNodeIds ?? (() => []);
  const nodeCount = (sdk as any).nodeCount ?? (() => 0);
  const cloneScene = (sdk as any).cloneScene ?? ((s: any) => JSON.parse(JSON.stringify(s)));
  const removeNodeById = (sdk as any).removeNodeById ?? noop;
  const findParent = (sdk as any).findParent ?? noop;
  const PathBuilder = (sdk as any).PathBuilder ?? {};
  const createSceneSchemas = (sdk as any).createSceneSchemas ?? noop;
  const easingFunctions = (sdk as any).easingFunctions ?? {};
  const interpolateTween = (sdk as any).interpolateTween ?? noop;

  // Rule engine exports
  const createRuleTools = (sdk as any).createRuleTools ?? (() => []);
  const ruleTools = (sdk as any).ruleTools ?? (() => []);
  const useRuleTick = noop;
  const nodeMatchesSelector = (sdk as any).nodeMatchesSelector ?? (() => false);

  const fn = new Function(
    "React", "Y", "z",
    "defineExperience", "defineTool", "defineTest", "defineStream", "quickTool", "phaseTool", "undoTool",
    "defineRoomConfig",
    "createChatTools", "useChat", "ChatPanel",
    "createBugReportTools", "ReportBug",
    "useBlob", "useUndo", "usePhase", "useParticipants", "ColorPicker", "Slider", "Button", "Badge",
    "SceneRenderer", "useSceneTweens", "useParticleTick",
    "useSceneInteraction", "useSceneDrag", "useSceneSelection", "useSceneViewport",
    "createScene", "createNode", "sceneTools",
    "createSceneTools",
    "walkNodes", "nodeById", "findNodes", "allNodeIds", "nodeCount",
    "cloneScene", "removeNodeById", "findParent",
    "PathBuilder", "createSceneSchemas", "easingFunctions", "interpolateTween",
    "createRuleTools", "ruleTools", "useRuleTick", "nodeMatchesSelector",
    "require", "exports", "module", "console",
    `"use strict";\n${serverCode}\nreturn typeof __experience_export__ !== 'undefined' ? __experience_export__ : (typeof module !== 'undefined' ? module.exports : undefined);`
  );

  const fakeModule = { exports: {} };
  const result = fn(
    stubReact, {}, z,
    defineExperience, defineTool, defineTest, defineStream, quickTool, phaseTool, undoTool,
    defineRoomConfig,
    createChatTools, useChat, ChatPanel,
    createBugReportTools, ReportBug,
    useBlob, useUndo, usePhase, useParticipants, ColorPicker, Slider, Button, Badge,
    SceneRenderer, useSceneTweens, useParticleTick,
    useSceneInteraction, useSceneDrag, useSceneSelection, useSceneViewport,
    createScene, createNode, sceneTools,
    createSceneTools,
    walkNodes, nodeById, findNodes, allNodeIds, nodeCount,
    cloneScene, removeNodeById, findParent,
    PathBuilder, createSceneSchemas, easingFunctions, interpolateTween,
    createRuleTools, ruleTools, useRuleTick, nodeMatchesSelector,
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
  // Pattern: `const { useState, useEffect, ... } = React;` or `var { useState } = React2;`
  // esbuild numbers variants (React, React2, React3) when multiple files import React.
  // These are already provided by the injected baseGlobals below, so duplicates cause
  // "Identifier 'X' has already been declared" at runtime.
  code = code.replace(
    /(?:const|let|var)\s+\{[^}]*?\b(?:useState|useEffect|useCallback|useMemo|useRef|useContext|useReducer)\b[^}]*?\}\s*=\s*React\d*\s*;/g,
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
const defineStream = globalThis.defineStream || ((c) => c);
const defineRoomConfig = globalThis.defineRoomConfig || ((c) => c);
const quickTool = globalThis.quickTool;
const phaseTool = globalThis.phaseTool;
const { useToolCall, useSharedState, useOptimisticTool, useParticipants, useAnimationFrame, useFollow, useTypingIndicator, useUndo, useDebounce, useThrottle, useChat, useBlob, usePhase } = globalThis.vibevibesHooks || {};
const { Button, Card, Input, Badge, Stack, Grid, Slider, Textarea, Modal, ColorPicker, Dropdown, Tabs, ChatPanel, ReportBug } = globalThis.vibevibesComponents || {};
const undoTool = globalThis.undoTool || (() => ({}));
const createChatTools = globalThis.createChatTools || (() => []);
const createBugReportTools = globalThis.createBugReportTools || (() => []);
const { SceneRenderer, useSceneTweens, useParticleTick, useSceneInteraction, useSceneDrag, useSceneSelection, useSceneViewport, createScene, createNode, sceneTools, createSceneTools, walkNodes, nodeById, findNodes, allNodeIds, nodeCount, cloneScene, removeNodeById, findParent, PathBuilder, createSceneSchemas, easingFunctions, interpolateTween, createRuleTools, ruleTools, useRuleTick, nodeMatchesSelector } = globalThis.vibevibesScene || {};
`;

  // When multiple files import the same external, esbuild ESM creates numbered
  // variable references (React2, z2, etc). Alias them back to the base global.
  // Auto-extract all identifiers declared in baseGlobals so nothing gets missed.
  const esmAliases: Record<string, string> = {};
  {
    // Match: const X =, const { A, B, C } =, function X(
    // This catches every identifier declared in the injected baseGlobals.
    const constAssign = /\bconst\s+(\w+)\s*=/g;
    const constDestructure = /\bconst\s+\{([^}]+)\}/g;
    const funcDecl = /\bfunction\s+(\w+)\s*\(/g;
    let m;
    while ((m = constAssign.exec(baseGlobals)) !== null) esmAliases[m[1]] = m[1];
    while ((m = constDestructure.exec(baseGlobals)) !== null) {
      for (const name of m[1].split(",").map(s => s.trim()).filter(Boolean)) {
        esmAliases[name] = name;
      }
    }
    while ((m = funcDecl.exec(baseGlobals)) !== null) esmAliases[m[1]] = m[1];
  }

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

/**
 * Validate a client bundle for common issues that would crash at runtime.
 * Checks: syntax errors (SyntaxError), duplicate declarations, unresolved numbered references.
 * Returns null if OK, or an error message string.
 */
export function validateClientBundle(code: string): string | null {
  // 1. Syntax check — strip ESM exports so new Function() can parse it
  const cleaned = code
    .replace(/\bexport\s*\{[^}]*\}/g, "")
    .replace(/\bexport\s+default\s+/g, "var __default = ")
    .replace(/\bexport\s+(const|let|var|function|class)\s/g, "$1 ");
  try {
    new Function(cleaned);
  } catch (err: any) {
    return `SyntaxError: ${err.message}`;
  }

  // 2. Unresolved numbered references check (e.g. useToolCall2, Button3)
  // Collect all declared identifiers
  const definedNames = new Set<string>();
  const lines = code.split("\n");
  for (const line of lines) {
    let m;
    if ((m = line.match(/\b(?:const|let|var)\s+(\w+)\s*=/))) definedNames.add(m[1]);
    if ((m = line.match(/\bfunction\s+(\w+)\s*\(/))) definedNames.add(m[1]);
    if ((m = line.match(/\b(?:const|let|var)\s+\{([^}]+)\}/))) {
      for (const n of m[1].split(",").map((s: string) => s.trim()).filter(Boolean)) definedNames.add(n);
    }
  }
  // Scan for Foo2, Foo3, etc. where Foo is defined but Foo2 is not
  const refPattern = /\b([A-Za-z_]\w*?)(\d+)\b/g;
  const unresolved: string[] = [];
  let match;
  while ((match = refPattern.exec(code)) !== null) {
    const numbered = match[0];
    const base = match[1];
    if (!definedNames.has(numbered) && definedNames.has(base) && base.length > 1) {
      if (!unresolved.includes(numbered)) unresolved.push(numbered);
    }
  }
  if (unresolved.length > 0) {
    return `Unresolved references (will crash at runtime): ${unresolved.join(", ")}`;
  }

  return null;
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
