import React from 'react';
import { useNavigate } from 'react-router-dom';
import logoAsset from '../assets/heart-logo.svg';
import './StaticPage.css';

const Support = () => {
    const navigate = useNavigate();

    return (
        <div className="static-page-container">
            <header className="static-header">
                <button className="static-back-btn" onClick={() => navigate(-1)}>←</button>
                <div className="static-logo-group" onClick={() => navigate('/')}>
                    <img src={logoAsset} alt="Logo" className="static-heart-logo" />
                    <h1 className="static-title">HELP & SUPPORT</h1>
                </div>
            </header>

            <div className="static-content">
                <section className="static-section text-center">
                    <h2 className="mm-heading">Get in Touch</h2>
                    <p>
                        Have a question, feedback, or a technical issue? We're here to help.
                        Reach out to our support team and we'll get back to you as soon as possible.
                    </p>
                    <div className="support-cta">
                        <a href="mailto:MissMe@missmeconnection.com" className="support-email-link">
                            MissMe@missmeconnection.com
                        </a>
                    </div>
                </section>

                <section className="static-section">
                    <h2 className="mm-heading">Common Issues</h2>
                    <ul className="support-list">
                        <li>Forgotten password? Use the reset link on the login page.</li>
                        <li>Incorrect pin location? You can edit your pins from your Account page.</li>
                        <li>Reporting abuse? Click the "Report" button on any connection pin.</li>
                    </ul>
                </section>
            </div>
        </div>
    );
};

export default Support;
