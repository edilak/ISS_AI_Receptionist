import React, { useState, useEffect } from 'react';
import './App.css';
import ChatInterface from './components/ChatInterface';
import PathMap from './components/PathMap';
import Header from './components/Header';
import LanguageSelector from './components/LanguageSelector';
import CoordinateMapper from './components/CoordinateMapper';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

function App() {
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [language, setLanguage] = useState('en');
  const [currentLocation, setCurrentLocation] = useState('Main Entrance');
  const [pathData, setPathData] = useState(null);
  const [showPathMap, setShowPathMap] = useState(false);
  const [showCoordinateMapper, setShowCoordinateMapper] = useState(false);
  const [mapperFloor, setMapperFloor] = useState(1);

  // Initialize with greeting
  useEffect(() => {
    const greeting = {
      id: Date.now(),
      text: language === 'en' 
        ? 'Hello! How may I help you?' 
        : language === 'zh-HK' 
        ? '你好,請問我有咩可以幫到你?'
        : '你好，请问我可以帮您什么？',
      sender: 'assistant',
      timestamp: new Date()
    };
    setMessages([greeting]);
  }, [language]);

  const sendMessage = async (text) => {
    if (!text.trim()) return;

    // Add user message
    const userMessage = {
      id: Date.now(),
      text: text,
      sender: 'user',
      timestamp: new Date()
    };
    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);
    setPathData(null);
    setShowPathMap(false);

    try {
      // Check if this is a path query FIRST
      // Path keywords: explicit navigation requests
      const hasPathKeywords = /(how\s+to\s+get|directions|path|route|way\s+to|navigate|where\s+is|get\s+to|go\s+to|how\s+do\s+I)/i.test(text);
      // Location keywords: any mention of zones, floors, or specific locations
      const hasLocationKeywords = /(zone|zones|cafeteria|lab|office|conference|meeting|restroom|lavatory|lav|pantry|lobby|reception|entrance|elevator|lift|rooftop|room|floor|1\/f|2\/f|3\/f|5\/f|6\/f|7\/f|gf|g\/f|ground\s+floor|1st|2nd|3rd|5th|6th|7th)/i.test(text);
      // If it has location keywords, treat it as a path query (even without explicit path keywords)
      // This handles queries like "zone 3, 1/f" or "where is zone 5"
      const isPathQuery = hasPathKeywords || hasLocationKeywords;
      
      let pathData = null;
      let pathContext = null;
      
      // If it's a path query, find the path FIRST, then generate AI response with actual path data
      let pathfindingError = null;
      if (isPathQuery) {
        console.log('Path query detected, finding path first...');
        pathData = await findPathForQuery(text);
        
        if (pathData && pathData.path) {
          // Build context from actual path data
          const destinationFloor = pathData.to.floor;
          const floorName = destinationFloor === 0 ? 'Ground Floor (G/F)' : 
                           destinationFloor === 1 ? '1st Floor' :
                           destinationFloor === 2 ? '2nd Floor' :
                           destinationFloor === 3 ? '3rd Floor' :
                           `${destinationFloor}th Floor`;
          
          pathContext = {
            destination: pathData.to.name,
            destinationFloor: floorName,
            estimatedTime: pathData.estimatedTime,
            pathSteps: pathData.path.length,
            requiresElevator: pathData.path.some(step => step.isFloorChange),
            pathSummary: pathData.path.map((step, idx) => {
              if (idx === 0) return `Start at ${step.name}`;
              if (idx === pathData.path.length - 1) return `Arrive at ${step.name}`;
              if (step.isFloorChange) return `Take elevator to ${pathData.path[idx + 1].floor === 0 ? 'Ground Floor' : `Floor ${pathData.path[idx + 1].floor}`}`;
              return `Go to ${step.name}`;
            }).join(' → '),
            pathFound: true
          };
          
          console.log('Path context for AI:', pathContext);
        } else {
          // Path not found - provide context for AI to explain why
          pathContext = {
            pathFound: false,
            errorMessage: 'Path not found. This location may not exist or may not be accessible from the current location.'
          };
          console.log('Path not found for query:', text);
        }
      }
      
      // Send to chat API with path context
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
            availableLocations: 'HSITP Building 8 - Zones 01-07 (flexible lab/office spaces), Lift Lobby, Central Corridor, Service areas (TEL EQUIP RM, AHU RM, Lavatories, METER RM, Common Pantry)',
            pathData: pathContext // Include actual path data
          }
        }),
      });

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      // Add assistant response
      const assistantMessage = {
        id: Date.now() + 1,
        text: data.message,
        sender: 'assistant',
        timestamp: new Date(),
        isPathQuery: isPathQuery,
        locationImage: data.locationImage || null
      };
      setMessages(prev => [...prev, assistantMessage]);

      // Show path visualization if we have path data
      if (pathData && pathData.path && pathData.path.length > 0) {
        console.log('✅ Setting path data and showing map');
        setPathData(pathData);
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

  const findPathForQuery = async (query) => {
    try {
      console.log('Handling path query:', query);
      
      // Improved location extraction - try multiple patterns
      let to = null;
      let from = currentLocation;
      
      // Pattern 1: "how do I get to X"
      const pattern1 = /(?:how\s+do\s+I\s+get\s+to|how\s+to\s+get\s+to|go\s+to|navigate\s+to|find|where\s+is)\s+([A-Za-z0-9\s]+?)(?:\s+(?:from|at)\s+([A-Za-z0-9\s]+))?(?:\?|$)/i;
      let match = query.match(pattern1);
      
      if (match) {
        to = match[1]?.trim();
        if (match[2]) {
          from = match[2]?.trim();
        }
      } else {
        // Pattern 2: "directions to X"
        const pattern2 = /(?:directions\s+to|way\s+to|path\s+to)\s+([A-Za-z0-9\s]+?)(?:\s+from\s+([A-Za-z0-9\s]+))?(?:\?|$)/i;
        match = query.match(pattern2);
        if (match) {
          to = match[1]?.trim();
          if (match[2]) {
            from = match[2]?.trim();
          }
        }
      }
      
      // If still no match, try to extract any location-like word
      if (!to) {
        // Common location keywords with better matching
        const locationKeywords = [
          'zone 01', 'zone 02', 'zone 03', 'zone 05', 'zone 06', 'zone 07',
          'zone 1', 'zone 2', 'zone 3', 'zone 5', 'zone 6', 'zone 7',
          'conference room a', 'conference room b', 'conference a', 'conference b', 'conf a', 'conf b',
          'cafeteria', 'wet lab', 'lab', 'office', 'meeting room', 'meeting',
          'restroom', 'lavatory', 'lav', 'pantry', 'lobby', 'reception', 'entrance', 
          'elevator', 'lift lobby', 'lift', 'corridor', 'tel equip', 'ahu rm', 'meter rm'
        ];
        const queryLower = query.toLowerCase();
        for (const keyword of locationKeywords) {
          if (queryLower.includes(keyword)) {
            // Try to get the full location name
            const keywordIndex = queryLower.indexOf(keyword);
            const before = query.substring(Math.max(0, keywordIndex - 20), keywordIndex).trim();
            const after = query.substring(keywordIndex + keyword.length, Math.min(query.length, keywordIndex + keyword.length + 20)).trim();
            to = (before + ' ' + keyword + ' ' + after).trim();
            // Clean up
            to = to.replace(/\s+/g, ' ').trim();
            break;
          }
        }
      }
      
      if (!to) {
        console.log('Could not extract destination from query');
        return null;
      }
      
      // Clean up location names - remove "HSITP" prefix if present
      from = from.replace(/^hsitp\s+/i, '').trim();
      to = to.replace(/^hsitp\s+/i, '').trim();
      
      // Normalize zone names (Zone 1 -> Zone 01, etc.)
      // Handle various formats: "zone 3, 1/f", "zone 3 1/f", "zone 3 on 1/f", "zone 3 of 1/f"
      const zoneWithFloorMatch = to.match(/zone\s+(\d)[\s,]+(?:of|on)?\s*(gf|ground\s+floor|g\/f|1st|2nd|3rd|5th|6th|7th|1\/f|2\/f|3\/f|5\/f|6\/f|7\/f|floor\s+(\d+))/i);
      if (zoneWithFloorMatch) {
        const zoneNum = zoneWithFloorMatch[1];
        const floorSpec = (zoneWithFloorMatch[2] || zoneWithFloorMatch[3] || '').toLowerCase();
        
        // Check if user is asking for zone on Ground Floor (which doesn't exist)
        if (floorSpec.includes('gf') || floorSpec.includes('ground') || floorSpec.includes('g/f')) {
          console.warn('User asked for zone on Ground Floor - zones only exist on 1/F-7/F');
          // Remove the floor specification and let pathfinder handle the error with a helpful message
          to = `Zone 0${zoneNum}`;
        } else {
          // Zones exist on other floors, normalize the zone name
          to = `Zone 0${zoneNum}`;
        }
      } else {
        // Simple zone match without floor specification (e.g., "zone 3" or "zone 3,")
        const zoneMatch = to.match(/zone\s+(\d)/i);
        if (zoneMatch) {
          const zoneNum = zoneMatch[1];
          to = `Zone 0${zoneNum}`;
        }
      }
      
      // Handle "Conference Room A" vs "Conference A" - normalize
      if (to.toLowerCase().includes('conference')) {
        if (to.toLowerCase().includes('room a') || to.toLowerCase().includes('conf a') || to.toLowerCase().match(/conference\s+a\b/i)) {
          to = 'Conference Room A';
        } else if (to.toLowerCase().includes('room b') || to.toLowerCase().includes('conf b') || to.toLowerCase().match(/conference\s+b\b/i)) {
          to = 'Conference Room B';
        }
      }
      
      // Normalize service area names
      if (to.toLowerCase().includes('tel equip')) {
        to = 'TEL EQUIP RM (1/F)';
      } else if (to.toLowerCase().includes('ahu')) {
        to = 'AHU RM (1/F - Top)';
      } else if (to.toLowerCase().includes('meter')) {
        to = 'METER RM (1/F)';
      } else if (to.toLowerCase().includes('lift lobby') || to.toLowerCase().includes('elevator lobby')) {
        to = 'Lift Lobby';
      } else if (to.toLowerCase().includes('lavatory') || to.toLowerCase().includes('lav')) {
        if (to.toLowerCase().includes('female') || to.toLowerCase().includes('women')) {
          to = 'Female LAV (1/F)';
        } else if (to.toLowerCase().includes('male') || to.toLowerCase().includes('men')) {
          to = 'Male LAV (1/F)';
        }
      } else if (to.toLowerCase().includes('pantry')) {
        to = 'Common Pantry (1/F)';
      }
      
      console.log('Extracted locations - From:', from, 'To:', to);

      const pathResponse = await fetch(`${API_BASE_URL}/pathfinder/find-path`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ from, to }),
      });

      if (!pathResponse.ok) {
        const errorData = await pathResponse.json();
        console.error('Path finder error:', errorData);
        return null;
      }

      const pathData = await pathResponse.json();
      console.log('✅ Path data received:', pathData);
      
      return pathData;
    } catch (error) {
      console.error('Error finding path:', error);
      return null;
    }
  };

  const handleClosePathMap = () => {
    setShowPathMap(false);
    setPathData(null);
  };

  return (
    <div className="app">
      <Header 
        currentLocation={currentLocation}
        onLocationChange={setCurrentLocation}
        language={language}
      />
      
      <div className="app-container">
        <div className="assistant-avatar">
          <div className="avatar-circle">
            <div className="avatar-face">
              <div className="avatar-eyes">
                <div className="eye left"></div>
                <div className="eye right"></div>
              </div>
              <div className="avatar-mouth"></div>
            </div>
          </div>
          <div className="avatar-name">Tracy</div>
          <div className="avatar-badge">ISS</div>
        </div>

        <div className="main-content">
          <ChatInterface
            messages={messages}
            onSendMessage={sendMessage}
            isLoading={isLoading}
            language={language}
          />

          {showPathMap && pathData && pathData.path && pathData.path.length > 0 ? (
            <PathMap
              pathData={pathData}
              onClose={handleClosePathMap}
              language={language}
            />
          ) : (
            showPathMap && console.log('PathMap not rendering - showPathMap:', showPathMap, 'pathData:', pathData)
          )}
        </div>

        <LanguageSelector
          language={language}
          onLanguageChange={setLanguage}
        />
      </div>
      
      {/* Coordinate Mapper - Development Tool */}
      {showCoordinateMapper && (
        <CoordinateMapper
          floorPlanImage={null}
          floorNumber={mapperFloor}
          onSave={(data) => {
            console.log('Coordinate mapper saved:', data);
            // TODO: Send to backend to update floor plan data
          }}
          onClose={() => setShowCoordinateMapper(false)}
        />
      )}
      
      {/* Development: Add button to open coordinate mapper (remove in production) */}
      {process.env.NODE_ENV === 'development' && (
        <button
          onClick={() => setShowCoordinateMapper(true)}
          style={{
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            padding: '10px 20px',
            background: '#667eea',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer',
            zIndex: 1000,
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
          }}
        >
          🗺️ Map Coordinates
        </button>
      )}
    </div>
  );
}

export default App;

