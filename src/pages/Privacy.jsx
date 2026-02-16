import React from 'react';
import { useNavigate } from 'react-router-dom';
import logoAsset from '../assets/heart-logo.svg';
import './StaticPage.css';

const Privacy = () => {
    const navigate = useNavigate();

    return (
        <div className="static-page-container">
            <header className="static-header">
                <button className="static-back-btn" onClick={() => navigate(-1)}>←</button>
                <div className="static-logo-group" onClick={() => navigate('/')}>
                    <img src={logoAsset} alt="Logo" className="static-heart-logo" />
                    <h1 className="static-title">PRIVACY POLICY</h1>
                </div>
            </header>

            <div className="static-content">
                <section className="static-section">
                    <h2 className="mm-heading">1. Information We Collect</h2>
                    <p>We collect your email address for account management, location data associated with pins you drop, and basic usage data to improve the service.</p>
                </section>

                <section className="static-section">
                    <h2 className="mm-heading">2. How We Use Information</h2>
                    <p>Your information is used solely to facilitate connections on the map, manage your account, and enhance the overall user experience.</p>
                </section>

                <section className="static-section">
                    <h2 className="mm-heading">3. Information Sharing</h2>
                    <p>We do not sell your personal data. Your location is shared on the map only as part of your public "missed connection" pins.</p>
                </section>

                <section className="static-section">
                    <h2 className="mm-heading">4. Data Security</h2>
                    <p>We utilize industry-standard encryption to protect your data and ensure that your private information remains private.</p>
                </section>

                <section className="static-section">
                    <h2 className="mm-heading">5. Children’s Privacy</h2>
                    <p>Miss Me Connection is intended for users 18 years of age and older. We do not knowingly collect information from children under 18.</p>
                </section>
            </div>
        </div>
    );
};

export default Privacy;
