import React from 'react';
import './Header.css';

const Header = ({ currentLocation, language, currentTime, currentDate }) => {
  return (
    <header className="kiosk-header">
      <div className="header-container">
        {/* Left - Location */}
        <div className="header-location">
          <div className="location-badge">
            <svg className="location-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
              <circle cx="12" cy="10" r="3"></circle>
            </svg>
            <div className="location-details">
              <span className="location-label">
                {language === 'en' ? 'CURRENT LOCATION' : language === 'zh-HK' ? '當前位置' : '当前位置'}
              </span>
              <span className="location-name">HSITP Building 8</span>
            </div>
          </div>
        </div>

        {/* Center - Welcome Message */}
        <div className="header-welcome">
          <h1 className="welcome-title">
            {language === 'en' ? 'Welcome' : language === 'zh-HK' ? '歡迎' : '欢迎'}
          </h1>
          <p className="welcome-subtitle">
            {language === 'en' 
              ? 'Hong Kong Science & Technology Parks' 
              : language === 'zh-HK' 
              ? '香港科技園' 
              : '香港科技园'}
          </p>
        </div>

        {/* Right - Date & Time */}
        <div className="header-datetime">
          <div className="datetime-display">
            <span className="time-text">{currentTime}</span>
            <span className="date-text">{currentDate}</span>
          </div>
          <div className="weather-indicator">
            <span className="weather-temp">26°C</span>
            <svg className="weather-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="5"></circle>
              <line x1="12" y1="1" x2="12" y2="3"></line>
              <line x1="12" y1="21" x2="12" y2="23"></line>
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
              <line x1="1" y1="12" x2="3" y2="12"></line>
              <line x1="21" y1="12" x2="23" y2="12"></line>
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
            </svg>
          </div>
        </div>
      </div>

      {/* Red accent bar at bottom */}
      <div className="header-accent"></div>
    </header>
  );
};

export default Header;
