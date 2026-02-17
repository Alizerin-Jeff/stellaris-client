import React, { useEffect, useState, useCallback, useRef } from "react";
import axios from "axios";
import { useAuth } from "../context/AuthContext";
import { useWS } from "../context/WebSocketContext";
import { useNavigate } from "react-router-dom";

interface MethodParams {
    tradeSize: [number, number];
    slippage: number;
    concurrency: number;
    timeInterval: [number, number];
    startIndex: number;
    numberOfWallets?: number;
    walletIndex?: number;
    extractRatio?: number;
    reserveTargetInSOL?: number;
    injectionAmount?: number;
    buyToSellRatio?: number;
    priceThreshold?: number;
    mcThreshold?: number;
    thresholdType?: 'price' | 'marketcap';
    // Separate buy/sell trade sizes
    useSeparateTradeSizes?: boolean;
    buyTradeSize?: [number, number];
    sellTradeSize?: [number, number];
    autoRatioEnabled?: boolean;
}

const SOLANA_PURPLE = "#9945ff";
const SOLANA_GREEN = "#14f195";

interface Toast {
    id: number;
    message: string;
    type: 'success' | 'error' | 'info';
}

interface SessionEntry {
    instanceId: string;
    methodType: string;
    total: string;
    poolId: string;
    createdAt: string;
}

interface BalanceSnapshot {
    sol: number;
    spl: number;
    wsol: number;
    quote?: number;
    updatedAt: number;
}

const createDefaultBalanceSnapshot = (): BalanceSnapshot => ({
    sol: 0,
    spl: 0,
    wsol: 0,
    updatedAt: Date.now(),
});

const Dashboard: React.FC = () => {
    const { user, logout, updateUsername } = useAuth();
    const { bots, setBots, send } = useWS();
    const navigate = useNavigate();
    const [newBot, setNewBot] = useState({
        instanceId: "",
        poolId: "",
        accountId: "",
    });
    const [loading, setLoading] = useState(true);
    const [showCreateBot, setShowCreateBot] = useState(false);
    const [creatingBot, setCreatingBot] = useState(false);
    const [createBotError, setCreateBotError] = useState<string | null>(null);
    const [selectedBotId, setSelectedBotId] = useState<string | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [toasts, setToasts] = useState<Toast[]>([]);
    const [accounts, setAccounts] = useState<{ _id: string; name: string; addresses: { index: number; address: string }[] }[]>([]);
    const [sessions, setSessions] = useState<SessionEntry[]>([]);
    const [sessionsLoading, setSessionsLoading] = useState(false);
    const [sessionsError, setSessionsError] = useState<string | null>(null);
    const lastSessionTrigger = useRef<Record<string, string>>({});
    const [sessionsPage, setSessionsPage] = useState(1);
    const [sessionsTotal, setSessionsTotal] = useState(0);
    const sessionsPageSize = 10;
    const allBalancesRefreshInFlight = useRef(false);

    // Username change modal state
    const [showUsernameModal, setShowUsernameModal] = useState(false);
    const [newUsernameInput, setNewUsernameInput] = useState("");
    const [usernameError, setUsernameError] = useState<string | null>(null);
    const [usernameLoading, setUsernameLoading] = useState(false);

    // Funding wallet copy state
    const [fundingWalletCopied, setFundingWalletCopied] = useState(false);

    // Custom dropdown state
    const [mobileBotDropdownOpen, setMobileBotDropdownOpen] = useState(false);
    const [accountDropdownOpen, setAccountDropdownOpen] = useState(false);
    const mobileBotDropdownRef = useRef<HTMLDivElement>(null);
    const accountDropdownRef = useRef<HTMLDivElement>(null);

    const formatStat = (value: number | string | undefined, digits = 2) => {
        if (value === null || value === undefined) return "N/A";
        if (typeof value === "number") return value.toFixed(digits);
        return value;
    };

    const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
        const id = Date.now();
        setToasts(prev => [...prev, { id, message, type }]);
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, 3000);
    };

    // Tier display helpers
    const getTierLabel = (tokenBalance?: number): string => {
        if (!tokenBalance || tokenBalance < 1_000_000) return "Free";
        if (tokenBalance < 10_000_000) return "Free - Level 1";
        return "Free - Level 2";
    };

    // Method availability checks based on tier
    const isMethodAvailable = (method: string): boolean => {
        if (user?.tier === 'pro') return true;
        const tokenBalance = user?.tokenBalance || 0;
        // volume and inject always available for free tier
        if (method === 'volume' || method === 'inject') return true;
        // extract requires 1M+ tokens (Level 1)
        if (method === 'extract') return tokenBalance >= 1_000_000;
        // defendFloor requires 10M+ tokens (Level 2)
        if (method === 'defendFloor') return tokenBalance >= 10_000_000;
        return false;
    };

    const getMethodLockReason = (method: string): string | null => {
        if (isMethodAvailable(method)) return null;
        if (method === 'extract') return "Requires 1M+ tokens or Pro";
        if (method === 'defendFloor') return "Requires 10M+ tokens or Pro";
        return "Requires Pro tier";
    };

    // Alternate accounts only for Level 2 (10M+) or Pro
    const canUseAltAccounts = (): boolean => {
        if (user?.tier === 'pro') return true;
        return (user?.tokenBalance || 0) >= 10_000_000;
    };

    // Separate trade sizes requires Level 1 (1M+) or Pro
    const canUseSeparateTradeSizes = (): boolean => {
        if (user?.tier === 'pro') return true;
        return (user?.tokenBalance || 0) >= 1_000_000;
    };

    // Username change handlers
    const handleUsernameSubmit = async () => {
        if (!newUsernameInput.trim()) return;

        setUsernameError(null);
        setUsernameLoading(true);

        try {
            await updateUsername(newUsernameInput.trim());
            setShowUsernameModal(false);
            setNewUsernameInput("");
            showToast("Username updated successfully", "success");
        } catch (err: any) {
            const errorMessage = err.response?.data?.error || "Failed to update username";
            setUsernameError(errorMessage);
        } finally {
            setUsernameLoading(false);
        }
    };

    // Copy funding wallet to clipboard
    const copyFundingWallet = (address: string) => {
        navigator.clipboard.writeText(address);
        setFundingWalletCopied(true);
        showToast("Wallet address copied", "success");
        setTimeout(() => setFundingWalletCopied(false), 2000);
    };

    // Close custom dropdowns on outside click
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (mobileBotDropdownRef.current && !mobileBotDropdownRef.current.contains(e.target as Node)) {
                setMobileBotDropdownOpen(false);
            }
            if (accountDropdownRef.current && !accountDropdownRef.current.contains(e.target as Node)) {
                setAccountDropdownOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const selectedBot = bots.find(b => b.instanceId === selectedBotId);
    const fundingBalance = selectedBot?.fundingBalance || createDefaultBalanceSnapshot();
    const quoteSymbol = selectedBot?.quoteSymbol || "SOL";

    const openCreateBotModal = () => {
        setCreateBotError(null);
        setShowCreateBot(true);
    };

    useEffect(() => {
        const fetchBots = async () => {
            try {
                const res = await axios.get(
                    "/api/bots",
                    {
                        headers: {
                            Authorization: `Bearer ${localStorage.getItem("token")}`,
                        },
                    },
                );
                const fetchedBots = res.data;

                setBots(
                    fetchedBots.map((b: any) => ({
                        instanceId: b.instanceId,
                        methods: b.methods || {},
                        fundingBalance: createDefaultBalanceSnapshot(),
                        reservedWallets: b.reservedWallets || [],
                        fundingWallet: b.fundingWallet,
                        poolType: b.poolType,
                        baseSymbol: b.baseSymbol || 'TOKEN',
                        quoteSymbol: b.quoteSymbol || 'SOL',
                    })),
                );

                fetchedBots.forEach((bot: any) => {
                    send({ type: "subscribe", instanceId: bot.instanceId });
                });

                if (fetchedBots.length > 0) {
                    setSelectedBotId((prev) => prev || fetchedBots[0].instanceId);
                }
            } catch (err) {
                console.error("Failed to fetch bots:", err);
            } finally {
                setLoading(false);
            }
        };

        fetchBots();
    }, [send, setBots]);

    useEffect(() => {
        if (bots.length > 0 && !selectedBotId) {
            setSelectedBotId(bots[0].instanceId);
        }
    }, [bots, selectedBotId]);

    const refreshAllBalances = useCallback(async () => {
        if (allBalancesRefreshInFlight.current) return;
        allBalancesRefreshInFlight.current = true;
        try {
            const res = await axios.get("/api/balances", {
                headers: {
                    Authorization: `Bearer ${localStorage.getItem("token")}`,
                },
            });
            const results = res.data?.results || [];
            const resultsByInstance = new Map<string, any>(
                results.map((result: any) => [result.instanceId, result.balances]),
            );
            setBots((prev) =>
                prev.map((bot) => {
                    const fresh = resultsByInstance.get(bot.instanceId);
                    return {
                        ...bot,
                        fundingBalance: fresh || bot.fundingBalance || createDefaultBalanceSnapshot(),
                    };
                }),
            );
        } catch (error) {
            console.warn("Failed to refresh funding balances:", error);
        } finally {
            allBalancesRefreshInFlight.current = false;
        }
    }, [setBots]);

    useEffect(() => {
        refreshAllBalances();
        const interval = setInterval(refreshAllBalances, 20000);
        return () => clearInterval(interval);
    }, [refreshAllBalances]);

    useEffect(() => {
        if (bots.length === 0) return;
        refreshAllBalances();
    }, [bots.length, refreshAllBalances]);

    const fetchSessions = useCallback(async (instanceId: string, page: number) => {
        setSessionsLoading(true);
        setSessionsError(null);
        try {
            const res = await axios.get(`/api/bot/${instanceId}/sessions`, {
                params: { page, pageSize: sessionsPageSize },
                headers: {
                    Authorization: `Bearer ${localStorage.getItem("token")}`,
                },
            });
            setSessions(res.data.sessions || []);
            setSessionsTotal(res.data.total || 0);
        } catch (err) {
            console.error("Failed to fetch sessions:", err);
            setSessionsError("Failed to load sessions");
        } finally {
            setSessionsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!selectedBotId) return;
        setSessionsPage(1);
        fetchSessions(selectedBotId, 1);
    }, [selectedBotId, fetchSessions]);

    useEffect(() => {
        if (!selectedBotId || !selectedBot?.progress) return;
        const methods = ["volume", "inject", "extract"] as const;
        for (const method of methods) {
            const progress = selectedBot.progress?.[method];
            if (!progress?.isFinal) continue;
            const totalKey =
                method === "volume"
                    ? progress.totalVolume
                    : method === "inject"
                    ? progress.totalInjected
                    : progress.totalExtracted;
            if (!totalKey) continue;
            if (lastSessionTrigger.current[method] !== totalKey) {
                lastSessionTrigger.current[method] = totalKey;
                fetchSessions(selectedBotId, sessionsPage);
                break;
            }
        }
    }, [selectedBotId, selectedBot?.progress, fetchSessions, sessionsPage]);

    useEffect(() => {
        if (!selectedBotId) return;
        fetchSessions(selectedBotId, sessionsPage);
    }, [selectedBotId, sessionsPage, fetchSessions]);

    // Funding wallet balances are hydrated by batch /api/balances polling + WS progress updates.

    const createBot = async () => {
        if (creatingBot) return;
        if (!newBot.instanceId || !newBot.poolId || !newBot.accountId) {
            alert("All fields required");
            return;
        }
        setCreateBotError(null);
        setCreatingBot(true);
        setAccountDropdownOpen(false);
        const instanceIdToCreate = newBot.instanceId;
        const poolIdToCreate = newBot.poolId;
        const accountIdToCreate = newBot.accountId;
        try {
            const res = await axios.post("/api/start-bot", {
                instanceId: instanceIdToCreate,
                poolId: poolIdToCreate,
                accountId: accountIdToCreate,
            }, {
                headers: {
                    Authorization: `Bearer ${localStorage.getItem("token")}`,
                },
            });

            setBots(prev => [
                ...prev,
                {
                    instanceId: instanceIdToCreate,
                    methods: {
                        volume: { isRunning: false, params: {} },
                        inject: { isRunning: false, params: {} },
                        extract: { isRunning: false, params: {} },
                        defendFloor: { isRunning: false, params: {} },
                    },
                    fundingBalance: createDefaultBalanceSnapshot(),
                    reservedWallets: res.data?.reservedWallets || [],
                    poolType: res.data?.poolType,
                    baseSymbol: "TOKEN",
                    quoteSymbol: "SOL",
                },
            ]);
            send({ type: "subscribe", instanceId: instanceIdToCreate });
            setSelectedBotId(instanceIdToCreate);
            refreshAllBalances();
            try {
                const botsRes = await axios.get("/api/bots", {
                    headers: {
                        Authorization: `Bearer ${localStorage.getItem("token")}`,
                    },
                });
                const createdBot = (botsRes.data || []).find((b: any) => b.instanceId === instanceIdToCreate);
                if (createdBot) {
                    setBots((prev) =>
                        prev.map((bot) =>
                            bot.instanceId === instanceIdToCreate
                                ? {
                                      ...bot,
                                      baseSymbol: createdBot.baseSymbol || "TOKEN",
                                      quoteSymbol: createdBot.quoteSymbol || "SOL",
                                      fundingWallet: createdBot.fundingWallet || bot.fundingWallet,
                                      reservedWallets: createdBot.reservedWallets || bot.reservedWallets,
                                  }
                                : bot,
                        ),
                    );
                }
            } catch (err) {
                console.warn("Failed to refresh bot metadata after creation:", err);
            }

            setNewBot({ instanceId: "", poolId: "", accountId: "" });
            setShowCreateBot(false);
            showToast(`Created ${instanceIdToCreate}`, 'success');
        } catch (err: any) {
            const message = err.response?.data?.error || "Failed to create bot";
            setCreateBotError(message);
            showToast(message, 'error');
        } finally {
            setCreatingBot(false);
        }
    };

    const toggleMethod = (
        instanceId: string,
        method: string,
        isRunning: boolean,
        params?: MethodParams,
        isUpdate?: boolean,
    ) => {
        send({
            type: "toggle",
            instanceId: instanceId,
            methodType: method,
            isRunning: isRunning,
            params: params,
        });
        
        if (isUpdate) {
            showToast(`${method.charAt(0).toUpperCase() + method.slice(1)} parameters updated`, 'success');
        } else if (isRunning) {
            showToast(`${method.charAt(0).toUpperCase() + method.slice(1)} started`, 'success');
        } else {
            showToast(`${method.charAt(0).toUpperCase() + method.slice(1)} stopped`, 'info');
        }
    };

    const deleteBot = async (instanceId: string) => {
        if (
            !window.confirm(
                `Delete bot "${instanceId}" permanently? This cannot be undone.`,
            )
        ) {
            return;
        }

        try {
            await axios.delete(
                `/api/bot/${instanceId}`,
                {
                    headers: {
                        Authorization: `Bearer ${localStorage.getItem("token")}`,
                    },
                },
            );
            if (selectedBotId === instanceId) {
                const remaining = bots.filter(b => b.instanceId !== instanceId);
                setSelectedBotId(remaining.length > 0 ? remaining[0].instanceId : null);
            }
        } catch (err: any) {
            alert(err.response?.data?.error || "Failed to delete bot");
        }
    };

    const fetchAccounts = useCallback(async () => {
        try {
            const res = await axios.get("/api/accounts", {
                headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
            });
            setAccounts(res.data.accounts || []);
        } catch (err) {
            console.error("Failed to fetch accounts:", err);
        }
    }, []);

    useEffect(() => {
        fetchAccounts();
    }, [fetchAccounts]);


    if (loading) {
        return (
            <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ textAlign: "center" }}>
                    <div style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: "64px",
                        height: "64px",
                        borderRadius: "16px",
                        background: `linear-gradient(135deg, ${SOLANA_PURPLE}, ${SOLANA_GREEN})`,
                        marginBottom: "16px",
                    }}>
                        <svg style={{ width: "32px", height: "32px", color: "white", animation: "spin 1s linear infinite" }} viewBox="0 0 24 24">
                            <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                            <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                    </div>
                    <p style={{ color: "#9ca3af", fontSize: "18px" }}>Loading bots...</p>
                </div>
                <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
            </div>
        );
    }

    return (
        <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
            <header className="app-header" style={{
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
            }}>
                {/* Row 1: Hamburger | Title | Logout */}
                <div className="header-row-1" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <button
                        onClick={() => setSidebarOpen(!sidebarOpen)}
                        className="sidebar-toggle"
                        style={{
                            padding: "8px",
                            borderRadius: "8px",
                            background: "transparent",
                            border: "1px solid rgba(255,255,255,0.2)",
                            color: "white",
                            cursor: "pointer",
                            display: "none",
                        }}
                    >
                        <svg style={{ width: "20px", height: "20px" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                        </svg>
                    </button>
                    <div className="header-brand" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <img src="/logo1.png" alt="Stellaris" style={{ width: '28px', height: '28px', opacity: 0.9 }} />
                        <h1 style={{ fontSize: '24px', fontWeight: 600, color: '#f0f0f0', margin: 0, letterSpacing: '-0.02em', lineHeight: 1 }}>
                            Stellaris
                        </h1>
                    </div>
                    <div className="header-desktop-controls" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        {/* Badges (non-clickable, small pills) */}
                        <div
                            className="user-badge"
                            onClick={() => {
                                setNewUsernameInput(user?.username || "");
                                setUsernameError(null);
                                setShowUsernameModal(true);
                            }}
                            style={{
                                padding: "4px 10px",
                                borderRadius: "20px",
                                background: "rgba(255,255,255,0.04)",
                                fontSize: "11px",
                                fontWeight: 500,
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                gap: "4px",
                                color: "#9ca3af",
                            }}
                        >
                            <span style={{ color: "#6b7280" }}>@</span>
                            {user?.username}
                            <svg style={{ width: "10px", height: "10px", color: "#4b5563" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                        </div>
                        {user?.tier === 'pro' ? (
                            <div style={{
                                padding: "4px 10px",
                                borderRadius: "20px",
                                background: "linear-gradient(135deg, rgba(20,241,149,0.15), rgba(153,69,255,0.15))",
                                fontSize: "11px",
                                fontWeight: 500,
                                color: SOLANA_GREEN,
                                cursor: "default",
                            }}>
                                Pro
                            </div>
                        ) : (
                            <div style={{
                                padding: "4px 10px",
                                borderRadius: "20px",
                                background: "rgba(255,255,255,0.04)",
                                fontSize: "11px",
                                fontWeight: 500,
                                color: "#6b7280",
                                cursor: "default",
                            }}>
                                {getTierLabel(user?.tokenBalance)}
                            </div>
                        )}

                        {/* Separator */}
                        <div style={{ width: "1px", height: "20px", background: "rgba(255,255,255,0.1)", margin: "0 4px" }} />

                        {/* Nav buttons (clickable, with arrows) */}
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
                            onClick={() => navigate("/accounts")}
                            style={{
                                padding: "6px 12px",
                                borderRadius: "8px",
                                background: "rgba(153,69,255,0.1)",
                                border: "1px solid rgba(153,69,255,0.25)",
                                color: "#c4b5fd",
                                cursor: "pointer",
                                fontSize: "13px",
                                fontWeight: 600,
                                transition: "all 0.2s ease",
                            }}
                        >
                            Accounts →
                        </button>
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
                    {/* Mobile logout button - visible only on mobile */}
                    <button onClick={logout} className="btn-danger mobile-logout" style={{ padding: "6px 12px", fontSize: "11px", display: "none" }}>
                        Logout
                    </button>
                </div>

                {/* Row 2: Username and Badges (mobile only) */}
                <div className="header-row-2" style={{ display: "none", justifyContent: "center", alignItems: "center", gap: "8px" }}>
                    <div
                        onClick={() => {
                            setNewUsernameInput(user?.username || "");
                            setUsernameError(null);
                            setShowUsernameModal(true);
                        }}
                        style={{
                            padding: "4px 10px",
                            borderRadius: "20px",
                            background: "rgba(255,255,255,0.04)",
                            fontSize: "11px",
                            fontWeight: 500,
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: "4px",
                            color: "#9ca3af",
                        }}
                    >
                        <span style={{ color: "#6b7280" }}>@</span>
                        {user?.username}
                        <svg style={{ width: "10px", height: "10px", color: "#4b5563" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                    </div>
                    {user?.tier === 'pro' ? (
                        <div style={{
                            padding: "4px 10px",
                            borderRadius: "20px",
                            background: "linear-gradient(135deg, rgba(20,241,149,0.15), rgba(153,69,255,0.15))",
                            fontSize: "11px",
                            fontWeight: 500,
                            color: SOLANA_GREEN,
                            cursor: "default",
                        }}>
                            Pro
                        </div>
                    ) : (
                        <div style={{
                            padding: "4px 10px",
                            borderRadius: "20px",
                            background: "rgba(255,255,255,0.04)",
                            fontSize: "11px",
                            fontWeight: 500,
                            color: "#6b7280",
                            cursor: "default",
                        }}>
                            {getTierLabel(user?.tokenBalance)}
                        </div>
                    )}
                    <div style={{ width: "1px", height: "16px", background: "rgba(255,255,255,0.1)" }} />
                    {user?.isAdmin && (
                        <button
                            onClick={() => navigate("/admin")}
                            style={{
                                padding: "4px 10px",
                                borderRadius: "8px",
                                background: "rgba(20,241,149,0.1)",
                                border: "1px solid rgba(20,241,149,0.25)",
                                color: SOLANA_GREEN,
                                cursor: "pointer",
                                fontSize: "11px",
                                fontWeight: 600,
                            }}
                        >
                            Admin →
                        </button>
                    )}
                    <button
                        onClick={() => navigate("/accounts")}
                        style={{
                            padding: "4px 10px",
                            borderRadius: "8px",
                            background: "rgba(153,69,255,0.1)",
                            border: "1px solid rgba(153,69,255,0.25)",
                            color: "#c4b5fd",
                            cursor: "pointer",
                            fontSize: "11px",
                            fontWeight: 600,
                        }}
                    >
                        Accounts →
                    </button>
                </div>
            </header>

            <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
                <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`} style={{
                    width: "260px",
                    minWidth: "260px",
                    borderRight: "1px solid rgba(255,255,255,0.1)",
                    background: "rgba(0,0,0,0.2)",
                    display: "flex",
                    flexDirection: "column",
                    height: "calc(100vh - 57px)",
                    overflowY: "auto",
                }}>
                    <div style={{ padding: "16px" }}>
                        <button
                            onClick={openCreateBotModal}
                            className="btn-primary"
                            style={{
                                width: "100%",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: "8px",
                            }}
                        >
                            <svg style={{ width: "18px", height: "18px" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            New Bot
                        </button>
                        <button
                            onClick={() => navigate("/accounts")}
                            className="btn-primary"
                            style={{
                                width: "100%",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: "8px",
                                marginTop: "10px",
                                background: "rgba(153, 69, 255, 0.2)",
                                color: "#c4b5fd",
                                border: "1px solid rgba(153, 69, 255, 0.35)",
                            }}
                        >
                            <svg style={{ width: "18px", height: "18px" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            Accounts
                        </button>
                    </div>

                    <div style={{ padding: "0 12px", flex: 1 }}>
                        <p style={{ fontSize: "12px", color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em", padding: "8px 4px" }}>
                            Your Bots ({bots.length})
                        </p>
                        {bots.length === 0 ? (
                            <p style={{ color: "#6b7280", fontSize: "14px", padding: "16px", textAlign: "center" }}>
                                No bots yet
                            </p>
                        ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                                {bots.map((bot) => {
                                    const isActive = selectedBotId === bot.instanceId;
                                    const runningCount = Object.values(bot.methods).filter(m => m?.isRunning).length;
                                    return (
                                        <button
                                            key={bot.instanceId}
                                            onClick={() => {
                                                setSelectedBotId(bot.instanceId);
                                                setSidebarOpen(false);
                                            }}
                                            style={{
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "space-between",
                                                padding: "12px",
                                                borderRadius: "10px",
                                                border: "none",
                                                background: isActive ? `linear-gradient(135deg, rgba(153, 69, 255, 0.3), rgba(20, 241, 149, 0.2))` : "transparent",
                                                color: "white",
                                                cursor: "pointer",
                                                textAlign: "left",
                                                transition: "all 0.2s",
                                                width: "100%",
                                            }}
                                        >
                                            <div style={{ display: "flex", alignItems: "center", gap: "10px", overflow: "hidden" }}>
                                                <div style={{
                                                    width: "32px",
                                                    height: "32px",
                                                    borderRadius: "8px",
                                                    background: `linear-gradient(135deg, ${SOLANA_PURPLE}, ${SOLANA_GREEN})`,
                                                    display: "flex",
                                                    alignItems: "center",
                                                    justifyContent: "center",
                                                    flexShrink: 0,
                                                }}>
                                                    <svg style={{ width: "16px", height: "16px", color: "white" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                                    </svg>
                                                </div>
                                                <div style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
                                                    <span style={{ fontWeight: "500", fontSize: "14px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                                        {bot.instanceId}
                                                    </span>
                                                    {bot.poolType && bot.poolType !== 'pump' && (
                                                        <span style={{
                                                            fontSize: "10px",
                                                            color: "rgba(255,255,255,0.5)",
                                                            fontWeight: "400",
                                                        }}>
                                                            {bot.poolType === 'raydium-amm'
                                                                ? 'Raydium AMM'
                                                                : bot.poolType === 'raydium-cpmm'
                                                                    ? 'Raydium CPMM'
                                                                    : bot.poolType === 'raydium-clmm'
                                                                        ? 'Raydium CLMM'
                                                                        : bot.poolType === 'meteora-dlmm'
                                                                            ? 'Meteora DLMM'
                                                                            : bot.poolType === 'meteora-damm-v2'
                                                                                ? 'Meteora DAMM v2'
                                                                                : bot.poolType === 'meteora-damm-v1'
                                                                                    ? 'Meteora DAMM v1'
                                                                                    : 'Pump.fun'}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            {runningCount > 0 && (
                                                <span style={{
                                                    padding: "2px 8px",
                                                    borderRadius: "10px",
                                                    background: "rgba(20, 241, 149, 0.2)",
                                                    color: SOLANA_GREEN,
                                                    fontSize: "12px",
                                                    fontWeight: "500",
                                                }}>
                                                    {runningCount}
                                                </span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </aside>

                <main style={{ flex: 1, overflow: "auto", padding: "16px" }}>
                    <div className="mobile-bot-selector" ref={mobileBotDropdownRef} style={{
                        display: "none",
                        marginBottom: "16px",
                        position: "relative",
                    }}>
                        <button
                            type="button"
                            onClick={() => setMobileBotDropdownOpen(!mobileBotDropdownOpen)}
                            className="input-dark"
                            style={{
                                width: "100%",
                                padding: "12px 40px 12px 12px",
                                fontSize: "16px",
                                cursor: "pointer",
                                textAlign: "left",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                            }}
                        >
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {bots.length === 0 ? "No bots available" : (selectedBotId || "Select a bot")}
                            </span>
                            <svg
                                style={{
                                    width: "16px",
                                    height: "16px",
                                    flexShrink: 0,
                                    transform: mobileBotDropdownOpen ? "rotate(180deg)" : "rotate(0deg)",
                                    transition: "transform 0.15s",
                                }}
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                        </button>
                        {mobileBotDropdownOpen && bots.length > 0 && (
                            <div style={{
                                position: "absolute",
                                top: "calc(100% + 4px)",
                                left: 0,
                                right: 0,
                                background: "#1a1a2e",
                                border: "1px solid rgba(255,255,255,0.12)",
                                borderRadius: "8px",
                                zIndex: 50,
                                boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
                                maxHeight: "240px",
                                overflowY: "auto",
                            }}>
                                {bots.map(bot => (
                                    <button
                                        key={bot.instanceId}
                                        type="button"
                                        className="dropdown-item"
                                        onClick={() => {
                                            setSelectedBotId(bot.instanceId);
                                            setMobileBotDropdownOpen(false);
                                        }}
                                        style={{
                                            width: "100%",
                                            display: "flex",
                                            alignItems: "center",
                                            padding: "10px 12px",
                                            background: bot.instanceId === selectedBotId ? "rgba(153,69,255,0.12)" : "transparent",
                                            border: "none",
                                            cursor: "pointer",
                                            textAlign: "left",
                                            color: "white",
                                            fontSize: "14px",
                                        }}
                                        onMouseEnter={(e) => {
                                            if (bot.instanceId !== selectedBotId) e.currentTarget.style.background = "rgba(255,255,255,0.06)";
                                        }}
                                        onMouseLeave={(e) => {
                                            if (bot.instanceId !== selectedBotId) e.currentTarget.style.background = "transparent";
                                        }}
                                    >
                                        {bot.instanceId}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {bots.length === 0 ? (
                        <div className="glass-card" style={{
                            borderRadius: "16px",
                            padding: "48px 24px",
                            textAlign: "center",
                            maxWidth: "400px",
                            margin: "0 auto",
                        }}>
                            <div style={{
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                width: "80px",
                                height: "80px",
                                borderRadius: "50%",
                                background: `linear-gradient(135deg, rgba(153, 69, 255, 0.2), rgba(20, 241, 149, 0.2))`,
                                marginBottom: "24px",
                            }}>
                                <svg style={{ width: "40px", height: "40px", color: "#9ca3af" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                </svg>
                            </div>
                            <h3 style={{ fontSize: "24px", fontWeight: "bold", color: "white", marginBottom: "8px" }}>
                                No Bots Yet
                            </h3>
                            <p style={{ color: "#9ca3af", marginBottom: "24px" }}>
                                Create your first trading bot to get started
                            </p>
                            <button
                                onClick={openCreateBotModal}
                                className="btn-primary"
                            >
                                Create Your First Bot
                            </button>
                        </div>
                    ) : selectedBot ? (
                        <div>
                            {/* Bot Header Section */}
                            <div className="bot-header" style={{ marginBottom: "24px" }}>
                                {/* Row 1: Title, Funding, Address, Delete (single row on desktop) */}
                                <div className="bot-header-main" style={{
                                    display: "flex",
                                    flexWrap: "wrap",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    gap: "12px",
                                    marginBottom: "20px",
                                }}>
                                    <h2 style={{ fontSize: "32px", fontWeight: "bold", color: "white", margin: 0 }}>
                                        {selectedBot.instanceId}
                                    </h2>

                                    {/* Funding + Address group (stays together) */}
                                    <div className="bot-info-group" style={{
                                        display: "flex",
                                        flexWrap: "wrap",
                                        alignItems: "center",
                                        gap: "8px",
                                    }}>
                                        {/* Funding Balance */}
                                        <div style={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: "10px",
                                            padding: "6px 10px",
                                            borderRadius: "15px",
                                            background: "rgba(255,255,255,0.06)",
                                            border: "1px solid rgba(255,255,255,0.1)",
                                            fontSize: "12px",
                                            color: "#d1d5db",
                                        }}>
                                            <span style={{ color: "#9ca3af", fontWeight: 600 }}>Funding</span>
                                            <span style={{ color: "white" }}>
                                                {formatBalance(fundingBalance?.sol, 2)} SOL
                                            </span>
                                            {selectedBot?.quoteSymbol && selectedBot.quoteSymbol !== 'SOL' && (
                                                <span style={{ color: "white" }}>
                                                    {formatBalance(fundingBalance?.quote, 2)} {selectedBot.quoteSymbol}
                                                </span>
                                            )}
                                            <span style={{ color: "white" }}>
                                                {formatBalance(fundingBalance?.spl, 2)} {selectedBot?.baseSymbol || 'TOKEN'}
                                            </span>
                                        </div>

                                        {/* Wallet Address */}
                                        {selectedBot.fundingWallet && (
                                            <div
                                                onClick={() => copyFundingWallet(selectedBot.fundingWallet!)}
                                                style={{
                                                    display: "flex",
                                                    alignItems: "center",
                                                    gap: "6px",
                                                    padding: "6px 10px",
                                                    borderRadius: "15px",
                                                    background: "rgba(255,255,255,0.06)",
                                                    border: "1px solid rgba(255,255,255,0.1)",
                                                    fontSize: "12px",
                                                    color: "#9ca3af",
                                                    cursor: "pointer",
                                                }}
                                            >
                                                <svg style={{ width: "12px", height: "12px" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2z" />
                                                </svg>
                                                <span style={{ fontFamily: "monospace", color: "white" }}>
                                                    {selectedBot.fundingWallet.slice(0, 4)}...{selectedBot.fundingWallet.slice(-4)}
                                                </span>
                                                <span style={{ color: fundingWalletCopied ? SOLANA_GREEN : "#6b7280" }}>
                                                    {fundingWalletCopied ? "Copied!" : "Copy"}
                                                </span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Delete Button */}
                                    <button
                                        onClick={() => deleteBot(selectedBot.instanceId)}
                                        className="btn-danger delete-bot-btn"
                                        style={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: "4px",
                                            padding: "6px 10px",
                                            fontSize: "12px",
                                        }}
                                    >
                                        <svg style={{ width: "14px", height: "14px" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                        <span className="delete-btn-text">Delete Bot</span>
                                    </button>
                                </div>

                                {/* Row 2: Manage trading methods text */}
                                <p className="bot-subtitle" style={{ color: "#6b7280", fontSize: "14px", margin: 0 }}>
                                    Manage trading methods
                                </p>
                            </div>

                            <div className="method-grid" style={{
                                display: "grid",
                                gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
                                gap: "20px",
                            }}>
                                {["volume", "inject", "extract", "defendFloor"].map((method) => {
                                    const m = selectedBot.methods[method] || { isRunning: false, params: {} };
                                    const progress = selectedBot.progress?.[method];
                                    const thresholdType = (m.params?.thresholdType ?? progress?.thresholdType ?? "price") as "price" | "marketcap";
                                    const currentMetric = thresholdType === "marketcap" ? progress?.currentMC : progress?.currentPrice;
                                    const thresholdValue = thresholdType === "marketcap"
                                        ? (m.params?.mcThreshold ?? progress?.threshold)
                                        : (m.params?.priceThreshold ?? progress?.threshold);
                                    const metricDigits = thresholdType === "price" ? 8 : 2;
                                    const statusLabel = progress?.outOfFunds
                                        ? "Out of funds"
                                        : (progress?.state ? `${progress.state.charAt(0).toUpperCase()}${progress.state.slice(1)}` : "Initializing");

                                    const isLocked = !isMethodAvailable(method);
                                    const lockReason = getMethodLockReason(method);

                                    return (
                                        <div
                                            key={method}
                                            className="glass-card"
                                            style={{
                                                borderRadius: "16px",
                                                overflow: "hidden",
                                                position: "relative",
                                                opacity: isLocked ? 0.6 : 1,
                                            }}
                                        >
                                            {isLocked && (
                                                <div style={{
                                                    position: "absolute",
                                                    inset: 0,
                                                    display: "flex",
                                                    flexDirection: "column",
                                                    alignItems: "center",
                                                    justifyContent: "center",
                                                    background: "rgba(0,0,0,0.7)",
                                                    borderRadius: "inherit",
                                                    zIndex: 10,
                                                }}>
                                                    <svg style={{ width: "32px", height: "32px", color: "#6b7280" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                                    </svg>
                                                    <span style={{ color: "#9ca3af", fontSize: "14px", marginTop: "8px", textAlign: "center", padding: "0 16px" }}>
                                                        {lockReason}
                                                    </span>
                                                </div>
                                            )}
                                            <div style={{
                                                padding: "16px 20px",
                                                background: m.isRunning
                                                    ? `linear-gradient(135deg, rgba(20, 241, 149, 0.2), rgba(20, 241, 149, 0.1))`
                                                    : "rgba(255,255,255,0.05)",
                                                borderBottom: "1px solid rgba(255,255,255,0.1)",
                                                display: "flex",
                                                justifyContent: "space-between",
                                                alignItems: "center",
                                            }}>
                                                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                                                    <div style={{
                                                        width: "10px",
                                                        height: "10px",
                                                        borderRadius: "50%",
                                                        background: m.isRunning ? SOLANA_GREEN : "#6b7280",
                                                        animation: m.isRunning ? "pulse 2s infinite" : "none",
                                                    }} />
                                                    <h3 style={{
                                                        fontSize: "18px",
                                                        fontWeight: "600",
                                                        color: "white",
                                                        textTransform: "capitalize",
                                                    }}>
                                                        {method === "defendFloor" ? "Defend Floor" : method}
                                                    </h3>
                                                </div>
                                                <span style={{
                                                    padding: "4px 12px",
                                                    borderRadius: "20px",
                                                    fontSize: "12px",
                                                    fontWeight: "500",
                                                    background: m.isRunning ? "rgba(20, 241, 149, 0.2)" : "rgba(107, 114, 128, 0.2)",
                                                    color: m.isRunning ? SOLANA_GREEN : "#9ca3af",
                                                }}>
                                                    {m.isRunning ? "Running" : "Stopped"}
                                                </span>
                                            </div>

                                            <div style={{ padding: "20px" }}>
                                                <BotMethodForm
                                                    instanceId={selectedBot.instanceId}
                                                    method={method}
                                                    params={m.params}
                                                    isRunning={m.isRunning}
                                                    onToggle={(running, params, isUpdate) =>
                                                        toggleMethod(selectedBot.instanceId, method, running, params, isUpdate)
                                                    }
                                                    reservedWallets={selectedBot.reservedWallets}
                                                    canUseAltAccounts={canUseAltAccounts()}
                                                    canUseSeparateTradeSizes={canUseSeparateTradeSizes()}
                                                    baseSymbol={selectedBot?.baseSymbol}
                                                    quoteSymbol={selectedBot?.quoteSymbol}
                                                />

                                                {m.isRunning && progress && (
                                                    <div style={{
                                                        marginTop: "16px",
                                                        padding: "16px",
                                                        borderRadius: "12px",
                                                        background: "rgba(20, 241, 149, 0.1)",
                                                        border: "1px solid rgba(20, 241, 149, 0.2)",
                                                    }}>
                                                        <p style={{
                                                            fontSize: "14px",
                                                            fontWeight: "500",
                                                            color: SOLANA_GREEN,
                                                            marginBottom: "12px",
                                                            display: "flex",
                                                            alignItems: "center",
                                                            gap: "8px",
                                                        }}>
                                                            <span style={{
                                                                width: "8px",
                                                                height: "8px",
                                                                borderRadius: "50%",
                                                                background: SOLANA_GREEN,
                                                                animation: "pulse 2s infinite",
                                                            }}></span>
                                                            Live Stats
                                                        </p>
                                                        <div style={{
                                                            display: "grid",
                                                            gridTemplateColumns: "1fr 1fr",
                                                            gap: "8px",
                                                            fontSize: "14px",
                                                            color: "#d1d5db",
                                                        }}>
                                                            {method === "volume" && (
                                                                <>
                                                                    <p>Status: <span style={{ color: "white" }}>{statusLabel}</span></p>
                                                                    {progress.lowBalance ? (
                                                                    <p style={{ color: "#ff6b6b", fontWeight: "bold" }}>
                                                                        Balance too low, please add funds.
                                                                    </p>
                                                                    ) : (
                                                                    <>
                                                                        <p>Type: <span style={{ color: "white" }}>{progress.tradeType || "N/A"}</span></p>
                                                                        <p>Last Trade: <span style={{ color: "white" }}>{formatStat(progress.tradeSize, 2)} {quoteSymbol}</span></p>
                                                                        <p>Total Volume: <span style={{ color: "white" }}>{formatStat(progress.totalVolume, 2)} {quoteSymbol}</span></p>
                                                                    </>
                                                                    )}
                                                                </>
                                                            )}
                                                            {method === "inject" && (
                                                                <>
                                                                    <p>Status: <span style={{ color: "white" }}>{statusLabel}</span></p>
                                                                    {progress.lowBalance ? (
                                                                    <p style={{ color: "#ff6b6b", fontWeight: "bold" }}>
                                                                        Balance too low, please add funds.
                                                                    </p>
                                                                    ) : (
                                                                    <>
                                                                        <p>Injecting: <span style={{ color: "white" }}>{formatStat(progress.currentInjected, 1)} {selectedBot?.quoteSymbol || 'SOL'}</span></p>
                                                                        <p>Remaining: <span style={{ color: "white" }}>{formatStat(progress.remaining, 1)} {quoteSymbol}</span></p>
                                                                        <p>Total Injected: <span style={{ color: "white" }}>{formatStat(progress.totalInjected, 2)} {selectedBot?.quoteSymbol || 'SOL'}</span></p>
                                                                    </>
                                                                    )}
                                                                    {m.params?.walletIndex && progress.balances && (
                                                                        <>
                                                                            <p>Wallet #{m.params.walletIndex} SOL: <span style={{ color: "white" }}>{formatBalance(progress.balances.sol, 4)} SOL</span></p>
                                                                            <p>Wallet #{m.params.walletIndex} {selectedBot?.baseSymbol || 'TOKEN'}: <span style={{ color: "white" }}>{formatBalance(progress.balances.spl, 4)} {selectedBot?.baseSymbol || 'TOKEN'}</span></p>
                                                                        </>
                                                                    )}
                                                                </>
                                                            )}
                                                            {method === "extract" && (
                                                                <>
                                                                <p>Status: <span style={{ color: "white" }}>{statusLabel}</span></p>
                                                                <p>{selectedBot?.quoteSymbol || 'SOL'} Reserve: <span style={{ color: "white" }}>{formatStat(progress.baseReserve, 1)} {selectedBot?.quoteSymbol || 'SOL'}</span></p>
                                                                <p>Target Reserve: <span style={{ color: "white" }}>{formatStat(progress.targetReserve, 1)} {selectedBot?.quoteSymbol || 'SOL'}</span></p>
                                                                <p>Target Met: <span style={{ color: "white" }}>{progress.targetMet || "False"} </span></p>
                                                                <p>Total Extracted: <span style={{ color: "white" }}>{formatStat(progress.totalExtracted, 2)} {selectedBot?.quoteSymbol || 'SOL'}</span></p>
                                                                {progress.tokenBalanceLow && (
                                                                    <p style={{ color: "#ff6b6b", fontWeight: "bold" }}>
                                                                        {progress.message || "Token balance too low. Add tokens."}
                                                                    </p>
                                                                )}
                                                                {m.params?.walletIndex && progress.balances && (
                                                                    <>
                                                                        <p>Wallet #{m.params.walletIndex} SOL: <span style={{ color: "white" }}>{formatBalance(progress.balances.sol, 4)} SOL</span></p>
                                                                        <p>Wallet #{m.params.walletIndex} {selectedBot?.baseSymbol || 'TOKEN'}: <span style={{ color: "white" }}>{formatBalance(progress.balances.spl, 4)} {selectedBot?.baseSymbol || 'TOKEN'}</span></p>
                                                                    </>
                                                                )}
                                                                </>
                                                            )}
                                                            {method === "defendFloor" && (
                                                                <>
                                                                <p>Status: <span style={{ color: "white" }}>{statusLabel}</span></p>
                                                                <p>Current {thresholdType === 'marketcap' ? 'MC' : 'Price'}: <span style={{ color: "white" }}>${formatStat(currentMetric, metricDigits)}</span></p>
                                                                <p>Threshold: <span style={{ color: "white" }}>${formatStat(thresholdValue, metricDigits)}</span></p>
                                                                <p>Total Injected: <span style={{ color: "white" }}>{formatStat(progress.totalInjected, 2)} {selectedBot?.quoteSymbol || 'SOL'}</span></p>
                                                                {m.params?.walletIndex && progress.balances && (
                                                                    <>
                                                                        <p>Wallet #{m.params.walletIndex} SOL: <span style={{ color: "white" }}>{formatBalance(progress.balances.sol, 4)} SOL</span></p>
                                                                        <p>Wallet #{m.params.walletIndex} {selectedBot?.baseSymbol || 'TOKEN'}: <span style={{ color: "white" }}>{formatBalance(progress.balances.spl, 4)} {selectedBot?.baseSymbol || 'TOKEN'}</span></p>
                                                                    </>
                                                                )}
                                                                </>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            <div className="glass-card session-history-card" style={{
                                borderRadius: "16px",
                                marginTop: "20px",
                                overflow: "hidden",
                            }}>
                                <div style={{
                                    padding: "16px 20px",
                                    background: "rgba(255,255,255,0.05)",
                                    borderBottom: "1px solid rgba(255,255,255,0.1)",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                }}>
                                    <h3 style={{
                                        fontSize: "18px",
                                        fontWeight: "600",
                                        color: "white",
                                    }}>
                                        Session History
                                    </h3>
                                    {sessionsLoading && (
                                        <span style={{ color: "#9ca3af", fontSize: "12px" }}>Loading...</span>
                                    )}
                                </div>
                                <div style={{ padding: "16px 20px" }}>
                                    {sessionsError && (
                                        <p style={{ color: "#ff6b6b", marginBottom: "8px" }}>{sessionsError}</p>
                                    )}
                                    {!sessionsLoading && sessions.length === 0 && (
                                        <p style={{ color: "#9ca3af" }}>No sessions yet.</p>
                                    )}
                                    {!sessionsLoading && sessions.length > 0 && (
                                        <div className="session-table-wrapper" style={{
                                            overflowX: "auto",
                                            WebkitOverflowScrolling: "touch",
                                            position: "relative",
                                        }}>
                                            {/* Scroll fade indicator - shown on mobile */}
                                            <div className="scroll-fade-indicator" style={{
                                                display: "none",
                                                position: "absolute",
                                                right: 0,
                                                top: 0,
                                                bottom: 0,
                                                width: "40px",
                                                background: "linear-gradient(to right, transparent, rgba(26, 26, 36, 0.95))",
                                                pointerEvents: "none",
                                                zIndex: 5,
                                            }} />
                                            <div className="session-table" style={{ display: "grid", gap: "8px", minWidth: "fit-content" }}>
                                                {sessions.map((session, index) => (
                                                    <div
                                                        key={`${session.createdAt}-${index}`}
                                                        className="session-row"
                                                        style={{
                                                            display: "grid",
                                                            gridTemplateColumns: "100px 80px 180px",
                                                            gap: "12px",
                                                            padding: "12px",
                                                            borderRadius: "12px",
                                                            background: "rgba(255,255,255,0.03)",
                                                            border: "1px solid rgba(255,255,255,0.06)",
                                                            color: "#d1d5db",
                                                            fontSize: "14px",
                                                        }}
                                                    >
                                                        <div className="session-type" style={{
                                                            textTransform: "capitalize",
                                                            color: "white",
                                                            fontWeight: 500,
                                                            whiteSpace: "nowrap",
                                                        }}>
                                                            {session.methodType}
                                                        </div>
                                                        <div className="session-amount" style={{ whiteSpace: "nowrap" }}>
                                                            {session.total} {quoteSymbol}
                                                        </div>
                                                        <div className="session-date" style={{ color: "#9ca3af", textAlign: "right", whiteSpace: "nowrap" }}>
                                                            {new Date(session.createdAt).toLocaleString()}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    {sessionsTotal > sessionsPageSize && (
                                        <div style={{
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "space-between",
                                            marginTop: "12px",
                                            color: "#9ca3af",
                                            fontSize: "12px",
                                        }}>
                                            <span>
                                                Page {sessionsPage} of {Math.max(1, Math.ceil(sessionsTotal / sessionsPageSize))}
                                            </span>
                                            <div style={{ display: "flex", gap: "8px" }}>
                                                <button
                                                    onClick={() => setSessionsPage((p) => Math.max(1, p - 1))}
                                                    disabled={sessionsPage === 1}
                                                    style={{
                                                        padding: "6px 10px",
                                                        borderRadius: "8px",
                                                        border: "1px solid rgba(255,255,255,0.1)",
                                                        background: "rgba(255,255,255,0.05)",
                                                        color: sessionsPage === 1 ? "#6b7280" : "white",
                                                        cursor: sessionsPage === 1 ? "not-allowed" : "pointer",
                                                    }}
                                                >
                                                    Prev
                                                </button>
                                                <button
                                                    onClick={() =>
                                                        setSessionsPage((p) =>
                                                            Math.min(Math.ceil(sessionsTotal / sessionsPageSize), p + 1)
                                                        )
                                                    }
                                                    disabled={sessionsPage >= Math.ceil(sessionsTotal / sessionsPageSize)}
                                                    style={{
                                                        padding: "6px 10px",
                                                        borderRadius: "8px",
                                                        border: "1px solid rgba(255,255,255,0.1)",
                                                        background: "rgba(255,255,255,0.05)",
                                                        color:
                                                            sessionsPage >= Math.ceil(sessionsTotal / sessionsPageSize)
                                                                ? "#6b7280"
                                                                : "white",
                                                        cursor:
                                                            sessionsPage >= Math.ceil(sessionsTotal / sessionsPageSize)
                                                                ? "not-allowed"
                                                                : "pointer",
                                                    }}
                                                >
                                                    Next
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div style={{ textAlign: "center", padding: "48px", color: "#6b7280" }}>
                            Select a bot from the sidebar
                        </div>
                    )}
                </main>
            </div>

            {showCreateBot && (
                <div style={{
                    position: "fixed",
                    inset: 0,
                    background: "rgba(0,0,0,0.8)",
                    backdropFilter: "blur(4px)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    zIndex: 200,
                    padding: "16px",
                }}>
                    <div className="glass-card" style={{
                        borderRadius: "16px",
                        padding: "24px",
                        width: "100%",
                        maxWidth: "480px",
                    }}>
                        <h2 style={{
                            fontSize: "20px",
                            fontWeight: "bold",
                            color: "white",
                            marginBottom: "24px",
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                        }}>
                            <svg style={{ width: "24px", height: "24px", color: SOLANA_PURPLE }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                            </svg>
                            Create New Bot
                        </h2>
                        <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginBottom: "24px" }}>
                            <div>
                                <label style={{ display: "block", fontSize: "14px", fontWeight: "500", color: "#9ca3af", marginBottom: "8px" }}>
                                    Instance ID
                                </label>
                                <input
                                    placeholder="unique-bot-name"
                                    value={newBot.instanceId}
                                    disabled={creatingBot}
                                    onChange={(e) => setNewBot({ ...newBot, instanceId: e.target.value })}
                                    className="input-dark"
                                    style={{ width: "100%" }}
                                />
                            </div>
                            <div>
                                <label style={{ display: "block", fontSize: "14px", fontWeight: "500", color: "#9ca3af", marginBottom: "8px" }}>
                                    Pool ID
                                </label>
                                <input
                                    placeholder="Enter pool address"
                                    value={newBot.poolId}
                                    disabled={creatingBot}
                                    onChange={(e) => setNewBot({ ...newBot, poolId: e.target.value })}
                                    className="input-dark"
                                    style={{ width: "100%" }}
                                />
                            </div>
                            <div>
                                <label style={{ display: "block", fontSize: "14px", fontWeight: "500", color: "#9ca3af", marginBottom: "8px" }}>
                                    Account
                                </label>
                                {accounts.length === 0 ? (
                                    <div style={{ color: "#9ca3af", fontSize: "14px" }}>
                                        No accounts yet.{" "}
                                        <span
                                            onClick={() => navigate("/accounts")}
                                            style={{ color: "#c4b5fd", cursor: "pointer", textDecoration: "underline" }}
                                        >
                                            Create one
                                        </span>
                                    </div>
                                ) : (
                                    <div ref={accountDropdownRef} style={{ position: "relative" }}>
                                        <button
                                            type="button"
                                            disabled={creatingBot}
                                            onClick={() => setAccountDropdownOpen(!accountDropdownOpen)}
                                            className="input-dark"
                                            style={{
                                                width: "100%",
                                                fontSize: "14px",
                                                padding: "10px 12px",
                                                cursor: creatingBot ? "not-allowed" : "pointer",
                                                opacity: creatingBot ? 0.7 : 1,
                                                textAlign: "left",
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "space-between",
                                            }}
                                        >
                                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                                {newBot.accountId
                                                    ? (() => {
                                                        const acc = accounts.find(a => a._id === newBot.accountId);
                                                        return acc ? `${acc.name} (${acc.addresses[0]?.address?.slice(0, 6)}...${acc.addresses[0]?.address?.slice(-4)})` : "Select an account";
                                                    })()
                                                    : "Select an account"}
                                            </span>
                                            <svg
                                                style={{
                                                    width: "16px",
                                                    height: "16px",
                                                    flexShrink: 0,
                                                    marginLeft: "8px",
                                                    transform: accountDropdownOpen ? "rotate(180deg)" : "rotate(0deg)",
                                                    transition: "transform 0.15s",
                                                }}
                                                fill="none"
                                                stroke="currentColor"
                                                viewBox="0 0 24 24"
                                            >
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                            </svg>
                                        </button>
                                        {accountDropdownOpen && !creatingBot && (
                                            <div style={{
                                                position: "absolute",
                                                top: "calc(100% + 4px)",
                                                left: 0,
                                                right: 0,
                                                background: "#1a1a2e",
                                                border: "1px solid rgba(255,255,255,0.12)",
                                                borderRadius: "8px",
                                                zIndex: 50,
                                                boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
                                                maxHeight: "240px",
                                                overflowY: "auto",
                                            }}>
                                                {accounts.map((acc) => (
                                                    <button
                                                        key={acc._id}
                                                        type="button"
                                                        className="dropdown-item"
                                                        onClick={() => {
                                                            setNewBot({ ...newBot, accountId: acc._id });
                                                            setAccountDropdownOpen(false);
                                                        }}
                                                        style={{
                                                            width: "100%",
                                                            display: "flex",
                                                            alignItems: "center",
                                                            padding: "10px 12px",
                                                            background: acc._id === newBot.accountId ? "rgba(153,69,255,0.12)" : "transparent",
                                                            border: "none",
                                                            cursor: "pointer",
                                                            textAlign: "left",
                                                            color: "white",
                                                            fontSize: "14px",
                                                        }}
                                                        onMouseEnter={(e) => {
                                                            if (acc._id !== newBot.accountId) e.currentTarget.style.background = "rgba(255,255,255,0.06)";
                                                        }}
                                                        onMouseLeave={(e) => {
                                                            if (acc._id !== newBot.accountId) e.currentTarget.style.background = "transparent";
                                                        }}
                                                    >
                                                        {acc.name} ({acc.addresses[0]?.address?.slice(0, 6)}...{acc.addresses[0]?.address?.slice(-4)})
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                        {creatingBot && (
                            <div
                                style={{
                                    marginBottom: "12px",
                                    padding: "10px 12px",
                                    borderRadius: "10px",
                                    border: "1px solid rgba(20,241,149,0.3)",
                                    background: "rgba(20,241,149,0.08)",
                                    color: "#d1fae5",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "8px",
                                    fontSize: "13px",
                                }}
                            >
                                <svg style={{ width: "16px", height: "16px", animation: "spin 1s linear infinite" }} viewBox="0 0 24 24">
                                    <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                    <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                                Preparing bot instance... this can take a few seconds on Raydium/Meteora pools.
                            </div>
                        )}
                        {createBotError && (
                            <div
                                style={{
                                    marginBottom: "12px",
                                    padding: "10px 12px",
                                    borderRadius: "10px",
                                    border: "1px solid rgba(239,68,68,0.35)",
                                    background: "rgba(239,68,68,0.08)",
                                    color: "#fecaca",
                                    fontSize: "13px",
                                }}
                            >
                                {createBotError}
                            </div>
                        )}
                        <div style={{ display: "flex", gap: "12px" }}>
                            <button
                                onClick={createBot}
                                disabled={creatingBot}
                                className="btn-primary"
                                style={{ flex: 1, opacity: creatingBot ? 0.8 : 1, cursor: creatingBot ? "not-allowed" : "pointer" }}
                            >
                                {creatingBot ? "Creating..." : "Launch Bot"}
                            </button>
                            <button
                                onClick={() => setShowCreateBot(false)}
                                disabled={creatingBot}
                                style={{
                                    flex: 1,
                                    padding: "12px 24px",
                                    borderRadius: "12px",
                                    border: "1px solid #4b5563",
                                    background: "transparent",
                                    color: "#d1d5db",
                                    cursor: creatingBot ? "not-allowed" : "pointer",
                                    opacity: creatingBot ? 0.7 : 1,
                                }}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Username Change Modal */}
            {showUsernameModal && (
                <div style={{
                    position: "fixed",
                    inset: 0,
                    background: "rgba(0,0,0,0.8)",
                    backdropFilter: "blur(4px)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    zIndex: 200,
                    padding: "16px",
                }}>
                    <div className="glass-card" style={{
                        borderRadius: "16px",
                        padding: "24px",
                        width: "100%",
                        maxWidth: "400px",
                    }}>
                        <h2 style={{
                            fontSize: "20px",
                            fontWeight: "bold",
                            color: "white",
                            marginBottom: "24px",
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                        }}>
                            <svg style={{ width: "24px", height: "24px", color: SOLANA_PURPLE }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                            Change Username
                        </h2>
                        <div style={{ marginBottom: "24px" }}>
                            <label style={{ display: "block", fontSize: "14px", fontWeight: "500", color: "#9ca3af", marginBottom: "8px" }}>
                                New Username
                            </label>
                            <input
                                placeholder="Enter new username"
                                value={newUsernameInput}
                                onChange={(e) => {
                                    setNewUsernameInput(e.target.value);
                                    setUsernameError(null);
                                }}
                                className="input-dark"
                                style={{ width: "100%" }}
                                maxLength={20}
                            />
                            <p style={{ fontSize: "12px", color: "#6b7280", marginTop: "8px" }}>
                                3-20 characters, letters, numbers, and underscores only
                            </p>
                            {usernameError && (
                                <p style={{ fontSize: "14px", color: "#f87171", marginTop: "8px" }}>
                                    {usernameError}
                                </p>
                            )}
                        </div>
                        <div style={{ display: "flex", gap: "12px" }}>
                            <button
                                onClick={handleUsernameSubmit}
                                className="btn-primary"
                                style={{ flex: 1, opacity: usernameLoading ? 0.7 : 1 }}
                                disabled={usernameLoading || !newUsernameInput.trim()}
                            >
                                {usernameLoading ? "Updating..." : "Update Username"}
                            </button>
                            <button
                                onClick={() => {
                                    setShowUsernameModal(false);
                                    setNewUsernameInput("");
                                    setUsernameError(null);
                                }}
                                style={{
                                    flex: 1,
                                    padding: "12px 24px",
                                    borderRadius: "12px",
                                    border: "1px solid #4b5563",
                                    background: "transparent",
                                    color: "#d1d5db",
                                    cursor: "pointer",
                                }}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {sidebarOpen && (
                <div
                    onClick={() => setSidebarOpen(false)}
                    style={{
                        position: "fixed",
                        inset: 0,
                        background: "rgba(0,0,0,0.5)",
                        zIndex: 49,
                    }}
                    className="sidebar-overlay"
                />
            )}

            <div style={{
                position: "fixed",
                bottom: "24px",
                right: "24px",
                display: "flex",
                flexDirection: "column",
                gap: "8px",
                zIndex: 300,
            }}>
                {toasts.map(toast => (
                    <div
                        key={toast.id}
                        style={{
                            padding: "12px 20px",
                            borderRadius: "12px",
                            background: toast.type === 'success' 
                                ? "rgba(20, 241, 149, 0.15)" 
                                : toast.type === 'error'
                                ? "rgba(239, 68, 68, 0.15)"
                                : "rgba(153, 69, 255, 0.15)",
                            border: `1px solid ${
                                toast.type === 'success' 
                                    ? "rgba(20, 241, 149, 0.3)" 
                                    : toast.type === 'error'
                                    ? "rgba(239, 68, 68, 0.3)"
                                    : "rgba(153, 69, 255, 0.3)"
                            }`,
                            backdropFilter: "blur(10px)",
                            color: toast.type === 'success' 
                                ? SOLANA_GREEN 
                                : toast.type === 'error'
                                ? "#f87171"
                                : SOLANA_PURPLE,
                            fontSize: "14px",
                            fontWeight: "500",
                            display: "flex",
                            alignItems: "center",
                            gap: "10px",
                            animation: "slideIn 0.3s ease",
                            boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
                        }}
                    >
                        {toast.type === 'success' && (
                            <svg style={{ width: "18px", height: "18px" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                        )}
                        {toast.type === 'info' && (
                            <svg style={{ width: "18px", height: "18px" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        )}
                        {toast.type === 'error' && (
                            <svg style={{ width: "18px", height: "18px" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        )}
                        {toast.message}
                    </div>
                ))}
            </div>

            <style>{`
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
                @keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }

                /* Desktop layout - single row for bot header info */
                @media (min-width: 1200px) {
                    .bot-header-main {
                        flex-wrap: nowrap !important;
                    }
                    .bot-info-group {
                        flex-wrap: nowrap !important;
                    }
                }

                @media (max-width: 768px) {
                    /* Sidebar mobile behavior */
                    .sidebar {
                        position: fixed !important;
                        left: -280px;
                        top: 120px;
                        height: calc(100vh - 120px) !important;
                        z-index: 50;
                        transition: left 0.3s ease;
                        background: rgba(17, 17, 17, 0.98) !important;
                    }
                    .sidebar.sidebar-open {
                        left: 0;
                    }
                    .sidebar-toggle {
                        display: flex !important;
                    }
                    .mobile-bot-selector {
                        display: block !important;
                    }
                    .method-grid {
                        grid-template-columns: 1fr !important;
                    }

                    /* Header restructure for mobile */
                    .app-header {
                        padding: 10px 12px !important;
                        gap: 6px !important;
                    }
                    .header-row-1 {
                        justify-content: space-between !important;
                        position: relative;
                        margin-bottom: 15px;
                    }
                    .header-brand {
                        position: absolute;
                        left: 50%;
                        transform: translateX(-50%);
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        max-width: calc(100% - 130px);
                    }
                    .header-brand h1 {
                        font-size: 24px !important;
                        white-space: nowrap;
                    }
                    .header-desktop-controls {
                        display: none !important;
                    }
                    .mobile-logout {
                        display: block !important;
                    }
                    .header-row-2 {
                        display: flex !important;
                    }
                    .user-badge {
                        display: none !important;
                    }

                    /* Bot card header mobile layout */
                    .bot-header-main {
                        flex-direction: column !important;
                        align-items: stretch !important;
                    }
                    .bot-header-main h2 {
                        text-align: center;
                        margin-bottom: 12px !important;
                        font-size: 24px !important;
                    }
                    .bot-info-group {
                        justify-content: center !important;
                        margin-bottom: 12px !important;
                    }
                    .delete-bot-btn {
                        align-self: center !important;
                        padding: 4px 8px !important;
                        font-size: 11px !important;
                    }
                    .delete-btn-text {
                        display: none;
                    }
                    .bot-subtitle {
                        text-align: center !important;
                    }

                    /* Session history table mobile scroll */
                    .session-table-wrapper {
                        margin: 0 -20px;
                        padding: 0 20px;
                        position: relative;
                    }
                    .scroll-fade-indicator {
                        display: block !important;
                    }
                    .session-row {
                        grid-template-columns: 80px 70px 160px !important;
                        gap: 8px !important;
                        padding: 10px !important;
                        font-size: 13px !important;
                    }
                    .session-type {
                        position: sticky;
                        left: 0;
                        background: rgba(255,255,255,0.03);
                        z-index: 2;
                        padding-right: 8px;
                    }
                }

                /* Extra small screens */
                @media (max-width: 390px) {
                    .header-brand h1 {
                        font-size: 20px !important;
                    }
                    .bot-header h2 {
                        font-size: 20px !important;
                    }
                    .session-row {
                        grid-template-columns: 70px 60px 140px !important;
                        font-size: 12px !important;
                    }
                }
            `}</style>
        </div>
    );
};

const inputStyle = { fontSize: "14px", padding: "10px" };
const labelStyle = { display: "block", fontSize: "12px", fontWeight: "500" as const, color: "#9ca3af", marginBottom: "6px" };
const formatBalance = (value: number | undefined, digits = 2) => {
    if (value === null || value === undefined) return "N/A";
    return value.toLocaleString("en-US", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
    });
};

interface BotMethodFormProps {
    instanceId: string;
    method: string;
    params: any;
    isRunning: boolean;
    onToggle: (isRunning: boolean, params: MethodParams, isUpdate?: boolean) => void;
    reservedWallets?: { index: number; address: string }[];
    canUseAltAccounts?: boolean;
    canUseSeparateTradeSizes?: boolean;
    baseSymbol?: string;
    quoteSymbol?: string;
}

const BotMethodForm: React.FC<BotMethodFormProps> = ({
    instanceId,
    method,
    params,
    isRunning,
    onToggle,
    reservedWallets,
    canUseAltAccounts = true,
    canUseSeparateTradeSizes = false,
    baseSymbol = 'TOKEN',
    quoteSymbol = 'SOL',
}) => {
    const [useAltWallet, setUseAltWallet] = useState(
        Number.isInteger(params?.walletIndex),
    );
    const [copyLabel, setCopyLabel] = useState("Copy");
    const [concurrencyDropdownOpen, setConcurrencyDropdownOpen] = useState(false);
    const [walletDropdownOpen, setWalletDropdownOpen] = useState(false);
    const concurrencyDropdownRef = useRef<HTMLDivElement>(null);
    const walletDropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (concurrencyDropdownRef.current && !concurrencyDropdownRef.current.contains(e.target as Node)) {
                setConcurrencyDropdownOpen(false);
            }
            if (walletDropdownRef.current && !walletDropdownRef.current.contains(e.target as Node)) {
                setWalletDropdownOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const [formStrings, setFormStrings] = useState({
        tradeSizeMin: String(params?.tradeSize?.[0] ?? 0.1),
        tradeSizeMax: String(params?.tradeSize?.[1] ?? 1),
        slippage: String(params?.slippage ?? 1),
        concurrency: String(params?.concurrency ?? 1),
        timeIntervalMin: String(params?.timeInterval?.[0] ?? 15),
        timeIntervalMax: String(params?.timeInterval?.[1] ?? 60),
        numberOfWallets: String(params?.numberOfWallets ?? params?.walletRange?.[1] ?? 100),
        extractRatio: String(params?.extractRatio ?? 10),
        walletIndex: String(params?.walletIndex ?? ""),
        reserveTargetInSOL: String(params?.reserveTargetInSOL ?? 500),
        injectionAmount: String(params?.injectionAmount ?? 10),
        buyToSellRatio: String(Math.round((params?.buyToSellRatio ?? 0.5) * 100)),
        priceThreshold: String(params?.priceThreshold ?? 0),
        mcThreshold: String(params?.mcThreshold ?? 0),
    });
    const [thresholdType, setThresholdType] = useState<'price' | 'marketcap'>(
        params?.thresholdType ?? 'price'
    );
    // Separate buy/sell trade sizes state
    const [useSeparateTradeSizes, setUseSeparateTradeSizes] = useState(params?.useSeparateTradeSizes || false);
    const [buyTradeSizeMin, setBuyTradeSizeMin] = useState(String(params?.buyTradeSize?.[0] ?? 0.1));
    const [buyTradeSizeMax, setBuyTradeSizeMax] = useState(String(params?.buyTradeSize?.[1] ?? 1));
    const [sellTradeSizeMin, setSellTradeSizeMin] = useState(String(params?.sellTradeSize?.[0] ?? 0.1));
    const [sellTradeSizeMax, setSellTradeSizeMax] = useState(String(params?.sellTradeSize?.[1] ?? 1));
    const [autoRatioEnabled, setAutoRatioEnabled] = useState(params?.autoRatioEnabled ?? true);
    const [selectedWalletBalance, setSelectedWalletBalance] = useState<BalanceSnapshot | null>(null);
    const [selectedWalletLoading, setSelectedWalletLoading] = useState(false);
    const [selectedWalletError, setSelectedWalletError] = useState<string | null>(null);

    useEffect(() => {
        const hasWalletIndex = Number.isInteger(params?.walletIndex);
        setUseAltWallet(hasWalletIndex);
        setFormStrings((prev) => ({
            ...prev,
            walletIndex: hasWalletIndex ? String(params?.walletIndex) : "",
        }));
    }, [params?.walletIndex]);

    useEffect(() => {
        const walletIndex = parseInt(formStrings.walletIndex, 10);
        if (!useAltWallet || !Number.isInteger(walletIndex)) {
            setSelectedWalletBalance(null);
            setSelectedWalletError(null);
            setSelectedWalletLoading(false);
            return;
        }
        let isMounted = true;
        const fetchBalance = async () => {
            setSelectedWalletLoading(true);
            setSelectedWalletError(null);
            try {
                const res = await axios.get(`/api/bot/${instanceId}/wallet/${walletIndex}/balance`, {
                    headers: {
                        Authorization: `Bearer ${localStorage.getItem("token")}`,
                    },
                });
                if (isMounted) {
                    setSelectedWalletBalance(res.data.balances);
                }
            } catch (err: any) {
                if (isMounted) {
                    setSelectedWalletBalance({ sol: 0, spl: 0, wsol: 0, updatedAt: Date.now() });
                    setSelectedWalletError("Wallet not funded yet.");
                }
            } finally {
                if (isMounted) {
                    setSelectedWalletLoading(false);
                }
            }
        };
        fetchBalance();
        return () => {
            isMounted = false;
        };
    }, [formStrings.walletIndex, instanceId, useAltWallet]);

    // Auto-calculate buy/sell ratio when separate trade sizes are enabled
    useEffect(() => {
        if (!useSeparateTradeSizes || !autoRatioEnabled) return;

        const avgBuy = (parseFloat(buyTradeSizeMin) + parseFloat(buyTradeSizeMax)) / 2;
        const avgSell = (parseFloat(sellTradeSizeMin) + parseFloat(sellTradeSizeMax)) / 2;
        if (avgBuy + avgSell === 0) return;

        const ratioPercent = Math.round((avgSell / (avgBuy + avgSell)) * 100);
        setFormStrings(prev => ({
            ...prev,
            buyToSellRatio: String(Math.min(100, Math.max(0, ratioPercent)))
        }));
    }, [useSeparateTradeSizes, autoRatioEnabled, buyTradeSizeMin, buyTradeSizeMax, sellTradeSizeMin, sellTradeSizeMax]);

    // Handler for manual slider change - clears auto mode
    const handleBuySellRatioChange = (value: string) => {
        if (autoRatioEnabled && useSeparateTradeSizes) setAutoRatioEnabled(false);
        setFormStrings({ ...formStrings, buyToSellRatio: value });
    };

    const getFormParams = (): MethodParams => ({
        tradeSize: [
            parseFloat(formStrings.tradeSizeMin) || 0.1,
            parseFloat(formStrings.tradeSizeMax) || 1,
        ],
        slippage: parseFloat(formStrings.slippage) || 1,
        concurrency: parseInt(formStrings.concurrency) || 1,
        timeInterval: [
            parseFloat(formStrings.timeIntervalMin) || 15,
            parseFloat(formStrings.timeIntervalMax) || 60,
        ],
        startIndex: 1,
        numberOfWallets: parseInt(formStrings.numberOfWallets) || 100,
        extractRatio: parseInt(formStrings.extractRatio) || 10,
        ...(useAltWallet && formStrings.walletIndex
            ? { walletIndex: parseInt(formStrings.walletIndex) }
            : {}),
        reserveTargetInSOL: parseFloat(formStrings.reserveTargetInSOL) || 500,
        injectionAmount: parseFloat(formStrings.injectionAmount) || 10,
        buyToSellRatio: (parseInt(formStrings.buyToSellRatio, 10) || 50) / 100,
        priceThreshold: parseFloat(formStrings.priceThreshold) || 0,
        mcThreshold: parseFloat(formStrings.mcThreshold) || 0,
        thresholdType: thresholdType,
        // Separate buy/sell trade sizes
        ...(useSeparateTradeSizes ? {
            useSeparateTradeSizes: true,
            buyTradeSize: [
                parseFloat(buyTradeSizeMin) || 0.1,
                parseFloat(buyTradeSizeMax) || 1,
            ],
            sellTradeSize: [
                parseFloat(sellTradeSizeMin) || 0.1,
                parseFloat(sellTradeSizeMax) || 1,
            ],
            autoRatioEnabled: autoRatioEnabled,
        } : {}),
    });

    const handleToggle = () => {
        onToggle(!isRunning, getFormParams());
    };

    const handleUpdateParams = () => {
        onToggle(true, getFormParams(), true);
    };

    const handleToggleAltWallet = (checked: boolean) => {
        setUseAltWallet(checked);
        if (!checked) {
            setFormStrings({ ...formStrings, walletIndex: "" });
        }
    };

    const handleCopyWallet = async () => {
        const selectedIndex = parseInt(formStrings.walletIndex);
        const selectedAddress = reservedWallets?.find(
            (wallet) => wallet.index === selectedIndex,
        )?.address;
        if (!selectedAddress) return;
        try {
            await navigator.clipboard.writeText(selectedAddress);
            setCopyLabel("Copied");
            setTimeout(() => setCopyLabel("Copy"), 1200);
        } catch (err) {
            console.error("Failed to copy wallet address:", err);
        }
    };

    return (
        <div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div style={{ opacity: method === "volume" && useSeparateTradeSizes ? 0.5 : 1 }}>
                    <label style={labelStyle}>
                        Trade Size (Min/Max)
                        {method === "volume" && useSeparateTradeSizes && (
                            <span style={{
                                marginLeft: '8px',
                                fontSize: '10px',
                                color: '#6b7280',
                                fontWeight: 'normal',
                            }}>
                                (Using separate sizes below)
                            </span>
                        )}
                    </label>
                    <div style={{ display: "flex", gap: "8px" }}>
                        <input
                            type="number"
                            step="0.001"
                            value={formStrings.tradeSizeMin}
                            onChange={(e) => setFormStrings({ ...formStrings, tradeSizeMin: e.target.value })}
                            className="input-dark"
                            style={{
                                ...inputStyle,
                                cursor: method === "volume" && useSeparateTradeSizes ? 'not-allowed' : undefined,
                            }}
                            disabled={method === "volume" && useSeparateTradeSizes}
                        />
                        <input
                            type="number"
                            step="0.001"
                            value={formStrings.tradeSizeMax}
                            onChange={(e) => setFormStrings({ ...formStrings, tradeSizeMax: e.target.value })}
                            className="input-dark"
                            style={{
                                ...inputStyle,
                                cursor: method === "volume" && useSeparateTradeSizes ? 'not-allowed' : undefined,
                            }}
                            disabled={method === "volume" && useSeparateTradeSizes}
                        />
                    </div>
                </div>

                <div>
                    <label style={labelStyle}>Slippage (%)</label>
                    <input
                        type="number"
                        value={formStrings.slippage}
                        onChange={(e) => setFormStrings({ ...formStrings, slippage: e.target.value })}
                        className="input-dark"
                        style={inputStyle}
                    />
                </div>

                <div ref={concurrencyDropdownRef} style={{ position: "relative" }}>
                    <label style={labelStyle}>Concurrency</label>
                    <button
                        type="button"
                        onClick={() => setConcurrencyDropdownOpen(!concurrencyDropdownOpen)}
                        className="input-dark"
                        style={{
                            ...inputStyle,
                            cursor: "pointer",
                            textAlign: "left",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                        }}
                    >
                        <span>{formStrings.concurrency}</span>
                        <svg
                            style={{
                                width: "14px",
                                height: "14px",
                                flexShrink: 0,
                                transform: concurrencyDropdownOpen ? "rotate(180deg)" : "rotate(0deg)",
                                transition: "transform 0.15s",
                            }}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                    </button>
                    {concurrencyDropdownOpen && (
                        <div style={{
                            position: "absolute",
                            top: "calc(100% + 4px)",
                            left: 0,
                            right: 0,
                            background: "#1a1a2e",
                            border: "1px solid rgba(255,255,255,0.12)",
                            borderRadius: "8px",
                            zIndex: 50,
                            boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
                            maxHeight: "240px",
                            overflowY: "auto",
                        }}>
                            {["1", "2", "3"].map((val) => (
                                <button
                                    key={val}
                                    type="button"
                                    className="dropdown-item"
                                    onClick={() => {
                                        setFormStrings({ ...formStrings, concurrency: val });
                                        setConcurrencyDropdownOpen(false);
                                    }}
                                    style={{
                                        width: "100%",
                                        display: "flex",
                                        alignItems: "center",
                                        padding: "10px 12px",
                                        background: val === formStrings.concurrency ? "rgba(153,69,255,0.12)" : "transparent",
                                        border: "none",
                                        cursor: "pointer",
                                        textAlign: "left",
                                        color: "white",
                                        fontSize: "14px",
                                    }}
                                    onMouseEnter={(e) => {
                                        if (val !== formStrings.concurrency) e.currentTarget.style.background = "rgba(255,255,255,0.06)";
                                    }}
                                    onMouseLeave={(e) => {
                                        if (val !== formStrings.concurrency) e.currentTarget.style.background = "transparent";
                                    }}
                                >
                                    {val}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div>
                    <label style={labelStyle}>Time Interval (s)</label>
                    <div style={{ display: "flex", gap: "8px" }}>
                        <input
                            type="number"
                            step="0.1"
                            value={formStrings.timeIntervalMin}
                            onChange={(e) => setFormStrings({ ...formStrings, timeIntervalMin: e.target.value })}
                            className="input-dark"
                            style={inputStyle}
                        />
                        <input
                            type="number"
                            step="0.1"
                            value={formStrings.timeIntervalMax}
                            onChange={(e) => setFormStrings({ ...formStrings, timeIntervalMax: e.target.value })}
                            className="input-dark"
                            style={inputStyle}
                        />
                    </div>
                </div>

                {method !== "volume" && (
                    <>
                        <div>
                            <label style={labelStyle}># of wallets</label>
                            <input
                                type="number"
                                value={formStrings.numberOfWallets}
                                onChange={(e) => setFormStrings({ ...formStrings, numberOfWallets: e.target.value })}
                                className="input-dark"
                                style={inputStyle}
                            />
                        </div>

                        {method === "extract" && (
                            <div>
                                <label style={labelStyle}>Extract Ratio (%)</label>
                                <input
                                    type="number"
                                    value={formStrings.extractRatio}
                                    onChange={(e) => setFormStrings({ ...formStrings, extractRatio: e.target.value })}
                                    className="input-dark"
                                    style={inputStyle}
                                />
                            </div>
                        )}

                        <div style={{ gridColumn: "span 2" }}>
                            <label style={labelStyle}>Use alternate wallet</label>
                            {canUseAltAccounts ? (
                                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                    <input
                                        type="checkbox"
                                        checked={useAltWallet}
                                        onChange={(e) => handleToggleAltWallet(e.target.checked)}
                                    />
                                    <span style={{ fontSize: "12px", color: "#9ca3af" }}>
                                        Use a different wallet for {method}
                                    </span>
                                </div>
                            ) : (
                                <div style={{ fontSize: "12px", color: "#6b7280", opacity: 0.7 }}>
                                    Alternate wallets require 10M+ tokens or Pro
                                </div>
                            )}
                        </div>

                        {useAltWallet && canUseAltAccounts && (
                            <div style={{ gridColumn: "span 2" }}>
                                <label style={labelStyle}>Alternate wallet</label>
                                <div style={{ display: "flex", gap: "8px" }}>
                                    <div ref={walletDropdownRef} style={{ position: "relative", flex: 1 }}>
                                        <button
                                            type="button"
                                            onClick={() => setWalletDropdownOpen(!walletDropdownOpen)}
                                            className="input-dark"
                                            style={{
                                                ...inputStyle,
                                                cursor: "pointer",
                                                textAlign: "left",
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "space-between",
                                                width: "100%",
                                            }}
                                        >
                                            <span style={{ fontSize: "12px" }}>
                                                {formStrings.walletIndex
                                                    ? (() => { const addr = (reservedWallets || []).find(w => String(w.index) === formStrings.walletIndex)?.address; return addr ? `${addr.slice(0, 4)}...${addr.slice(-4)}` : "Select wallet"; })()
                                                    : "Select wallet"}
                                            </span>
                                            <svg
                                                style={{
                                                    width: "14px",
                                                    height: "14px",
                                                    flexShrink: 0,
                                                    marginLeft: "8px",
                                                    transform: walletDropdownOpen ? "rotate(180deg)" : "rotate(0deg)",
                                                    transition: "transform 0.15s",
                                                }}
                                                fill="none"
                                                stroke="currentColor"
                                                viewBox="0 0 24 24"
                                            >
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                            </svg>
                                        </button>
                                        {walletDropdownOpen && (
                                            <div style={{
                                                position: "absolute",
                                                top: "calc(100% + 4px)",
                                                left: 0,
                                                right: 0,
                                                background: "#1a1a2e",
                                                border: "1px solid rgba(255,255,255,0.12)",
                                                borderRadius: "8px",
                                                zIndex: 50,
                                                boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
                                                maxHeight: "240px",
                                                overflowY: "auto",
                                            }}>
                                                {(reservedWallets || []).map((wallet) => (
                                                    <button
                                                        key={wallet.index}
                                                        type="button"
                                                        className="dropdown-item"
                                                        onClick={() => {
                                                            setFormStrings({ ...formStrings, walletIndex: String(wallet.index) });
                                                            setWalletDropdownOpen(false);
                                                        }}
                                                        style={{
                                                            width: "100%",
                                                            display: "flex",
                                                            alignItems: "center",
                                                            padding: "10px 12px",
                                                            background: String(wallet.index) === formStrings.walletIndex ? "rgba(153,69,255,0.12)" : "transparent",
                                                            border: "none",
                                                            cursor: "pointer",
                                                            textAlign: "left",
                                                            color: "white",
                                                            fontSize: "12px",
                                                        }}
                                                        onMouseEnter={(e) => {
                                                            if (String(wallet.index) !== formStrings.walletIndex) e.currentTarget.style.background = "rgba(255,255,255,0.06)";
                                                        }}
                                                        onMouseLeave={(e) => {
                                                            if (String(wallet.index) !== formStrings.walletIndex) e.currentTarget.style.background = "transparent";
                                                        }}
                                                    >
                                                        {wallet.address.slice(0, 4)}...{wallet.address.slice(-4)}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleCopyWallet}
                                        disabled={!formStrings.walletIndex}
                                        style={{
                                            padding: "10px 14px",
                                            borderRadius: "10px",
                                            border: "1px solid rgba(255,255,255,0.2)",
                                            background: "rgba(255,255,255,0.06)",
                                            color: "white",
                                            cursor: formStrings.walletIndex ? "pointer" : "not-allowed",
                                            flexShrink: 0,
                                        }}
                                    >
                                        {copyLabel}
                                    </button>
                                </div>
                                <div style={{ marginTop: "10px", fontSize: "12px", color: "#9ca3af" }}>
                                    {selectedWalletLoading && <span>Loading wallet balance...</span>}
                                    {!selectedWalletLoading && selectedWalletBalance && (
                                        <span>
                                            Wallet balance: {formatBalance(selectedWalletBalance.sol, 4)} SOL
                                            {quoteSymbol !== "SOL" && selectedWalletBalance.quote !== undefined ? (
                                                <> / {formatBalance(selectedWalletBalance.quote, 4)} {quoteSymbol}</>
                                            ) : null}
                                            {" / "}
                                            {formatBalance(selectedWalletBalance.spl, 4)} {baseSymbol}
                                        </span>
                                    )}
                                    {!selectedWalletLoading && selectedWalletError && (
                                        <span style={{ color: "#f87171" }}> {selectedWalletError}</span>
                                    )}
                                </div>
                            </div>
                        )}
                    </>
                )}

                {method === "volume" && (
                    <>
                        <div>
                            <label style={labelStyle}>
                                Buy/Sell Balance
                                {useSeparateTradeSizes && autoRatioEnabled && (
                                    <span style={{
                                        marginLeft: '8px',
                                        padding: '2px 6px',
                                        fontSize: '10px',
                                        fontWeight: '600',
                                        borderRadius: '4px',
                                        background: 'rgba(153, 69, 255, 0.2)',
                                        color: '#9945ff',
                                    }}>
                                        Auto
                                    </span>
                                )}
                            </label>
                            <input
                                type="range"
                                min="0"
                                max="100"
                                value={formStrings.buyToSellRatio}
                                onChange={(e) => handleBuySellRatioChange(e.target.value)}
                                className="slider-dark"
                                style={{ width: '100%' }}
                            />
                            <div style={{ textAlign: 'center', fontSize: '11px', color: '#6b7280', marginTop: '4px' }}>
                                {formStrings.buyToSellRatio}% Buy / {100 - parseInt(formStrings.buyToSellRatio || '50', 10)}% Sell
                            </div>
                        </div>

                        <div>
                            <label style={labelStyle}># of wallets</label>
                            <input
                                type="number"
                                value={formStrings.numberOfWallets}
                                onChange={(e) => setFormStrings({ ...formStrings, numberOfWallets: e.target.value })}
                                className="input-dark"
                                style={inputStyle}
                            />
                        </div>

                        {/* Separate Buy/Sell Trade Sizes Toggle */}
                        <div style={{ gridColumn: "span 2" }}>
                            <label style={labelStyle}>Separate Buy/Sell Trade Sizes</label>
                            {canUseSeparateTradeSizes ? (
                                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                    <input
                                        type="checkbox"
                                        checked={useSeparateTradeSizes}
                                        onChange={(e) => setUseSeparateTradeSizes(e.target.checked)}
                                    />
                                    <span style={{ fontSize: "12px", color: "#9ca3af" }}>
                                        Set different min/max trade sizes for buys vs sells
                                    </span>
                                </div>
                            ) : (
                                <div style={{ fontSize: "12px", color: "#6b7280", opacity: 0.7 }}>
                                    Requires 1M+ tokens or Pro tier
                                </div>
                            )}
                        </div>

                        {/* Expandable panel for separate trade sizes */}
                        {useSeparateTradeSizes && canUseSeparateTradeSizes && (
                            <div style={{
                                gridColumn: "span 2",
                                padding: "16px",
                                borderRadius: "12px",
                                background: "rgba(255, 255, 255, 0.03)",
                                border: "1px solid rgba(255, 255, 255, 0.1)",
                            }}>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                                    <div>
                                        <label style={labelStyle}>Buy Trade Size (Min/Max)</label>
                                        <div style={{ display: "flex", gap: "8px" }}>
                                            <input
                                                type="number"
                                                step="0.001"
                                                value={buyTradeSizeMin}
                                                onChange={(e) => setBuyTradeSizeMin(e.target.value)}
                                                className="input-dark"
                                                style={inputStyle}
                                            />
                                            <input
                                                type="number"
                                                step="0.001"
                                                value={buyTradeSizeMax}
                                                onChange={(e) => setBuyTradeSizeMax(e.target.value)}
                                                className="input-dark"
                                                style={inputStyle}
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label style={labelStyle}>Sell Trade Size (Min/Max)</label>
                                        <div style={{ display: "flex", gap: "8px" }}>
                                            <input
                                                type="number"
                                                step="0.001"
                                                value={sellTradeSizeMin}
                                                onChange={(e) => setSellTradeSizeMin(e.target.value)}
                                                className="input-dark"
                                                style={inputStyle}
                                            />
                                            <input
                                                type="number"
                                                step="0.001"
                                                value={sellTradeSizeMax}
                                                onChange={(e) => setSellTradeSizeMax(e.target.value)}
                                                className="input-dark"
                                                style={inputStyle}
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div style={{ marginTop: "12px", display: "flex", alignItems: "center", gap: "10px" }}>
                                    <input
                                        type="checkbox"
                                        checked={autoRatioEnabled}
                                        onChange={(e) => setAutoRatioEnabled(e.target.checked)}
                                    />
                                    <span style={{ fontSize: "12px", color: "#9ca3af" }}>
                                        Auto-calculate buy/sell ratio from trade sizes
                                    </span>
                                </div>
                                <div style={{ fontSize: "11px", color: "#6b7280", marginTop: "4px", marginLeft: "22px" }}>
                                    Formula: buyRatio = avgSell / (avgBuy + avgSell) — keeps volume balanced
                                </div>
                            </div>
                        )}
                    </>
                )}

                {method === "extract" && (
                    <div style={{ gridColumn: "span 2" }}>
                        <label style={labelStyle}>Reserve Target ({quoteSymbol})</label>
                        <input
                            type="number"
                            step="0.1"
                            value={formStrings.reserveTargetInSOL}
                            onChange={(e) => setFormStrings({ ...formStrings, reserveTargetInSOL: e.target.value })}
                            className="input-dark"
                            style={inputStyle}
                        />
                    </div>
                )}

                {method === "inject" && (
                    <div style={{ gridColumn: "span 2" }}>
                        <label style={labelStyle}>Injection Amount ({quoteSymbol})</label>
                        <input
                            type="number"
                            step="0.1"
                            value={formStrings.injectionAmount}
                            onChange={(e) => setFormStrings({ ...formStrings, injectionAmount: e.target.value })}
                            className="input-dark"
                            style={inputStyle}
                        />
                    </div>
                )}

                {method === "defendFloor" && (
                    <>
                        <div style={{ gridColumn: "span 2" }}>
                            <label style={labelStyle}>Threshold Type</label>
                            <div style={{ display: "flex", gap: "12px", marginTop: "8px" }}>
                                <button
                                    type="button"
                                    onClick={() => setThresholdType('price')}
                                    style={{
                                        flex: 1,
                                        padding: "12px",
                                        borderRadius: "12px",
                                        border: thresholdType === 'price' ? `2px solid ${SOLANA_PURPLE}` : "1px solid rgba(255,255,255,0.2)",
                                        background: thresholdType === 'price' ? "rgba(153, 69, 255, 0.2)" : "rgba(255,255,255,0.06)",
                                        color: thresholdType === 'price' ? SOLANA_PURPLE : "white",
                                        fontWeight: thresholdType === 'price' ? "600" : "400",
                                        fontSize: "14px",
                                        cursor: "pointer",
                                        transition: "all 0.2s",
                                    }}
                                >
                                    Price
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setThresholdType('marketcap')}
                                    style={{
                                        flex: 1,
                                        padding: "12px",
                                        borderRadius: "12px",
                                        border: thresholdType === 'marketcap' ? `2px solid ${SOLANA_PURPLE}` : "1px solid rgba(255,255,255,0.2)",
                                        background: thresholdType === 'marketcap' ? "rgba(153, 69, 255, 0.2)" : "rgba(255,255,255,0.06)",
                                        color: thresholdType === 'marketcap' ? SOLANA_PURPLE : "white",
                                        fontWeight: thresholdType === 'marketcap' ? "600" : "400",
                                        fontSize: "14px",
                                        cursor: "pointer",
                                        transition: "all 0.2s",
                                    }}
                                >
                                    Market Cap
                                </button>
                            </div>
                        </div>

                        <div style={{ gridColumn: "span 2" }}>
                            <label style={labelStyle}>
                                {thresholdType === 'price' ? 'Price Threshold (USD)' : 'Market Cap Threshold (USD)'}
                            </label>
                            <input
                                type="number"
                                step="0.000001"
                                value={thresholdType === 'price' ? formStrings.priceThreshold : formStrings.mcThreshold}
                                onChange={(e) => setFormStrings({
                                    ...formStrings,
                                    [thresholdType === 'price' ? 'priceThreshold' : 'mcThreshold']: e.target.value
                                })}
                                className="input-dark"
                                style={inputStyle}
                                placeholder={thresholdType === 'price' ? 'e.g., 0.000050' : 'e.g., 50000'}
                            />
                        </div>
                    </>
                )}
            </div>

            <div style={{ display: "flex", gap: "12px", marginTop: "16px" }}>
                {isRunning && (
                    <button
                        onClick={handleUpdateParams}
                        style={{
                            flex: 1,
                            padding: "12px",
                            borderRadius: "12px",
                            background: "rgba(153, 69, 255, 0.2)",
                            color: "#9945ff",
                            border: "1px solid rgba(153, 69, 255, 0.3)",
                            fontWeight: "500",
                            fontSize: "14px",
                            cursor: "pointer",
                            transition: "all 0.2s",
                        }}
                    >
                        Update Params
                    </button>
                )}
                <button
                    onClick={handleToggle}
                    style={{
                        flex: 1,
                        padding: "12px",
                        borderRadius: "12px",
                        fontWeight: "600",
                        border: "none",
                        cursor: "pointer",
                        transition: "all 0.2s",
                        ...(isRunning
                            ? { background: "rgba(239, 68, 68, 0.2)", color: "#f87171" }
                            : { background: "rgba(20, 241, 149, 0.2)", color: "#14f195" }),
                    }}
                >
                    {isRunning ? "Stop" : "Start"} {method === "defendFloor" ? "Defend Floor" : method.charAt(0).toUpperCase() + method.slice(1)}
                </button>
            </div>
        </div>
    );
};

export default Dashboard;
