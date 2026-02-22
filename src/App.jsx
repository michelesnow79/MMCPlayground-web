import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Landing from './pages/Landing';
import MapView from './pages/MapView';
import Browse from './pages/Browse';
import ConnectionDetail from './pages/ConnectionDetail';
import Messages from './pages/Messages';
import Account from './pages/Account';
import Login from './pages/Login';
import Admin from './pages/Admin';
import ConnectionMapMockup from './pages/ConnectionMapMockup';
import About from './pages/About';
import FAQ from './pages/FAQ';
import Support from './pages/Support';
import Terms from './pages/Terms';
import Privacy from './pages/Privacy';
import { AppProvider } from './context/AppContext';
import './index.css';
import { useEffect } from 'react';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { Capacitor } from '@capacitor/core';

import { registerNotifications } from './utils/notifications';

function App() {
  useEffect(() => {
    const initNativeFeatures = async () => {
      if (Capacitor.isNativePlatform()) {
        try {
          // Hide splash screen immediately so we can see what's happening
          await SplashScreen.hide();

          // Make status bar dark and transparent for that premium look
          await StatusBar.setStyle({ style: Style.Dark });
          await StatusBar.setBackgroundColor({ color: '#1a1a1b' });

          // Initialize Notifications
          await registerNotifications();
        } catch (e) {
          console.warn('Capacitor plugin failed to init:', e);
        }
      }
    };

    initNativeFeatures();
  }, []);

  return (
    <AppProvider>
      <Router>
        <div className="app-container">
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/map" element={<MapView />} />
            <Route path="/browse/:id" element={<ConnectionDetail />} />
            <Route path="/browse" element={<Browse />} />
            <Route path="/messages" element={<Messages />} />
            <Route path="/account" element={<Account />} />
            <Route path="/login" element={<Login />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/mockup" element={<ConnectionMapMockup />} />
            <Route path="/about" element={<About />} />
            <Route path="/faq" element={<FAQ />} />
            <Route path="/support" element={<Support />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="*" element={<Landing />} />
          </Routes>
        </div>
      </Router>
    </AppProvider>
  );
}

export default App;
