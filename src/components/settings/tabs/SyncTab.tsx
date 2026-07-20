import {
    addBadgeVisibilityListener,
    BadgeSource,
    getOwnHiddenBadgeSources,
    removeBadgeVisibilityListener,
    setOwnHiddenBadgeSources,
} from "@api/BadgeVisibility";
import { useSettings } from "@api/Settings";
import { beginDiscordOAuth, checkOAuthToken, clearToken, getStoredToken, storeToken } from "@api/OAuth2";
import { authorizeCloud, deauthorizeCloud } from "@api/SettingsSync/cloudSetup";
import { deleteCloudSettings, eraseAllCloudData, getCloudSettings, putCloudSettings } from "@api/SettingsSync/cloudSync";

import { Button } from "@components/Button";
import { CheckedTextInput } from "@components/CheckedTextInput";
import { Divider } from "@components/Divider";
import { Flex } from "@components/Flex";
import { FormSwitch } from "@components/FormSwitch";
import { Heading } from "@components/Heading";
import { CloudDownloadIcon, CloudUploadIcon, DeleteIcon } from "@components/Icons";
import { Link } from "@components/Link";
import { Notice } from "@components/Notice";
import { Paragraph } from "@components/Paragraph";
import { SettingsTab, wrapTab } from "@components/settings/tabs/BaseTab";

import { localStorage } from "@utils/localStorage";
import { Margins } from "@utils/margins";
import { openModal } from "@utils/modal";
import { useForceUpdater } from "@utils/react";
import { findComponentByCodeLazy } from "@webpack";
import { Alerts, React, SearchableSelect, Select, useState, OAuth2AuthorizeModal } from "@webpack/common";
import { t } from "@api/i18n";

const ICON_STYLE: React.CSSProperties = { width: 20, height: 20, borderRadius: 4, verticalAlign: "middle" };
const GHOSTCORD_ICON_STYLE: React.CSSProperties = { width: 20, height: 20, borderRadius: 4, verticalAlign: "middle" };

const GHOSTCORD_ICON_DATA_URI = "data:image/png;base64,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"

function GhostcordIcon() {
    return <img src={GHOSTCORD_ICON_DATA_URI} alt="Ghostcord" style={GHOSTCORD_ICON_STYLE} />;
}

function EquicordIcon() {
    return <img src="https://equicord.org/assets/favicon.png" alt="Equicord" style={ICON_STYLE} />;
}

function VencordIcon() {
    return <img src="https://equicord.org/assets/icons/vencord/icon-light.png" alt="Vencord" style={ICON_STYLE} />;
}

function GlobalBadgesIcon() {
    return <img src="https://equicord.org/assets/icons/misc/userplugin.png" alt="GlobalBadges" style={ICON_STYLE} />;
}

const RefreshIcon = findComponentByCodeLazy("M4 12a8 8 0 0 1 14.93-4H15");
const TrashIcon = findComponentByCodeLazy("2.81h8.36a3");

function validateUrl(url: string) {
    try {
        new URL(url);
        return true;
    } catch {
        return "Invalid URL";
    }
}

const cloudBackendOptions = [
    { label: "Ghostcord Cloud", value: "https://api.o9ll.com/" },
    { label: "Equicord Cloud", value: "https://cloud.equicord.org/" },
    { label: "Vencord Cloud", value: "https://api.vencord.dev/" }
];

const syncDirectionOptions = [
    { label: "Two-way sync (changes go both directions)", value: "both" },
    { label: "This device is the source (upload only)", value: "push" },
    { label: "The cloud is the source (download only)", value: "pull" },
    { label: "Do not sync automatically (manual sync via buttons below only)", value: "manual" }
];

const BADGE_OPTIONS: Array<{ label: string; value: BadgeSource }> = [
    { label: "Ghostcord Badges", value: "ghostcord" },
    { label: "Equicord Badges", value: "equicord" },
    { label: "Vencord Badges", value: "vencord" },
    { label: "GlobalBadges", value: "globalbadges" },
];

function renderPrefix(option: { value: BadgeSource }) {
    switch (option.value) {
        case "ghostcord": return <GhostcordIcon />;
        case "equicord": return <EquicordIcon />;
        case "vencord": return <VencordIcon />;
        case "globalbadges": return <GlobalBadgesIcon />;
        default: return null;
    }
}

function CustomProfileSyncToggle() {
    const settings = useSettings();
    const [token, setToken] = React.useState<string | null>(null);
    const [checking, setChecking] = React.useState(true);
    const [busy, setBusy] = React.useState(false);

    React.useEffect(() => {
        let isMounted = true;
        getStoredToken().then(async t => {
            if (!isMounted) return;
            if (t) {
                const check = await checkOAuthToken(t);
                if (!isMounted) return;
                if (check?.valid) {
                    setToken(t);
                    settings.syncOwnCustomProfile = true;
                    settings.seeAllCustomProfile = true;
                } else {
                    await clearToken();
                    if (!isMounted) return;
                    settings.syncOwnCustomProfile = false;
                    settings.seeAllCustomProfile = false;
                }
            } else {
                settings.syncOwnCustomProfile = false;
                settings.seeAllCustomProfile = false;
            }
            setChecking(false);
        });
        return () => { isMounted = false; };
    }, []);

    const isEnabled = !!token;

    async function handleToggle(on: boolean) {
        if (busy) return;
        if (on) {
            setBusy(true);
            let oauthData: { url: string; redirectUri: string; scopes: string[]; clientId?: string; } | null = null;
            try {
                oauthData = await beginDiscordOAuth();
            } catch (e) {
                console.error("[CustomProfileSync] Failed to fetch OAuth config:", e);
                setBusy(false);
                return;
            }
            setBusy(false);

            let clientId = oauthData.clientId;
            if (!clientId) {
                try {
                    clientId = new URL(oauthData.url).searchParams.get("client_id") ?? undefined;
                } catch { }
            }
            if (!clientId) return;

            openModal(oauthProps => <OAuth2AuthorizeModal
                {...oauthProps}
                scopes={oauthData!.scopes}
                responseType="code"
                redirectUri={oauthData!.redirectUri}
                permissions={0n}
                clientId={clientId!}
                cancelCompletesFlow={false}
                callback={async ({ location }: any) => {
                    if (!location) return;
                    try {
                        const res = await fetch(location, { headers: { Accept: "application/json" } });
                        const { token: newToken } = await res.json();
                        if (newToken) {
                            await storeToken(newToken);
                            setToken(newToken);
                            settings.syncOwnCustomProfile = true;
                            settings.seeAllCustomProfile = true;
                        }
                    } catch (e) {
                        console.error("[CustomProfileSync] OAuth callback failed:", e);
                    }
                }}
            />);
        } else {
            setBusy(true);
            await clearToken();
            setToken(null);
            settings.syncOwnCustomProfile = false;
            settings.seeAllCustomProfile = false;
            setBusy(false);
        }
    }

    if (checking) return null;

    return (
        <div style={{ marginBottom: 16 }}>
            <FormSwitch
                value={isEnabled}
                onChange={handleToggle}
                title={t("Ghostcord Sync")}
                description={isEnabled
                    ? t("Your custom profile is synced. Other Ghostcord users can see your profile, and you can see theirs.")
                    : t("Enable to share your custom profile with other Ghostcord users and see their profiles.")}
                disabled={busy}
            />

            {isEnabled && (
                <div style={{ marginTop: 4 }}>
                    <a role="button" onClick={async () => {
                        await clearToken();
                        setToken(null);
                        settings.syncOwnCustomProfile = false;
                        settings.seeAllCustomProfile = false;
                    }} style={{ fontSize: 12, color: "var(--text-muted)", cursor: "pointer" }}>
                        {t("Disconnect account")}
                    </a>
                </div>
            )}
        </div>
    );
}

function CloudIntegrationSection() {
    const settings = useSettings(["cloud.authenticated", "cloud.url", "cloud.settingsSync"]);
    const [inputKey, setInputKey] = useState(0);
    const forceUpdate = useForceUpdater();

    const { cloud } = settings;
    const isAuthenticated = cloud.authenticated;
    const syncEnabled = isAuthenticated && cloud.settingsSync;

    async function changeUrl(url: string) {
        cloud.url = url;
        cloud.authenticated = false;

        await deauthorizeCloud();
        await authorizeCloud();

        setInputKey(prev => prev + 1);
    }

    return (
        <>
            <Heading className={Margins.top16}>{t("Cloud Integration")}</Heading>
            <Paragraph className={Margins.bottom16}>
                {t("Ghostcord's cloud integration allows you to sync your settings across multiple devices and Discord installations. Your data is securely stored and can be easily restored at any time.")}
            </Paragraph>

            <Notice.Info className={Margins.bottom16}>
                {t("We use our own Ghostcord Cloud backend with enhanced features.")}
                {" "}
                {t("View our privacy policy to see what we store and how we use your data.")}
            </Notice.Info>

            <FormSwitch
                title={t("Enable Cloud Integration")}
                description={t("Connect to the cloud backend for settings synchronization. This will request authorization if you haven't set up cloud integration yet.")}
                value={isAuthenticated}
                onChange={v => {
                    if (v)
                        authorizeCloud();
                    else
                        cloud.authenticated = v;
                }}
                hideBorder
            />

            <Divider className={Margins.top20} />

            <Heading className={Margins.top20}>{t("Cloud Backend")}</Heading>
            <Paragraph className={Margins.bottom16}>
                {t("Choose which cloud backend to use for storing your settings.")}
            </Paragraph>

            <div className={Margins.bottom8}>
                <SearchableSelect
                    options={cloudBackendOptions}
                    value={cloudBackendOptions.find(o => o.value === cloud.url)?.value}
                    onChange={v => changeUrl(v)}
                    closeOnSelect={true}
                    renderOptionPrefix={o => {
                        if (o?.value?.includes("ghostcord")) return <GhostcordIcon />;
                        if (o?.value?.includes("equicord")) return <EquicordIcon />;
                        return <VencordIcon />;
                    }}
                />
            </div>

            <Flex gap="8px" alignItems="center">
                <div style={{ flex: 1 }}>
                    <CheckedTextInput
                        key={"backendUrl-" + inputKey}
                        value={cloud.url}
                        onChange={async v => {
                            cloud.url = v;
                            cloud.authenticated = false;
                            await deauthorizeCloud();
                        }}
                        validate={validateUrl}
                    />
                </div>
                <Button
                    disabled={!isAuthenticated}
                    onClick={async () => {
                        cloud.authenticated = false;
                        await deauthorizeCloud();
                        await authorizeCloud();
                    }}
                >
                    <Flex gap="8px" alignItems="center">
                        <RefreshIcon color="currentColor" />
                        {t("Reauthorize")}
                    </Flex>
                </Button>
            </Flex>

            <Divider className={Margins.top20} />

            <Heading className={Margins.top20}>{t("Settings Sync")}</Heading>
            <Paragraph className={Margins.bottom16}>
                {t("Synchronize your Ghostcord settings to the cloud. This makes it easy to keep your configuration consistent across multiple devices without manual import/export.")}
            </Paragraph>

            <FormSwitch
                title={t("Enable Settings Sync")}
                description={t("When enabled, your settings can be synced to and from the cloud. Use the actions below to manually sync.")}
                value={cloud.settingsSync}
                onChange={v => { cloud.settingsSync = v; }}
                disabled={!isAuthenticated}
                hideBorder
            />

            <Divider className={Margins.top20} />

            <Heading className={Margins.top20}>{t("Sync Rules for This Device")}</Heading>
            <Paragraph className={Margins.bottom16}>
                <span dangerouslySetInnerHTML={{ __html: t("This setting controls how settings move between <strong>this device</strong> and the cloud. You can let changes flow both ways, or choose one place to be the main source of truth.") }} />
            </Paragraph>

            <Select
                options={syncDirectionOptions}
                isSelected={v => v === (localStorage.Vencord_cloudSyncDirection ?? "both")}
                select={v => {
                    localStorage.Vencord_cloudSyncDirection = v;
                    forceUpdate();
                }}
                serialize={v => v}
                isDisabled={!syncEnabled}
            />

            <Flex gap="8px" className={Margins.top16}>
                <Button
                    style={{ flex: 1 }}
                    disabled={!syncEnabled}
                    onClick={() => putCloudSettings(true)}
                >
                    <Flex gap="8px" alignItems="center">
                        <CloudUploadIcon />
                        {t("Sync to Cloud")}
                    </Flex>
                </Button>
                <Button
                    style={{ flex: 1 }}
                    disabled={!syncEnabled}
                    onClick={() => getCloudSettings(true, true)}
                >
                    <Flex gap="8px" alignItems="center">
                        <CloudDownloadIcon />
                        {t("Sync from Cloud")}
                    </Flex>
                </Button>
            </Flex>

            {!isAuthenticated && (
                <Notice.Warning className={Margins.top8}>
                    {t("Enable cloud integration above to use settings sync features.")}
                </Notice.Warning>
            )}

            <Divider className={Margins.top20} />

            <Heading className={Margins.top20}>{t("Danger Zone")}</Heading>
            <Paragraph className={Margins.bottom16}>
                {t("Permanently delete all your data from the cloud. This action cannot be undone and will remove all synced settings and any other data stored on the cloud backend.")}
            </Paragraph>

            <Flex gap="8px">
                <Button
                    variant="dangerPrimary"
                    size="medium"
                    disabled={!syncEnabled}
                    onClick={() => deleteCloudSettings()}
                >
                    <Flex gap="8px" alignItems="center">
                        <TrashIcon color="currentColor" />
                        {t("Delete Cloud Settings")}
                    </Flex>
                </Button>
                <Button
                    variant="dangerSecondary"
                    size="medium"
                    disabled={!isAuthenticated}
                    onClick={() => Alerts.show({
                        title: t("Delete Cloud Account"),
                        body: t("Are you sure you want to permanently delete your cloud account and all associated data? This action cannot be undone."),
                        onConfirm: eraseAllCloudData,
                        confirmText: t("Delete Cloud Account"),
                        confirmColor: "vc-cloud-erase-data-danger-btn",
                        cancelText: t("Cancel")
                    })}
                >
                    <Flex gap="8px" alignItems="center">
                        <DeleteIcon />
                        {t("Delete Cloud Account")}
                    </Flex>
                </Button>
            </Flex>
        </>
    );
}

function SyncTab() {
    const [hidden, setHidden] = useState<BadgeSource[]>(getOwnHiddenBadgeSources());
    const [saving, setSaving] = useState(false);

    React.useEffect(() => {
        const listener = () => setHidden([...getOwnHiddenBadgeSources()]);
        addBadgeVisibilityListener(listener);
        return () => removeBadgeVisibilityListener(listener);
    }, []);

    async function onChange(next: BadgeSource[]) {
        setHidden(next);
        setSaving(true);
        try {
            await setOwnHiddenBadgeSources(next);
        } finally {
            setSaving(false);
        }
    }

    return (
        <SettingsTab>
            <CustomProfileSyncToggle />

            <Divider className={Margins.bottom16} />

            <CloudIntegrationSection />

            <Divider className={Margins.bottom16} />

            <Heading className={Margins.top16}>{t("Badges")}</Heading>
            <Paragraph className={Margins.bottom16}>
                {t("Choose which badge sources to hide on your own profile. Selected sources disappear from your profile for everyone — including yourself — wherever it's viewed.")}
            </Paragraph>

            <Notice.Info className={Margins.bottom16}>
                {t("This only affects your own profile. The first time you select a badge to hide, you'll be asked to sign in with Discord so your preference can be shared with others viewing your profile.")}
            </Notice.Info>

            <Divider className={Margins.bottom16} />

            <Heading className={Margins.bottom8} style={{ fontSize: 14 }}>{t("Hidden Badge Sources")}</Heading>
            <div className={Margins.bottom8}>
                <SearchableSelect
                    multi
                    closeOnSelect={false}
                    options={BADGE_OPTIONS}
                    value={hidden}
                    placeholder={t("None hidden")}
                    onChange={onChange}
                    renderOptionPrefix={renderPrefix}
                />
            </div>

            {saving && (
                <Paragraph className={Margins.top8} style={{ color: "var(--text-muted)", fontSize: 12 }}>
                    {t("Saving...")}
                </Paragraph>
            )}
        </SettingsTab>
    );
}

export default wrapTab(SyncTab, "Synchronization");

