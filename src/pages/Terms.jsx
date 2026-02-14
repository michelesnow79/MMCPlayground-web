import React from 'react';
import { useNavigate } from 'react-router-dom';
import './StaticPage.css';

const Terms = () => {
    const navigate = useNavigate();

    return (
        <div className="static-page-container">
            <header className="static-header">
                <button className="static-back-btn" onClick={() => navigate(-1)}>←</button>
                <h1 className="static-title">TERMS & CONDITIONS</h1>
            </header>

            <div className="static-content">
                <section className="static-section">
                    <h2 className="mm-heading">1. Acceptance of Terms</h2>
                    <p>By accessing and using Miss Me Connection, you acknowledge that you have read, understood, and agree to be bound by these Terms and Conditions.</p>
                </section>

                <section className="static-section">
                    <h2 className="mm-heading">2. Content Ownership</h2>
                    <p>You retain ownership of any content you post to the platform. However, by posting, you grant Miss Me Connection a non-exclusive, worldwide, royalty-free license to display and distribute that content.</p>
                </section>

                <section className="static-section">
                    <h2 className="mm-heading">3. Prohibited Conduct</h2>
                    <p>Users are prohibited from posting content that is harassing, illegal, or reveals the private information of others ("doxxing"). Respect and safety are our core values.</p>
                </section>

                <section className="static-section">
                    <h2 className="mm-heading">4. Liability</h2>
                    <p>Miss Me Connection is provided "as-is" without any warranties. Users assume all risks associated with using the platform and meeting individuals through the connections made here.</p>
                </section>
            </div>
        </div>
    );
};

export default Terms;
