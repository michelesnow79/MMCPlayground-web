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
import { AppProvider } from './context/AppContext';
import './index.css';

function App() {
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
          </Routes>
        </div>
      </Router>
    </AppProvider>
  );
}

export default App;
