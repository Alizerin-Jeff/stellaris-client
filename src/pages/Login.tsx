import React, { useState, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import ClaimAccount from '../components/ClaimAccount';

const schema = z.object({
    username: z.string().min(3, 'Username must be at least 3 characters'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
});

type FormData = z.infer<typeof schema>;

type LoginMode = 'wallet' | 'legacy' | 'claim';

const Login: React.FC = () => {
    const { login, loginWithWallet, user } = useAuth();
    const navigate = useNavigate();
    const { publicKey, connected } = useWallet();
    const [mode, setMode] = useState<LoginMode>('wallet');
    const [error, setError] = useState('');
    const [isLoggingIn, setIsLoggingIn] = useState(false);

    const { register: reg, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
        resolver: zodResolver(schema)
    });

    const handleWalletLogin = useCallback(async () => {
        if (isLoggingIn) return;
        setIsLoggingIn(true);
        setError('');
        try {
            await loginWithWallet();
            navigate('/dashboard');
        } catch (err: any) {
            console.error('Wallet login error:', err);
            setError(err.response?.data?.error || err.message || 'Wallet login failed');
        } finally {
            setIsLoggingIn(false);
        }
    }, [isLoggingIn, loginWithWallet, navigate]);

    // Auto-login when wallet connects
    useEffect(() => {
        if (connected && publicKey && mode === 'wallet' && !user && !isLoggingIn) {
            handleWalletLogin();
        }
    }, [connected, publicKey, mode, user, isLoggingIn, handleWalletLogin]);

    // Redirect if already logged in
    useEffect(() => {
        if (user && !user.needsWalletLink) {
            navigate('/dashboard');
        }
    }, [user, navigate]);

    const onLegacySubmit = async (data: FormData) => {
        setError('');
        try {
            const result = await login(data.username, data.password);
            if (result.needsWalletLink) {
                // User needs to link wallet
                setMode('claim');
            } else {
                navigate('/dashboard');
            }
        } catch (err: any) {
            setError(err.response?.data?.error || 'Login failed');
        }
    };

    const handleClaimSuccess = () => {
        navigate('/dashboard');
    };

    return (
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            position: 'relative',
            overflow: 'hidden'
        }}>
            {/* Background effects */}
            <div style={{
                position: 'absolute',
                top: '25%',
                left: '-128px',
                width: '384px',
                height: '384px',
                background: 'rgba(153, 69, 255, 0.15)',
                borderRadius: '50%',
                filter: 'blur(80px)'
            }}></div>
            <div style={{
                position: 'absolute',
                bottom: '25%',
                right: '-128px',
                width: '384px',
                height: '384px',
                background: 'rgba(20, 241, 149, 0.15)',
                borderRadius: '50%',
                filter: 'blur(80px)'
            }}></div>

            <div style={{ position: 'relative', zIndex: 10, width: '100%', maxWidth: '400px' }}>
                {/* Logo */}
                <div style={{ textAlign: 'center', marginBottom: '32px' }}>
                    <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '14px',
                        marginBottom: '16px',
                    }}>
                        <img src="/logo1.png" alt="Stellaris" style={{ width: '44px', height: '44px', opacity: 0.9 }} />
                        <h1 style={{ fontSize: '40px', fontWeight: 600, color: '#f0f0f0', margin: 0, letterSpacing: '-0.02em', lineHeight: 1 }}>
                            Stellaris
                        </h1>
                    </div>
                    <p style={{ color: '#9ca3af' }}>Solana's Premier Market Making Bot</p>
                </div>

                {/* Claim Account Mode */}
                {mode === 'claim' && (
                    <ClaimAccount
                        onSuccess={handleClaimSuccess}
                        onCancel={() => setMode('wallet')}
                    />
                )}

                {/* Wallet Login Mode (default) */}
                {mode === 'wallet' && (
                    <div className="glass-card" style={{ borderRadius: '16px', padding: '32px' }}>
                        <h2 style={{ fontSize: '24px', fontWeight: 'bold', color: 'white', marginBottom: '24px', textAlign: 'center' }}>
                            Welcome
                        </h2>

                        {error && (
                            <div style={{
                                marginBottom: '24px',
                                padding: '16px',
                                borderRadius: '12px',
                                background: 'rgba(239, 68, 68, 0.1)',
                                border: '1px solid rgba(239, 68, 68, 0.3)',
                                color: '#f87171',
                                fontSize: '14px'
                            }}>
                                {error}
                            </div>
                        )}

                        {/* Wallet Connect Button */}
                        <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'center' }}>
                            <WalletMultiButton style={{
                                background: 'linear-gradient(135deg, #9945ff, #14f195)',
                                borderRadius: '12px',
                                height: '56px',
                                fontSize: '18px',
                                width: '100%',
                                justifyContent: 'center'
                            }} />
                        </div>

                        {connected && publicKey && (
                            <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                                <p style={{ color: '#14f195', fontSize: '14px' }}>
                                    Connected: {publicKey.toBase58().slice(0, 6)}...{publicKey.toBase58().slice(-4)}
                                </p>
                                {isLoggingIn && (
                                    <p style={{ color: '#9ca3af', fontSize: '12px', marginTop: '8px' }}>
                                        Signing in...
                                    </p>
                                )}
                            </div>
                        )}

                        {!connected && (
                            <p style={{ color: '#9ca3af', fontSize: '14px', textAlign: 'center', marginBottom: '16px' }}>
                                Connect your Solana wallet to get started
                            </p>
                        )}

                        {/* Divider */}
                        <div style={{ display: 'flex', alignItems: 'center', margin: '24px 0' }}>
                            <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.1)' }}></div>
                            <span style={{ padding: '0 16px', color: '#6b7280', fontSize: '12px' }}>OR</span>
                            <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.1)' }}></div>
                        </div>

                        {/* Legacy login link */}
                        <div style={{ textAlign: 'center' }}>
                            <button
                                onClick={() => setMode('legacy')}
                                style={{
                                    background: 'none',
                                    border: '1px solid rgba(255,255,255,0.2)',
                                    borderRadius: '12px',
                                    padding: '12px 24px',
                                    color: '#9ca3af',
                                    cursor: 'pointer',
                                    fontSize: '14px',
                                    transition: 'all 0.2s'
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.borderColor = '#9945ff';
                                    e.currentTarget.style.color = '#fff';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)';
                                    e.currentTarget.style.color = '#9ca3af';
                                }}
                            >
                                I have an existing account (password login)
                            </button>
                        </div>
                    </div>
                )}

                {/* Legacy Password Login Mode */}
                {mode === 'legacy' && (
                    <div className="glass-card" style={{ borderRadius: '16px', padding: '32px' }}>
                        <h2 style={{ fontSize: '24px', fontWeight: 'bold', color: 'white', marginBottom: '24px', textAlign: 'center' }}>
                            Password Login
                        </h2>

                        {error && (
                            <div style={{
                                marginBottom: '24px',
                                padding: '16px',
                                borderRadius: '12px',
                                background: 'rgba(239, 68, 68, 0.1)',
                                border: '1px solid rgba(239, 68, 68, 0.3)',
                                color: '#f87171',
                                fontSize: '14px'
                            }}>
                                {error}
                            </div>
                        )}

                        <div style={{
                            marginBottom: '24px',
                            padding: '12px 16px',
                            borderRadius: '8px',
                            background: 'rgba(153, 69, 255, 0.1)',
                            border: '1px solid rgba(153, 69, 255, 0.3)'
                        }}>
                            <p style={{ color: '#c4b5fd', fontSize: '13px' }}>
                                After logging in, you'll be prompted to link a wallet for future logins.
                            </p>
                        </div>

                        <form onSubmit={handleSubmit(onLegacySubmit)}>
                            <div style={{ marginBottom: '20px' }}>
                                <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#d1d5db', marginBottom: '8px' }}>
                                    Username
                                </label>
                                <input
                                    {...reg('username')}
                                    className="input-dark"
                                    placeholder="Enter your username"
                                    style={{ display: 'block', width: '100%' }}
                                />
                                {errors.username && (
                                    <p style={{ marginTop: '8px', fontSize: '14px', color: '#f87171' }}>{errors.username.message}</p>
                                )}
                            </div>

                            <div style={{ marginBottom: '20px' }}>
                                <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#d1d5db', marginBottom: '8px' }}>
                                    Password
                                </label>
                                <input
                                    type="password"
                                    {...reg('password')}
                                    className="input-dark"
                                    placeholder="Enter your password"
                                    style={{ display: 'block', width: '100%' }}
                                />
                                {errors.password && (
                                    <p style={{ marginTop: '8px', fontSize: '14px', color: '#f87171' }}>{errors.password.message}</p>
                                )}
                            </div>

                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className="btn-primary"
                                style={{
                                    width: '100%',
                                    padding: '16px',
                                    fontSize: '18px',
                                    opacity: isSubmitting ? 0.5 : 1,
                                    cursor: isSubmitting ? 'not-allowed' : 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '8px'
                                }}
                            >
                                {isSubmitting ? (
                                    <>
                                        <svg style={{ width: '20px', height: '20px', animation: 'spin 1s linear infinite' }} viewBox="0 0 24 24">
                                            <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                            <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                        </svg>
                                        Processing...
                                    </>
                                ) : (
                                    'Sign In'
                                )}
                            </button>
                        </form>

                        <div style={{ marginTop: '24px', textAlign: 'center' }}>
                            <button
                                onClick={() => setMode('wallet')}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    color: '#9945ff',
                                    fontWeight: '500',
                                    cursor: 'pointer',
                                    transition: 'color 0.2s'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.color = '#14f195'}
                                onMouseLeave={(e) => e.currentTarget.style.color = '#9945ff'}
                            >
                                Back to Wallet Login
                            </button>
                        </div>
                    </div>
                )}

                <p style={{ textAlign: 'center', color: '#6b7280', fontSize: '14px', marginTop: '24px' }}>
                    Powered by Alizerin Labs
                </p>
            </div>

            <style>{`
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
};

export default Login;
