import React from 'react';
import { useNavigate } from 'react-router-dom';
import './StaticPage.css';

const FAQ = () => {
    const navigate = useNavigate();

    return (
        <div className="static-page-container">
            <header className="static-header">
                <button className="static-back-btn" onClick={() => navigate(-1)}>←</button>
                <h1 className="static-title">FAQs</h1>
            </header>

            <div className="static-content">
                <section className="static-section">
                    <h2 className="mm-heading">General</h2>
                    <div className="faq-item">
                        <h3>What is Miss Me Connection?</h3>
                        <p>A platform to reconnect with people you met briefly but didn't exchange info with.</p>
                    </div>
                    <div className="faq-item">
                        <h3>Is it free?</h3>
                        <p>Yes, browsing and posting are free.</p>
                    </div>
                </section>

                <section className="static-section">
                    <h2 className="mm-heading">Creating Connections</h2>
                    <div className="faq-item">
                        <h3>How do I post?</h3>
                        <p>Click "Drop a Pin," describe the moment, and mark the location on the map.</p>
                    </div>
                    <div className="faq-item">
                        <h3>Can I remain anonymous?</h3>
                        <p>Yes, your identity is only revealed if you choose to share it.</p>
                    </div>
                </section>

                <section className="static-section">
                    <h2 className="mm-heading">Safety</h2>
                    <div className="faq-item">
                        <h3>How do you handle privacy?</h3>
                        <p>We use secure encryption and never sell your data.</p>
                    </div>
                </section>
            </div>
        </div>
    );
};

export default FAQ;
