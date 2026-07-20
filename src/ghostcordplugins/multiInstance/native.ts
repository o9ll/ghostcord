/*
 * Ghostcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { app, BrowserWindow, ipcMain,screen, session } from "electron";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "fs";
import { join } from "path";

import { registerMediaPermissionsForSession } from "../../ghostcord/main/mediaPermissions";

const openWindows = new Map<string, BrowserWindow>();

// ─────────────────────────────────────────────────────────────────────────────
// Shared settings (theme, audio, zoom, etc.) across all instances
//
// Each instance runs in its own Electron session (persist:ghostcord-mi-{userId}),
// so its localStorage is completely empty on first launch: Discord starts
// with default settings (no audio device selected, default theme, etc.),
// making the window appear "blank" until the user manually reconfigures everything.
//
// We capture localStorage from the window that triggers the opening (usually
// the main window) and save it to disk. This cache is then injected into
// each new instance via the preload, but ONLY for keys that don't already
// exist in the target profile — we never touch an already customized setting.
// ─────────────────────────────────────────────────────────────────────────────

const SHARED_SETTINGS_FILE = join(app.getPath("userData"), "ghostcord-mi-shared-settings.json");

// Keys we never want to copy from one window to another (account identity)
const SHARED_SETTINGS_BLOCKLIST = new Set(["token"]);

const DUMP_LOCAL_STORAGE_SCRIPT = `
(function() {
    try {
        const out = {};
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (!k || k === "token") continue;
            out[k] = localStorage.getItem(k);
        }
        return JSON.stringify(out);
    } catch (e) {
        return "{}";
    }
})();
`;

function loadSharedSettings(): Record<string, string> {
    try {
        if (!existsSync(SHARED_SETTINGS_FILE)) return {};
        const raw = readFileSync(SHARED_SETTINGS_FILE, "utf-8");
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
        return {};
    }
}

function saveSharedSettings(settings: Record<string, string>): void {
    try {
        writeFileSync(SHARED_SETTINGS_FILE, JSON.stringify(settings), "utf-8");
    } catch (e) {
        console.warn("[GhostcordMI] Failed to save shared settings:", e);
    }
}

/**
 * Captures the localStorage of the window that triggered the action (event.sender)
 * and merges it with the cache already on disk. Never throws an error:
 * on failure, falls back to the existing cache.
 */
async function captureAndMergeSharedSettings(sourceEvent: any): Promise<Record<string, string>> {
    const existing = loadSharedSettings();
    try {
        const sourceWc = sourceEvent?.sender;
        if (!sourceWc || sourceWc.isDestroyed?.()) return existing;
        const dump = await sourceWc.executeJavaScript(DUMP_LOCAL_STORAGE_SCRIPT);
        const captured = JSON.parse(dump || "{}");
        const filtered: Record<string, string> = {};
        for (const [key, value] of Object.entries(captured)) {
            if (SHARED_SETTINGS_BLOCKLIST.has(key)) continue;
            if (typeof value === "string") filtered[key] = value;
        }
        const merged = { ...existing, ...filtered };
        saveSharedSettings(merged);
        return merged;
    } catch {
        return existing;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Intercepts window control IPC for a multi instance.
//
// Native Discord uses ipcMain.handle("DISCORD_WINDOW_CLOSE" | "DISCORD_WINDOW_MINIMIZE" | ...)
// These handlers are registered GLOBALLY by Discord on ipcMain, so they
// catch all events from all windows and call injectedGetWindow(key)
// which always returns the main window.
//
// To work around this, we use webContents.ipc.handle on the webContents
// of each multi-instance window — these handlers are LOCAL to that webContents
// and take priority over the global ipcMain handlers for this sender.
// ─────────────────────────────────────────────────────────────────────────────

function registerWindowControlIpc(win: BrowserWindow): () => void {
    const wc = win.webContents as any; // webContents.ipc exists since Electron 20

    // Native Discord channels (discovered in _core_extracted/bundle.js)
    const CLOSE = "DISCORD_WINDOW_CLOSE";
    const MINIMIZE = "DISCORD_WINDOW_MINIMIZE";
    const MAXIMIZE = "DISCORD_WINDOW_MAXIMIZE";
    const RESTORE = "DISCORD_WINDOW_RESTORE";
    const FULLSCREEN = "DISCORD_WINDOW_TOGGLE_FULLSCREEN";

    // webContents.ipc.handle takes priority over ipcMain.handle for this sender
    const handleClose = () => { if (!win.isDestroyed()) win.close(); };
    const handleMinimize = () => { if (!win.isDestroyed()) win.minimize(); };
    const handleMaximize = () => {
        if (win.isDestroyed()) return;
        if (win.isMaximized()) win.unmaximize(); else win.maximize();
    };
    const handleRestore = () => { if (!win.isDestroyed()) win.restore(); };
    const handleFullscreen = () => { if (!win.isDestroyed()) win.setFullScreen(!win.isFullScreen()); };

    try {
        // webContents.ipc.handle (Electron 20+)
        wc.ipc.handle(CLOSE, handleClose);
        wc.ipc.handle(MINIMIZE, handleMinimize);
        wc.ipc.handle(MAXIMIZE, handleMaximize);
        wc.ipc.handle(RESTORE, handleRestore);
        wc.ipc.handle(FULLSCREEN, handleFullscreen);
    } catch {
        // Fallback: global ipcMain.handle with sender filter
        // (less clean but works on Electron < 20)
        //
        // IMPORTANT: DISCORD_WINDOW_TOGGLE_FULLSCREEN is already registered globally
        // by the main patcher. We do NOT re-register it here to avoid
        // "Attempted to register a second handler" which crashes Discord on startup.
        const guardedHandle = (fn: () => void) => (event: Electron.IpcMainInvokeEvent) => {
            if (BrowserWindow.fromWebContents(event.sender) !== win) return;
            fn();
        };
        // removeHandler first to avoid crash on double call
        ipcMain.removeHandler(CLOSE);
        ipcMain.removeHandler(MINIMIZE);
        ipcMain.removeHandler(MAXIMIZE);
        ipcMain.removeHandler(RESTORE);
        // DO NOT register FULLSCREEN - handled globally by the patcher
        ipcMain.handle(CLOSE, guardedHandle(handleClose));
        ipcMain.handle(MINIMIZE, guardedHandle(handleMinimize));
        ipcMain.handle(MAXIMIZE, guardedHandle(handleMaximize));
        ipcMain.handle(RESTORE, guardedHandle(handleRestore));
        return () => {
            ipcMain.removeHandler(CLOSE);
            ipcMain.removeHandler(MINIMIZE);
            ipcMain.removeHandler(MAXIMIZE);
            ipcMain.removeHandler(RESTORE);
        };
    }

    // Returns the cleanup for webContents.ipc
    return () => {
        try {
            wc.ipc.removeHandler(CLOSE);
            wc.ipc.removeHandler(MINIMIZE);
            wc.ipc.removeHandler(MAXIMIZE);
            wc.ipc.removeHandler(RESTORE);
            wc.ipc.removeHandler(FULLSCREEN);
        } catch { }
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Creates the preload script that injects the token
// ─────────────────────────────────────────────────────────────────────────────

function createTokenPreload(token: string, sharedSettings: Record<string, string> = {}): string {
    // Temporary directory in userData
    const dir = join(app.getPath("userData"), "ghostcord-mi-preloads");
    mkdirSync(dir, { recursive: true });

    const safeToken = JSON.stringify(token); // properly escapes the token
    const safeSharedSettings = JSON.stringify(sharedSettings ?? {});

    const script = `
// Ghostcord MultiInstance — token preload
// Runs in the main world BEFORE Discord
(function() {
    const TOKEN = ${safeToken};
    const SHARED_SETTINGS = ${safeSharedSettings};
    try {
        // Pre-fills shared visual/audio settings (theme, audio device, zoom, ...)
        // ONLY if the key doesn't already exist in this profile, to never overwrite
        // a setting already customized for this specific instance.
        try {
            for (const key in SHARED_SETTINGS) {
                if (key === "token") continue;
                if (localStorage.getItem(key) === null) {
                    localStorage.setItem(key, SHARED_SETTINGS[key]);
                }
            }
        } catch (e) {
            console.warn("[GhostcordMI] Shared settings seed error:", e);
        }

        // Sets the token in localStorage
        Object.defineProperty(window, '__ghostcord_token', { value: TOKEN, writable: false });

        // Patch localStorage.getItem to always return the token
        const _origGetItem = Storage.prototype.getItem;
        const _origSetItem = Storage.prototype.setItem;

        Storage.prototype.getItem = function(key) {
            if (this === localStorage && key === "token") {
                return JSON.stringify(TOKEN);
            }
            return _origGetItem.call(this, key);
        };

        // Also pre-fills
        try { localStorage.setItem("token", JSON.stringify(TOKEN)); } catch(_) {}

        console.log("[GhostcordMI] Token preload active ✓");
    } catch(e) {
        console.warn("[GhostcordMI] Preload error:", e);
    }
})();
`;

    const filePath = join(dir, `token-preload-${Date.now()}.js`);
    writeFileSync(filePath, script, "utf-8");
    return filePath;
}

// ─────────────────────────────────────────────────────────────────────────────
// Opens a new isolated Discord window
// ─────────────────────────────────────────────────────────────────────────────

// Detached icon counter: cycles from 1 to 5
let iconCounter = 1;

// Path to the detached icons folder (multi-instance-icons/ in the dist)
function getDetachedIconDir(): string {
    // In production: {app_dir}/multi-instance-icons/
    // In dev: Desktop/lolll/
    const exeDir = join(process.execPath, "..");
    const prodDir = join(exeDir, "multi-instance-icons");
    if (existsSync(prodDir)) return prodDir;
    // Fallback dev : Desktop/lolll
    const desktopDir = join(app.getPath("desktop"), "lolll");
    if (existsSync(desktopDir)) return desktopDir;
    return prodDir;
}

export async function openInstanceWindow(
    _: any,
    token: string,
    userId: string,
    detached = false,
    username = ""
): Promise<{ ok: boolean; error?: string; }> {
    try {
        // Window already open -> focus
        const existing = openWindows.get(userId);
        if (existing && !existing.isDestroyed()) {
            existing.show();
            existing.focus();
            return { ok: true };
        }

        // Unique ID per instance - Windows groups windows by AppUserModelId
        // By giving each window a different ID, they don't group together
        const uniqueAppId = `ghostcord.instance.${userId}.${Date.now()}`;

        // Icon: rotation 1→2→3→4→5→1→... from multi-instance-icons/
        let currentIconPath = "";
        const iconDir = getDetachedIconDir();
        currentIconPath = join(iconDir, `${iconCounter}.ico`);
        if (!existsSync(currentIconPath)) currentIconPath = "";
        iconCounter = iconCounter >= 5 ? 1 : iconCounter + 1;

        // Session Electron isolee par userId
        const partition = `persist:ghostcord-mi-${userId}`;
        const ses = session.fromPartition(partition, { cache: true });

        ses.webRequest.onHeadersReceived((details, callback) => {
            const headers = { ...details.responseHeaders };
            for (const key of Object.keys(headers)) {
                const low = key.toLowerCase();
                if (low === "content-security-policy" || low === "permissions-policy" || low === "feature-policy") {
                    delete headers[key];
                }
            }
            callback({ responseHeaders: headers });
        });

        registerMediaPermissionsForSession(ses);

        const sharedSettings = await captureAndMergeSharedSettings(_);
        const preloadPath = createTokenPreload(token, sharedSettings);
        ses.setPreloads([preloadPath]);

        const win = new BrowserWindow({
            width: 1280,
            height: 800,
            minWidth: 940,
            minHeight: 500,
            parent: undefined,
            skipTaskbar: false,
            frame: false,
            transparent: false,
            titleBarStyle: "hidden",
            autoHideMenuBar: true,
            darkTheme: true,
            backgroundColor: "#313338",
            title: `Ghostcord [${username || userId}]`,
            icon: currentIconPath || undefined,
            webPreferences: {
                preload: join(__dirname, "preload.js"),
                contextIsolation: true,
                nodeIntegration: false,
                sandbox: false,
                session: ses,
                webSecurity: false,
            },
        });

        // CRITICAL: setAppDetails MUST be called immediately after new BrowserWindow,
        // before the window is displayed. This is what prevents Windows from grouping
        // windows together in the taskbar.
        if (process.platform === "win32") {
            try {
                win.setAppDetails({
                    appId: uniqueAppId,
                    appIconPath: currentIconPath || undefined,
                    relaunchDisplayName: `Ghostcord [${username || userId}]`,
                });
            } catch (err) {
                console.warn("[GhostcordMI] setAppDetails failed:", err);
            }
        }

        openWindows.set(userId, win);

        win.on("enter-html-full-screen", () => {
            win.setFullScreen(true);
        });
        win.on("leave-html-full-screen", () => {
            win.setFullScreen(false);
        });

        // Before closing: unregisters service workers and disconnects the gateway
        // to stop all push notifications
        win.on("close", () => {
            wc.executeJavaScript(`
                (async () => {
                    try {
                        const regs = await navigator.serviceWorker.getRegistrations();
                        for (const r of regs) await r.unregister();
                    } catch(e) {}
                    try {
                        // Coupe la connexion gateway Discord
                        const ws = window.__GHOSTCORD_GW_WS__;
                        if (ws && ws.readyState <= 1) ws.close(4000, 'window_close');
                    } catch(e) {}
                })();
            `).catch(() => {});
        });

        // Register window control IPC handlers (DISCORD_WINDOW_*) on this webContents
        // Must be done BEFORE Discord loads its JS (dom-ready)
        const wc = win.webContents;
        const cleanupIpc = registerWindowControlIpc(win);

        win.once("closed", () => {
            cleanupIpc();
            openWindows.delete(userId);
            // Clear the session's service workers to permanently cut off notifications
            ses.clearStorageData({ storages: ["serviceworkers"] }).catch(() => {});
            // Remove the temporary preload file to prevent accumulation on disk
            try { unlinkSync(preloadPath); } catch {}
        });

        // Flash when there are notifications
        wc.on("page-title-updated", (e, title) => {
            if (process.platform === "win32") {
                if (/^\(\d+\)/.test(title)) win.flashFrame(true);
                else win.flashFrame(false);
            }
        });

        // Token injection
        const safeToken = JSON.stringify(token);
        const injectJs = `(function(){ try { localStorage.setItem("token", ${safeToken}); } catch(e) {} })();`;
        wc.on("dom-ready", () => wc.executeJavaScript(injectJs).catch(() => { }));
        wc.on("did-finish-load", () => wc.executeJavaScript(injectJs).catch(() => { }));
        wc.on("did-navigate", () => wc.executeJavaScript(injectJs).catch(() => { }));

        // Window title
        wc.on("page-title-updated", (e, title) => {
            const cleanTitle = title.replace(/^\(\d+\)\s*/, "").replace(/\s*\[.*\]$/, "");
            win.setTitle(`${cleanTitle} [${username || userId}]`);
            e.preventDefault();
        });

        wc.on("will-navigate", (e, url) => {
            if (!/^https:\/\/(ptb\.|canary\.)?discord\.com/.test(url)) e.preventDefault();
        });

        wc.setWindowOpenHandler(({ url }) => {
            if (url.startsWith("http")) require("electron").shell.openExternal(url);
            return { action: "deny" };
        });

        await win.loadURL("https://discord.com/channels/@me");
        return { ok: true };
    } catch (e: any) {
        return { ok: false, error: e?.message ?? String(e) };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Grouped windows — same group as Ghostcord in the taskbar
// Principle: we do NOT touch setAppDetails => the window inherits the AppId
// of the main process (com.ghostcord.app), Windows groups it automatically
// ─────────────────────────────────────────────────────────────────────────────

const openGroupedWindows = new Map<string, BrowserWindow>();

export async function openInstanceWindowGrouped(
    _: any,
    token: string,
    userId: string,
    username = ""
): Promise<{ ok: boolean; error?: string; }> {
    try {
        // Focus si deja ouverte
        const existing = openGroupedWindows.get(userId);
        if (existing && !existing.isDestroyed()) {
            existing.show();
            existing.focus();
            return { ok: true };
        }

        // Session isolee par userId
        const partition = `persist:ghostcord-mi-${userId}`;
        const ses = session.fromPartition(partition, { cache: true });

        ses.webRequest.onHeadersReceived((details, callback) => {
            const headers = { ...details.responseHeaders };
            for (const key of Object.keys(headers)) {
                const low = key.toLowerCase();
                if (low === "content-security-policy" || low === "permissions-policy" || low === "feature-policy") {
                    delete headers[key];
                }
            }
            callback({ responseHeaders: headers });
        });

        registerMediaPermissionsForSession(ses);

        const sharedSettings = await captureAndMergeSharedSettings(_);
        const preloadPath = createTokenPreload(token, sharedSettings);
        ses.setPreloads([preloadPath]);

        const win = new BrowserWindow({
            width: 1280,
            height: 800,
            minWidth: 940,
            minHeight: 500,
            parent: undefined,
            skipTaskbar: false,
            frame: false,
            transparent: false,
            titleBarStyle: "hidden",
            autoHideMenuBar: true,
            darkTheme: true,
            backgroundColor: "#313338",
            title: `Ghostcord [${username || userId}]`,
            webPreferences: {
                preload: join(__dirname, "preload.js"),
                contextIsolation: true,
                nodeIntegration: false,
                sandbox: false,
                session: ses,
                webSecurity: false,
            },
        });

        openGroupedWindows.set(userId, win);

        win.on("enter-html-full-screen", () => {
            win.setFullScreen(true);
        });
        win.on("leave-html-full-screen", () => {
            win.setFullScreen(false);
        });

        // Before closing: unregisters service workers and disconnects the gateway
        win.on("close", () => {
            wc.executeJavaScript(`
                (async () => {
                    try {
                        const regs = await navigator.serviceWorker.getRegistrations();
                        for (const r of regs) await r.unregister();
                    } catch(e) {}
                    try {
                        const ws = window.__GHOSTCORD_GW_WS__;
                        if (ws && ws.readyState <= 1) ws.close(4000, 'window_close');
                    } catch(e) {}
                })();
            `).catch(() => {});
        });

        // Register window control IPC handlers for this grouped instance
        const wc = win.webContents;
        const cleanupIpc = registerWindowControlIpc(win);

        win.once("closed", () => {
            cleanupIpc();
            openGroupedWindows.delete(userId);
            ses.clearStorageData({ storages: ["serviceworkers"] }).catch(() => {});
            try { unlinkSync(preloadPath); } catch {}
        });

        wc.on("page-title-updated", (e, title) => {
            if (process.platform === "win32") {
                if (/^\(\d+\)/.test(title)) win.flashFrame(true);
                else win.flashFrame(false);
            }
        });

        const safeToken = JSON.stringify(token);
        const injectJs = `(function(){ try { localStorage.setItem("token", ${safeToken}); } catch(e) {} })();`;
        wc.on("dom-ready", () => wc.executeJavaScript(injectJs).catch(() => {}));
        wc.on("did-finish-load", () => wc.executeJavaScript(injectJs).catch(() => {}));
        wc.on("did-navigate", () => wc.executeJavaScript(injectJs).catch(() => {}));

        wc.on("page-title-updated", (e, title) => {
            const cleanTitle = title.replace(/^\(\d+\)\s*/, "").replace(/\s*\[.*\]$/, "");
            win.setTitle(`${cleanTitle} [${username || userId}]`);
            e.preventDefault();
        });

        wc.on("will-navigate", (e, url) => {
            if (!/^https:\/\/(ptb\.|canary\.)?discord\.com/.test(url)) e.preventDefault();
        });

        wc.setWindowOpenHandler(({ url }) => {
            if (url.startsWith("http")) require("electron").shell.openExternal(url);
            return { action: "deny" };
        });

        await win.loadURL("https://discord.com/channels/@me");
        return { ok: true };
    } catch (e: any) {
        return { ok: false, error: e?.message ?? String(e) };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Split screen: positions the two windows side by side
// ─────────────────────────────────────────────────────────────────────────────

export async function arrangeSplit(_: any, userId: string): Promise<void> {
    try {
        const secondWin = openWindows.get(userId);
        if (!secondWin || secondWin.isDestroyed()) return;

        const allWins = BrowserWindow.getAllWindows();
        const mainWin = allWins.find(w => w !== secondWin && !w.isDestroyed());
        if (!mainWin) return;

        const display = screen.getDisplayMatching(mainWin.getBounds());
        const { x, y, width, height } = display.workArea;
        const half = Math.floor(width / 2);

        mainWin.setBounds({ x, y, width: half, height }, true);
        secondWin.setBounds({ x: x + half, y, width: width - half, height }, true);
        secondWin.show();
        secondWin.focus();
    } catch (e) {
        console.error("[GhostcordMI] arrangeSplit error:", e);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Liste / ferme les instances
// ─────────────────────────────────────────────────────────────────────────────

export async function getOpenInstances(_: any): Promise<string[]> {
    return [...openWindows.entries()]
        .filter(([, w]) => !w.isDestroyed())
        .map(([id]) => id);
}

export async function closeInstance(_: any, userId: string): Promise<void> {
    const win = openWindows.get(userId);
    if (win && !win.isDestroyed()) win.close();
}
