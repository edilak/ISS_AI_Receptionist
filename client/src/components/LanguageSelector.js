import React from 'react';
import './LanguageSelector.css';

const LanguageSelector = ({ language, onLanguageChange }) => {
  const languages = [
    { code: 'en', label: 'EN', name: 'English' },
    { code: 'zh-HK', label: '粵', name: 'Cantonese' },
    { code: 'zh-CN', label: '普', name: 'Mandarin' },
  ];

  return (
    <div className="language-selector">
      {languages.map((lang) => (
        <button
          key={lang.code}
          className={`lang-button ${language === lang.code ? 'active' : ''}`}
          onClick={() => onLanguageChange(lang.code)}
          title={lang.name}
        >
          {lang.label}
        </button>
      ))}
    </div>
  );
};

export default LanguageSelector;

