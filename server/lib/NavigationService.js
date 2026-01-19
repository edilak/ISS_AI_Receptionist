/**
 * Unified Navigation Service
 * 
 * Integrates pathfinding, instruction generation, and visualization
 * into a single production-ready service.
 */

const PathfindingEngine = require('./PathfindingEngine');
const InstructionGenerator = require('./InstructionGenerator');
const PathVisualizer = require('./PathVisualizer');
const AdvancedPathVisualizer = require('./AdvancedPathVisualizer');
const { getInstance: getPerformanceMonitor } = require('./PerformanceMonitor');
const { getLocationGraphMongoOnly, getFloorPlansMongoOnly, getRLPolicyMongoOnly, saveRLPolicyMongoOnly } = require('./dataAccess');

class NavigationService {
  constructor(options = {}) {
    this.options = { ...options };

    this.graph = null;
    this.floorPlanData = null;
    this.pathfindingEngine = null;
    this.instructionGenerator = null;
    this.pathVisualizer = null;
    
    this.isInitialized = false;
    this.initializationError = null;

    // Auto-save Q-table interval
    this.autoSaveInterval = null;
  }

  /**
   * Initialize all navigation components
   */
  async initialize() {
    try {
      console.log('🚀 Initializing NavigationService...');

      // Load graph data
      this.graph = await this.loadGraph();
      console.log(`   📊 Loaded graph: ${this.graph.nodes.length} nodes, ${this.graph.edges.length} edges`);

      // Load floor plan data
      this.floorPlanData = await this.loadFloorPlanData();
      console.log(`   🗺️  Loaded floor plans: ${this.floorPlanData?.floors?.length || 0} floors`);

      // Initialize pathfinding engine with RL-only pathfinding
      this.pathfindingEngine = new PathfindingEngine(this.graph, {
        useRLOptimization: true,
        useAdvancedRL: true, // Use AdvancedRLAgent for RL-only pathfinding
        learningRate: 0.15, // Slightly higher learning rate for faster adaptation
        discountFactor: 0.95,
        explorationRate: 0.15, // Start with moderate exploration
        explorationDecay: 0.998, // Slow decay to maintain some exploration
        minExplorationRate: 0.05 // Keep minimum exploration for continuous learning
      });

      // Load saved Q-table if exists
      await this.loadQTable();

      // Initialize instruction generator
      this.instructionGenerator = new InstructionGenerator();

      // Initialize path visualizer (advanced version)
      this.pathVisualizer = new PathVisualizer(this.floorPlanData);
      this.advancedVisualizer = new AdvancedPathVisualizer(this.floorPlanData, {
        enable3D: true,
        enableHeatMap: true,
        enableAR: false
      });
      
      // Initialize performance monitor
      this.performanceMonitor = getPerformanceMonitor();

      // Setup auto-save for Q-table
      this.setupAutoSave();

      this.isInitialized = true;
      console.log('✅ NavigationService initialized successfully');

      return true;
    } catch (error) {
      this.initializationError = error;
      console.error('❌ NavigationService initialization failed:', error.message);
      return false;
    }
  }

  /**
   * Load graph data from MongoDB (no file fallback)
   */
  async loadGraph() {
    const graphData = await getLocationGraphMongoOnly();
    return { nodes: graphData.nodes, edges: graphData.edges };
  }

  /**
   * Load floor plan data from MongoDB (no file fallback)
   */
  async loadFloorPlanData() {
    return await getFloorPlansMongoOnly();
  }

  /**
   * Load Q-table from MongoDB (no file fallback)
   */
  async loadQTable() {
    try {
      const policy = await getRLPolicyMongoOnly('navigation_qtable');
      const qTable = policy.qTable || policy;
      this.pathfindingEngine.importQTable(qTable);
      console.log(`   🧠 Loaded Q-table: ${Object.keys(qTable).length} entries`);
    } catch (error) {
      console.warn('⚠️ Could not load Q-table from MongoDB:', error.message);
    }
  }

  /**
   * Save Q-table to MongoDB (no file fallback)
   */
  saveQTable() {
    try {
      const data = this.pathfindingEngine.exportQTable();
      // Fire-and-forget: don't block navigation loop
      saveRLPolicyMongoOnly('navigation_qtable', { type: 'q_table', qTable: data })
        .catch(err => console.warn('⚠️ Could not save Q-table to MongoDB:', err.message));
      console.log(`💾 Saved Q-table: ${Object.keys(data).length} entries`);
    } catch (error) {
      console.warn('⚠️ Could not save Q-table:', error.message);
    }
  }

  /**
   * Setup auto-save for Q-table
   */
  setupAutoSave() {
    // Save Q-table every 5 minutes
    this.autoSaveInterval = setInterval(() => {
      this.saveQTable();
    }, 5 * 60 * 1000);
  }

  /**
   * Main navigation method - find path and generate complete response
   */
  async navigate(fromLocationId, toLocationId, options = {}) {
    if (!this.isInitialized) {
      throw new Error('NavigationService not initialized');
    }

    const opts = {
      language: 'en',
      accessibilityMode: false,
      includeVisualization: true,
      ...options
    };

    const pathfindingStartTime = Date.now();
    console.log(`\n🧭 Navigation request: ${fromLocationId} → ${toLocationId}`);
    console.log(`   Options: lang=${opts.language}, accessibility=${opts.accessibilityMode}`);

    // Find shortest path
    const cacheKey = `${fromLocationId}:${toLocationId}:${JSON.stringify(opts)}`;
    const wasCached = this.pathfindingEngine.pathCache.has(cacheKey);
    
    const pathResult = this.pathfindingEngine.findPath(fromLocationId, toLocationId, {
      accessibilityMode: opts.accessibilityMode
    });
    
    // Record performance metrics
    this.performanceMonitor.recordPathfinding(pathfindingStartTime, pathResult, wasCached);
    
    // Record RL stats
    const rlStats = this.pathfindingEngine.getRLStats();
    if (rlStats) {
      this.performanceMonitor.recordRLStats(rlStats);
    }

    if (!pathResult.success) {
      console.log(`   ❌ No path found: ${pathResult.error}`);
      return {
        success: false,
        error: pathResult.error,
        message: this.getNoPathMessage(fromLocationId, toLocationId, opts.language)
      };
    }

    console.log(`   ✅ Path found: ${pathResult.path.length} steps, ${pathResult.distance} distance`);
    console.log(`   📊 Nodes explored: ${pathResult.nodesExplored}`);

    // Get navigation context
    const context = this.pathfindingEngine.getNavigationContext(pathResult.path);

    // Generate instructions
    const instructionStartTime = Date.now();
    const instructions = await this.instructionGenerator.generateInstructions(
      pathResult.path,
      context,
      { language: opts.language, accessibilityMode: opts.accessibilityMode }
    );
    
    this.performanceMonitor.recordInstructionGeneration(
      instructionStartTime,
      instructions.type,
      !!instructions.instructions
    );

    // Build response
    const response = {
      success: true,
      path: pathResult.path,
      pathDetails: {
        totalDistance: context.totalDistance,
        estimatedTime: context.estimatedTime,
        floorChanges: context.floorChanges,
        turns: context.turns,
        landmarks: context.landmarks,
        nodesExplored: pathResult.nodesExplored,
        algorithm: pathResult.algorithm
      },
      instructions,
      message: instructions.instructions
    };

    // Generate visualization if requested
    if (opts.includeVisualization && this.floorPlanData) {
      const vizStartTime = Date.now();
      
      // Generate comprehensive visualization with advanced features
      response.visualization = this.advancedVisualizer.generateComprehensiveVisualization(
        pathResult.path,
        this.floorPlanData,
        { enable3D: true, enableHeatMap: true }
      );
      
      // Also include legacy format for compatibility
      response.visualization.legacy = this.generateMultiFloorVisualization(pathResult.path);
      
      this.performanceMonitor.recordVisualization(vizStartTime);
    }

    // Format for legacy compatibility
    response.pathData = this.formatLegacyPathData(pathResult.path, context, instructions);

    console.log(`   📝 Instructions generated (${instructions.type})`);
    console.log(`   ⏱️  Estimated time: ${Math.ceil(context.estimatedTime / 60)} minutes`);

    return response;
  }

  /**
   * Generate visualization for multi-floor paths
   */
  generateMultiFloorVisualization(path) {
    // Get unique floors in path
    const floors = [...new Set(path.map(node => node.floor))];
    
    const visualizations = {};
    floors.forEach(floor => {
      visualizations[floor] = this.pathVisualizer.generateVisualization(path, floor);
    });

    return {
      floors,
      byFloor: visualizations,
      animation: this.pathVisualizer.generateAnimationData(visualizations[floors[0]])
    };
  }

  /**
   * Format path data for legacy frontend compatibility
   */
  formatLegacyPathData(path, context, instructions) {
    return {
      path: path.map((node, idx) => ({
        ...node,
        id: node.id,
        name: this.formatNodeName(node.name),
        floor: node.floor,
        x: node.x,
        y: node.y,
        type: node.type,
        description: node.description,
        image: node.image,
        isFloorChange: node.floorChange || false,
        nextDirection: idx < path.length - 1 ? this.getDirection(node, path[idx + 1]) : null,
        nextNodeId: idx < path.length - 1 ? path[idx + 1].id : null,
        routeWaypoints: [] // Will be populated from floor plan data
      })),
      summary: instructions.summary,
      totalDistance: context.totalDistance,
      estimatedTime: context.estimatedTime,
      floorChanges: context.floorChanges
    };
  }

  /**
   * Format node name for display
   */
  formatNodeName(name) {
    if (!name) return '';
    return name
      .replace(/^hsitp_/i, '')
      .replace(/_/g, ' ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  /**
   * Get direction from one node to next
   */
  getDirection(from, to) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;

    if (Math.abs(dx) > Math.abs(dy)) {
      return dx > 0 ? 'right' : 'left';
    } else {
      return dy > 0 ? 'down' : 'up';
    }
  }

  /**
   * Get no path found message
   */
  getNoPathMessage(from, to, lang) {
    const fromName = this.formatNodeName(from);
    const toName = this.formatNodeName(to);
    
    switch (lang) {
      case 'zh-HK':
        return `抱歉，我找不到從 ${fromName} 到 ${toName} 的路徑。請確認位置名稱正確。`;
      case 'zh-CN':
        return `抱歉，我找不到从 ${fromName} 到 ${toName} 的路径。请确认位置名称正确。`;
      default:
        return `I apologize, but I couldn't find a path from ${fromName} to ${toName}. Please verify the location names are correct.`;
    }
  }

  /**
   * Find location by name or partial match with improved zone handling
   */
  findLocation(query) {
    if (!this.graph || !query) return null;

    const queryLower = query.toLowerCase().trim();
    const normalizedQuery = queryLower.replace(/[^a-z0-9]/g, '');
    
    // 1. Exact ID match
    let location = this.graph.nodes.find(n => 
      n.id.toLowerCase() === normalizedQuery ||
      n.id.toLowerCase() === `hsitp_${normalizedQuery}`
    );
    if (location) {
      console.log(`✅ Location match (exact ID): "${query}" → ${location.id}`);
      return location;
    }

    // 2. Zone number matching (e.g., "zone 5", "zone5", "zone 05" → zone_05)
    const zoneMatch = queryLower.match(/zone\s*0?([1-7])/i);
    if (zoneMatch) {
      const zoneNum = zoneMatch[1].padStart(2, '0'); // "5" → "05"
      const zonePatterns = [
        `hsitp_zone_${zoneNum}`,      // hsitp_zone_05
        `hsitp_zone_${zoneNum}_1`,    // hsitp_zone_05_1 (floor 1)
        `zone_${zoneNum}`,            // zone_05
        `zone_${zoneNum}_1`           // zone_05_1
      ];
      
      // Try to find zone on floor 1 first (most common)
    location = this.graph.nodes.find(n => 
        zonePatterns.some(pattern => n.id.toLowerCase() === pattern) && n.floor === 1
      );
      
      // If not found on floor 1, try any floor
      if (!location) {
        location = this.graph.nodes.find(n => 
          zonePatterns.some(pattern => n.id.toLowerCase().includes(pattern))
        );
      }
      
      if (location) {
        console.log(`✅ Location match (zone): "${query}" → ${location.id} (floor ${location.floor})`);
        return location;
      }
    }

    // 3. Name match (case-insensitive, partial)
    location = this.graph.nodes.find(n => {
      const nameLower = n.name.toLowerCase();
      return nameLower === queryLower || 
             nameLower.includes(queryLower) || 
             queryLower.includes(nameLower);
    });
    if (location) {
      console.log(`✅ Location match (name): "${query}" → ${location.id}`);
      return location;
    }

    // 4. Fuzzy match on ID (contains)
    location = this.graph.nodes.find(n => 
      n.id.toLowerCase().includes(normalizedQuery) ||
      normalizedQuery.includes(n.id.toLowerCase().replace('hsitp_', ''))
    );
    if (location) {
      console.log(`✅ Location match (fuzzy ID): "${query}" → ${location.id}`);
    return location;
    }

    // 5. Try matching with common location keywords
    const locationKeywords = {
      'reception': ['reception', 'reception desk', 'front desk'],
      'lobby': ['lobby', 'main lobby'],
      'lift': ['lift', 'elevator', 'lift lobby', 'elevator lobby'],
      'pantry': ['pantry', 'common pantry', 'kitchen'],
      'corridor': ['corridor', 'hallway', 'hall'],
    };

    for (const [key, keywords] of Object.entries(locationKeywords)) {
      if (keywords.some(kw => queryLower.includes(kw))) {
        location = this.graph.nodes.find(n => 
          n.id.toLowerCase().includes(key) && n.floor === 1
        );
        if (location) {
          console.log(`✅ Location match (keyword): "${query}" → ${location.id}`);
          return location;
        }
      }
    }

    console.warn(`⚠️ Location not found: "${query}"`);
    return null;
  }

  /**
   * Get all available locations
   */
  getAvailableLocations() {
    if (!this.graph) return [];
    
    return this.graph.nodes.map(node => ({
      id: node.id,
      name: this.formatNodeName(node.name),
      floor: node.floor,
      type: node.type,
      description: node.description
    }));
  }

  /**
   * Get locations grouped by floor
   */
  getLocationsByFloor() {
    const locations = this.getAvailableLocations();
    const byFloor = {};
    
    locations.forEach(loc => {
      const floor = loc.floor;
      if (!byFloor[floor]) {
        byFloor[floor] = [];
      }
      byFloor[floor].push(loc);
    });

    return byFloor;
  }

  /**
   * Get statistics
   */
  getStats() {
    if (!this.pathfindingEngine) return null;
    
    const engineStats = this.pathfindingEngine.getStats();
    const rlStats = this.pathfindingEngine.getRLStats();
    const perfSummary = this.performanceMonitor.getSummary();
    const health = this.performanceMonitor.getHealthStatus();
    
    return {
      engine: engineStats,
      rl: rlStats,
      performance: perfSummary,
      health,
      visualization: this.advancedVisualizer.getAnalytics()
    };
  }

  /**
   * Reload configuration
   */
  async reload() {
    console.log('🔄 Reloading NavigationService...');
    
    // Save Q-table before reload
    this.saveQTable();
    
    // Reinitialize
    return await this.initialize();
  }

  /**
   * Cleanup
   */
  shutdown() {
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
    }
    this.saveQTable();
    console.log('👋 NavigationService shutdown complete');
  }
}

// Singleton instance
let instance = null;

module.exports = {
  NavigationService,
  
  // Get singleton instance
  getInstance: async () => {
    if (!instance) {
      instance = new NavigationService();
      await instance.initialize();
    }
    return instance;
  },

  // Reset instance (for testing)
  resetInstance: () => {
    if (instance) {
      instance.shutdown();
      instance = null;
    }
  }
};

