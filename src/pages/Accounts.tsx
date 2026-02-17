import React, { useEffect, useState, useCallback } from "react";
import axios from "axios";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import TransferModal from "../components/TransferModal";

const SOLANA_PURPLE = "#9945ff";
const SOLANA_GREEN = "#14f195";

const labelStyle = {
    display: "block",
    fontSize: "12px",
    fontWeight: "500" as const,
    color: "#9ca3af",
    marginBottom: "6px",
};
const inputStyle = { fontSize: "14px", padding: "10px" };

interface WhitelistEntry {
    address: string;
    label: string;
}

interface AccountAddress {
    index: number;
    address: string;
    sol?: number;
}

interface Account {
    _id: string;
    name: string;
    addresses: AccountAddress[];
    whitelistedAddresses: WhitelistEntry[];
    useWhitelist?: boolean;
    usedByBots?: string[];
}

type WalletAuthAction = "transfer" | "privateKey" | "delete" | "whitelist" | "all";

interface WalletAuthGrant {
    token: string;
    action: WalletAuthAction;
    expiresAt: number;
}

const truncateAddress = (addr: string) =>
    addr.length > 10 ? `${addr.slice(0, 4)}...${addr.slice(-4)}` : addr;

const getTierLabel = (tokenBalance?: number): string => {
    if (!tokenBalance || tokenBalance < 1_000_000) return "Free";
    if (tokenBalance < 10_000_000) return "Free - Level 1";
    return "Free - Level 2";
};

const Accounts: React.FC = () => {
    const { user, logout } = useAuth();
    const navigate = useNavigate();

    const [accounts, setAccounts] = useState<Account[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedAccount, setExpandedAccount] = useState<string | null>(null);
    const [copiedAddress, setCopiedAddress] = useState<string | null>(null);

    // Create account modal
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [createName, setCreateName] = useState("");
    const [createUseWhitelist, setCreateUseWhitelist] = useState(true);
    const [createWhitelist, setCreateWhitelist] = useState<WhitelistEntry[]>([
        { address: "", label: "" },
    ]);
    const [importSeed, setImportSeed] = useState(false);
    const [seedPhraseInput, setSeedPhraseInput] = useState("");
    const [seedPhraseError, setSeedPhraseError] = useState<string | null>(null);
    const [createPassword, setCreatePassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [createLoading, setCreateLoading] = useState(false);
    const [createError, setCreateError] = useState<string | null>(null);

    // Seed phrase reveal modal
    const [showSeedModal, setShowSeedModal] = useState(false);
    const [revealedSeed, setRevealedSeed] = useState("");
    const [seedSaved, setSeedSaved] = useState(false);
    const [seedCopied, setSeedCopied] = useState(false);

    // Transfer modal
    const [transferAccount, setTransferAccount] = useState<Account | null>(null);

    // Whitelist management
    const [whitelistEditing, setWhitelistEditing] = useState<string | null>(null);
    const [newWhitelistAddress, setNewWhitelistAddress] = useState("");
    const [newWhitelistLabel, setNewWhitelistLabel] = useState("");
    const [whitelistLoading, setWhitelistLoading] = useState(false);

    // Delete confirmation modal
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
    const [deletePassword, setDeletePassword] = useState("");
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const [deleteLoading, setDeleteLoading] = useState(false);

    // Wallet action auth tokens (short-lived, scoped per account/action)
    const [walletAuthGrants, setWalletAuthGrants] = useState<Record<string, WalletAuthGrant[]>>({});
    const [passwordPromptFor, setPasswordPromptFor] = useState<{
        accountId: string;
        action: "transfer" | "privateKey" | "delete" | "whitelist";
        addressIndex?: number;
    } | null>(null);
    const [passwordInput, setPasswordInput] = useState("");
    const [passwordError, setPasswordError] = useState<string | null>(null);
    const [passwordLoading, setPasswordLoading] = useState(false);

    // Private key reveal
    const [revealedKeys, setRevealedKeys] = useState<Record<string, string>>({});

    const authHeader = () => ({
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
    });

    const fetchAccounts = useCallback(async () => {
        try {
            const res = await axios.get("/api/accounts", authHeader());
            setAccounts(res.data.accounts || []);
        } catch (err) {
            console.error("Failed to fetch accounts:", err);
        } finally {
            setLoading(false);
        }
    }, []);

    const handleTransferClose = useCallback(() => setTransferAccount(null), []);

    useEffect(() => {
        fetchAccounts();
    }, [fetchAccounts]);

    const cacheWalletAuthToken = useCallback(
        (accountId: string, token: string, action: WalletAuthAction, expiresInSeconds = 600) => {
            const expiresAt = Date.now() + Math.max(1, expiresInSeconds) * 1000;
            setWalletAuthGrants((prev) => {
                const current = (prev[accountId] || []).filter((grant) => grant.expiresAt > Date.now());
                const deduped = current.filter((grant) => grant.action !== action);
                return {
                    ...prev,
                    [accountId]: [...deduped, { token, action, expiresAt }],
                };
            });
        },
        [],
    );

    const getWalletAuthToken = useCallback(
        (accountId: string, requiredAction: Exclude<WalletAuthAction, "all">): string | null => {
            const grants = walletAuthGrants[accountId] || [];
            const now = Date.now();
            const matching = grants.find(
                (grant) =>
                    grant.expiresAt > now
                    && (grant.action === "all" || grant.action === requiredAction),
            );
            return matching?.token || null;
        },
        [walletAuthGrants],
    );

    const handleTransferWalletAuthIssued = useCallback(
        (accountId: string, walletAuthToken: string, action: WalletAuthAction, expiresIn?: number) => {
            cacheWalletAuthToken(accountId, walletAuthToken, action, expiresIn);
        },
        [cacheWalletAuthToken],
    );

    const copyAddress = (address: string) => {
        navigator.clipboard.writeText(address);
        setCopiedAddress(address);
        setTimeout(() => setCopiedAddress(null), 2000);
    };

    // Create account
    const handleCreate = async () => {
        if (!createName.trim()) return;
        if (createPassword.length < 6) {
            setCreateError("Wallet password must be at least 6 characters");
            return;
        }
        if (createPassword !== confirmPassword) {
            setCreateError("Passwords do not match");
            return;
        }
        if (importSeed) {
            const words = seedPhraseInput.trim().split(/\s+/);
            if (words.length !== 12 && words.length !== 24) {
                setSeedPhraseError("Seed phrase must be 12 or 24 words");
                return;
            }
        }
        if (createUseWhitelist) {
            const validEntries = createWhitelist.filter(
                (w) => w.address.trim() && w.label.trim()
            );
            if (validEntries.length === 0) {
                setCreateError("At least one whitelisted address is required when whitelist is enabled");
                return;
            }
        }

        setCreateError(null);
        setSeedPhraseError(null);
        setCreateLoading(true);
        try {
            const whitelisted = createUseWhitelist
                ? createWhitelist.filter((w) => w.address.trim() && w.label.trim())
                : [];
            const payload: any = {
                name: createName.trim(),
                useWhitelist: createUseWhitelist,
                whitelistedAddresses: whitelisted,
                walletPassword: createPassword,
            };
            if (importSeed && seedPhraseInput.trim()) {
                payload.seedPhrase = seedPhraseInput.trim();
            }
            const res = await axios.post("/api/accounts", payload, authHeader());
            setShowCreateModal(false);
            setCreateName("");
            setCreateWhitelist([{ address: "", label: "" }]);
            setCreateUseWhitelist(true);
            setImportSeed(false);
            setSeedPhraseInput("");
            setCreatePassword("");
            setConfirmPassword("");

            // Show seed phrase only for generated seeds
            if (res.data.mnemonic) {
                setRevealedSeed(res.data.mnemonic);
                setSeedSaved(false);
                setSeedCopied(false);
                setShowSeedModal(true);
            }

            fetchAccounts();
        } catch (err: any) {
            const errMsg = err.response?.data?.error || "Failed to create account";
            if (errMsg === "Invalid seed phrase") {
                setSeedPhraseError(errMsg);
            } else {
                setCreateError(errMsg);
            }
        } finally {
            setCreateLoading(false);
        }
    };

    // Delete account (password -> short-lived auth token)
    const handleDelete = async (id: string, password: string) => {
        setDeleteLoading(true);
        setDeleteError(null);
        try {
            const verify = await axios.post(
                `/api/accounts/${id}/verify-password`,
                { walletPassword: password, action: "delete" },
                authHeader(),
            );
            const walletAuthToken = verify.data?.walletAuthToken;
            if (!walletAuthToken) {
                throw new Error("Wallet verification did not return an auth token");
            }
            cacheWalletAuthToken(id, walletAuthToken, "delete", verify.data?.expiresIn);
            await axios.delete(`/api/accounts/${id}`, {
                ...authHeader(),
                data: { walletAuthToken },
            });
            setAccounts((prev) => prev.filter((a) => a._id !== id));
            setDeleteConfirmId(null);
            setDeletePassword("");
            setWalletAuthGrants((prev) => {
                const next = { ...prev };
                delete next[id];
                return next;
            });
        } catch (err: any) {
            setDeleteError(err.response?.data?.error || "Failed to delete account");
        } finally {
            setDeleteLoading(false);
        }
    };

    // Whitelist management
    const handleAddWhitelist = async (accountId: string) => {
        if (!newWhitelistAddress.trim() || !newWhitelistLabel.trim()) return;
        const walletAuthToken = getWalletAuthToken(accountId, "whitelist");
        if (!walletAuthToken) {
            setPasswordPromptFor({ accountId, action: "whitelist" });
            setPasswordInput("");
            setPasswordError(null);
            return;
        }
        setWhitelistLoading(true);
        try {
            await axios.patch(
                `/api/accounts/${accountId}/whitelist`,
                {
                    action: "add",
                    address: newWhitelistAddress.trim(),
                    label: newWhitelistLabel.trim(),
                    walletAuthToken,
                },
                authHeader()
            );
            setNewWhitelistAddress("");
            setNewWhitelistLabel("");
            fetchAccounts();
        } catch (err: any) {
            if (err.response?.status === 403) {
                setPasswordPromptFor({ accountId, action: "whitelist" });
                setPasswordInput("");
                setPasswordError("Session expired. Re-enter wallet password.");
                return;
            }
            alert(err.response?.data?.error || "Failed to add address");
        } finally {
            setWhitelistLoading(false);
        }
    };

    const handleRemoveWhitelist = async (
        accountId: string,
        address: string
    ) => {
        const walletAuthToken = getWalletAuthToken(accountId, "whitelist");
        if (!walletAuthToken) {
            setPasswordPromptFor({ accountId, action: "whitelist" });
            setPasswordInput("");
            setPasswordError(null);
            return;
        }
        try {
            await axios.patch(
                `/api/accounts/${accountId}/whitelist`,
                { action: "remove", address, walletAuthToken },
                authHeader()
            );
            fetchAccounts();
        } catch (err: any) {
            if (err.response?.status === 403) {
                setPasswordPromptFor({ accountId, action: "whitelist" });
                setPasswordInput("");
                setPasswordError("Session expired. Re-enter wallet password.");
                return;
            }
            alert(err.response?.data?.error || "Failed to remove address");
        }
    };

    // Password verification
    const handleVerifyPassword = async () => {
        if (!passwordPromptFor || !passwordInput) return;
        setPasswordLoading(true);
        setPasswordError(null);
        try {
            const verify = await axios.post(
                `/api/accounts/${passwordPromptFor.accountId}/verify-password`,
                { walletPassword: passwordInput, action: passwordPromptFor.action },
                authHeader()
            );
            const walletAuthToken = verify.data?.walletAuthToken as string | undefined;
            if (!walletAuthToken) {
                throw new Error("Wallet verification did not return an auth token");
            }

            const action = passwordPromptFor.action;
            const accountId = passwordPromptFor.accountId;
            const addressIndex = passwordPromptFor.addressIndex;
            cacheWalletAuthToken(accountId, walletAuthToken, action, verify.data?.expiresIn);

            setPasswordPromptFor(null);
            setPasswordInput("");

            // Proceed with the original action
            if (action === "transfer") {
                const account = accounts.find((a) => a._id === accountId);
                if (account) setTransferAccount(account);
            } else if (action === "privateKey" && addressIndex !== undefined) {
                fetchPrivateKey(accountId, addressIndex, walletAuthToken);
            } else if (action === "whitelist") {
                setWhitelistEditing(accountId);
            }
        } catch (err: any) {
            setPasswordError(err.response?.data?.error || "Incorrect password");
        } finally {
            setPasswordLoading(false);
        }
    };

    // Private key export
    const fetchPrivateKey = async (accountId: string, index: number, walletAuthToken: string) => {
        try {
            const res = await axios.post(
                `/api/accounts/${accountId}/private-key`,
                { walletAuthToken, addressIndex: index },
                authHeader()
            );
            const key = `${accountId}-${index}`;
            setRevealedKeys((prev) => ({ ...prev, [key]: res.data.privateKey }));
            // Auto-hide after 30 seconds
            setTimeout(() => {
                setRevealedKeys((prev) => {
                    const updated = { ...prev };
                    delete updated[key];
                    return updated;
                });
            }, 30000);
        } catch (err: any) {
            if (err.response?.status === 403) {
                setPasswordPromptFor({ accountId, action: "privateKey", addressIndex: index });
                setPasswordInput("");
                setPasswordError("Session expired. Re-enter wallet password.");
                return;
            }
            alert(err.response?.data?.error || "Failed to export private key");
        }
    };

    const handleShowKey = (accountId: string, index: number) => {
        const key = `${accountId}-${index}`;
        if (revealedKeys[key]) {
            setRevealedKeys((prev) => {
                const next = { ...prev };
                delete next[key];
                return next;
            });
            return;
        }
        const walletAuthToken = getWalletAuthToken(accountId, "privateKey");
        if (walletAuthToken) {
            fetchPrivateKey(accountId, index, walletAuthToken);
        } else {
            setPasswordPromptFor({ accountId, action: "privateKey", addressIndex: index });
            setPasswordInput("");
            setPasswordError(null);
        }
    };

    const modalOverlay: React.CSSProperties = {
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.8)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 200,
        padding: "16px",
    };

    // Validation for create button
    const isCreateDisabled = () => {
        if (createLoading || !createName.trim()) return true;
        if (createPassword.length < 6 || createPassword !== confirmPassword) return true;
        if (importSeed && !seedPhraseInput.trim()) return true;
        if (createUseWhitelist) {
            const validEntries = createWhitelist.filter(
                (w) => w.address.trim() && w.label.trim()
            );
            if (validEntries.length === 0) return true;
        }
        return false;
    };

    return (
        <div
            style={{
                minHeight: "100vh",
                background: "#0a0a0f",
                color: "white",
            }}
        >
            {/* Header */}
            <header
                className="app-header"
                style={{
                    display: "flex",
                    flexDirection: "column",
                    padding: "12px 16px",
                    borderBottom: "1px solid rgba(255,255,255,0.1)",
                    background: "rgba(0,0,0,0.3)",
                    backdropFilter: "blur(10px)",
                    position: "sticky",
                    top: 0,
                    zIndex: 100,
                    gap: "8px",
                }}
            >
                <div
                    style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                    }}
                >
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        {/* Back arrow */}
                        <button
                            onClick={() => navigate("/dashboard")}
                            style={{
                                background: "none",
                                border: "none",
                                color: "white",
                                cursor: "pointer",
                                fontSize: "22px",
                                padding: "4px 8px",
                                borderRadius: "6px",
                                display: "flex",
                                alignItems: "center",
                            }}
                            title="Back to Dashboard"
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M19 12H5M12 19l-7-7 7-7" />
                            </svg>
                        </button>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <img src="/logo1.png" alt="Stellaris" style={{ width: '28px', height: '28px', opacity: 0.9 }} />
                            <h1 style={{ fontSize: '24px', fontWeight: 600, color: '#f0f0f0', margin: 0, letterSpacing: '-0.02em', lineHeight: 1 }}>
                                Stellaris
                            </h1>
                        </div>
                    </div>
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                        }}
                    >
                        {/* Badges (non-clickable) */}
                        <div
                            style={{
                                padding: "4px 10px",
                                borderRadius: "20px",
                                background: "rgba(255,255,255,0.04)",
                                fontSize: "11px",
                                fontWeight: 500,
                                display: "flex",
                                alignItems: "center",
                                gap: "4px",
                                color: "#9ca3af",
                                cursor: "default",
                            }}
                        >
                            <span style={{ color: "#6b7280" }}>@</span>
                            {user?.username}
                        </div>
                        {user?.tier === "pro" ? (
                            <div
                                style={{
                                    padding: "4px 10px",
                                    borderRadius: "20px",
                                    background: "linear-gradient(135deg, rgba(20,241,149,0.15), rgba(153,69,255,0.15))",
                                    fontSize: "11px",
                                    fontWeight: 500,
                                    color: SOLANA_GREEN,
                                    cursor: "default",
                                }}
                            >
                                Pro
                            </div>
                        ) : (
                            <div
                                style={{
                                    padding: "4px 10px",
                                    borderRadius: "20px",
                                    background: "rgba(255,255,255,0.04)",
                                    fontSize: "11px",
                                    fontWeight: 500,
                                    color: "#6b7280",
                                    cursor: "default",
                                }}
                            >
                                {getTierLabel(user?.tokenBalance)}
                            </div>
                        )}

                        {/* Separator */}
                        <div style={{ width: "1px", height: "20px", background: "rgba(255,255,255,0.1)", margin: "0 4px" }} />

                        {/* Nav buttons (clickable) */}
                        <button
                            onClick={() => navigate("/dashboard")}
                            style={{
                                padding: "6px 12px",
                                borderRadius: "8px",
                                background: "rgba(153,69,255,0.1)",
                                border: "1px solid rgba(153,69,255,0.25)",
                                color: SOLANA_PURPLE,
                                cursor: "pointer",
                                fontSize: "13px",
                                fontWeight: 600,
                                transition: "all 0.2s ease",
                            }}
                        >
                            Dashboard →
                        </button>
                        {user?.isAdmin && (
                            <button
                                onClick={() => navigate("/admin")}
                                style={{
                                    padding: "6px 12px",
                                    borderRadius: "8px",
                                    background: "rgba(20,241,149,0.1)",
                                    border: "1px solid rgba(20,241,149,0.25)",
                                    color: SOLANA_GREEN,
                                    cursor: "pointer",
                                    fontSize: "13px",
                                    fontWeight: 600,
                                    transition: "all 0.2s ease",
                                }}
                            >
                                Admin →
                            </button>
                        )}
                        <button
                            onClick={logout}
                            style={{
                                padding: "6px 12px",
                                borderRadius: "8px",
                                background: "rgba(239,68,68,0.1)",
                                border: "1px solid rgba(239,68,68,0.25)",
                                color: "#ef4444",
                                cursor: "pointer",
                                fontSize: "13px",
                                fontWeight: 600,
                                transition: "all 0.2s ease",
                            }}
                        >
                            Logout →
                        </button>
                    </div>
                </div>
            </header>

            {/* Main content */}
            <div style={{ maxWidth: "960px", margin: "0 auto", padding: "24px 16px" }}>
                <div
                    style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: "24px",
                    }}
                >
                    <h2 style={{ fontSize: "24px", fontWeight: "bold", margin: 0 }}>
                        Accounts
                    </h2>
                    <button
                        className="btn-primary"
                        onClick={() => {
                            setCreateError(null);
                            setSeedPhraseError(null);
                            setCreatePassword("");
                            setConfirmPassword("");
                            setImportSeed(false);
                            setSeedPhraseInput("");
                            setCreateUseWhitelist(true);
                            setShowCreateModal(true);
                        }}
                        style={{ padding: "10px 20px", fontSize: "14px" }}
                    >
                        Create Account
                    </button>
                </div>

                {loading ? (
                    <div style={{ textAlign: "center", padding: "40px", color: "#6b7280" }}>
                        Loading accounts...
                    </div>
                ) : accounts.length === 0 ? (
                    <div
                        className="glass-card"
                        style={{
                            padding: "40px",
                            textAlign: "center",
                            color: "#6b7280",
                        }}
                    >
                        No accounts yet. Create one to get started.
                    </div>
                ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                        {accounts.map((account) => {
                            const isExpanded = expandedAccount === account._id;
                            const fundingAddr = account.addresses?.find(
                                (a) => a.index === 0
                            );
                            const usedByBots = account.usedByBots?.length ?? 0;

                            return (
                                <div
                                    key={account._id}
                                    className="glass-card"
                                    style={{ padding: "20px" }}
                                >
                                    {/* Account header */}
                                    <div
                                        style={{
                                            display: "flex",
                                            justifyContent: "space-between",
                                            alignItems: "flex-start",
                                            flexWrap: "wrap",
                                            gap: "12px",
                                        }}
                                    >
                                        <div style={{ flex: 1, minWidth: "200px" }}>
                                            <h3
                                                style={{
                                                    fontSize: "18px",
                                                    fontWeight: "bold",
                                                    margin: "0 0 6px 0",
                                                }}
                                            >
                                                {account.name}
                                            </h3>
                                            {fundingAddr && (
                                                <div
                                                    style={{
                                                        display: "flex",
                                                        alignItems: "center",
                                                        gap: "8px",
                                                    }}
                                                >
                                                    <span
                                                        style={{
                                                            fontSize: "13px",
                                                            color: "#9ca3af",
                                                            fontFamily: "monospace",
                                                        }}
                                                    >
                                                        {truncateAddress(fundingAddr.address)}
                                                    </span>
                                                    <button
                                                        onClick={() =>
                                                            copyAddress(fundingAddr.address)
                                                        }
                                                        style={{
                                                            padding: "2px 6px",
                                                            borderRadius: "4px",
                                                            background: "rgba(255,255,255,0.1)",
                                                            border: "none",
                                                            color:
                                                                copiedAddress ===
                                                                fundingAddr.address
                                                                    ? SOLANA_GREEN
                                                                    : "#9ca3af",
                                                            cursor: "pointer",
                                                            fontSize: "11px",
                                                        }}
                                                    >
                                                        {copiedAddress === fundingAddr.address
                                                            ? "Copied"
                                                            : "Copy"}
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                        <div
                                            style={{
                                                display: "flex",
                                                justifyContent: "space-between",
                                                alignItems: "center",
                                                gap: "8px",
                                                flexWrap: "wrap",
                                            }}
                                        >
                                            {/* Secondary actions (left) */}
                                            <div style={{ display: "flex", gap: "6px" }}>
                                                <button
                                                    className="btn-ghost"
                                                    onClick={() =>
                                                        setExpandedAccount(
                                                            isExpanded ? null : account._id
                                                        )
                                                    }
                                                >
                                                    {isExpanded ? "Collapse" : "Expand"}
                                                </button>
                                                {account.useWhitelist !== false && (
                                                    <button
                                                        className="btn-ghost"
                                                        onClick={() => {
                                                            if (whitelistEditing === account._id) {
                                                                setWhitelistEditing(null);
                                                            } else if (getWalletAuthToken(account._id, "whitelist")) {
                                                                setWhitelistEditing(account._id);
                                                            } else {
                                                                setPasswordPromptFor({ accountId: account._id, action: "whitelist" });
                                                                setPasswordInput("");
                                                                setPasswordError(null);
                                                            }
                                                        }}
                                                    >
                                                        Whitelist
                                                    </button>
                                                )}
                                            </div>
                                            {/* Primary actions (right) */}
                                            <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                                                <button
                                                    onClick={() => setTransferAccount(account)}
                                                    style={{
                                                        padding: "7px 16px",
                                                        borderRadius: "8px",
                                                        background: "linear-gradient(135deg, rgba(153,69,255,0.25), rgba(20,241,149,0.15))",
                                                        border: "1px solid rgba(153,69,255,0.4)",
                                                        color: "#c084fc",
                                                        cursor: "pointer",
                                                        fontSize: "12px",
                                                        fontWeight: 600,
                                                        transition: "all 0.2s ease",
                                                    }}
                                                >
                                                    Transfer
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        setDeleteConfirmId(account._id);
                                                        setDeletePassword("");
                                                        setDeleteError(null);
                                                    }}
                                                    disabled={usedByBots > 0}
                                                    style={{
                                                        padding: "6px 10px",
                                                        borderRadius: "6px",
                                                        background: "rgba(239,68,68,0.1)",
                                                        border: "1px solid rgba(239,68,68,0.2)",
                                                        color: "#ef4444",
                                                        cursor: usedByBots > 0 ? "not-allowed" : "pointer",
                                                        fontSize: "11px",
                                                        opacity: usedByBots > 0 ? 0.4 : 1,
                                                        transition: "all 0.2s ease",
                                                    }}
                                                    title={
                                                        usedByBots > 0
                                                            ? `Used by ${usedByBots} bot(s)`
                                                            : "Delete account"
                                                    }
                                                >
                                                    Delete
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Expanded addresses */}
                                    {isExpanded && (
                                        <div
                                            style={{
                                                marginTop: "16px",
                                                borderTop:
                                                    "1px solid rgba(255,255,255,0.1)",
                                                paddingTop: "12px",
                                            }}
                                        >
                                            <label style={labelStyle}>
                                                Derived Addresses
                                            </label>
                                            <div
                                                style={{
                                                    display: "flex",
                                                    flexDirection: "column",
                                                    gap: "6px",
                                                }}
                                            >
                                                {account.addresses.map((a) => {
                                                    const keyId = `${account._id}-${a.index}`;
                                                    const revealedKey = revealedKeys[keyId];
                                                    return (
                                                        <div key={a.index}>
                                                            <div
                                                                style={{
                                                                    display: "flex",
                                                                    justifyContent:
                                                                        "space-between",
                                                                    alignItems: "center",
                                                                    padding: "8px 12px",
                                                                    borderRadius: "6px",
                                                                    background:
                                                                        "rgba(255,255,255,0.05)",
                                                                    fontSize: "13px",
                                                                }}
                                                            >
                                                                <div
                                                                    style={{
                                                                        display: "flex",
                                                                        alignItems: "center",
                                                                        gap: "8px",
                                                                    }}
                                                                >
                                                                    <span
                                                                        style={{
                                                                            color: "#6b7280",
                                                                            minWidth: "24px",
                                                                        }}
                                                                    >
                                                                        {a.index}
                                                                    </span>
                                                                    <span
                                                                        style={{
                                                                            fontFamily: "monospace",
                                                                            color: "#d1d5db",
                                                                        }}
                                                                    >
                                                                        {truncateAddress(a.address)}
                                                                    </span>
                                                                    <button
                                                                        onClick={() =>
                                                                            copyAddress(a.address)
                                                                        }
                                                                        style={{
                                                                            padding: "2px 6px",
                                                                            borderRadius: "4px",
                                                                            background:
                                                                                "rgba(255,255,255,0.1)",
                                                                            border: "none",
                                                                            color:
                                                                                copiedAddress ===
                                                                                a.address
                                                                                    ? SOLANA_GREEN
                                                                                    : "#6b7280",
                                                                            cursor: "pointer",
                                                                            fontSize: "11px",
                                                                        }}
                                                                    >
                                                                        {copiedAddress === a.address
                                                                            ? "Copied"
                                                                            : "Copy"}
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleShowKey(account._id, a.index)}
                                                                        style={{
                                                                            padding: "2px 6px",
                                                                            borderRadius: "4px",
                                                                            background: revealedKey
                                                                                ? "rgba(239,68,68,0.15)"
                                                                                : "rgba(255,255,255,0.1)",
                                                                            border: "none",
                                                                            color: revealedKey ? "#ef4444" : "#6b7280",
                                                                            cursor: "pointer",
                                                                            fontSize: "11px",
                                                                        }}
                                                                    >
                                                                        {revealedKey ? "Hide Key" : "Show Key"}
                                                                    </button>
                                                                </div>
                                                                <span
                                                                    style={{
                                                                        color: SOLANA_GREEN,
                                                                        fontFamily: "monospace",
                                                                    }}
                                                                >
                                                                    {a.sol !== undefined
                                                                        ? `${a.sol.toFixed(4)} SOL`
                                                                        : "--"}
                                                                </span>
                                                            </div>
                                                            {/* Revealed private key */}
                                                            {revealedKey && (
                                                                <div
                                                                    style={{
                                                                        display: "flex",
                                                                        alignItems: "center",
                                                                        gap: "8px",
                                                                        padding: "6px 12px",
                                                                        marginTop: "2px",
                                                                        borderRadius: "0 0 6px 6px",
                                                                        background: "rgba(239,68,68,0.08)",
                                                                        border: "1px solid rgba(239,68,68,0.2)",
                                                                        borderTop: "none",
                                                                    }}
                                                                >
                                                                    <span
                                                                        style={{
                                                                            fontFamily: "monospace",
                                                                            fontSize: "11px",
                                                                            color: "#d1d5db",
                                                                            wordBreak: "break-all",
                                                                            flex: 1,
                                                                        }}
                                                                    >
                                                                        {revealedKey}
                                                                    </span>
                                                                    <button
                                                                        onClick={() => {
                                                                            navigator.clipboard.writeText(revealedKey);
                                                                            setCopiedAddress(keyId);
                                                                            setTimeout(() => setCopiedAddress(null), 2000);
                                                                        }}
                                                                        style={{
                                                                            padding: "2px 8px",
                                                                            borderRadius: "4px",
                                                                            background: "rgba(255,255,255,0.1)",
                                                                            border: "none",
                                                                            color: copiedAddress === keyId ? SOLANA_GREEN : "#9ca3af",
                                                                            cursor: "pointer",
                                                                            fontSize: "11px",
                                                                            whiteSpace: "nowrap",
                                                                        }}
                                                                    >
                                                                        {copiedAddress === keyId ? "Copied" : "Copy Key"}
                                                                    </button>
                                                                    <button
                                                                        onClick={() => {
                                                                            setRevealedKeys((prev) => {
                                                                                const updated = { ...prev };
                                                                                delete updated[keyId];
                                                                                return updated;
                                                                            });
                                                                        }}
                                                                        style={{
                                                                            padding: "2px 6px",
                                                                            borderRadius: "4px",
                                                                            background: "rgba(239,68,68,0.15)",
                                                                            border: "none",
                                                                            color: "#ef4444",
                                                                            cursor: "pointer",
                                                                            fontSize: "11px",
                                                                            whiteSpace: "nowrap",
                                                                        }}
                                                                    >
                                                                        Hide
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}

                                    {/* Whitelist management */}
                                    {whitelistEditing === account._id && (
                                        <div
                                            style={{
                                                marginTop: "16px",
                                                borderTop:
                                                    "1px solid rgba(255,255,255,0.1)",
                                                paddingTop: "12px",
                                            }}
                                        >
                                            <label style={labelStyle}>
                                                Whitelisted Addresses
                                            </label>
                                            {account.whitelistedAddresses.length === 0 ? (
                                                <p
                                                    style={{
                                                        color: "#6b7280",
                                                        fontSize: "13px",
                                                        marginBottom: "12px",
                                                    }}
                                                >
                                                    No whitelisted addresses.
                                                </p>
                                            ) : (
                                                <div
                                                    style={{
                                                        display: "flex",
                                                        flexDirection: "column",
                                                        gap: "6px",
                                                        marginBottom: "12px",
                                                    }}
                                                >
                                                    {account.whitelistedAddresses.map((w) => (
                                                        <div
                                                            key={w.address}
                                                            style={{
                                                                display: "flex",
                                                                justifyContent:
                                                                    "space-between",
                                                                alignItems: "center",
                                                                padding: "6px 10px",
                                                                borderRadius: "6px",
                                                                background:
                                                                    "rgba(255,255,255,0.05)",
                                                                fontSize: "13px",
                                                            }}
                                                        >
                                                            <div>
                                                                <span
                                                                    style={{
                                                                        color: "white",
                                                                        marginRight: "8px",
                                                                    }}
                                                                >
                                                                    {w.label}
                                                                </span>
                                                                <span
                                                                    style={{
                                                                        color: "#6b7280",
                                                                        fontFamily: "monospace",
                                                                    }}
                                                                >
                                                                    {truncateAddress(w.address)}
                                                                </span>
                                                            </div>
                                                            <button
                                                                onClick={() =>
                                                                    handleRemoveWhitelist(
                                                                        account._id,
                                                                        w.address
                                                                    )
                                                                }
                                                                style={{
                                                                    padding: "2px 8px",
                                                                    borderRadius: "4px",
                                                                    background:
                                                                        "rgba(239,68,68,0.15)",
                                                                    border: "none",
                                                                    color: "#ef4444",
                                                                    cursor: "pointer",
                                                                    fontSize: "11px",
                                                                }}
                                                            >
                                                                Remove
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                            {/* Add new whitelist entry */}
                                            <div
                                                style={{
                                                    display: "flex",
                                                    gap: "8px",
                                                    alignItems: "flex-end",
                                                    flexWrap: "wrap",
                                                }}
                                            >
                                                <div style={{ flex: 1, minWidth: "140px" }}>
                                                    <label style={labelStyle}>Label</label>
                                                    <input
                                                        className="input-dark"
                                                        style={{ ...inputStyle, width: "100%" }}
                                                        placeholder="e.g. Main Wallet"
                                                        value={newWhitelistLabel}
                                                        onChange={(e) =>
                                                            setNewWhitelistLabel(e.target.value)
                                                        }
                                                    />
                                                </div>
                                                <div style={{ flex: 2, minWidth: "200px" }}>
                                                    <label style={labelStyle}>Address</label>
                                                    <input
                                                        className="input-dark"
                                                        style={{ ...inputStyle, width: "100%" }}
                                                        placeholder="Solana address"
                                                        value={newWhitelistAddress}
                                                        onChange={(e) =>
                                                            setNewWhitelistAddress(
                                                                e.target.value
                                                            )
                                                        }
                                                    />
                                                </div>
                                                <button
                                                    className="btn-primary"
                                                    onClick={() =>
                                                        handleAddWhitelist(account._id)
                                                    }
                                                    disabled={
                                                        whitelistLoading ||
                                                        !newWhitelistAddress.trim() ||
                                                        !newWhitelistLabel.trim()
                                                    }
                                                    style={{
                                                        padding: "10px 16px",
                                                        fontSize: "13px",
                                                        opacity:
                                                            !newWhitelistAddress.trim() ||
                                                            !newWhitelistLabel.trim()
                                                                ? 0.5
                                                                : 1,
                                                    }}
                                                >
                                                    Add
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Create Account Modal */}
            {showCreateModal && (
                <div
                    style={modalOverlay}
                    onClick={(e) => {
                        if (e.target === e.currentTarget) setShowCreateModal(false);
                    }}
                >
                    <div
                        className="glass-card"
                        style={{
                            width: "100%",
                            maxWidth: "520px",
                            padding: "24px",
                            maxHeight: "90vh",
                            overflowY: "auto",
                        }}
                    >
                        <h2
                            style={{
                                fontSize: "20px",
                                fontWeight: "bold",
                                color: "white",
                                marginBottom: "20px",
                            }}
                        >
                            Create Account
                        </h2>

                        {/* Account Name */}
                        <div style={{ marginBottom: "16px" }}>
                            <label style={labelStyle}>Account Name</label>
                            <input
                                className="input-dark"
                                style={{ ...inputStyle, width: "100%" }}
                                placeholder="e.g. Trading Account 1"
                                value={createName}
                                onChange={(e) => setCreateName(e.target.value)}
                            />
                        </div>

                        {/* Wallet Password */}
                        <div style={{ marginBottom: "16px" }}>
                            <label style={labelStyle}>Wallet Password (min 6 characters)</label>
                            <input
                                className="input-dark"
                                type="password"
                                style={{ ...inputStyle, width: "100%", marginBottom: "8px" }}
                                placeholder="Wallet password"
                                value={createPassword}
                                onChange={(e) => setCreatePassword(e.target.value)}
                            />
                            <input
                                className="input-dark"
                                type="password"
                                style={{ ...inputStyle, width: "100%" }}
                                placeholder="Confirm password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                            />
                            {createPassword && confirmPassword && createPassword !== confirmPassword && (
                                <div style={{ color: "#ef4444", fontSize: "12px", marginTop: "4px" }}>
                                    Passwords do not match
                                </div>
                            )}
                        </div>

                        {/* Seed Phrase Toggle */}
                        <div style={{ marginBottom: "16px" }}>
                            <label style={labelStyle}>Seed Phrase</label>
                            <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
                                <button
                                    onClick={() => {
                                        setImportSeed(false);
                                        setSeedPhraseInput("");
                                        setSeedPhraseError(null);
                                    }}
                                    style={{
                                        flex: 1,
                                        padding: "8px 12px",
                                        borderRadius: "8px",
                                        background: !importSeed
                                            ? `rgba(153, 69, 255, 0.2)`
                                            : "rgba(255,255,255,0.05)",
                                        border: !importSeed
                                            ? `1px solid rgba(153, 69, 255, 0.5)`
                                            : "1px solid rgba(255,255,255,0.1)",
                                        color: !importSeed ? SOLANA_PURPLE : "#9ca3af",
                                        cursor: "pointer",
                                        fontSize: "13px",
                                        fontWeight: !importSeed ? 600 : 400,
                                    }}
                                >
                                    Generate New Seed
                                </button>
                                <button
                                    onClick={() => setImportSeed(true)}
                                    style={{
                                        flex: 1,
                                        padding: "8px 12px",
                                        borderRadius: "8px",
                                        background: importSeed
                                            ? `rgba(153, 69, 255, 0.2)`
                                            : "rgba(255,255,255,0.05)",
                                        border: importSeed
                                            ? `1px solid rgba(153, 69, 255, 0.5)`
                                            : "1px solid rgba(255,255,255,0.1)",
                                        color: importSeed ? SOLANA_PURPLE : "#9ca3af",
                                        cursor: "pointer",
                                        fontSize: "13px",
                                        fontWeight: importSeed ? 600 : 400,
                                    }}
                                >
                                    Import Existing Seed
                                </button>
                            </div>
                            {importSeed && (
                                <>
                                    <textarea
                                        className="input-dark"
                                        style={{
                                            width: "100%",
                                            minHeight: "80px",
                                            fontFamily: "monospace",
                                            fontSize: "14px",
                                            padding: "10px",
                                            resize: "vertical",
                                        }}
                                        placeholder="Enter your 12 or 24 word seed phrase..."
                                        value={seedPhraseInput}
                                        onChange={(e) => {
                                            setSeedPhraseInput(e.target.value);
                                            setSeedPhraseError(null);
                                        }}
                                    />
                                    {seedPhraseError && (
                                        <div style={{ color: "#ef4444", fontSize: "12px", marginTop: "4px" }}>
                                            {seedPhraseError}
                                        </div>
                                    )}
                                </>
                            )}
                        </div>

                        {/* Whitelist Checkbox */}
                        <div style={{ marginBottom: "16px" }}>
                            <label
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "10px",
                                    cursor: "pointer",
                                    fontSize: "14px",
                                    color: "#d1d5db",
                                }}
                            >
                                <input
                                    type="checkbox"
                                    checked={createUseWhitelist}
                                    onChange={(e) => setCreateUseWhitelist(e.target.checked)}
                                    style={{ width: "18px", height: "18px", accentColor: SOLANA_PURPLE }}
                                />
                                Use whitelist addresses
                            </label>
                            <p style={{ fontSize: "12px", color: "#6b7280", marginTop: "4px", marginBottom: 0 }}>
                                {createUseWhitelist
                                    ? "Only whitelisted and internal addresses can receive transfers."
                                    : "Any address can be used as a transfer destination (password required for external addresses)."}
                            </p>
                        </div>

                        {/* Whitelist Addresses */}
                        {createUseWhitelist && (
                            <div style={{ marginBottom: "20px" }}>
                                <label style={labelStyle}>
                                    Whitelisted Addresses (at least 1 required)
                                </label>
                                {createWhitelist.map((entry, i) => (
                                    <div
                                        key={i}
                                        style={{
                                            display: "flex",
                                            gap: "8px",
                                            marginBottom: "8px",
                                            alignItems: "center",
                                        }}
                                    >
                                        <input
                                            className="input-dark"
                                            style={{ ...inputStyle, flex: 1 }}
                                            placeholder="Label"
                                            value={entry.label}
                                            onChange={(e) => {
                                                const updated = [...createWhitelist];
                                                updated[i].label = e.target.value;
                                                setCreateWhitelist(updated);
                                            }}
                                        />
                                        <input
                                            className="input-dark"
                                            style={{ ...inputStyle, flex: 2 }}
                                            placeholder="Solana address"
                                            value={entry.address}
                                            onChange={(e) => {
                                                const updated = [...createWhitelist];
                                                updated[i].address = e.target.value;
                                                setCreateWhitelist(updated);
                                            }}
                                        />
                                        {createWhitelist.length > 1 && (
                                            <button
                                                onClick={() =>
                                                    setCreateWhitelist(
                                                        createWhitelist.filter(
                                                            (_, j) => j !== i
                                                        )
                                                    )
                                                }
                                                style={{
                                                    padding: "6px 10px",
                                                    borderRadius: "6px",
                                                    background: "rgba(239,68,68,0.15)",
                                                    border: "none",
                                                    color: "#ef4444",
                                                    cursor: "pointer",
                                                    fontSize: "14px",
                                                }}
                                            >
                                                X
                                            </button>
                                        )}
                                    </div>
                                ))}
                                <button
                                    onClick={() =>
                                        setCreateWhitelist([
                                            ...createWhitelist,
                                            { address: "", label: "" },
                                        ])
                                    }
                                    style={{
                                        padding: "6px 12px",
                                        borderRadius: "6px",
                                        background: "rgba(255,255,255,0.1)",
                                        border: "1px solid rgba(255,255,255,0.2)",
                                        color: "#9ca3af",
                                        cursor: "pointer",
                                        fontSize: "12px",
                                    }}
                                >
                                    + Add Address
                                </button>
                            </div>
                        )}

                        {createError && (
                            <div
                                style={{
                                    color: "#ef4444",
                                    fontSize: "13px",
                                    marginBottom: "12px",
                                    padding: "8px 12px",
                                    background: "rgba(239,68,68,0.1)",
                                    borderRadius: "8px",
                                }}
                            >
                                {createError}
                            </div>
                        )}

                        <div
                            style={{
                                display: "flex",
                                gap: "12px",
                                justifyContent: "flex-end",
                            }}
                        >
                            <button
                                onClick={() => setShowCreateModal(false)}
                                style={{
                                    padding: "10px 20px",
                                    borderRadius: "8px",
                                    background: "rgba(255,255,255,0.1)",
                                    border: "1px solid rgba(255,255,255,0.2)",
                                    color: "white",
                                    cursor: "pointer",
                                    fontSize: "14px",
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                className="btn-primary"
                                onClick={handleCreate}
                                disabled={isCreateDisabled()}
                                style={{
                                    padding: "10px 20px",
                                    fontSize: "14px",
                                    opacity: isCreateDisabled() ? 0.5 : 1,
                                }}
                            >
                                {createLoading ? "Creating..." : "Create"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Seed Phrase Reveal Modal */}
            {showSeedModal && (
                <div style={modalOverlay}>
                    <div
                        className="glass-card"
                        style={{
                            width: "100%",
                            maxWidth: "520px",
                            padding: "24px",
                        }}
                    >
                        <div
                            style={{
                                textAlign: "center",
                                marginBottom: "20px",
                            }}
                        >
                            <div
                                style={{
                                    width: "48px",
                                    height: "48px",
                                    borderRadius: "50%",
                                    background: "rgba(239, 68, 68, 0.2)",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    marginBottom: "12px",
                                }}
                            >
                                <svg
                                    style={{
                                        width: "24px",
                                        height: "24px",
                                        color: "#ef4444",
                                    }}
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
                                    />
                                </svg>
                            </div>
                            <h2
                                style={{
                                    fontSize: "20px",
                                    fontWeight: "bold",
                                    color: "white",
                                    marginBottom: "8px",
                                }}
                            >
                                Save Your Seed Phrase
                            </h2>
                            <p
                                style={{
                                    color: "#ef4444",
                                    fontSize: "14px",
                                    fontWeight: 600,
                                }}
                            >
                                This is the ONLY time your seed phrase will be shown.
                                Save it securely now. It cannot be recovered later.
                            </p>
                        </div>

                        <textarea
                            readOnly
                            value={revealedSeed}
                            style={{
                                width: "100%",
                                padding: "16px",
                                borderRadius: "8px",
                                background: "rgba(255,255,255,0.05)",
                                border: "1px solid rgba(255,255,255,0.2)",
                                color: "white",
                                fontSize: "14px",
                                lineHeight: "1.6",
                                fontFamily: "monospace",
                                resize: "none",
                                minHeight: "80px",
                                marginBottom: "12px",
                            }}
                        />

                        <button
                            onClick={() => {
                                navigator.clipboard.writeText(revealedSeed);
                                setSeedCopied(true);
                                setTimeout(() => setSeedCopied(false), 2000);
                            }}
                            style={{
                                width: "100%",
                                padding: "10px",
                                borderRadius: "8px",
                                background: seedCopied
                                    ? `rgba(20, 241, 149, 0.15)`
                                    : "rgba(255,255,255,0.1)",
                                border: seedCopied
                                    ? `1px solid rgba(20, 241, 149, 0.3)`
                                    : "1px solid rgba(255,255,255,0.2)",
                                color: seedCopied ? SOLANA_GREEN : "white",
                                cursor: "pointer",
                                fontSize: "13px",
                                marginBottom: "16px",
                            }}
                        >
                            {seedCopied ? "Copied to clipboard" : "Copy Seed Phrase"}
                        </button>

                        <label
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "10px",
                                cursor: "pointer",
                                marginBottom: "16px",
                                fontSize: "14px",
                                color: "#d1d5db",
                            }}
                        >
                            <input
                                type="checkbox"
                                checked={seedSaved}
                                onChange={(e) => setSeedSaved(e.target.checked)}
                                style={{ width: "18px", height: "18px" }}
                            />
                            I have saved my seed phrase securely
                        </label>

                        <button
                            className="btn-primary"
                            onClick={() => {
                                setShowSeedModal(false);
                                setRevealedSeed("");
                            }}
                            disabled={!seedSaved}
                            style={{
                                width: "100%",
                                padding: "12px",
                                fontSize: "14px",
                                opacity: seedSaved ? 1 : 0.4,
                                cursor: seedSaved ? "pointer" : "not-allowed",
                            }}
                        >
                            Close
                        </button>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {deleteConfirmId && (
                <div
                    style={modalOverlay}
                    onClick={(e) => {
                        if (e.target === e.currentTarget) {
                            setDeleteConfirmId(null);
                            setDeletePassword("");
                            setDeleteError(null);
                        }
                    }}
                >
                    <div
                        className="glass-card"
                        style={{
                            width: "100%",
                            maxWidth: "480px",
                            padding: "24px",
                        }}
                    >
                        <div style={{ textAlign: "center", marginBottom: "16px" }}>
                            <div
                                style={{
                                    width: "48px",
                                    height: "48px",
                                    borderRadius: "50%",
                                    background: "rgba(239, 68, 68, 0.2)",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    marginBottom: "12px",
                                }}
                            >
                                <svg
                                    style={{ width: "24px", height: "24px", color: "#ef4444" }}
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
                                    />
                                </svg>
                            </div>
                            <h2 style={{ fontSize: "20px", fontWeight: "bold", color: "white", marginBottom: "8px" }}>
                                Delete Account
                            </h2>
                            <p style={{ color: "#ef4444", fontSize: "14px", fontWeight: 600, margin: 0 }}>
                                This action cannot be undone. If you don't have your seed phrase saved, all funds will be unrecoverable.
                            </p>
                        </div>

                        <div style={{ marginBottom: "16px" }}>
                            <label style={labelStyle}>Enter wallet password to confirm</label>
                            <input
                                className="input-dark"
                                type="password"
                                style={{ ...inputStyle, width: "100%" }}
                                placeholder="Wallet password"
                                value={deletePassword}
                                onChange={(e) => {
                                    setDeletePassword(e.target.value);
                                    setDeleteError(null);
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" && deletePassword) {
                                        handleDelete(deleteConfirmId, deletePassword);
                                    }
                                }}
                            />
                            {deleteError && (
                                <div style={{ color: "#ef4444", fontSize: "12px", marginTop: "4px" }}>
                                    {deleteError}
                                </div>
                            )}
                        </div>

                        <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
                            <button
                                onClick={() => {
                                    setDeleteConfirmId(null);
                                    setDeletePassword("");
                                    setDeleteError(null);
                                }}
                                style={{
                                    padding: "10px 20px",
                                    borderRadius: "8px",
                                    background: "rgba(255,255,255,0.1)",
                                    border: "1px solid rgba(255,255,255,0.2)",
                                    color: "white",
                                    cursor: "pointer",
                                    fontSize: "14px",
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                className="btn-danger"
                                onClick={() => handleDelete(deleteConfirmId, deletePassword)}
                                disabled={deleteLoading || !deletePassword}
                                style={{
                                    padding: "10px 20px",
                                    fontSize: "14px",
                                    opacity: deleteLoading || !deletePassword ? 0.5 : 1,
                                }}
                            >
                                {deleteLoading ? "Deleting..." : "Delete Account"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Password Prompt Modal */}
            {passwordPromptFor && (
                <div
                    style={modalOverlay}
                    onClick={(e) => {
                        if (e.target === e.currentTarget) {
                            setPasswordPromptFor(null);
                            setPasswordInput("");
                            setPasswordError(null);
                        }
                    }}
                >
                    <div
                        className="glass-card"
                        style={{
                            width: "100%",
                            maxWidth: "420px",
                            padding: "24px",
                        }}
                    >
                        <h2 style={{ fontSize: "18px", fontWeight: "bold", color: "white", marginBottom: "16px" }}>
                            Enter Wallet Password
                        </h2>
                        <p style={{ fontSize: "13px", color: "#9ca3af", marginBottom: "16px" }}>
                            Password required for{" "}
                            {passwordPromptFor.action === "privateKey"
                                ? "viewing private keys"
                                : passwordPromptFor.action === "transfer"
                                ? "this transfer"
                                : passwordPromptFor.action === "whitelist"
                                ? "managing whitelist"
                                : "this action"}
                            .
                        </p>

                        <input
                            className="input-dark"
                            type="password"
                            style={{ ...inputStyle, width: "100%", marginBottom: "12px" }}
                            placeholder="Wallet password"
                            value={passwordInput}
                            onChange={(e) => {
                                setPasswordInput(e.target.value);
                                setPasswordError(null);
                            }}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && passwordInput) {
                                    handleVerifyPassword();
                                }
                            }}
                            autoFocus
                        />

                        {passwordError && (
                            <div
                                style={{
                                    color: "#ef4444",
                                    fontSize: "13px",
                                    marginBottom: "12px",
                                    padding: "8px 12px",
                                    background: "rgba(239,68,68,0.1)",
                                    borderRadius: "8px",
                                }}
                            >
                                {passwordError}
                            </div>
                        )}

                        <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
                            <button
                                onClick={() => {
                                    setPasswordPromptFor(null);
                                    setPasswordInput("");
                                    setPasswordError(null);
                                }}
                                style={{
                                    padding: "10px 20px",
                                    borderRadius: "8px",
                                    background: "rgba(255,255,255,0.1)",
                                    border: "1px solid rgba(255,255,255,0.2)",
                                    color: "white",
                                    cursor: "pointer",
                                    fontSize: "14px",
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                className="btn-primary"
                                onClick={handleVerifyPassword}
                                disabled={passwordLoading || !passwordInput}
                                style={{
                                    padding: "10px 20px",
                                    fontSize: "14px",
                                    opacity: passwordLoading || !passwordInput ? 0.5 : 1,
                                }}
                            >
                                {passwordLoading ? "Verifying..." : "Unlock"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Transfer Modal */}
            {transferAccount && (
                <TransferModal
                    accountId={transferAccount._id}
                    addresses={transferAccount.addresses}
                    whitelistedAddresses={transferAccount.whitelistedAddresses}
                    useWhitelist={transferAccount.useWhitelist !== false}
                    walletAuthToken={getWalletAuthToken(transferAccount._id, "transfer") || undefined}
                    onWalletAuthIssued={(walletAuthToken, action, expiresIn) =>
                        handleTransferWalletAuthIssued(transferAccount._id, walletAuthToken, action, expiresIn)
                    }
                    onClose={handleTransferClose}
                />
            )}
        </div>
    );
};

export default Accounts;
