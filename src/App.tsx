import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Accounts from './pages/Accounts';
import AdminDashboard from './pages/AdminDashboard';

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { token, isLoading } = useAuth();
    
    if (isLoading) {
        return (
            <div style={{ 
                minHeight: '100vh', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center' 
            }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '64px',
                        height: '64px',
                        borderRadius: '16px',
                        background: 'linear-gradient(135deg, #9945ff, #14f195)',
                        marginBottom: '16px'
                    }}>
                        <svg style={{ width: '32px', height: '32px', color: 'white', animation: 'spin 1s linear infinite' }} viewBox="0 0 24 24">
                            <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                            <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                        </svg>
                    </div>
                    <p style={{ color: '#9ca3af' }}>Loading...</p>
                </div>
                <style>{`
                    @keyframes spin {
                        from { transform: rotate(0deg); }
                        to { transform: rotate(360deg); }
                    }
                `}</style>
            </div>
        );
    }
    
    return token ? <>{children}</> : <Navigate to="/login" />;
};

const AdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { token, user, isLoading } = useAuth();

    if (isLoading) {
        return null;
    }

    if (!token) return <Navigate to="/login" />;
    if (!user?.isAdmin) return <Navigate to="/dashboard" />;
    return <>{children}</>;
};

const App: React.FC = () => {
    return (
        <Router>
            <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/dashboard" element={
                    <ProtectedRoute>
                        <Dashboard />
                    </ProtectedRoute>
                } />
                <Route path="/accounts" element={
                    <ProtectedRoute>
                        <Accounts />
                    </ProtectedRoute>
                } />
                <Route path="/admin" element={
                    <AdminRoute>
                        <AdminDashboard />
                    </AdminRoute>
                } />
                <Route path="/" element={<Navigate to="/dashboard" />} />
            </Routes>
        </Router>
    );
};

export default App;
