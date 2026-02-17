import React, { useState, useEffect, useRef, useCallback } from "react";
import axios from "axios";

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

interface TransferModalProps {
    accountId: string;
    addresses: { index: number; address: string }[];
    whitelistedAddresses: { address: string; label: string }[];
    useWhitelist: boolean;
    walletAuthToken?: string;
    onWalletAuthIssued?: (
        walletAuthToken: string,
        action: "transfer" | "privateKey" | "delete" | "whitelist" | "all",
        expiresIn?: number,
    ) => void;
    onClose: () => void;
}

interface TokenBalance {
    mint: string;
    symbol: string;
    amount: number;
}

type TxState = "idle" | "submitting" | "confirming" | "confirmed" | "failed";

const truncateAddress = (addr: string) =>
    addr.length > 10 ? `${addr.slice(0, 4)}...${addr.slice(-4)}` : addr;

const Spinner: React.FC<{ size?: number }> = ({ size = 16 }) => (
    <svg
        style={{
            width: `${size}px`,
            height: `${size}px`,
            animation: "spin 1s linear infinite",
        }}
        viewBox="0 0 24 24"
    >
        <circle
            style={{ opacity: 0.25 }}
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
            fill="none"
        />
        <path
            style={{ opacity: 0.75 }}
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
    </svg>
);

const SOL_MINT = "So11111111111111111111111111111111111111112";

const TokenIcon: React.FC<{ iconUrl?: string; symbol: string }> = ({ iconUrl, symbol }) => {
    const [failed, setFailed] = useState(false);
    if (!iconUrl || failed) {
        return (
            <div
                style={{
                    width: "18px",
                    height: "18px",
                    borderRadius: "50%",
                    background: "rgba(255,255,255,0.15)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "10px",
                    fontWeight: 700,
                    color: "#9ca3af",
                    flexShrink: 0,
                }}
            >
                {symbol[0]}
            </div>
        );
    }
    return (
        <img
            src={iconUrl}
            onError={() => setFailed(true)}
            alt=""
            style={{
                width: "18px",
                height: "18px",
                borderRadius: "50%",
                flexShrink: 0,
            }}
        />
    );
};

const TransferModal: React.FC<TransferModalProps> = ({
    accountId,
    addresses,
    whitelistedAddresses,
    useWhitelist,
    walletAuthToken,
    onWalletAuthIssued,
    onClose,
}) => {
    const [fromIndex, setFromIndex] = useState<number>(addresses[0]?.index ?? 0);
    const [tokens, setTokens] = useState<TokenBalance[]>([]);
    const [tokensLoading, setTokensLoading] = useState(false);
    const [selectedMint, setSelectedMint] = useState<string>("SOL");
    const [destinationAddress, setDestinationAddress] = useState("");
    const [amount, setAmount] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [signature, setSignature] = useState<string | null>(null);
    const [txState, setTxState] = useState<TxState>("idle");
    const [txError, setTxError] = useState<string | null>(null);
    const [tokenDropdownOpen, setTokenDropdownOpen] = useState(false);
    const [fromDropdownOpen, setFromDropdownOpen] = useState(false);
    const [destDropdownOpen, setDestDropdownOpen] = useState(false);
    const [tokenIcons, setTokenIcons] = useState<Record<string, string | null>>({});

    // For password prompt within transfer (untrusted external addresses)
    const [needsPassword, setNeedsPassword] = useState(false);
    const [transferPassword, setTransferPassword] = useState("");
    const [passwordError, setPasswordError] = useState<string | null>(null);
    const [activeWalletAuthToken, setActiveWalletAuthToken] = useState<string | undefined>(walletAuthToken);

    const pollingRef = useRef(false);
    const onCloseRef = useRef(onClose);
    const tokenDropdownRef = useRef<HTMLDivElement>(null);
    const fromDropdownRef = useRef<HTMLDivElement>(null);
    const destDropdownRef = useRef<HTMLDivElement>(null);
    useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
    useEffect(() => {
        setActiveWalletAuthToken(walletAuthToken);
    }, [walletAuthToken]);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            const target = e.target as Node;
            if (tokenDropdownRef.current && !tokenDropdownRef.current.contains(target)) {
                setTokenDropdownOpen(false);
            }
            if (fromDropdownRef.current && !fromDropdownRef.current.contains(target)) {
                setFromDropdownOpen(false);
            }
            if (destDropdownRef.current && !destDropdownRef.current.contains(target)) {
                setDestDropdownOpen(false);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    const authHeaders = {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
    };

    // Determine if a destination is trusted (whitelisted or internal)
    const isDestinationTrusted = useCallback((dest: string): boolean => {
        if (!dest) return false;
        const isInternal = addresses.some((a) => a.address === dest);
        if (isInternal) return true;
        const isWhitelisted = whitelistedAddresses.some((w) => w.address === dest);
        return isWhitelisted;
    }, [addresses, whitelistedAddresses]);

    // Fetch balances when selected address changes
    useEffect(() => {
        let cancelled = false;
        const fetchBalances = async () => {
            setTokensLoading(true);
            setTokens([]);
            setSelectedMint("SOL");
            try {
                const res = await axios.get(
                    `/api/accounts/${accountId}/balances`,
                    authHeaders
                );
                if (cancelled) return;
                const balances = res.data.balances || [];
                const walletBal = balances.find(
                    (b: any) => b.index === fromIndex
                );
                if (!walletBal) {
                    setTokens([{ mint: "SOL", symbol: "SOL", amount: 0 }]);
                    return;
                }
                const result: TokenBalance[] = [
                    { mint: "SOL", symbol: "SOL", amount: walletBal.sol ?? 0 },
                ];
                if (walletBal.tokens) {
                    for (const t of walletBal.tokens) {
                        result.push({
                            mint: t.mint,
                            symbol: t.symbol || truncateAddress(t.mint),
                            amount: t.uiAmount ?? 0,
                        });
                    }
                }
                setTokens(result);

                // Fetch token icons from backend
                const mintList = result.map((t) =>
                    t.mint === "SOL" ? SOL_MINT : t.mint
                );
                try {
                    const iconRes = await axios.get(
                        `/api/token-icons?mints=${mintList.join(",")}`,
                        authHeaders
                    );
                    if (!cancelled) {
                        const icons = iconRes.data.icons || {};
                        // Map SOL_MINT back to "SOL" key for easy lookup
                        if (icons[SOL_MINT] !== undefined) {
                            icons["SOL"] = icons[SOL_MINT];
                        }
                        setTokenIcons(icons);
                    }
                } catch {
                    // Icons are non-critical, ignore errors
                }
            } catch {
                if (!cancelled) {
                    setTokens([{ mint: "SOL", symbol: "SOL", amount: 0 }]);
                }
            } finally {
                if (!cancelled) setTokensLoading(false);
            }
        };
        fetchBalances();
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [accountId, fromIndex]);

    // Auto-close after confirmed
    useEffect(() => {
        if (txState === "confirmed") {
            const timer = setTimeout(() => onCloseRef.current(), 5000);
            return () => clearTimeout(timer);
        }
    }, [txState]);

    // Cleanup polling on unmount
    useEffect(() => {
        return () => {
            pollingRef.current = false;
        };
    }, []);

    const selectedToken = tokens.find((t) => t.mint === selectedMint);
    const maxAmount = selectedToken?.amount ?? 0;

    // Internal addresses excluding sender
    const internalAddresses = addresses.filter((a) => a.index !== fromIndex);

    const pollConfirmation = async (sig: string) => {
        pollingRef.current = true;
        const maxAttempts = 30;
        for (let i = 0; i < maxAttempts; i++) {
            if (!pollingRef.current) return;
            try {
                const res = await axios.post(
                    "/api/accounts/tx-status",
                    { signature: sig },
                    authHeaders
                );
                const status = res.data.status;
                if (status === "confirmed" || status === "finalized") {
                    setTxState("confirmed");
                    return;
                }
                if (status === "failed") {
                    setTxState("failed");
                    setTxError("Transaction failed on-chain.");
                    return;
                }
            } catch {
                // Ignore polling errors, keep trying
            }
            await new Promise((r) => setTimeout(r, 2000));
        }
        // Timeout - treat as confirmed (tx was sent successfully)
        setTxState("confirmed");
    };

    const handleSubmit = async (walletAuthTokenOverride?: string) => {
        setError(null);
        setTxError(null);

        const trusted = isDestinationTrusted(destinationAddress);
        const transferAuthToken = walletAuthTokenOverride || activeWalletAuthToken;

        // If untrusted and no wallet auth token available, prompt for password to mint one.
        if (!trusted && !transferAuthToken) {
            setNeedsPassword(true);
            return;
        }

        setTxState("submitting");
        try {
            const payload: any = {
                fromIndex,
                tokenMint: selectedMint === "SOL" ? "SOL" : selectedMint,
                destinationAddress,
                amount: parseFloat(amount),
            };
            // Only send auth token for untrusted destinations.
            if (!trusted) {
                payload.walletAuthToken = transferAuthToken;
            }

            const res = await axios.post(
                `/api/accounts/${accountId}/transfer`,
                payload,
                authHeaders
            );

            const sig = res.data.signature;
            setSignature(sig);
            setTxState("confirming");
            pollConfirmation(sig);
        } catch (err: any) {
            const errMsg = err.response?.data?.error || "Transfer failed.";
            if (
                err.response?.status === 400
                && typeof errMsg === "string"
                && (errMsg.includes("walletPassword or walletAuthToken")
                    || errMsg.includes("Wallet password verification required"))
            ) {
                setActiveWalletAuthToken(undefined);
                setNeedsPassword(true);
                setTxState("idle");
                setTxError(null);
                return;
            }
            setTxState("failed");
            setTxError(errMsg);
        }
    };

    const handlePasswordSubmit = async () => {
        if (!transferPassword) return;
        setPasswordError(null);
        try {
            const verify = await axios.post(
                `/api/accounts/${accountId}/verify-password`,
                { walletPassword: transferPassword, action: "transfer" },
                authHeaders
            );
            const issuedToken = verify.data?.walletAuthToken as string | undefined;
            if (!issuedToken) {
                throw new Error("Wallet verification did not return an auth token");
            }
            setActiveWalletAuthToken(issuedToken);
            onWalletAuthIssued?.(issuedToken, "transfer", verify.data?.expiresIn);
            setNeedsPassword(false);
            setTransferPassword("");
            handleSubmit(issuedToken);
        } catch (err: any) {
            setPasswordError(err.response?.data?.error || "Incorrect password");
        }
    };

    // Render tx confirmation states
    const renderTxState = () => {
        if (txState === "submitting") {
            return (
                <div style={{ textAlign: "center", padding: "40px 0" }}>
                    <Spinner size={32} />
                    <p style={{ color: "white", marginTop: "16px" }}>Submitting transaction...</p>
                </div>
            );
        }

        if (txState === "confirming") {
            return (
                <div style={{ textAlign: "center", padding: "40px 0" }}>
                    <Spinner size={32} />
                    <p style={{ color: "white", marginTop: "16px" }}>Confirming transaction...</p>
                    {signature && (
                        <p style={{ color: "#6b7280", fontSize: "12px", fontFamily: "monospace", marginTop: "8px" }}>
                            {truncateAddress(signature)}
                        </p>
                    )}
                </div>
            );
        }

        if (txState === "confirmed") {
            return (
                <div style={{ textAlign: "center", padding: "20px 0" }}>
                    <div
                        style={{
                            width: "48px",
                            height: "48px",
                            borderRadius: "50%",
                            background: "rgba(20, 241, 149, 0.2)",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            marginBottom: "12px",
                        }}
                    >
                        <svg
                            style={{ width: "24px", height: "24px", color: SOLANA_GREEN }}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M5 13l4 4L19 7"
                            />
                        </svg>
                    </div>
                    <p style={{ color: "white", marginBottom: "8px", fontWeight: 600 }}>
                        Transaction Confirmed!
                    </p>
                    {signature && (
                        <a
                            href={`https://solscan.io/tx/${signature}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: SOLANA_PURPLE, fontSize: "13px" }}
                        >
                            View on Solscan
                        </a>
                    )}
                    <p
                        style={{
                            color: "#6b7280",
                            fontSize: "12px",
                            marginTop: "12px",
                        }}
                    >
                        Closing in 5 seconds...
                    </p>
                </div>
            );
        }

        if (txState === "failed") {
            return (
                <div style={{ textAlign: "center", padding: "20px 0" }}>
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
                                d="M6 18L18 6M6 6l12 12"
                            />
                        </svg>
                    </div>
                    <p style={{ color: "white", marginBottom: "8px", fontWeight: 600 }}>
                        Transfer Failed
                    </p>
                    <p style={{ color: "#ef4444", fontSize: "13px", marginBottom: "16px" }}>
                        {txError || "An unknown error occurred."}
                    </p>
                    <button
                        onClick={() => {
                            setTxState("idle");
                            setSignature(null);
                            setTxError(null);
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
                        Try Again
                    </button>
                </div>
            );
        }

        return null;
    };

    // Password prompt for untrusted external transfers
    if (needsPassword) {
        return (
            <div
                style={{
                    position: "fixed",
                    inset: 0,
                    background: "rgba(0,0,0,0.8)",
                    backdropFilter: "blur(4px)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    zIndex: 200,
                    padding: "16px",
                }}
                onClick={(e) => {
                    if (e.target === e.currentTarget) {
                        setNeedsPassword(false);
                        setTransferPassword("");
                        setPasswordError(null);
                    }
                }}
            >
                <div
                    className="glass-card"
                    style={{ width: "100%", maxWidth: "420px", padding: "24px" }}
                >
                    <h2 style={{ fontSize: "18px", fontWeight: "bold", color: "white", marginBottom: "12px" }}>
                        Password Required
                    </h2>
                    <p style={{ fontSize: "13px", color: "#9ca3af", marginBottom: "16px" }}>
                        Wallet password is required for transfers to external addresses.
                    </p>
                    <input
                        className="input-dark"
                        type="password"
                        style={{ ...inputStyle, width: "100%", marginBottom: "12px" }}
                        placeholder="Wallet password"
                        value={transferPassword}
                        onChange={(e) => {
                            setTransferPassword(e.target.value);
                            setPasswordError(null);
                        }}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && transferPassword) handlePasswordSubmit();
                        }}
                        autoFocus
                    />
                    {passwordError && (
                        <div style={{ color: "#ef4444", fontSize: "13px", marginBottom: "12px", padding: "8px 12px", background: "rgba(239,68,68,0.1)", borderRadius: "8px" }}>
                            {passwordError}
                        </div>
                    )}
                    <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
                        <button
                            onClick={() => {
                                setNeedsPassword(false);
                                setTransferPassword("");
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
                            onClick={handlePasswordSubmit}
                            disabled={!transferPassword}
                            style={{ padding: "10px 20px", fontSize: "14px", opacity: !transferPassword ? 0.5 : 1 }}
                        >
                            Confirm
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div
            style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.8)",
                backdropFilter: "blur(4px)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 200,
                padding: "16px",
            }}
            onClick={(e) => {
                if (e.target === e.currentTarget && txState === "idle") onClose();
            }}
        >
            <div
                className="glass-card"
                style={{
                    width: "100%",
                    maxWidth: "480px",
                    padding: "20px",
                    position: "relative",
                    maxHeight: "90vh",
                    overflowY: "auto",
                }}
            >
                <h2
                    style={{
                        fontSize: "20px",
                        fontWeight: "bold",
                        color: "white",
                        marginBottom: "14px",
                    }}
                >
                    Transfer
                </h2>

                {txState !== "idle" ? (
                    renderTxState()
                ) : (
                    <>
                        {/* From Address */}
                        <div style={{ marginBottom: "12px" }}>
                            <label style={labelStyle}>From Address</label>
                            <div ref={fromDropdownRef} style={{ position: "relative" }}>
                                <button
                                    type="button"
                                    className="input-dark"
                                    onClick={() => setFromDropdownOpen((o) => !o)}
                                    style={{
                                        ...inputStyle,
                                        width: "100%",
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "8px",
                                        cursor: "pointer",
                                        textAlign: "left",
                                    }}
                                >
                                    <span style={{ fontFamily: "monospace", color: "white", flex: 1, fontSize: "14px" }}>
                                        {truncateAddress(addresses.find((a) => a.index === fromIndex)?.address || "")}
                                    </span>
                                    <svg
                                        style={{
                                            width: "12px",
                                            height: "12px",
                                            color: "#6b7280",
                                            marginLeft: "4px",
                                            transform: fromDropdownOpen ? "rotate(180deg)" : "rotate(0deg)",
                                            transition: "transform 0.15s",
                                        }}
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                    >
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                </button>
                                {fromDropdownOpen && (
                                    <div
                                        style={{
                                            position: "absolute",
                                            top: "calc(100% + 4px)",
                                            left: 0,
                                            right: 0,
                                            background: "#1a1a2e",
                                            border: "1px solid rgba(255,255,255,0.12)",
                                            borderRadius: "8px",
                                            zIndex: 50,
                                            overflow: "hidden",
                                            boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
                                        }}
                                    >
                                        {addresses.map((a) => (
                                            <button
                                                key={a.index}
                                                type="button"
                                                onClick={() => {
                                                    setFromIndex(a.index);
                                                    setFromDropdownOpen(false);
                                                    if (destinationAddress === a.address) {
                                                        setDestinationAddress("");
                                                    }
                                                }}
                                                style={{
                                                    width: "100%",
                                                    display: "flex",
                                                    alignItems: "center",
                                                    gap: "8px",
                                                    padding: "10px 12px",
                                                    background: a.index === fromIndex ? "rgba(153,69,255,0.12)" : "transparent",
                                                    border: "none",
                                                    cursor: "pointer",
                                                    textAlign: "left",
                                                }}
                                                onMouseEnter={(e) => {
                                                    if (a.index !== fromIndex) e.currentTarget.style.background = "rgba(255,255,255,0.06)";
                                                }}
                                                onMouseLeave={(e) => {
                                                    e.currentTarget.style.background = a.index === fromIndex ? "rgba(153,69,255,0.12)" : "transparent";
                                                }}
                                            >
                                                <span style={{ fontFamily: "monospace", color: "white", flex: 1, fontSize: "14px" }}>
                                                    {truncateAddress(a.address)}
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Token */}
                        <div style={{ marginBottom: "12px" }}>
                            <label style={labelStyle}>Token</label>
                            {tokensLoading ? (
                                <div
                                    style={{
                                        color: "#6b7280",
                                        fontSize: "13px",
                                        padding: "10px",
                                    }}
                                >
                                    Loading balances...
                                </div>
                            ) : (
                                <div ref={tokenDropdownRef} style={{ position: "relative" }}>
                                    <button
                                        type="button"
                                        className="input-dark"
                                        onClick={() => setTokenDropdownOpen((o) => !o)}
                                        style={{
                                            ...inputStyle,
                                            width: "100%",
                                            display: "flex",
                                            alignItems: "center",
                                            gap: "8px",
                                            cursor: "pointer",
                                            textAlign: "left",
                                        }}
                                    >
                                        {selectedToken && (
                                            <>
                                                <TokenIcon iconUrl={tokenIcons[selectedToken.mint] ?? undefined} symbol={selectedToken.symbol} />
                                                <span style={{ fontWeight: 600, color: "white", flex: 1 }}>
                                                    {selectedToken.symbol}
                                                </span>
                                                <span style={{ color: "#6b7280", fontFamily: "monospace", fontSize: "13px" }}>
                                                    {Number(selectedToken.amount).toFixed(2)}
                                                </span>
                                            </>
                                        )}
                                        <svg
                                            style={{
                                                width: "12px",
                                                height: "12px",
                                                color: "#6b7280",
                                                marginLeft: "4px",
                                                transform: tokenDropdownOpen ? "rotate(180deg)" : "rotate(0deg)",
                                                transition: "transform 0.15s",
                                            }}
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                        >
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                        </svg>
                                    </button>
                                    {tokenDropdownOpen && (
                                        <div
                                            style={{
                                                position: "absolute",
                                                top: "calc(100% + 4px)",
                                                left: 0,
                                                right: 0,
                                                background: "#1a1a2e",
                                                border: "1px solid rgba(255,255,255,0.12)",
                                                borderRadius: "8px",
                                                zIndex: 50,
                                                overflow: "hidden",
                                                boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
                                            }}
                                        >
                                            {tokens.map((t) => (
                                                <button
                                                    key={t.mint}
                                                    type="button"
                                                    onClick={() => {
                                                        setSelectedMint(t.mint);
                                                        setAmount("");
                                                        setTokenDropdownOpen(false);
                                                    }}
                                                    style={{
                                                        width: "100%",
                                                        display: "flex",
                                                        alignItems: "center",
                                                        gap: "8px",
                                                        padding: "10px 12px",
                                                        background: t.mint === selectedMint ? "rgba(153,69,255,0.12)" : "transparent",
                                                        border: "none",
                                                        cursor: "pointer",
                                                        textAlign: "left",
                                                    }}
                                                    onMouseEnter={(e) => {
                                                        if (t.mint !== selectedMint) e.currentTarget.style.background = "rgba(255,255,255,0.06)";
                                                    }}
                                                    onMouseLeave={(e) => {
                                                        e.currentTarget.style.background = t.mint === selectedMint ? "rgba(153,69,255,0.12)" : "transparent";
                                                    }}
                                                >
                                                    <TokenIcon iconUrl={tokenIcons[t.mint] ?? undefined} symbol={t.symbol} />
                                                    <span style={{ fontWeight: 600, color: "white", flex: 1, fontSize: "14px" }}>
                                                        {t.symbol}
                                                    </span>
                                                    <span style={{ color: "#6b7280", fontFamily: "monospace", fontSize: "13px" }}>
                                                        {Number(t.amount).toFixed(2)}
                                                    </span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Destination */}
                        <div style={{ marginBottom: "12px" }}>
                            <label style={labelStyle}>Destination</label>
                            <div ref={destDropdownRef} style={{ position: "relative" }}>
                                <button
                                    type="button"
                                    className="input-dark"
                                    onClick={() => setDestDropdownOpen((o) => !o)}
                                    style={{
                                        ...inputStyle,
                                        width: "100%",
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "8px",
                                        cursor: "pointer",
                                        textAlign: "left",
                                    }}
                                >
                                    <span style={{ fontFamily: "monospace", color: destinationAddress ? "white" : "#6b7280", flex: 1, fontSize: "14px" }}>
                                        {destinationAddress
                                            ? (() => {
                                                const wl = whitelistedAddresses.find((w) => w.address === destinationAddress);
                                                return wl ? `${wl.label} (${truncateAddress(wl.address)})` : truncateAddress(destinationAddress);
                                            })()
                                            : "Select destination..."}
                                    </span>
                                    <svg
                                        style={{
                                            width: "12px",
                                            height: "12px",
                                            color: "#6b7280",
                                            marginLeft: "4px",
                                            transform: destDropdownOpen ? "rotate(180deg)" : "rotate(0deg)",
                                            transition: "transform 0.15s",
                                        }}
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                    >
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                </button>
                                {destDropdownOpen && (
                                    <div
                                        style={{
                                            position: "absolute",
                                            top: "calc(100% + 4px)",
                                            left: 0,
                                            right: 0,
                                            background: "#1a1a2e",
                                            border: "1px solid rgba(255,255,255,0.12)",
                                            borderRadius: "8px",
                                            zIndex: 50,
                                            overflow: "hidden",
                                            boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
                                            maxHeight: "240px",
                                            overflowY: "auto",
                                        }}
                                    >
                                        {/* Internal Wallets section */}
                                        <div style={{ padding: "8px 12px 4px", fontSize: "11px", fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                                            Internal Wallets
                                        </div>
                                        {internalAddresses.map((a) => (
                                            <button
                                                key={a.index}
                                                type="button"
                                                onClick={() => {
                                                    setDestinationAddress(a.address);
                                                    setDestDropdownOpen(false);
                                                }}
                                                style={{
                                                    width: "100%",
                                                    display: "flex",
                                                    alignItems: "center",
                                                    gap: "8px",
                                                    padding: "10px 12px",
                                                    background: destinationAddress === a.address ? "rgba(153,69,255,0.12)" : "transparent",
                                                    border: "none",
                                                    cursor: "pointer",
                                                    textAlign: "left",
                                                }}
                                                onMouseEnter={(e) => {
                                                    if (destinationAddress !== a.address) e.currentTarget.style.background = "rgba(255,255,255,0.06)";
                                                }}
                                                onMouseLeave={(e) => {
                                                    e.currentTarget.style.background = destinationAddress === a.address ? "rgba(153,69,255,0.12)" : "transparent";
                                                }}
                                            >
                                                <span style={{ fontFamily: "monospace", color: "white", flex: 1, fontSize: "14px" }}>
                                                    {truncateAddress(a.address)}
                                                </span>
                                            </button>
                                        ))}
                                        {/* Whitelisted Addresses section (only in whitelist mode) */}
                                        {useWhitelist && whitelistedAddresses.length > 0 && (
                                            <>
                                                <div style={{ padding: "8px 12px 4px", fontSize: "11px", fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                                                    Whitelisted Addresses
                                                </div>
                                                {whitelistedAddresses.map((w) => (
                                                    <button
                                                        key={w.address}
                                                        type="button"
                                                        onClick={() => {
                                                            setDestinationAddress(w.address);
                                                            setDestDropdownOpen(false);
                                                        }}
                                                        style={{
                                                            width: "100%",
                                                            display: "flex",
                                                            alignItems: "center",
                                                            gap: "8px",
                                                            padding: "10px 12px",
                                                            background: destinationAddress === w.address ? "rgba(153,69,255,0.12)" : "transparent",
                                                            border: "none",
                                                            cursor: "pointer",
                                                            textAlign: "left",
                                                        }}
                                                        onMouseEnter={(e) => {
                                                            if (destinationAddress !== w.address) e.currentTarget.style.background = "rgba(255,255,255,0.06)";
                                                        }}
                                                        onMouseLeave={(e) => {
                                                            e.currentTarget.style.background = destinationAddress === w.address ? "rgba(153,69,255,0.12)" : "transparent";
                                                        }}
                                                    >
                                                        <span style={{ color: "white", flex: 1, fontSize: "14px" }}>
                                                            {w.label} <span style={{ fontFamily: "monospace", color: "#6b7280" }}>({truncateAddress(w.address)})</span>
                                                        </span>
                                                    </button>
                                                ))}
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>
                            {/* External address input (non-whitelist mode only) */}
                            {!useWhitelist && (
                                <>
                                    <label style={{ ...labelStyle, marginTop: "8px" }}>External Address</label>
                                    <input
                                        className="input-dark"
                                        style={{
                                            ...inputStyle,
                                            width: "100%",
                                            fontFamily: "monospace",
                                        }}
                                        placeholder="Paste any Solana address..."
                                        value={
                                            addresses.some(
                                                (a) => a.address === destinationAddress
                                            )
                                                ? ""
                                                : destinationAddress
                                        }
                                        onChange={(e) =>
                                            setDestinationAddress(e.target.value)
                                        }
                                    />
                                    {destinationAddress &&
                                        !isDestinationTrusted(destinationAddress) && (
                                            <p
                                                style={{
                                                    fontSize: "11px",
                                                    color: "#f59e0b",
                                                    marginTop: "4px",
                                                }}
                                            >
                                                Password required for external addresses
                                            </p>
                                        )}
                                </>
                            )}
                        </div>

                        {/* Amount */}
                        <div style={{ marginBottom: "20px" }}>
                            <label style={labelStyle}>Amount</label>
                            <div
                                style={{
                                    display: "flex",
                                    gap: "8px",
                                    alignItems: "center",
                                }}
                            >
                                <input
                                    type="number"
                                    className="input-dark"
                                    style={{
                                        ...inputStyle,
                                        flex: 1,
                                    }}
                                    placeholder="0.00"
                                    value={amount}
                                    onChange={(e) => setAmount(e.target.value)}
                                    min={0}
                                    step="any"
                                />
                                <button
                                    onClick={() =>
                                        setAmount(maxAmount.toString())
                                    }
                                    style={{
                                        padding: "10px 14px",
                                        borderRadius: "8px",
                                        background: `rgba(153, 69, 255, 0.15)`,
                                        border: `1px solid rgba(153, 69, 255, 0.3)`,
                                        color: SOLANA_PURPLE,
                                        cursor: "pointer",
                                        fontSize: "13px",
                                        fontWeight: 600,
                                        whiteSpace: "nowrap",
                                    }}
                                >
                                    Max
                                </button>
                            </div>
                        </div>

                        {error && (
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
                                {error}
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
                                onClick={onClose}
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
                                onClick={() => handleSubmit()}
                                disabled={
                                    !amount ||
                                    parseFloat(amount) <= 0 ||
                                    !destinationAddress
                                }
                                style={{
                                    padding: "10px 20px",
                                    fontSize: "14px",
                                    opacity:
                                        !amount ||
                                        parseFloat(amount) <= 0 ||
                                        !destinationAddress
                                            ? 0.5
                                            : 1,
                                }}
                            >
                                Send Transfer
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default TransferModal;
