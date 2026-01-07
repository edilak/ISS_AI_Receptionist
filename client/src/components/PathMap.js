import React, { useState, useEffect, useRef } from 'react';
import './PathMap.css';
import axios from 'axios';
import { getImageScaleFactors, transformPixelToSVG, calculateViewBox } from '../utils/coordinateTransform';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const PathMap = ({ pathData, onClose, language }) => {
  const [floorPlanData, setFloorPlanData] = useState(null);
  const [currentFloorImage, setCurrentFloorImage] = useState(null);
  const [selectedFloor, setSelectedFloor] = useState(null); // Floor selected by user
  const [hoveredNode, setHoveredNode] = useState(null);
  const [pathAnimationProgress, setPathAnimationProgress] = useState(0);
  const [imageScaleFactors, setImageScaleFactors] = useState(null);
  const [svgViewBox, setSvgViewBox] = useState('0 0 1200 900');
  const imageRef = useRef(null);

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

      // Get the starting floor - handle both old and new data structures
      const startFloor = pathData?.from?.floor ?? pathData?.path?.[0]?.floor ?? 1;
      console.log('PathMap: Starting floor:', startFloor);
      const floorInfo = response.data.floors.find(f => f.floor === startFloor);
      if (floorInfo) {
        console.log('PathMap: Found floor plan image:', floorInfo.image.url);
        setCurrentFloorImage(floorInfo.image.url);
      } else {
        // Fallback to floor 1 if specific floor not found
        const fallbackFloor = response.data.floors.find(f => f.floor === 1) || response.data.floors[0];
        if (fallbackFloor) {
          console.log('PathMap: Using fallback floor plan:', fallbackFloor.image.url);
          setCurrentFloorImage(fallbackFloor.image.url);
        } else {
          console.warn('PathMap: No floor plan found');
        }
      }
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
  // Now handles anchor-aware waypoints which include exit/entry anchors
  const createPathPoints = (start, end, waypoints = []) => {
    // If waypoints include anchors (isAnchor flag), they already have start/end points
    const hasAnchors = waypoints.length > 0 && waypoints.some(wp => wp.isAnchor);

    if (hasAnchors) {
      // Anchor-aware waypoints: [exitAnchor, ...corridorWaypoints, entryAnchor]
      // Use the anchors as start/end points instead of node centers
      return waypoints.map(wp => ({
        x: wp.pixelX,
        y: wp.pixelY,
        isAnchor: wp.isAnchor
      }));
    }

    // Legacy waypoints: just corridor points, need start/end
    const points = [start];

    // Add waypoints
    waypoints.forEach(wp => {
      points.push({ x: wp.pixelX, y: wp.pixelY });
    });

    // Add end point
    points.push(end);

    return points;
  };

  // Generate smooth SVG path string using Bezier curves
  const generatePathString = (points, smooth = false) => {
    if (points.length === 0) return '';
    if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
    if (points.length === 2) {
      return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
    }

    if (!smooth) {
      // Legacy straight lines
      return points.map((point, index) =>
        index === 0 ? `M ${point.x} ${point.y}` : `L ${point.x} ${point.y}`
      ).join(' ');
    }

    // Generate smooth Bezier curve through all points
    let path = `M ${points[0].x} ${points[0].y}`;

    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[Math.max(0, i - 1)];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[Math.min(points.length - 1, i + 2)];

      // Catmull-Rom to Bezier conversion for smooth curves
      const tension = 0.3;

      // Control point 1
      const cp1x = p1.x + (p2.x - p0.x) * tension;
      const cp1y = p1.y + (p2.y - p0.y) * tension;

      // Control point 2
      const cp2x = p2.x - (p3.x - p1.x) * tension;
      const cp2y = p2.y - (p3.y - p1.y) * tension;

      // Add cubic Bezier curve
      path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
    }

    return path;
  };

  // Calculate path length for animation
  const calculatePathLength = (points) => {
    let length = 0;
    for (let i = 1; i < points.length; i++) {
      const dx = points[i].x - points[i - 1].x;
      const dy = points[i].y - points[i - 1].y;
      length += Math.sqrt(dx * dx + dy * dy);
    }
    return length;
  };

  // Render space navigation path (from RL system)
  const renderSpaceNavPath = () => {
    if (!isSpaceNavPath) return null;

    const svgPath = pathData.visualization?.svgPath || pathData.path?.svgPath;
    const arrows = pathData.visualization?.arrows || [];
    const animation = pathData.visualization?.animation || {};
    const destination = pathData.destination || {};

    // Get start position from smoothPath or first point
    const smoothPath = pathData.path?.smoothPath || [];
    const startPoint = smoothPath[0] || { x: 0, y: 0 };
    const endPoint = smoothPath[smoothPath.length - 1] || destination;

    const pathLength = animation.totalLength || 1000;
    const animatedDashOffset = pathLength * (1 - pathAnimationProgress / 100);

    return (
      <g className="space-nav-path">
        {/* Background glow path */}
        <path
          d={svgPath}
          stroke="#00c896"
          strokeWidth="10"
          strokeOpacity="0.2"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Main animated path */}
        <path
          d={svgPath}
          stroke="url(#spaceNavGradient)"
          strokeWidth="6"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={pathLength}
          strokeDashoffset={animatedDashOffset}
          filter="url(#spaceNavGlow)"
          className="space-nav-line"
          style={{ transition: 'stroke-dashoffset 0.1s linear' }}
        />

        {/* Direction arrows along path - sparse and subtle */}
        {/* Direction arrows along path */}
        {arrows.map((arrow, idx) => (
          <g
            key={`arrow-${idx}`}
            transform={`translate(${arrow.x}, ${arrow.y}) rotate(${arrow.rotation})`}
          >
            <path
              d={arrow.path || 'M -6 -4 L 0 0 L -6 4 Z'} // Standard arrow size
              fill="#00c896"
              stroke="white"
              strokeWidth="0.5"
              opacity="1"
            />
          </g>
        ))}

        {/* Start marker */}
        <g className="start-marker">
          <circle
            cx={startPoint.x}
            cy={startPoint.y}
            r="20"
            fill="#4CAF50"
            opacity="0.3"
          />
          <circle
            cx={startPoint.x}
            cy={startPoint.y}
            r="14"
            fill="#4CAF50"
            stroke="white"
            strokeWidth="3"
          />
          <text
            x={startPoint.x}
            y={startPoint.y + 5}
            textAnchor="middle"
            fill="white"
            fontSize="12"
            fontWeight="bold"
          >
            S
          </text>
        </g>

        {/* End marker */}
        {pathAnimationProgress >= 80 && (
          <g
            className="end-marker"
            opacity={(pathAnimationProgress - 80) / 20}
          >
            <circle
              cx={endPoint.pixelX || endPoint.x}
              cy={endPoint.pixelY || endPoint.y}
              r="22"
              fill="#F44336"
              opacity="0.3"
            >
              <animate
                attributeName="r"
                values="22;28;22"
                dur="1.5s"
                repeatCount="indefinite"
              />
            </circle>
            <circle
              cx={endPoint.pixelX || endPoint.x}
              cy={endPoint.pixelY || endPoint.y}
              r="16"
              fill="#F44336"
              stroke="white"
              strokeWidth="3"
            />
            <text
              x={endPoint.pixelX || endPoint.x}
              y={(endPoint.pixelY || endPoint.y) + 5}
              textAnchor="middle"
              fill="white"
              fontSize="12"
              fontWeight="bold"
            >
              E
            </text>
            {/* Destination label */}
            <text
              x={endPoint.pixelX || endPoint.x}
              y={(endPoint.pixelY || endPoint.y) - 30}
              textAnchor="middle"
              fill="white"
              fontSize="14"
              fontWeight="600"
              className="destination-label"
            >
              {destination.name || ''}
            </text>
          </g>
        )}
      </g>
    );
  };

  // Update floor image - show destination floor (or most common floor in path)
  useEffect(() => {
    if (pathData && pathData.path && Array.isArray(pathData.path) && pathData.path.length > 0 && floorPlanData) {
      // Handle both old and new data structures - with safe access
      const destinationFloor = pathData?.to?.floor ?? pathData?.destination?.floor ?? pathData?.path?.[pathData.path.length - 1]?.floor ?? 1;
      const startFloor = pathData?.from?.floor ?? pathData?.path?.[0]?.floor ?? 1;

      // Count floors in path to see which floor has most steps
      const floorCounts = {};
      pathData.path.forEach(step => {
        const stepFloor = step.floor ?? 1;
        floorCounts[stepFloor] = (floorCounts[stepFloor] || 0) + 1;
      });

      // Choose floor: destination if path ends there, otherwise most common floor
      let displayFloor = destinationFloor;
      if (floorCounts[startFloor] > (floorCounts[destinationFloor] || 0) && pathData.path.length > 2) {
        displayFloor = startFloor;
      }

      console.log('PathMap: Display floor:', displayFloor, '(Destination:', destinationFloor, ', Start:', startFloor, ')');
      const floorInfo = floorPlanData.floors.find(f => f.floor === displayFloor);
      if (floorInfo) {
        console.log('PathMap: Found floor plan image:', floorInfo.image.url);
        setCurrentFloorImage(floorInfo.image.url);
      } else {
        // Fallback to floor 1 or first available floor
        const fallbackFloor = floorPlanData.floors.find(f => f.floor === 1) || floorPlanData.floors[0];
        if (fallbackFloor) {
          console.log('PathMap: Using fallback floor:', fallbackFloor.image.url);
          setCurrentFloorImage(fallbackFloor.image.url);
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
  const floorsInPath = pathData && pathData.path ?
    [...new Set(pathData.path.map(step => step.floor).filter(f => f !== undefined && f !== null))].sort((a, b) => a - b) :
    [];

  // Get current display floor
  const getDisplayFloor = () => {
    if (selectedFloor !== null) return selectedFloor;
    if (pathData && pathData.to && pathData.to.floor !== undefined) return pathData.to.floor;
    if (floorsInPath.length > 0) return floorsInPath[0];
    return null;
  };

  const displayFloor = getDisplayFloor();

  // Filter path segments to show only those on the current floor
  const getPathSegmentsForFloor = (floor) => {
    if (!pathData || !pathData.path) return [];
    const segments = [];
    for (let i = 0; i < pathData.path.length - 1; i++) {
      const step = pathData.path[i];
      const nextStep = pathData.path[i + 1];
      // Include segment if either node is on this floor, or if it's a floor change segment
      if (step.floor === floor || nextStep.floor === floor ||
        (step.isFloorChange && (step.floor === floor || nextStep.floor === floor))) {
        segments.push({ from: step, to: nextStep, index: i });
      }
    }
    return segments;
  };

  const pathSegments = displayFloor !== null ? getPathSegmentsForFloor(displayFloor) : [];

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
        {floorsInPath.length > 1 && (
          <div className="floor-selector" style={{ marginRight: '10px' }}>
            <label style={{ marginRight: '8px', color: '#fff', fontSize: '14px' }}>
              {language === 'en' ? 'Floor:' : language === 'zh-HK' ? '樓層:' : '楼层:'}
            </label>
            <select
              value={displayFloor !== null ? displayFloor : ''}
              onChange={(e) => setSelectedFloor(parseInt(e.target.value))}
              style={{
                padding: '6px 12px',
                borderRadius: '5px',
                border: '1px solid #444',
                background: '#2a2a2a',
                color: '#fff',
                fontSize: '14px',
                cursor: 'pointer'
              }}
            >
              {floorsInPath.map(floor => {
                const floorInfo = floorPlanData?.floors?.find(f => f.floor === floor);
                const floorName = floorInfo?.name || (floor === 0 ? 'G/F' : `${floor}/F`);
                return (
                  <option key={floor} value={floor}>
                    {floorName}
                  </option>
                );
              })}
            </select>
          </div>
        )}
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

                  {/* Gradient for space nav path */}
                  <linearGradient id="spaceNavGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#00c896" stopOpacity="0.9" />
                    <stop offset="50%" stopColor="#00e5a0" stopOpacity="1" />
                    <stop offset="100%" stopColor="#00c896" stopOpacity="0.9" />
                  </linearGradient>

                  {/* Glow filter for path */}
                  <filter id="glow">
                    <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                    <feMerge>
                      <feMergeNode in="coloredBlur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>

                  {/* Glow filter for space nav path */}
                  <filter id="spaceNavGlow">
                    <feGaussianBlur stdDeviation="4" result="coloredBlur" />
                    <feMerge>
                      <feMergeNode in="coloredBlur" />
                      <feMergeNode in="SourceGraphic" />
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

                {/* Space navigation path (from RL system) */}
                {isSpaceNavPath && renderSpaceNavPath()}

                {/* Path lines with animation - only show segments on current display floor */}
                {!isSpaceNavPath && pathData.path.map((step, index) => {
                  // Only render nodes and segments on the current display floor
                  const isOnDisplayFloor = step.floor === displayFloor;
                  if (!isOnDisplayFloor && index < pathData.path.length - 1) {
                    const nextStep = pathData.path[index + 1];
                    // Also check if next step is on display floor (for floor change segments)
                    if (nextStep.floor !== displayFloor) {
                      return null;
                    }
                  }

                  const coords = getNodeCoordinates(step.id, step.floor);
                  if (!coords) {
                    console.warn(`No coordinates found for ${step.id} on floor ${step.floor}`);
                    return null;
                  }

                  const nodeLabel = formatNodeName(step);

                  const isStart = index === 0;
                  const isEnd = index === pathData.path.length - 1;
                  const progress = pathAnimationProgress;
                  const segmentProgress = (index / pathData.path.length) * 100;
                  const shouldShow = segmentProgress <= progress;
                  const opacity = shouldShow ? 1 : 0;

                  return (
                    <g key={`${step.id}-${index}`} opacity={opacity} style={{ transition: 'opacity 0.3s ease' }}>
                      {/* Path line to next node - only if segment is on the display floor */}
                      {index < pathData.path.length - 1 && (() => {
                        const nextStep = pathData.path[index + 1];
                        const nextNodeId = nextStep.id;
                        const nextFloorNumber = nextStep.floor;

                        // Only show segment if it's on the display floor
                        // (either both nodes are on display floor, or it's a floor change to/from display floor)
                        const segmentOnDisplayFloor =
                          (step.floor === displayFloor && nextFloorNumber === displayFloor) ||
                          (step.floor === displayFloor && nextStep.isFloorChange) ||
                          (nextFloorNumber === displayFloor && step.isFloorChange);

                        if (!segmentOnDisplayFloor) {
                          return null;
                        }

                        if (!nextNodeId || nextFloorNumber === undefined) {
                          return null;
                        }

                        const nextCoords = getNodeCoordinates(nextNodeId, nextFloorNumber);
                        if (!nextCoords) {
                          console.warn(`PathMap: No coordinates for next step ${nextNodeId} on floor ${nextFloorNumber}`);
                          return null;
                        }

                        const isFloorChange = step.isFloorChange || (step.floor !== nextFloorNumber);
                        // Show line if segment is on the display floor
                        // (either both nodes are on display floor, or it's a floor change to/from display floor)
                        const showLine =
                          (step.floor === displayFloor && nextFloorNumber === displayFloor) ||
                          (step.floor === displayFloor && isFloorChange) ||
                          (nextFloorNumber === displayFloor && isFloorChange);

                        if (!showLine) {
                          return null;
                        }

                        // Use waypoints from path data (if provided by backend) or fallback to lookup
                        const waypoints = step.routeWaypoints || getWaypoints(step.id, nextNodeId, step.floor);

                        // Debug logging
                        if (waypoints && waypoints.length > 0) {
                          console.log(`PathMap: Using ${waypoints.length} waypoints for ${step.id} → ${nextNodeId}`);
                        } else {
                          console.warn(`PathMap: No waypoints found for ${step.id} → ${nextNodeId}, using straight line`);
                        }

                        const pathPoints = createPathPoints(coords, nextCoords, waypoints);
                        const pathString = generatePathString(pathPoints);

                        // Use polyline if we have waypoints, otherwise use straight line
                        const usePolyline = waypoints && waypoints.length > 0;

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
                                x={coords.x - Math.max(60, nodeLabel.length * 6)}
                                y={coords.y - 40}
                                width={Math.max(120, nodeLabel.length * 12)}
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
                                {nodeLabel}
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
                    <div className="step-name">{formatNodeName(step)}</div>
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

