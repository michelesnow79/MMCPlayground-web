import React from 'react';
import { useNavigate } from 'react-router-dom';
import './StaticPage.css';

const About = () => {
    const navigate = useNavigate();

    return (
        <div className="static-page-container">
            <header className="static-header">
                <button className="static-back-btn" onClick={() => navigate(-1)}>←</button>
                <h1 className="static-title">ABOUT US</h1>
            </header>

            <div className="static-content">
                <section className="static-section">
                    <h2 className="mm-heading">Miss Me Connection: Where Seconds Become Stories</h2>
                    <p>
                        "Miss Me Connection is more than a website; it’s a heartbeat. It’s for the moments
                        when time stood still, but life moved on. We’ve all been there: a glance on a
                        crowded train, a shared smile at a coffee shop, or a brief conversation that
                        felt like it could have been so much more. This platform was born from the
                        belief that 'goodbye' shouldn't have to be the end of the story."
                    </p>
                </section>

                <section className="static-section">
                    <h2 className="mm-heading">The Mission</h2>
                    <p>
                        Our mission is simple: to bridge the gap between 'what if' and 'hello again.'
                        We provide a safe, anonymous, and beautiful space for people to share their
                        missed connections and, just maybe, find the person they’ve been thinking about.
                    </p>
                </section>
            </div>
        </div>
    );
};

export default About;
