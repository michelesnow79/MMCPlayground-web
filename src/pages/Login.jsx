import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import logoAsset from '../assets/heart-logo.svg';
import './Login.css';

const Login = () => {
    const navigate = useNavigate();
    const { login, signup, isLoggedIn } = useApp();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [postalCode, setPostalCode] = useState('');
    const [isSignUp, setIsSignUp] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

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
                await signup(email, password, name, postalCode);
            } else {
                await login(email, password);
            }
            navigate('/map');
        } catch (err) {
            console.error(err);
            setError(err.message.replace('Firebase:', '').trim());
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-page">
            <div className="login-card">
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
                    </div>
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
                    {isSignUp ? 'Already have an account?' : "Don't have an account?"}
                    <span
                        className="signup-link"
                        onClick={() => {
                            setIsSignUp(!isSignUp);
                            setError('');
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
