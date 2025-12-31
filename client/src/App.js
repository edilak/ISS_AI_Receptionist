import React, { useState, useEffect } from 'react';
import './App.css';
import ChatInterface from './components/ChatInterface';
import PathMap from './components/PathMap';
import Header from './components/Header';
import LanguageSelector from './components/LanguageSelector';
import CoordinateMapper from './components/CoordinateMapper';
import SpaceEditor from './components/SpaceEditor';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

function App() {
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [language, setLanguage] = useState('en');
  const [currentLocation, setCurrentLocation] = useState('Main Entrance');
  const [pathData, setPathData] = useState(null);
  const [showPathMap, setShowPathMap] = useState(false);
  const [showCoordinateMapper, setShowCoordinateMapper] = useState(false);
  const [showSpaceEditor, setShowSpaceEditor] = useState(false);
  const [mapperFloor] = useState(1);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Update time every minute
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  // Initialize with greeting
  useEffect(() => {
    const greeting = {
      id: Date.now(),
      text: language === 'en' 
        ? 'Hello! Welcome to HSITP Building 8. How may I assist you today?' 
        : language === 'zh-HK' 
        ? '你好！歡迎來到香港科技園8號大樓。請問有咩可以幫到你？'
        : '你好！欢迎来到香港科技园8号大楼。请问有什么可以帮您？',
      sender: 'assistant',
      timestamp: new Date()
    };
    setMessages([greeting]);
  }, [language]);

  const sendMessage = async (text) => {
    if (!text.trim()) return;

    const newMessage = {
      id: Date.now(),
      text: text,
      sender: 'user',
      timestamp: new Date()
    };

    setMessages(prev => [...prev, newMessage]);
    setIsLoading(true);
    
    // Clear previous path visualization
    setPathData(null);
    setShowPathMap(false);

    try {
      const response = await fetch(`${API_BASE_URL}/chat/message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: text,
          language: language,
          context: {
            currentLocation: currentLocation,
            availableLocations: 'HSITP Building 8 - Zones 01-07 (flexible lab/office spaces), Lift Lobby, Central Corridor, Service areas (TEL EQUIP RM, AHU RM, Lavatories, METER RM, Common Pantry)'
          }
        }),
      });

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      const assistantMessage = {
        id: Date.now() + 1,
        text: data.message,
        sender: 'assistant',
        timestamp: new Date(),
        isPathQuery: data.isPathQuery,
        locationImage: data.locationImage || null
      };
      setMessages(prev => [...prev, assistantMessage]);

      if (data.pathData && data.pathData.path && data.pathData.path.length > 0) {
        console.log('✅ Setting path data from AI response');
        setPathData(data.pathData);
        setTimeout(() => {
          setShowPathMap(true);
          console.log('✅ Path map visibility set to true');
        }, 100);
      }

    } catch (error) {
      console.error('Error sending message:', error);
      const errorMessage = {
        id: Date.now() + 1,
        text: language === 'en' 
          ? 'Sorry, I encountered an error. Please try again.'
          : language === 'zh-HK'
          ? '抱歉，我遇到錯誤。請再試一次。'
          : '抱歉，我遇到错误。请再试一次。',
        sender: 'assistant',
        timestamp: new Date(),
        isError: true
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClosePathMap = () => {
    setShowPathMap(false);
    setPathData(null);
  };

  const formatDate = () => {
    const options = { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' };
    const locale = language === 'zh-HK' || language === 'zh-CN' ? 'zh-CN' : 'en-US';
    return currentTime.toLocaleDateString(locale, options);
  };

  const formatTime = () => {
    return currentTime.toLocaleTimeString(language === 'zh-HK' || language === 'zh-CN' ? 'zh-CN' : 'en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  return (
    <div className="kiosk-app">
      {/* Header Bar */}
      <Header 
        currentLocation={currentLocation}
        onLocationChange={setCurrentLocation}
        language={language}
        currentTime={formatTime()}
        currentDate={formatDate()}
      />
      
      {/* Main Content */}
      <main className="kiosk-main">
        {/* Left Side - AI Assistant */}
        <section className="assistant-section">
          <div className="assistant-card">
            {/* AI Avatar */}
            <div className="ai-avatar">
              <div className="avatar-ring">
                <div className="avatar-ring-inner"></div>
              </div>
            <div className="avatar-face">
              <div className="avatar-eyes">
                  <div className="eye left">
                    <div className="eye-pupil"></div>
                  </div>
                  <div className="eye right">
                    <div className="eye-pupil"></div>
                  </div>
                </div>
                <div className="avatar-mouth">
                  <div className="mouth-bar"></div>
                  <div className="mouth-bar"></div>
                  <div className="mouth-bar"></div>
                  <div className="mouth-bar"></div>
                  <div className="mouth-bar"></div>
                </div>
              </div>
            </div>
            
            {/* Assistant Info */}
            <div className="assistant-info">
              <h2 className="assistant-name">Tracy</h2>
              <p className="assistant-title">
                {language === 'en' ? 'AI Receptionist' : language === 'zh-HK' ? 'AI 接待員' : 'AI 接待员'}
              </p>
              <div className="assistant-status">
                <span className="status-dot"></span>
                <span className="status-text">
                  {language === 'en' ? 'Online & Ready' : language === 'zh-HK' ? '在線準備中' : '在线准备中'}
                </span>
              </div>
            </div>

            {/* ISS Branding */}
            <div className="iss-branding">
              <div className="iss-logo">
                <span className="iss-text">ISS</span>
              </div>
              <span className="iss-tagline">
                {language === 'en' ? 'Facility Services' : language === 'zh-HK' ? '設施服務' : '设施服务'}
              </span>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="quick-actions">
            <h3 className="quick-actions-title">
              {language === 'en' ? 'How can I help?' : language === 'zh-HK' ? '我可以如何幫助你？' : '我可以如何帮助你？'}
            </h3>
            <div className="action-buttons">
              <button 
                className="action-btn"
                onClick={() => sendMessage(language === 'en' ? 'I need directions' : language === 'zh-HK' ? '我需要指路' : '我需要指路')}
              >
                <span className="action-icon">🧭</span>
                <span className="action-label">
                  {language === 'en' ? 'Wayfinding' : language === 'zh-HK' ? '指路導航' : '指路导航'}
                </span>
              </button>
              <button 
                className="action-btn"
                onClick={() => sendMessage(language === 'en' ? 'Building information' : language === 'zh-HK' ? '大樓資訊' : '大楼资讯')}
              >
                <span className="action-icon">🏢</span>
                <span className="action-label">
                  {language === 'en' ? 'Building Info' : language === 'zh-HK' ? '大樓資訊' : '大楼资讯'}
                </span>
              </button>
              <button 
                className="action-btn"
                onClick={() => sendMessage(language === 'en' ? 'Where are the facilities?' : language === 'zh-HK' ? '設施在哪裏？' : '设施在哪里？')}
              >
                <span className="action-icon">🚻</span>
                <span className="action-label">
                  {language === 'en' ? 'Facilities' : language === 'zh-HK' ? '設施' : '设施'}
                </span>
              </button>
              <button 
                className="action-btn"
                onClick={() => sendMessage(language === 'en' ? 'Emergency assistance' : language === 'zh-HK' ? '緊急協助' : '紧急协助')}
              >
                <span className="action-icon">🆘</span>
                <span className="action-label">
                  {language === 'en' ? 'Emergency' : language === 'zh-HK' ? '緊急協助' : '紧急协助'}
                </span>
              </button>
            </div>
        </div>
        </section>

        {/* Right Side - Chat Interface */}
        <section className="chat-section">
          <ChatInterface
            messages={messages}
            onSendMessage={sendMessage}
            isLoading={isLoading}
            language={language}
          />

          {showPathMap && pathData && pathData.path && pathData.path.length > 0 && (
            <PathMap
              pathData={pathData}
              onClose={handleClosePathMap}
              language={language}
            />
          )}
        </section>
      </main>

      {/* Language Selector - Fixed Position */}
        <LanguageSelector
          language={language}
          onLanguageChange={setLanguage}
        />
      
      {/* Coordinate Mapper - Development Tool */}
      {showCoordinateMapper && (
        <CoordinateMapper
          floorPlanImage={null}
          floorNumber={mapperFloor}
          onSave={(data) => {
            console.log('Coordinate mapper saved:', data);
          }}
          onClose={() => setShowCoordinateMapper(false)}
        />
      )}
      
      {/* Development: Add buttons to open dev tools */}
      {process.env.NODE_ENV === 'development' && (
        <div className="dev-tools-container">
        <button
            className="dev-mapper-btn"
          onClick={() => setShowCoordinateMapper(true)}
            title="Coordinate Mapper"
          >
            🗺️
          </button>
          <button
            className="dev-mapper-btn dev-space-btn"
            onClick={() => setShowSpaceEditor(true)}
            title="Space Navigation Editor"
          >
            🧠
          </button>
        </div>
      )}
      
      {/* Space Editor - RL Navigation Setup */}
      {showSpaceEditor && (
        <SpaceEditor
          onSave={(data) => {
            console.log('Space definitions saved:', data);
          }}
          onClose={() => setShowSpaceEditor(false)}
        />
      )}
    </div>
  );
}

export default App;
