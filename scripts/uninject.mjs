/*
 * GhostCord — Local uninjector for Discord Desktop
 * Reverts the injection by:
 * 1. Removing the app/ directory created by inject.mjs
 * 2. Restoring _app.asar → app.asar
 *
 * Usage: pnpm uninject   (or: node scripts/uninject.mjs)
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./checkNodeVersion.js";

import { existsSync, readdirSync, readFileSync, renameSync, rmSync } from "fs";
import { join } from "path";

function findAllDiscordResources() {
    const platform = process.platform;
    const candidates = [];

    if (platform === "win32") {
        const localAppData = process.env.LOCALAPPDATA || "";

        for (const channel of ["Discord", "DiscordPTB", "DiscordCanary", "DiscordDevelopment"]) {
            const base = join(localAppData, channel);
            if (!existsSync(base)) continue;
            try {
                const versions = readdirSync(base)
                    .filter(d => /^app-\d+\.\d+\.\d+$/.test(d))
                    .sort()
                    .reverse();
                for (const ver of versions) {
                    candidates.push(join(base, ver, "resources"));
                }
            } catch { }
        }
    } else if (platform === "darwin") {
        candidates.push(
            "/Applications/Discord.app/Contents/Resources",
            "/Applications/Discord PTB.app/Contents/Resources",
            "/Applications/Discord Canary.app/Contents/Resources"
        );
    } else if (platform === "linux") {
        candidates.push(
            "/usr/share/discord/resources",
            "/usr/lib/discord/resources",
            "/opt/discord/resources",
            "/opt/Discord/resources"
        );
    }

    return candidates.filter(p => {
        if (!existsSync(p)) return false;
        return existsSync(join(p, "app")) || existsSync(join(p, "_app.asar"));
    });
}

function uninject(resourcesDir) {
    const appDirPath = join(resourcesDir, "app");
    const backupPath = join(resourcesDir, "_app.asar");
    const appAsarPath = join(resourcesDir, "app.asar");

    if (existsSync(appDirPath)) {
        try {
            if (existsSync(join(appDirPath, "index.js"))) {
                const indexContent = readFileSync(join(appDirPath, "index.js"), "utf-utf-8");
                if (!indexContent.includes("Ghostcord Injector") && !indexContent.includes("Ghostcord")) {
                    console.warn(`\x1b[33m[Ghostcord] The app/ directory exists but does not appear to have been created by Ghostcord.\x1b[0m`);
                    console.warn("\x1b[33m            Aborting to avoid breaking another mod.\x1b[0m");
                    return false;
                }
            }
        } catch { }

        console.log("[Ghostcord] Removing injected app/ directory...");
        rmSync(appDirPath, { recursive: true, force: true });
    } else {
        console.log("\x1b[33m[Ghostcord] No injected app/ directory found.\x1b[0m");
    }

    if (existsSync(backupPath) && !existsSync(appAsarPath)) {
        console.log("[Ghostcord] Restoring _app.asar → app.asar...");
        renameSync(backupPath, appAsarPath);
    } else if (existsSync(backupPath) && existsSync(appAsarPath)) {
        console.log("[Ghostcord] app.asar already present, cleaning up backup...");
        rmSync(backupPath, { force: true });
    }

    console.log(`\x1b[32m[Ghostcord] Successfully uninjected from: ${resourcesDir}\x1b[0m`);
    console.log("\x1b[36m[Ghostcord] Restart Discord to apply changes.\x1b[0m");
    return true;
}

const allResources = findAllDiscordResources();

if (allResources.length === 0) {
    console.error("\x1b[31m[Ghostcord] No Discord installation with injected Ghostcord was found.\x1b[0m");
    console.error("\x1b[33m            Make sure Ghostcord was injected using 'pnpm inject'.\x1b[0m");
    process.exit(1);
}

let uninjectCount = 0;
for (const res of allResources) {
    console.log(`\n[Ghostcord] Found: ${res}`);
    if (uninject(res)) uninjectCount++;
}

if (uninjectCount === 0) {
    console.error("\x1b[31m[Ghostcord] No successful uninjection.\x1b[0m");
    process.exit(1);
}

console.log(`\n\x1b[32m[Ghostcord] ${uninjectCount}/${allResources.length} uninjection(s) successful.\x1b[0m`);
