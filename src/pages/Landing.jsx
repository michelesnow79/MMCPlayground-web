import React from 'react';
import { useNavigate } from 'react-router-dom';
import './Landing.css';

// Importing assets
import logoAsset from '../assets/heart-logo.svg';
import heroWoman from '../assets/hero-woman.png';
import mapBg from '../assets/map-bg.svg';
import feature1 from '../assets/feature-1.png';
import feature2 from '../assets/feature-2.png';
import feature3 from '../assets/feature-3.png';

// New Assets
import halftoneDense from '../assets/halftone-dense.svg';
import halftoneMedium from '../assets/halftone-medium.svg';
import speechBubbleImg from '../assets/speech-bubble.svg';

const Landing = () => {
    const navigate = useNavigate();

    return (
        <div className="landing-page">
            {/* Hero Section */}
            <div className="hero-section" style={{ backgroundImage: `url(${mapBg})` }}>
                <div className="halftone-legacy-overlay"></div>
                <div className="halftone-asset-medium" style={{ backgroundImage: `url(${halftoneMedium})` }}></div>
                <div className="halftone-asset-dense" style={{ backgroundImage: `url(${halftoneDense})` }}></div>

                <div className="woman-layer">
                    <img src={heroWoman} alt="" className="hero-illustration" />
                </div>

                <div className="hero-content">
                    <div className="figma-logo-wrap">
                        <img src={logoAsset} alt="MissMe Logo" className="main-logo-img" />
                    </div>

                    <h1 className="figma-title">MISS ME CONNECTION</h1>
                    <p className="figma-tagline">YOU LIVED THE MOMENT - HERE'S YOUR CHANCE TO FIND THE CONNECTION!</p>

                    <div className="figma-actions">
                        <button className="figma-btn-pink" onClick={() => navigate('/login')}>
                            LOG IN OR SIGN UP
                        </button>
                        <button className="figma-btn-pink" onClick={() => navigate('/map')}>
                            EXPLORE
                        </button>
                    </div>

                    <div className="speech-bubble-asset-wrap">
                        <img src={speechBubbleImg} alt="Explore for free" className="speech-bubble-img" />
                        <span className="speech-bubble-text">EXPLORE FOR FREE, NO SIGNUP NEEDED!</span>
                    </div>
                </div>
            </div>

            {/* Features Section */}
            <div className="features-section">
                <div className="features-header">
                    <h2>FEATURES</h2>
                    <button className="faq-pill">FAQ S</button>
                </div>

                <div className="features-grid">
                    <div className="feature-card">
                        <img src={feature1} alt="Feature 1" className="panel-img" />
                    </div>
                    <div className="feature-card">
                        <img src={feature2} alt="Feature 2" className="panel-img" />
                    </div>
                    <div className="feature-card">
                        <img src={feature3} alt="Feature 3" className="panel-img" />
                    </div>
                </div>
            </div>

            {/* Info Sections */}
            <div className="info-sections">
                <div className="info-column">
                    <p>You don't have to reveal your identity — just the moment that stayed with you. Describe the scene, the spark, the things only you would notice. Details matter. They might be the key to reconnecting.</p>
                </div>
                <div className="info-column">
                    <p>Browse missed connections by location or drop a pin where your moment happened. Every place holds a story. Mark the spot where it all happened — someone else might be looking for you too.</p>
                </div>
                <div className="info-column">
                    <p>Sometimes the right connection comes from the outside. They weren’t there — but they might know who was. Let the web of people lead you closer.</p>
                </div>
            </div>

            {/* CTA Banner */}
            <div className="cta-banner">
                <div className="halftone-overlay"></div>
                <div className="cta-content">
                    <h2 className="cta-title">START NOW - IT'S FREE TO BROWSE!</h2>
                    <p className="cta-subtitle">Browse the map. Discover missed connections.</p>
                    <button className="cta-btn-cyan" onClick={() => navigate('/map')}>
                        EXPLORE NOW!
                    </button>
                </div>
            </div>

            {/* Footer */}
            <footer className="main-footer">
                <div className="footer-top">
                    <div className="social-links">
                        <a href="https://facebook.com" className="social-icon">FB</a>
                        <a href="https://instagram.com" className="social-icon">IG</a>
                        <a href="https://tiktok.com" className="social-icon">TK</a>
                        <a href="https://x.com" className="social-icon">X</a>
                        <a href="https://youtube.com" className="social-icon">YT</a>
                    </div>
                    <nav className="footer-nav">
                        <a href="#">About</a>
                        <a href="#">FAQs</a>
                        <a href="#">Support</a>
                        <a href="#">Terms</a>
                        <a href="#">Privacy</a>
                    </nav>
                </div>
                <div className="footer-bottom">
                    <p className="copyright">© 2025 Miss Me Connection LLC</p>
                    <div className="powered-by">
                        <span>Powered by</span>
                        <span className="buzzy-logo">buzzy</span>
                    </div>
                </div>
            </footer>
        </div>
    );
};

export default Landing;
