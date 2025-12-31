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
const fs = require('fs');
const path = require('path');

class NavigationService {
  constructor(options = {}) {
    this.options = {
      graphPath: path.join(__dirname, '../data/hsitp_locationGraph.json'),
      floorPlanPath: path.join(__dirname, '../data/hsitp_floorPlans.json'),
      qTablePath: path.join(__dirname, '../data/navigation_qtable.json'),
      ...options
    };

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
      this.graph = this.loadGraph();
      console.log(`   📊 Loaded graph: ${this.graph.nodes.length} nodes, ${this.graph.edges.length} edges`);

      // Load floor plan data
      this.floorPlanData = this.loadFloorPlanData();
      console.log(`   🗺️  Loaded floor plans: ${this.floorPlanData?.floors?.length || 0} floors`);

      // Initialize pathfinding engine with RL-only pathfinding
      this.pathfindingEngine = new PathfindingEngine(this.graph, {
        useRLOptimization: true,
        useAdvancedRL: true, // Use AdvancedRLAgent for RL-only pathfinding
        learningRate: 0.1,
        discountFactor: 0.95,
        explorationRate: 0.1
      });

      // Load saved Q-table if exists
      this.loadQTable();

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
   * Load graph data from file
   */
  loadGraph() {
    const graphData = JSON.parse(fs.readFileSync(this.options.graphPath, 'utf8'));
    return {
      nodes: graphData.nodes,
      edges: graphData.edges
    };
  }

  /**
   * Load floor plan data from file
   */
  loadFloorPlanData() {
    try {
      return JSON.parse(fs.readFileSync(this.options.floorPlanPath, 'utf8'));
    } catch (error) {
      console.warn('⚠️ Could not load floor plan data:', error.message);
      return null;
    }
  }

  /**
   * Load Q-table from file
   */
  loadQTable() {
    try {
      if (fs.existsSync(this.options.qTablePath)) {
        const data = JSON.parse(fs.readFileSync(this.options.qTablePath, 'utf8'));
        this.pathfindingEngine.importQTable(data);
        console.log(`   🧠 Loaded Q-table: ${Object.keys(data).length} entries`);
      }
    } catch (error) {
      console.warn('⚠️ Could not load Q-table:', error.message);
    }
  }

  /**
   * Save Q-table to file
   */
  saveQTable() {
    try {
      const data = this.pathfindingEngine.exportQTable();
      fs.writeFileSync(this.options.qTablePath, JSON.stringify(data, null, 2));
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
   * Find location by name or partial match
   */
  findLocation(query) {
    if (!this.graph) return null;

    const normalizedQuery = query.toLowerCase().replace(/[^a-z0-9]/g, '');
    
    // Exact ID match
    let location = this.graph.nodes.find(n => 
      n.id.toLowerCase() === normalizedQuery ||
      n.id.toLowerCase() === `hsitp_${normalizedQuery}`
    );
    
    if (location) return location;

    // Name match
    location = this.graph.nodes.find(n => 
      n.name.toLowerCase().includes(normalizedQuery)
    );
    
    if (location) return location;

    // Fuzzy match on ID
    location = this.graph.nodes.find(n => 
      n.id.toLowerCase().includes(normalizedQuery)
    );

    return location;
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

