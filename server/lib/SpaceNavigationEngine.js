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

    // Pre-computed corridor centers (for consistent path alignment)
    // Map: corridor.id -> { centerY: number (for horizontal), centerX: number (for vertical), orientation: string }
    this.corridorCenters = new Map();

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

      // Update agent environment (this will also trigger center computation if clearance map is ready)
      this.updateAgentEnvironment();

      // Recompute centers if clearance map is available (agent might need training first)
      if (this.agent && this.agent.clearanceMap) {
        this.computeAllCorridorCenters();
      }

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

    // Compute corridor centers after agent environment is set up
    // setEnvironment() calls buildGrid() which creates the clearance map
    // Note: We'll recompute after training completes for optimal accuracy
    if (this.agent.clearanceMap && this.agent.clearanceMap.length > 0) {
      this.computeAllCorridorCenters();
    } else {
      console.log('⏳ Corridor centers will be computed after training completes');
    }
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

        // Recompute corridor centers after training (clearance map is now optimal)
        this.computeAllCorridorCenters();

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

    // Check if destination is navigable logic moved to inside agent.findPath()
    let destX = destination.x;
    let destY = destination.y;

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

      // First, enrich ALL path points with corridor names (before simplification)
      // Use larger tolerance to ensure Main Corridor and other corridors are properly identified
      let lastKnownLocation = 'Start';
      const enrichedFullPath = result.path.map((p, idx) => {
        // Use larger tolerance (20px) to catch points near corridor boundaries
        // This ensures Main Corridor is properly identified even if points are slightly off
        const corridor = this.getCorridorForPoint(p.x, p.y, floor, 20);
        let locationName;
        if (corridor) {
          locationName = (corridor.displayName || corridor.name);
          lastKnownLocation = locationName;
        } else {
          // If no corridor found, check with even larger tolerance for Main Corridor
          const mainCorridor = this.getCorridors(floor).find(c => 
            (c.name || '').toLowerCase().includes('main')
          );
          if (mainCorridor) {
            const foundCorridor = this.getCorridorForPoint(p.x, p.y, floor, 50);
            if (foundCorridor && foundCorridor.id === mainCorridor.id) {
              locationName = mainCorridor.displayName || mainCorridor.name;
              lastKnownLocation = locationName;
            } else {
              locationName = lastKnownLocation;
            }
          } else {
            locationName = lastKnownLocation;
          }
        }
        return { ...p, locationName };
      });

      // Now, simplify PER CORRIDOR SEGMENT to preserve turn points at junctions
      // Increase tolerance to 20 to ensure long straight lines in center of corridors
      const simplifiedPath = this.simplifyPerSegment(enrichedFullPath, 20);

      // Center the path along corridor centerlines for parallel, aesthetically pleasing routes
      let enrichedPath = this.centerPathAlongCorridors(simplifiedPath);

      // Ensure path turns to and connects with destination point
      enrichedPath = this.ensurePathReachesDestination(enrichedPath, destX, destY, floor);

      // Generate SVG path string
      const svgPath = this.generateSVGPath(enrichedPath);

      // Generate direction arrows (more frequent for visibility)
      const arrows = this.generateDirectionArrows(enrichedPath, 60);

      console.log(`✅ Path found: ${result.steps} steps, ${totalDistance.toFixed(0)}px, simplified to ${enrichedPath.length} points, ${arrows.length} arrows`);

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
          simplifiedPoints: enrichedPath.length
        },
        algorithm: 'Continuous Space RL'
      };
    } else {
      console.warn(`⚠️ Path not found to ${destination.name}`);

      // If we have a partial path, try to use it
      if (result.path && result.path.length > 2) {
        console.log(`📏 Using partial path with ${result.path.length} points`);
        // First, enrich ALL path points with corridor names (before simplification)
        let lastLoc = 'Start';
        const enrichedFullPath = result.path.map(p => {
          const corridor = this.getCorridorForPoint(p.x, p.y, floor, 5); // Sharp transition
          if (corridor) lastLoc = (corridor.displayName || corridor.name);
          return { ...p, locationName: lastLoc };
        });

        const simplifiedPath = this.simplifyPerSegment(enrichedFullPath);
        let enrichedPath = this.centerPathAlongCorridors(simplifiedPath);

        // Ensure path reaches destination even if partial
        enrichedPath = this.ensurePathReachesDestination(enrichedPath, destX, destY, floor);

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
            simplifiedPoints: enrichedPath.length
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
   * Simplify path per corridor segment - forces a waypoint at every corridor transition.
   * This preserves the overall "L" structure while smoothing the path within each hall.
   */
  simplifyPerSegment(enrichedPath, tolerance = 8) {
    if (enrichedPath.length <= 2) return enrichedPath;

    const finalPath = [];
    let currentSegment = [];
    let currentLoc = enrichedPath[0].locationName;

    for (const point of enrichedPath) {
      if (point.locationName !== currentLoc) {
        // Simplify current segment and add to final path
        if (currentSegment.length > 0) {
          const simplified = this.douglasPeucker(currentSegment, tolerance);
          // Add all points except last (to avoid duplicates with the next segment's start)
          for (let i = 0; i < simplified.length - 1; i++) {
            finalPath.push(simplified[i]);
          }
        }
        currentSegment = [point];
        currentLoc = point.locationName;
      } else {
        currentSegment.push(point);
      }
    }

    // Process last segment
    if (currentSegment.length > 0) {
      const simplified = this.douglasPeucker(currentSegment, tolerance);
      finalPath.push(...simplified);
    }

    return finalPath;
  }

  /**
   * Center each waypoint along the corridor centerline and force strict orthogonality
   * Ensures paths are perfectly parallel to corridor walls with 90-degree turns only.
   */
  centerPathAlongCorridors(path) {
    if (path.length < 2) return path;

    // Pass 1: Identify segments (sequences in the same corridor)
    const segments = [];
    let currentSeg = [path[0]];
    for (let i = 1; i < path.length; i++) {
      if (path[i].locationName === path[i - 1].locationName) {
        currentSeg.push(path[i]);
      } else {
        segments.push(currentSeg);
        currentSeg = [path[i]];
      }
    }
    segments.push(currentSeg);

    // Pass 2: For each segment, determine corridor orientation and center it
    const processedSegments = [];
    for (const seg of segments) {
      if (seg.length < 2) {
        processedSegments.push(seg);
        continue;
      }

      // Get corridor for this segment
      const corridor = this.getCorridorForSegment(seg);
      if (!corridor) {
        processedSegments.push(seg);
        continue;
      }

      // Determine corridor orientation (horizontal or vertical)
      const orientation = this.getCorridorOrientation(corridor);
      
      // Center the segment in the corridor
      const centeredSeg = this.centerSegmentInCorridor(seg, corridor, orientation);
      processedSegments.push(centeredSeg);
    }

    // Pass 3: Create 90-degree turns between segments
    const finalPath = this.createOrthogonalTurns(processedSegments);

    return finalPath;
  }

  /**
   * Get corridor for a segment (use first point's corridor)
   * Improved matching for Main Corridor and other corridors
   */
  getCorridorForSegment(seg) {
    if (seg.length === 0) return null;
    const floor = seg[0].floor || 1;
    const floorCorridors = this.getCorridors(floor);
    
    // Try location name matching first (case-insensitive, partial match)
    if (seg[0].locationName) {
      const locationNameLower = seg[0].locationName.toLowerCase();
      
      // Try exact match first
      let corridor = floorCorridors.find(c => {
        const name = (c.displayName || c.name || '').toLowerCase();
        return name === locationNameLower;
      });
      
      if (corridor) return corridor;
      
      // Try partial match (e.g., "Main Corridor" matches "Main")
      corridor = floorCorridors.find(c => {
        const name = (c.displayName || c.name || '').toLowerCase();
        return name.includes(locationNameLower) || locationNameLower.includes(name);
      });
      
      if (corridor) return corridor;
    }

    // Enhanced point containment check - sample multiple points in segment
    const samplePoints = [
      seg[0], // First point
      seg[Math.floor(seg.length / 2)], // Mid point
      seg[seg.length - 1] // Last point
    ].filter(p => p);

    // Try to find corridor that contains most sample points
    const corridorCounts = new Map();
    for (const point of samplePoints) {
      const corridor = this.getCorridorForPoint(point.x, point.y, floor, 50);
      if (corridor) {
        corridorCounts.set(corridor.id, (corridorCounts.get(corridor.id) || 0) + 1);
      }
    }

    // Return corridor that contains the most points
    let bestCorridor = null;
    let maxCount = 0;
    for (const [corridorId, count] of corridorCounts) {
      if (count > maxCount) {
        maxCount = count;
        bestCorridor = floorCorridors.find(c => c.id === corridorId);
      }
    }

    if (bestCorridor) return bestCorridor;

    // Final fallback: use midpoint
    const midPoint = seg[Math.floor(seg.length / 2)];
    return this.getCorridorForPoint(midPoint.x, midPoint.y, floor, 50);
  }

  /**
   * Compute and cache centerlines for all corridors
   * This is done once when environment is set up or after training completes
   */
  computeAllCorridorCenters() {
    if (!this.agent || !this.agent.clearanceMap) {
      console.warn('⚠️ Cannot compute corridor centers: agent or clearance map not available');
      return;
    }

    console.log('📐 Computing corridor centerlines...');
    let computed = 0;
    this.corridorCenters.clear();

    for (const corridor of this.corridors) {
      if (!corridor.polygon || corridor.polygon.length < 3) continue;

      const orientation = this.getCorridorOrientation(corridor);
      let centerValue;

      if (orientation === 'horizontal') {
        // Compute optimal Y center for horizontal corridor
        centerValue = this.computeCorridorCenterY(corridor);
      } else {
        // Compute optimal X center for vertical corridor
        centerValue = this.computeCorridorCenterX(corridor);
      }

      this.corridorCenters.set(corridor.id, {
        orientation,
        centerValue,
        computed: true
      });

      computed++;
    }

    console.log(`✅ Computed centerlines for ${computed} corridors`);
  }

  /**
   * Determine if corridor is primarily horizontal or vertical
   */
  getCorridorOrientation(corridor) {
    if (!corridor.polygon || corridor.polygon.length < 3) return 'horizontal';

    // Calculate bounding box
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    
    for (const [x, y] of corridor.polygon) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }

    const width = maxX - minX;
    const height = maxY - minY;

    // Determine orientation based on aspect ratio
    return width > height * 1.2 ? 'horizontal' : 'vertical';
  }

  /**
   * Center a segment in its corridor, aligned to corridor orientation
   * Returns a straight line (start and end points only) centered in the corridor
   * Uses cached corridor centers for consistent centering across all paths
   */
  centerSegmentInCorridor(seg, corridor, orientation) {
    if (seg.length === 0) return seg;
    
    // Ensure we have a valid corridor - try Main Corridor fallback if corridor not found
    if (!corridor && seg.length > 0) {
      const floor = seg[0].floor || 1;
      const mainCorridor = this.getCorridors(floor).find(c => 
        (c.name || '').toLowerCase().includes('main')
      );
      
      // Check if segment points are within Main Corridor bounds
      if (mainCorridor && mainCorridor.polygon && mainCorridor.polygon.length >= 3) {
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const [x, y] of mainCorridor.polygon) {
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
        }
        
        // Check if segment is within Main Corridor bounds (with padding)
        const padding = 20;
        const allInBounds = seg.every(p => 
          p.x >= minX - padding && p.x <= maxX + padding &&
          p.y >= minY - padding && p.y <= maxY + padding
        );
        
        if (allInBounds) {
          corridor = mainCorridor;
          orientation = this.getCorridorOrientation(mainCorridor);
        }
      }
    }
    
    if (!corridor) {
      // No corridor found, return original segment
      return seg;
    }
    
    if (seg.length === 1) {
      // Single point: center it in the corridor using cached center
      const point = seg[0];
      if (orientation === 'horizontal') {
        return [{ ...point, y: this.getCorridorCenterY(corridor, seg) }];
      } else {
        return [{ ...point, x: this.getCorridorCenterX(corridor, seg) }];
      }
    }

    const firstPoint = seg[0];
    const lastPoint = seg[seg.length - 1];
    const centeredSeg = [];

    if (orientation === 'horizontal') {
      // Horizontal corridor: fix Y to cached corridor center, keep X as straight line
      const corridorCenterY = this.getCorridorCenterY(corridor, seg);
      
      // Always keep start point with centered Y
      centeredSeg.push({
        ...firstPoint,
        x: firstPoint.x,
        y: corridorCenterY
      });
      
      // Keep end point if it's different from start
      if (Math.abs(lastPoint.x - firstPoint.x) > 1) {
        centeredSeg.push({
          ...lastPoint,
          x: lastPoint.x,
          y: corridorCenterY
        });
      }
    } else {
      // Vertical corridor: fix X to cached corridor center, keep Y as straight line
      const corridorCenterX = this.getCorridorCenterX(corridor, seg);
      
      // Always keep start point with centered X
      centeredSeg.push({
        ...firstPoint,
        x: corridorCenterX,
        y: firstPoint.y
      });
      
      // Keep end point if it's different from start
      if (Math.abs(lastPoint.y - firstPoint.y) > 1) {
        centeredSeg.push({
          ...lastPoint,
          x: corridorCenterX,
          y: lastPoint.y
        });
      }
    }

    // Ensure we always return at least one point
    return centeredSeg.length > 0 ? centeredSeg : [firstPoint];
  }

  /**
   * Get the cached center Y coordinate for a horizontal corridor
   * Returns pre-computed centerline or falls back to geometric center
   */
  getCorridorCenterY(corridor, segment) {
    // Use cached center if available
    const cached = this.corridorCenters.get(corridor.id);
    if (cached && cached.orientation === 'horizontal' && cached.computed) {
      return cached.centerValue;
    }

    // Fallback to geometric center if not computed yet
    if (!corridor.polygon || corridor.polygon.length < 3) {
      return 0;
    }
    
    let minY = Infinity, maxY = -Infinity;
    for (const [x, y] of corridor.polygon) {
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    
    return (minY + maxY) / 2;
  }

  /**
   * Compute the optimal center Y coordinate for a horizontal corridor
   * Samples the entire corridor to find the best centerline
   */
  computeCorridorCenterY(corridor) {
    if (!corridor.polygon || corridor.polygon.length < 3) {
      return 0;
    }
    
    // Get corridor bounds
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    for (const [x, y] of corridor.polygon) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    
    const geometricCenterY = (minY + maxY) / 2;

    // FOR MAIN CORRIDOR: Always use geometric center for perfect visual alignment
    if (corridor.name && corridor.name.toLowerCase().includes('main corridor')) {
      console.log(`📏 Forcing geometric center Y for ${corridor.name}: ${geometricCenterY}`);
      return geometricCenterY;
    }

    // Check if essentially rectangular (axis-aligned bounding box match)
    // If the polygon area is close to bbox area, it's rectangular -> use geometric center
    const width = maxX - minX;
    const height = maxY - minY;
    // Simple check: if mostly rectangular, use geometric center
    // This avoids clearance map noise for simple shapes
    if (corridor.polygon.length <= 5) { // Rectangle (4 pts) or simple loop (5 pts)
       return geometricCenterY;
    }
    
    if (!this.agent || !this.agent.clearanceMap) {
      // Fallback to geometric center
      return geometricCenterY;
    }
    
    // Sample along the entire corridor width to find optimal centerline
    const res = this.agent.options.gridResolution;
    const samples = [];
    const sampleStep = Math.max(res, (maxX - minX) / 15); // Sample ~15 points across corridor
    
    for (let sampleX = minX; sampleX <= maxX; sampleX += sampleStep) {
      let bestY = geometricCenterY;
      let bestClearance = 0;
      let totalWeight = 0;
      let weightedSum = 0;
      
      // Sample multiple Y values and find the one with best clearance
      for (let testY = minY; testY <= maxY; testY += res) {
        const gridX = Math.floor(sampleX / res);
        const gridY = Math.floor(testY / res);
        
        if (gridX >= 0 && gridX < this.agent.gridWidth && 
            gridY >= 0 && gridY < this.agent.gridHeight) {
          const idx = gridY * this.agent.gridWidth + gridX;
          
          // Only consider points inside the corridor
          if (this.agent.isPointInPolygon(sampleX, testY, corridor.polygon)) {
            const clearance = this.agent.clearanceMap[idx] || 0;
            // Weight by clearance squared to prefer higher clearance (centers in widest part)
            const weight = clearance * clearance;
            weightedSum += testY * weight;
            totalWeight += weight;
            
            if (clearance > bestClearance) {
              bestClearance = clearance;
              bestY = testY;
            }
          }
        }
      }
      
      // Use weighted average if we have samples, otherwise use best
      if (totalWeight > 0) {
        const weightedY = weightedSum / totalWeight;
        samples.push(weightedY);
      } else if (bestClearance > 0) {
        samples.push(bestY);
      }
    }
    
    // Return median of samples for stability (resistant to outliers)
    if (samples.length > 0) {
      samples.sort((a, b) => a - b);
      return samples[Math.floor(samples.length / 2)];
    }
    
    // Final fallback: geometric center
    return geometricCenterY;
  }

  /**
   * Get the cached center X coordinate for a vertical corridor
   * Returns pre-computed centerline or falls back to geometric center
   */
  getCorridorCenterX(corridor, segment) {
    // Use cached center if available
    const cached = this.corridorCenters.get(corridor.id);
    if (cached && cached.orientation === 'vertical' && cached.computed) {
      return cached.centerValue;
    }

    // Fallback to geometric center if not computed yet
    if (!corridor.polygon || corridor.polygon.length < 3) {
      return 0;
    }
    
    let minX = Infinity, maxX = -Infinity;
    for (const [x, y] of corridor.polygon) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
    }
    
    return (minX + maxX) / 2;
  }

  /**
   * Compute the optimal center X coordinate for a vertical corridor
   * Samples the entire corridor to find the best centerline
   */
  computeCorridorCenterX(corridor) {
    if (!corridor.polygon || corridor.polygon.length < 3) {
      return 0;
    }
    
    // Get corridor bounds
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    for (const [x, y] of corridor.polygon) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    
    const geometricCenterX = (minX + maxX) / 2;

    // FOR MAIN CORRIDOR: Always use geometric center for perfect visual alignment
    if (corridor.name && corridor.name.toLowerCase().includes('main corridor')) {
      console.log(`📏 Forcing geometric center X for ${corridor.name}: ${geometricCenterX}`);
      return geometricCenterX;
    }

    // Check if essentially rectangular (axis-aligned bounding box match)
    if (corridor.polygon.length <= 5) {
       return geometricCenterX;
    }
    
    if (!this.agent || !this.agent.clearanceMap) {
      // Fallback to geometric center
      return geometricCenterX;
    }
    
    // Sample along the entire corridor height to find optimal centerline
    const res = this.agent.options.gridResolution;
    const samples = [];
    const sampleStep = Math.max(res, (maxY - minY) / 15); // Sample ~15 points across corridor
    
    for (let sampleY = minY; sampleY <= maxY; sampleY += sampleStep) {
      let bestX = geometricCenterX;
      let bestClearance = 0;
      let totalWeight = 0;
      let weightedSum = 0;
      
      // Sample multiple X values and find the one with best clearance
      for (let testX = minX; testX <= maxX; testX += res) {
        const gridX = Math.floor(testX / res);
        const gridY = Math.floor(sampleY / res);
        
        if (gridX >= 0 && gridX < this.agent.gridWidth && 
            gridY >= 0 && gridY < this.agent.gridHeight) {
          const idx = gridY * this.agent.gridWidth + gridX;
          
          // Only consider points inside the corridor
          if (this.agent.isPointInPolygon(testX, sampleY, corridor.polygon)) {
            const clearance = this.agent.clearanceMap[idx] || 0;
            // Weight by clearance squared to prefer higher clearance (centers in widest part)
            const weight = clearance * clearance;
            weightedSum += testX * weight;
            totalWeight += weight;
            
            if (clearance > bestClearance) {
              bestClearance = clearance;
              bestX = testX;
            }
          }
        }
      }
      
      // Use weighted average if we have samples, otherwise use best
      if (totalWeight > 0) {
        const weightedX = weightedSum / totalWeight;
        samples.push(weightedX);
      } else if (bestClearance > 0) {
        samples.push(bestX);
      }
    }
    
    // Return median of samples for stability (resistant to outliers)
    if (samples.length > 0) {
      samples.sort((a, b) => a - b);
      return samples[Math.floor(samples.length / 2)];
    }
    
    // Final fallback: geometric center
    return geometricCenterX;
  }

  /**
   * Ensure path reaches destination with proper turn if needed
   * If destination is not at the last path point, add a final segment with 90-degree turn
   */
  ensurePathReachesDestination(path, destX, destY, floor) {
    if (path.length === 0) {
      // No path, just add destination
      return [{ x: destX, y: destY, locationName: 'Destination', floor }];
    }

    const lastPoint = path[path.length - 1];
    const distToDest = Math.sqrt(
      Math.pow(lastPoint.x - destX, 2) + Math.pow(lastPoint.y - destY, 2)
    );

    // If we're already very close to destination, just update the last point
    if (distToDest < 10) {
      const finalPath = [...path];
      finalPath[finalPath.length - 1] = {
        ...lastPoint,
        x: destX,
        y: destY,
        locationName: 'Destination',
        floor
      };
      return finalPath;
    }

    // Check if destination is in a corridor or room
    const destCorridor = this.getCorridorForPoint(destX, destY, floor, 50);
    const lastCorridor = this.getCorridorForPoint(lastPoint.x, lastPoint.y, floor, 20);

    const finalPath = [...path];

    // If destination is in a different corridor or outside any corridor (in a room)
    if (!destCorridor || (destCorridor && lastCorridor && destCorridor.id !== lastCorridor.id)) {
      // Need to add a turn segment to reach destination
      // Determine turn direction based on corridor orientation

      if (lastCorridor) {
        const orientation = this.getCorridorOrientation(lastCorridor);
        
        // Create 90-degree turn to destination
        let turnPoint;
        
        if (orientation === 'horizontal') {
          // Horizontal corridor: turn vertically first, then horizontally to destination
          // Or vice versa depending on which is closer
          const dx = destX - lastPoint.x;
          const dy = destY - lastPoint.y;
          
          if (Math.abs(dy) > Math.abs(dx)) {
            // Vertical distance is larger, turn vertical first
            turnPoint = {
              x: lastPoint.x,
              y: destY,
              locationName: lastPoint.locationName || 'Turn',
              floor
            };
          } else {
            // Horizontal distance is larger, turn horizontal first
            turnPoint = {
              x: destX,
              y: lastPoint.y,
              locationName: lastPoint.locationName || 'Turn',
              floor
            };
          }
        } else {
          // Vertical corridor: turn horizontally first, then vertically to destination
          const dx = destX - lastPoint.x;
          const dy = destY - lastPoint.y;
          
          if (Math.abs(dx) > Math.abs(dy)) {
            // Horizontal distance is larger, turn horizontal first
            turnPoint = {
              x: destX,
              y: lastPoint.y,
              locationName: lastPoint.locationName || 'Turn',
              floor
            };
          } else {
            // Vertical distance is larger, turn vertical first
            turnPoint = {
              x: lastPoint.x,
              y: destY,
              locationName: lastPoint.locationName || 'Turn',
              floor
            };
          }
        }

        // Only add turn point if it's significantly different
        if (Math.abs(turnPoint.x - lastPoint.x) > 1 || Math.abs(turnPoint.y - lastPoint.y) > 1) {
          finalPath.push(turnPoint);
        }
      } else {
        // No corridor context, create simple 90-degree turn
        const dx = destX - lastPoint.x;
        const dy = destY - lastPoint.y;
        
        if (Math.abs(dx) > Math.abs(dy)) {
          // Turn horizontal first
          finalPath.push({
            x: destX,
            y: lastPoint.y,
            locationName: 'Turn',
            floor
          });
        } else {
          // Turn vertical first
          finalPath.push({
            x: lastPoint.x,
            y: destY,
            locationName: 'Turn',
            floor
          });
        }
      }
    }

    // Always end with exact destination coordinates
    finalPath.push({
      x: destX,
      y: destY,
      locationName: 'Destination',
      floor
    });

    return finalPath;
  }

  /**
   * Create orthogonal (90-degree) turns between segments
   */
  createOrthogonalTurns(segments) {
    if (segments.length === 0) return [];
    if (segments.length === 1) return segments[0];

    const finalPath = [];
    
    // Add first segment (keep start point)
    finalPath.push(...segments[0]);

    for (let i = 1; i < segments.length; i++) {
      const prevSeg = segments[i - 1];
      const currSeg = segments[i];
      
      if (prevSeg.length === 0 || currSeg.length === 0) {
        finalPath.push(...currSeg);
        continue;
      }

      const prevLast = prevSeg[prevSeg.length - 1];
      const currFirst = currSeg[0];

      // Check if we need a 90-degree turn
      const dx = currFirst.x - prevLast.x;
      const dy = currFirst.y - prevLast.y;

      // If both X and Y change significantly, create a 90-degree turn
      if (Math.abs(dx) > 1 && Math.abs(dy) > 1) {
        // Determine turn direction: horizontal first or vertical first?
        // Use the direction that's closer to the previous segment's direction
        const prevDx = prevSeg.length > 1 ? prevLast.x - prevSeg[prevSeg.length - 2].x : 0;
        const prevDy = prevSeg.length > 1 ? prevLast.y - prevSeg[prevSeg.length - 2].y : 0;

        let turnPoint;
        
        // If previous segment was mostly horizontal, turn horizontal first, then vertical
        if (Math.abs(prevDx) > Math.abs(prevDy)) {
          turnPoint = { 
            x: currFirst.x, 
            y: prevLast.y,
            locationName: prevLast.locationName || currFirst.locationName,
            floor: prevLast.floor || currFirst.floor || 1
          };
        } else {
          // Previous segment was mostly vertical, turn vertical first, then horizontal
          turnPoint = { 
            x: prevLast.x, 
            y: currFirst.y,
            locationName: prevLast.locationName || currFirst.locationName,
            floor: prevLast.floor || currFirst.floor || 1
          };
        }

        // Only add turn point if it's significantly different from previous point
        if (Math.abs(turnPoint.x - prevLast.x) > 1 || Math.abs(turnPoint.y - prevLast.y) > 1) {
          finalPath.push(turnPoint);
        }
      }

      // Add current segment (skip first point if it's the same as last turn point)
      const skipFirst = finalPath.length > 0 && 
        Math.abs(finalPath[finalPath.length - 1].x - currFirst.x) < 1 &&
        Math.abs(finalPath[finalPath.length - 1].y - currFirst.y) < 1;

      if (skipFirst) {
        finalPath.push(...currSeg.slice(1));
      } else {
        finalPath.push(...currSeg);
      }
    }

    // Clean up duplicate consecutive points
    const cleanedPath = [];
    for (const p of finalPath) {
      if (cleanedPath.length === 0 ||
          Math.abs(cleanedPath[cleanedPath.length - 1].x - p.x) > 0.1 ||
          Math.abs(cleanedPath[cleanedPath.length - 1].y - p.y) > 0.1) {
        cleanedPath.push(p);
      }
    }

    return cleanedPath;
  }

  /**
   * Find the centerline point near a given position
   * Uses hill-climbing on the clearance map
   */
  findCenterlinePoint(x, y) {
    const res = this.agent.options.gridResolution;
    const gridX = Math.floor(x / res);
    const gridY = Math.floor(y / res);

    // Get current clearance
    const idx = gridY * this.agent.gridWidth + gridX;
    let bestClearance = this.agent.clearanceMap[idx] || 0;
    let bestX = x;
    let bestY = y;

    // Search in a small radius (2 cells = ~20px) for higher clearance
    const searchRadius = 2;
    for (let dy = -searchRadius; dy <= searchRadius; dy++) {
      for (let dx = -searchRadius; dx <= searchRadius; dx++) {
        const nx = gridX + dx;
        const ny = gridY + dy;

        if (nx >= 0 && nx < this.agent.gridWidth && ny >= 0 && ny < this.agent.gridHeight) {
          const nIdx = ny * this.agent.gridWidth + nx;
          const clearance = this.agent.clearanceMap[nIdx] || 0;

          // Only move if significantly better clearance and still navigable
          if (clearance > bestClearance + 1 && this.agent.navigableGrid[nIdx] === 1) {
            bestClearance = clearance;
            bestX = (nx + 0.5) * res;
            bestY = (ny + 0.5) * res;
          }
        }
      }
    }

    return { x: bestX, y: bestY };
  }

  /**
   * Check if a line segment cuts through a corner or non-navigable area
   * Uses the RL agent's grid for ground-truth verification
   */
  segmentCutsCorner(p1, p2) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Sample frequently (every 4 pixels) for maximum safety
    const stepCount = Math.max(2, Math.ceil(dist / 4));

    for (let i = 1; i < stepCount; i++) {
      const t = i / stepCount;
      const x = p1.x + dx * t;
      const y = p1.y + dy * t;

      // Use strict grid navigation check
      if (!this.agent.isPointNavigable(x, y)) {
        return true; // Hits a wall or non-corridor area
      }
    }

    return false;
  }

  /**
   * Check if point is inside any corridor polygon (Proxy to agent grid)
   */
  isPointInAnyCorridor(x, y, floor = 1) {
    return this.agent.isPointNavigable(x, y);
  }

  /**
   * Standard Douglas-Peucker algorithm (Not used, kept for reference)
   */
  douglasPeucker(path, tolerance) {
    if (path.length <= 2) return path;
    const first = path[0];
    const last = path[path.length - 1];
    let maxDist = 0;
    let maxIdx = 0;
    for (let i = 1; i < path.length - 1; i++) {
      const dist = this.pointToLineDistance(path[i], first, last);
      if (dist > maxDist) {
        maxDist = dist;
        maxIdx = i;
      }
    }
    if (maxDist > tolerance) {
      const left = this.douglasPeucker(path.slice(0, maxIdx + 1), tolerance);
      const right = this.douglasPeucker(path.slice(maxIdx), tolerance);
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

