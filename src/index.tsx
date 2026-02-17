import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { WalletContextProvider } from './context/WalletContext';
import { AuthProvider } from './context/AuthContext';
import { WebSocketProvider } from './context/WebSocketContext';
import './index.css'

// Import wallet adapter styles
import '@solana/wallet-adapter-react-ui/styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <WalletContextProvider>
            <AuthProvider>
                <WebSocketProvider>
                    <App />
                </WebSocketProvider>
            </AuthProvider>
        </WalletContextProvider>
    </React.StrictMode>
);