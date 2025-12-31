/**
 * Advanced Path Visualization Engine
 * 
 * Features:
 * - 3D path visualization
 * - Heat maps for route popularity
 * - Interactive path exploration
 * - Real-time path updates
 * - AR-style overlays
 * - Advanced animations
 */

class AdvancedPathVisualizer {
  constructor(floorPlanData, options = {}) {
    this.floorPlanData = floorPlanData;
    this.options = {
      enable3D: true,
      enableHeatMap: true,
      enableAR: false,
      animationSpeed: 1.0,
      pathWidth: 8,
      glowIntensity: 0.6,
      ...options
    };

    // Route popularity tracking for heat maps
    this.routePopularity = new Map();
    
    // Path history for analytics
    this.pathHistory = [];
  }

  /**
   * Generate 3D path visualization with elevation
   */
  generate3DPath(path, floorPlanData) {
    const segments = [];
    const floors = [...new Set(path.map(n => n.floor))];
    
    floors.forEach((floor, floorIdx) => {
      const floorPath = path.filter(n => n.floor === floor);
      const floorData = this.getFloorData(floor, floorPlanData);
      
      if (!floorData) return;

      floorPath.forEach((node, idx) => {
        if (idx === floorPath.length - 1) return;
        
        const next = floorPath[idx + 1];
        const coords = this.getNodeCoords(node, floorData);
        const nextCoords = this.getNodeCoords(next, floorData);
        
        if (!coords || !nextCoords) return;

        // Calculate 3D position (z = floor * elevation)
        const elevation = floor * 50; // 50px per floor
        const z1 = elevation;
        const z2 = next.floor * 50;

        segments.push({
          id: `segment-3d-${floor}-${idx}`,
          from: {
            x: coords.x,
            y: coords.y,
            z: z1,
            floor: floor
          },
          to: {
            x: nextCoords.x,
            y: nextCoords.y,
            z: z2,
            floor: next.floor
          },
          isFloorChange: next.floor !== floor,
          style: {
            stroke: this.getPathColor(floor),
            strokeWidth: this.options.pathWidth,
            opacity: 0.9
          }
        });
      });
    });

    return {
      type: '3d',
      segments,
      camera: {
        position: { x: 0, y: 0, z: 200 },
        target: { x: 0, y: 0, z: 0 },
        fov: 60
      },
      lighting: {
        ambient: 0.6,
        directional: { x: 0.5, y: 0.5, z: 1 }
      }
    };
  }

  /**
   * Generate heat map based on route popularity
   */
  generateHeatMap(floorPlanData, floorNumber) {
    const floorData = this.getFloorData(floorNumber, floorPlanData);
    if (!floorData) return null;

    const heatMapData = [];
    const maxPopularity = Math.max(...Array.from(this.routePopularity.values()), 1);

    this.routePopularity.forEach((count, routeKey) => {
      const [from, to] = routeKey.split('->');
      const fromNode = floorData.nodes?.find(n => n.id === from);
      const toNode = floorData.nodes?.find(n => n.id === to);

      if (!fromNode || !toNode) return;

      const intensity = count / maxPopularity;
      
      heatMapData.push({
        from: { x: fromNode.pixelX, y: fromNode.pixelY },
        to: { x: toNode.pixelX, y: toNode.pixelY },
        intensity,
        count,
        color: this.getHeatMapColor(intensity)
      });
    });

    return {
      type: 'heatmap',
      floor: floorNumber,
      data: heatMapData,
      maxIntensity: maxPopularity
    };
  }

  /**
   * Get heat map color based on intensity
   */
  getHeatMapColor(intensity) {
    // Blue (cold) -> Green -> Yellow -> Red (hot)
    if (intensity < 0.25) {
      return `rgba(59, 130, 246, ${intensity * 2})`; // Blue
    } else if (intensity < 0.5) {
      return `rgba(34, 197, 94, ${intensity * 2})`; // Green
    } else if (intensity < 0.75) {
      return `rgba(234, 179, 8, ${intensity * 2})`; // Yellow
    } else {
      return `rgba(239, 68, 68, intensity)`; // Red
    }
  }

  /**
   * Track route usage for heat map
   */
  trackRoute(path) {
    for (let i = 0; i < path.length - 1; i++) {
      const routeKey = `${path[i].id}->${path[i + 1].id}`;
      const current = this.routePopularity.get(routeKey) || 0;
      this.routePopularity.set(routeKey, current + 1);
    }
    
    // Store in history
    this.pathHistory.push({
      timestamp: Date.now(),
      path: path.map(n => n.id),
      length: path.length
    });
  }

  /**
   * Generate interactive path with waypoints
   */
  generateInteractivePath(path, floorPlanData) {
    const interactiveElements = [];
    
    path.forEach((node, idx) => {
      const floorData = this.getFloorData(node.floor, floorPlanData);
      if (!floorData) return;

      const coords = this.getNodeCoords(node, floorData);
      if (!coords) return;

      const isStart = idx === 0;
      const isEnd = idx === path.length - 1;
      const isLandmark = this.isLandmark(node);

      interactiveElements.push({
        id: `interactive-${node.id}`,
        type: isStart ? 'start' : isEnd ? 'end' : isLandmark ? 'landmark' : 'waypoint',
        position: coords,
        node: {
          id: node.id,
          name: this.formatNodeName(node.name),
          floor: node.floor,
          type: node.type,
          description: node.description
        },
        interactions: {
          click: {
            action: 'showInfo',
            data: node
          },
          hover: {
            action: 'highlight',
            data: node
          }
        },
        style: {
          size: isStart || isEnd ? 24 : isLandmark ? 18 : 12,
          color: this.getMarkerColor(node, isStart, isEnd),
          glow: isStart || isEnd || isLandmark
        }
      });
    });

    return {
      type: 'interactive',
      elements: interactiveElements,
      path: this.generateSmoothPath(path, floorPlanData)
    };
  }

  /**
   * Generate AR-style overlay visualization
   */
  generateAROverlay(path, floorPlanData, userPosition = null) {
    const overlay = {
      type: 'ar',
      elements: [],
      userPosition: userPosition,
      path: []
    };

    path.forEach((node, idx) => {
      const floorData = this.getFloorData(node.floor, floorPlanData);
      if (!floorData) return;

      const coords = this.getNodeCoords(node, floorData);
      if (!coords) return;

      // Calculate distance from user if position provided
      let distance = null;
      if (userPosition) {
        const dx = coords.x - userPosition.x;
        const dy = coords.y - userPosition.y;
        distance = Math.sqrt(dx * dx + dy * dy);
      }

      overlay.elements.push({
        id: `ar-${node.id}`,
        position: coords,
        node: node,
        distance,
        direction: idx < path.length - 1 ? this.calculateDirection(node, path[idx + 1]) : null,
        arType: idx === 0 ? 'start' : idx === path.length - 1 ? 'destination' : 'waypoint',
        style: {
          icon: this.getARIcon(node, idx, path.length),
          color: this.getMarkerColor(node, idx === 0, idx === path.length - 1),
          size: distance ? Math.max(20, 100 - distance / 10) : 30
        }
      });
    });

    return overlay;
  }

  /**
   * Generate animated path with advanced effects
   */
  generateAnimatedPath(path, floorPlanData) {
    const animation = {
      type: 'advanced',
      segments: [],
      effects: []
    };

    // Generate path segments with timing
    let totalDuration = 0;
    
    path.forEach((node, idx) => {
      if (idx === path.length - 1) return;

      const next = path[idx + 1];
      const floorData = this.getFloorData(node.floor, floorPlanData);
      if (!floorData) return;

      const coords = this.getNodeCoords(node, floorData);
      const nextCoords = this.getNodeCoords(next, floorData);
      
      if (!coords || !nextCoords) return;

      const segmentDuration = this.calculateSegmentDuration(node, next);
      
      animation.segments.push({
        id: `anim-segment-${idx}`,
        from: coords,
        to: nextCoords,
        duration: segmentDuration,
        delay: totalDuration,
        easing: 'ease-in-out',
        effects: this.getSegmentEffects(node, next)
      });

      totalDuration += segmentDuration;
    });

    // Add global effects
    animation.effects.push({
      type: 'pulse',
      target: 'markers',
      duration: 2000,
      repeat: true
    });

    animation.effects.push({
      type: 'glow',
      target: 'path',
      intensity: this.options.glowIntensity,
      color: '#4A90D9'
    });

    return animation;
  }

  /**
   * Calculate segment duration based on distance and type
   */
  calculateSegmentDuration(from, to) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    // Base speed: 100px per second
    const baseSpeed = 100;
    let speed = baseSpeed;
    
    // Adjust for floor changes
    if (to.floorChange || to.floor !== from.floor) {
      speed *= 0.5; // Slower for floor changes
    }
    
    // Adjust for node type
    if (to.type === 'elevator' || to.type === 'stairs') {
      speed *= 0.7; // Slower for transitions
    }
    
    return (distance / speed) * 1000; // Convert to milliseconds
  }

  /**
   * Get segment-specific effects
   */
  getSegmentEffects(from, to) {
    const effects = [];
    
    if (to.floorChange) {
      effects.push({
        type: 'floor-change',
        icon: to.type === 'elevator' ? '🛗' : '🪜',
        animation: 'bounce'
      });
    }
    
    if (this.isLandmark(to)) {
      effects.push({
        type: 'landmark',
        highlight: true,
        pulse: true
      });
    }
    
    return effects;
  }

  /**
   * Generate comprehensive visualization
   */
  generateComprehensiveVisualization(path, floorPlanData, options = {}) {
    const opts = { ...this.options, ...options };
    
    // Track route for heat map
    this.trackRoute(path);

    const visualization = {
      path,
      timestamp: Date.now(),
      visualizations: {}
    };

    // 2D smooth path
    visualization.visualizations.smooth2D = this.generateSmoothPath(path, floorPlanData);

    // 3D path if enabled
    if (opts.enable3D) {
      visualization.visualizations.path3D = this.generate3DPath(path, floorPlanData);
    }

    // Interactive path
    visualization.visualizations.interactive = this.generateInteractivePath(path, floorPlanData);

    // Animated path
    visualization.visualizations.animated = this.generateAnimatedPath(path, floorPlanData);

    // Heat map for each floor
    if (opts.enableHeatMap) {
      const floors = [...new Set(path.map(n => n.floor))];
      visualization.visualizations.heatMaps = {};
      floors.forEach(floor => {
        visualization.visualizations.heatMaps[floor] = this.generateHeatMap(floorPlanData, floor);
      });
    }

    // AR overlay if enabled
    if (opts.enableAR) {
      visualization.visualizations.arOverlay = this.generateAROverlay(path, floorPlanData);
    }

    return visualization;
  }

  /**
   * Generate smooth path using Bezier curves (from base class)
   */
  generateSmoothPath(path, floorPlanData) {
    const segments = [];
    
    for (let i = 0; i < path.length - 1; i++) {
      const current = path[i];
      const next = path[i + 1];
      const floorData = this.getFloorData(current.floor, floorPlanData);
      
      if (!floorData) continue;

      const coords = this.getNodeCoords(current, floorData);
      const nextCoords = this.getNodeCoords(next, floorData);
      
      if (!coords || !nextCoords) continue;

      // Get waypoints
      const waypoints = this.getWaypoints(current.id, next.id, floorData);
      
      // Generate smooth curve
      const points = [coords, ...waypoints, nextCoords];
      const pathData = this.generateBezierPath(points);
      
      segments.push({
        id: `smooth-${i}`,
        pathData,
        from: current.id,
        to: next.id,
        style: {
          stroke: this.getPathColor(current.floor),
          strokeWidth: this.options.pathWidth,
          fill: 'none',
          strokeLinecap: 'round',
          strokeLinejoin: 'round'
        }
      });
    }

    return { type: 'smooth2d', segments };
  }

  /**
   * Generate Bezier curve path
   */
  generateBezierPath(points) {
    if (points.length < 2) return '';
    if (points.length === 2) {
      return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
    }

    let path = `M ${points[0].x} ${points[0].y}`;
    const tension = 0.3;

    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[Math.max(0, i - 1)];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[Math.min(points.length - 1, i + 2)];

      const cp1x = p1.x + (p2.x - p0.x) * tension;
      const cp1y = p1.y + (p2.y - p0.y) * tension;
      const cp2x = p2.x - (p3.x - p1.x) * tension;
      const cp2y = p2.y - (p3.y - p1.y) * tension;

      path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
    }

    return path;
  }

  /**
   * Helper methods
   */
  getFloorData(floor, floorPlanData) {
    if (!floorPlanData?.floors) return null;
    return floorPlanData.floors.find(f => f.floor === floor);
  }

  getNodeCoords(node, floorData) {
    const floorNode = floorData.nodes?.find(n => n.id === node.id);
    if (floorNode) {
      return { x: floorNode.pixelX, y: floorNode.pixelY };
    }
    return { x: node.x * 10, y: node.y * 10 };
  }

  getWaypoints(fromId, toId, floorData) {
    const pathDef = floorData.paths?.find(p => 
      (p.from === fromId && p.to === toId) || (p.from === toId && p.to === fromId)
    );
    return pathDef?.waypoints?.map(wp => ({ x: wp.pixelX, y: wp.pixelY })) || [];
  }

  getPathColor(floor) {
    const colors = ['#0D1B3E', '#152952', '#1E3A5F', '#254A6B', '#2D5A78'];
    return colors[floor % colors.length] || '#0D1B3E';
  }

  getMarkerColor(node, isStart, isEnd) {
    if (isStart) return '#10B981';
    if (isEnd) return '#EF4444';
    if (node.type === 'elevator') return '#4A90D9';
    if (node.type === 'stairs') return '#F59E0B';
    return '#6B7280';
  }

  isLandmark(node) {
    return ['entrance', 'elevator', 'stairs', 'reception', 'lobby'].includes(node.type);
  }

  formatNodeName(name) {
    return name.replace(/^hsitp_/i, '').replace(/_/g, ' ')
      .split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }

  calculateDirection(from, to) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);
    
    if (angle >= -45 && angle < 45) return 'east';
    if (angle >= 45 && angle < 135) return 'south';
    if (angle >= 135 || angle < -135) return 'west';
    return 'north';
  }

  getARIcon(node, idx, total) {
    if (idx === 0) return '🚩';
    if (idx === total - 1) return '🎯';
    if (node.type === 'elevator') return '🛗';
    if (node.type === 'stairs') return '🪜';
    return '📍';
  }

  /**
   * Get analytics data
   */
  getAnalytics() {
    return {
      totalRoutes: this.pathHistory.length,
      popularRoutes: Array.from(this.routePopularity.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([route, count]) => ({ route, count })),
      avgPathLength: this.pathHistory.length > 0
        ? this.pathHistory.reduce((sum, p) => sum + p.length, 0) / this.pathHistory.length
        : 0
    };
  }
}

module.exports = AdvancedPathVisualizer;

