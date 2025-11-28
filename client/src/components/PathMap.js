import React, { useState, useEffect, useRef } from 'react';
import './PathMap.css';
import axios from 'axios';
import { getImageScaleFactors, transformPixelToSVG, calculateViewBox } from '../utils/coordinateTransform';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const PathMap = ({ pathData, onClose, language }) => {
  const [floorPlanData, setFloorPlanData] = useState(null);
  const [currentFloorImage, setCurrentFloorImage] = useState(null);
  const [hoveredNode, setHoveredNode] = useState(null);
  const [pathAnimationProgress, setPathAnimationProgress] = useState(0);
  const [imageScaleFactors, setImageScaleFactors] = useState(null);
  const [svgViewBox, setSvgViewBox] = useState('0 0 1200 900');
  const imageRef = useRef(null);

  // Debug: Log when component receives pathData
  useEffect(() => {
    if (pathData) {
      console.log('PathMap component received pathData:', pathData);
    }
  }, [pathData]);

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
      
      // Get the starting floor
      const startFloor = pathData.from.floor;
      console.log('PathMap: Starting floor:', startFloor);
      const floorInfo = response.data.floors.find(f => f.floor === startFloor);
      if (floorInfo) {
        console.log('PathMap: Found floor plan image:', floorInfo.image.url);
        setCurrentFloorImage(floorInfo.image.url);
      } else {
        console.warn('PathMap: Floor plan not found for floor:', startFloor);
      }
    } catch (error) {
      console.error('PathMap: Error loading floor plan data:', error);
    }
  };

  useEffect(() => {
    if (pathData && pathData.path && pathData.path.length > 0) {
      console.log('PathMap: Loading floor plan data for path:', pathData);
      loadFloorPlanData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathData]);

  // Update image scale factors when image loads or resizes
  useEffect(() => {
    const updateScaleFactors = () => {
      if (imageRef.current && imageRef.current.complete) {
        const scaleFactors = getImageScaleFactors(imageRef.current);
        setImageScaleFactors(scaleFactors);
        
        // Update SVG viewBox based on actual image dimensions
        const viewBox = calculateViewBox(scaleFactors.naturalWidth, scaleFactors.naturalHeight);
        setSvgViewBox(viewBox);
        
        console.log('PathMap: Image scale factors updated:', scaleFactors);
        console.log('PathMap: SVG viewBox:', viewBox);
      }
    };

    updateScaleFactors();
    
    // Update on window resize
    window.addEventListener('resize', updateScaleFactors);
    return () => window.removeEventListener('resize', updateScaleFactors);
  }, [currentFloorImage, floorPlanData]);

  const getNodeCoordinates = (nodeId, floorNumber) => {
    if (!floorPlanData) {
      console.warn('getNodeCoordinates: floorPlanData is null');
      return null;
    }
    const floorInfo = floorPlanData.floors.find(f => f.floor === floorNumber);
    if (!floorInfo) {
      console.warn(`getNodeCoordinates: Floor ${floorNumber} not found in floorPlanData`);
      return null;
    }
    const node = floorInfo.nodes.find(n => n.id === nodeId);
    if (!node) {
      console.warn(`getNodeCoordinates: Node ${nodeId} not found on floor ${floorNumber}. Available nodes:`, floorInfo.nodes.map(n => n.id));
      return null;
    }
    
    // Use pixel coordinates directly - SVG viewBox will handle scaling
    // If we have scale factors, we can transform, but for now use direct pixel coords
    // since viewBox handles the scaling automatically
    return { x: node.pixelX, y: node.pixelY };
  };

  // Get waypoints for a path segment between two nodes
  const getWaypoints = (fromNodeId, toNodeId, floorNumber) => {
    if (!floorPlanData) return [];
    
    const floorInfo = floorPlanData.floors.find(f => f.floor === floorNumber);
    if (!floorInfo || !floorInfo.paths) return [];
    
    // Find path definition that matches this segment
    const pathDef = floorInfo.paths.find(p => 
      (p.from === fromNodeId && p.to === toNodeId) ||
      (p.from === toNodeId && p.to === fromNodeId)
    );
    
    return pathDef?.waypoints || [];
  };

  // Create smooth path points using waypoints
  const createPathPoints = (start, end, waypoints = []) => {
    const points = [start];
    
    // Add waypoints
    waypoints.forEach(wp => {
      points.push({ x: wp.pixelX, y: wp.pixelY });
    });
    
    // Add end point
    points.push(end);
    
    return points;
  };

  // Generate SVG path string for polyline
  const generatePathString = (points) => {
    if (points.length === 0) return '';
    if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
    
    return points.map((point, index) => 
      index === 0 ? `M ${point.x} ${point.y}` : `L ${point.x} ${point.y}`
    ).join(' ');
  };

  // Update floor image - show destination floor (or most common floor in path)
  useEffect(() => {
    if (pathData && pathData.path && pathData.path.length > 0 && floorPlanData) {
      const destinationFloor = pathData.to.floor;
      const startFloor = pathData.from.floor;
      
      // Count floors in path to see which floor has most steps
      const floorCounts = {};
      pathData.path.forEach(step => {
        floorCounts[step.floor] = (floorCounts[step.floor] || 0) + 1;
      });
      
      // Choose floor: destination if path ends there, otherwise most common floor
      let displayFloor = destinationFloor;
      if (floorCounts[startFloor] > floorCounts[destinationFloor] && pathData.path.length > 2) {
        displayFloor = startFloor;
      }
      
      console.log('PathMap: Display floor:', displayFloor, '(Destination:', destinationFloor, ', Start:', startFloor, ')');
      const floorInfo = floorPlanData.floors.find(f => f.floor === displayFloor);
      if (floorInfo) {
        console.log('PathMap: Found floor plan image:', floorInfo.image.url);
        setCurrentFloorImage(floorInfo.image.url);
      } else {
        // Fallback to start floor
        const startFloorInfo = floorPlanData.floors.find(f => f.floor === startFloor);
        if (startFloorInfo) {
          console.log('PathMap: Using start floor as fallback:', startFloorInfo.image.url);
          setCurrentFloorImage(startFloorInfo.image.url);
        }
      }
    }
  }, [pathData, floorPlanData]);

  const formatTime = (minutes) => {
    if (language === 'zh-HK' || language === 'zh-CN') {
      return `約 ${minutes} 分鐘`;
    }
    return `~ ${minutes} minutes`;
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
        <button className="close-button" onClick={onClose}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
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
              <span className="route-name">{pathData.from.name}</span>
            </div>
            <div className="route-arrow">→</div>
            <div className="route-to">
              <span className="route-label">
                {language === 'en' ? 'To' : language === 'zh-HK' ? '終點' : '终点'}
              </span>
              <span className="route-name">{pathData.to.name}</span>
            </div>
          </div>
        </div>

        <div className="path-visualization">
          {currentFloorImage ? (
            <div className="floor-plan-container">
              <img 
                ref={imageRef}
                src={currentFloorImage} 
                alt="Floor Plan" 
                className="floor-plan-image"
                onLoad={(e) => {
                  console.log('Floor plan image loaded:', currentFloorImage);
                  // Update scale factors when image loads
                  const img = e.target;
                  const scaleFactors = getImageScaleFactors(img);
                  setImageScaleFactors(scaleFactors);
                  
                  // Get actual image dimensions from floor plan data or image
                  const floorInfo = floorPlanData?.floors?.find(f => {
                    const imgUrl = f.image?.url || '';
                    return currentFloorImage.includes(imgUrl.split('/').pop());
                  });
                  
                  const imgWidth = img.naturalWidth || img.width || (floorInfo?.image?.width || 1200);
                  const imgHeight = img.naturalHeight || img.height || (floorInfo?.image?.height || 900);
                  
                  const viewBox = calculateViewBox(imgWidth, imgHeight);
                  setSvgViewBox(viewBox);
                  console.log('PathMap: Image dimensions:', { imgWidth, imgHeight, viewBox });
                }}
                onError={(e) => console.error('Error loading floor plan image:', e)}
              />
              <svg 
                className="path-overlay" 
                viewBox={svgViewBox}
                preserveAspectRatio="xMidYMid meet"
                style={{ 
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%'
                }}
              >
                <defs>
                  {/* Gradient for path line */}
                  <linearGradient id="pathGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#667eea" stopOpacity="0.8" />
                    <stop offset="50%" stopColor="#764ba2" stopOpacity="0.9" />
                    <stop offset="100%" stopColor="#667eea" stopOpacity="0.8" />
                  </linearGradient>
                  
                  {/* Glow filter for path */}
                  <filter id="glow">
                    <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                    <feMerge>
                      <feMergeNode in="coloredBlur"/>
                      <feMergeNode in="SourceGraphic"/>
                    </feMerge>
                  </filter>
                  
                  {/* Arrow marker */}
                  <marker
                    id="arrowhead"
                    markerWidth="12"
                    markerHeight="12"
                    refX="10"
                    refY="3"
                    orient="auto"
                    markerUnits="strokeWidth"
                  >
                    <path d="M0,0 L0,6 L10,3 z" fill="#667eea" />
                  </marker>
                  
                  {/* Animated arrow marker */}
                  <marker
                    id="arrowheadAnimated"
                    markerWidth="12"
                    markerHeight="12"
                    refX="10"
                    refY="3"
                    orient="auto"
                    markerUnits="strokeWidth"
                  >
                    <path d="M0,0 L0,6 L10,3 z" fill="#764ba2">
                      <animate attributeName="fill" values="#764ba2;#667eea;#764ba2" dur="1s" repeatCount="indefinite" />
                    </path>
                  </marker>
                </defs>
                
                {/* Path lines with animation */}
                {pathData.path.map((step, index) => {
                  const coords = getNodeCoordinates(step.id, step.floor);
                  if (!coords) {
                    console.warn(`No coordinates found for ${step.id} on floor ${step.floor}`);
                    return null;
                  }
                  
                  const isStart = index === 0;
                  const isEnd = index === pathData.path.length - 1;
                  const progress = pathAnimationProgress;
                  const segmentProgress = (index / pathData.path.length) * 100;
                  const shouldShow = segmentProgress <= progress;
                  const opacity = shouldShow ? 1 : 0;
                  
                  // Get current display floor (destination floor)
                  const currentDisplayFloor = pathData.to.floor;
                  const isOnDisplayFloor = step.floor === currentDisplayFloor;
                  
                  return (
                    <g key={`${step.id}-${index}`} opacity={opacity} style={{ transition: 'opacity 0.3s ease' }}>
                      {/* Path line to next node - only if both nodes are on the display floor */}
                      {index < pathData.path.length - 1 && (() => {
                        const nextStep = pathData.path[index + 1];
                        const nextNodeId = nextStep.id;
                        const nextFloorNumber = nextStep.floor;
                        
                        if (!nextNodeId || nextFloorNumber === undefined) {
                          return null;
                        }
                        
                        const nextCoords = getNodeCoordinates(nextNodeId, nextFloorNumber);
                        if (!nextCoords) {
                          console.warn(`PathMap: No coordinates for next step ${nextNodeId} on floor ${nextFloorNumber}`);
                          return null;
                        }
                        
                        const isFloorChange = step.isFloorChange || (step.floor !== nextFloorNumber);
                        // Show line if both nodes are on the display floor
                        const showLine = (step.floor === currentDisplayFloor && nextFloorNumber === currentDisplayFloor);
                        
                        if (!showLine) {
                          return null;
                        }
                        
                        // Get waypoints for this path segment if available
                        const waypoints = getWaypoints(step.id, nextNodeId, step.floor);
                        const pathPoints = createPathPoints(coords, nextCoords, waypoints);
                        const pathString = generatePathString(pathPoints);
                        
                        // Use polyline if we have waypoints, otherwise use straight line
                        const usePolyline = waypoints.length > 0;
                        
                        return (
                          <>
                            {/* Shadow/glow line */}
                            {usePolyline ? (
                              <path
                                d={pathString}
                                stroke="#667eea"
                                strokeWidth="8"
                                strokeOpacity="0.2"
                                fill="none"
                                strokeDasharray={isFloorChange ? "8,4" : "none"}
                                markerEnd={isFloorChange ? "url(#arrowheadAnimated)" : "url(#arrowhead)"}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            ) : (
                              <line
                                x1={coords.x}
                                y1={coords.y}
                                x2={nextCoords.x}
                                y2={nextCoords.y}
                                stroke="#667eea"
                                strokeWidth="8"
                                strokeOpacity="0.2"
                                strokeDasharray={isFloorChange ? "8,4" : "none"}
                                markerEnd={isFloorChange ? "url(#arrowheadAnimated)" : "url(#arrowhead)"}
                              />
                            )}
                            
                            {/* Main path line */}
                            {usePolyline ? (
                              <path
                                d={pathString}
                                stroke="url(#pathGradient)"
                                strokeWidth="6"
                                fill="none"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeDasharray={isFloorChange ? "8,4" : "none"}
                                markerEnd={isFloorChange ? "url(#arrowheadAnimated)" : "url(#arrowhead)"}
                                filter="url(#glow)"
                                className="path-line"
                              />
                            ) : (
                              <line
                                x1={coords.x}
                                y1={coords.y}
                                x2={nextCoords.x}
                                y2={nextCoords.y}
                                stroke="url(#pathGradient)"
                                strokeWidth="6"
                                strokeLinecap="round"
                                strokeDasharray={isFloorChange ? "8,4" : "none"}
                                markerEnd={isFloorChange ? "url(#arrowheadAnimated)" : "url(#arrowhead)"}
                                filter="url(#glow)"
                                className="path-line"
                              />
                            )}
                          </>
                        );
                      })()}
                      
                      {/* Node marker with hover effect - only show if on display floor */}
                      {isOnDisplayFloor && (
                        <g 
                          onMouseEnter={() => setHoveredNode(step.id)}
                          onMouseLeave={() => setHoveredNode(null)}
                          style={{ cursor: 'pointer' }}
                        >
                          {/* Outer glow ring for start/end */}
                          {(isStart || isEnd) && (
                            <circle
                              cx={coords.x}
                              cy={coords.y}
                              r={isStart ? "22" : "22"}
                              fill={isStart ? "#4CAF50" : "#F44336"}
                              opacity="0.3"
                              className="marker-glow"
                            />
                          )}
                          
                          {/* Main marker circle */}
                          <circle
                            cx={coords.x}
                            cy={coords.y}
                            r={isStart || isEnd ? "18" : hoveredNode === step.id ? "14" : "12"}
                            fill={isStart ? "#4CAF50" : isEnd ? "#F44336" : "#667eea"}
                            stroke="#fff"
                            strokeWidth="3"
                            className="path-marker"
                            style={{
                              transition: 'r 0.2s ease',
                              filter: hoveredNode === step.id ? 'url(#glow)' : 'none'
                            }}
                          />
                          
                          {/* Icon/Text inside marker */}
                          {(isStart || isEnd) ? (
                            <text
                              x={coords.x}
                              y={coords.y + 6}
                              textAnchor="middle"
                              fill="#fff"
                              fontSize="14"
                              fontWeight="bold"
                              pointerEvents="none"
                            >
                              {isStart ? "S" : "E"}
                            </text>
                          ) : (
                            <circle
                              cx={coords.x}
                              cy={coords.y}
                              r="4"
                              fill="#fff"
                              pointerEvents="none"
                            />
                          )}
                          
                          {/* Hover tooltip */}
                          {hoveredNode === step.id && (
                            <g>
                              <rect
                                x={coords.x - Math.max(60, step.name.length * 6)}
                                y={coords.y - 40}
                                width={Math.max(120, step.name.length * 12)}
                                height="35"
                                rx="8"
                                fill="rgba(0, 0, 0, 0.85)"
                                className="tooltip-bg"
                              />
                              <text
                                x={coords.x}
                                y={coords.y - 20}
                                textAnchor="middle"
                                fill="#fff"
                                fontSize="13"
                                fontWeight="600"
                                pointerEvents="none"
                              >
                                {step.name}
                              </text>
                              {step.floor !== undefined && (
                                <text
                                  x={coords.x}
                                  y={coords.y - 5}
                                  textAnchor="middle"
                                  fill="#ccc"
                                  fontSize="10"
                                  pointerEvents="none"
                                >
                                  {language === 'en' 
                                    ? `Floor ${step.floor}` 
                                    : language === 'zh-HK' 
                                    ? `第 ${step.floor} 層` 
                                    : `第 ${step.floor} 层`}
                                </text>
                              )}
                            </g>
                          )}
                        </g>
                      )}
                    </g>
                  );
                })}
              </svg>
            </div>
          ) : (
            <div className="simple-path-map">
              {pathData.path.map((step, index) => (
                <div key={index} className="path-step">
                  <div className="step-marker">
                    {index === 0 && <span className="marker-icon">📍</span>}
                    {index === pathData.path.length - 1 && <span className="marker-icon">🎯</span>}
                    {index > 0 && index < pathData.path.length - 1 && (
                      <span className="marker-icon">•</span>
                    )}
                  </div>
                  <div className="step-info">
                    <div className="step-name">{step.name}</div>
                    {step.nextDirection && (
                      <div className="step-direction">
                        {getDirectionText(step.nextDirection, step.isFloorChange)}
                      </div>
                    )}
                    {step.isFloorChange && (
                      <div className="floor-change">
                        {language === 'en' 
                          ? `Floor ${step.floor}` 
                          : language === 'zh-HK' 
                          ? `第 ${step.floor} 層` 
                          : `第 ${step.floor} 层`}
                      </div>
                    )}
                  </div>
                  {index < pathData.path.length - 1 && (
                    <div className="step-connector">
                      <div className="connector-line"></div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="path-instructions">
          <h4>
            {language === 'en' 
              ? 'Step-by-step Instructions' 
              : language === 'zh-HK' 
              ? '逐步指引' 
              : '逐步指引'}
          </h4>
          <ol className="instructions-list">
            {pathData.path.slice(0, -1).map((step, index) => (
              <li key={index}>
                {step.nextDirection && (
                  <>
                    {getDirectionText(step.nextDirection, step.isFloorChange)} {step.isFloorChange && `(${language === 'en' ? 'Floor' : language === 'zh-HK' ? '樓層' : '楼层'} ${pathData.path[index + 1].floor})`}
                    {' '}
                    {language === 'en' ? 'to' : language === 'zh-HK' ? '前往' : '前往'} {pathData.path[index + 1].name}
                  </>
                )}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
};

export default PathMap;

