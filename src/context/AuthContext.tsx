import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useWallet } from '@solana/wallet-adapter-react';
import bs58 from 'bs58';

interface User {
    userId: string;
    username: string;
    walletAddress?: string;
    isAdmin?: boolean;
    tier: 'pro' | 'free';
    tokenBalance?: number;
    needsWalletLink?: boolean;
}

interface AuthContextType {
    user: User | null;
    token: string | null;
    login: (username: string, password: string) => Promise<{ needsWalletLink: boolean }>;
    register: (username: string, password: string) => Promise<void>;
    loginWithWallet: () => Promise<void>;
    claimAccount: (username: string, password: string) => Promise<{ nonce: string; message: string }>;
    completeAccountClaim: (username: string, message: string) => Promise<void>;
    updateUsername: (newUsername: string) => Promise<void>;
    logout: () => Promise<void>;
    isLoading: boolean;
    refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const { publicKey, signMessage, disconnect } = useWallet();

    // Set token from localStorage on mount
    useEffect(() => {
        const storedToken = localStorage.getItem('token');
        if (storedToken) {
            setToken(storedToken);
            try {
                const payload = JSON.parse(atob(storedToken.split('.')[1]));
                setUser({
                    userId: payload.userId,
                    username: payload.username,
                    walletAddress: payload.walletAddress,
                    isAdmin: payload.isAdmin,
                    tier: payload.tier || 'free',
                    tokenBalance: payload.tokenBalance || 0,
                    needsWalletLink: payload.needsWalletLink
                });
            } catch {
                localStorage.removeItem('token');
            }
        }
        setIsLoading(false);
    }, []);

    // Set axios auth header when token changes
    useEffect(() => {
        if (token) {
            axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        } else {
            delete axios.defaults.headers.common['Authorization'];
        }
    }, [token]);

    // Refresh user info from server
    const refreshUser = useCallback(async () => {
        if (!token) return;
        try {
            const res = await axios.get('/api/auth/me');
            setUser({
                userId: res.data.userId,
                username: res.data.username,
                walletAddress: res.data.walletAddress,
                isAdmin: res.data.isAdmin,
                tier: res.data.tier,
                tokenBalance: res.data.tokenBalance,
                needsWalletLink: res.data.needsWalletLink
            });
        } catch (err) {
            console.error('Failed to refresh user:', err);
        }
    }, [token]);

    // Traditional password login
    const login = async (username: string, password: string): Promise<{ needsWalletLink: boolean }> => {
        const res = await axios.post('/api/login', { username, password });
        const { token: newToken, needsWalletLink, tier } = res.data;
        localStorage.setItem('token', newToken);
        setToken(newToken);
        const payload = JSON.parse(atob(newToken.split('.')[1]));
        setUser({
            userId: payload.userId,
            username: payload.username,
            walletAddress: payload.walletAddress,
            isAdmin: payload.isAdmin,
            tier: tier || payload.tier || 'free',
            tokenBalance: payload.tokenBalance || 0,
            needsWalletLink: needsWalletLink
        });
        return { needsWalletLink: needsWalletLink || false };
    };

    // Register new user (legacy - password based)
    const register = async (username: string, password: string) => {
        await axios.post('/api/register', { username, password });
    };

    // Wallet-based login (new users or returning wallet users)
    const loginWithWallet = async () => {
        if (!publicKey || !signMessage) {
            throw new Error('Wallet not connected');
        }

        const walletAddress = publicKey.toBase58();

        // Get nonce from server
        const nonceRes = await axios.post('/api/auth/nonce', { walletAddress });
        const { message } = nonceRes.data;

        // Sign the message
        const messageBytes = new TextEncoder().encode(message);
        const signature = await signMessage(messageBytes);
        const signatureBase58 = bs58.encode(signature);

        // Verify signature and get token
        const verifyRes = await axios.post('/api/auth/verify', {
            walletAddress,
            signature: signatureBase58
        });

        const { token: newToken, tier, isAdmin } = verifyRes.data;
        localStorage.setItem('token', newToken);
        setToken(newToken);

        const payload = JSON.parse(atob(newToken.split('.')[1]));
        setUser({
            userId: payload.userId,
            username: payload.username,
            walletAddress: walletAddress,
            isAdmin: isAdmin,
            tier: tier || 'free',
            tokenBalance: payload.tokenBalance || 0,
            needsWalletLink: false
        });
    };

    // Initiate account claim (link wallet to existing account)
    const claimAccount = async (username: string, password: string): Promise<{ nonce: string; message: string }> => {
        if (!publicKey) {
            throw new Error('Wallet not connected');
        }

        const walletAddress = publicKey.toBase58();
        const res = await axios.post('/api/auth/claim', {
            username,
            password,
            walletAddress
        });

        return { nonce: res.data.nonce, message: res.data.message };
    };

    // Complete account claim with signature
    const completeAccountClaim = async (username: string, message: string) => {
        if (!publicKey || !signMessage) {
            throw new Error('Wallet not connected');
        }

        if (!message) {
            throw new Error('No claim message provided. Please start the claim process again.');
        }

        const walletAddress = publicKey.toBase58();

        // Sign the message from claimAccount() (matches the nonce stored in the database)
        const messageBytes = new TextEncoder().encode(message);
        const signature = await signMessage(messageBytes);
        const signatureBase58 = bs58.encode(signature);

        // Complete the claim
        const verifyRes = await axios.post('/api/auth/claim/verify', {
            username,
            walletAddress,
            signature: signatureBase58
        });

        const { token: newToken, tier } = verifyRes.data;
        localStorage.setItem('token', newToken);
        setToken(newToken);

        const payload = JSON.parse(atob(newToken.split('.')[1]));
        setUser({
            userId: payload.userId,
            username: payload.username,
            walletAddress: walletAddress,
            isAdmin: payload.isAdmin,
            tier: tier || 'free',
            tokenBalance: payload.tokenBalance || 0,
            needsWalletLink: false
        });
    };

    // Update username
    const updateUsername = async (newUsername: string) => {
        const res = await axios.patch('/api/auth/username', { username: newUsername });
        const { token: newToken, username } = res.data;

        localStorage.setItem('token', newToken);
        setToken(newToken);

        // Update user state with new username
        setUser(prev => prev ? { ...prev, username } : null);
    };

    const logout = async () => {
        await disconnect();
        localStorage.removeItem('token');
        setToken(null);
        setUser(null);
    };

    return (
        <AuthContext.Provider value={{
            user,
            token,
            login,
            register,
            loginWithWallet,
            claimAccount,
            completeAccountClaim,
            updateUsername,
            logout,
            isLoading,
            refreshUser
        }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) throw new Error('useAuth must be used within AuthProvider');
    return context;
};
