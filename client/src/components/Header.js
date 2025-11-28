import React from 'react';
import './Header.css';

const Header = ({ currentLocation, onLocationChange, language }) => {
  return (
    <header className="app-header">
      <div className="header-content">
        <div className="location-info">
          <span className="location-icon">📍</span>
          <span className="location-text">HSITP Building 8 - {currentLocation}</span>
        </div>
        <div className="header-right">
          <div className="weather-icons">
            <span className="weather-icon">🔥</span>
            <span className="weather-icon">☀️</span>
          </div>
          <div className="time-display">
            {new Date().toLocaleTimeString(language === 'zh-HK' || language === 'zh-CN' ? 'zh-CN' : 'en-US', {
              hour: '2-digit',
              minute: '2-digit',
              hour12: true
            })}
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;

