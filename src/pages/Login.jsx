import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import logoAsset from '../assets/heart-logo.svg';
import './Login.css';

const Login = () => {
    const navigate = useNavigate();
    const { login, signup, isLoggedIn, resetPassword } = useApp();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [postalCode, setPostalCode] = useState('');
    const location = useLocation();
    const [isSignUp, setIsSignUp] = useState(location.state?.mode === 'signup');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [isAgeConfirmed, setIsAgeConfirmed] = useState(false);
    const [isTermsAgreed, setIsTermsAgreed] = useState(false);

    useEffect(() => {
        if (isLoggedIn) {
            navigate('/map');
        }
    }, [isLoggedIn, navigate]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            if (isSignUp) {
                if (!isAgeConfirmed || !isTermsAgreed) {
                    setError('You must confirm your age and agree to our terms to proceed.');
                    return; // Hit finally
                }
                await signup(email, password, name, postalCode);
            } else {
                await login(email, password);
            }
            // Auth successful, navigate to map
            navigate('/map');
        } catch (err) {
            // Diagnostic logging for development
            if (import.meta.env.DEV) {
                console.error("🔐 AUTH_DIAGNOSTIC:", {
                    code: err.code,
                    message: err.message,
                    error: err
                });
            }

            // Human-friendly error translation
            let userMsg = err.message.replace('Firebase:', '').trim();
            if (err.code === 'auth/network-request-failed') {
                userMsg = "Network connection lost. Please check your internet and try again.";
            } else if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
                userMsg = "Invalid email or password.";
            } else if (err.code === 'auth/email-already-in-use') {
                userMsg = "This email address is already registered.";
            } else if (err.code === 'auth/too-many-requests') {
                userMsg = "Too many login attempts. Please wait a moment and try again.";
            } else if (err.code === 'auth/weak-password') {
                userMsg = "Password is too weak. Please use at least 6 characters.";
            }

            setError(userMsg);
        } finally {
            setLoading(false);
        }
    };

    const handleForgotPassword = async () => {
        if (!email) {
            setError('Please enter your email address first.');
            return;
        }
        try {
            await resetPassword(email);
            setError('Password reset email sent! Please check your inbox.');
        } catch (err) {
            setError(err.message.replace('Firebase:', '').trim());
        }
    };

    return (
        <div className="login-page">
            <div className="login-card">
                <button className="login-back-arrow" onClick={() => navigate(-1)} title="Go Back">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <polyline points="15 18 9 12 15 6"></polyline>
                    </svg>
                </button>
                <div className="login-logo-group" onClick={() => navigate('/')}>
                    <img src={logoAsset} alt="Logo" className="login-heart-logo" />
                    <h1 className="login-title">MISS ME CONNECTION</h1>
                </div>
                <p className="login-subtitle">
                    {isSignUp ? 'CREATE YOUR ACCOUNT' : 'ENTER YOUR DETAILS TO SIGN IN'}
                </p>

                <form className="login-form" onSubmit={handleSubmit}>
                    {error && <div className="login-error">{error}</div>}

                    {isSignUp && (
                        <div className="input-group">
                            <label>YOUR NAME</label>
                            <input
                                type="text"
                                placeholder="JANE DOE"
                                className="login-input"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                required={isSignUp}
                            />
                        </div>
                    )}

                    {isSignUp && (
                        <div className="input-group">
                            <label>POSTAL CODE</label>
                            <input
                                type="text"
                                placeholder="90210"
                                className="login-input"
                                value={postalCode}
                                onChange={(e) => setPostalCode(e.target.value)}
                                required={isSignUp}
                            />
                        </div>
                    )}

                    <div className="input-group">
                        <label>EMAIL</label>
                        <input
                            type="email"
                            placeholder="name@example.com"
                            className="login-input"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                        />
                    </div>
                    <div className="input-group">
                        <label>PASSWORD</label>
                        <input
                            type="password"
                            placeholder="••••••••"
                            className="login-input"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                        />
                        {!isSignUp && (
                            <span className="forgot-password-link" onClick={handleForgotPassword}>
                                Forgot Password?
                            </span>
                        )}
                    </div>

                    {isSignUp && (
                        <div className="legal-checkboxes">
                            <label className="checkbox-container">
                                <input
                                    type="checkbox"
                                    checked={isAgeConfirmed}
                                    onChange={(e) => setIsAgeConfirmed(e.target.checked)}
                                />
                                <span className="checkbox-label">I confirm that I am 18 years of age or older.</span>
                            </label>

                            <label className="checkbox-container">
                                <input
                                    type="checkbox"
                                    checked={isTermsAgreed}
                                    onChange={(e) => setIsTermsAgreed(e.target.checked)}
                                />
                                <span className="checkbox-label">
                                    I agree with the <span className="legal-link" onClick={(e) => { e.stopPropagation(); navigate('/privacy'); }}>Privacy Policy</span> and <span className="legal-link" onClick={(e) => { e.stopPropagation(); navigate('/terms'); }}>Terms and Service</span>
                                </span>
                            </label>
                        </div>
                    )}
                    <button
                        type="submit"
                        className="login-submit-btn"
                        disabled={loading}
                    >
                        {loading ? 'WAITING...' : (isSignUp ? 'CREATE ACCOUNT' : 'SIGN IN')}
                    </button>
                    <button
                        type="button"
                        className="login-explore-btn"
                        onClick={() => navigate('/')}
                    >
                        BACK TO HOME
                    </button>
                </form>

                <p className="signup-prompt">
                    {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
                    <span
                        className="signup-link"
                        onClick={() => {
                            setIsSignUp(!isSignUp);
                            setError('');
                            setIsAgeConfirmed(false);
                            setIsTermsAgreed(false);
                        }}
                    >
                        {isSignUp ? 'Sign in' : 'Sign up'}
                    </span>
                </p>
            </div>
        </div>
    );
};

export default Login;
