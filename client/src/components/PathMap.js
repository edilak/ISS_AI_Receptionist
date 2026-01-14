import React, { useState, useEffect, useRef } from 'react';
import './PathMap.css';
import axios from 'axios';
import FloorMapViewer from './FloorMapViewer';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const PathMap = ({ pathData, onClose, language }) => {
  const [floorPlanData, setFloorPlanData] = useState(null);
  // currentFloorImage, selectedFloor removed - replaced by multi-floor view
  const [pathAnimationProgress, setPathAnimationProgress] = useState(0);

  // Check if this is space navigation data (has svgPath from RL system)
  const isSpaceNavPath = pathData?.visualization?.svgPath || pathData?.path?.svgPath;

  // Debug: Log when component receives pathData
  useEffect(() => {
    if (pathData && pathData.path && Array.isArray(pathData.path)) {
      console.log('PathMap component received pathData:', pathData);
      console.log('PathMap: isSpaceNavPath:', !!isSpaceNavPath);
      if (!isSpaceNavPath) {
        console.log('PathMap: Checking waypoints in path segments:');
        pathData.path.forEach((step, idx) => {
          if (step.routeWaypoints) {
            console.log(`  Step ${idx + 1} (${step.id}): ${step.routeWaypoints.length} waypoints`, step.routeWaypoints);
          } else {
            console.log(`  Step ${idx + 1} (${step.id}): NO routeWaypoints property`);
          }
        });
      }
    }
  }, [pathData, isSpaceNavPath]);

  // Animate path on load
  useEffect(() => {
    if (pathData && pathData.path) {
      setPathAnimationProgress(0);
      const duration = 1500; // 1.5 seconds
      const steps = 60;
      const increment = 100 / steps;
      let current = 0;

      const interval = setInterval(() => {
        current += increment;
        if (current >= 100) {
          setPathAnimationProgress(100);
          clearInterval(interval);
        } else {
          setPathAnimationProgress(current);
        }
      }, duration / steps);

      return () => clearInterval(interval);
    }
  }, [pathData]);

  const loadFloorPlanData = async () => {
    try {
      console.log('PathMap: Fetching floor plan data...');
      const response = await axios.get(`${API_BASE_URL}/pathfinder/floor-plans`);
      setFloorPlanData(response.data);
    } catch (error) {
      console.error('PathMap: Error loading floor plan data:', error);
    }
  };

  useEffect(() => {
    if (pathData && pathData.path && Array.isArray(pathData.path) && pathData.path.length > 0) {
      console.log('PathMap: Loading floor plan data for path:', pathData);
      loadFloorPlanData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathData]);


  // Helper functions used by PathMap (text) or kept for reference
  // Note: Rendering helpers moved to FloorMapViewer

  // Get waypoints for a path segment between two nodes


  // Image update logic removed

  const formatTime = (minutes) => {
    if (language === 'zh-HK' || language === 'zh-CN') {
      return `約 ${minutes} 分鐘`;
    }
    return `~ ${minutes} minutes`;
  };

  const formatFloorLabel = (floor) => {
    if (floor === null || floor === undefined) return '';
    if (floor === 0) return 'G/F';
    return `${floor}/F`;
  };

  const formatNodeName = (node) => {
    if (!node) return '';
    // Handle case where node is a string (from space navigation)
    if (typeof node === 'string') return node;
    if (node.displayName) return node.displayName;
    const source = node.name || node.id || '';
    const trimmed = source.replace(/^hsitp_/i, '');
    const lower = trimmed.toLowerCase();
    const floorSuffix = typeof node.floor === 'number' ? ` (${formatFloorLabel(node.floor)})` : '';
    const capitalize = (str) => str.replace(/\b\w/g, (char) => char.toUpperCase());

    if (lower.startsWith('zone_')) {
      const zone = lower.replace('zone_', '').padStart(2, '0');
      return `Zone ${zone}${floorSuffix}`;
    }
    if (lower.startsWith('corridor')) {
      const num = lower.split('_')[1] || '1';
      return `Corridor ${num}${floorSuffix}`;
    }
    if (lower.startsWith('lift_lobby')) {
      return `Lift Lobby${floorSuffix}`;
    }
    if (lower.startsWith('stairs')) {
      return `Staircase${floorSuffix}`;
    }
    if (lower.includes('lav_f')) {
      return `Female Lavatory${floorSuffix}`;
    }
    if (lower.includes('lav_m')) {
      return `Male Lavatory${floorSuffix}`;
    }
    if (lower.includes('restroom')) {
      return `Restroom${floorSuffix}`;
    }
    if (lower.includes('pantry')) {
      return `Common Pantry${floorSuffix}`;
    }
    if (lower.includes('tel_equip')) {
      return `TEL Equipment Room${floorSuffix}`;
    }
    if (lower.includes('ahu')) {
      return `AHU Room${floorSuffix}`;
    }
    if (lower.includes('meter')) {
      return `Meter Room${floorSuffix}`;
    }

    return `${capitalize(trimmed.replace(/_/g, ' '))}${floorSuffix}`;
  };

  const getDirectionText = (direction, isFloorChange) => {
    if (isFloorChange) {
      return language === 'en' ? 'Take elevator/stairs' : language === 'zh-HK' ? '乘搭電梯/樓梯' : '乘搭电梯/楼梯';
    }

    const directions = {
      'right': language === 'en' ? 'Turn right' : language === 'zh-HK' ? '向右轉' : '向右转',
      'left': language === 'en' ? 'Turn left' : language === 'zh-HK' ? '向左轉' : '向左转',
      'up': language === 'en' ? 'Go straight' : language === 'zh-HK' ? '直行' : '直行',
      'down': language === 'en' ? 'Go straight' : language === 'zh-HK' ? '直行' : '直行',
    };

    return directions[direction] || directions['up'];
  };

  const getInstructionSentence = (step, nextStep) => {
    if (!nextStep) return '';
    const directionText = step.nextDirection
      ? getDirectionText(step.nextDirection, step.isFloorChange)
      : (language === 'en' ? 'Proceed' : language === 'zh-HK' ? '前進' : '前进');
    const connector = language === 'en' ? 'toward' : language === 'zh-HK' ? '前往' : '前往';
    let sentence = `${directionText} ${connector} ${formatNodeName(nextStep)}`;

    if ((step.isFloorChange || nextStep.floor !== step.floor) && typeof nextStep.floor === 'number') {
      sentence += ` (${formatFloorLabel(nextStep.floor)})`;
    }

    if (step.routeWaypoints && step.routeWaypoints.length > 1 && language === 'en') {
      sentence += ' following the highlighted corridor turns';
    }

    return sentence;
  };

  // Validation check
  if (!pathData || !pathData.path || pathData.path.length === 0) {
    console.log("PathMap: Not rendering - missing pathData or path:", { pathData, hasPath: pathData?.path?.length });
    return null;
  }

  if (!floorPlanData) {
    console.log("PathMap: Waiting for floorPlanData to load...");
    return (
      <div className="path-map-container">
        <div className="loading-floor-plan">
          {language === 'en' ? 'Loading floor plan...' : language === 'zh-HK' ? '正在載入樓層平面圖...' : '正在加载楼层平面图...'}
        </div>
      </div>
    );
  }

  console.log("PathMap: Rendering with pathData:", pathData, "floorPlanData:", floorPlanData);

  // Get unique floors in the path
  // Get unique floors in the path in order of appearance
  const getFloorsInPath = () => {
    if (!pathData || !pathData.path) return [];
    const floors = [];
    const seen = new Set();

    // Explicitly add Start and End floors if they exist, in case path array is weird
    // But relying on path array is safer for order.

    pathData.path.forEach(step => {
      if (step.floor !== undefined && step.floor !== null && !seen.has(step.floor)) {
        seen.add(step.floor);
        floors.push(step.floor);
      }
    });

    // Special case: if space navigation, maybe we don't have detailed path steps?
    if (floors.length === 0 && isSpaceNavPath) {
      if (pathData.from?.floor) { floors.push(pathData.from.floor); seen.add(pathData.from.floor); }
      if (pathData.to?.floor && !seen.has(pathData.to.floor)) { floors.push(pathData.to.floor); }
    }

    return floors.length > 0 ? floors : [1]; // Default to floor 1
  };

  const floorsInPath = getFloorsInPath();

  return (
    <div className="path-map-container">
      <div className="path-map-header">
        <div className="path-map-title">
          <h3>
            {language === 'en'
              ? 'Route Guidance'
              : language === 'zh-HK'
                ? '路線指引'
                : '路线指引'}
          </h3>
          <div className="path-time">
            {formatTime(pathData.estimatedTime)}
          </div>
        </div>
        {/* Floor selector removed */}
        <button className="close-button" onClick={onClose}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div className="path-map-content">
        <div className="path-route-info">
          <div className="route-header">
            <div className="route-from">
              <span className="route-label">
                {language === 'en' ? 'From' : language === 'zh-HK' ? '起點' : '起点'}
              </span>
              <span className="route-name">{formatNodeName(pathData.from)}</span>
            </div>
            <div className="route-arrow">→</div>
            <div className="route-to">
              <span className="route-label">
                {language === 'en' ? 'To' : language === 'zh-HK' ? '終點' : '终点'}
              </span>
              <span className="route-name">{formatNodeName(pathData.to)}</span>
            </div>
          </div>
        </div>

        <div className="path-visualization" style={{ flexDirection: 'column', height: 'auto', overflowY: 'auto', minHeight: '500px' }}>
          {floorsInPath.map(floor => (
            <FloorMapViewer
              key={floor}
              floor={floor}
              floorPlanData={floorPlanData}
              pathData={pathData}
              language={language}
              pathAnimationProgress={pathAnimationProgress}
            />
          ))}
          {floorsInPath.length === 0 && (
            <div style={{ color: 'white', padding: '20px' }}>
              No route floor information available.
            </div>
          )}
        </div>

        {/* Step-by-step instructions removed as per request
        <div className="path-instructions">
          <h4>
            {language === 'en' 
              ? 'Step-by-step Instructions' 
              : language === 'zh-HK' 
              ? '逐步指引' 
              : '逐步指引'}
          </h4>
          <ol className="instructions-list">
            {pathData.path.slice(0, -1).map((step, index) => {
              const nextStep = pathData.path[index + 1];
              const instruction = getInstructionSentence(step, nextStep);
              const fallback = `${language === 'en' ? 'Proceed to' : language === 'zh-HK' ? '前往' : '前往'} ${formatNodeName(nextStep)}`;
              return (
                <li key={index}>
                  {instruction || fallback}
                </li>
              );
            })}
          </ol>
        </div>
        */}
      </div>
    </div>
  );
};

export default PathMap;

