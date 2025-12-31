import React from 'react';
import './LanguageSelector.css';

const LanguageSelector = ({ language, onLanguageChange }) => {
  const languages = [
    { code: 'en', label: 'EN', name: 'English', flag: '🇬🇧' },
    { code: 'zh-HK', label: '粵', name: 'Cantonese', flag: '🇭🇰' },
    { code: 'zh-CN', label: '普', name: 'Mandarin', flag: '🇨🇳' },
  ];

  return (
    <div className="language-selector">
      <div className="language-selector-label">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="2" y1="12" x2="22" y2="12"></line>
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
        </svg>
        <span>Language</span>
      </div>
      <div className="language-buttons">
      {languages.map((lang) => (
        <button
          key={lang.code}
          className={`lang-button ${language === lang.code ? 'active' : ''}`}
          onClick={() => onLanguageChange(lang.code)}
          title={lang.name}
            aria-label={`Switch to ${lang.name}`}
        >
            <span className="lang-flag">{lang.flag}</span>
            <span className="lang-code">{lang.label}</span>
        </button>
      ))}
      </div>
    </div>
  );
};

export default LanguageSelector;
