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
   * Now includes ALL floors (0 and 1) so agent can navigate on both
   */
  updateAgentEnvironment() {
    // Include corridors and destinations from BOTH floor 0 and floor 1
    const allCorridors = this.corridors.filter(c => c.floor === 0 || c.floor === 1);
    const allDestinations = this.destinations.filter(d => d.floor === 0 || d.floor === 1);

    console.log(`📐 Setting up agent environment with ${allCorridors.length} corridors (F0: ${this.corridors.filter(c => c.floor === 0).length}, F1: ${this.corridors.filter(c => c.floor === 1).length})`);
    console.log(`📐 And ${allDestinations.length} destinations (F0: ${this.destinations.filter(d => d.floor === 0).length}, F1: ${this.destinations.filter(d => d.floor === 1).length})`);

    // Calculate actual dimensions from corridor data to ensure all areas are covered
    let maxX = 0, maxY = 0;
    for (const corridor of allCorridors) {
      if (corridor.polygon) {
        for (const point of corridor.polygon) {
          maxX = Math.max(maxX, point[0]);
          maxY = Math.max(maxY, point[1]);
        }
      }
    }
    for (const dest of allDestinations) {
      maxX = Math.max(maxX, dest.x);
      maxY = Math.max(maxY, dest.y);
    }

    // Use the maximum dimensions from both floor images
    const floor0Width = this.imageDimensions[0]?.width || 2464;
    const floor0Height = this.imageDimensions[0]?.height || 1728;
    const floor1Width = this.imageDimensions[1]?.width || 2464;
    const floor1Height = this.imageDimensions[1]?.height || 1728;

    // Add padding and ensure minimum size covers both floors
    const dims = {
      width: Math.max(maxX + 100, floor0Width, floor1Width),
      height: Math.max(maxY + 100, floor0Height, floor1Height)
    };

    console.log(`📐 Calculated navigation space: ${dims.width}x${dims.height} (from ${allCorridors.length} corridors across both floors)`);

    this.agent.setEnvironment(allCorridors, allDestinations, dims);

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
   * Find all destinations matching a query (for multiple exit support)
   * If floor is null/undefined, searches across all floors
   */
  findAllDestinations(query, floor = null) {
    const q = query.toLowerCase().trim();
    const matches = [];

    // If no destinations, return empty
    if (this.destinations.length === 0) {
      return matches;
    }

    // Helper to filter by floor if specified
    // Important: floor 0 is a valid floor, so we need to check for null/undefined explicitly
    const floorFilter = (d) => {
      if (floor === null || floor === undefined) return true; // Search all floors
      // Handle both number and string comparisons, and ensure 0 is handled correctly
      const destFloor = typeof d.floor === 'number' ? d.floor : (d.floor !== undefined && d.floor !== null ? parseInt(d.floor) : null);
      const searchFloor = typeof floor === 'number' ? floor : parseInt(floor);
      // Both must be valid numbers and equal
      if (destFloor === null || isNaN(destFloor) || isNaN(searchFloor)) return false;
      return destFloor === searchFloor;
    };

    // Direct zone match
    const zoneMatches = this.destinations.filter(d =>
      floorFilter(d) && d.zone?.toLowerCase() === q
    );
    if (zoneMatches.length > 0) return zoneMatches;

    // Name exact match
    const nameExactMatches = this.destinations.filter(d =>
      floorFilter(d) && d.name?.toLowerCase() === q
    );
    if (nameExactMatches.length > 0) return nameExactMatches;

    // Name contains query
    const nameContainsMatches = this.destinations.filter(d =>
      floorFilter(d) && d.name?.toLowerCase().includes(q)
    );
    if (nameContainsMatches.length > 0) return nameContainsMatches;

    // Zone contains query
    const zoneContainsMatches = this.destinations.filter(d =>
      floorFilter(d) && d.zone?.toLowerCase().includes(q)
    );
    if (zoneContainsMatches.length > 0) return zoneContainsMatches;

    // Parse zone number (e.g., "zone 5" -> look for exit that might serve zone 5)
    const zoneMatch = q.match(/zone\s*(\d+)/i);
    if (zoneMatch) {
      const zoneNum = parseInt(zoneMatch[1]);
      const zoneNumPadded = zoneMatch[1].padStart(2, '0');

      // Try to find destination with zone info
      const zoneNumMatches = this.destinations.filter(d =>
        floorFilter(d) && (
          d.zone?.toLowerCase().includes(`zone_${zoneNumPadded}`) ||
          d.zone?.toLowerCase().includes(`zone${zoneNumPadded}`) ||
          d.zone?.toLowerCase().includes(`zone ${zoneNum}`) ||
          d.name?.toLowerCase().includes(`zone_${zoneNumPadded}`) ||
          d.name?.toLowerCase().includes(`zone ${zoneNum}`) ||
          d.name?.toLowerCase().includes(`zone${zoneNum}`)
        )
      );
      if (zoneNumMatches.length > 0) return zoneNumMatches;

      // Fallback: if destinations don't have zone info, use position-based heuristic
      // Zones are typically numbered left-to-right, top-to-bottom
      const floorDests = this.destinations.filter(d => floorFilter(d));
      if (floorDests.length > 0) {
        // Sort by x coordinate and pick based on zone number
        const sorted = [...floorDests].sort((a, b) => a.x - b.x);
        const index = Math.min(zoneNum - 1, sorted.length - 1);
        const selected = sorted[Math.max(0, index)];
        console.log(`📍 Using position-based heuristic for Zone ${zoneNum}: ${selected?.name}`);
        return selected ? [selected] : [];
      }
    }

    // Facility match (lavatory, restroom, etc.)
    if (q.includes('lavatory') || q.includes('restroom') || q.includes('toilet') || q.includes('bathroom') || q.includes('lav')) {
      const facilityMatches = this.destinations.filter(d =>
        floorFilter(d) && (
          d.name?.toLowerCase().includes('restroom') ||
          d.name?.toLowerCase().includes('lavatory') ||
          d.name?.toLowerCase().includes('lav') ||
          d.zone?.toLowerCase().includes('restroom') ||
          d.zone?.toLowerCase().includes('lav')
        )
      );
      if (facilityMatches.length > 0) return facilityMatches;
    }

    // Lift/elevator match
    if (q.includes('lift') || q.includes('elevator') || q.includes('lobby')) {
      const liftMatches = this.destinations.filter(d =>
        floorFilter(d) && (
          d.name?.toLowerCase().includes('lift') ||
          d.name?.toLowerCase().includes('elevator') ||
          d.name?.toLowerCase().includes('lobby') ||
          d.zone?.toLowerCase().includes('lift') ||
          d.zone?.toLowerCase().includes('lobby')
        )
      );
      if (liftMatches.length > 0) return liftMatches;
    }

    // Pantry match
    if (q.includes('pantry') || q.includes('kitchen') || q.includes('break room')) {
      const pantryMatches = this.destinations.filter(d =>
        floorFilter(d) && (
          d.name?.toLowerCase().includes('pantry') ||
          d.zone?.toLowerCase().includes('pantry')
        )
      );
      if (pantryMatches.length > 0) return pantryMatches;
    }

    // Exit number match (e.g., "exit 3" or just "3")
    const exitMatch = q.match(/(?:exit\s*)?(\d+)/i);
    if (exitMatch) {
      const exitNum = exitMatch[1];
      const exitMatches = this.destinations.filter(d =>
        floorFilter(d) && (
          d.name?.toLowerCase().includes(`exit ${exitNum}`) ||
          d.name?.toLowerCase() === `exit ${exitNum}` ||
          d.name?.toLowerCase() === `exit${exitNum}`
        )
      );
      if (exitMatches.length > 0) return exitMatches;
    }

    return matches;
  }

  /**
   * Find destination by name/zone (returns first match for backward compatibility)
   */
  findDestination(query, floor = null) {
    // If floor is not specified, search all floors
    const allMatches = this.findAllDestinations(query, floor);
    if (allMatches.length === 0) {
      // Log available destinations for debugging
      const floorDests = floor !== null && floor !== undefined 
        ? this.destinations.filter(d => d.floor === floor)
        : this.destinations;
      const available = floorDests.map(d => `${d.name} (F${d.floor || '?'})`).join(', ');
      console.warn(`⚠️ Destination "${query}" not found on floor ${floor !== null ? floor : 'any'}. Available: ${available}`);
    }
    return allMatches.length > 0 ? allMatches[0] : null;
  }

  /**
   * Get all exits for a zone (for multiple exit support)
   * If floor is null/undefined, searches across all floors
   */
  getZoneExits(zoneId, floor = null) {
    const floorFilter = (d) => floor === null || floor === undefined || d.floor === floor;
    return this.destinations.filter(d =>
      floorFilter(d) && (
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
   * Find exit closest to a destination point from multiple exits
   * Used when selecting start position - choose exit that's closest to destination
   */
  findExitClosestToDestination(destX, destY, exits) {
    if (exits.length === 0) return null;
    if (exits.length === 1) return exits[0];

    let closest = exits[0];
    let minDist = Infinity;

    for (const exit of exits) {
      const dist = Math.sqrt((exit.x - destX) ** 2 + (exit.y - destY) ** 2);
      if (dist < minDist) {
        minDist = dist;
        closest = exit;
      }
    }

    return closest;
  }

  /**
   * Find a valid start position within corridors
   * If multiple exits with same name exist, chooses the one closest to destination
   */
  findStartPosition(query, floor = 1, destinationPoint = null) {
    const q = query?.toLowerCase().trim() || '';

    // Try to find by query first
    if (q) {
      // Check if it matches any destination(s) - handle multiple exits
      const allMatches = this.findAllDestinations(query, floor);
      if (allMatches.length > 0) {
        let selectedDest = null;
        
        // If multiple exits with same name and we have destination point, choose closest to destination
        if (allMatches.length > 1 && destinationPoint) {
          selectedDest = this.findExitClosestToDestination(
            destinationPoint.x, 
            destinationPoint.y, 
            allMatches
          );
          console.log(`📍 Multiple exits found for "${query}", selected closest to destination: ${selectedDest.name} at (${selectedDest.x}, ${selectedDest.y})`);
        } else {
          // Single match or no destination point - use first match
          selectedDest = allMatches[0];
        }
        
        if (selectedDest && this.agent.isPointNavigable(selectedDest.x, selectedDest.y)) {
          return { x: selectedDest.x, y: selectedDest.y, name: selectedDest.name };
        }
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
    const { floor = null, startX, startY, startFloor = null, destFloor = null } = options; // Allow null to search all floors

    // Step 1: Find all possible destination candidates
    // If destFloor is specified, search that floor first, otherwise search all floors
    let allDestCandidates = [];
    if (destFloor !== null && destFloor !== undefined) {
      console.log(`🔍 Searching for "${destQuery}" on floor ${destFloor}`);
      // Search specific floor first (including floor 0)
      allDestCandidates = this.findAllDestinations(destQuery, destFloor);
      console.log(`   Found ${allDestCandidates.length} candidates on floor ${destFloor}`);
      // If not found, fallback to all floors
      if (allDestCandidates.length === 0) {
        console.log(`   No matches on floor ${destFloor}, searching all floors...`);
        allDestCandidates = this.findAllDestinations(destQuery, null);
        console.log(`   Found ${allDestCandidates.length} candidates across all floors`);
      }
    } else {
      // Search all floors
      console.log(`🔍 Searching for "${destQuery}" across all floors`);
      allDestCandidates = this.findAllDestinations(destQuery, null);
      console.log(`   Found ${allDestCandidates.length} candidates`);
    }
    
    let destCandidates = allDestCandidates.length > 0 
      ? allDestCandidates 
      : this.getZoneExits(destQuery, null); // Try zone exits across all floors

    // If zone exits also needs floor, search common floors
    if (destCandidates.length === 0) {
      console.log(`   Trying zone exits on floors 0 and 1...`);
      // Try floor 0 and 1 explicitly
      const exits0 = this.getZoneExits(destQuery, 0);
      const exits1 = this.getZoneExits(destQuery, 1);
      console.log(`   Floor 0: ${exits0.length} exits, Floor 1: ${exits1.length} exits`);
      destCandidates = exits0.concat(exits1);
    }

    // Step 2: Find all possible start candidates
    let startCandidates = [];
    if (startX && startY) {
      // Explicit coordinates provided - need to determine floor
      // Use startFloor hint if provided, otherwise detect from corridors
      let detectedFloor = startFloor !== null ? startFloor : (floor || 1);
      if (startFloor === null) {
        for (const corridor of this.corridors) {
          if (corridor.polygon && this.isPointInPolygon(startX, startY, corridor.polygon)) {
            detectedFloor = corridor.floor !== undefined ? corridor.floor : 1;
            break;
          }
        }
      }
      startCandidates = [{ x: startX, y: startY, name: startQuery || 'Start', floor: detectedFloor }];
    } else if (startQuery) {
      // Find all start positions matching the query
      // If startFloor is specified, search that floor first
      let allStartMatches = [];
      if (startFloor !== null) {
        allStartMatches = this.findAllDestinations(startQuery, startFloor);
        // If not found, fallback to all floors
        if (allStartMatches.length === 0) {
          allStartMatches = this.findAllDestinations(startQuery, null);
        }
      } else {
        allStartMatches = this.findAllDestinations(startQuery, null);
      }
      if (allStartMatches.length > 0) {
        startCandidates = allStartMatches;
      } else {
        // Try zone exits for start (all floors)
        const startZoneExits0 = this.getZoneExits(startQuery, 0);
        const startZoneExits1 = this.getZoneExits(startQuery, 1);
        const startZoneExits = startZoneExits0.concat(startZoneExits1);
        if (startZoneExits.length > 0) {
          startCandidates = startZoneExits;
        } else {
          // Fallback to findStartPosition - try both floors
          const fallbackStart0 = this.findStartPosition(startQuery, 0, null);
          const fallbackStart1 = this.findStartPosition(startQuery, 1, null);
          if (fallbackStart0) {
            startCandidates.push({ ...fallbackStart0, floor: 0 });
          }
          if (fallbackStart1) {
            startCandidates.push({ ...fallbackStart1, floor: 1 });
          }
        }
      }
    } else {
      // No start query - use fallback (try both floors)
      const fallbackStart0 = this.findStartPosition('', 0, null);
      const fallbackStart1 = this.findStartPosition('', 1, null);
      if (fallbackStart0) {
        startCandidates.push({ ...fallbackStart0, floor: 0 });
      }
      if (fallbackStart1) {
        startCandidates.push({ ...fallbackStart1, floor: 1 });
      }
    }

    if (startCandidates.length === 0) {
      return { success: false, error: 'Could not find a valid start position. Make sure corridors are defined.' };
    }

    if (destCandidates.length === 0) {
      // List available destinations across all floors
      const allDests = this.destinations.map(d => `${d.name} (F${d.floor || '?'})`).join(', ');
      return {
        success: false,
        error: `Destination "${destQuery}" not found. Available destinations: ${allDests}`
      };
    }

    // Step 3: Smart selection
    // If multiple start candidates with same name, choose one closest to destination
    let start = null;
    if (startCandidates.length === 1) {
      start = startCandidates[0];
      // Ensure floor is set
      if (start.floor === undefined && start.floor === null) {
        // Try to detect floor from corridors
        for (const corridor of this.corridors) {
          if (corridor.polygon && this.isPointInPolygon(start.x, start.y, corridor.polygon)) {
            start.floor = corridor.floor !== undefined ? corridor.floor : 1;
            break;
          }
        }
        if (start.floor === undefined) start.floor = 1; // Default fallback
      }
    } else {
      // Multiple start positions - use destination to choose best one
      // Use first destination candidate as reference point
      const refDest = destCandidates[0];
      start = this.findExitClosestToDestination(refDest.x, refDest.y, startCandidates);
      console.log(`📍 Multiple start positions found for "${startQuery}", selected closest to destination: ${start.name} at (${start.x}, ${start.y})`);
    }

    // If multiple destination candidates with same name, choose one closest to start
    let destination = null;
    if (destCandidates.length === 1) {
      destination = destCandidates[0];
    } else {
      // Multiple destinations - use start to choose best one
      destination = this.findNearestExit(start.x, start.y, destCandidates);
      console.log(`📍 Multiple destinations found for "${destQuery}", selected closest to start: ${destination.name} at (${destination.x}, ${destination.y})`);
    }

    // Ensure both have floor information
    const computedStartFloor = start.floor !== undefined && start.floor !== null ? start.floor : 1;
    const computedDestFloor = destination.floor !== undefined && destination.floor !== null ? destination.floor : 1;

    // Step 4: Also check zone exits in case destination has zone info (on destination's floor)
    const allExits = this.getZoneExits(destination.zone || destination.name, computedDestFloor);
    const targetExit = allExits.length > 1
      ? this.findNearestExit(start.x, start.y, allExits)
      : destination;

    // Ensure targetExit has all required properties
    if (!targetExit.name) {
      targetExit.name = targetExit.displayName || targetExit.id || destination.name || 'Unknown';
    }
    if (!targetExit.id) {
      targetExit.id = destination.id || `dest_${Date.now()}`;
    }
    if (targetExit.floor === undefined || targetExit.floor === null) {
      targetExit.floor = computedDestFloor;
    }

    // Ensure start has floor and required properties
    if (start.floor === undefined || start.floor === null) {
      start.floor = computedStartFloor;
    }
    if (!start.name) {
      start.name = start.displayName || start.id || startQuery || 'Start';
    }

    console.log(`📍 Start position: (${start.x.toFixed(0)}, ${start.y.toFixed(0)}) - ${start.name} [Floor ${start.floor}]`);
    console.log(`🎯 Destination: (${targetExit.x.toFixed(0)}, ${targetExit.y.toFixed(0)}) - ${targetExit.name} [Floor ${targetExit.floor}]`);

    // Step 5: Check if start and destination are on different floors
    const startFloorNum = Number(start.floor);
    const destFloorNum = Number(targetExit.floor);
    
    console.log(`🔍 Floor comparison: Start=${startFloorNum} (${typeof start.floor}), Dest=${destFloorNum} (${typeof targetExit.floor})`);
    
    if (startFloorNum !== destFloorNum && !isNaN(startFloorNum) && !isNaN(destFloorNum)) {
      console.log(`🛗 Multi-floor navigation detected: Floor ${startFloorNum} → Floor ${destFloorNum}`);
      return this.findMultiFloorPath(start, targetExit);
    } else {
      console.log(`📍 Single-floor navigation: Both on Floor ${startFloorNum}`);
    }

    // Single floor navigation - use the floor of the start/destination
    return this.findPathToDestination(start, targetExit, start.floor);
  }

  /**
   * Handle multi-floor navigation (Start -> Lift -> Lift -> Destination)
   */
  async findMultiFloorPath(start, dest) {
    const startFloor = start.floor !== undefined ? start.floor : 1;
    const destFloor = dest.floor !== undefined ? dest.floor : 1;

    console.log(`🔄 Calculating multi-floor path: ${start.name} (F${startFloor}) → ${dest.name} (F${destFloor})`);

    // 1. Find Lift Lobby on Start Floor
    const liftLobbyStartCandidates = this.findAllDestinations('Lift Lobby', startFloor);
    let liftLobbyStart = null;
    
    if (liftLobbyStartCandidates.length > 0) {
      liftLobbyStart = this.findNearestExit(start.x, start.y, liftLobbyStartCandidates);
    } else {
      const allLifts = this.destinations.filter(d => 
        d.floor === startFloor && 
        (d.name.toLowerCase().includes('lift') || d.name.toLowerCase().includes('elevator'))
      );
      if (allLifts.length > 0) {
        liftLobbyStart = this.findNearestExit(start.x, start.y, allLifts);
      }
    }

    if (!liftLobbyStart) {
      return {
        success: false,
        error: `Could not find a Lift Lobby on Floor ${startFloor} to transfer floors.`
      };
    }

    // 2. Find Lift Lobby on Destination Floor
    const liftLobbyDestCandidates = this.findAllDestinations('Lift Lobby', destFloor);
    let liftLobbyDest = null;

    if (liftLobbyDestCandidates.length > 0) {
       liftLobbyDest = this.findExitClosestToDestination(dest.x, dest.y, liftLobbyDestCandidates);
    } else {
       const allLifts = this.destinations.filter(d => 
        d.floor === destFloor && 
        (d.name.toLowerCase().includes('lift') || d.name.toLowerCase().includes('elevator'))
      );
      if (allLifts.length > 0) {
        liftLobbyDest = this.findExitClosestToDestination(dest.x, dest.y, allLifts);
      }
    }

    if (!liftLobbyDest) {
      return {
        success: false,
        error: `Could not find a Lift Lobby on Destination Floor ${destFloor}.`
      };
    }

    console.log(`📍 Route: ${start.name} → ${liftLobbyStart.name} (Lift) → ${liftLobbyDest.name} (Lift) → ${dest.name}`);

    // 3. Calculate Path 1: Start -> Lift Lobby (Start Floor)
    const liftStartTarget = { ...liftLobbyStart, name: `Lift to Floor ${destFloor}` };
    const path1Result = this.findPathToDestination(start, liftStartTarget, startFloor);

    if (!path1Result.success) {
      return {
        success: false,
        error: `Could not find path to Lift Lobby on Floor ${startFloor}: ${path1Result.error}`
      };
    }

    // 4. Calculate Path 2: Lift Lobby (Dest Floor) -> Destination
    const liftDestStart = { ...liftLobbyDest, name: `Lift from Floor ${startFloor}` };
    const path2Result = this.findPathToDestination(liftDestStart, dest, destFloor);

    if (!path2Result.success) {
      return {
        success: false,
        error: `Could not find path from Lift Lobby on Floor ${destFloor}: ${path2Result.error}`
      };
    }

    // 5. Combine Results
    // Add "Lift Transfer" virtual step
    const liftStep = {
      x: liftLobbyStart.x,
      y: liftLobbyStart.y,
      locationName: 'Elevator',
      floor: startFloor, // Technically transition happens here
      isFloorChange: true,
      nextDirection: 'up' // or down, irrelevant
    };

    // Ensure path2 starts cleanly
    const path2Clean = path2Result.path.map(p => ({ ...p, floor: destFloor }));

    const combinedPath = [
      ...path1Result.path.map(p => ({ ...p, floor: startFloor })),
      liftStep,
      ...path2Clean
    ];
    
    // Create combined stats
    const combinedStats = {
      totalDistance: path1Result.stats.totalDistance + path2Result.stats.totalDistance,
      originalPoints: path1Result.stats.originalPoints + path2Result.stats.originalPoints,
      simplifiedPoints: path1Result.stats.simplifiedPoints + path2Result.stats.simplifiedPoints,
      nodesExplored: (path1Result.nodesExplored || 0) + (path2Result.nodesExplored || 0)
    };

    // Store per-floor SVG paths
    const floorPaths = {
      [startFloor]: path1Result.svgPath,
      [destFloor]: path2Result.svgPath
    };
    
    // Store per-floor arrows
    const floorArrows = {
        [startFloor]: path1Result.arrows || [],
        [destFloor]: path2Result.arrows || []
    };

    return {
      success: true,
      path: combinedPath,
      svgPath: path1Result.svgPath, // Default
      floorPaths: floorPaths,
      floorArrows: floorArrows,
      start: start,
      destination: dest,
      stats: combinedStats,
      isMultiFloor: true
    };
  }

  /**
   * Find path to a specific destination
   */
  findPathToDestination(start, destination, floor) {
    if (!destination) {
      return { success: false, error: 'Invalid destination' };
    }

    // Ensure destination has required properties
    const destName = destination.name || destination.displayName || destination.id || 'Unknown';
    const destId = destination.id || `dest_${Date.now()}`;
    const destX = destination.x;
    const destY = destination.y;
    const destFloor = destination.floor !== undefined ? destination.floor : floor;

    if (destX === undefined || destY === undefined) {
      return { success: false, error: `Invalid destination coordinates for ${destName}` };
    }

    console.log(`🚀 Finding path: (${start.x.toFixed(0)}, ${start.y.toFixed(0)}) → ${destName} (${destX.toFixed(0)}, ${destY.toFixed(0)}) [Floor ${destFloor}]`);

    // Use RL agent to find path with floor-specific grid
    const result = this.agent.findPath(
      start.x, start.y,
      destX, destY,
      destId,
      destFloor
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
      // Use the actual destination floor, not the passed floor parameter
      const actualFloor = destFloor !== undefined ? destFloor : floor;
      let lastKnownLocation = 'Start';
      const enrichedFullPath = result.path.map((p, idx) => {
        // Use larger tolerance (20px) to catch points near corridor boundaries
        // This ensures Main Corridor is properly identified even if points are slightly off
        const corridor = this.getCorridorForPoint(p.x, p.y, actualFloor, 20);
        let locationName;
        if (corridor) {
          locationName = (corridor.displayName || corridor.name);
          lastKnownLocation = locationName;
        } else {
          // If no corridor found, check with even larger tolerance for Main Corridor
          const mainCorridor = this.getCorridors(actualFloor).find(c => 
            (c.name || '').toLowerCase().includes('main')
          );
          if (mainCorridor) {
            const foundCorridor = this.getCorridorForPoint(p.x, p.y, actualFloor, 50);
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
        return { ...p, locationName, floor: actualFloor };
      });

      // Now, simplify PER CORRIDOR SEGMENT to preserve turn points at junctions
      // Increase tolerance to 20 to ensure long straight lines in center of corridors
      const simplifiedPath = this.simplifyPerSegment(enrichedFullPath, 20);

      // Use Aggressive Axis Snapping method
      // This treats corridors as magnetic axes and snaps points to them globally
      let enrichedPath = this.snapPathToCorridorAxes(simplifiedPath, actualFloor);

      // Validate all path points are within corridors (filter out invalid points)
      enrichedPath = this.validatePathPoints(enrichedPath, actualFloor);

      // Ensure path turns to and connects with destination point
      enrichedPath = this.ensurePathReachesDestination(enrichedPath, destX, destY, floor);
      
      // Final validation after destination connection
      enrichedPath = this.validatePathPoints(enrichedPath, actualFloor);

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
          id: destId,
          name: destName,
          zone: destination.zone,
          x: destX,
          y: destY,
          floor: destFloor
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
      console.warn(`⚠️ Path not found to ${destName}`);

      // If we have a partial path, try to use it
      if (result.path && result.path.length > 2) {
        console.log(`📏 Using partial path with ${result.path.length} points`);
        // First, enrich ALL path points with corridor names (before simplification)
        let lastLoc = 'Start';
        const enrichedFullPath = result.path.map(p => {
          const corridor = this.getCorridorForPoint(p.x, p.y, floor, 5); // Sharp transition
          if (corridor) lastLoc = (corridor.displayName || corridor.name);
          return { ...p, locationName: lastLoc, floor: floor };
        });

        const simplifiedPath = this.simplifyPerSegment(enrichedFullPath);
        let enrichedPath = this.snapPathToCorridorAxes(simplifiedPath, floor);

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
        error: `Could not find navigable path to ${destName}. The RL agent may need more training, or the corridors may not connect properly.`,
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
   * Snap path points to the nearest corridor axis
   * This ignores segment continuity and treats the floor as a grid of axes
   * Handles transitions by finding the intersection of axes
   */
  snapPathToCorridorAxes(path, floor = null) {
    if (path.length < 2) return path;
    // Use provided floor, or try to get from path, or default to 1
    const pathFloor = floor !== null ? floor : (path[0]?.floor ?? 1);

    // 1. Get all axes for this floor
    const axes = [];
    // Ensure centers are computed
    if (!this.corridorCenters || this.corridorCenters.size === 0) {
      this.computeAllCorridorCenters();
    }

    const floorCorridors = this.getCorridors(pathFloor);
    console.log(`📐 snapPathToCorridorAxes: Floor ${pathFloor}, found ${floorCorridors.length} corridors`);
    for (const corridor of floorCorridors) {
      const centerData = this.corridorCenters.get(corridor.id);
      if (centerData && centerData.computed) {
        axes.push({
          id: corridor.id,
          orientation: centerData.orientation,
          value: centerData.centerValue,
          bounds: centerData.bounds,
          polygon: corridor.polygon // Include polygon for accurate containment check
        });
        console.log(`  ✓ ${corridor.name}: ${centerData.orientation}, center=${centerData.centerValue.toFixed(0)}, bounds=[${centerData.bounds.minX.toFixed(0)},${centerData.bounds.maxX.toFixed(0)}]x[${centerData.bounds.minY.toFixed(0)},${centerData.bounds.maxY.toFixed(0)}]`);
      } else {
        console.log(`  ⚠ ${corridor.name}: No center data computed`);
      }
    }

    // 2. Snap each point to the best axis
    // First check polygon containment, then fall back to bounding box with validation
    const snappedPoints = path.map(p => {
      // First try: find corridors that ACTUALLY contain this point (polygon check)
      let containingAxes = axes.filter(axis => {
        return this.agent.isPointInPolygon(p.x, p.y, axis.polygon);
      });

      // If no polygon match, try bounding box check (for points near corridor edges)
      if (containingAxes.length === 0) {
        containingAxes = axes.filter(axis => {
          const padding = 15; // Smaller padding for edge cases
          return p.x >= axis.bounds.minX - padding && 
                 p.x <= axis.bounds.maxX + padding &&
                 p.y >= axis.bounds.minY - padding && 
                 p.y <= axis.bounds.maxY + padding;
        });
      }

      if (containingAxes.length === 0) {
        // Point not near any corridor - keep original
        return { ...p };
      }

      // If multiple axes (intersection of corridors), find best fit
      const hAxis = containingAxes.find(a => a.orientation === 'horizontal');
      const vAxis = containingAxes.find(a => a.orientation === 'vertical');

      let snappedPoint = { ...p };

      if (hAxis && vAxis) {
        // Intersection: snap to both axes
        snappedPoint = { ...p, x: vAxis.value, y: hAxis.value, locationName: 'Intersection' };
      } else if (hAxis) {
        snappedPoint = { ...p, y: hAxis.value };
      } else if (vAxis) {
        snappedPoint = { ...p, x: vAxis.value };
      }

      // Validate that snapped point is still inside a corridor polygon (with tolerance)
      const snappedCorridor = this.getCorridorForPoint(snappedPoint.x, snappedPoint.y, pathFloor, 15);
      
      if (!snappedCorridor) {
        // Snapped point moved outside corridors - try partial snaps
        if (hAxis) {
          const testPoint = { ...p, y: hAxis.value };
          if (this.getCorridorForPoint(testPoint.x, testPoint.y, pathFloor, 15)) {
            return testPoint;
          }
        }
        if (vAxis) {
          const testPoint = { ...p, x: vAxis.value };
          if (this.getCorridorForPoint(testPoint.x, testPoint.y, pathFloor, 15)) {
            return testPoint;
          }
        }
        // All snaps failed - keep original point
        return { ...p };
      }

      return snappedPoint;
    });

    // 3. Simplify collinear points
    const simplified = [snappedPoints[0]];
    for (let i = 1; i < snappedPoints.length; i++) {
      const prev = simplified[simplified.length - 1];
      const curr = snappedPoints[i];
      
      // If same coords, skip
      if (Math.abs(prev.x - curr.x) < 1 && Math.abs(prev.y - curr.y) < 1) continue;
      
      // If collinear with previous segment, replace last point
      if (simplified.length > 1) {
        const prevPrev = simplified[simplified.length - 2];
        const dx1 = prev.x - prevPrev.x;
        const dy1 = prev.y - prevPrev.y;
        const dx2 = curr.x - prev.x;
        const dy2 = curr.y - prev.y;
        
        // Check if slopes match (handling vertical/horizontal perfectly)
        const isHorizontal = Math.abs(dy1) < 1 && Math.abs(dy2) < 1;
        const isVertical = Math.abs(dx1) < 1 && Math.abs(dx2) < 1;
        
        if (isHorizontal || isVertical) {
          simplified[simplified.length - 1] = curr; // Extend segment
          continue;
        }
      }
      
      simplified.push(curr);
    }

    // 4. Ensure orthogonal connections (turns) - inline logic for points
    const finalPath = [];
    if (simplified.length === 0) return [];
    if (simplified.length === 1) return simplified;

    finalPath.push(simplified[0]);
    
    for (let i = 1; i < simplified.length; i++) {
      const prev = finalPath[finalPath.length - 1];
      const curr = simplified[i];
      
      const dx = curr.x - prev.x;
      const dy = curr.y - prev.y;
      
      // If both X and Y change significantly, we need a 90-degree turn
      if (Math.abs(dx) > 1 && Math.abs(dy) > 1) {
        // Determine turn direction based on which change is larger
        let turnPoint = null;
        
        if (Math.abs(dx) > Math.abs(dy)) {
          // Horizontal move is larger - go horizontal first, then vertical
          turnPoint = {
            ...prev,
            x: curr.x,
            y: prev.y,
            locationName: prev.locationName || 'Turn',
            floor: prev.floor ?? curr.floor ?? 1
          };
        } else {
          // Vertical move is larger - go vertical first, then horizontal
          turnPoint = {
            ...prev,
            x: prev.x,
            y: curr.y,
            locationName: prev.locationName || 'Turn',
            floor: prev.floor ?? curr.floor ?? 1
          };
        }
        
        // CRITICAL: Validate turn point is inside a corridor
        if (turnPoint && (Math.abs(turnPoint.x - prev.x) > 1 || Math.abs(turnPoint.y - prev.y) > 1)) {
          const turnFloor = turnPoint.floor ?? pathFloor;
          const turnCorridor = this.getCorridorForPoint(turnPoint.x, turnPoint.y, turnFloor, 5);
          
          if (turnCorridor) {
            // Turn point is valid - add it
            finalPath.push(turnPoint);
          } else {
            // Turn point is outside corridors - try alternative turn
            // Try the other direction
            const altTurnPoint = Math.abs(dx) > Math.abs(dy) 
              ? { ...prev, x: prev.x, y: curr.y, locationName: prev.locationName || 'Turn', floor: turnFloor }
              : { ...prev, x: curr.x, y: prev.y, locationName: prev.locationName || 'Turn', floor: turnFloor };
            
            const altCorridor = this.getCorridorForPoint(altTurnPoint.x, altTurnPoint.y, turnFloor, 5);
            if (altCorridor) {
              finalPath.push(altTurnPoint);
            }
            // If both turn options fail, skip the turn point and let the path go directly
            // (This might create a diagonal, but it's better than going through walls)
          }
        }
      }
      
      // Add current point (skip if duplicate of last point)
      if (Math.abs(curr.x - finalPath[finalPath.length - 1].x) > 0.1 ||
          Math.abs(curr.y - finalPath[finalPath.length - 1].y) > 0.1) {
        finalPath.push(curr);
      }
    }

    return finalPath;
  }

  /**
   * Get corridor for a segment (use first point's corridor)
   * Improved matching for Main Corridor and other corridors
   */
  getCorridorForSegment(seg) {
    if (seg.length === 0) return null;
    const floor = seg[0].floor ?? 1;
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
      
      // Calculate bounds
      let minX = Infinity, maxX = -Infinity;
      let minY = Infinity, maxY = -Infinity;
      for (const [x, y] of corridor.polygon) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }

      if (orientation === 'horizontal') {
        centerValue = this.computeCorridorCenterY(corridor);
      } else {
        centerValue = this.computeCorridorCenterX(corridor);
      }

      this.corridorCenters.set(corridor.id, {
        orientation,
        centerValue,
        bounds: { minX, maxX, minY, maxY },
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
      const floor = seg[0].floor ?? 1;
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
    
    const boundingBoxCenterY = (minY + maxY) / 2;
    const width = maxX - minX;
    const height = maxY - minY;

    // FOR HORIZONTAL CORRIDORS: Calculate center by sampling the corridor shape
    // This handles L-shaped and irregular corridors better than bounding box center
    if (width > height) {
      // Sample the corridor at multiple X positions to find the actual center
      const centerY = this.computeLocalCenterY(corridor.polygon, minX, maxX, minY, maxY);
      console.log(`📏 Using sampled center Y for horizontal corridor "${corridor.name || corridor.id}": ${centerY.toFixed(0)} (bbox center would be ${boundingBoxCenterY.toFixed(0)})`);
      return centerY;
    }

    // For non-horizontal or simple shapes, use bounding box center
    if (corridor.polygon.length <= 5) { // Rectangle (4 pts) or simple loop (5 pts)
       return boundingBoxCenterY;
    }
    
    if (!this.agent || !this.agent.clearanceMap) {
      return boundingBoxCenterY;
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
   * Compute the local center Y by sampling the polygon at multiple X positions
   * This handles L-shaped and irregular corridors better than bounding box center
   * Returns the center Y of the "dominant" (longest) section of the corridor
   */
  computeLocalCenterY(polygon, minX, maxX, minY, maxY) {
    const numSamples = 40; // Increased samples for better accuracy
    const sampleStep = (maxX - minX) / numSamples;
    const centerYSamples = [];
    
    for (let sampleX = minX + sampleStep; sampleX < maxX - sampleStep; sampleX += sampleStep) {
      // Find the Y range at this X position by ray casting
      const intersections = [];
      
      for (let i = 0; i < polygon.length; i++) {
        const [x1, y1] = polygon[i];
        const [x2, y2] = polygon[(i + 1) % polygon.length];
        
        // Check if this edge crosses our sample X
        if ((x1 <= sampleX && x2 > sampleX) || (x2 <= sampleX && x1 > sampleX)) {
          // Calculate Y at this X using linear interpolation
          const t = (sampleX - x1) / (x2 - x1);
          const y = y1 + t * (y2 - y1);
          intersections.push(y);
        }
      }
      
      if (intersections.length >= 2) {
        // Sort intersections to find min and max Y at this X
        intersections.sort((a, b) => a - b);
        const localMinY = intersections[0];
        const localMaxY = intersections[intersections.length - 1];
        const localCenterY = (localMinY + localMaxY) / 2;
        const localHeight = localMaxY - localMinY;
        
        centerYSamples.push({ centerY: localCenterY, height: localHeight });
      }
    }
    
    if (centerYSamples.length === 0) {
      return (minY + maxY) / 2; // Fallback to bounding box center
    }
    
    // Cluster samples by centerY similarity to find the "dominant" centerline
    // This allows us to pick the center of the longest corridor section, 
    // ignoring shorter extensions or alcoves.
    const clusters = [];
    const threshold = 40; // Pixel threshold for clustering (vertical deviation)

    for (const sample of centerYSamples) {
      let added = false;
      for (const cluster of clusters) {
        // Check distance to cluster mean
        const clusterMean = cluster.sum / cluster.count;
        if (Math.abs(sample.centerY - clusterMean) < threshold) {
          cluster.samples.push(sample);
          cluster.sum += sample.centerY;
          cluster.count++;
          added = true;
          break;
        }
      }
      if (!added) {
        clusters.push({
          samples: [sample],
          sum: sample.centerY,
          count: 1
        });
      }
    }

    // Find largest cluster (representing the longest section of the corridor)
    if (clusters.length > 0) {
      clusters.sort((a, b) => b.count - a.count);
      const bestCluster = clusters[0];
      const weightedMean = bestCluster.sum / bestCluster.count;
      // console.log(`📏 Computed local center Y: ${weightedMean.toFixed(0)} (from dominant cluster of ${bestCluster.count} samples)`);
      return weightedMean;
    }
    
    // Fallback: use all samples median
    const allCenters = centerYSamples.map(s => s.centerY).sort((a, b) => a - b);
    return allCenters[Math.floor(allCenters.length / 2)];
  }

  /**
   * Compute the local center X by sampling the polygon at multiple Y positions
   * This handles L-shaped and irregular corridors better than bounding box center
   * Returns the center X of the "dominant" (longest) section of the corridor
   */
  computeLocalCenterX(polygon, minX, maxX, minY, maxY) {
    const numSamples = 40; // Increased samples
    const sampleStep = (maxY - minY) / numSamples;
    const centerXSamples = [];
    
    for (let sampleY = minY + sampleStep; sampleY < maxY - sampleStep; sampleY += sampleStep) {
      // Find the X range at this Y position by ray casting
      const intersections = [];
      
      for (let i = 0; i < polygon.length; i++) {
        const [x1, y1] = polygon[i];
        const [x2, y2] = polygon[(i + 1) % polygon.length];
        
        // Check if this edge crosses our sample Y
        if ((y1 <= sampleY && y2 > sampleY) || (y2 <= sampleY && y1 > sampleY)) {
          // Calculate X at this Y using linear interpolation
          const t = (sampleY - y1) / (y2 - y1);
          const x = x1 + t * (x2 - x1);
          intersections.push(x);
        }
      }
      
      if (intersections.length >= 2) {
        intersections.sort((a, b) => a - b);
        const localMinX = intersections[0];
        const localMaxX = intersections[intersections.length - 1];
        const localCenterX = (localMinX + localMaxX) / 2;
        const localWidth = localMaxX - localMinX;
        
        centerXSamples.push({ centerX: localCenterX, width: localWidth });
      }
    }
    
    if (centerXSamples.length === 0) {
      return (minX + maxX) / 2;
    }
    
    // Cluster samples by centerX similarity to find the "dominant" centerline
    const clusters = [];
    const threshold = 40; // Pixel threshold for clustering

    for (const sample of centerXSamples) {
      let added = false;
      for (const cluster of clusters) {
        const clusterMean = cluster.sum / cluster.count;
        if (Math.abs(sample.centerX - clusterMean) < threshold) {
          cluster.samples.push(sample);
          cluster.sum += sample.centerX;
          cluster.count++;
          added = true;
          break;
        }
      }
      if (!added) {
        clusters.push({
          samples: [sample],
          sum: sample.centerX,
          count: 1
        });
      }
    }

    // Find largest cluster
    if (clusters.length > 0) {
      clusters.sort((a, b) => b.count - a.count);
      const bestCluster = clusters[0];
      const weightedMean = bestCluster.sum / bestCluster.count;
      // console.log(`📏 Computed local center X: ${weightedMean.toFixed(0)} (from dominant cluster of ${bestCluster.count} samples)`);
      return weightedMean;
    }
    
    // Fallback: use all samples median
    const allCenters = centerXSamples.map(s => s.centerX).sort((a, b) => a - b);
    return allCenters[Math.floor(allCenters.length / 2)];
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
    
    const boundingBoxCenterX = (minX + maxX) / 2;
    const width = maxX - minX;
    const height = maxY - minY;

    // FOR VERTICAL CORRIDORS: Calculate center by sampling the corridor shape
    // This handles L-shaped and irregular corridors better than bounding box center
    if (height > width) {
      const centerX = this.computeLocalCenterX(corridor.polygon, minX, maxX, minY, maxY);
      console.log(`📏 Using sampled center X for vertical corridor "${corridor.name || corridor.id}": ${centerX.toFixed(0)} (bbox center would be ${boundingBoxCenterX.toFixed(0)})`);
      return centerX;
    }

    // For non-vertical or simple shapes, use bounding box center
    if (corridor.polygon.length <= 5) {
       return boundingBoxCenterX;
    }
    
    if (!this.agent || !this.agent.clearanceMap) {
      return boundingBoxCenterX;
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
            floor: prevLast.floor ?? currFirst.floor ?? 1
          };
        } else {
          // Previous segment was mostly vertical, turn vertical first, then horizontal
          turnPoint = { 
            x: prevLast.x, 
            y: currFirst.y,
            locationName: prevLast.locationName || currFirst.locationName,
            floor: prevLast.floor ?? currFirst.floor ?? 1
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
   * Validate that all path points are within defined corridors
   * Removes or adjusts points that are outside corridors
   */
  validatePathPoints(path, floor) {
    if (!path || path.length === 0) return path;

    const validatedPath = [];
    
    for (let i = 0; i < path.length; i++) {
      const point = path[i];
      const pointFloor = point.floor ?? floor;
      
      // Check if point is in a corridor
      const corridor = this.getCorridorForPoint(point.x, point.y, pointFloor, 10);
      
      if (corridor) {
        // Point is valid - keep it
        validatedPath.push(point);
      } else {
        // Point is outside corridors
        // Try to find nearest valid point
        const nearest = this.agent.findNearestNavigablePoint(point.x, point.y);
        
        if (nearest) {
          // Check if nearest point is actually in a corridor (not just navigable grid)
          const nearestCorridor = this.getCorridorForPoint(nearest.x, nearest.y, pointFloor, 10);
          if (nearestCorridor) {
            validatedPath.push({
              ...point,
              x: nearest.x,
              y: nearest.y,
              locationName: nearestCorridor.displayName || nearestCorridor.name
            });
          } else {
            // Nearest point is also not in a corridor - skip this point
            // But keep it if it's the start or end point (might be in a room)
            if (i === 0 || i === path.length - 1) {
              validatedPath.push(point);
            }
            // Otherwise skip it
          }
        } else {
          // No navigable point found - keep original if start/end, otherwise skip
          if (i === 0 || i === path.length - 1) {
            validatedPath.push(point);
          }
        }
      }
    }

    // Ensure we have at least start and end points
    if (validatedPath.length === 0 && path.length > 0) {
      return [path[0], path[path.length - 1]];
    }

    return validatedPath;
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

