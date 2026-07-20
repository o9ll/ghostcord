#!/usr/bin/env node
/**
 * Post-build patch script for Ghostcord
 * Patches preload.js to work without contextIsolation
 */

const { readFileSync, writeFileSync } = require("fs");
const { join } = require("path");

const preloadPath = join(__dirname, "..", "dist", "desktop", "preload.js");

console.log("[patch] Patching preload.js...");

let content = readFileSync(preloadPath, "utf-8");

// 1. Replace all instances of `contextBridge.exposeInMainWorld` with `window[key]=val`.
const before = (content.match(/contextBridge/g) || []).length;
content = content.replace(
    /i\.contextBridge\.exposeInMainWorld\(([^,]+),([^)]+)\)/g,
    '(typeof window !== "undefined" && (window[$1]=$2))'
);

// 2. Secure require(process.env.DISCORD_PRELOAD)
content = content.replace(
    "require(process.env.DISCORD_PRELOAD)",
    "process.env.DISCORD_PRELOAD && require(process.env.DISCORD_PRELOAD)"
);

const after = (content.match(/contextBridge/g) || []).length;
writeFileSync(preloadPath, content, "utf-8");

console.log(`[patch] Done. contextBridge replaced: ${before} → ${after}`);
console.log(`[patch] DISCORD_PRELOAD safe: ${content.includes("process.env.DISCORD_PRELOAD &&")}`);
