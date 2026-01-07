/**
 * RL-Only Pathfinding Engine
 * 
 * Uses pure reinforcement learning (Q-learning) to find optimal paths
 * between locations in the building.
 */

const AdvancedRLAgent = require('./AdvancedRLAgent');

class PathfindingEngine {
  constructor(graph, options = {}) {
    this.graph = graph;
    this.options = {
      accessibilityMode: false,
      useAdvancedRL: true,
      learningRate: 0.15,
      discountFactor: 0.95,
      explorationRate: 0.15,
      explorationDecay: 0.998,
      minExplorationRate: 0.05,
      ...options
    };

    // Build adjacency list for faster lookups
    this.adjacencyList = this.buildAdjacencyList();
    
    // Node lookup by ID
    this.nodeById = new Map();
    this.graph.nodes.forEach(node => this.nodeById.set(node.id, node));

    // Initialize Advanced RL Agent (required)
    if (!this.options.useAdvancedRL) {
      throw new Error('RL pathfinding requires useAdvancedRL to be true');
    }

    try {
      this.rlAgent = new AdvancedRLAgent({
        learningRate: this.options.learningRate,
        discountFactor: this.options.discountFactor,
        explorationRate: this.options.explorationRate,
        explorationDecay: this.options.explorationDecay,
        minExplorationRate: this.options.minExplorationRate
      });
      console.log('🧠 RL Agent initialized for pathfinding');
    } catch (error) {
      console.error('❌ Failed to initialize RL Agent:', error.message);
      throw error;
    }
    
    // Path cache for frequently requested routes
    this.pathCache = new Map();
    this.cacheMaxSize = 100;
    this.cacheHits = 0;
    this.cacheMisses = 0;

    // Statistics
    this.stats = {
      totalSearches: 0,
      avgNodesExplored: 0,
      avgPathLength: 0
    };

    console.log(`🧭 RL PathfindingEngine initialized: ${this.graph.nodes.length} nodes, ${this.graph.edges.length} edges`);
  }

  /**
   * Build adjacency list from edge list for O(1) neighbor lookup
   */
  buildAdjacencyList() {
    const adj = new Map();
    
    // Initialize all nodes
    this.graph.nodes.forEach(node => {
      adj.set(node.id, []);
    });

    // Add edges (bidirectional)
    this.graph.edges.forEach(edge => {
      const fromNeighbors = adj.get(edge.from) || [];
      const toNeighbors = adj.get(edge.to) || [];
      
      fromNeighbors.push({
        nodeId: edge.to,
        weight: edge.weight,
        floorChange: edge.floorChange || false,
        description: edge.description || ''
      });
      
      toNeighbors.push({
        nodeId: edge.from,
        weight: edge.weight,
        floorChange: edge.floorChange || false,
        description: edge.description || ''
      });
      
      adj.set(edge.from, fromNeighbors);
      adj.set(edge.to, toNeighbors);
    });

    return adj;
  }

  /**
   * Calculate Euclidean distance between two nodes (for reward calculation)
   */
  calculateDistance(nodeA, nodeB) {
      const dx = nodeA.x - nodeB.x;
      const dy = nodeA.y - nodeB.y;
      const floorPenalty = Math.abs(nodeA.floor - nodeB.floor) * 50;
      return Math.sqrt(dx * dx + dy * dy) + floorPenalty;
  }

  /**
   * Pure RL Pathfinding Algorithm
   * Uses reinforcement learning agent to find optimal paths
   */
  findPath(startId, goalId, options = {}) {
    const opts = { ...this.options, ...options };
    
    // Check cache first
    const cacheKey = `${startId}:${goalId}:${JSON.stringify(opts)}`;
    if (this.pathCache.has(cacheKey)) {
      this.cacheHits++;
      return this.pathCache.get(cacheKey);
    }
    this.cacheMisses++;

    const startNode = this.nodeById.get(startId);
    const goalNode = this.nodeById.get(goalId);

    if (!startNode || !goalNode) {
      return {
        success: false,
        error: `Node not found: ${!startNode ? startId : goalId}`,
        path: [],
        distance: Infinity,
        nodesExplored: 0,
        algorithm: 'RL (Reinforcement Learning)'
      };
    }

    if (!this.rlAgent) {
    return {
      success: false,
        error: 'RL agent not initialized',
      path: [],
      distance: Infinity,
        nodesExplored: 0,
        algorithm: 'RL (Reinforcement Learning)'
    };
  }

    console.log(`🧠 RL pathfinding: ${startId} → ${goalId}`);

    // Pure RL pathfinding - agent selects actions step by step
    const path = [];
    const visited = new Map(); // Track visit count
    let currentNodeId = startId;
    let totalDistance = 0;
    let nodesExplored = 0;
    const maxSteps = Math.min(this.graph.nodes.length * 10, 2000); // Generous limit for RL exploration
    const maxRevisits = 3; // Allow some revisiting for exploration

    // Add start node
    path.push({
      id: startNode.id,
      name: startNode.name,
      floor: startNode.floor,
      x: startNode.x,
      y: startNode.y,
      type: startNode.type,
      description: startNode.description,
      image: startNode.image,
      floorChange: false,
      edgeDescription: ''
    });

    visited.set(startId, 1);

    while (currentNodeId !== goalId && nodesExplored < maxSteps) {
      nodesExplored++;
      
      // Get available actions (neighbors)
      const neighbors = this.adjacencyList.get(currentNodeId) || [];
      
      if (neighbors.length === 0) {
        // Dead end - backtrack
        if (path.length > 1) {
          path.pop();
          currentNodeId = path[path.length - 1].id;
          const visitCount = visited.get(currentNodeId) || 0;
          visited.set(currentNodeId, Math.max(0, visitCount - 1));
          continue;
        } else {
          break; // No path found
        }
      }

      // Filter neighbors (prefer unvisited, but allow some revisiting)
      const unvisitedNeighbors = neighbors.filter(n => {
        const visitCount = visited.get(n.nodeId) || 0;
        return visitCount < maxRevisits;
      });
      
      let availableActions = unvisitedNeighbors.length > 0 
        ? unvisitedNeighbors.map(n => n.nodeId)
        : neighbors.map(n => n.nodeId);

      if (availableActions.length === 0) {
        // All neighbors visited too many times - backtrack
        if (path.length > 1) {
          path.pop();
          currentNodeId = path[path.length - 1].id;
          const visitCount = visited.get(currentNodeId) || 0;
          visited.set(currentNodeId, Math.max(0, visitCount - 1));
          continue;
        } else {
          break; // No path found
        }
      }

      // Use RL agent to select next action
      const currentNode = this.nodeById.get(currentNodeId);
      const distanceToGoal = this.calculateDistance(currentNode, goalNode);
      
      // Reduce exploration when close to goal
      const useExploration = distanceToGoal > 30 || Math.random() < 0.3;
      
      let nextNodeId;
      try {
        nextNodeId = this.rlAgent.selectAction(
          currentNodeId,
          availableActions,
          this.graph,
          useExploration
        );
      } catch (error) {
        console.warn(`⚠️ RL selectAction error: ${error.message}, using first available`);
        nextNodeId = availableActions[0];
      }

      // Validate and get edge
      const edge = neighbors.find(n => n.nodeId === nextNodeId);
      if (!edge) {
        // Invalid action, use first available
        nextNodeId = availableActions[0];
        const fallbackEdge = neighbors.find(n => n.nodeId === nextNodeId);
        if (!fallbackEdge) break;
      }

      const edgeUsed = edge || neighbors.find(n => n.nodeId === nextNodeId);
      const nextNode = this.nodeById.get(nextNodeId);

      // Calculate reward for this step
      const distanceToGoalAfter = this.calculateDistance(nextNode, goalNode);
      const distanceToGoalBefore = this.calculateDistance(currentNode, goalNode);
      
      // Reward structure
      let stepReward = 0;
      
      // Progress reward (getting closer to goal)
      const progress = distanceToGoalBefore - distanceToGoalAfter;
      stepReward += progress * 2; // Scale progress
      
      // Step penalty (encourage efficiency)
      stepReward -= 1;
      
      // Revisit penalty
      const revisitCount = visited.get(nextNodeId) || 0;
      if (revisitCount > 0) {
        stepReward -= 15 * revisitCount; // Heavy penalty for revisits
      }
      
      // Large reward for reaching goal
      if (nextNodeId === goalId) {
        stepReward += 2000;
      }
      
      // Penalty for moving away from goal
      if (distanceToGoalAfter > distanceToGoalBefore) {
        stepReward -= 30;
      } else {
        stepReward += 10; // Bonus for progress
      }
      
      // Penalty for floor changes if accessibility mode
      if (opts.accessibilityMode && edgeUsed.floorChange) {
        if (nextNode?.type === 'stairs') {
          stepReward -= 100;
  }
      }

      // Get next available actions for Q-learning update
      const nextNeighbors = this.adjacencyList.get(nextNodeId) || [];
      const nextActions = nextNeighbors.map(n => n.nodeId);

      // Update RL agent
      try {
        this.rlAgent.updateQValue(
          currentNodeId,
          nextNodeId,
          stepReward,
          nextNodeId,
          nextActions,
          this.graph,
          nextNodeId === goalId
        );
      } catch (error) {
        console.warn(`⚠️ RL updateQValue error: ${error.message}`);
      }

      // Move to next node
      totalDistance += edgeUsed.weight;
      currentNodeId = nextNodeId;
      const currentVisitCount = visited.get(nextNodeId) || 0;
      visited.set(nextNodeId, currentVisitCount + 1);

      path.push({
        id: nextNode.id,
        name: nextNode.name,
        floor: nextNode.floor,
        x: nextNode.x,
        y: nextNode.y,
        type: nextNode.type,
        description: nextNode.description,
        image: nextNode.image,
        floorChange: edgeUsed.floorChange || false,
        edgeDescription: edgeUsed.description || ''
      });

      // Check for loops (if stuck in small cycle)
      if (path.length > 20) {
        const recentNodes = path.slice(-15).map(p => p.id);
        const uniqueRecent = new Set(recentNodes);
        if (uniqueRecent.size < 5) {
          // Stuck in loop, backtrack more aggressively
          console.warn(`⚠️ Detected loop, backtracking...`);
          if (path.length > 5) {
            for (let i = 0; i < 3; i++) {
              if (path.length > 1) {
                const removed = path.pop();
                const visitCount = visited.get(removed.id) || 0;
                visited.set(removed.id, Math.max(0, visitCount - 1));
              }
            }
            if (path.length > 0) {
              currentNodeId = path[path.length - 1].id;
      }
    }
        }
      }
    }

    // Check if goal was reached
    const success = currentNodeId === goalId;
    
    if (success) {
      // Update RL agent with final path reward
      const context = this.getNavigationContext(path);
      const finalReward = this.rlAgent.calculateShapedReward(
        { distance: totalDistance },
        context,
        { accessibilityMode: opts.accessibilityMode }
      );
      
      // Update Q-values for entire path with final reward
      for (let i = 0; i < path.length - 1; i++) {
        const current = path[i];
        const next = path[i + 1];
        const neighbors = this.adjacencyList.get(current.id) || [];
        const nextActions = neighbors.map(n => n.nodeId);
        
        try {
          this.rlAgent.updateQValue(
            current.id,
            next.id,
            finalReward / path.length,
            next.id,
            nextActions,
            this.graph,
            i === path.length - 2
          );
        } catch (error) {
          console.warn(`⚠️ Error updating Q-value: ${error.message}`);
        }
      }
      
      this.rlAgent.updateStats(path.length);
      console.log(`✅ RL pathfinding succeeded: ${path.length} steps, ${totalDistance.toFixed(1)}m`);
    } else {
      console.warn(`❌ RL pathfinding failed: explored ${nodesExplored} nodes, max ${maxSteps}`);
    }

    const result = {
      success,
      path: success ? path : [],
      distance: success ? totalDistance : Infinity,
      nodesExplored,
      algorithm: 'RL (Reinforcement Learning)'
    };

    if (!success) {
      result.error = `No path found from ${startId} to ${goalId} (explored ${nodesExplored} nodes)`;
    }

    // Cache result only if successful
    if (success) {
      this.cacheResult(cacheKey, result);
    }
    
    // Update stats
    this.updateStats(nodesExplored, success ? path.length : 0);

    return result;
  }

  /**
   * Get navigation context for a path
   */
  getNavigationContext(path) {
    const context = {
      totalDistance: 0,
      floorChanges: [],
      landmarks: [],
      turns: 0,
      estimatedTime: 0
    };

    if (path.length < 2) return context;

    // Calculate total distance
    for (let i = 0; i < path.length - 1; i++) {
      const edge = this.getEdge(path[i].id, path[i + 1].id);
      if (edge) {
        context.totalDistance += edge.weight;
      }
      
      // Track floor changes
      if (path[i + 1].floorChange) {
        context.floorChanges.push({
          from: path[i].floor,
          to: path[i + 1].floor,
          method: path[i + 1].type === 'elevator' ? 'elevator' : 'stairs',
          atNode: path[i + 1].id
        });
      }
    }

    // Estimate walking time
    const walkingSpeed = 1.4; // m/s
    const floorChangeTime = 30; // seconds per floor change
    context.estimatedTime = Math.ceil(
      (context.totalDistance / walkingSpeed) + 
      (context.floorChanges.length * floorChangeTime)
    );

    return context;
  }

  /**
   * Get edge between two nodes
   */
  getEdge(fromId, toId) {
    return this.graph.edges.find(e => 
      (e.from === fromId && e.to === toId) || 
      (e.from === toId && e.to === fromId)
    );
  }

  /**
   * Cache management
   */
  cacheResult(key, result) {
    if (this.pathCache.size >= this.cacheMaxSize) {
      const firstKey = this.pathCache.keys().next().value;
      this.pathCache.delete(firstKey);
    }
    this.pathCache.set(key, result);
  }

  clearCache() {
    this.pathCache.clear();
    this.cacheHits = 0;
    this.cacheMisses = 0;
  }

  /**
   * Update statistics
   */
  updateStats(nodesExplored, pathLength) {
    this.stats.totalSearches++;
    this.stats.avgNodesExplored = (
      (this.stats.avgNodesExplored * (this.stats.totalSearches - 1) + nodesExplored) /
      this.stats.totalSearches
    );
    this.stats.avgPathLength = (
      (this.stats.avgPathLength * (this.stats.totalSearches - 1) + pathLength) /
      this.stats.totalSearches
    );
  }

  /**
   * Get engine statistics
   */
  getStats() {
    const baseStats = {
      ...this.stats,
      cacheHitRate: this.cacheHits / Math.max(1, this.cacheHits + this.cacheMisses)
    };
    
    if (this.rlAgent) {
      const rlStats = this.rlAgent.getStats();
      return {
        ...baseStats,
        qTableSize: rlStats.qTableSize || 0,
        rlStats: rlStats
      };
    }
    
    return baseStats;
  }

  /**
   * Update graph dynamically
   */
  updateGraph(newGraph) {
    this.graph = newGraph;
    this.adjacencyList = this.buildAdjacencyList();
    this.nodeById = new Map();
    this.graph.nodes.forEach(node => this.nodeById.set(node.id, node));
    this.clearCache();
    console.log('🔄 RL PathfindingEngine graph updated');
  }

  /**
   * Export RL model for persistence
   */
  exportQTable() {
    if (this.rlAgent) {
      return this.rlAgent.exportModel();
    }
    return {};
  }

  /**
   * Import RL model from stored data
   */
  importQTable(data) {
    if (this.rlAgent) {
      this.rlAgent.importModel(data);
    }
  }
  
  /**
   * Get RL agent statistics
   */
  getRLStats() {
    if (this.rlAgent) {
      return this.rlAgent.getStats();
    }
    return null;
  }
}

module.exports = PathfindingEngine;
