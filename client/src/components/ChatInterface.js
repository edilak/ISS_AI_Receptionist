import React, { useState, useRef, useEffect } from 'react';
import './ChatInterface.css';
import VoiceInput from './VoiceInput';

const ChatInterface = ({ messages, onSendMessage, isLoading, language }) => {
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (inputText.trim() && !isLoading) {
      onSendMessage(inputText);
      setInputText('');
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleVoiceTranscript = (transcript) => {
    if (transcript && transcript.trim()) {
      setInputText(transcript);
      // Optionally auto-send the transcript
      // onSendMessage(transcript);
    }
  };

  const suggestedQuestions = language === 'en' 
    ? [
        'How do I get to Zone 5?',
        'Where is the lift lobby?',
        'Find the nearest restroom'
      ]
    : language === 'zh-HK'
    ? [
        '點樣去5區？',
        '升降機大堂喺邊？',
        '最近嘅洗手間喺邊？'
      ]
    : [
        '怎么去5区？',
        '电梯大厅在哪？',
        '最近的洗手间在哪？'
      ];

  return (
    <div className="chat-interface">
      {/* Chat Header */}
      <div className="chat-header">
        <div className="chat-header-info">
          <h3 className="chat-title">
            {language === 'en' ? 'Chat with Tracy' : language === 'zh-HK' ? '與 Tracy 對話' : '与 Tracy 对话'}
          </h3>
          <p className="chat-subtitle">
            {language === 'en' 
              ? 'Ask me anything about the building' 
              : language === 'zh-HK' 
              ? '詢問有關大樓的任何問題' 
              : '询问有关大楼的任何问题'}
          </p>
        </div>
        <div className="chat-status">
          <span className="chat-status-dot"></span>
          <span className="chat-status-text">
            {language === 'en' ? 'Active' : language === 'zh-HK' ? '在線' : '在线'}
          </span>
        </div>
      </div>

      {/* Messages Area */}
      <div className="chat-messages">
        {messages.map((message, index) => (
          <div
            key={message.id}
            className={`message ${message.sender} ${message.isError ? 'error' : ''}`}
            style={{ animationDelay: `${index * 0.05}s` }}
          >
            {message.sender === 'assistant' && (
              <div className="message-avatar">
                <div className="avatar-mini">
                  <div className="avatar-mini-eye"></div>
                  <div className="avatar-mini-eye"></div>
                </div>
              </div>
            )}
            <div className="message-content">
            <div className="message-bubble">
              <p>{message.text}</p>
              {message.locationImage && (
                  <div className="location-image-container">
                  <img 
                    src={message.locationImage} 
                    alt="Location" 
                      className="location-image"
                    onError={(e) => {
                      e.target.style.display = 'none';
                    }}
                  />
                </div>
              )}
              {message.isPathQuery && (
                <div className="path-indicator">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10"></circle>
                      <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"></polygon>
                    </svg>
                    <span>
                  {language === 'en' 
                        ? 'Route map loading below...'
                    : language === 'zh-HK'
                        ? '路線圖正在下方加載...'
                        : '路线图正在下方加载...'}
                    </span>
                </div>
              )}
            </div>
              <span className="message-time">
              {message.timestamp.toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit'
              })}
              </span>
            </div>
          </div>
        ))}
        
        {isLoading && (
          <div className="message assistant">
            <div className="message-avatar">
              <div className="avatar-mini typing">
                <div className="avatar-mini-eye"></div>
                <div className="avatar-mini-eye"></div>
              </div>
            </div>
            <div className="message-content">
            <div className="message-bubble">
              <div className="typing-indicator">
                <span></span>
                <span></span>
                <span></span>
                </div>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Suggested Questions */}
      {messages.length <= 2 && (
        <div className="suggested-questions">
          <span className="suggested-label">
            {language === 'en' ? 'Try asking:' : language === 'zh-HK' ? '試試問：' : '试试问：'}
          </span>
          <div className="suggested-buttons">
            {suggestedQuestions.map((question, index) => (
              <button
                key={index}
                className="suggested-btn"
                onClick={() => onSendMessage(question)}
                disabled={isLoading}
              >
                {question}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input Area */}
      <form className="chat-input-form" onSubmit={handleSubmit}>
        <div className="chat-input-wrapper">
        <div className="chat-input-container">
          <VoiceInput
            onTranscript={handleVoiceTranscript}
            language={language}
            disabled={isLoading}
          />
          <input
            ref={inputRef}
            type="text"
            className="chat-input"
            placeholder={
              language === 'en'
                  ? 'Type your question here...'
                : language === 'zh-HK'
                  ? '在此輸入您的問題...'
                  : '在此输入您的问题...'
            }
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyPress={handleKeyPress}
            disabled={isLoading}
          />
          <button
            type="submit"
            className="send-button"
            disabled={!inputText.trim() || isLoading}
              aria-label="Send message"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="22" y1="2" x2="11" y2="13"></line>
                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
            </svg>
          </button>
        </div>
        </div>
      </form>
    </div>
  );
};

export default ChatInterface;
