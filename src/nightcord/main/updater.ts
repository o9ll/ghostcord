/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { app, BrowserWindow, ipcMain } from "electron";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { autoUpdater, UpdateInfo } from "electron-updater";
import { IpcEvents, UpdaterIpcEvents } from "shared/IpcEvents";
import { STATIC_DIR } from "shared/paths";
import { Millis } from "shared/utils/millis";

import { State } from "./settings";
import { DATA_DIR } from "./constants";
import { handle } from "./utils/ipcWrappers";
import { makeLinksOpenExternally } from "./utils/makeLinksOpenExternally";
import { loadView } from "./vesktopStatic";

// Lecture des prefs installeur (%AppData%\Nightcord\settings\installer-prefs.json)
function readInstallerPrefs() {
    const defaults = { defaultPlugins: true, autoUpdate: true };
    try {
        const p = join(DATA_DIR, "settings", "installer-prefs.json");
        if (existsSync(p)) {
            const raw = JSON.parse(readFileSync(p, "utf-8"));
            return { defaultPlugins: raw.defaultPlugins !== false, autoUpdate: raw.autoUpdate !== false };
        }
    } catch { }
    return defaults;
}
const _installerPrefs = readInstallerPrefs();

// Exporte les prefs pour que d'autres modules puissent les lire (ex: plugin defaultPlugins)
export const installerPrefs = _installerPrefs;

let updaterWindow: BrowserWindow | null = null;

autoUpdater.on("update-available", update => {
    if (State.store.updater?.ignoredVersion === update.version) return;
    if ((State.store.updater?.snoozeUntil ?? 0) > Date.now()) return;
    if (update.version === app.getVersion()) return;
    if (updaterWindow && !updaterWindow.isDestroyed()) return;

    // Si autoUpdate est désactivé, on ne s'ouvre pas automatiquement.
    // L'utilisateur devra aller dans Settings > Updater pour voir la mise à jour.
    if (!_installerPrefs.autoUpdate) return;

    openUpdater(update);
});

// Pas d'auto-install : on attend que l'utilisateur clique sur "Installer" dans la fenêtre updater
autoUpdater.on("update-downloaded", () => {
    updaterWindow?.webContents.send(UpdaterIpcEvents.DOWNLOAD_PROGRESS, 100);
});

autoUpdater.on("download-progress", p =>
    updaterWindow?.webContents.send(UpdaterIpcEvents.DOWNLOAD_PROGRESS, p.percent)
);
autoUpdater.on("error", err => updaterWindow?.webContents.send(UpdaterIpcEvents.ERROR, err.message));

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;
autoUpdater.fullChangelog = true;

// On diffère le check de mise à jour APRÈS que app soit prête et la fenêtre principale chargée
// pour éviter un freeze au démarrage quand Discord est lancé juste avant Nightcord.
const isOutdated: Promise<boolean> = new Promise(resolve => {
    app.whenReady().then(() => {
        // Petit délai pour laisser la fenêtre principale s'initialiser complètement
        setTimeout(() => {
            autoUpdater.checkForUpdates()
                .then(res => {
                    if (!res?.isUpdateAvailable) return resolve(false);
                    if (res.updateInfo?.version === app.getVersion()) return resolve(false);
                    resolve(true);
                })
                .catch(() => resolve(false));
        }, 5000);
    });
});

handle(IpcEvents.UPDATER_IS_OUTDATED, () => isOutdated);
handle(IpcEvents.UPDATER_OPEN, async () => {
    const res = await autoUpdater.checkForUpdates();
    if (res?.isUpdateAvailable && res.updateInfo) openUpdater(res.updateInfo);
});

function openUpdater(update: UpdateInfo) {
    // Éviter d'ouvrir plusieurs fenêtres updater en même temps
    if (updaterWindow && !updaterWindow.isDestroyed()) {
        updaterWindow.focus();
        return;
    }

    // Nettoyer les anciens handlers avant d'en enregistrer de nouveaux
    // pour éviter l'erreur "handler already registered" qui gèle le renderer
    ipcMain.removeHandler(UpdaterIpcEvents.GET_DATA);
    ipcMain.removeHandler(UpdaterIpcEvents.INSTALL);
    ipcMain.removeHandler(UpdaterIpcEvents.SNOOZE_UPDATE);
    ipcMain.removeHandler(UpdaterIpcEvents.IGNORE_UPDATE);

    updaterWindow = new BrowserWindow({
        title: "Nightcord Updater",
        autoHideMenuBar: true,
        ...(process.platform === "win32"
            ? { icon: join(STATIC_DIR, "icon.ico") }
            : process.platform === "linux"
              ? { icon: join(STATIC_DIR, "icon.png") }
              : {}),
        webPreferences: {
            preload: join(__dirname, "updaterPreload.js")
        },
        minHeight: 400,
        minWidth: 750
    });
    makeLinksOpenExternally(updaterWindow);

    handle(UpdaterIpcEvents.GET_DATA, () => ({
        update,
        version: app.getVersion(),
        autoUpdate: _installerPrefs.autoUpdate
    }));
    handle(UpdaterIpcEvents.INSTALL, async () => {
        await autoUpdater.downloadUpdate();
        // L'utilisateur a cliqué "Installer" — on installe et redémarre
        autoUpdater.quitAndInstall(false, true);
    });
    handle(UpdaterIpcEvents.SNOOZE_UPDATE, () => {
        State.store.updater ??= {};
        State.store.updater.snoozeUntil = Date.now() + 1 * Millis.DAY;
        updaterWindow?.close();
    });
    handle(UpdaterIpcEvents.IGNORE_UPDATE, () => {
        State.store.updater ??= {};
        State.store.updater.ignoredVersion = update.version;
        updaterWindow?.close();
    });

    updaterWindow.on("closed", () => {
        ipcMain.removeHandler(UpdaterIpcEvents.GET_DATA);
        ipcMain.removeHandler(UpdaterIpcEvents.INSTALL);
        ipcMain.removeHandler(UpdaterIpcEvents.SNOOZE_UPDATE);
        ipcMain.removeHandler(UpdaterIpcEvents.IGNORE_UPDATE);
        updaterWindow = null;
    });

    loadView(updaterWindow, "updater/index.html");
}
