import React, {
    createContext,
    useContext,
    useEffect,
    useState,
    useCallback,
    useRef,
} from "react";
import { useAuth } from "./AuthContext";

interface BotMethod {
    isRunning: boolean;
    params: any;
}

interface Bot {
    instanceId: string;
    methods: {
        extract?: BotMethod;
        inject?: BotMethod;
        volume?: BotMethod;
        [key: string]: BotMethod | undefined;
    };
    progress?: any;
    fundingBalance?: {
        sol: number;
        spl: number;
        wsol: number;
        quote?: number;
        updatedAt?: number;
    };
    reservedWallets?: { index: number; address: string }[];
    fundingWallet?: string;
    poolType?: string;
    baseSymbol?: string;
    quoteSymbol?: string;
}

interface WSContextType {
    bots: Bot[];
    setBots: React.Dispatch<React.SetStateAction<Bot[]>>;
    send: (message: any) => void;
}

const WebSocketContext = createContext<WSContextType | undefined>(undefined);

export const WebSocketProvider: React.FC<{ children: React.ReactNode }> = ({
    children,
}) => {
    const { token } = useAuth();
    const [bots, setBots] = useState<Bot[]>([]);
    const [ws, setWs] = useState<WebSocket | null>(null);
    const socketRef = useRef<WebSocket | null>(null);
    const reconnectTimeoutRef = useRef<number | null>(null);
    const reconnectAttemptsRef = useRef(0);
    const manualCloseRef = useRef(false);

    useEffect(() => {
        // Reset bots when token changes (new login or logout)
        setBots([]);

        manualCloseRef.current = false;
        if (!token) {
            manualCloseRef.current = true;
            if (reconnectTimeoutRef.current !== null) {
                window.clearTimeout(reconnectTimeoutRef.current);
                reconnectTimeoutRef.current = null;
            }
            if (socketRef.current) {
                socketRef.current.close();
                socketRef.current = null;
            }
            return;
        }

        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const wsUrl = `${protocol}//${window.location.host}/ws`;

        const connect = () => {
            if (manualCloseRef.current) return;
            const socket = new WebSocket(wsUrl);
            socketRef.current = socket;

            socket.onopen = () => {
                reconnectAttemptsRef.current = 0;
                socket.send(JSON.stringify({ type: 'auth', token }));
                setWs(socket);
            };

            socket.onmessage = (event) => {
                const data = JSON.parse(event.data);

            if (data.type === "update" || data.type === "status") {
                setBots((prev) => {
                    const existingBot = prev.find(b => b.instanceId === data.instanceId);
                    
                    if (existingBot) {
                        return prev.map(b => {
                            if (b.instanceId !== data.instanceId) return b;
                            
                            if (data.methodType) {
                                return {
                                    ...b,
                                    methods: {
                                        ...b.methods,
                                        [data.methodType]: {
                                            isRunning: data.isRunning,
                                            params: data.params || b.methods[data.methodType]?.params || {},
                                        },
                                    },
                                    progress: data.progress ? { ...b.progress, ...data.progress } : b.progress,
                                    reservedWallets: data.reservedWallets ?? b.reservedWallets,
                                };
                            }
                            
                            if (data.methods) {
                                return {
                                    ...b,
                                    methods: { ...b.methods, ...data.methods },
                                    progress: data.progress ? { ...b.progress, ...data.progress } : b.progress,
                                    reservedWallets: data.reservedWallets ?? b.reservedWallets,
                                };
                            }
                            
                            return b;
                        });
                    } else {
                        const newBot: Bot = {
                            instanceId: data.instanceId,
                            methods: {},
                            reservedWallets: data.reservedWallets,
                            progress: data.progress,
                        };
                        
                        if (data.methodType) {
                            newBot.methods[data.methodType] = {
                                isRunning: data.isRunning,
                                params: data.params || {},
                            };
                        } else if (data.methods) {
                            newBot.methods = data.methods;
                        }
                        
                        return [...prev, newBot];
                    }
                });
                } else if (data.type === "progress") {
                    setBots((prev) =>
                        prev.map((b) => {
                            if (b.instanceId !== data.instanceId) return b;
                            const shouldUpdateFunding =
                                data.details?.balances &&
                                (data.details?.walletIndex === undefined ||
                                    data.details?.walletIndex === null);
                            return {
                                ...b,
                                progress: {
                                    ...b.progress,
                                    [data.methodType]: {
                                        ...b.progress?.[data.methodType],
                                        ...data.details,
                                    },
                                },
                                fundingBalance: shouldUpdateFunding
                                    ? data.details?.balances
                                    : b.fundingBalance,
                            };
                        }),
                    );
                } else if (data.type === "delete") {
                    setBots((prev) =>
                        prev.filter((b) => b.instanceId !== data.instanceId),
                    );
                }
            };

            socket.onclose = () => {
                setWs(null);
                if (manualCloseRef.current) return;
                const attempt = reconnectAttemptsRef.current + 1;
                reconnectAttemptsRef.current = attempt;
                const delay = Math.min(30000, 1000 * 2 ** (attempt - 1));
                reconnectTimeoutRef.current = window.setTimeout(connect, delay);
            };

            socket.onerror = () => {};

        };

        connect();

        return () => {
            manualCloseRef.current = true;
            if (reconnectTimeoutRef.current !== null) {
                window.clearTimeout(reconnectTimeoutRef.current);
                reconnectTimeoutRef.current = null;
            }
            if (socketRef.current) {
                socketRef.current.close();
                socketRef.current = null;
            }
        };
    }, [token]); // ← Key: Re-run when token changes

    const send = useCallback(
        (message: any) => {
            if (ws?.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify(message));
            }
        },
        [ws],
    ); // Depend on ws, which is stable

    return (
        <WebSocketContext.Provider value={{ bots, setBots, send }}>
            {children}
        </WebSocketContext.Provider>
    );
};

export const useWS = () => {
    const context = useContext(WebSocketContext);
    if (!context)
        throw new Error("useWS must be used within WebSocketProvider");
    return context;
};
