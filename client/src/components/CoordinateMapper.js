import React, { useState, useRef, useEffect, useCallback } from 'react';
import './CoordinateMapper.css';
import { getImageClickCoordinates, validateCoordinates } from '../utils/coordinateTransform';

const CoordinateMapper = ({ floorPlanImage, floorNumber: initialFloorNumber, onSave, onClose }) => {
  const [markers, setMarkers] = useState([]);
  const [selectedMarker, setSelectedMarker] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [draggingMarkerId, setDraggingMarkerId] = useState(null);
  const [dragPosition, setDragPosition] = useState({ x: 0, y: 0 });
  const [nodeIdInput, setNodeIdInput] = useState('');
  const imageRef = useRef(null);
  const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 });
  const dragUpdateRef = useRef(null);
  const dragStateRef = useRef({ isDragging: false, draggingId: null, offset: { x: 0, y: 0 } });
  const finalDragPositionRef = useRef({ x: 0, y: 0 });
  
  // Floor selection state
  const [currentFloor, setCurrentFloor] = useState(initialFloorNumber || 1);
  const [availableFloors, setAvailableFloors] = useState([]);
  const [floorPlanData, setFloorPlanData] = useState(null);
  const [currentFloorImage, setCurrentFloorImage] = useState(null);
  
  // Route editing state
  const [routes, setRoutes] = useState([]);
  const [routeMode, setRouteMode] = useState(false);
  const [routeFrom, setRouteFrom] = useState(null);
  const [routeWaypoints, setRouteWaypoints] = useState([]);
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [editingRoute, setEditingRoute] = useState(null);
  const [draggingWaypoint, setDraggingWaypoint] = useState(null);
  const [mousePosition, setMousePosition] = useState(null);
  const waypointDragStateRef = useRef({ isDragging: false, routeIndex: null, waypointIndex: null, offset: { x: 0, y: 0 } });
  
  // Anchor editing state
  const [anchorMode, setAnchorMode] = useState(false);
  const [selectedAnchorNodeId, setSelectedAnchorNodeId] = useState(null);
  const [draggingAnchor, setDraggingAnchor] = useState(null);
  const anchorDragStateRef = useRef({ isDragging: false, nodeId: null, anchorIndex: null, offset: { x: 0, y: 0 } });

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!routeMode) return;

      if (e.key === 'Escape') {
        handleCancelRoute();
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        if (routeWaypoints.length > 0) {
          setRouteWaypoints(prev => prev.slice(0, -1));
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [routeMode, routeWaypoints]);

  // Load available floors and floor plan data
  useEffect(() => {
    const loadFloorPlanData = async () => {
      if (!floorPlanImage) {
        try {
          const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
          const response = await fetch(`${API_BASE_URL}/pathfinder/floor-plans`);
          const data = await response.json();
          setFloorPlanData(data);
          
          // Extract available floors
          const floors = data.floors.map(f => ({
            floor: f.floor,
            name: f.name || `Floor ${f.floor}`
          })).sort((a, b) => a.floor - b.floor);
          setAvailableFloors(floors);
          
          // Load current floor data
          loadFloorData(data, currentFloor);
        } catch (error) {
          console.error('Error loading floor plan data:', error);
        }
      } else if (floorPlanImage.nodes) {
        setMarkers(floorPlanImage.nodes.map(node => ({
          id: node.id || `marker_${Date.now()}_${Math.random()}`,
          pixelX: node.pixelX,
          pixelY: node.pixelY,
          nodeId: node.id,
          name: node.name || node.id
        })));
      }
    };
    
    loadFloorPlanData();
  }, [floorPlanImage]);

  // Load data for a specific floor
  const loadFloorData = (data, floorNum) => {
    if (!data) return;
    
    const floorInfo = data.floors.find(f => f.floor === floorNum);
          if (floorInfo) {
            if (floorInfo.nodes) {
              setMarkers(floorInfo.nodes.map(node => ({
                id: node.id || `marker_${Date.now()}_${Math.random()}`,
                pixelX: node.pixelX,
                pixelY: node.pixelY,
                nodeId: node.id,
          name: node.name || node.id,
          anchors: node.anchors || [] // Load anchors if they exist
              })));
      } else {
        setMarkers([]);
            }
      
            if (floorInfo.paths && Array.isArray(floorInfo.paths)) {
              setRoutes(floorInfo.paths);
      } else {
        setRoutes([]);
            }
      
            setImageDimensions({
              width: floorInfo.image?.naturalWidth || floorInfo.image?.width || 1200,
              height: floorInfo.image?.naturalHeight || floorInfo.image?.height || 900
            });
      
      if (floorInfo.image?.url) {
        setCurrentFloorImage(floorInfo.image.url);
        }
    } else {
      // Floor not found - clear data
      setMarkers([]);
      setRoutes([]);
      setCurrentFloorImage(null);
    }
  };

  // Reload floor data when current floor changes
  useEffect(() => {
    if (floorPlanData) {
      loadFloorData(floorPlanData, currentFloor);
    }
  }, [currentFloor]);

  // Get image dimensions when loaded
  useEffect(() => {
    const updateDimensions = () => {
      if (imageRef.current && imageRef.current.complete) {
        const img = imageRef.current;
        // Only update if dimensions are different to avoid infinite loops
        if (img.naturalWidth !== imageDimensions.width || img.naturalHeight !== imageDimensions.height) {
          console.log('Updating image dimensions:', img.naturalWidth, img.naturalHeight);
          setImageDimensions({
            width: img.naturalWidth || img.width,
            height: img.naturalHeight || img.height
          });
        }
      }
    };

    // Check immediately
    updateDimensions();

    // Check again after a short delay to handle race conditions
    const timer = setTimeout(updateDimensions, 100);

    // Add load event listener just in case
    const img = imageRef.current;
    if (img) {
      img.addEventListener('load', updateDimensions);
    }

    return () => {
      clearTimeout(timer);
      if (img) {
        img.removeEventListener('load', updateDimensions);
      }
    };
  }, [floorPlanImage?.image?.url, imageDimensions.width, imageDimensions.height]);

  const handleMouseMove = (event) => {
    if (!routeMode || !routeFrom) return;

    const imgElement = imageRef.current;
    if (!imgElement) return;

    const rect = imgElement.getBoundingClientRect();
    const naturalWidth = imgElement.naturalWidth || imgElement.width;
    const naturalHeight = imgElement.naturalHeight || imgElement.height;
    const displayWidth = rect.width;
    const displayHeight = rect.height;

    if (naturalWidth === 0 || naturalHeight === 0 || displayWidth === 0 || displayHeight === 0) return;

    const scaleX = naturalWidth / displayWidth;
    const scaleY = naturalHeight / displayHeight;

    const mouseX = (event.clientX - rect.left) * scaleX;
    const mouseY = (event.clientY - rect.top) * scaleY;

    setMousePosition({ x: mouseX, y: mouseY });
  };

  const handleImageClick = (event) => {
    if (isDragging) return;

    // If in anchor mode, add anchor to selected marker
    if (anchorMode && selectedMarker) {
      const imgElement = imageRef.current;
      if (!imgElement) return;

      const rect = imgElement.getBoundingClientRect();
      const naturalWidth = imgElement.naturalWidth || imgElement.width;
      const naturalHeight = imgElement.naturalHeight || imgElement.height;
      const displayWidth = rect.width;
      const displayHeight = rect.height;

      if (naturalWidth === 0 || naturalHeight === 0 || displayWidth === 0 || displayHeight === 0) {
        return;
      }

      const scaleX = naturalWidth / displayWidth;
      const scaleY = naturalHeight / displayHeight;

      const clickX = (event.clientX - rect.left) * scaleX;
      const clickY = (event.clientY - rect.top) * scaleY;

      const maxX = naturalWidth;
      const maxY = naturalHeight;
      
      if (clickX >= 0 && clickX <= maxX && clickY >= 0 && clickY <= maxY) {
        handleAddAnchor(selectedMarker.id, clickX, clickY);
        // Exit anchor mode after adding
        setAnchorMode(false);
      }
      return;
    }

    // If in route mode, add waypoint
    if (routeMode && routeFrom) {
      const imgElement = imageRef.current;
      if (!imgElement) return;

      const rect = imgElement.getBoundingClientRect();
      const naturalWidth = imgElement.naturalWidth || imgElement.width;
      const naturalHeight = imgElement.naturalHeight || imgElement.height;
      const displayWidth = rect.width;
      const displayHeight = rect.height;

      if (naturalWidth === 0 || naturalHeight === 0 || displayWidth === 0 || displayHeight === 0) {
        return;
      }

      const scaleX = naturalWidth / displayWidth;
      const scaleY = naturalHeight / displayHeight;

      const clickX = (event.clientX - rect.left) * scaleX;
      const clickY = (event.clientY - rect.top) * scaleY;

      const maxX = naturalWidth;
      const maxY = naturalHeight;
      
      if (clickX >= 0 && clickX <= maxX && clickY >= 0 && clickY <= maxY) {
        setRouteWaypoints([...routeWaypoints, { pixelX: clickX, pixelY: clickY }]);
      }
      return;
    }

    // Normal marker creation mode
    if (selectedMarker) return;

    const imgElement = imageRef.current;
    if (!imgElement) return;

    // Use the same coordinate calculation as drag handler
    const rect = imgElement.getBoundingClientRect();
    const naturalWidth = imgElement.naturalWidth || imgElement.width;
    const naturalHeight = imgElement.naturalHeight || imgElement.height;
    const displayWidth = rect.width;
    const displayHeight = rect.height;

    // Only proceed if we have valid dimensions
    if (naturalWidth === 0 || naturalHeight === 0 || displayWidth === 0 || displayHeight === 0) {
      console.warn('Image dimensions not ready');
      return;
    }

    const scaleX = naturalWidth / displayWidth;
    const scaleY = naturalHeight / displayHeight;

    const clickX = (event.clientX - rect.left) * scaleX;
    const clickY = (event.clientY - rect.top) * scaleY;
    
    // Use actual natural dimensions for validation
    const maxX = naturalWidth;
    const maxY = naturalHeight;
    
    if (clickX < 0 || clickX > maxX || clickY < 0 || clickY > maxY) {
      alert(`Coordinates are outside image bounds. X: ${clickX.toFixed(2)}/${maxX}, Y: ${clickY.toFixed(2)}/${maxY}`);
      return;
    }

    const newMarker = {
      id: `marker_${Date.now()}`,
      pixelX: clickX,
      pixelY: clickY,
      nodeId: nodeIdInput || `node_${markers.length + 1}`,
      name: nodeIdInput || `Node ${markers.length + 1}`
    };

    setMarkers([...markers, newMarker]);
    setNodeIdInput('');
  };

  const handleMarkerClick = (marker, event) => {
    event.stopPropagation();
    
    // If in route mode, set as from/to node
    if (routeMode) {
      if (!routeFrom) {
        // Set as starting point
        setRouteFrom(marker.nodeId);
        setRouteWaypoints([]);
      } else if (routeFrom !== marker.nodeId) {
        // Complete the route
        const newRoute = {
          from: routeFrom,
          to: marker.nodeId,
          waypoints: [...routeWaypoints]
        };
        setRoutes([...routes, newRoute]);
        setRouteFrom(null);
        setRouteWaypoints([]);
        setRouteMode(false);
      }
      return;
    }
    
    setSelectedMarker(marker);
  };

  // Define drag handler that uses refs to avoid closure issues
  const handleMarkerDrag = useCallback((event) => {
    const dragState = dragStateRef.current;
    if (!dragState.isDragging || !dragState.draggingId) return;

    // Cancel any pending updates
    if (dragUpdateRef.current) {
      cancelAnimationFrame(dragUpdateRef.current);
    }

    // Use requestAnimationFrame for smooth updates
    dragUpdateRef.current = requestAnimationFrame(() => {
      const imgElement = imageRef.current;
      if (!imgElement) return;

      // Get the canvas container to ensure we're calculating relative to the same element
      const canvasContainer = imgElement.parentElement;
      if (!canvasContainer) return;

      const imgRect = imgElement.getBoundingClientRect();
      const naturalWidth = imgElement.naturalWidth || imgElement.width;
      const naturalHeight = imgElement.naturalHeight || imgElement.height;
      const displayWidth = imgRect.width;
      const displayHeight = imgRect.height;

      // Calculate scale factors
      const scaleX = naturalWidth / displayWidth;
      const scaleY = naturalHeight / displayHeight;

      // Get mouse position relative to image (accounting for image position within container)
      const clickX = (event.clientX - imgRect.left) * scaleX;
      const clickY = (event.clientY - imgRect.top) * scaleY;

      // Apply the drag offset to get the new marker position
      const newX = clickX - dragState.offset.x;
      const newY = clickY - dragState.offset.y;

      // Use actual natural dimensions for validation
      const maxX = naturalWidth;
      const maxY = naturalHeight;
      
      // Allow some margin for edge cases (1 pixel tolerance)
      if (newX >= -1 && newX <= maxX + 1 && newY >= -1 && newY <= maxY + 1) {
        // Clamp to valid bounds
        const clampedX = Math.max(0, Math.min(newX, maxX));
        const clampedY = Math.max(0, Math.min(newY, maxY));
        
        // Store final position in ref for drag end
        finalDragPositionRef.current = { x: clampedX, y: clampedY };
        
        // Update marker position immediately
        setMarkers(prevMarkers => 
          prevMarkers.map(m => 
            m.id === dragState.draggingId 
              ? { ...m, pixelX: clampedX, pixelY: clampedY }
              : m
          )
        );
        // Update drag position for visual feedback
        setDragPosition({ x: clampedX, y: clampedY });
      }
    });
  }, [imageDimensions.width, imageDimensions.height]);

  const handleMarkerDragEnd = useCallback(() => {
    // Cancel any pending animation frame
    if (dragUpdateRef.current) {
      cancelAnimationFrame(dragUpdateRef.current);
      dragUpdateRef.current = null;
    }
    
    // Get the final drag position from ref (most up-to-date)
    const dragState = dragStateRef.current;
    const finalPosition = finalDragPositionRef.current;
    
    // Ensure the final position is saved to the marker (use ref to get latest value)
    if (dragState.draggingId && finalPosition.x > 0 && finalPosition.y > 0) {
      setMarkers(prevMarkers => 
        prevMarkers.map(m => 
          m.id === dragState.draggingId 
            ? { ...m, pixelX: finalPosition.x, pixelY: finalPosition.y }
            : m
        )
      );
    }
    
    // Remove document event listeners
    document.removeEventListener('mousemove', handleMarkerDrag);
    document.removeEventListener('mouseup', handleMarkerDragEnd);
    
    // Reset drag state
    dragStateRef.current = { isDragging: false, draggingId: null, offset: { x: 0, y: 0 } };
    finalDragPositionRef.current = { x: 0, y: 0 };
    setIsDragging(false);
    setDraggingMarkerId(null);
    setDragOffset({ x: 0, y: 0 });
    setDragPosition({ x: 0, y: 0 });
  }, [handleMarkerDrag]);

  const handleMarkerDragStart = (marker, event) => {
    // If in route mode, don't start drag, allow click to propagate
    if (routeMode) {
      return;
    }

    event.stopPropagation();
    event.preventDefault();
    
    const imgElement = imageRef.current;
    if (!imgElement) return;

    // Ensure image is loaded
    if (!imgElement.complete || imgElement.naturalWidth === 0) {
      console.warn('Image not fully loaded');
      return;
    }

    const rect = imgElement.getBoundingClientRect();
    const naturalWidth = imgElement.naturalWidth || imgElement.width;
    const naturalHeight = imgElement.naturalHeight || imgElement.height;
    const displayWidth = rect.width;
    const displayHeight = rect.height;

    // Only proceed if we have valid dimensions
    if (naturalWidth === 0 || naturalHeight === 0 || displayWidth === 0 || displayHeight === 0) {
      console.warn('Invalid image dimensions', { naturalWidth, naturalHeight, displayWidth, displayHeight });
      return;
    }

    const scaleX = naturalWidth / displayWidth;
    const scaleY = naturalHeight / displayHeight;

    const clickX = (event.clientX - rect.left) * scaleX;
    const clickY = (event.clientY - rect.top) * scaleY;

    const offset = {
      x: clickX - marker.pixelX,
      y: clickY - marker.pixelY
    };
    
    // Update ref immediately
    dragStateRef.current = {
      isDragging: true,
      draggingId: marker.id,
      offset: offset
    };
    
    // Update state
    setIsDragging(true);
    setSelectedMarker(marker);
    setDraggingMarkerId(marker.id);
    setDragOffset(offset);
    setDragPosition({
      x: marker.pixelX,
      y: marker.pixelY
    });
    
    // Attach mouse move and mouse up to document for smooth dragging
    document.addEventListener('mousemove', handleMarkerDrag);
    document.addEventListener('mouseup', handleMarkerDragEnd);
  };


  const handleDeleteMarker = (markerId) => {
    console.log('🗑️ handleDeleteMarker called with markerId:', markerId);
    console.log('Current markers:', markers);
    
    // Find the marker to get its nodeId
    const markerToDelete = markers.find(m => m.id === markerId);
    console.log('Marker to delete:', markerToDelete);
    
    if (!markerToDelete) {
      console.error('Cannot delete marker: marker not found with id:', markerId);
      alert(`Error: Marker with id "${markerId}" not found`);
      return;
    }
    
    const nodeIdToDelete = markerToDelete.nodeId || markerToDelete.id;
    console.log('NodeId to delete:', nodeIdToDelete);
    
    if (!nodeIdToDelete) {
      console.error('Cannot delete marker: nodeId not found');
      alert('Error: Node ID not found for this marker');
      return;
    }
    
    // Delete the marker
    setMarkers(prevMarkers => {
      const updatedMarkers = prevMarkers.filter(m => m.id !== markerId);
      console.log('Updated markers count:', updatedMarkers.length, '(was', prevMarkers.length, ')');
      return updatedMarkers;
    });
    
    // Delete all routes connected to this node (both from and to)
    setRoutes(prevRoutes => {
      const connectedRoutes = prevRoutes.filter(r => 
        r.from === nodeIdToDelete || r.to === nodeIdToDelete
      );
      
      if (connectedRoutes.length > 0) {
        console.log(`🗑️ Deleting ${connectedRoutes.length} route(s) connected to node ${nodeIdToDelete}:`, connectedRoutes);
        const updatedRoutes = prevRoutes.filter(r => 
          r.from !== nodeIdToDelete && r.to !== nodeIdToDelete
        );
        console.log('Updated routes count:', updatedRoutes.length, '(was', prevRoutes.length, ')');
        return updatedRoutes;
      } else {
        console.log('No routes connected to node', nodeIdToDelete);
        return prevRoutes;
      }
    });
    
    // Clear selection if this marker was selected
    if (selectedMarker?.id === markerId) {
      console.log('Clearing selected marker');
      setSelectedMarker(null);
    }
    
    // Clear route creation if this node was the routeFrom
    if (routeFrom === nodeIdToDelete) {
      console.log('Clearing route creation (node was routeFrom)');
      setRouteFrom(null);
      setRouteWaypoints([]);
      if (routeMode) {
        setRouteMode(false);
      }
    }
    
    // Clear editing if the route being edited involves this node
    if (editingRoute && (editingRoute.from === nodeIdToDelete || editingRoute.to === nodeIdToDelete)) {
      console.log('Clearing route editing (route involves deleted node)');
      setEditingRoute(null);
      setRouteMode(false);
      setRouteFrom(null);
      setRouteWaypoints([]);
    }
    
    console.log('✅ Marker deletion completed');
  };

  const handleUpdateNodeId = (markerId, newNodeId) => {
    setMarkers(markers.map(m => 
      m.id === markerId 
        ? { ...m, nodeId: newNodeId, name: newNodeId }
        : m
    ));
  };

  // Waypoint drag handlers
  const handleWaypointDrag = useCallback((event) => {
    const dragState = waypointDragStateRef.current;
    if (!dragState.isDragging || dragState.routeIndex === null || dragState.waypointIndex === null) return;

    if (dragUpdateRef.current) {
      cancelAnimationFrame(dragUpdateRef.current);
    }

    dragUpdateRef.current = requestAnimationFrame(() => {
      const imgElement = imageRef.current;
      if (!imgElement) return;

      const imgRect = imgElement.getBoundingClientRect();
      const naturalWidth = imgElement.naturalWidth || imgElement.width;
      const naturalHeight = imgElement.naturalHeight || imgElement.height;
      const displayWidth = imgRect.width;
      const displayHeight = imgRect.height;

      const scaleX = naturalWidth / displayWidth;
      const scaleY = naturalHeight / displayHeight;

      const clickX = (event.clientX - imgRect.left) * scaleX;
      const clickY = (event.clientY - imgRect.top) * scaleY;

      const newX = clickX - dragState.offset.x;
      const newY = clickY - dragState.offset.y;

      const maxX = naturalWidth;
      const maxY = naturalHeight;
      
      if (newX >= -1 && newX <= maxX + 1 && newY >= -1 && newY <= maxY + 1) {
        const clampedX = Math.max(0, Math.min(newX, maxX));
        const clampedY = Math.max(0, Math.min(newY, maxY));
        
        setRoutes(prevRoutes => 
          prevRoutes.map((route, routeIdx) => {
            if (routeIdx === dragState.routeIndex) {
              const newWaypoints = [...(route.waypoints || [])];
              newWaypoints[dragState.waypointIndex] = { pixelX: clampedX, pixelY: clampedY };
              return { ...route, waypoints: newWaypoints };
            }
            return route;
          })
        );
      }
    });
  }, []);

  const handleWaypointDragEnd = useCallback(() => {
    if (dragUpdateRef.current) {
      cancelAnimationFrame(dragUpdateRef.current);
      dragUpdateRef.current = null;
    }
    
    document.removeEventListener('mousemove', handleWaypointDrag);
    document.removeEventListener('mouseup', handleWaypointDragEnd);
    
    waypointDragStateRef.current = { isDragging: false, routeIndex: null, waypointIndex: null, offset: { x: 0, y: 0 } };
    setDraggingWaypoint(null);
  }, [handleWaypointDrag]);

  const handleWaypointDragStart = (routeIndex, waypointIndex, event) => {
    event.stopPropagation();
    event.preventDefault();
    
    const imgElement = imageRef.current;
    if (!imgElement) return;

    const route = routes[routeIndex];
    const waypoint = route.waypoints[waypointIndex];

    const rect = imgElement.getBoundingClientRect();
    const naturalWidth = imgElement.naturalWidth || imgElement.width;
    const naturalHeight = imgElement.naturalHeight || imgElement.height;
    const displayWidth = rect.width;
    const displayHeight = rect.height;

    const scaleX = naturalWidth / displayWidth;
    const scaleY = naturalHeight / displayHeight;

    const clickX = (event.clientX - rect.left) * scaleX;
    const clickY = (event.clientY - rect.top) * scaleY;

    const offset = {
      x: clickX - waypoint.pixelX,
      y: clickY - waypoint.pixelY
    };
    
    waypointDragStateRef.current = {
      isDragging: true,
      routeIndex: routeIndex,
      waypointIndex: waypointIndex,
      offset: offset
    };
    
    setDraggingWaypoint({ routeIndex, waypointIndex });
    
    document.addEventListener('mousemove', handleWaypointDrag);
    document.addEventListener('mouseup', handleWaypointDragEnd);
  };

  const handleDeleteRoute = (routeIndex) => {
    setRoutes(routes.filter((_, index) => index !== routeIndex));
    if (selectedRoute === routeIndex) {
      setSelectedRoute(null);
    }
  };

  const handleEditRoute = (route) => {
    setEditingRoute(route);
    setRouteFrom(route.from);
    setRouteWaypoints(route.waypoints || []);
    setRouteMode(true);
    // Remove the route from list temporarily
    setRoutes(routes.filter(r => r !== route));
  };

  const handleCancelRoute = () => {
    setRouteMode(false);
    setRouteFrom(null);
    setRouteWaypoints([]);
    setEditingRoute(null);
    setSelectedMarker(null);
  };

  const handleDeleteWaypoint = (routeIndex, waypointIndex) => {
    setRoutes(prevRoutes => 
      prevRoutes.map((route, idx) => {
        if (idx === routeIndex) {
          const newWaypoints = [...(route.waypoints || [])];
          newWaypoints.splice(waypointIndex, 1);
          return { ...route, waypoints: newWaypoints };
        }
        return route;
      })
    );
  };

  // Anchor management functions
  const handleAddAnchor = (markerId, pixelX, pixelY) => {
    setMarkers(prevMarkers =>
      prevMarkers.map(m => {
        if (m.id === markerId) {
          const newAnchors = [...(m.anchors || [])];
          const anchorId = `anchor_${newAnchors.length + 1}`;
          newAnchors.push({
            id: anchorId,
            pixelX: pixelX,
            pixelY: pixelY,
            direction: 'auto',
            connectsTo: []
          });
          return { ...m, anchors: newAnchors };
        }
        return m;
      })
    );
  };

  const handleDeleteAnchor = (markerId, anchorIndex) => {
    setMarkers(prevMarkers =>
      prevMarkers.map(m => {
        if (m.id === markerId && m.anchors) {
          const newAnchors = m.anchors.filter((_, idx) => idx !== anchorIndex);
          return { ...m, anchors: newAnchors };
        }
        return m;
      })
    );
  };

  const handleUpdateAnchorConnectsTo = (markerId, anchorIndex, connectsTo) => {
    setMarkers(prevMarkers =>
      prevMarkers.map(m => {
        if (m.id === markerId && m.anchors) {
          const newAnchors = [...m.anchors];
          newAnchors[anchorIndex] = { ...newAnchors[anchorIndex], connectsTo };
          return { ...m, anchors: newAnchors };
        }
        return m;
      })
    );
  };

  const handleAnchorDrag = useCallback((event) => {
    const dragState = anchorDragStateRef.current;
    if (!dragState.isDragging || !dragState.nodeId || dragState.anchorIndex === null) return;

    if (dragUpdateRef.current) {
      cancelAnimationFrame(dragUpdateRef.current);
    }

    dragUpdateRef.current = requestAnimationFrame(() => {
      const imgElement = imageRef.current;
      if (!imgElement) return;

      const imgRect = imgElement.getBoundingClientRect();
      const naturalWidth = imgElement.naturalWidth || imgElement.width;
      const naturalHeight = imgElement.naturalHeight || imgElement.height;
      const displayWidth = imgRect.width;
      const displayHeight = imgRect.height;

      const scaleX = naturalWidth / displayWidth;
      const scaleY = naturalHeight / displayHeight;

      const clickX = (event.clientX - imgRect.left) * scaleX;
      const clickY = (event.clientY - imgRect.top) * scaleY;

      const newX = clickX - dragState.offset.x;
      const newY = clickY - dragState.offset.y;

      const maxX = naturalWidth;
      const maxY = naturalHeight;
      
      if (newX >= -1 && newX <= maxX + 1 && newY >= -1 && newY <= maxY + 1) {
        const clampedX = Math.max(0, Math.min(newX, maxX));
        const clampedY = Math.max(0, Math.min(newY, maxY));
        
        setMarkers(prevMarkers =>
          prevMarkers.map(m => {
            if (m.id === dragState.nodeId && m.anchors) {
              const newAnchors = [...m.anchors];
              newAnchors[dragState.anchorIndex] = {
                ...newAnchors[dragState.anchorIndex],
                pixelX: clampedX,
                pixelY: clampedY
              };
              return { ...m, anchors: newAnchors };
            }
            return m;
          })
        );
      }
    });
  }, []);

  const handleAnchorDragEnd = useCallback(() => {
    if (dragUpdateRef.current) {
      cancelAnimationFrame(dragUpdateRef.current);
      dragUpdateRef.current = null;
    }
    
    document.removeEventListener('mousemove', handleAnchorDrag);
    document.removeEventListener('mouseup', handleAnchorDragEnd);
    
    anchorDragStateRef.current = { isDragging: false, nodeId: null, anchorIndex: null, offset: { x: 0, y: 0 } };
    setDraggingAnchor(null);
  }, [handleAnchorDrag]);

  const handleAnchorDragStart = (marker, anchorIndex, event) => {
    event.stopPropagation();
    event.preventDefault();
    
    const imgElement = imageRef.current;
    if (!imgElement) return;

    const anchor = marker.anchors[anchorIndex];

    const rect = imgElement.getBoundingClientRect();
    const naturalWidth = imgElement.naturalWidth || imgElement.width;
    const naturalHeight = imgElement.naturalHeight || imgElement.height;
    const displayWidth = rect.width;
    const displayHeight = rect.height;

    const scaleX = naturalWidth / displayWidth;
    const scaleY = naturalHeight / displayHeight;

    const clickX = (event.clientX - rect.left) * scaleX;
    const clickY = (event.clientY - rect.top) * scaleY;

    const offset = {
      x: clickX - anchor.pixelX,
      y: clickY - anchor.pixelY
    };
    
    anchorDragStateRef.current = {
      isDragging: true,
      nodeId: marker.id,
      anchorIndex: anchorIndex,
      offset: offset
    };
    
    setDraggingAnchor({ nodeId: marker.id, anchorIndex });
    
    document.addEventListener('mousemove', handleAnchorDrag);
    document.addEventListener('mouseup', handleAnchorDragEnd);
  };

  const handleExport = () => {
    const exportData = {
      floor: currentFloor,
      nodes: markers.map(m => ({
        id: m.nodeId,
        pixelX: m.pixelX,
        pixelY: m.pixelY,
        name: m.name,
        anchors: m.anchors || [] // Include anchors in export
      })),
      paths: routes
    };

    const jsonString = JSON.stringify(exportData, null, 2);
    navigator.clipboard.writeText(jsonString).then(() => {
      alert('Coordinates copied to clipboard!');
    }).catch(() => {
      // Fallback: show in alert
      prompt('Copy these coordinates:', jsonString);
    });
  };

  const handleSave = async () => {
    try {
      const saveData = {
        floor: currentFloor,
        nodes: markers.map(m => ({
          id: m.nodeId,
          pixelX: m.pixelX,
          pixelY: m.pixelY,
          name: m.name,
          anchors: m.anchors || [] // Include anchors in save
        })),
        paths: routes
      };

      // Call the onSave callback if provided
      if (onSave) {
        onSave(saveData);
      }

      // Also try to save to backend
      const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
      try {
        const response = await fetch(`${API_BASE_URL}/pathfinder/floor-plans/update`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(saveData)
        });

        const result = await response.json();

        if (response.ok) {
          const nodesMsg = `${result.nodesUpdated || markers.length} node(s)`;
          const routesMsg = result.routesUpdated !== undefined ? ` and ${result.routesUpdated} route(s)` : (routes.length > 0 ? ` and ${routes.length} route(s)` : '');
          alert(`✅ Successfully saved ${nodesMsg}${routesMsg} for floor ${currentFloor}!`);
          
          // Reload floor data to get updated data from server
          try {
            const reloadResponse = await fetch(`${API_BASE_URL}/pathfinder/floor-plans`);
            const reloadData = await reloadResponse.json();
            setFloorPlanData(reloadData);
            loadFloorData(reloadData, currentFloor);
          } catch (reloadError) {
            console.warn('Could not reload floor data after save:', reloadError);
          }
        } else {
          console.error('Save failed:', result);
          alert(`❌ Failed to save: ${result.error || 'Unknown error'}. Use "Export JSON" to copy the data manually.`);
        }
      } catch (error) {
        console.error('Error saving to backend:', error);
        alert(`⚠️ Could not save to backend: ${error.message}. Use "Export JSON" to copy the data manually.`);
      }
    } catch (error) {
      console.error('Error saving coordinates:', error);
      alert('Error saving coordinates. Please try Export JSON instead.');
    }
  };

  // Calculate display coordinates for markers (memoized for performance)
  const getDisplayCoords = useCallback((pixelX, pixelY) => {
    if (!imageRef.current) return { x: 0, y: 0 };
    
    const img = imageRef.current;
    const rect = img.getBoundingClientRect();
    const naturalWidth = img.naturalWidth || img.width;
    const naturalHeight = img.naturalHeight || img.height;
    const displayWidth = rect.width;
    const displayHeight = rect.height;

    // Calculate scale factors (same as in drag handler)
    const scaleX = displayWidth / naturalWidth;
    const scaleY = displayHeight / naturalHeight;

    // Transform pixel coordinates to display coordinates
    // The coordinates are relative to the image's top-left corner
    return {
      x: pixelX * scaleX,
      y: pixelY * scaleY
    };
  }, []);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (dragUpdateRef.current) {
        cancelAnimationFrame(dragUpdateRef.current);
      }
      // Clean up document event listeners
      document.removeEventListener('mousemove', handleMarkerDrag);
      document.removeEventListener('mouseup', handleMarkerDragEnd);
      document.removeEventListener('mousemove', handleWaypointDrag);
      document.removeEventListener('mouseup', handleWaypointDragEnd);
    };
  }, [handleMarkerDrag, handleWaypointDrag]);

  return (
    <div className="coordinate-mapper">
      <div className="mapper-header">
        <h2>Coordinate Mapper</h2>
        <div className="mapper-actions">
          {availableFloors.length > 0 && (
            <select
              value={currentFloor}
              onChange={(e) => setCurrentFloor(parseInt(e.target.value))}
              style={{
                padding: '8px 12px',
                marginRight: '10px',
                borderRadius: '5px',
                border: '1px solid #444',
                background: '#2a2a2a',
                color: '#fff',
                fontSize: '14px',
                cursor: 'pointer'
              }}
            >
              {availableFloors.map(floor => (
                <option key={floor.floor} value={floor.floor}>
                  {floor.name}
                </option>
              ))}
            </select>
          )}
          <button onClick={handleExport} className="btn-export">Export JSON</button>
          <button onClick={handleSave} className="btn-save">Save</button>
          <button onClick={onClose} className="btn-close">Close</button>
        </div>
      </div>

      <div className="mapper-content">
        <div className="mapper-instructions">
          <p><strong>Instructions:</strong></p>
          <ul>
            <li>Click on the floor plan to add a marker</li>
            <li>Click a marker to select it</li>
            <li>Drag markers to adjust their position</li>
            <li>Enter Node ID in the input field before clicking (optional)</li>
            <li><strong>Routes:</strong> Click "Create New Route", then click two nodes (from → to)</li>
            <li><strong>Waypoints:</strong> While creating a route, click on the image to add waypoints</li>
            <li><strong>Edit Routes:</strong> Click a route to select it, then click ✏️ to edit</li>
            <li><strong>Drag Waypoints:</strong> Drag the orange circles to move waypoints</li>
            <li><strong>Delete Waypoints:</strong> Click a waypoint while editing to remove it</li>
          </ul>
          <div className="node-id-input">
            <label>Node ID (for next marker):</label>
            <input
              type="text"
              value={nodeIdInput}
              onChange={(e) => setNodeIdInput(e.target.value)}
              placeholder="e.g., hsitp_zone_01"
            />
          </div>
          
          <div className="route-controls" style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid #444' }}>
            <h4 style={{ marginTop: 0, color: '#fff' }}>Route Editing</h4>
            {!routeMode ? (
              <>
                <button
                  onClick={() => {
                    setRouteMode(true);
                    setRouteFrom(null);
                    setRouteWaypoints([]);
                    setEditingRoute(null);
                  }}
                  style={{
                    width: '100%',
                    padding: '10px',
                    background: '#667eea',
                    color: 'white',
                    border: 'none',
                    borderRadius: '5px',
                    cursor: 'pointer',
                    fontWeight: '600',
                    marginBottom: '10px'
                  }}
                >
                  ➕ Create New Route
                </button>
                {routes.length > 0 && (
                  <div style={{ marginTop: '10px' }}>
                    <strong style={{ color: '#fff' }}>Existing Routes ({routes.length}):</strong>
                    <div style={{ maxHeight: '150px', overflowY: 'auto', marginTop: '5px' }}>
                      {routes.map((route, index) => (
                        <div
                          key={index}
                          style={{
                            padding: '5px',
                            margin: '2px 0',
                            background: selectedRoute === index ? '#667eea' : '#1a1a1a',
                            borderRadius: '3px',
                            fontSize: '11px',
                            cursor: 'pointer',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            color: '#fff'
                          }}
                          onClick={() => setSelectedRoute(selectedRoute === index ? null : index)}
                        >
                          <span>{route.from} → {route.to} ({route.waypoints?.length || 0} waypoints)</span>
                          <div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEditRoute(route);
                              }}
                              style={{
                                background: '#4CAF50',
                                color: 'white',
                                border: 'none',
                                borderRadius: '3px',
                                padding: '2px 6px',
                                cursor: 'pointer',
                                fontSize: '10px',
                                marginRight: '3px'
                              }}
                            >
                              ✏️
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteRoute(index);
                              }}
                              style={{
                                background: '#f44336',
                                color: 'white',
                                border: 'none',
                                borderRadius: '3px',
                                padding: '2px 6px',
                                cursor: 'pointer',
                                fontSize: '10px'
                              }}
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div>
                <div style={{ marginBottom: '10px', fontSize: '12px', color: '#fff' }}>
                  {routeFrom ? (
                    <div className="route-status">
                      <div style={{ marginBottom: '5px' }}><strong>Start:</strong> {routeFrom}</div>
                      <div style={{ marginBottom: '5px' }}><strong>Waypoints:</strong> {routeWaypoints.length}</div>
                      <div className="instruction-box" style={{ background: 'rgba(255,255,255,0.1)', padding: '8px', borderRadius: '4px' }}>
                        <div style={{ marginBottom: '3px' }}>🖱️ <strong>Click image</strong> to add waypoint</div>
                        <div style={{ marginBottom: '3px' }}>📍 <strong>Click node</strong> to finish route</div>
                        <div style={{ marginBottom: '3px' }}>⌨️ <strong>Esc</strong> to cancel</div>
                        <div>⌨️ <strong>Backspace</strong> to undo waypoint</div>
                      </div>
                    </div>
                  ) : (
                    <div className="instruction-box" style={{ background: 'rgba(76, 175, 80, 0.2)', padding: '10px', borderRadius: '4px', textAlign: 'center' }}>
                      <strong>Select Start Node</strong>
                      <div style={{ fontSize: '11px', marginTop: '5px', opacity: 0.8 }}>Click any blue marker to begin</div>
                    </div>
                  )}
                </div>
                <button
                  onClick={handleCancelRoute}
                  style={{
                    width: '100%',
                    padding: '8px',
                    background: '#f44336',
                    color: 'white',
                    border: 'none',
                    borderRadius: '5px',
                    cursor: 'pointer',
                    fontSize: '12px'
                  }}
                >
                  Cancel Route
                </button>
                {routeWaypoints.length > 0 && (
                  <button
                    onClick={() => setRouteWaypoints([])}
                    style={{
                      width: '100%',
                      padding: '8px',
                      background: '#ff9800',
                      color: 'white',
                      border: 'none',
                      borderRadius: '5px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      marginTop: '5px'
                    }}
                  >
                    Clear Waypoints ({routeWaypoints.length})
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Anchor Editing Controls */}
          <div className="anchor-controls" style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid #444' }}>
            <h4 style={{ marginTop: 0, color: '#fff' }}>Anchor Points (Door/Exit)</h4>
            <p style={{ fontSize: '11px', color: '#aaa', marginBottom: '10px' }}>
              Anchors define where paths connect to zones (doors/exits).
            </p>
            
            {!anchorMode ? (
              <button
                onClick={() => {
                  setAnchorMode(true);
                  setSelectedAnchorNodeId(selectedMarker?.id || null);
                }}
                disabled={!selectedMarker}
                style={{
                  width: '100%',
                  padding: '10px',
                  background: selectedMarker ? '#9c27b0' : '#555',
                  color: 'white',
                  border: 'none',
                  borderRadius: '5px',
                  cursor: selectedMarker ? 'pointer' : 'not-allowed',
                  fontWeight: '600',
                  marginBottom: '10px'
                }}
              >
                🎯 Add Anchor to {selectedMarker?.nodeId || 'Selected Node'}
              </button>
            ) : (
              <div>
                <div style={{ marginBottom: '10px', fontSize: '12px', color: '#fff', background: 'rgba(156, 39, 176, 0.2)', padding: '10px', borderRadius: '4px' }}>
                  <strong>Anchor Mode Active</strong>
                  <div style={{ fontSize: '11px', marginTop: '5px', opacity: 0.8 }}>
                    Click on the image near "{selectedMarker?.nodeId}" to place an anchor point (door/exit location)
                  </div>
                </div>
                <button
                  onClick={() => {
                    setAnchorMode(false);
                    setSelectedAnchorNodeId(null);
                  }}
                  style={{
                    width: '100%',
                    padding: '8px',
                    background: '#f44336',
                    color: 'white',
                    border: 'none',
                    borderRadius: '5px',
                    cursor: 'pointer',
                    fontSize: '12px'
                  }}
                >
                  Cancel Anchor Mode
                </button>
              </div>
            )}

            {/* Show anchors for selected marker */}
            {selectedMarker && selectedMarker.anchors && selectedMarker.anchors.length > 0 && (
              <div style={{ marginTop: '10px' }}>
                <strong style={{ color: '#fff', fontSize: '12px' }}>
                  Anchors for {selectedMarker.nodeId} ({selectedMarker.anchors.length}):
                </strong>
                <div style={{ maxHeight: '120px', overflowY: 'auto', marginTop: '5px' }}>
                  {selectedMarker.anchors.map((anchor, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: '5px',
                        margin: '2px 0',
                        background: '#1a1a1a',
                        borderRadius: '3px',
                        fontSize: '10px',
                        color: '#fff',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}
                    >
                      <span>
                        🎯 {anchor.id} ({Math.round(anchor.pixelX)}, {Math.round(anchor.pixelY)})
                      </span>
                      <button
                        onClick={() => handleDeleteAnchor(selectedMarker.id, idx)}
                        style={{
                          background: '#f44336',
                          color: 'white',
                          border: 'none',
                          borderRadius: '3px',
                          padding: '2px 6px',
                          cursor: 'pointer',
                          fontSize: '9px'
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="mapper-canvas-container">
          <div 
            className="mapper-canvas"
            onClick={handleImageClick}
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setMousePosition(null)}
            style={{ userSelect: 'none' }}
          >
            {(() => {
              // Get image URL from current floor or fallback
              const imageUrl = currentFloorImage || floorPlanImage?.image?.url || `/images/hsipt_floorplan_lb03_8.webp`;
              return (
                <div style={{ position: 'relative', display: 'inline-block' }}>
                  <img
                    ref={imageRef}
                    src={imageUrl}
                    alt="Floor Plan"
                    className="mapper-image"
                    style={{ display: 'block' }}
                    onLoad={(e) => {
                      const img = e.target;
                      if (img.naturalWidth !== imageDimensions.width || img.naturalHeight !== imageDimensions.height) {
                        setImageDimensions({
                          width: img.naturalWidth || img.width,
                          height: img.naturalHeight || img.height
                        });
                      }
                    }}
                  />
                  
                  {/* SVG overlay for routes */}
                  <svg
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: '100%',
                      pointerEvents: routeMode ? 'auto' : 'none',
                      zIndex: 5
                    }}
                    viewBox={`0 0 ${imageDimensions.width || 1200} ${imageDimensions.height || 900}`}
                    preserveAspectRatio="xMidYMid meet"
                  >
                    {/* Render routes */}
                    {routes.map((route, routeIndex) => {
                      const fromMarker = markers.find(m => m.nodeId === route.from);
                      const toMarker = markers.find(m => m.nodeId === route.to);
                      if (!fromMarker || !toMarker) return null;

                      const fromCoords = { x: fromMarker.pixelX, y: fromMarker.pixelY };
                      const toCoords = { x: toMarker.pixelX, y: toMarker.pixelY };
                      const isSelected = selectedRoute === routeIndex;

                      // Build path string with waypoints
                      const waypoints = route.waypoints || [];
                      const pathPoints = [
                        fromCoords,
                        ...waypoints,
                        toCoords
                      ];

                      const pathString = pathPoints.map((point, index) => 
                        index === 0 ? `M ${point.pixelX || point.x} ${point.pixelY || point.y}` : `L ${point.pixelX || point.x} ${point.pixelY || point.y}`
                      ).join(' ');

                      return (
                        <g key={`route-${routeIndex}`} className="route-path">
                          <path
                            d={pathString}
                            stroke={isSelected ? "#4CAF50" : "#667eea"}
                            strokeWidth={isSelected ? 4 : 3}
                            fill="none"
                            strokeDasharray={isSelected ? "5,5" : "none"}
                            opacity={0.7}
                            style={{ cursor: 'pointer' }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedRoute(selectedRoute === routeIndex ? null : routeIndex);
                            }}
                          />
                          {/* Waypoint markers */}
                          {waypoints.map((wp, wpIndex) => (
                            <circle
                              key={`wp-${routeIndex}-${wpIndex}`}
                              cx={wp.pixelX || wp.x}
                              cy={wp.pixelY || wp.y}
                              r={4}
                              fill="#ff9800"
                              stroke="white"
                              strokeWidth={2}
                              style={{ cursor: 'pointer', pointerEvents: 'auto' }}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedRoute(routeIndex);
                              }}
                              onMouseDown={(e) => handleWaypointDragStart(routeIndex, wpIndex, e)}
                            />
                          ))}
                        </g>
                      );
                    })}

                    {/* Render active route being created */}
                    {routeMode && routeFrom && (
                      <>
                        {(() => {
                          const fromMarker = markers.find(m => m.nodeId === routeFrom);
                          if (!fromMarker) return null;

                          const fromCoords = { x: fromMarker.pixelX, y: fromMarker.pixelY };
                          const pathPoints = [
                            fromCoords,
                            ...routeWaypoints
                          ];

                          // Add mouse position to path if available
                          if (mousePosition) {
                            pathPoints.push(mousePosition);
                          }

                          // If mouse is over image, show preview line
                          const pathString = pathPoints.map((point, index) => 
                            index === 0 ? `M ${point.pixelX || point.x} ${point.pixelY || point.y}` : `L ${point.pixelX || point.x} ${point.pixelY || point.y}`
                          ).join(' ');

                          return (
                            <g className="route-preview">
                              <path
                                d={pathString}
                                stroke="#4CAF50"
                                strokeWidth={3}
                                fill="none"
                                strokeDasharray="5,5"
                                opacity={0.6}
                              />
                              {/* Render waypoints */}
                              {routeWaypoints.map((wp, wpIndex) => (
                                <circle
                                  key={`preview-wp-${wpIndex}`}
                                  cx={wp.pixelX || wp.x}
                                  cy={wp.pixelY || wp.y}
                                  r={5}
                                  fill="#4CAF50"
                                  stroke="white"
                                  strokeWidth={2}
                                  style={{ cursor: 'pointer', pointerEvents: 'auto' }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    // Remove waypoint on click
                                    setRouteWaypoints(routeWaypoints.filter((_, i) => i !== wpIndex));
                                  }}
                                />
                              ))}
                              {/* Render dot at mouse position */}
                              {mousePosition && (
                                <circle
                                  cx={mousePosition.x}
                                  cy={mousePosition.y}
                                  r={3}
                                  fill="#4CAF50"
                                  opacity={0.5}
                                />
                              )}
                            </g>
                          );
                        })()}
                      </>
                    )}

                    {/* Render anchors for all markers */}
                    {markers.map(marker => {
                      if (!marker.anchors || marker.anchors.length === 0) return null;
                      const isMarkerSelected = selectedMarker?.id === marker.id;
                      
                      return marker.anchors.map((anchor, anchorIdx) => {
                        const isDraggingThisAnchor = 
                          draggingAnchor?.nodeId === marker.id && 
                          draggingAnchor?.anchorIndex === anchorIdx;
                        
                        return (
                          <g key={`anchor-${marker.id}-${anchorIdx}`}>
                            {/* Line from marker center to anchor */}
                            <line
                              x1={marker.pixelX}
                              y1={marker.pixelY}
                              x2={anchor.pixelX}
                              y2={anchor.pixelY}
                              stroke={isMarkerSelected ? "#9c27b0" : "#666"}
                              strokeWidth={isMarkerSelected ? 2 : 1}
                              strokeDasharray="3,3"
                              opacity={isMarkerSelected ? 0.8 : 0.4}
                            />
                            {/* Anchor point (diamond shape) */}
                            <polygon
                              points={`${anchor.pixelX},${anchor.pixelY - 8} ${anchor.pixelX + 8},${anchor.pixelY} ${anchor.pixelX},${anchor.pixelY + 8} ${anchor.pixelX - 8},${anchor.pixelY}`}
                              fill={isMarkerSelected ? "#9c27b0" : "#666"}
                              stroke="white"
                              strokeWidth={2}
                              style={{ 
                                cursor: isMarkerSelected ? 'move' : 'pointer', 
                                pointerEvents: 'auto',
                                transition: isDraggingThisAnchor ? 'none' : 'all 0.1s ease-out'
                              }}
                              onMouseDown={(e) => {
                                if (isMarkerSelected) {
                                  handleAnchorDragStart(marker, anchorIdx, e);
                                }
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedMarker(marker);
                              }}
                            />
                            {/* Anchor label */}
                            {isMarkerSelected && (
                              <text
                                x={anchor.pixelX + 12}
                                y={anchor.pixelY + 4}
                                fill="#9c27b0"
                                fontSize="10"
                                fontWeight="bold"
                              >
                                {anchor.id}
                              </text>
                            )}
                          </g>
                        );
                      });
                    })}

                    {/* Preview anchor placement in anchor mode */}
                    {anchorMode && selectedMarker && mousePosition && (
                      <g>
                        <line
                          x1={selectedMarker.pixelX}
                          y1={selectedMarker.pixelY}
                          x2={mousePosition.x}
                          y2={mousePosition.y}
                          stroke="#9c27b0"
                          strokeWidth={2}
                          strokeDasharray="5,5"
                          opacity={0.6}
                        />
                        <polygon
                          points={`${mousePosition.x},${mousePosition.y - 8} ${mousePosition.x + 8},${mousePosition.y} ${mousePosition.x},${mousePosition.y + 8} ${mousePosition.x - 8},${mousePosition.y}`}
                          fill="#9c27b0"
                          stroke="white"
                          strokeWidth={2}
                          opacity={0.6}
                        />
                      </g>
                    )}
                  </svg>
                  
                  {/* Render markers - positioned relative to the image wrapper */}
                  {markers.map(marker => {
                    const isSelected = selectedMarker?.id === marker.id;
                    const isDraggingThis = draggingMarkerId === marker.id;
                    
                    // Use drag position if this marker is being dragged, otherwise use marker position
                    const pixelX = isDraggingThis ? dragPosition.x : marker.pixelX;
                    const pixelY = isDraggingThis ? dragPosition.y : marker.pixelY;
                    const displayCoords = getDisplayCoords(pixelX, pixelY);
                    
                    return (
                      <div
                        key={marker.id}
                        className={`marker ${isSelected ? 'selected' : ''} ${isDraggingThis ? 'dragging' : ''}`}
                        style={{
                          position: 'absolute',
                          left: `${displayCoords.x}px`,
                          top: `${displayCoords.y}px`,
                          transform: 'translate(-50%, -50%)',
                          transition: isDraggingThis ? 'none' : 'all 0.1s ease-out',
                          cursor: isDragging ? 'grabbing' : 'grab'
                        }}
                        onClick={(e) => {
                          if (!isDragging) {
                            handleMarkerClick(marker, e);
                          }
                        }}
                        onMouseDown={(e) => handleMarkerDragStart(marker, e)}
                      >
                  <div className="marker-dot"></div>
                  <div className="marker-label">{marker.nodeId}</div>
                  {isSelected && (
                    <div className="marker-info">
                      <div>X: {marker.pixelX}</div>
                      <div>Y: {marker.pixelY}</div>
                      <input
                        type="text"
                        value={marker.nodeId}
                        onChange={(e) => handleUpdateNodeId(marker.id, e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        placeholder="Node ID"
                      />
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          console.log('Delete button clicked for marker:', marker);
                          
                          const nodeId = marker.nodeId || marker.id;
                          const connectedRoutes = routes.filter(r => 
                            r.from === nodeId || r.to === nodeId
                          );
                          
                          console.log('Connected routes:', connectedRoutes);
                          
                          let shouldDelete = false;
                          
                          if (connectedRoutes.length > 0) {
                            const confirmMessage = `Delete node "${nodeId}"?\n\nThis will also delete ${connectedRoutes.length} connected route(s):\n${connectedRoutes.map(r => `  • ${r.from} → ${r.to}`).join('\n')}\n\nAre you sure?`;
                            shouldDelete = window.confirm(confirmMessage);
                          } else {
                            shouldDelete = window.confirm(`Delete node "${nodeId}"?`);
                          }
                          
                          if (shouldDelete) {
                            console.log('User confirmed deletion, calling handleDeleteMarker');
                            handleDeleteMarker(marker.id);
                          } else {
                            console.log('User cancelled deletion');
                          }
                        }}
                        className="btn-delete-marker"
                        type="button"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        </div>

        <div className="marker-list">
          <h3>Markers ({markers.length})</h3>
          <div className="marker-list-content">
            {markers.map(marker => (
              <div
                key={marker.id}
                className={`marker-list-item ${selectedMarker?.id === marker.id ? 'selected' : ''}`}
                onClick={() => setSelectedMarker(marker)}
              >
                <div className="marker-list-name">{marker.nodeId}</div>
                <div className="marker-list-coords">
                  ({marker.pixelX}, {marker.pixelY})
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CoordinateMapper;

