import React, { useState, useRef, useEffect, useCallback } from 'react';
import './SpaceEditor.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || '/api';

// **NEW: Point-in-polygon test**
const isPointInPolygon = (x, y, polygon) => {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0], yi = polygon[i][1];
    const xj = polygon[j][0], yj = polygon[j][1];

    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
};

// **NEW: Check if two corridors touch or overlap**
const corridorsTouchOrOverlap = (corridor1, corridor2, threshold = 5) => {
  // Check if any point from corridor1 is very close to any point from corridor2
  for (const p1 of corridor1.polygon) {
    for (const p2 of corridor2.polygon) {
      const dx = p1[0] - p2[0];
      const dy = p1[1] - p2[1];
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance <= threshold) {
        return true;
      }
    }
  }

  // Check if polygons overlap (point-in-polygon test)
  for (const point of corridor1.polygon) {
    if (isPointInPolygon(point[0], point[1], corridor2.polygon)) {
      return true;
    }
  }

  for (const point of corridor2.polygon) {
    if (isPointInPolygon(point[0], point[1], corridor1.polygon)) {
      return true;
    }
  }

  return false;
};

const SpaceEditor = ({ onClose, onSave }) => {
  // Floor selection state
  const [currentFloor, setCurrentFloor] = useState(1);
  const [availableFloors, setAvailableFloors] = useState([]);
  const [floorPlanData, setFloorPlanData] = useState(null);
  const [currentFloorImage, setCurrentFloorImage] = useState(null);
  const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 });
  const imageRef = useRef(null);

  // Editor mode state
  const [editorMode, setEditorMode] = useState('polygon'); // 'polygon', 'destination', 'select'

  // Polygon (corridor) state
  const [corridors, setCorridors] = useState([]);
  const [currentPolygon, setCurrentPolygon] = useState([]); // Points being drawn
  const [selectedCorridorId, setSelectedCorridorId] = useState(null);
  const [corridorNameInput, setCorridorNameInput] = useState('');

  // Destination state
  const [destinations, setDestinations] = useState([]);
  const [selectedDestinationId, setSelectedDestinationId] = useState(null);
  const [destinationNameInput, setDestinationNameInput] = useState('');
  const [destinationZoneInput, setDestinationZoneInput] = useState('');
  const [destinationFacingInput, setDestinationFacingInput] = useState('south');

  // Dragging state
  const [isDragging, setIsDragging] = useState(false);
  const [dragType, setDragType] = useState(null); // 'polygon-point', 'destination'
  const [dragIndex, setDragIndex] = useState(null);
  const [dragCorridorId, setDragCorridorId] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // Grid settings
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [gridSize, setGridSize] = useState(5); // pixels - smaller default for better precision
  const [autoGridSize, setAutoGridSize] = useState(true); // Auto-calculate based on image
  const [showGrid, setShowGrid] = useState(true);

  // Training state
  const [isTraining, setIsTraining] = useState(false);
  const [trainingProgress, setTrainingProgress] = useState(0);

  // Mouse position for preview
  const [mousePosition, setMousePosition] = useState(null);
  const [hoveredEdge, setHoveredEdge] = useState(null); // {corridorId, edgeIndex}

  // Load floor plan data on mount
  useEffect(() => {
    const loadFloorPlanData = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/pathfinder/floor-plans`);
        const data = await response.json();
        setFloorPlanData(data);

        const floors = data.floors.map(f => ({
          floor: f.floor,
          name: f.name || `Floor ${f.floor}`
        })).sort((a, b) => a.floor - b.floor);
        setAvailableFloors(floors);

        // Load current floor
        loadFloorData(data, currentFloor);

        // Load existing space definitions
        await loadSpaceDefinitions();
      } catch (error) {
        console.error('Error loading floor plan data:', error);
      }
    };

    loadFloorPlanData();
  }, []);

  // Load space definitions
  const loadSpaceDefinitions = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/space-nav/definitions`);
      if (response.ok) {
        const data = await response.json();
        if (data.corridors) setCorridors(data.corridors);
        if (data.destinations) setDestinations(data.destinations);
      }
    } catch (error) {
      console.log('No existing space definitions found');
    }
  };

  // Load floor data
  const loadFloorData = (data, floorNum) => {
    if (!data) return;

    const floorInfo = data.floors.find(f => f.floor === floorNum);
    if (floorInfo) {
      setImageDimensions({
        width: floorInfo.image?.naturalWidth || floorInfo.image?.width || 1200,
        height: floorInfo.image?.naturalHeight || floorInfo.image?.height || 900
      });

      if (floorInfo.image?.url) {
        setCurrentFloorImage(floorInfo.image.url);
      }
    }
  };

  // Reload floor data when floor changes
  useEffect(() => {
    if (floorPlanData) {
      loadFloorData(floorPlanData, currentFloor);
    }
  }, [currentFloor, floorPlanData]);

  // Handle image load
  const handleImageLoad = () => {
    if (imageRef.current) {
      const width = imageRef.current.naturalWidth;
      const height = imageRef.current.naturalHeight;
      setImageDimensions({ width, height });

      // Auto-calculate grid size based on image dimensions
      if (autoGridSize) {
        // Use approximately 1/200th of image width for finer grid, rounded to nearest 5
        // This gives smaller grid cells for better precision
        const calculatedSize = Math.max(1, Math.round((width / 200) / 5) * 5);
        setGridSize(calculatedSize);
      }
    }
  };

  // Snap coordinate to grid
  const snapToGridCoord = useCallback((coord) => {
    if (!snapToGrid) return coord;
    return Math.round(coord / gridSize) * gridSize;
  }, [snapToGrid, gridSize]);

  // **NEW: Find nearby corridor points to snap to (auto-connection)**
  const findNearbyCorridorPoint = useCallback((x, y, snapDistance = 30) => {
    const floorCorridors = corridors.filter(c => c.floor === currentFloor);

    for (const corridor of floorCorridors) {
      for (const point of corridor.polygon) {
        const dx = point[0] - x;
        const dy = point[1] - y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < snapDistance) {
          return { x: point[0], y: point[1], corridorId: corridor.id };
        }
      }
    }
    return null;
  }, [corridors, currentFloor]);

  // **NEW: Check if all corridors are connected**
  const checkCorridorsConnected = useCallback(() => {
    const floorCorridors = corridors.filter(c => c.floor === currentFloor);
    if (floorCorridors.length <= 1) return { connected: true, isolated: [] };

    // Build connectivity graph
    const adjacencyMap = new Map();
    floorCorridors.forEach(c => adjacencyMap.set(c.id, new Set()));

    // Check which corridors touch (share points or are very close)
    for (let i = 0; i < floorCorridors.length; i++) {
      for (let j = i + 1; j < floorCorridors.length; j++) {
        if (corridorsTouchOrOverlap(floorCorridors[i], floorCorridors[j])) {
          adjacencyMap.get(floorCorridors[i].id).add(floorCorridors[j].id);
          adjacencyMap.get(floorCorridors[j].id).add(floorCorridors[i].id);
        }
      }
    }

    // BFS to find connected component
    const visited = new Set();
    const queue = [floorCorridors[0].id];
    visited.add(floorCorridors[0].id);

    while (queue.length > 0) {
      const currentId = queue.shift();
      const neighbors = adjacencyMap.get(currentId);

      for (const neighborId of neighbors) {
        if (!visited.has(neighborId)) {
          visited.add(neighborId);
          queue.push(neighborId);
        }
      }
    }

    // Find isolated corridors
    const isolated = floorCorridors
      .filter(c => !visited.has(c.id))
      .map(c => c.name || c.id);

    return {
      connected: isolated.length === 0,
      isolated,
      connectedCount: visited.size,
      totalCount: floorCorridors.length
    };
  }, [corridors, currentFloor]);

  // **OPTIMIZATION: Memoize connectivity check to prevent re-calculation on every render**
  const connectivityStatus = React.useMemo(() => checkCorridorsConnected(), [checkCorridorsConnected]);


  const handleMouseUp = (e) => {
    // Handle dragging
    if (isDragging) {
      setIsDragging(false);
      setDragType(null);
      setDragIndex(null);
      setDragCorridorId(null);
    }
  };

  // Helper: Get consistent SVG coordinates with snap-to-grid
  const getSVGCoordinates = (event) => {
    const svgElement = event.currentTarget?.tagName === 'svg' ? event.currentTarget :
      event.target?.closest('svg');

    if (!svgElement || !imageRef.current) return null;

    const svgRect = svgElement.getBoundingClientRect();
    const viewBoxWidth = imageDimensions.width;
    const viewBoxHeight = imageDimensions.height;

    // Calculate aspect ratios
    const svgAspect = viewBoxWidth / viewBoxHeight;
    const displayAspect = svgRect.width / svgRect.height;

    let displayedWidth, displayedHeight, offsetX, offsetY;

    if (svgAspect > displayAspect) {
      displayedWidth = svgRect.width;
      displayedHeight = svgRect.width / svgAspect;
      offsetX = 0;
      offsetY = (svgRect.height - displayedHeight) / 2;
    } else {
      displayedWidth = svgRect.height * svgAspect;
      displayedHeight = svgRect.height;
      offsetX = (svgRect.width - displayedWidth) / 2;
      offsetY = 0;
    }

    const mouseX = event.clientX - svgRect.left;
    const mouseY = event.clientY - svgRect.top;

    // Relative to the displayed image area
    const relativeX = mouseX - offsetX;
    const relativeY = mouseY - offsetY;

    // Check bounds
    if (relativeX < 0 || relativeX > displayedWidth ||
      relativeY < 0 || relativeY > displayedHeight) {
      return null;
    }

    // Scale to viewBox
    const scaleX = viewBoxWidth / displayedWidth;
    const scaleY = viewBoxHeight / displayedHeight;

    let x = relativeX * scaleX;
    let y = relativeY * scaleY;

    // Clamp
    x = Math.max(0, Math.min(x, viewBoxWidth));
    y = Math.max(0, Math.min(y, viewBoxHeight));

    // Snap
    return {
      x: snapToGridCoord(x),
      y: snapToGridCoord(y)
    };
  };

  // Handle mouse move - THROTTLED to reduce re-renders
  const lastMoveTime = useRef(0);
  const handleMouseMove = (event) => {
    // Throttle to ~60fps (16ms) during non-drag, no throttle during drag for smoothness
    const now = Date.now();
    if (!isDragging && now - lastMoveTime.current < 16) return;
    lastMoveTime.current = now;

    const coords = getSVGCoordinates(event);

    if (coords) {
      // Only update mouse position if significantly changed (reduces re-renders)
      setMousePosition(prev => {
        if (!prev || Math.abs(prev.x - coords.x) > 1 || Math.abs(prev.y - coords.y) > 1) {
          return coords;
        }
        return prev;
      });

      // Edge hover detection - DISABLED during drag for performance
      if (editorMode === 'polygon' && selectedCorridorId && !isDragging) {
        const selectedCorridor = corridors.find(c => c.id === selectedCorridorId);
        if (selectedCorridor) {
          const edgeIndex = findClosestEdge(selectedCorridor.polygon, coords);
          setHoveredEdge(edgeIndex !== null ? { corridorId: selectedCorridorId, edgeIndex } : null);
        } else {
          setHoveredEdge(null);
        }
      }

      // Handle dragging - FIX: coords are already the target, no offset needed here
      // The offset is calculated when drag STARTS to keep point under cursor
      if (isDragging) {
        if (dragType === 'polygon-point' && dragCorridorId !== null && dragIndex !== null) {
          const newX = snapToGridCoord(coords.x - dragOffset.x);
          const newY = snapToGridCoord(coords.y - dragOffset.y);
          setCorridors(prev => prev.map(corridor => {
            if (corridor.id === dragCorridorId) {
              const newPolygon = [...corridor.polygon];
              newPolygon[dragIndex] = [newX, newY];
              return { ...corridor, polygon: newPolygon };
            }
            return corridor;
          }));
        } else if (dragType === 'destination' && selectedDestinationId !== null) {
          const newX = snapToGridCoord(coords.x - dragOffset.x);
          const newY = snapToGridCoord(coords.y - dragOffset.y);
          setDestinations(prev => prev.map(dest => {
            if (dest.id === selectedDestinationId) {
              return { ...dest, x: newX, y: newY };
            }
            return dest;
          }));
        }
      }
    } else {
      setMousePosition(null);
    }
  };

  // Find closest edge on a polygon to insert a point
  const findClosestEdge = (polygon, point) => {
    if (polygon.length < 2) return null;

    let minDist = Infinity;
    let closestIndex = null;

    for (let i = 0; i < polygon.length; i++) {
      const p1 = polygon[i];
      const p2 = polygon[(i + 1) % polygon.length];

      // Calculate distance from point to line segment
      const A = point.x - p1[0];
      const B = point.y - p1[1];
      const C = p2[0] - p1[0];
      const D = p2[1] - p1[1];

      const dot = A * C + B * D;
      const lenSq = C * C + D * D;
      let param = lenSq !== 0 ? dot / lenSq : -1;

      let xx, yy;
      if (param < 0) {
        xx = p1[0];
        yy = p1[1];
      } else if (param > 1) {
        xx = p2[0];
        yy = p2[1];
      } else {
        xx = p1[0] + param * C;
        yy = p1[1] + param * D;
      }

      const dx = point.x - xx;
      const dy = point.y - yy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < minDist && dist < 20) { // 20px threshold
        minDist = dist;
        closestIndex = i + 1;
      }
    }

    return closestIndex;
  };

  // Handle image click - use same coordinate calculation as mouse move
  const handleImageClick = (event) => {
    if (isDragging) return;

    const coords = getSVGCoordinates(event);
    if (!coords) return;

    if (editorMode === 'polygon') {
      // Check if clicking on existing polygon edge to add point
      if (selectedCorridorId && event.shiftKey) {
        const selectedCorridor = corridors.find(c => c.id === selectedCorridorId);
        if (selectedCorridor) {
          const edgeIndex = findClosestEdge(selectedCorridor.polygon, coords);
          if (edgeIndex !== null) {
            // Insert point at edge
            setCorridors(prev => prev.map(corridor => {
              if (corridor.id === selectedCorridorId) {
                const newPolygon = [...corridor.polygon];
                newPolygon.splice(edgeIndex, 0, [coords.x, coords.y]);
                return { ...corridor, polygon: newPolygon };
              }
              return corridor;
            }));
            return;
          }
        }
      }

      // **NEW: Auto-snap to nearby corridor points for connection**
      const nearbyPoint = findNearbyCorridorPoint(coords.x, coords.y, 30);
      const finalCoords = nearbyPoint
        ? { x: nearbyPoint.x, y: nearbyPoint.y }
        : coords;

      // Visual feedback for snap
      if (nearbyPoint && currentPolygon.length > 0) {
        console.log(`🔗 Auto-snapping to existing corridor point at (${nearbyPoint.x}, ${nearbyPoint.y})`);
      }

      // Add point to current polygon
      setCurrentPolygon(prev => [...prev, [finalCoords.x, finalCoords.y]]);
    } else if (editorMode === 'destination') {
      // Add new destination
      const newDest = {
        id: `dest_${Date.now()}`,
        name: destinationNameInput || `Exit ${destinations.length + 1}`,
        zone: destinationZoneInput || '',
        floor: currentFloor,
        x: coords.x,
        y: coords.y,
        facing: destinationFacingInput
      };
      setDestinations(prev => [...prev, newDest]);
      setSelectedDestinationId(newDest.id);
    }
  };

  // Handle double click to close polygon
  const handleDoubleClick = () => {
    if (editorMode === 'polygon' && currentPolygon.length >= 3) {
      finishPolygon();
    }
  };

  // Finish current polygon
  const finishPolygon = () => {
    if (currentPolygon.length < 3) {
      alert('A polygon needs at least 3 points');
      return;
    }

    const newCorridor = {
      id: `corridor_${Date.now()}`,
      name: corridorNameInput || `Corridor ${corridors.filter(c => c.floor === currentFloor).length + 1}`,
      floor: currentFloor,
      polygon: currentPolygon,
      type: 'corridor'
    };

    setCorridors(prev => [...prev, newCorridor]);
    setCurrentPolygon([]);
    setCorridorNameInput('');
    setSelectedCorridorId(newCorridor.id);
  };

  // Cancel current polygon
  const cancelPolygon = () => {
    setCurrentPolygon([]);
  };

  // Delete selected corridor
  const deleteSelectedCorridor = () => {
    if (selectedCorridorId) {
      setCorridors(prev => prev.filter(c => c.id !== selectedCorridorId));
      setSelectedCorridorId(null);
    }
  };

  // Delete selected destination
  const deleteSelectedDestination = () => {
    if (selectedDestinationId) {
      setDestinations(prev => prev.filter(d => d.id !== selectedDestinationId));
      setSelectedDestinationId(null);
    }
  };

  // Handle polygon point drag start
  const handlePolygonPointDragStart = (event, corridorId, pointIndex) => {
    event.stopPropagation();
    const coords = getSVGCoordinates(event);
    if (!coords) return;

    const corridor = corridors.find(c => c.id === corridorId);
    if (corridor) {
      const point = corridor.polygon[pointIndex];
      setDragOffset({
        x: point[0] - coords.x,
        y: point[1] - coords.y
      });
    }

    setIsDragging(true);
    setDragType('polygon-point');
    setDragCorridorId(corridorId);
    setDragIndex(pointIndex);
    setSelectedCorridorId(corridorId);
  };

  // Handle destination drag start
  const handleDestinationDragStart = (event, destId) => {
    event.stopPropagation();
    const coords = getSVGCoordinates(event);
    if (!coords) return;

    const dest = destinations.find(d => d.id === destId);
    if (dest) {
      setDragOffset({
        x: dest.x - coords.x,
        y: dest.y - coords.y
      });
    }

    setIsDragging(true);
    setDragType('destination');
    setSelectedDestinationId(destId);
  };


  // Update selected corridor name
  const updateCorridorName = (name) => {
    if (selectedCorridorId) {
      setCorridors(prev => prev.map(c =>
        c.id === selectedCorridorId ? { ...c, name } : c
      ));
    }
  };

  // Update selected destination
  const updateDestination = (field, value) => {
    if (selectedDestinationId) {
      setDestinations(prev => prev.map(d =>
        d.id === selectedDestinationId ? { ...d, [field]: value } : d
      ));
    }
  };

  // Save space definitions
  const handleSave = async () => {
    // **NEW: Validate corridor connectivity before saving**
    const connectivity = checkCorridorsConnected();

    if (!connectivity.connected) {
      const proceed = window.confirm(
        `⚠️ Warning: Not all corridors are connected!\n\n` +
        `Connected: ${connectivity.connectedCount}/${connectivity.totalCount} corridors\n\n` +
        `Isolated corridors:\n${connectivity.isolated.join(', ')}\n\n` +
        `The RL agent will NOT be able to navigate to destinations in isolated corridors.\n\n` +
        `Do you want to save anyway? (Recommended: Cancel and connect corridors first)`
      );

      if (!proceed) {
        return;
      }
    }

    try {
      const response = await fetch(`${API_BASE_URL}/space-nav/definitions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          corridors,
          destinations,
          gridSize
        })
      });

      if (response.ok) {
        const message = connectivity.connected
          ? '✅ Space definitions saved successfully!\n\nAll corridors are connected.'
          : '⚠️ Space definitions saved with warnings.\n\nSome corridors are not connected.';
        alert(message);
        if (onSave) onSave({ corridors, destinations });
      } else {
        throw new Error('Failed to save');
      }
    } catch (error) {
      console.error('Error saving space definitions:', error);
      alert('Failed to save space definitions');
    }
  };

  // Trigger pre-training
  const handleTrain = async () => {
    setIsTraining(true);
    setTrainingProgress(0);

    try {

      // Save first
      await handleSave();

      // Start training with progress updates
      const response = await fetch(`${API_BASE_URL}/space-nav/train`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gridSize })
      });

      if (response.ok) {
        const data = await response.json();
        if (!data.success) {
          alert(`Training failed: ${data.error || 'Unknown error'}`);
          setIsTraining(false);
          return;
        }

        // Poll for progress
        const pollProgress = setInterval(async () => {
          try {
            const progressRes = await fetch(`${API_BASE_URL}/space-nav/training-progress`);
            if (!progressRes.ok) {
              console.error('Failed to get training progress');
              return;
            }

            const { progress, complete, isTraining } = await progressRes.json();
            setTrainingProgress(progress || 0);

            if (complete || !isTraining) {
              clearInterval(pollProgress);
              setIsTraining(false);
              if (progress >= 100) {
                alert('Training complete! The RL agent is ready.');
              }
            }
          } catch (error) {
            console.error('Error polling training progress:', error);
          }
        }, 300); // Poll more frequently
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        alert(`Training failed: ${errorData.error || 'Unknown error'}`);
        setIsTraining(false);
      }
    } catch (error) {
      console.error('Training error:', error);
      setIsTraining(false);
      alert('Training failed');
    }
  };

  // Render grid overlay using SVG Pattern (Performance Optimization)
  const renderGridDefs = () => {
    if (!showGrid) return null;
    return (
      <defs>
        <pattern id="gridPattern" width={gridSize} height={gridSize} patternUnits="userSpaceOnUse">
          <path d={`M ${gridSize} 0 L 0 0 0 ${gridSize}`} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="0.5" />
        </pattern>
      </defs>
    );
  };

  const renderGrid = () => {
    if (!showGrid || !imageDimensions.width) return null;
    return (
      <rect width="100%" height="100%" fill="url(#gridPattern)" style={{ pointerEvents: 'none' }} />
    );
  };

  // Render corridors for current floor
  const renderCorridors = () => {
    const floorCorridors = corridors.filter(c => c.floor === currentFloor);

    return floorCorridors.map(corridor => {
      const isSelected = corridor.id === selectedCorridorId;
      const points = corridor.polygon.map(p => p.join(',')).join(' ');

      return (
        <g key={corridor.id} className={`corridor-group ${isSelected ? 'selected' : ''}`}>
          <polygon
            points={points}
            fill={isSelected ? 'rgba(0, 200, 150, 0.3)' : 'rgba(0, 150, 255, 0.2)'}
            stroke={isSelected ? '#00c896' : '#0096ff'}
            strokeWidth="2"
            onClick={(e) => {
              e.stopPropagation();
              setSelectedCorridorId(corridor.id);
            }}
            style={{ cursor: 'pointer' }}
          />

          {/* Render edges with hover effect for insertion */}
          {isSelected && corridor.polygon.map((point, idx) => {
            const nextPoint = corridor.polygon[(idx + 1) % corridor.polygon.length];
            const isHovered = hoveredEdge?.corridorId === corridor.id && hoveredEdge?.edgeIndex === idx + 1;

            return (
              <line
                key={`${corridor.id}-edge-${idx}`}
                x1={point[0]}
                y1={point[1]}
                x2={nextPoint[0]}
                y2={nextPoint[1]}
                stroke={isHovered ? '#ffcc00' : 'transparent'}
                strokeWidth="4"
                strokeDasharray={isHovered ? "4,4" : "none"}
                style={{ cursor: 'pointer', pointerEvents: 'stroke' }}
              />
            );
          })}

          {/* Render draggable points */}
          {corridor.polygon.map((point, idx) => (
            <circle
              key={`${corridor.id}-point-${idx}`}
              cx={point[0]}
              cy={point[1]}
              r={isSelected ? 8 : 5}
              fill={isSelected ? '#00c896' : '#0096ff'}
              stroke="white"
              strokeWidth="2"
              style={{ cursor: 'grab' }}
              onMouseDown={(e) => handlePolygonPointDragStart(e, corridor.id, idx)}
            />
          ))}

          {/* Corridor label */}
          <text
            x={corridor.polygon.reduce((sum, p) => sum + p[0], 0) / corridor.polygon.length}
            y={corridor.polygon.reduce((sum, p) => sum + p[1], 0) / corridor.polygon.length}
            fill="white"
            fontSize="14"
            textAnchor="middle"
            style={{ pointerEvents: 'none' }}
          >
            {corridor.name}
          </text>
        </g>
      );
    });
  };

  // Render current polygon being drawn
  const renderCurrentPolygon = () => {
    if (currentPolygon.length === 0) return null;

    const points = currentPolygon.map(p => p.join(',')).join(' ');

    // **NEW: Check if mouse is near a corridor point for snapping**
    const nearbyPoint = mousePosition ? findNearbyCorridorPoint(mousePosition.x, mousePosition.y, 30) : null;

    return (
      <g className="current-polygon">
        <polyline
          points={points + (mousePosition ? `,${mousePosition.x},${mousePosition.y}` : '')}
          fill="none"
          stroke="#ffcc00"
          strokeWidth="2"
          strokeDasharray="5,5"
        />
        {currentPolygon.length >= 3 && (
          <line
            x1={mousePosition?.x || currentPolygon[currentPolygon.length - 1][0]}
            y1={mousePosition?.y || currentPolygon[currentPolygon.length - 1][1]}
            x2={currentPolygon[0][0]}
            y2={currentPolygon[0][1]}
            stroke="#ffcc00"
            strokeWidth="1"
            strokeDasharray="3,3"
            opacity="0.5"
          />
        )}
        {currentPolygon.map((point, idx) => (
          <circle
            key={`current-${idx}`}
            cx={point[0]}
            cy={point[1]}
            r={6}
            fill="#ffcc00"
            stroke="white"
            strokeWidth="2"
          />
        ))}
        {/* **NEW: Visual snap indicator** */}
        {nearbyPoint && mousePosition && (
          <g className="snap-indicator">
            <circle
              cx={nearbyPoint.x}
              cy={nearbyPoint.y}
              r={20}
              fill="none"
              stroke="#00ff00"
              strokeWidth="2"
              strokeDasharray="4,4"
            >
              <animate attributeName="r" values="15;25;15" dur="1s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="1;0.3;1" dur="1s" repeatCount="indefinite" />
            </circle>
            <line
              x1={mousePosition.x}
              y1={mousePosition.y}
              x2={nearbyPoint.x}
              y2={nearbyPoint.y}
              stroke="#00ff00"
              strokeWidth="1"
              strokeDasharray="2,2"
              opacity="0.6"
            />
            <circle
              cx={nearbyPoint.x}
              cy={nearbyPoint.y}
              r={6}
              fill="#00ff00"
              stroke="white"
              strokeWidth="2"
            />
          </g>
        )}
      </g>
    );
  };

  // Render destinations for current floor
  const renderDestinations = () => {
    const floorDestinations = destinations.filter(d => d.floor === currentFloor);

    return floorDestinations.map(dest => {
      const isSelected = dest.id === selectedDestinationId;

      // Direction arrow based on facing
      const arrowRotation = {
        north: 270,
        south: 90,
        east: 0,
        west: 180
      }[dest.facing] || 0;

      return (
        <g
          key={dest.id}
          className={`destination-group ${isSelected ? 'selected' : ''}`}
          transform={`translate(${dest.x}, ${dest.y})`}
        >
          {/* Destination marker */}
          <circle
            r={isSelected ? 10 : 8}
            fill={isSelected ? '#ff4444' : '#ff6b6b'}
            stroke="white"
            strokeWidth="3"
            style={{ cursor: 'grab' }}
            onMouseDown={(e) => handleDestinationDragStart(e, dest.id)}
            onClick={(e) => {
              e.stopPropagation();
              setSelectedDestinationId(dest.id);
            }}
          />
          {/* Direction arrow */}
          <g transform={`rotate(${arrowRotation})`}>
            <path
              d="M 0,-6 L 8,0 L 0,6 Z"
              fill="white"
              style={{ pointerEvents: 'none' }}
            />
          </g>
          {/* Label */}
          <text
            y={-20}
            fill="white"
            fontSize="12"
            textAnchor="middle"
            style={{ pointerEvents: 'none' }}
          >
            {dest.name}
          </text>
          {dest.zone && (
            <text
              y={-35}
              fill="#ffcc00"
              fontSize="10"
              textAnchor="middle"
              style={{ pointerEvents: 'none' }}
            >
              [{dest.zone}]
            </text>
          )}
        </g>
      );
    });
  };

  // Get selected corridor
  const selectedCorridor = corridors.find(c => c.id === selectedCorridorId);
  const selectedDestination = destinations.find(d => d.id === selectedDestinationId);

  return (
    <div className="space-editor" onMouseUp={handleMouseUp}>
      {/* Header */}
      <div className="editor-header">
        <div className="header-left">
          <h2>🗺️ Space Navigation Editor</h2>
          <div className="floor-selector">
            <label>Floor:</label>
            <select
              value={currentFloor}
              onChange={(e) => setCurrentFloor(parseInt(e.target.value))}
            >
              {availableFloors.map(f => (
                <option key={f.floor} value={f.floor}>
                  {f.floor === 0 ? 'G/F' : `${f.floor}/F`} - {f.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="header-actions">
          <button
            className="btn-check-connectivity"
            onClick={() => {
              const connectivity = checkCorridorsConnected();
              if (connectivity.connected) {
                alert(`✅ All corridors are connected!\n\n${connectivity.totalCount} corridor(s) form a connected network.`);
              } else {
                alert(
                  `⚠️ Warning: Disconnected corridors detected!\n\n` +
                  `Connected: ${connectivity.connectedCount}/${connectivity.totalCount}\n\n` +
                  `Isolated corridors:\n${connectivity.isolated.join('\n')}\n\n` +
                  `Please connect these corridors or the RL agent won't be able to navigate to destinations in them.`
                );
              }
            }}
            disabled={corridors.length <= 1}
            style={{
              background: corridors.length > 1 ? (connectivityStatus.connected ? '#4CAF50' : '#ff9800') : '#666',
              color: 'white',
              padding: '8px 16px',
              borderRadius: '5px',
              border: 'none',
              cursor: corridors.length > 1 ? 'pointer' : 'not-allowed',
              fontSize: '14px',
              fontWeight: '500'
            }}
          >
            {corridors.length > 1 ? (connectivityStatus.connected ? '✓ Corridors Connected' : '⚠️ Check Connectivity') : '🔗 Connectivity'}
          </button>
          <button
            className={`btn-train ${isTraining ? 'training' : ''}`}
            onClick={handleTrain}
            disabled={isTraining || corridors.length === 0}
          >
            {isTraining ? `Training... ${trainingProgress}%` : '🧠 Train RL Agent'}
          </button>
          <button className="btn-save" onClick={handleSave}>
            💾 Save
          </button>
          <button className="btn-close" onClick={onClose}>
            ✕ Close
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="editor-content">
        {/* Left panel - Tools */}
        <div className="tools-panel">
          {/* Mode selection */}
          <div className="tool-section">
            <h3>Editor Mode</h3>
            <div className="mode-buttons">
              <button
                className={`mode-btn ${editorMode === 'polygon' ? 'active' : ''}`}
                onClick={() => setEditorMode('polygon')}
              >
                🔷 Draw Corridor
              </button>
              <button
                className={`mode-btn ${editorMode === 'destination' ? 'active' : ''}`}
                onClick={() => setEditorMode('destination')}
              >
                📍 Place Exit
              </button>
              <button
                className={`mode-btn ${editorMode === 'select' ? 'active' : ''}`}
                onClick={() => setEditorMode('select')}
              >
                👆 Select
              </button>
            </div>
          </div>

          {/* Grid settings */}
          <div className="tool-section">
            <h3>Grid Settings</h3>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={showGrid}
                onChange={(e) => setShowGrid(e.target.checked)}
              />
              Show Grid
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={snapToGrid}
                onChange={(e) => setSnapToGrid(e.target.checked)}
              />
              Snap to Grid
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={autoGridSize}
                onChange={(e) => setAutoGridSize(e.target.checked)}
              />
              Auto-calculate Grid Size
            </label>
            <div className="input-group">
              <label>Grid Size (px):</label>
              <input
                type="number"
                value={gridSize}
                onChange={(e) => {
                  setGridSize(parseInt(e.target.value) || 5);
                  setAutoGridSize(false);
                }}
                min="1"
                max="50"
                disabled={autoGridSize}
              />
              {autoGridSize && (
                <span className="help-text" style={{ fontSize: '0.7rem', color: '#6b7280' }}>
                  Auto: {gridSize}px (based on image size)
                </span>
              )}
            </div>
          </div>

          {/* Polygon tools */}
          {editorMode === 'polygon' && (
            <div className="tool-section">
              <h3>Corridor Drawing</h3>
              <div className="input-group">
                <label>Corridor Name:</label>
                <input
                  type="text"
                  value={corridorNameInput}
                  onChange={(e) => setCorridorNameInput(e.target.value)}
                  placeholder="Main Corridor"
                />
              </div>
              <p className="help-text">
                Click to add points. Double-click to close polygon.
                <br />
                <strong>Shift+Click</strong> on existing polygon edge to insert point.
              </p>
              {currentPolygon.length > 0 && (
                <div className="drawing-controls">
                  <span>{currentPolygon.length} points</span>
                  <button
                    className="btn-small btn-finish"
                    onClick={finishPolygon}
                    disabled={currentPolygon.length < 3}
                  >
                    ✓ Finish
                  </button>
                  <button
                    className="btn-small btn-cancel"
                    onClick={cancelPolygon}
                  >
                    ✕ Cancel
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Destination tools */}
          {editorMode === 'destination' && (
            <div className="tool-section">
              <h3>Exit Placement</h3>
              <div className="input-group">
                <label>Exit Name:</label>
                <input
                  type="text"
                  value={destinationNameInput}
                  onChange={(e) => setDestinationNameInput(e.target.value)}
                  placeholder="Zone 01 Exit"
                />
              </div>
              <div className="input-group">
                <label>Zone (group):</label>
                <input
                  type="text"
                  value={destinationZoneInput}
                  onChange={(e) => setDestinationZoneInput(e.target.value)}
                  placeholder="zone_01"
                />
              </div>
              <div className="input-group">
                <label>Exit Facing:</label>
                <select
                  value={destinationFacingInput}
                  onChange={(e) => setDestinationFacingInput(e.target.value)}
                >
                  <option value="north">North ↑</option>
                  <option value="south">South ↓</option>
                  <option value="east">East →</option>
                  <option value="west">West ←</option>
                </select>
              </div>
              <p className="help-text">
                Click on the corridor edge to place an exit.
              </p>
            </div>
          )}

          {/* Selected corridor properties */}
          {selectedCorridor && (
            <div className="tool-section properties">
              <h3>Selected Corridor</h3>
              <div className="input-group">
                <label>Name:</label>
                <input
                  type="text"
                  value={selectedCorridor.name}
                  onChange={(e) => updateCorridorName(e.target.value)}
                />
              </div>
              <p className="info">Points: {selectedCorridor.polygon.length}</p>
              <button
                className="btn-small btn-delete"
                onClick={deleteSelectedCorridor}
              >
                🗑️ Delete Corridor
              </button>
            </div>
          )}

          {/* Selected destination properties */}
          {selectedDestination && (
            <div className="tool-section properties">
              <h3>Selected Exit</h3>
              <div className="input-group">
                <label>Name:</label>
                <input
                  type="text"
                  value={selectedDestination.name}
                  onChange={(e) => updateDestination('name', e.target.value)}
                />
              </div>
              <div className="input-group">
                <label>Zone:</label>
                <input
                  type="text"
                  value={selectedDestination.zone}
                  onChange={(e) => updateDestination('zone', e.target.value)}
                />
              </div>
              <div className="input-group">
                <label>Facing:</label>
                <select
                  value={selectedDestination.facing}
                  onChange={(e) => updateDestination('facing', e.target.value)}
                >
                  <option value="north">North ↑</option>
                  <option value="south">South ↓</option>
                  <option value="east">East →</option>
                  <option value="west">West ←</option>
                </select>
              </div>
              <p className="info">
                Position: ({Math.round(selectedDestination.x)}, {Math.round(selectedDestination.y)})
              </p>
              <button
                className="btn-small btn-delete"
                onClick={deleteSelectedDestination}
              >
                🗑️ Delete Exit
              </button>
            </div>
          )}

          {/* Stats */}
          <div className="tool-section stats">
            <h3>Current Floor Stats</h3>
            <p>Corridors: {corridors.filter(c => c.floor === currentFloor).length}</p>
            <p>Exits: {destinations.filter(d => d.floor === currentFloor).length}</p>
            <p>Total Corridors: {corridors.length}</p>
            <p>Total Exits: {destinations.length}</p>
          </div>

          {/* Instructions */}
          <div className="tool-section instructions">
            <h3>Instructions</h3>
            <ol>
              <li>Draw corridor polygons to define walkable space</li>
              <li>Place exit points at zone entrances</li>
              <li>Group exits by zone name for multiple-exit zones</li>
              <li>Save and train the RL agent</li>
            </ol>
          </div>
        </div>

        {/* Canvas area */}
        <div className="canvas-container">
          {currentFloorImage && (
            <div
              className="canvas-wrapper"
              style={{ position: 'relative' }}
            >
              <img
                ref={imageRef}
                src={currentFloorImage}
                alt={`Floor ${currentFloor} Plan`}
                onLoad={handleImageLoad}
                draggable={false}
              />
              <svg
                className="canvas-overlay"
                viewBox={`0 0 ${imageDimensions.width} ${imageDimensions.height}`}
                preserveAspectRatio="xMidYMid meet"
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  pointerEvents: 'all',
                  cursor: (editorMode === 'polygon' || editorMode === 'destination') ? 'crosshair' : 'default',
                  overflow: 'visible'
                }}
                onClick={handleImageClick}
                onDoubleClick={handleDoubleClick}
              >
                {renderGridDefs()}
                {renderGrid()}
                {renderCorridors()}
                {renderCurrentPolygon()}
                {renderDestinations()}

                {/* Cursor crosshair - only show when not dragging */}
                {mousePosition && editorMode !== 'select' && !isDragging && (
                  <g className="cursor-crosshair" style={{ pointerEvents: 'none' }}>
                    <line
                      x1={mousePosition.x - 15} y1={mousePosition.y}
                      x2={mousePosition.x + 15} y2={mousePosition.y}
                      stroke="rgba(255, 255, 255, 0.9)"
                      strokeWidth="2"
                    />
                    <line
                      x1={mousePosition.x} y1={mousePosition.y - 15}
                      x2={mousePosition.x} y2={mousePosition.y + 15}
                      stroke="rgba(255, 255, 255, 0.9)"
                      strokeWidth="2"
                    />
                    <circle
                      cx={mousePosition.x}
                      cy={mousePosition.y}
                      r="4"
                      fill="white"
                      stroke="rgba(0, 0, 0, 0.7)"
                      strokeWidth="1.5"
                    />
                    <text
                      x={mousePosition.x + 12}
                      y={mousePosition.y - 8}
                      fill="white"
                      fontSize="11"
                      fontWeight="600"
                      style={{ textShadow: '0 0 3px rgba(0,0,0,0.8)' }}
                    >
                      ({Math.round(mousePosition.x)}, {Math.round(mousePosition.y)})
                    </text>
                  </g>
                )}
              </svg>
            </div>
          )}

          {!currentFloorImage && (
            <div className="no-image">
              <p>No floor plan image available for this floor.</p>
            </div>
          )}
        </div>
      </div>

      {/* Training progress overlay */}
      {isTraining && (
        <div className="training-overlay">
          <div className="training-modal">
            <h3>🧠 Training RL Agent</h3>
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{ width: `${trainingProgress}%` }}
              />
            </div>
            <p>{trainingProgress}% Complete</p>
            <p className="training-info">
              Training the navigation agent to find optimal paths...
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default SpaceEditor;

