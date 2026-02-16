import React from 'react';
import { useNavigate } from 'react-router-dom';
import SideMenu from '../components/SideMenu';
import './FAQ.css';

// Assets
import mapBg from '../assets/map-bg.svg';
import logoAsset from '../assets/heart-logo.svg';

const FAQ = () => {
    const navigate = useNavigate();
    const [isMenuOpen, setIsMenuOpen] = React.useState(false);

    const faqs = [
        {
            number: 1,
            question: "What is Miss ME Connection?",
            answer: "Miss ME Connection is a platform where you can post or discover real-life missed connection stories. Whether you locked eyes with someone on the train or had a brief but unforgettable exchange at a coffee shop. The platform is free to browse, post, and reply, giving everyone a second chance to reconnect without barriers."
        },
        {
            number: 2,
            question: "How do I post a missed connection?",
            answer: "Simply create a profile, then click + to “Add a Missed Connection.” The platform will guide you to pinpoint the location of the moment. Add as many details as you remember: location, time, what happened, and any unique traits about the person or moment. The more details, the better your chances of being found!"
        },
        {
            number: 3,
            question: "Is Miss ME Connection a dating site?",
            answer: "Not exactly. While some missed connections might lead to romance, Miss ME Connection is about rediscovering any meaningful moment—romantic, platonic, or just plain curious. It's a celebration of serendipity, where chance encounters get a second chance. It’s about connection, not swiping."
        },
        {
            number: 4,
            question: "Is my information private on Miss ME Connection?",
            answer: "Yes! We value your privacy and safety. We keep it simple and only ask for a first name, email address, and your postal code. Only the details you choose to include in your post are visible to other users. Your contact info is never shared publicly, and messaging happens securely within the platform. Unlike traditional dating sites, we don't ask for detailed personal info because we believe in real-world stories, not overly curated profiles."
        },
        {
            number: 5,
            question: "How Does MISS ME CONNECTION KEEP USERS SAFE?",
            answer: (
                <>
                    We require all users to create profiles and follow community guidelines. Inappropriate behavior or spam is not tolerated. You can email us at the address below with any concerns.<br />
                    <a href="mailto:support@missmeconnection.com" className="faq-link">support@missmeconnection.com</a>
                </>
            )
        },
        {
            number: 6,
            question: "What should I do if I recognize myself in someone else’s post?",
            answer: "If you think a post is about you, you can respond safely through our platform's messaging system. Please be respectful and thoughtful—after all, someone took a chance to find you!"
        },
        {
            number: 7,
            question: "Who can I contact if I need help or have an issue?",
            answer: (
                <>
                    Our support team is here to help! You can reach us directly by emailing us at support@missmeconnection.com for assistance with anything from technical issues to platform concerns or community guideline violations.<br />
                    <a href="mailto:support@missmeconnection.com" className="faq-link">support@missmeconnection.com</a>
                </>
            )
        }
    ];

    return (
        <div className="faq-page">
            <SideMenu isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} />

            {/* Hamburger Button */}
            <button className="hamburger-btn-static" onClick={() => setIsMenuOpen(true)}>
                <div className="hamburger-line"></div>
                <div className="hamburger-line"></div>
                <div className="hamburger-line"></div>
            </button>

            <button className="faq-back-btn" onClick={() => navigate(-1)}>✕</button>

            <header className="faq-hero" style={{ backgroundImage: `url(${mapBg})` }}>
                <div className="faq-hero-halftone"></div>
                <div className="faq-hero-content">
                    <div className="faq-logo-group" onClick={() => navigate('/')}>
                        <img src={logoAsset} alt="Logo" className="faq-heart-logo" />
                        <h1 className="faq-title">FAQS</h1>
                    </div>
                    <p className="faq-subtitle">
                        Some common questions and answers below.
                    </p>
                </div>
            </header>

            <div className="faq-content">
                <h1 className="faq-content-title">FAQs</h1>
                {faqs.map((faq) => (
                    <div className="faq-item" key={faq.number}>
                        <h2 className="faq-question">
                            {faq.number} - {faq.question}
                        </h2>
                        <div className="faq-answer">{faq.answer}</div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default FAQ;
