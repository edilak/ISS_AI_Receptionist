/**
 * Space Navigation Engine
 * 
 * Orchestrates continuous space navigation using RL agent.
 * Handles corridor/destination management, pathfinding, and visualization.
 */

const fs = require('fs');
const path = require('path');
const ContinuousSpaceRLAgent = require('./ContinuousSpaceRLAgent');

class SpaceNavigationEngine {
  constructor() {
    this.agent = new ContinuousSpaceRLAgent();

    // Space definitions
    this.corridors = [];
    this.destinations = [];
    this.gridSize = 10;

    // Floor plan info
    this.floorPlans = null;
    this.imageDimensions = {};

    // Training state
    this.isTraining = false;
    this.trainingProgress = 0;

    // Model persistence
    this.modelPath = path.join(__dirname, '../data/space_rl_model.json');
    this.definitionsPath = path.join(__dirname, '../data/space_definitions.json');

    // Initialize
    this.initialize();
  }

  /**
   * Initialize engine: load definitions and model
   */
  async initialize() {
    try {
      // Load floor plans for image dimensions
      const floorPlanPath = path.join(__dirname, '../data/hsitp_floorPlans.json');
      if (fs.existsSync(floorPlanPath)) {
        this.floorPlans = JSON.parse(fs.readFileSync(floorPlanPath, 'utf8'));

        // Extract image dimensions per floor
        for (const floor of this.floorPlans.floors) {
          this.imageDimensions[floor.floor] = {
            width: floor.image?.naturalWidth || floor.image?.width || 2400,
            height: floor.image?.naturalHeight || floor.image?.height || 1800
          };
        }
        console.log('✅ Floor plans loaded');
      }

      // Load space definitions
      await this.loadDefinitions();

      // OPTIONAL: Automatically trigger VI pre-computation on startup
      // Since it's fast now, we can just do it.
      if (this.corridors.length > 0 && this.destinations.length > 0) {
        console.log("🚀 Startup: Triggering navigation mesh compilation (Value Iteration)...");
        this.train();
      }

    } catch (error) {
      console.error('⚠️ Space Navigation Engine initialization error:', error.message);
    }
  }

  /**
   * Load space definitions (corridors & destinations)
   */
  async loadDefinitions() {
    try {
      if (fs.existsSync(this.definitionsPath)) {
        const data = JSON.parse(fs.readFileSync(this.definitionsPath, 'utf8'));
        this.corridors = data.corridors || [];
        this.destinations = data.destinations || [];
        this.gridSize = data.gridSize || 10;

        // Update agent environment
        this.updateAgentEnvironment();

        console.log(`✅ Space definitions loaded: ${this.corridors.length} corridors, ${this.destinations.length} destinations`);
        return true;
      }
    } catch (error) {
      console.warn('⚠️ Could not load space definitions:', error.message);
    }
    return false;
  }

  /**
   * Save space definitions
   */
  async saveDefinitions(data) {
    try {
      this.corridors = data.corridors || this.corridors;
      this.destinations = data.destinations || this.destinations;
      this.gridSize = data.gridSize || this.gridSize;

      // Ensure data directory exists
      const dataDir = path.dirname(this.definitionsPath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      fs.writeFileSync(this.definitionsPath, JSON.stringify({
        corridors: this.corridors,
        destinations: this.destinations,
        gridSize: this.gridSize,
        savedAt: new Date().toISOString()
      }, null, 2));

      // Update agent environment
      this.updateAgentEnvironment();

      console.log(`✅ Space definitions saved: ${this.corridors.length} corridors, ${this.destinations.length} destinations`);
      return true;
    } catch (error) {
      console.error('❌ Error saving space definitions:', error.message);
      return false;
    }
  }

  /**
   * Update agent with current environment
   */
  updateAgentEnvironment() {
    // Filter corridors/destinations for current floor
    const floor1Corridors = this.corridors.filter(c => c.floor === 1);
    const floor1Destinations = this.destinations.filter(d => d.floor === 1);

    // Calculate actual dimensions from corridor data to ensure all areas are covered
    let maxX = 0, maxY = 0;
    for (const corridor of floor1Corridors) {
      if (corridor.polygon) {
        for (const point of corridor.polygon) {
          maxX = Math.max(maxX, point[0]);
          maxY = Math.max(maxY, point[1]);
        }
      }
    }
    for (const dest of floor1Destinations) {
      maxX = Math.max(maxX, dest.x);
      maxY = Math.max(maxY, dest.y);
    }

    // Add padding and ensure minimum size
    const dims = {
      width: Math.max(maxX + 100, this.imageDimensions[1]?.width || 2400),
      height: Math.max(maxY + 100, this.imageDimensions[1]?.height || 1800)
    };

    console.log(`📐 Calculated navigation space: ${dims.width}x${dims.height} (from ${floor1Corridors.length} corridors)`);

    this.agent.setEnvironment(floor1Corridors, floor1Destinations, dims);
  }

  /**
   * Load trained RL model
   */
  async loadModel() {
    try {
      if (fs.existsSync(this.modelPath)) {
        const data = JSON.parse(fs.readFileSync(this.modelPath, 'utf8'));
        this.agent.importModel(data);
        return true;
      }
    } catch (error) {
      console.warn('⚠️ Could not load RL model:', error.message);
    }
    return false;
  }

  /**
   * Save trained RL model
   */
  async saveModel() {
    try {
      const data = this.agent.exportModel();

      const dataDir = path.dirname(this.modelPath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      fs.writeFileSync(this.modelPath, JSON.stringify(data, null, 2));
      console.log('✅ RL model saved');
      return true;
    } catch (error) {
      console.error('❌ Error saving RL model:', error.message);
      return false;
    }
  }

  /**
   * Train the RL agent (Value Iteration)
   * This performs the global optimization for pathfinding values.
   */
  train(episodes = 0) {
    if (this.isTraining) {
      return { success: false, error: 'Training already in progress' };
    }

    if (this.corridors.length === 0) {
      return { success: false, error: 'No corridors defined. Use the Space Editor to define navigable areas.' };
    }

    if (this.destinations.length === 0) {
      return { success: false, error: 'No destinations defined. Use the Space Editor to place exit points.' };
    }

    // Ensure agent environment is updated
    this.updateAgentEnvironment();

    this.isTraining = true;
    this.trainingProgress = 0;

    // Start training asynchronously
    const trainingTask = (async () => {
      try {
        console.log(`🧠 Starting Value Iteration (Pre-computation)`);

        const progressCallback = (progress) => {
          this.trainingProgress = Math.min(100, Math.max(0, progress));
          // console.log(`📊 Progress: ${this.trainingProgress.toFixed(1)}%`);
        };

        progressCallback(0);

        const result = await this.agent.train(0, progressCallback);

        this.isTraining = false;
        this.trainingProgress = 100;

        console.log('✅ Value Iteration completed successfully');
        console.log(`   Duration: ${result.duration}ms`);
      } catch (error) {
        this.isTraining = false;
        this.trainingProgress = 0;
        console.error('❌ Training error:', error.message);
        console.error('   Stack:', error.stack);
        throw error;
      }
    })();

    this.trainingPromise = trainingTask;

    return {
      success: true,
      message: 'Value Iteration started',
      mode: 'Model-Based RL (Value Iteration)'
    };
  }

  /**
   * Get training progress
   */
  getTrainingProgress() {
    return {
      progress: this.trainingProgress || 0,
      complete: !this.isTraining && this.trainingProgress >= 100,
      isTraining: this.isTraining || false
    };
  }

  /**
   * Find destination by name/zone
   */
  findDestination(query, floor = 1) {
    const q = query.toLowerCase().trim();

    // If no destinations, return null
    if (this.destinations.length === 0) {
      console.warn('⚠️ No destinations defined');
      return null;
    }

    // Direct zone match
    let dest = this.destinations.find(d =>
      d.floor === floor && d.zone?.toLowerCase() === q
    );
    if (dest) return dest;

    // Name exact match
    dest = this.destinations.find(d =>
      d.floor === floor && d.name?.toLowerCase() === q
    );
    if (dest) return dest;

    // Name contains query
    dest = this.destinations.find(d =>
      d.floor === floor && d.name?.toLowerCase().includes(q)
    );
    if (dest) return dest;

    // Zone contains query
    dest = this.destinations.find(d =>
      d.floor === floor && d.zone?.toLowerCase().includes(q)
    );
    if (dest) return dest;

    // Parse zone number (e.g., "zone 5" -> look for exit that might serve zone 5)
    const zoneMatch = q.match(/zone\s*(\d+)/i);
    if (zoneMatch) {
      const zoneNum = parseInt(zoneMatch[1]);
      const zoneNumPadded = zoneMatch[1].padStart(2, '0');

      // Try to find destination with zone info
      dest = this.destinations.find(d =>
        d.floor === floor && (
          d.zone?.toLowerCase().includes(`zone_${zoneNumPadded}`) ||
          d.zone?.toLowerCase().includes(`zone${zoneNumPadded}`) ||
          d.zone?.toLowerCase().includes(`zone ${zoneNum}`) ||
          d.name?.toLowerCase().includes(`zone_${zoneNumPadded}`) ||
          d.name?.toLowerCase().includes(`zone ${zoneNum}`) ||
          d.name?.toLowerCase().includes(`zone${zoneNum}`)
        )
      );
      if (dest) return dest;

      // Fallback: if destinations don't have zone info, use position-based heuristic
      // Zones are typically numbered left-to-right, top-to-bottom
      // Return destination that might be near the zone
      const floorDests = this.destinations.filter(d => d.floor === floor);
      if (floorDests.length > 0) {
        // Sort by x coordinate and pick based on zone number
        const sorted = [...floorDests].sort((a, b) => a.x - b.x);
        const index = Math.min(zoneNum - 1, sorted.length - 1);
        console.log(`📍 Using position-based heuristic for Zone ${zoneNum}: ${sorted[Math.max(0, index)]?.name}`);
        return sorted[Math.max(0, index)];
      }
    }

    // Facility match (lavatory, restroom, etc.)
    if (q.includes('lavatory') || q.includes('restroom') || q.includes('toilet') || q.includes('bathroom') || q.includes('lav')) {
      dest = this.destinations.find(d =>
        d.floor === floor && (
          d.name?.toLowerCase().includes('restroom') ||
          d.name?.toLowerCase().includes('lavatory') ||
          d.name?.toLowerCase().includes('lav') ||
          d.zone?.toLowerCase().includes('restroom') ||
          d.zone?.toLowerCase().includes('lav')
        )
      );
      if (dest) return dest;
    }

    // Lift/elevator match
    if (q.includes('lift') || q.includes('elevator') || q.includes('lobby')) {
      dest = this.destinations.find(d =>
        d.floor === floor && (
          d.name?.toLowerCase().includes('lift') ||
          d.name?.toLowerCase().includes('elevator') ||
          d.name?.toLowerCase().includes('lobby') ||
          d.zone?.toLowerCase().includes('lift') ||
          d.zone?.toLowerCase().includes('lobby')
        )
      );
      if (dest) return dest;
    }

    // Pantry match
    if (q.includes('pantry') || q.includes('kitchen') || q.includes('break room')) {
      dest = this.destinations.find(d =>
        d.floor === floor && (
          d.name?.toLowerCase().includes('pantry') ||
          d.zone?.toLowerCase().includes('pantry')
        )
      );
      if (dest) return dest;
    }

    // Exit number match (e.g., "exit 3" or just "3")
    const exitMatch = q.match(/(?:exit\s*)?(\d+)/i);
    if (exitMatch) {
      const exitNum = exitMatch[1];
      dest = this.destinations.find(d =>
        d.floor === floor && (
          d.name?.toLowerCase().includes(`exit ${exitNum}`) ||
          d.name?.toLowerCase() === `exit ${exitNum}` ||
          d.name?.toLowerCase() === `exit${exitNum}`
        )
      );
      if (dest) return dest;
    }

    console.warn(`⚠️ Destination "${query}" not found. Available: ${this.destinations.filter(d => d.floor === floor).map(d => d.name).join(', ')}`);
    return null;
  }

  /**
   * Get all exits for a zone (for multiple exit support)
   */
  getZoneExits(zoneId, floor = 1) {
    return this.destinations.filter(d =>
      d.floor === floor && (
        d.zone === zoneId ||
        d.zone?.toLowerCase().includes(zoneId.toLowerCase()) ||
        d.name?.toLowerCase().includes(zoneId.toLowerCase())
      )
    );
  }

  /**
   * Find nearest exit to a starting point from multiple exits
   */
  findNearestExit(startX, startY, exits) {
    if (exits.length === 0) return null;
    if (exits.length === 1) return exits[0];

    let nearest = exits[0];
    let minDist = Infinity;

    for (const exit of exits) {
      const dist = Math.sqrt((exit.x - startX) ** 2 + (exit.y - startY) ** 2);
      if (dist < minDist) {
        minDist = dist;
        nearest = exit;
      }
    }

    return nearest;
  }

  /**
   * Find a valid start position within corridors
   */
  findStartPosition(query, floor = 1) {
    const q = query?.toLowerCase().trim() || '';

    // Try to find by query first
    if (q) {
      // Check if it matches any destination
      const dest = this.findDestination(query, floor);
      if (dest && this.agent.isPointNavigable(dest.x, dest.y)) {
        return { x: dest.x, y: dest.y, name: dest.name };
      }

      // Entrance/lobby keywords - prioritize exact matches
      if (q.includes('entrance') || q.includes('main') || q.includes('lobby') || q.includes('lift')) {
        // Try exact match first
        let entrance = this.destinations.find(d =>
          d.floor === floor && (
            d.name?.toLowerCase() === 'main entrance' ||
            d.name?.toLowerCase() === 'entrance' ||
            (q.includes('main') && d.name?.toLowerCase().includes('entrance'))
          )
        );

        // Then try partial match
        if (!entrance) {
          entrance = this.destinations.find(d =>
            d.floor === floor && (
              d.name?.toLowerCase().includes('entrance') ||
              d.name?.toLowerCase().includes('lobby') ||
              d.name?.toLowerCase().includes('lift')
            )
          );
        }

        if (entrance) {
          // Check if navigable, if not find nearest
          if (this.agent.isPointNavigable(entrance.x, entrance.y)) {
            return { x: entrance.x, y: entrance.y, name: entrance.name };
          } else {
            const nearest = this.agent.findNearestNavigablePoint(entrance.x, entrance.y);
            if (nearest) {
              return { x: nearest.x, y: nearest.y, name: entrance.name };
            }
          }
        }
      }
    }

    // Default: find a valid position inside a corridor
    // Try the center of each corridor
    for (const corridor of this.corridors.filter(c => c.floor === floor)) {
      if (corridor.polygon && corridor.polygon.length > 0) {
        // Calculate centroid
        const xs = corridor.polygon.map(p => p[0]);
        const ys = corridor.polygon.map(p => p[1]);
        const centerX = xs.reduce((a, b) => a + b, 0) / xs.length;
        const centerY = ys.reduce((a, b) => a + b, 0) / ys.length;

        if (this.agent.isPointNavigable(centerX, centerY)) {
          return { x: centerX, y: centerY, name: corridor.name || 'Corridor' };
        }
      }
    }

    // Fallback: use first destination if navigable
    const floorDests = this.destinations.filter(d => d.floor === floor);
    for (const dest of floorDests) {
      if (this.agent.isPointNavigable(dest.x, dest.y)) {
        return { x: dest.x, y: dest.y, name: dest.name };
      }
    }

    // Last resort: find any navigable point
    const validPositions = this.agent.findValidPositions(1);
    if (validPositions.length > 0) {
      return { x: validPositions[0].x, y: validPositions[0].y, name: 'Start' };
    }

    return null;
  }

  /**
   * Main navigation function: find path from start to destination
   */
  async navigate(startQuery, destQuery, options = {}) {
    const { floor = 1, startX, startY } = options;

    // Find start position
    let start = null;
    if (startX && startY) {
      start = { x: startX, y: startY, name: startQuery || 'Start' };
    } else {
      start = this.findStartPosition(startQuery, floor);
    }

    if (!start) {
      return { success: false, error: 'Could not find a valid start position. Make sure corridors are defined.' };
    }

    console.log(`📍 Start position: (${start.x.toFixed(0)}, ${start.y.toFixed(0)}) - ${start.name}`);

    // Find destination
    const destination = this.findDestination(destQuery, floor);
    if (!destination) {
      // Try to find multiple exits for zone
      const exits = this.getZoneExits(destQuery, floor);
      if (exits.length > 0) {
        const nearest = this.findNearestExit(start.x, start.y, exits);
        return this.findPathToDestination(start, nearest, floor);
      }

      return {
        success: false,
        error: `Destination "${destQuery}" not found. Available destinations: ${this.destinations.filter(d => d.floor === floor).map(d => d.name).join(', ')}`
      };
    }

    // Check for multiple exits
    const allExits = this.getZoneExits(destination.zone || destination.name, floor);
    const targetExit = allExits.length > 1
      ? this.findNearestExit(start.x, start.y, allExits)
      : destination;

    return this.findPathToDestination(start, targetExit, floor);
  }

  /**
   * Find path to a specific destination
   */
  findPathToDestination(start, destination, floor) {
    if (!destination) {
      return { success: false, error: 'Invalid destination' };
    }

    console.log(`🚀 Finding path: (${start.x.toFixed(0)}, ${start.y.toFixed(0)}) → ${destination.name} (${destination.x.toFixed(0)}, ${destination.y.toFixed(0)})`);

    // Check if destination is navigable, if not find nearest navigable point
    let destX = destination.x;
    let destY = destination.y;
    if (!this.agent.isPointNavigable(destX, destY)) {
      console.log(`⚠️ Destination (${destX.toFixed(0)}, ${destY.toFixed(0)}) is not navigable, finding nearest...`);
      const nearest = this.agent.findNearestNavigablePoint(destX, destY);
      if (nearest) {
        destX = nearest.x;
        destY = nearest.y;
        console.log(`📍 Adjusted destination to nearest navigable: (${destX.toFixed(0)}, ${destY.toFixed(0)})`);
      } else {
        return {
          success: false,
          error: `Destination "${destination.name}" is not in a navigable area. Please check the exit placement.`
        };
      }
    }

    // Use RL agent to find path
    const result = this.agent.findPath(
      start.x, start.y,
      destX, destY,
      destination.id
    );

    if (result.success) {
      // Calculate total distance
      let totalDistance = 0;
      for (let i = 1; i < result.path.length; i++) {
        const dx = result.path[i].x - result.path[i - 1].x;
        const dy = result.path[i].y - result.path[i - 1].y;
        totalDistance += Math.sqrt(dx * dx + dy * dy);
      }

      // Simplify path (remove redundant points) - more aggressive simplification
      const simplifiedPath = this.simplifyPath(result.path, 15); // Increased tolerance from 5 to 15

      // Enrich path with corridor names (Stable Logic)
      let lastKnownLocation = 'Start';

      const enrichedPath = simplifiedPath.map((p, idx) => {
        // Use tolerance to find corridor even if point is slightly on the edge (e.g. from simplification)
        const corridor = this.getCorridorForPoint(p.x, p.y, floor, 20); // 20px tolerance

        let locationName;
        if (corridor) {
          locationName = (corridor.displayName || corridor.name);
          lastKnownLocation = locationName;
        } else {
          // If in a gap/seam, assume we differ to the previous known location
          // This prevents "Corridor" flickering between two named halls
          locationName = lastKnownLocation;
        }

        return {
          ...p,
          locationName
        };
      });

      // Generate SVG path string
      const svgPath = this.generateSVGPath(enrichedPath);

      // Generate direction arrows (more frequent for visibility)
      const arrows = this.generateDirectionArrows(enrichedPath, 60);

      console.log(`✅ Path found: ${result.steps} steps, ${totalDistance.toFixed(0)}px, simplified to ${simplifiedPath.length} points, ${arrows.length} arrows`);

      return {
        success: true,
        path: enrichedPath,
        svgPath,
        arrows,
        destination: {
          id: destination.id,
          name: destination.name,
          zone: destination.zone,
          x: destX,
          y: destY,
          floor
        },
        start: {
          x: start.x,
          y: start.y,
          floor
        },
        stats: {
          totalDistance,
          steps: result.steps,
          originalPoints: result.path.length,
          simplifiedPoints: simplifiedPath.length
        },
        algorithm: 'Continuous Space RL'
      };
    } else {
      console.warn(`⚠️ Path not found to ${destination.name}`);

      // If we have a partial path, try to use it
      if (result.path && result.path.length > 2) {
        console.log(`📏 Using partial path with ${result.path.length} points`);
        const simplifiedPath = this.simplifyPath(result.path, 15);

        // Enrich path with corridor names
        const enrichedPath = simplifiedPath.map(p => {
          const corridor = this.getCorridorForPoint(p.x, p.y, floor);
          return {
            ...p,
            locationName: corridor ? (corridor.displayName || corridor.name) : 'Corridor'
          };
        });

        const svgPath = this.generateSVGPath(enrichedPath);
        const arrows = this.generateDirectionArrows(enrichedPath, 200);

        let totalDistance = 0;
        for (let i = 1; i < result.path.length; i++) {
          const dx = result.path[i].x - result.path[i - 1].x;
          const dy = result.path[i].y - result.path[i - 1].y;
          totalDistance += Math.sqrt(dx * dx + dy * dy);
        }

        return {
          success: true,
          path: enrichedPath,
          svgPath,
          arrows,
          destination: {
            id: destination.id,
            name: destination.name,
            zone: destination.zone,
            x: destX,
            y: destY,
            floor
          },
          start: {
            x: start.x,
            y: start.y,
            floor
          },
          stats: {
            totalDistance,
            steps: result.steps,
            originalPoints: result.path.length,
            simplifiedPoints: simplifiedPath.length
          },
          algorithm: 'Continuous Space RL (partial)',
          warning: 'Path may not reach exact destination'
        };
      }

      return {
        success: false,
        error: `Could not find navigable path to ${destination.name}. The RL agent may need more training, or the corridors may not connect properly.`,
        partialPath: result.path
      };
    }
  }

  /**
   * Get the corridor that contains a specific point
   */
  /**
   * Get the corridor that contains a specific point, with tolerance
   */
  getCorridorForPoint(x, y, floor, tolerance = 10) {
    const floorCorridors = this.getCorridors(floor);

    // 1. Strict containment check
    for (const corridor of floorCorridors) {
      if (this.agent.isPointInPolygon(x, y, corridor.polygon)) {
        return corridor;
      }
    }

    // 2. Tolerance check (nearest corridor within tolerance)
    let bestCorridor = null;
    let minDistance = Infinity;

    for (const corridor of floorCorridors) {
      if (corridor.polygon.length < 2) continue;

      for (let i = 0; i < corridor.polygon.length; i++) {
        const p1 = corridor.polygon[i];
        const p2 = corridor.polygon[(i + 1) % corridor.polygon.length];

        // Distance to line segment
        const dist = this.pointToSegmentDistance(x, y, p1[0], p1[1], p2[0], p2[1]);
        if (dist < minDistance) {
          minDistance = dist;
          bestCorridor = corridor;
        }
      }
    }

    if (minDistance <= tolerance) {
      return bestCorridor;
    }

    return null;
  }

  // Helper distance function
  pointToSegmentDistance(px, py, x1, y1, x2, y2) {
    const A = px - x1;
    const B = py - y1;
    const C = x2 - x1;
    const D = y2 - y1;

    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = lenSq !== 0 ? dot / lenSq : -1;

    let xx, yy;

    if (param < 0) {
      xx = x1;
      yy = y1;
    } else if (param > 1) {
      xx = x2;
      yy = y2;
    } else {
      xx = x1 + param * C;
      yy = y1 + param * D;
    }

    const dx = px - xx;
    const dy = py - yy;
    return Math.sqrt(dx * dx + dy * dy);
  }


  /**
   * Simplify path using Douglas-Peucker algorithm
   */
  simplifyPath(path, tolerance = 5) {
    if (path.length <= 2) return path;

    // Find point with max distance from line between first and last
    let maxDist = 0;
    let maxIdx = 0;
    const first = path[0];
    const last = path[path.length - 1];

    for (let i = 1; i < path.length - 1; i++) {
      const dist = this.pointToLineDistance(path[i], first, last);
      if (dist > maxDist) {
        maxDist = dist;
        maxIdx = i;
      }
    }

    // If max distance > tolerance, recursively simplify
    if (maxDist > tolerance) {
      const left = this.simplifyPath(path.slice(0, maxIdx + 1), tolerance);
      const right = this.simplifyPath(path.slice(maxIdx), tolerance);
      return [...left.slice(0, -1), ...right];
    } else {
      return [first, last];
    }
  }

  /**
   * Calculate perpendicular distance from point to line
   */
  pointToLineDistance(point, lineStart, lineEnd) {
    const dx = lineEnd.x - lineStart.x;
    const dy = lineEnd.y - lineStart.y;
    const lenSq = dx * dx + dy * dy;

    if (lenSq === 0) {
      return Math.sqrt((point.x - lineStart.x) ** 2 + (point.y - lineStart.y) ** 2);
    }

    const t = Math.max(0, Math.min(1, ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / lenSq));
    const projX = lineStart.x + t * dx;
    const projY = lineStart.y + t * dy;

    return Math.sqrt((point.x - projX) ** 2 + (point.y - projY) ** 2);
  }

  /**
   * Generate direction arrows along path (sparse, clean visualization)
   */
  generateDirectionArrows(points, arrowSpacing = 150) {
    if (points.length < 2) return [];

    const arrows = [];
    let accumulatedDistance = 0;

    for (let i = 0; i < points.length - 1; i++) {
      const current = points[i];
      const next = points[i + 1];

      const dx = next.x - current.x;
      const dy = next.y - current.y;
      const segmentLength = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx) * (180 / Math.PI);

      // Add arrows along this segment
      while (accumulatedDistance < segmentLength) {
        const t = accumulatedDistance / segmentLength;
        const arrowX = current.x + dx * t;
        const arrowY = current.y + dy * t;

        arrows.push({
          x: arrowX,
          y: arrowY,
          rotation: angle
        });

        accumulatedDistance += arrowSpacing;
      }

      // Carry over remaining distance to next segment
      accumulatedDistance -= segmentLength;
    }

    return arrows;
  }

  /**
   * Generate SVG path string from points
   */
  generateSVGPath(points) {
    if (points.length === 0) return '';
    if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

    // Start with move to first point
    let path = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;

    // Generate straight lines path
    for (let i = 1; i < points.length; i++) {
      path += ` L ${points[i].x.toFixed(1)} ${points[i].y.toFixed(1)}`;
    }

    return path;
  }

  /**
   * Get all destinations for a floor
   */
  getDestinations(floor = 1) {
    return this.destinations.filter(d => d.floor === floor);
  }

  /**
   * Get all corridors for a floor
   */
  getCorridors(floor = 1) {
    return this.corridors.filter(c => c.floor === floor);
  }

  /**
   * Get agent statistics
   */
  getStats() {
    return {
      agent: this.agent.getStats(),
      corridors: this.corridors.length,
      destinations: this.destinations.length,
      isTraining: this.isTraining,
      trainingProgress: this.trainingProgress
    };
  }
}

// Singleton instance
let spaceNavigationEngine = null;

function getSpaceNavigationEngine() {
  if (!spaceNavigationEngine) {
    spaceNavigationEngine = new SpaceNavigationEngine();
  }
  return spaceNavigationEngine;
}

module.exports = {
  SpaceNavigationEngine,
  getSpaceNavigationEngine
};

