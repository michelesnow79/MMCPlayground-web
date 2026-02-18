import React from 'react';
import telemetry from '../utils/telemetry';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true };
    }

    componentDidCatch(error, errorInfo) {
        telemetry.trackError(error, {
            source: 'ErrorBoundary',
            componentStack: errorInfo.componentStack?.split('\n').slice(0, 3).join(' ')
        });
    }

    render() {
        if (this.state.hasError) {
            return (
                <div style={{
                    padding: '40px 20px',
                    textAlign: 'center',
                    fontFamily: 'system-ui',
                    color: '#333'
                }}>
                    <h2 style={{ color: '#E91E63' }}>Something went wrong.</h2>
                    <p>The application encountered an unexpected error.</p>
                    <button
                        onClick={() => window.location.href = '/'}
                        style={{
                            padding: '10px 20px',
                            backgroundColor: '#E91E63',
                            color: 'white',
                            border: 'none',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            marginTop: '20px'
                        }}
                    >
                        Return to Home
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
