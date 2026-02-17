import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useAuth } from '../context/AuthContext';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';

const schema = z.object({
    username: z.string().min(3, 'Username must be at least 3 characters'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
});

type FormData = z.infer<typeof schema>;

interface ClaimAccountProps {
    onSuccess: () => void;
    onCancel: () => void;
}

const ClaimAccount: React.FC<ClaimAccountProps> = ({ onSuccess, onCancel }) => {
    const { claimAccount, completeAccountClaim } = useAuth();
    const { publicKey, connected, signMessage } = useWallet();
    const [error, setError] = useState('');
    const [step, setStep] = useState<'credentials' | 'sign'>('credentials');
    const [claimData, setClaimData] = useState<{ username: string; message: string } | null>(null);

    const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
        resolver: zodResolver(schema)
    });

    const onCredentialsSubmit = async (data: FormData) => {
        if (!connected || !publicKey) {
            setError('Please connect your wallet first');
            return;
        }

        setError('');
        try {
            const result = await claimAccount(data.username, data.password);
            setClaimData({ username: data.username, message: result.message });
            setStep('sign');
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to verify credentials');
        }
    };

    const onSign = async () => {
        if (!claimData || !signMessage || !publicKey) {
            setError('Missing data for signing');
            return;
        }

        setError('');
        try {
            await completeAccountClaim(claimData.username, claimData.message);
            onSuccess();
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to link wallet');
        }
    };

    return (
        <div className="glass-card" style={{ borderRadius: '16px', padding: '32px' }}>
            <h2 style={{ fontSize: '24px', fontWeight: 'bold', color: 'white', marginBottom: '16px', textAlign: 'center' }}>
                Link Your Wallet
            </h2>
            <p style={{ color: '#9ca3af', textAlign: 'center', marginBottom: '24px' }}>
                Connect your wallet to your existing account
            </p>

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

            {step === 'credentials' ? (
                <>
                    {/* Wallet connection section */}
                    <div style={{ marginBottom: '24px', textAlign: 'center' }}>
                        <p style={{ color: '#d1d5db', fontSize: '14px', marginBottom: '12px' }}>
                            Step 1: Connect your wallet
                        </p>
                        <WalletMultiButton style={{
                            background: 'linear-gradient(135deg, #9945ff, #14f195)',
                            borderRadius: '12px',
                            height: '48px',
                            fontSize: '16px'
                        }} />
                        {connected && publicKey && (
                            <p style={{ color: '#14f195', fontSize: '12px', marginTop: '8px' }}>
                                Connected: {publicKey.toBase58().slice(0, 4)}...{publicKey.toBase58().slice(-4)}
                            </p>
                        )}
                    </div>

                    <form onSubmit={handleSubmit(onCredentialsSubmit)}>
                        <p style={{ color: '#d1d5db', fontSize: '14px', marginBottom: '12px' }}>
                            Step 2: Verify your existing account
                        </p>

                        <div style={{ marginBottom: '20px' }}>
                            <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#d1d5db', marginBottom: '8px' }}>
                                Username
                            </label>
                            <input
                                {...register('username')}
                                className="input-dark"
                                placeholder="Your existing username"
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
                                {...register('password')}
                                className="input-dark"
                                placeholder="Your current password"
                                style={{ display: 'block', width: '100%' }}
                            />
                            {errors.password && (
                                <p style={{ marginTop: '8px', fontSize: '14px', color: '#f87171' }}>{errors.password.message}</p>
                            )}
                        </div>

                        <button
                            type="submit"
                            disabled={isSubmitting || !connected}
                            className="btn-primary"
                            style={{
                                width: '100%',
                                padding: '16px',
                                fontSize: '18px',
                                opacity: (isSubmitting || !connected) ? 0.5 : 1,
                                cursor: (isSubmitting || !connected) ? 'not-allowed' : 'pointer'
                            }}
                        >
                            {isSubmitting ? 'Verifying...' : 'Verify & Continue'}
                        </button>
                    </form>
                </>
            ) : (
                <>
                    <div style={{ marginBottom: '24px', textAlign: 'center' }}>
                        <p style={{ color: '#14f195', fontSize: '14px', marginBottom: '16px' }}>
                            Credentials verified! Now sign to link your wallet.
                        </p>
                        <div style={{
                            background: 'rgba(255, 255, 255, 0.05)',
                            borderRadius: '12px',
                            padding: '16px',
                            marginBottom: '24px'
                        }}>
                            <p style={{ color: '#6b7280', fontSize: '12px', marginBottom: '8px' }}>Message to sign:</p>
                            <p style={{ color: '#d1d5db', fontSize: '13px', fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                                {claimData?.message}
                            </p>
                        </div>

                        <button
                            onClick={onSign}
                            className="btn-primary"
                            style={{
                                width: '100%',
                                padding: '16px',
                                fontSize: '18px'
                            }}
                        >
                            Sign & Link Wallet
                        </button>
                    </div>
                </>
            )}

            <div style={{ marginTop: '24px', textAlign: 'center' }}>
                <button
                    onClick={onCancel}
                    style={{
                        background: 'none',
                        border: 'none',
                        color: '#9ca3af',
                        cursor: 'pointer',
                        fontSize: '14px'
                    }}
                >
                    Cancel
                </button>
            </div>
        </div>
    );
};

export default ClaimAccount;
