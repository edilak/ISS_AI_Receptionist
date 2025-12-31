/**
 * Path Visualization Engine
 * 
 * Generates smooth, visually appealing path representations
 * using Bezier curves and proper corridor geometry.
 */

class PathVisualizer {
  constructor(floorPlanData, options = {}) {
    this.floorPlanData = floorPlanData;
    this.options = {
      smoothing: 0.3,        // Bezier control point distance factor
      pathWidth: 6,          // Base path stroke width
      cornerRadius: 15,      // Radius for path corners
      animationDuration: 2,  // Seconds for path animation
      showWaypoints: true,
      showLabels: true,
      pathColor: '#0D1B3E',  // ISS Navy
      accentColor: '#4A90D9', // ISS Blue
      ...options
    };
  }

  /**
   * Generate visualization data for a path
   */
  generateVisualization(path, floorNumber) {
    if (!path || path.length < 2) {
      return { segments: [], markers: [], labels: [] };
    }

    const floorData = this.getFloorData(floorNumber);
    if (!floorData) {
      console.warn(`No floor data for floor ${floorNumber}`);
      return this.generateBasicVisualization(path);
    }

    const visualization = {
      floor: floorNumber,
      floorName: floorData.name || `Floor ${floorNumber}`,
      floorImage: floorData.imageUrl,
      imageScale: floorData.scale || 1,
      segments: [],
      markers: [],
      labels: [],
      bounds: this.calculateBounds(path, floorData),
      animation: {
        duration: this.options.animationDuration,
        type: 'draw'
      }
    };

    // Filter path for current floor
    const floorPath = path.filter(node => node.floor === floorNumber);
    
    // Generate smooth path segments
    visualization.segments = this.generateSmoothSegments(floorPath, floorData);
    
    // Generate markers for key points
    visualization.markers = this.generateMarkers(floorPath, path);
    
    // Generate labels
    if (this.options.showLabels) {
      visualization.labels = this.generateLabels(floorPath);
    }

    return visualization;
  }

  /**
   * Get floor data from floor plan configuration
   */
  getFloorData(floorNumber) {
    if (!this.floorPlanData?.floors) return null;
    return this.floorPlanData.floors.find(f => f.floor === floorNumber);
  }

  /**
   * Generate smooth curved segments using Bezier curves
   */
  generateSmoothSegments(floorPath, floorData) {
    const segments = [];
    
    for (let i = 0; i < floorPath.length - 1; i++) {
      const current = floorPath[i];
      const next = floorPath[i + 1];
      
      // Get pixel coordinates
      const startPoint = this.getNodePixelCoords(current, floorData);
      const endPoint = this.getNodePixelCoords(next, floorData);
      
      if (!startPoint || !endPoint) continue;

      // Get waypoints if available
      const waypoints = this.getWaypoints(current.id, next.id, floorData);
      
      // Generate path points with smoothing
      const pathPoints = this.generateSmoothPath(startPoint, endPoint, waypoints);
      
      // Create SVG path data
      const pathData = this.generateSVGPath(pathPoints);
      
      segments.push({
        id: `segment-${i}`,
        from: current.id,
        to: next.id,
        pathData,
        points: pathPoints,
        length: this.calculatePathLength(pathPoints),
        isFloorChange: next.floorChange || false,
        style: {
          stroke: this.options.pathColor,
          strokeWidth: this.options.pathWidth,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          fill: 'none'
        },
        animation: {
          delay: i * 0.3,
          duration: 0.5
        }
      });
    }

    return segments;
  }

  /**
   * Generate smooth path using Catmull-Rom splines converted to Bezier
   */
  generateSmoothPath(start, end, waypoints = []) {
    const points = [start, ...waypoints, end];
    
    if (points.length === 2) {
      // Direct line
      return points;
    }

    // Generate smooth curve through all points
    const smoothPoints = [];
    const tension = 0.5;
    
    for (let i = 0; i < points.length; i++) {
      smoothPoints.push(points[i]);
      
      // Add intermediate points for smoothing
      if (i < points.length - 1) {
        const p0 = points[Math.max(0, i - 1)];
        const p1 = points[i];
        const p2 = points[i + 1];
        const p3 = points[Math.min(points.length - 1, i + 2)];
        
        // Catmull-Rom to Bezier conversion
        const cp1 = {
          x: p1.x + (p2.x - p0.x) * tension / 6,
          y: p1.y + (p2.y - p0.y) * tension / 6
        };
        
        const cp2 = {
          x: p2.x - (p3.x - p1.x) * tension / 6,
          y: p2.y - (p3.y - p1.y) * tension / 6
        };
        
        // Add control points (marked for Bezier curve generation)
        smoothPoints.push({ ...cp1, isControlPoint: true, cpType: 'start' });
        smoothPoints.push({ ...cp2, isControlPoint: true, cpType: 'end' });
      }
    }

    return smoothPoints;
  }

  /**
   * Generate SVG path data string
   */
  generateSVGPath(points) {
    if (points.length < 2) return '';

    let pathData = `M ${points[0].x} ${points[0].y}`;
    
    let i = 1;
    while (i < points.length) {
      if (points[i].isControlPoint && points[i].cpType === 'start' && 
          i + 2 < points.length && points[i + 1].isControlPoint) {
        // Cubic Bezier curve
        const cp1 = points[i];
        const cp2 = points[i + 1];
        const end = points[i + 2];
        pathData += ` C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${end.x} ${end.y}`;
        i += 3;
      } else if (!points[i].isControlPoint) {
        // Line to
        pathData += ` L ${points[i].x} ${points[i].y}`;
        i++;
      } else {
        i++;
      }
    }

    return pathData;
  }

  /**
   * Generate markers for path nodes
   */
  generateMarkers(floorPath, fullPath) {
    const markers = [];
    
    floorPath.forEach((node, idx) => {
      const isStart = fullPath[0]?.id === node.id;
      const isEnd = fullPath[fullPath.length - 1]?.id === node.id;
      const isFloorChange = node.floorChange || node.type === 'elevator' || node.type === 'stairs';
      
      const floorData = this.getFloorData(node.floor);
      const coords = this.getNodePixelCoords(node, floorData);
      
      if (!coords) return;

      markers.push({
        id: `marker-${node.id}`,
        nodeId: node.id,
        x: coords.x,
        y: coords.y,
        type: this.getMarkerType(node, isStart, isEnd, isFloorChange),
        size: this.getMarkerSize(isStart, isEnd),
        color: this.getMarkerColor(node, isStart, isEnd),
        icon: this.getMarkerIcon(node, isStart, isEnd),
        label: this.formatNodeLabel(node.name),
        animation: {
          delay: idx * 0.1,
          scale: isStart || isEnd ? 1.2 : 1
        },
        tooltip: {
          title: this.formatNodeLabel(node.name),
          subtitle: node.type,
          floor: node.floor === 0 ? 'G/F' : `${node.floor}/F`
        }
      });
    });

    return markers;
  }

  /**
   * Generate labels for important points
   */
  generateLabels(floorPath) {
    const labels = [];
    
    floorPath.forEach((node, idx) => {
      // Only label start, end, and important waypoints
      if (idx === 0 || idx === floorPath.length - 1 || 
          node.type === 'elevator' || node.type === 'stairs') {
        
        const floorData = this.getFloorData(node.floor);
        const coords = this.getNodePixelCoords(node, floorData);
        
        if (!coords) return;

        labels.push({
          id: `label-${node.id}`,
          text: this.formatNodeLabel(node.name),
          x: coords.x,
          y: coords.y - 25,
          anchor: 'middle',
          style: {
            fontSize: 12,
            fontWeight: idx === 0 || idx === floorPath.length - 1 ? 'bold' : 'normal',
            fill: this.options.pathColor
          }
        });
      }
    });

    return labels;
  }

  /**
   * Get pixel coordinates for a node
   */
  getNodePixelCoords(node, floorData) {
    if (!floorData?.nodes) {
      // Fallback to basic coordinates
      return { x: node.x * 10, y: node.y * 10 };
    }

    // Find node in floor plan data
    const floorNode = floorData.nodes.find(n => n.id === node.id);
    if (floorNode) {
      return { x: floorNode.pixelX, y: floorNode.pixelY };
    }

    // Fallback
    return { x: node.x * 10, y: node.y * 10 };
  }

  /**
   * Get waypoints between two nodes
   */
  getWaypoints(fromId, toId, floorData) {
    if (!floorData?.paths) return [];

    // Find path configuration
    const pathConfig = floorData.paths.find(p => 
      (p.fromNode === fromId && p.toNode === toId) ||
      (p.fromNode === toId && p.toNode === fromId)
    );

    if (!pathConfig?.waypoints) return [];

    // Return waypoints in correct order
    let waypoints = pathConfig.waypoints.map(wp => ({
      x: wp.pixelX,
      y: wp.pixelY
    }));

    // Reverse if path is in opposite direction
    if (pathConfig.fromNode === toId) {
      waypoints = waypoints.reverse();
    }

    return waypoints;
  }

  /**
   * Calculate path length
   */
  calculatePathLength(points) {
    let length = 0;
    for (let i = 1; i < points.length; i++) {
      if (!points[i].isControlPoint && !points[i - 1].isControlPoint) {
        const dx = points[i].x - points[i - 1].x;
        const dy = points[i].y - points[i - 1].y;
        length += Math.sqrt(dx * dx + dy * dy);
      }
    }
    return length;
  }

  /**
   * Calculate bounding box for path
   */
  calculateBounds(path, floorData) {
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    path.forEach(node => {
      const coords = this.getNodePixelCoords(node, floorData);
      if (coords) {
        minX = Math.min(minX, coords.x);
        minY = Math.min(minY, coords.y);
        maxX = Math.max(maxX, coords.x);
        maxY = Math.max(maxY, coords.y);
      }
    });

    const padding = 50;
    return {
      x: minX - padding,
      y: minY - padding,
      width: maxX - minX + padding * 2,
      height: maxY - minY + padding * 2
    };
  }

  /**
   * Get marker type
   */
  getMarkerType(node, isStart, isEnd, isFloorChange) {
    if (isStart) return 'start';
    if (isEnd) return 'end';
    if (isFloorChange) return 'floor-change';
    return 'waypoint';
  }

  /**
   * Get marker size
   */
  getMarkerSize(isStart, isEnd) {
    return isStart || isEnd ? 20 : 12;
  }

  /**
   * Get marker color
   */
  getMarkerColor(node, isStart, isEnd) {
    if (isStart) return '#10B981'; // Green
    if (isEnd) return '#EF4444';   // Red
    if (node.type === 'elevator') return this.options.accentColor;
    if (node.type === 'stairs') return '#F59E0B'; // Orange
    return this.options.pathColor;
  }

  /**
   * Get marker icon
   */
  getMarkerIcon(node, isStart, isEnd) {
    if (isStart) return '🚩';
    if (isEnd) return '🎯';
    if (node.type === 'elevator') return '🛗';
    if (node.type === 'stairs') return '🪜';
    if (node.type === 'facility') return '🚻';
    return '📍';
  }

  /**
   * Format node label for display
   */
  formatNodeLabel(name) {
    if (!name) return '';
    return name
      .replace(/^hsitp_/i, '')
      .replace(/_/g, ' ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ')
      .replace(/(\d)$/, '($1/F)');
  }

  /**
   * Generate basic visualization without floor plan data
   */
  generateBasicVisualization(path) {
    const segments = [];
    const markers = [];

    // Simple line segments
    for (let i = 0; i < path.length - 1; i++) {
      const current = path[i];
      const next = path[i + 1];
      
      segments.push({
        id: `segment-${i}`,
        from: current.id,
        to: next.id,
        pathData: `M ${current.x * 10} ${current.y * 10} L ${next.x * 10} ${next.y * 10}`,
        style: {
          stroke: this.options.pathColor,
          strokeWidth: this.options.pathWidth
        }
      });
    }

    // Simple markers
    path.forEach((node, idx) => {
      markers.push({
        id: `marker-${node.id}`,
        x: node.x * 10,
        y: node.y * 10,
        type: idx === 0 ? 'start' : idx === path.length - 1 ? 'end' : 'waypoint',
        label: this.formatNodeLabel(node.name)
      });
    });

    return { segments, markers, labels: [] };
  }

  /**
   * Generate animated path data for frontend
   */
  generateAnimationData(visualization) {
    const { segments, markers } = visualization;
    
    // Calculate total path length for animation timing
    const totalLength = segments.reduce((sum, seg) => sum + (seg.length || 100), 0);
    
    // Generate animation keyframes
    const animations = {
      path: {
        duration: this.options.animationDuration,
        easing: 'ease-in-out',
        keyframes: segments.map((seg, idx) => ({
          segmentId: seg.id,
          startTime: (idx / segments.length) * this.options.animationDuration,
          duration: this.options.animationDuration / segments.length,
          strokeDasharray: seg.length || 100,
          strokeDashoffset: [seg.length || 100, 0]
        }))
      },
      markers: {
        type: 'sequential',
        duration: 0.3,
        delay: 0.1,
        keyframes: markers.map((marker, idx) => ({
          markerId: marker.id,
          startTime: idx * 0.15,
          scale: [0, 1.2, 1],
          opacity: [0, 1]
        }))
      }
    };

    return animations;
  }

  /**
   * Update floor plan data
   */
  updateFloorPlanData(newData) {
    this.floorPlanData = newData;
  }
}

module.exports = PathVisualizer;

