import React, { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";

interface AdminUser {
    id: string;
    username: string;
    createdAt: string;
    maxBots: number;
    maxBotsOverride: number | null;
    tierMaxBots: number;
    isAdmin: boolean;
    tier: "pro" | "free";
    walletAddress?: string;
    botCount: number;
    lastLoginAt?: string;
    lastSeenAt?: string;
}

interface AdminBot {
    instanceId: string;
    poolId: string;
    poolType?: string;
    methods: any;
    feesCollected?: number;
    runningTotals?: {
        volume?: { total: string; updatedAt?: string };
        inject?: { total: string; updatedAt?: string };
        extract?: { total: string; updatedAt?: string };
        defendFloor?: { total: string; updatedAt?: string };
    };
    userId?: {
        _id?: string;
        username?: string;
        tier?: "pro" | "free";
        isAdmin?: boolean;
        maxBots?: number;
        walletAddress?: string;
    };
}

interface PaginatedResponse<T> {
    items: T[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
}

type BotMethodType = "volume" | "inject" | "extract" | "defendFloor";

interface OverviewResponse {
    range: {
        key: "24h" | "7d" | "30d" | "90d";
        start: string;
        end: string;
    };
    kpis: {
        totalUsers: number;
        activeUsers: number;
        newUsers: number;
        totalBots: number;
        activeBots: number;
        newBots: number;
        totalFeesLamports: number;
        totalFeesSol: number;
        methodRunsInRange: number;
    };
    methods: {
        usage: {
            methodType: BotMethodType;
            runCount: number;
            completedCount: number;
            totalValue: number;
            avgDurationMs: number;
        }[];
        activeNow: Record<BotMethodType, number>;
    };
    series: {
        daily: {
            day: string;
            runs: number;
            totalValue: number;
            methods: Record<BotMethodType, { runs: number; totalValue: number }>;
        }[];
    };
}

interface TreasuryToken {
    mint: string;
    symbol: string;
    amount: number;
}

interface TreasuryWallet {
    address: string;
    sol: number;
    tokens: TreasuryToken[];
}

interface TreasuryResponse {
    asOf: string;
    totalSol: number;
    wallets: TreasuryWallet[];
    snapshot: {
        snapshotAt: string;
        totalSol: number;
    } | null;
}

interface TreasuryHistoryResponse {
    items: {
        snapshotAt: string;
        totalSol: number;
    }[];
    total: number;
}

interface OpsResponse {
    range: {
        key: "24h" | "7d" | "30d" | "90d";
        start: string;
        end: string;
    };
    generatedAt: string;
    sampleWindow: {
        apiStart: string;
        rpcStart: string;
    };
    server: {
        requests: {
            total: number;
            errors: number;
            errorRate: number;
            perMinute: number;
            avgLatencyMs: number;
            p95LatencyMs: number;
        };
        topRoutes: {
            method: string;
            route: string;
            count: number;
            errors: number;
            errorRate: number;
            avgLatencyMs: number;
            p95LatencyMs: number;
        }[];
    };
    rpc: {
        endpointHost: string | null;
        calls: {
            total: number;
            failed: number;
            failureRate: number;
            perMinute: number;
            avgLatencyMs: number;
            p95LatencyMs: number;
        };
        health: {
            ok: boolean;
            latencyMs: number | null;
            error: string | null;
        };
        topMethods: {
            method: string;
            count: number;
            failed: number;
            failureRate: number;
            avgLatencyMs: number;
            p95LatencyMs: number;
        }[];
    };
    pressure: {
        runningBots: number;
        activeMethods: Record<BotMethodType, number>;
        estimatedLoopsPerMinute: number;
        estimatedRpcRpm: number;
        rpcSoftLimitRpm: number | null;
        utilizationPct: number | null;
    };
    quality: {
        methodRuns: {
            total: number;
            completed: number;
            errored: number;
            stopped: number;
            errorRate: number;
        };
    };
    thresholds: {
        apiErrorWarnPct: number;
        apiErrorCriticalPct: number;
        rpcFailureWarnPct: number;
        rpcFailureCriticalPct: number;
        rpcHealthWarnLatencyMs: number;
        rpcUtilizationWarnPct: number;
        rpcUtilizationCriticalPct: number;
        methodErrorWarnPct: number;
        methodErrorCriticalPct: number;
        methodErrorMinRuns: number;
    };
    alerts: {
        severity: "info" | "warn" | "critical";
        title: string;
        message: string;
    }[];
}

const formatRelativeDate = (value?: string) => {
    if (!value) return "Never";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Never";
    return date.toLocaleString();
};

const formatNumber = (value: number, maxFractionDigits = 2) => {
    if (!Number.isFinite(value)) return "0";
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: maxFractionDigits }).format(value);
};

const formatMethodName = (method: BotMethodType) => {
    if (method === "defendFloor") return "Defend Floor";
    return method.charAt(0).toUpperCase() + method.slice(1);
};

const useDebouncedValue = <T,>(value: T, delayMs = 350): T => {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
        const timeout = window.setTimeout(() => setDebounced(value), delayMs);
        return () => window.clearTimeout(timeout);
    }, [value, delayMs]);
    return debounced;
};

const AdminDashboard: React.FC = () => {
    const navigate = useNavigate();
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<"overview" | "ops" | "users" | "bots" | "treasury">("overview");

    const [overviewRange, setOverviewRange] = useState<"24h" | "7d" | "30d" | "90d">("30d");
    const [overview, setOverview] = useState<OverviewResponse | null>(null);
    const [loadingOverview, setLoadingOverview] = useState(false);
    const [opsRange, setOpsRange] = useState<"24h" | "7d" | "30d" | "90d">("24h");
    const [ops, setOps] = useState<OpsResponse | null>(null);
    const [loadingOps, setLoadingOps] = useState(false);

    const [users, setUsers] = useState<AdminUser[]>([]);
    const [usersTotal, setUsersTotal] = useState(0);
    const [loadingUsers, setLoadingUsers] = useState(false);
    const [usersPage, setUsersPage] = useState(1);
    const [usersPageSize, setUsersPageSize] = useState(25);
    const [usersSearch, setUsersSearch] = useState("");
    const [usersTier, setUsersTier] = useState<"all" | "pro" | "free">("all");
    const [usersRole, setUsersRole] = useState<"all" | "admin" | "user">("all");
    const [usersSortBy, setUsersSortBy] = useState<"createdAt" | "username" | "tier" | "lastSeenAt">("createdAt");
    const [usersSortDir, setUsersSortDir] = useState<"asc" | "desc">("desc");
    const [maxBotsDraft, setMaxBotsDraft] = useState<Record<string, string>>({});

    const [bots, setBots] = useState<AdminBot[]>([]);
    const [botsTotal, setBotsTotal] = useState(0);
    const [loadingBots, setLoadingBots] = useState(false);
    const [botsPage, setBotsPage] = useState(1);
    const [botsPageSize, setBotsPageSize] = useState(25);
    const [botsSearch, setBotsSearch] = useState("");
    const [botsPoolType, setBotsPoolType] = useState<string>("all");
    const [botsMethod, setBotsMethod] = useState<string>("all");
    const [botsRunningOnly, setBotsRunningOnly] = useState(false);
    const [botsSortBy, setBotsSortBy] = useState<"createdAt" | "instanceId" | "feesCollected" | "user">("createdAt");
    const [botsSortDir, setBotsSortDir] = useState<"asc" | "desc">("desc");
    const [isCompactLayout, setIsCompactLayout] = useState(() =>
        typeof window !== "undefined" ? window.innerWidth < 1100 : false,
    );

    const [treasury, setTreasury] = useState<TreasuryResponse | null>(null);
    const [loadingTreasury, setLoadingTreasury] = useState(false);
    const [treasuryHistory, setTreasuryHistory] = useState<TreasuryHistoryResponse | null>(null);
    const [loadingTreasuryHistory, setLoadingTreasuryHistory] = useState(false);

    const usersTotalPages = useMemo(() => Math.max(1, Math.ceil(usersTotal / usersPageSize)), [usersTotal, usersPageSize]);
    const botsTotalPages = useMemo(() => Math.max(1, Math.ceil(botsTotal / botsPageSize)), [botsTotal, botsPageSize]);
    const debouncedUsersSearch = useDebouncedValue(usersSearch, 350);
    const debouncedBotsSearch = useDebouncedValue(botsSearch, 350);

    useEffect(() => {
        const onResize = () => setIsCompactLayout(window.innerWidth < 1100);
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    }, []);

    const fetchOverview = useCallback(async () => {
        setLoadingOverview(true);
        setError(null);
        try {
            const res = await axios.get<OverviewResponse>("/api/admin/overview", {
                params: { range: overviewRange },
            });
            setOverview(res.data);
        } catch (err) {
            console.error("Failed to fetch admin overview:", err);
            setError("Failed to load overview metrics");
        } finally {
            setLoadingOverview(false);
        }
    }, [overviewRange]);

    const fetchOps = useCallback(async () => {
        setLoadingOps(true);
        setError(null);
        try {
            const res = await axios.get<OpsResponse>("/api/admin/ops", {
                params: { range: opsRange },
            });
            setOps(res.data);
        } catch (err) {
            console.error("Failed to fetch ops metrics:", err);
            setError("Failed to load ops metrics");
        } finally {
            setLoadingOps(false);
        }
    }, [opsRange]);

    const fetchUsers = useCallback(async () => {
        setLoadingUsers(true);
        setError(null);
        try {
            const res = await axios.get<PaginatedResponse<AdminUser> | AdminUser[]>("/api/admin/users", {
                params: {
                    page: usersPage,
                    pageSize: usersPageSize,
                    search: debouncedUsersSearch,
                    tier: usersTier,
                    role: usersRole,
                    sortBy: usersSortBy,
                    sortDir: usersSortDir,
                },
            });

            if (Array.isArray(res.data)) {
                setUsers(res.data);
                setUsersTotal(res.data.length);
            } else {
                setUsers(res.data.items || []);
                setUsersTotal(res.data.total || 0);
            }
        } catch (err) {
            console.error("Failed to fetch users:", err);
            setError("Failed to load users");
        } finally {
            setLoadingUsers(false);
        }
    }, [debouncedUsersSearch, usersPage, usersPageSize, usersRole, usersSortBy, usersSortDir, usersTier]);

    const fetchBots = useCallback(async () => {
        setLoadingBots(true);
        setError(null);
        try {
            const res = await axios.get<PaginatedResponse<AdminBot> | AdminBot[]>("/api/admin/bots", {
                params: {
                    page: botsPage,
                    pageSize: botsPageSize,
                    search: debouncedBotsSearch,
                    poolType: botsPoolType,
                    method: botsMethod,
                    runningOnly: botsRunningOnly,
                    sortBy: botsSortBy,
                    sortDir: botsSortDir,
                },
            });

            if (Array.isArray(res.data)) {
                setBots(res.data);
                setBotsTotal(res.data.length);
            } else {
                setBots(res.data.items || []);
                setBotsTotal(res.data.total || 0);
            }
        } catch (err) {
            console.error("Failed to fetch bots:", err);
            setError("Failed to load bots");
        } finally {
            setLoadingBots(false);
        }
    }, [botsMethod, botsPage, botsPageSize, botsPoolType, botsRunningOnly, botsSortBy, botsSortDir, debouncedBotsSearch]);

    const fetchTreasury = useCallback(async (refresh = false) => {
        setLoadingTreasury(true);
        setError(null);
        try {
            const res = await axios.get<TreasuryResponse>("/api/admin/treasury", {
                params: refresh ? { refresh: true } : undefined,
            });
            setTreasury(res.data);
        } catch (err) {
            console.error("Failed to fetch treasury balances:", err);
            setError("Failed to load treasury balances");
        } finally {
            setLoadingTreasury(false);
        }
    }, []);

    const fetchTreasuryHistory = useCallback(async () => {
        setLoadingTreasuryHistory(true);
        setError(null);
        try {
            const res = await axios.get<TreasuryHistoryResponse>("/api/admin/treasury/history", {
                params: { limit: 96 },
            });
            setTreasuryHistory(res.data);
        } catch (err) {
            console.error("Failed to fetch treasury history:", err);
            setError("Failed to load treasury history");
        } finally {
            setLoadingTreasuryHistory(false);
        }
    }, []);

    useEffect(() => {
        if (activeTab === "overview") {
            fetchOverview();
        }
    }, [activeTab, fetchOverview]);

    useEffect(() => {
        if (activeTab === "ops") {
            fetchOps();
        }
    }, [activeTab, fetchOps]);

    useEffect(() => {
        if (activeTab === "users") {
            fetchUsers();
        }
    }, [activeTab, fetchUsers]);

    useEffect(() => {
        if (activeTab === "bots") {
            fetchBots();
        }
    }, [activeTab, fetchBots]);

    useEffect(() => {
        if (activeTab === "treasury") {
            void fetchTreasury(false);
            void fetchTreasuryHistory();
        }
    }, [activeTab, fetchTreasury, fetchTreasuryHistory]);

    useEffect(() => {
        setUsersPage(1);
    }, [debouncedUsersSearch, usersTier, usersRole, usersSortBy, usersSortDir, usersPageSize]);

    useEffect(() => {
        setBotsPage(1);
    }, [debouncedBotsSearch, botsPoolType, botsMethod, botsRunningOnly, botsSortBy, botsSortDir, botsPageSize]);

    useEffect(() => {
        setMaxBotsDraft((prev) => {
            const next = { ...prev };
            users.forEach((user) => {
                if (next[user.id] === undefined) {
                    next[user.id] = user.maxBotsOverride == null ? "" : String(user.maxBotsOverride);
                }
            });
            return next;
        });
    }, [users]);

    const updateUser = async (userId: string, updates: any) => {
        try {
            await axios.patch(`/api/admin/users/${userId}`, updates);
            await fetchUsers();
        } catch (err) {
            console.error("Failed to update user:", err);
            setError("Failed to update user");
        }
    };

    const saveMaxBotsOverride = async (user: AdminUser) => {
        const raw = (maxBotsDraft[user.id] ?? "").trim();
        const parsed = raw === "" ? null : Number(raw);
        if (parsed !== null && (!Number.isFinite(parsed) || parsed < 0)) {
            setError("Max bots override must be empty or a non-negative number");
            return;
        }
        await updateUser(user.id, { maxBots: parsed });
    };

    const stopBot = async (instanceId: string) => {
        try {
            await axios.post(`/api/admin/bots/${instanceId}/stop`);
            await fetchBots();
        } catch (err) {
            console.error("Failed to stop bot:", err);
            setError("Failed to stop bot");
        }
    };

    return (
        <div style={{ minHeight: "100vh", padding: "24px", color: "white" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                <div>
                    <h1 style={{ fontSize: "28px", fontWeight: 700, marginBottom: "6px" }}>Admin Dashboard</h1>
                    <p style={{ color: "#9ca3af", fontSize: "14px" }}>Scalable controls, metrics, and treasury visibility</p>
                </div>
                <button
                    onClick={() => navigate("/dashboard")}
                    style={{
                        padding: "8px 14px",
                        borderRadius: "8px",
                        background: "rgba(255,255,255,0.08)",
                        border: "1px solid rgba(255,255,255,0.2)",
                        color: "white",
                        cursor: "pointer",
                    }}
                >
                    Back to Dashboard
                </button>
            </div>

            <div style={{ display: "flex", gap: "12px", marginBottom: "16px", flexWrap: "wrap" }}>
                {[
                    { id: "overview", label: "Overview" },
                    { id: "ops", label: "Ops & Limits" },
                    { id: "users", label: "Users" },
                    { id: "bots", label: "Bots" },
                    { id: "treasury", label: "Treasury" },
                ].map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as "overview" | "ops" | "users" | "bots" | "treasury")}
                        style={{
                            padding: "8px 12px",
                            borderRadius: "8px",
                            border: "1px solid rgba(255,255,255,0.1)",
                            background: activeTab === tab.id ? "rgba(20, 241, 149, 0.2)" : "rgba(255,255,255,0.05)",
                            color: activeTab === tab.id ? "#14f195" : "white",
                            cursor: "pointer",
                        }}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {error && <p style={{ color: "#ff6b6b", marginBottom: "12px" }}>{error}</p>}

            {activeTab === "overview" && (
                <div className="glass-card" style={{ padding: "16px", borderRadius: "16px", display: "grid", gap: "12px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                            <select
                                value={overviewRange}
                                onChange={(e) => setOverviewRange(e.target.value as "24h" | "7d" | "30d" | "90d")}
                                className="input-dark"
                                style={{ padding: "8px" }}
                            >
                                <option value="24h">Last 24h</option>
                                <option value="7d">Last 7d</option>
                                <option value="30d">Last 30d</option>
                                <option value="90d">Last 90d</option>
                            </select>
                            <button
                                onClick={() => fetchOverview()}
                                style={{
                                    padding: "8px 12px",
                                    borderRadius: "8px",
                                    border: "1px solid rgba(255,255,255,0.15)",
                                    background: "rgba(255,255,255,0.06)",
                                    color: "white",
                                    cursor: "pointer",
                                }}
                            >
                                Refresh
                            </button>
                        </div>
                        {overview && (
                            <span style={{ color: "#9ca3af", fontSize: "12px" }}>
                                Range: {new Date(overview.range.start).toLocaleDateString()} - {new Date(overview.range.end).toLocaleDateString()}
                            </span>
                        )}
                    </div>

                    {loadingOverview ? (
                        <p style={{ color: "#9ca3af" }}>Loading overview...</p>
                    ) : overview ? (
                        <>
                            <div
                                style={{
                                    display: "grid",
                                    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                                    gap: "10px",
                                }}
                            >
                                {[
                                    { label: "Total Users", value: overview.kpis.totalUsers },
                                    { label: "Active Users", value: overview.kpis.activeUsers },
                                    { label: "New Users", value: overview.kpis.newUsers },
                                    { label: "Total Bots", value: overview.kpis.totalBots },
                                    { label: "Active Bots", value: overview.kpis.activeBots },
                                    { label: "New Bots", value: overview.kpis.newBots },
                                    { label: "Method Runs", value: overview.kpis.methodRunsInRange },
                                    { label: "Fees (SOL)", value: formatNumber(overview.kpis.totalFeesSol, 4) },
                                ].map((item) => (
                                    <div
                                        key={item.label}
                                        style={{
                                            padding: "12px",
                                            borderRadius: "12px",
                                            background: "rgba(255,255,255,0.04)",
                                            border: "1px solid rgba(255,255,255,0.08)",
                                        }}
                                    >
                                        <div style={{ color: "#9ca3af", fontSize: "12px" }}>{item.label}</div>
                                        <div style={{ fontSize: "22px", fontWeight: 700, marginTop: "4px" }}>{item.value}</div>
                                    </div>
                                ))}
                            </div>

                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px" }}>
                                {(["volume", "inject", "extract", "defendFloor"] as BotMethodType[]).map((method) => (
                                    <div
                                        key={method}
                                        style={{
                                            padding: "10px",
                                            borderRadius: "12px",
                                            background: "rgba(255,255,255,0.03)",
                                            border: "1px solid rgba(255,255,255,0.08)",
                                        }}
                                    >
                                        <div style={{ color: "#9ca3af", fontSize: "12px" }}>{formatMethodName(method)} active now</div>
                                        <div style={{ fontSize: "20px", fontWeight: 600 }}>{overview.methods.activeNow[method] || 0}</div>
                                    </div>
                                ))}
                            </div>

                            <div style={{ overflowX: "auto" }}>
                                <div style={{ minWidth: "740px" }}>
                                    <h3 style={{ marginBottom: "8px", fontSize: "15px" }}>Method Usage</h3>
                                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                                        <thead>
                                            <tr style={{ color: "#9ca3af", textAlign: "left" }}>
                                                <th style={{ padding: "8px" }}>Method</th>
                                                <th style={{ padding: "8px" }}>Runs</th>
                                                <th style={{ padding: "8px" }}>Completed</th>
                                                <th style={{ padding: "8px" }}>Completion %</th>
                                                <th style={{ padding: "8px" }}>Total Value</th>
                                                <th style={{ padding: "8px" }}>Avg Duration</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {overview.methods.usage.map((row) => {
                                                const completion = row.runCount > 0 ? (row.completedCount / row.runCount) * 100 : 0;
                                                return (
                                                    <tr key={row.methodType} style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                                                        <td style={{ padding: "8px" }}>{formatMethodName(row.methodType)}</td>
                                                        <td style={{ padding: "8px" }}>{formatNumber(row.runCount, 0)}</td>
                                                        <td style={{ padding: "8px" }}>{formatNumber(row.completedCount, 0)}</td>
                                                        <td style={{ padding: "8px" }}>{formatNumber(completion, 1)}%</td>
                                                        <td style={{ padding: "8px" }}>{formatNumber(row.totalValue, 3)}</td>
                                                        <td style={{ padding: "8px" }}>{formatNumber((row.avgDurationMs || 0) / 1000, 1)}s</td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            <div style={{ overflowX: "auto" }}>
                                <div style={{ minWidth: "760px" }}>
                                    <h3 style={{ marginBottom: "8px", fontSize: "15px" }}>Daily Volume and Runs</h3>
                                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                                        <thead>
                                            <tr style={{ color: "#9ca3af", textAlign: "left" }}>
                                                <th style={{ padding: "8px" }}>Day</th>
                                                <th style={{ padding: "8px" }}>Runs</th>
                                                <th style={{ padding: "8px" }}>Total Value</th>
                                                <th style={{ padding: "8px" }}>Volume</th>
                                                <th style={{ padding: "8px" }}>Inject</th>
                                                <th style={{ padding: "8px" }}>Extract</th>
                                                <th style={{ padding: "8px" }}>Defend Floor</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {overview.series.daily.length === 0 && (
                                                <tr>
                                                    <td style={{ padding: "8px", color: "#9ca3af" }} colSpan={7}>
                                                        No method runs recorded for selected range.
                                                    </td>
                                                </tr>
                                            )}
                                            {overview.series.daily.map((row) => (
                                                <tr key={row.day} style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                                                    <td style={{ padding: "8px" }}>{row.day}</td>
                                                    <td style={{ padding: "8px" }}>{formatNumber(row.runs, 0)}</td>
                                                    <td style={{ padding: "8px" }}>{formatNumber(row.totalValue, 3)}</td>
                                                    <td style={{ padding: "8px" }}>{formatNumber(row.methods.volume.totalValue, 3)} ({row.methods.volume.runs})</td>
                                                    <td style={{ padding: "8px" }}>{formatNumber(row.methods.inject.totalValue, 3)} ({row.methods.inject.runs})</td>
                                                    <td style={{ padding: "8px" }}>{formatNumber(row.methods.extract.totalValue, 3)} ({row.methods.extract.runs})</td>
                                                    <td style={{ padding: "8px" }}>{formatNumber(row.methods.defendFloor.totalValue, 3)} ({row.methods.defendFloor.runs})</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </>
                    ) : (
                        <p style={{ color: "#9ca3af" }}>No overview data loaded yet.</p>
                    )}
                </div>
            )}

            {activeTab === "ops" && (
                <div className="glass-card" style={{ padding: "16px", borderRadius: "16px", display: "grid", gap: "12px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                            <select
                                value={opsRange}
                                onChange={(e) => setOpsRange(e.target.value as "24h" | "7d" | "30d" | "90d")}
                                className="input-dark"
                                style={{ padding: "8px" }}
                            >
                                <option value="24h">Last 24h</option>
                                <option value="7d">Last 7d</option>
                                <option value="30d">Last 30d</option>
                                <option value="90d">Last 90d</option>
                            </select>
                            <button
                                onClick={() => fetchOps()}
                                style={{
                                    padding: "8px 12px",
                                    borderRadius: "8px",
                                    border: "1px solid rgba(255,255,255,0.15)",
                                    background: "rgba(255,255,255,0.06)",
                                    color: "white",
                                    cursor: "pointer",
                                }}
                            >
                                Refresh
                            </button>
                        </div>
                        {ops && (
                            <span style={{ color: "#9ca3af", fontSize: "12px" }}>
                                Generated {new Date(ops.generatedAt).toLocaleString()}
                            </span>
                        )}
                    </div>

                    {loadingOps ? (
                        <p style={{ color: "#9ca3af" }}>Loading operational metrics...</p>
                    ) : ops ? (
                        <>
                            <div style={{ display: "grid", gap: "8px" }}>
                                {ops.alerts.map((alert, index) => {
                                    const color =
                                        alert.severity === "critical" ? "#ef4444" : alert.severity === "warn" ? "#f59e0b" : "#60a5fa";
                                    return (
                                        <div
                                            key={`${alert.title}:${index}`}
                                            style={{
                                                padding: "10px 12px",
                                                borderRadius: "10px",
                                                border: `1px solid ${color}55`,
                                                background: `${color}22`,
                                            }}
                                        >
                                            <div style={{ fontWeight: 700, color }}>{alert.title}</div>
                                            <div style={{ fontSize: "12px", color: "#e5e7eb", marginTop: "3px" }}>{alert.message}</div>
                                        </div>
                                    );
                                })}
                            </div>

                            <div
                                style={{
                                    padding: "10px 12px",
                                    borderRadius: "12px",
                                    background: "rgba(255,255,255,0.03)",
                                    border: "1px solid rgba(255,255,255,0.08)",
                                }}
                            >
                                <div style={{ color: "#9ca3af", fontSize: "12px", marginBottom: "8px" }}>Alert Thresholds (Configured)</div>
                                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                                    {[
                                        `API warn ${formatNumber(ops.thresholds.apiErrorWarnPct, 1)}%`,
                                        `API critical ${formatNumber(ops.thresholds.apiErrorCriticalPct, 1)}%`,
                                        `RPC fail warn ${formatNumber(ops.thresholds.rpcFailureWarnPct, 1)}%`,
                                        `RPC fail critical ${formatNumber(ops.thresholds.rpcFailureCriticalPct, 1)}%`,
                                        `RPC latency warn ${formatNumber(ops.thresholds.rpcHealthWarnLatencyMs, 0)}ms`,
                                        `RPC util warn ${formatNumber(ops.thresholds.rpcUtilizationWarnPct, 1)}%`,
                                        `RPC util critical ${formatNumber(ops.thresholds.rpcUtilizationCriticalPct, 1)}%`,
                                        `Method err warn ${formatNumber(ops.thresholds.methodErrorWarnPct, 1)}%`,
                                        `Method err critical ${formatNumber(ops.thresholds.methodErrorCriticalPct, 1)}%`,
                                        `Method min runs ${formatNumber(ops.thresholds.methodErrorMinRuns, 0)}`,
                                    ].map((label) => (
                                        <span
                                            key={label}
                                            style={{
                                                padding: "4px 8px",
                                                borderRadius: "999px",
                                                border: "1px solid rgba(255,255,255,0.12)",
                                                color: "#d1d5db",
                                                fontSize: "11px",
                                            }}
                                        >
                                            {label}
                                        </span>
                                    ))}
                                </div>
                            </div>

                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: "10px" }}>
                                {[
                                    { label: "API Requests", value: formatNumber(ops.server.requests.total, 0) },
                                    { label: "API Error Rate", value: `${formatNumber(ops.server.requests.errorRate * 100, 2)}%` },
                                    { label: "API P95 Latency", value: `${formatNumber(ops.server.requests.p95LatencyMs, 0)}ms` },
                                    { label: "RPC Calls", value: formatNumber(ops.rpc.calls.total, 0) },
                                    { label: "RPC Failure Rate", value: `${formatNumber(ops.rpc.calls.failureRate * 100, 2)}%` },
                                    { label: "RPC P95 Latency", value: `${formatNumber(ops.rpc.calls.p95LatencyMs, 0)}ms` },
                                    { label: "Estimated RPC RPM", value: formatNumber(ops.pressure.estimatedRpcRpm, 1) },
                                    {
                                        label: "RPC Limit Usage",
                                        value: ops.pressure.utilizationPct == null ? "N/A" : `${formatNumber(ops.pressure.utilizationPct, 1)}%`,
                                    },
                                ].map((item) => (
                                    <div
                                        key={item.label}
                                        style={{
                                            padding: "12px",
                                            borderRadius: "12px",
                                            background: "rgba(255,255,255,0.04)",
                                            border: "1px solid rgba(255,255,255,0.08)",
                                        }}
                                    >
                                        <div style={{ color: "#9ca3af", fontSize: "12px" }}>{item.label}</div>
                                        <div style={{ fontSize: "22px", fontWeight: 700, marginTop: "4px" }}>{item.value}</div>
                                    </div>
                                ))}
                            </div>

                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "10px" }}>
                                <div
                                    style={{
                                        padding: "12px",
                                        borderRadius: "12px",
                                        background: "rgba(255,255,255,0.03)",
                                        border: "1px solid rgba(255,255,255,0.08)",
                                    }}
                                >
                                    <div style={{ color: "#9ca3af", fontSize: "12px", marginBottom: "8px" }}>RPC Health</div>
                                    <div style={{ fontWeight: 700, color: ops.rpc.health.ok ? "#14f195" : "#ef4444" }}>
                                        {ops.rpc.health.ok ? "Healthy" : "Unhealthy"}
                                    </div>
                                    <div style={{ color: "#9ca3af", fontSize: "12px", marginTop: "4px" }}>
                                        Endpoint: {ops.rpc.endpointHost || "not configured"}
                                    </div>
                                    <div style={{ color: "#9ca3af", fontSize: "12px", marginTop: "2px" }}>
                                        Latency: {ops.rpc.health.latencyMs == null ? "N/A" : `${formatNumber(ops.rpc.health.latencyMs, 0)}ms`}
                                    </div>
                                    {!ops.rpc.health.ok && ops.rpc.health.error && (
                                        <div style={{ color: "#fca5a5", fontSize: "12px", marginTop: "4px" }}>{ops.rpc.health.error}</div>
                                    )}
                                </div>
                                <div
                                    style={{
                                        padding: "12px",
                                        borderRadius: "12px",
                                        background: "rgba(255,255,255,0.03)",
                                        border: "1px solid rgba(255,255,255,0.08)",
                                    }}
                                >
                                    <div style={{ color: "#9ca3af", fontSize: "12px", marginBottom: "8px" }}>Running Method Pressure</div>
                                    {(["volume", "inject", "extract", "defendFloor"] as BotMethodType[]).map((method) => (
                                        <div key={method} style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", marginBottom: "4px" }}>
                                            <span style={{ color: "#9ca3af" }}>{formatMethodName(method)}</span>
                                            <span>{ops.pressure.activeMethods[method] || 0}</span>
                                        </div>
                                    ))}
                                    <div style={{ color: "#9ca3af", fontSize: "12px", marginTop: "6px" }}>
                                        Running bots: {ops.pressure.runningBots}
                                    </div>
                                </div>
                                <div
                                    style={{
                                        padding: "12px",
                                        borderRadius: "12px",
                                        background: "rgba(255,255,255,0.03)",
                                        border: "1px solid rgba(255,255,255,0.08)",
                                    }}
                                >
                                    <div style={{ color: "#9ca3af", fontSize: "12px", marginBottom: "8px" }}>Method Run Quality</div>
                                    <div style={{ fontSize: "13px", marginBottom: "4px" }}>Total: {ops.quality.methodRuns.total}</div>
                                    <div style={{ fontSize: "13px", marginBottom: "4px" }}>Completed: {ops.quality.methodRuns.completed}</div>
                                    <div style={{ fontSize: "13px", marginBottom: "4px" }}>Errored: {ops.quality.methodRuns.errored}</div>
                                    <div style={{ fontSize: "13px", marginBottom: "4px" }}>Stopped: {ops.quality.methodRuns.stopped}</div>
                                    <div style={{ color: "#9ca3af", fontSize: "12px", marginTop: "6px" }}>
                                        Error rate: {formatNumber(ops.quality.methodRuns.errorRate * 100, 2)}%
                                    </div>
                                </div>
                            </div>

                            <div style={{ overflowX: "auto" }}>
                                <div style={{ minWidth: "760px" }}>
                                    <h3 style={{ marginBottom: "8px", fontSize: "15px" }}>Top API Routes</h3>
                                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                                        <thead>
                                            <tr style={{ color: "#9ca3af", textAlign: "left" }}>
                                                <th style={{ padding: "8px" }}>Route</th>
                                                <th style={{ padding: "8px" }}>Count</th>
                                                <th style={{ padding: "8px" }}>Errors</th>
                                                <th style={{ padding: "8px" }}>Error %</th>
                                                <th style={{ padding: "8px" }}>Avg Latency</th>
                                                <th style={{ padding: "8px" }}>P95 Latency</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {ops.server.topRoutes.length === 0 && (
                                                <tr>
                                                    <td style={{ padding: "8px", color: "#9ca3af" }} colSpan={6}>
                                                        No API samples in current window.
                                                    </td>
                                                </tr>
                                            )}
                                            {ops.server.topRoutes.map((row) => (
                                                <tr key={`${row.method}:${row.route}`} style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                                                    <td style={{ padding: "8px" }}>{row.method} {row.route}</td>
                                                    <td style={{ padding: "8px" }}>{formatNumber(row.count, 0)}</td>
                                                    <td style={{ padding: "8px" }}>{formatNumber(row.errors, 0)}</td>
                                                    <td style={{ padding: "8px" }}>{formatNumber(row.errorRate * 100, 2)}%</td>
                                                    <td style={{ padding: "8px" }}>{formatNumber(row.avgLatencyMs, 0)}ms</td>
                                                    <td style={{ padding: "8px" }}>{formatNumber(row.p95LatencyMs, 0)}ms</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            <div style={{ overflowX: "auto" }}>
                                <div style={{ minWidth: "760px" }}>
                                    <h3 style={{ marginBottom: "8px", fontSize: "15px" }}>Top RPC Methods</h3>
                                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                                        <thead>
                                            <tr style={{ color: "#9ca3af", textAlign: "left" }}>
                                                <th style={{ padding: "8px" }}>Method</th>
                                                <th style={{ padding: "8px" }}>Count</th>
                                                <th style={{ padding: "8px" }}>Failed</th>
                                                <th style={{ padding: "8px" }}>Failure %</th>
                                                <th style={{ padding: "8px" }}>Avg Latency</th>
                                                <th style={{ padding: "8px" }}>P95 Latency</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {ops.rpc.topMethods.length === 0 && (
                                                <tr>
                                                    <td style={{ padding: "8px", color: "#9ca3af" }} colSpan={6}>
                                                        No RPC samples in current window.
                                                    </td>
                                                </tr>
                                            )}
                                            {ops.rpc.topMethods.map((row) => (
                                                <tr key={row.method} style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                                                    <td style={{ padding: "8px" }}>{row.method}</td>
                                                    <td style={{ padding: "8px" }}>{formatNumber(row.count, 0)}</td>
                                                    <td style={{ padding: "8px" }}>{formatNumber(row.failed, 0)}</td>
                                                    <td style={{ padding: "8px" }}>{formatNumber(row.failureRate * 100, 2)}%</td>
                                                    <td style={{ padding: "8px" }}>{formatNumber(row.avgLatencyMs, 0)}ms</td>
                                                    <td style={{ padding: "8px" }}>{formatNumber(row.p95LatencyMs, 0)}ms</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </>
                    ) : (
                        <p style={{ color: "#9ca3af" }}>No ops data loaded yet.</p>
                    )}
                </div>
            )}

            {activeTab === "users" && (
                <div className="glass-card" style={{ padding: "16px", borderRadius: "16px" }}>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "12px" }}>
                        <input
                            value={usersSearch}
                            onChange={(e) => setUsersSearch(e.target.value)}
                            placeholder="Search username or wallet"
                            className="input-dark"
                            style={{ minWidth: "160px", flex: "1 1 220px", padding: "8px" }}
                        />
                        <select value={usersTier} onChange={(e) => setUsersTier(e.target.value as "all" | "pro" | "free")} className="input-dark" style={{ padding: "8px" }}>
                            <option value="all">All tiers</option>
                            <option value="pro">Pro</option>
                            <option value="free">Free</option>
                        </select>
                        <select value={usersRole} onChange={(e) => setUsersRole(e.target.value as "all" | "admin" | "user")} className="input-dark" style={{ padding: "8px" }}>
                            <option value="all">All roles</option>
                            <option value="admin">Admin</option>
                            <option value="user">User</option>
                        </select>
                        <select value={usersSortBy} onChange={(e) => setUsersSortBy(e.target.value as "createdAt" | "username" | "tier" | "lastSeenAt")} className="input-dark" style={{ padding: "8px" }}>
                            <option value="createdAt">Sort: Created</option>
                            <option value="lastSeenAt">Sort: Last Seen</option>
                            <option value="username">Sort: Username</option>
                            <option value="tier">Sort: Tier</option>
                        </select>
                        <select value={usersSortDir} onChange={(e) => setUsersSortDir(e.target.value as "asc" | "desc")} className="input-dark" style={{ padding: "8px" }}>
                            <option value="desc">Desc</option>
                            <option value="asc">Asc</option>
                        </select>
                        <select value={String(usersPageSize)} onChange={(e) => setUsersPageSize(Number(e.target.value))} className="input-dark" style={{ padding: "8px" }}>
                            <option value="10">10 / page</option>
                            <option value="25">25 / page</option>
                            <option value="50">50 / page</option>
                            <option value="100">100 / page</option>
                        </select>
                    </div>

                    {loadingUsers ? (
                        <p style={{ color: "#9ca3af" }}>Loading users...</p>
                    ) : (
                        <>
                            <div style={{ overflowX: isCompactLayout ? "visible" : "auto" }}>
                                <div style={{ display: "grid", gap: "10px", minWidth: isCompactLayout ? undefined : "1100px" }}>
                                    {users.map((user) => (
                                        <div
                                            key={user.id}
                                            style={{
                                                display: "grid",
                                                gridTemplateColumns: isCompactLayout ? "1fr" : "1.5fr 0.7fr 0.8fr 0.9fr 1fr 1fr 1fr",
                                                gap: "12px",
                                                padding: "12px",
                                                borderRadius: "12px",
                                                background: "rgba(255,255,255,0.04)",
                                                border: "1px solid rgba(255,255,255,0.08)",
                                                alignItems: "center",
                                                fontSize: "14px",
                                            }}
                                        >
                                            <div>
                                                <div style={{ fontWeight: 600 }}>{user.username}</div>
                                                <div style={{ color: "#9ca3af", fontSize: "12px" }}>
                                                    Joined {new Date(user.createdAt).toLocaleDateString()}
                                                </div>
                                                <div style={{ color: "#6b7280", fontSize: "11px" }}>
                                                    Last seen {formatRelativeDate(user.lastSeenAt)}
                                                </div>
                                            </div>
                                            <div style={{ color: isCompactLayout ? "#d1d5db" : undefined }}>Bots: {user.botCount}</div>
                                            <div>
                                                <div style={{ fontSize: "12px", color: "#9ca3af", marginBottom: "4px" }}>Max bots</div>
                                                <div style={{ display: "flex", gap: "6px" }}>
                                                    <input
                                                        type="number"
                                                        min={0}
                                                        value={maxBotsDraft[user.id] ?? ""}
                                                        placeholder={String(user.tierMaxBots)}
                                                        onChange={(e) => setMaxBotsDraft((prev) => ({ ...prev, [user.id]: e.target.value }))}
                                                        className="input-dark"
                                                        style={{ width: isCompactLayout ? "100%" : "80px", padding: "6px", fontSize: "13px" }}
                                                    />
                                                    <button
                                                        onClick={() => saveMaxBotsOverride(user)}
                                                        style={{
                                                            padding: "6px 8px",
                                                            borderRadius: "6px",
                                                            border: "1px solid rgba(255,255,255,0.15)",
                                                            background: "rgba(255,255,255,0.06)",
                                                            color: "white",
                                                            cursor: "pointer",
                                                            fontSize: "12px",
                                                        }}
                                                    >
                                                        Save
                                                    </button>
                                                </div>
                                            </div>
                                            <div>
                                                <button
                                                    onClick={() => updateUser(user.id, { tier: user.tier === "pro" ? "free" : "pro" })}
                                                    style={{
                                                        padding: "6px 10px",
                                                        borderRadius: "8px",
                                                        border: "1px solid rgba(255,255,255,0.1)",
                                                        background: user.tier === "pro" ? "rgba(20, 241, 149, 0.2)" : "rgba(255,255,255,0.05)",
                                                        color: user.tier === "pro" ? "#14f195" : "white",
                                                        cursor: "pointer",
                                                        width: "100%",
                                                    }}
                                                >
                                                    {user.tier === "pro" ? "Pro" : "Free"}
                                                </button>
                                            </div>
                                            <div>
                                                <button
                                                    onClick={() => updateUser(user.id, { isAdmin: !user.isAdmin })}
                                                    style={{
                                                        padding: "6px 10px",
                                                        borderRadius: "8px",
                                                        border: "1px solid rgba(255,255,255,0.1)",
                                                        background: user.isAdmin ? "rgba(153, 69, 255, 0.2)" : "rgba(255,255,255,0.05)",
                                                        color: user.isAdmin ? "#c4b5fd" : "white",
                                                        cursor: "pointer",
                                                        width: "100%",
                                                    }}
                                                >
                                                    {user.isAdmin ? "Admin" : "User"}
                                                </button>
                                            </div>
                                            <div style={{ color: "#9ca3af", fontSize: "12px" }}>
                                                Wallet: {user.walletAddress ? `${user.walletAddress.slice(0, 4)}...${user.walletAddress.slice(-4)}` : "None"}
                                            </div>
                                            <div style={{ color: "#9ca3af", fontSize: "12px" }}>
                                                Last login: {formatRelativeDate(user.lastLoginAt)}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "12px", gap: "8px", flexWrap: "wrap" }}>
                                <span style={{ color: "#9ca3af", fontSize: "12px" }}>
                                    {usersTotal} users total
                                </span>
                                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                                    <button
                                        onClick={() => setUsersPage((p) => Math.max(1, p - 1))}
                                        disabled={usersPage <= 1}
                                        style={{
                                            padding: "6px 10px",
                                            borderRadius: "8px",
                                            border: "1px solid rgba(255,255,255,0.1)",
                                            background: "rgba(255,255,255,0.05)",
                                            color: usersPage <= 1 ? "#6b7280" : "white",
                                            cursor: usersPage <= 1 ? "not-allowed" : "pointer",
                                        }}
                                    >
                                        Prev
                                    </button>
                                    <span style={{ color: "#9ca3af", fontSize: "12px" }}>
                                        Page {usersPage} / {usersTotalPages}
                                    </span>
                                    <button
                                        onClick={() => setUsersPage((p) => Math.min(usersTotalPages, p + 1))}
                                        disabled={usersPage >= usersTotalPages}
                                        style={{
                                            padding: "6px 10px",
                                            borderRadius: "8px",
                                            border: "1px solid rgba(255,255,255,0.1)",
                                            background: "rgba(255,255,255,0.05)",
                                            color: usersPage >= usersTotalPages ? "#6b7280" : "white",
                                            cursor: usersPage >= usersTotalPages ? "not-allowed" : "pointer",
                                        }}
                                    >
                                        Next
                                    </button>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            )}

            {activeTab === "bots" && (
                <div className="glass-card" style={{ padding: "16px", borderRadius: "16px" }}>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "12px" }}>
                        <input
                            value={botsSearch}
                            onChange={(e) => setBotsSearch(e.target.value)}
                            placeholder="Search instance, pool, owner"
                            className="input-dark"
                            style={{ minWidth: "160px", flex: "1 1 220px", padding: "8px" }}
                        />
                        <select value={botsPoolType} onChange={(e) => setBotsPoolType(e.target.value)} className="input-dark" style={{ padding: "8px" }}>
                            <option value="all">All pool types</option>
                            <option value="pump">Pump</option>
                            <option value="raydium-amm">Raydium AMM</option>
                            <option value="raydium-cpmm">Raydium CPMM</option>
                            <option value="raydium-clmm">Raydium CLMM</option>
                            <option value="meteora-dlmm">Meteora DLMM</option>
                            <option value="meteora-damm-v2">Meteora DAMM v2</option>
                            <option value="meteora-damm-v1">Meteora DAMM v1</option>
                        </select>
                        <select value={botsMethod} onChange={(e) => setBotsMethod(e.target.value)} className="input-dark" style={{ padding: "8px" }}>
                            <option value="all">All methods</option>
                            <option value="volume">Volume</option>
                            <option value="inject">Inject</option>
                            <option value="extract">Extract</option>
                            <option value="defendFloor">Defend Floor</option>
                        </select>
                        <label style={{ display: "flex", alignItems: "center", gap: "6px", color: "#9ca3af", fontSize: "13px" }}>
                            <input type="checkbox" checked={botsRunningOnly} onChange={(e) => setBotsRunningOnly(e.target.checked)} />
                            Running only
                        </label>
                        <select value={botsSortBy} onChange={(e) => setBotsSortBy(e.target.value as "createdAt" | "instanceId" | "feesCollected" | "user")} className="input-dark" style={{ padding: "8px" }}>
                            <option value="createdAt">Sort: Created</option>
                            <option value="instanceId">Sort: Instance</option>
                            <option value="feesCollected">Sort: Fees</option>
                            <option value="user">Sort: User</option>
                        </select>
                        <select value={botsSortDir} onChange={(e) => setBotsSortDir(e.target.value as "asc" | "desc")} className="input-dark" style={{ padding: "8px" }}>
                            <option value="desc">Desc</option>
                            <option value="asc">Asc</option>
                        </select>
                        <select value={String(botsPageSize)} onChange={(e) => setBotsPageSize(Number(e.target.value))} className="input-dark" style={{ padding: "8px" }}>
                            <option value="10">10 / page</option>
                            <option value="25">25 / page</option>
                            <option value="50">50 / page</option>
                            <option value="100">100 / page</option>
                        </select>
                    </div>

                    {loadingBots ? (
                        <p style={{ color: "#9ca3af" }}>Loading bots...</p>
                    ) : (
                        <>
                            <div style={{ overflowX: isCompactLayout ? "visible" : "auto" }}>
                                <div style={{ display: "grid", gap: "10px", minWidth: isCompactLayout ? undefined : "1050px" }}>
                                    {bots.map((bot) => {
                                        const runningMethods = Object.entries(bot.methods || {})
                                            .filter(([, method]: any) => method?.isRunning)
                                            .map(([name]) => name)
                                            .join(", ");

                                        return (
                                            <div
                                                key={bot.instanceId}
                                                style={{
                                                    display: "grid",
                                                    gridTemplateColumns: isCompactLayout ? "1fr" : "1.3fr 1fr 1.2fr 1fr 0.7fr",
                                                    gap: "12px",
                                                    padding: "12px",
                                                    borderRadius: "12px",
                                                    background: "rgba(255,255,255,0.04)",
                                                    border: "1px solid rgba(255,255,255,0.08)",
                                                    alignItems: "center",
                                                    fontSize: "14px",
                                                }}
                                            >
                                                <div>
                                                    <div style={{ fontWeight: 600 }}>{bot.instanceId}</div>
                                                    <div style={{ color: "#9ca3af", fontSize: "12px" }}>{bot.poolId}</div>
                                                    <div style={{ color: "#6b7280", fontSize: "11px" }}>
                                                        {bot.poolType === "raydium-amm"
                                                            ? "Raydium AMM"
                                                            : bot.poolType === "raydium-cpmm"
                                                                ? "Raydium CPMM"
                                                                : bot.poolType === "raydium-clmm"
                                                                    ? "Raydium CLMM"
                                                                    : bot.poolType === "meteora-dlmm"
                                                                        ? "Meteora DLMM"
                                                                        : bot.poolType === "meteora-damm-v2"
                                                                            ? "Meteora DAMM v2"
                                                                            : bot.poolType === "meteora-damm-v1"
                                                                                ? "Meteora DAMM v1"
                                                                                : "Pump"}
                                                    </div>
                                                </div>
                                                <div>
                                                    <div style={{ fontWeight: 600 }}>{bot.userId?.username || "Unknown"}</div>
                                                    <div style={{ color: "#9ca3af", fontSize: "12px" }}>
                                                        {bot.userId?.tier === "pro" ? "Pro" : "Free"}
                                                    </div>
                                                </div>
                                                <div style={{ color: "#9ca3af", fontSize: "12px" }}>
                                                    Running: {runningMethods || "None"}
                                                </div>
                                                <div style={{ color: "#9ca3af", fontSize: "12px" }}>
                                                    Vol {bot.runningTotals?.volume?.total || "0"} | Inj {bot.runningTotals?.inject?.total || "0"} | Ext {bot.runningTotals?.extract?.total || "0"}
                                                </div>
                                                <button
                                                    onClick={() => stopBot(bot.instanceId)}
                                                    style={{
                                                        padding: "6px 10px",
                                                        borderRadius: "8px",
                                                        border: "1px solid rgba(255,255,255,0.1)",
                                                        background: "rgba(239, 68, 68, 0.2)",
                                                        color: "#fecaca",
                                                        cursor: "pointer",
                                                    }}
                                                >
                                                    Stop Bot
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "12px", gap: "8px", flexWrap: "wrap" }}>
                                <span style={{ color: "#9ca3af", fontSize: "12px" }}>
                                    {botsTotal} bots total
                                </span>
                                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                                    <button
                                        onClick={() => setBotsPage((p) => Math.max(1, p - 1))}
                                        disabled={botsPage <= 1}
                                        style={{
                                            padding: "6px 10px",
                                            borderRadius: "8px",
                                            border: "1px solid rgba(255,255,255,0.1)",
                                            background: "rgba(255,255,255,0.05)",
                                            color: botsPage <= 1 ? "#6b7280" : "white",
                                            cursor: botsPage <= 1 ? "not-allowed" : "pointer",
                                        }}
                                    >
                                        Prev
                                    </button>
                                    <span style={{ color: "#9ca3af", fontSize: "12px" }}>
                                        Page {botsPage} / {botsTotalPages}
                                    </span>
                                    <button
                                        onClick={() => setBotsPage((p) => Math.min(botsTotalPages, p + 1))}
                                        disabled={botsPage >= botsTotalPages}
                                        style={{
                                            padding: "6px 10px",
                                            borderRadius: "8px",
                                            border: "1px solid rgba(255,255,255,0.1)",
                                            background: "rgba(255,255,255,0.05)",
                                            color: botsPage >= botsTotalPages ? "#6b7280" : "white",
                                            cursor: botsPage >= botsTotalPages ? "not-allowed" : "pointer",
                                        }}
                                    >
                                        Next
                                    </button>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            )}

            {activeTab === "treasury" && (
                <div className="glass-card" style={{ padding: "16px", borderRadius: "16px", display: "grid", gap: "12px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                        <div style={{ color: "#9ca3af", fontSize: "12px" }}>
                            As of {treasury ? new Date(treasury.asOf).toLocaleString() : "-"}
                        </div>
                        <button
                            onClick={() => {
                                void fetchTreasury(true);
                                void fetchTreasuryHistory();
                            }}
                            style={{
                                padding: "8px 12px",
                                borderRadius: "8px",
                                border: "1px solid rgba(255,255,255,0.15)",
                                background: "rgba(255,255,255,0.06)",
                                color: "white",
                                cursor: "pointer",
                            }}
                        >
                            Refresh Live Balances
                        </button>
                    </div>

                    {loadingTreasury ? (
                        <p style={{ color: "#9ca3af" }}>Loading treasury balances...</p>
                    ) : treasury ? (
                        <>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "10px" }}>
                                <div
                                    style={{
                                        padding: "12px",
                                        borderRadius: "12px",
                                        background: "rgba(255,255,255,0.04)",
                                        border: "1px solid rgba(255,255,255,0.08)",
                                    }}
                                >
                                    <div style={{ color: "#9ca3af", fontSize: "12px" }}>Treasury Wallets</div>
                                    <div style={{ fontSize: "24px", fontWeight: 700 }}>{formatNumber(treasury.wallets.length, 0)}</div>
                                </div>
                                <div
                                    style={{
                                        padding: "12px",
                                        borderRadius: "12px",
                                        background: "rgba(255,255,255,0.04)",
                                        border: "1px solid rgba(255,255,255,0.08)",
                                    }}
                                >
                                    <div style={{ color: "#9ca3af", fontSize: "12px" }}>Total SOL</div>
                                    <div style={{ fontSize: "24px", fontWeight: 700 }}>{formatNumber(treasury.totalSol, 4)}</div>
                                </div>
                                <div
                                    style={{
                                        padding: "12px",
                                        borderRadius: "12px",
                                        background: "rgba(255,255,255,0.04)",
                                        border: "1px solid rgba(255,255,255,0.08)",
                                    }}
                                >
                                    <div style={{ color: "#9ca3af", fontSize: "12px" }}>Latest Snapshot</div>
                                    <div style={{ fontSize: "13px", marginTop: "6px" }}>
                                        {treasury.snapshot ? `${formatNumber(treasury.snapshot.totalSol, 4)} SOL` : "No snapshot yet"}
                                    </div>
                                    <div style={{ fontSize: "12px", color: "#9ca3af", marginTop: "4px" }}>
                                        {treasury.snapshot ? new Date(treasury.snapshot.snapshotAt).toLocaleString() : ""}
                                    </div>
                                </div>
                            </div>

                            <div style={{ overflowX: "auto" }}>
                                <div style={{ display: "grid", gap: "10px", minWidth: "900px" }}>
                                    {treasury.wallets.map((wallet) => (
                                        <div
                                            key={wallet.address}
                                            style={{
                                                padding: "12px",
                                                borderRadius: "12px",
                                                background: "rgba(255,255,255,0.03)",
                                                border: "1px solid rgba(255,255,255,0.08)",
                                            }}
                                        >
                                            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", marginBottom: "8px" }}>
                                                <div style={{ fontFamily: "monospace", fontSize: "12px" }}>{wallet.address}</div>
                                                <div style={{ color: "#14f195", fontWeight: 600 }}>{formatNumber(wallet.sol, 4)} SOL</div>
                                            </div>
                                            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                                                {wallet.tokens.length === 0 && <span style={{ color: "#9ca3af", fontSize: "12px" }}>No token balances</span>}
                                                {wallet.tokens.slice(0, 10).map((token) => (
                                                    <span
                                                        key={`${wallet.address}:${token.mint}`}
                                                        style={{
                                                            padding: "4px 8px",
                                                            borderRadius: "999px",
                                                            border: "1px solid rgba(255,255,255,0.12)",
                                                            fontSize: "11px",
                                                            color: "#d1d5db",
                                                        }}
                                                    >
                                                        {token.symbol}: {formatNumber(token.amount, 4)}
                                                    </span>
                                                ))}
                                                {wallet.tokens.length > 10 && (
                                                    <span style={{ color: "#9ca3af", fontSize: "11px" }}>
                                                        +{wallet.tokens.length - 10} more tokens
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </>
                    ) : (
                        <p style={{ color: "#9ca3af" }}>No treasury data loaded yet.</p>
                    )}

                    <div style={{ overflowX: "auto" }}>
                        <div style={{ minWidth: "500px" }}>
                            <h3 style={{ marginBottom: "8px", fontSize: "15px" }}>Snapshot History</h3>
                            {loadingTreasuryHistory ? (
                                <p style={{ color: "#9ca3af" }}>Loading history...</p>
                            ) : (
                                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                                    <thead>
                                        <tr style={{ color: "#9ca3af", textAlign: "left" }}>
                                            <th style={{ padding: "8px" }}>Snapshot Time</th>
                                            <th style={{ padding: "8px" }}>Total SOL</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(treasuryHistory?.items || []).slice(0, 48).map((row) => (
                                            <tr key={row.snapshotAt} style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                                                <td style={{ padding: "8px" }}>{new Date(row.snapshotAt).toLocaleString()}</td>
                                                <td style={{ padding: "8px" }}>{formatNumber(row.totalSol, 4)}</td>
                                            </tr>
                                        ))}
                                        {(treasuryHistory?.items || []).length === 0 && (
                                            <tr>
                                                <td style={{ padding: "8px", color: "#9ca3af" }} colSpan={2}>
                                                    No snapshots yet.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminDashboard;
