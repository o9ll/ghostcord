/*
 * Ghostcord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// HeaderBarAPI patches are in src/plugins/_api/headerBar.ts
// This file exists only to satisfy the equicordplugins/_api build system

import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";

export default definePlugin({
    name: "HeaderBarAPIEquicord",
    description: "Equicord extension stub for HeaderBarAPI",
    authors: [Devs.prism],
    hidden: true,
    patches: []
});
