import React from 'react';
import { useNavigate } from 'react-router-dom';
import SideMenu from '../components/SideMenu';
import './About.css';

// Assets
import mapBg from '../assets/map-bg.svg';
import micheleImg from '../assets/hero-woman-bluebg.svg';
import paulinaImg from '../assets/paulina.svg';

const About = () => {
    const navigate = useNavigate();
    const [isMenuOpen, setIsMenuOpen] = React.useState(false);

    return (
        <div className="about-page">
            <SideMenu isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} />

            {/* Hamburger Button */}
            <button className="hamburger-btn-static" onClick={() => setIsMenuOpen(true)}>
                <div className="hamburger-line"></div>
                <div className="hamburger-line"></div>
                <div className="hamburger-line"></div>
            </button>

            <button className="about-back-btn" onClick={() => navigate(-1)}>✕</button>

            <header className="about-hero" style={{ backgroundImage: `url(${mapBg})` }}>
                <div className="about-hero-halftone"></div>
                <div className="about-hero-content">
                    <h1 className="about-title">ABOUT US</h1>
                    <p className="about-subtitle">
                        Have you ever crossed paths with someone special but missed the chance to connect?
                        We believe in second chances!
                    </p>
                </div>
            </header>

            <div className="founders-section">
                {/* Michele Nieves */}
                <div className="founder-card">
                    <div className="founder-image-wrap">
                        <div className="speech-bubble bubble-left">HOWDY!</div>
                        <img src={micheleImg} alt="Michele Nieves" className="founder-img" />
                    </div>
                    <div className="founder-name-wrap">
                        <h2 className="founder-name">MICHELE NIEVES</h2>
                    </div>
                    <p className="founder-bio">
                        Born and raised in Brooklyn, NY, Michele Nieves is an accomplished Audio Visual Technician, V1,
                        Video Engineer, and Production Manager, with experience on major projects like the MTV VMAs,
                        national comedy tours, and global music festivals. Also a graphic designer and entrepreneur,
                        she's crafted campaigns for top fashion brands like Calvin Klein, DKNY to name a few,
                        blending technical expertise with creativity. Inspired by her passion for connection,
                        Michele created Miss Me Connection to bridge the gap between people who missed their moment.
                    </p>
                </div>

                {/* Paulina Kucharski */}
                <div className="founder-card">
                    <div className="founder-image-wrap">
                        <div className="speech-bubble bubble-right">Follow us!</div>
                        <img src={paulinaImg} alt="Paulina Kucharski" className="founder-img" />
                    </div>
                    <div className="founder-name-wrap">
                        <h2 className="founder-name">PAULINA KUCHARSKI</h2>
                    </div>
                    <p className="founder-bio">
                        A Chicago native, Paulina Kucharski is an accomplished Producer and documentary filmmaker
                        with a rich background in the film and television industry. Her work spans a variety of
                        acclaimed projects, blending creative storytelling with sharp production expertise.
                        Passionate about exploring human connections and untold narratives, Paulina has brought
                        powerful stories to life on screen. Now, as a producer of the Miss Me Connection platform,
                        Paulina applies her talents to help others turn missed encounters into meaningful connections.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default About;
