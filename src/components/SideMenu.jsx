import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import logoAsset from '../assets/heart-logo.svg';
import './SideMenu.css';

const SideMenu = ({ isOpen, onClose }) => {
    const navigate = useNavigate();

    // Prevent scrolling when menu is open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'auto';
        }
        return () => {
            document.body.style.overflow = 'auto';
        };
    }, [isOpen]);

    if (!isOpen) return null;

    const handleNavigate = (path) => {
        navigate(path);
        onClose();
    };

    return (
        <div className={`side-menu-overlay ${isOpen ? 'open' : ''}`}>
            <div className="side-menu-container">
                <button className="side-menu-close" onClick={onClose}>×</button>

                <div className="side-menu-content">
                    <div className="side-menu-logo" onClick={() => handleNavigate('/')}>
                        <img src={logoAsset} alt="Logo" />
                    </div>

                    <nav className="side-menu-nav">
                        <div className="nav-group main-nav">
                            <button onClick={() => handleNavigate('/map')}>Map</button>
                            <button onClick={() => handleNavigate('/browse')}>Browse</button>
                            <button onClick={() => handleNavigate('/messages')}>Messages</button>
                            <button onClick={() => handleNavigate('/account')}>Account</button>
                        </div>

                        <div className="nav-separator"></div>

                        <div className="nav-group sub-nav">
                            <button onClick={() => handleNavigate('/')}>Home</button>
                            <button onClick={() => handleNavigate('/about')}>About</button>
                            <button onClick={() => handleNavigate('/faq')}>FAQs</button>
                            <button onClick={() => handleNavigate('/support')}>Help & support</button>
                            <button onClick={() => handleNavigate('/terms')}>Terms & conditions</button>
                            <button onClick={() => handleNavigate('/privacy')}>Privacy policy</button>
                        </div>
                    </nav>

                    <div className="side-menu-footer">
                        <div className="side-menu-socials">
                            <a href="#" className="social-icon">F</a>
                            <a href="#" className="social-icon">I</a>
                            <a href="#" className="social-icon">T</a>
                            <a href="#" className="social-icon">X</a>
                            <a href="#" className="social-icon">Y</a>
                        </div>
                        <p className="side-menu-copyright">© 2025 Miss Me Connection LLC</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SideMenu;
