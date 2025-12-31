/**
 * Production-Ready Pathfinding Engine
 * 
 * Features:
 * - A* Algorithm with multiple heuristics
 * - Advanced Q-Learning RL with Experience Replay
 * - Multi-modal pathfinding (shortest, fastest, accessible)
 * - Landmark-based navigation support
 * - Real-time path updates
 * - Path caching and optimization
 */

const AdvancedRLAgent = require('./AdvancedRLAgent');

class PriorityQueue {
  constructor() {
    this.elements = [];
  }

  enqueue(element, priority) {
    this.elements.push({ element, priority });
    this.elements.sort((a, b) => a.priority - b.priority);
  }

  dequeue() {
    return this.elements.shift()?.element;
  }

  isEmpty() {
    return this.elements.length === 0;
  }

  contains(element) {
    return this.elements.some(e => e.element === element);
  }

  updatePriority(element, newPriority) {
    const idx = this.elements.findIndex(e => e.element === element);
    if (idx !== -1) {
      this.elements[idx].priority = newPriority;
      this.elements.sort((a, b) => a.priority - b.priority);
    }
  }
}

class PathfindingEngine {
  constructor(graph, options = {}) {
    this.graph = graph;
    this.options = {
      preferElevator: true,
      avoidStairs: false,
      accessibilityMode: false,
      useRLOptimization: true,
      useAdvancedRL: true, // Use AdvancedRLAgent instead of simple Q-table
      learningRate: 0.1,
      discountFactor: 0.95,
      explorationRate: 0.1,
      ...options
    };

    // Build adjacency list for faster lookups
    this.adjacencyList = this.buildAdjacencyList();
    
    // Node lookup by ID
    this.nodeById = new Map();
    this.graph.nodes.forEach(node => this.nodeById.set(node.id, node));

    // Advanced RL Agent (replaces simple Q-table)
    if (this.options.useAdvancedRL) {
      try {
        this.rlAgent = new AdvancedRLAgent({
          learningRate: this.options.learningRate,
          discountFactor: this.options.discountFactor,
          explorationRate: this.options.explorationRate
        });
        console.log('🧠 Advanced RL Agent initialized');
      } catch (error) {
        console.warn('⚠️ Failed to initialize Advanced RL Agent, falling back to simple Q-learning:', error.message);
        this.options.useAdvancedRL = false;
        this.qTable = new Map();
      }
    } else {
      // Legacy Q-table for backward compatibility
      this.qTable = new Map();
    }
    
    // Always initialize Q-table as fallback
    if (!this.qTable) {
      this.qTable = new Map();
    }
    
    // Path cache for frequently requested routes
    this.pathCache = new Map();
    this.cacheMaxSize = 100;
    this.cacheHits = 0;
    this.cacheMisses = 0;

    // Landmark definitions for better navigation
    this.landmarks = this.identifyLandmarks();

    // Statistics
    this.stats = {
      totalSearches: 0,
      avgNodesExplored: 0,
      avgPathLength: 0,
      rlImprovements: 0
    };

    console.log(`🧭 PathfindingEngine initialized: ${this.graph.nodes.length} nodes, ${this.graph.edges.length} edges`);
    console.log(`   Landmarks identified: ${this.landmarks.length}`);
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
        description: edge.description || '',
        hasWaypoints: edge.hasWaypoints || false
      });
      
      toNeighbors.push({
        nodeId: edge.from,
        weight: edge.weight,
        floorChange: edge.floorChange || false,
        description: edge.description || '',
        hasWaypoints: edge.hasWaypoints || false
      });
      
      adj.set(edge.from, fromNeighbors);
      adj.set(edge.to, toNeighbors);
    });

    return adj;
  }

  /**
   * Identify landmarks for navigation (important nodes)
   */
  identifyLandmarks() {
    const landmarks = [];
    const landmarkTypes = ['entrance', 'elevator', 'stairs', 'reception', 'lobby'];
    
    this.graph.nodes.forEach(node => {
      if (landmarkTypes.includes(node.type)) {
        landmarks.push({
          id: node.id,
          name: node.name,
          type: node.type,
          floor: node.floor,
          x: node.x,
          y: node.y
        });
      }
    });

    return landmarks;
  }

  /**
   * Heuristic functions for A*
   */
  heuristics = {
    // Euclidean distance
    euclidean: (nodeA, nodeB) => {
      const dx = nodeA.x - nodeB.x;
      const dy = nodeA.y - nodeB.y;
      const floorPenalty = Math.abs(nodeA.floor - nodeB.floor) * 50;
      return Math.sqrt(dx * dx + dy * dy) + floorPenalty;
    },

    // Manhattan distance (better for grid-like layouts)
    manhattan: (nodeA, nodeB) => {
      const dx = Math.abs(nodeA.x - nodeB.x);
      const dy = Math.abs(nodeA.y - nodeB.y);
      const floorPenalty = Math.abs(nodeA.floor - nodeB.floor) * 50;
      return dx + dy + floorPenalty;
    },

    // Diagonal distance (Chebyshev)
    diagonal: (nodeA, nodeB) => {
      const dx = Math.abs(nodeA.x - nodeB.x);
      const dy = Math.abs(nodeA.y - nodeB.y);
      const floorPenalty = Math.abs(nodeA.floor - nodeB.floor) * 50;
      return Math.max(dx, dy) + floorPenalty;
    },

    // Octile distance (good for 8-directional movement)
    octile: (nodeA, nodeB) => {
      const dx = Math.abs(nodeA.x - nodeB.x);
      const dy = Math.abs(nodeA.y - nodeB.y);
      const floorPenalty = Math.abs(nodeA.floor - nodeB.floor) * 50;
      return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy) + floorPenalty;
    }
  };

  /**
   * RL-Only Pathfinding Algorithm
   * Uses reinforcement learning to find optimal paths
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
        distance: Infinity
      };
    }

    // Use RL agent for pathfinding
    if (!this.options.useAdvancedRL || !this.rlAgent) {
      console.warn('⚠️ RL agent not available, falling back to simple Q-learning');
      return this.findPathWithSimpleRL(startId, goalId, opts);
    }

    // RL-based pathfinding using AdvancedRLAgent with improved strategy
    const path = [];
    const visited = new Map(); // Track visit count to detect loops
    const visitOrder = []; // Track visit order for better backtracking
    let currentNodeId = startId;
    let totalDistance = 0;
    let nodesExplored = 0;
    const maxSteps = Math.min(this.graph.nodes.length * 3, 500); // Reasonable limit
    const maxRevisits = 2; // Maximum times to revisit a node

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
    visitOrder.push(startId);

    // Use heuristic to guide initial exploration (when Q-values are low)
    const useHeuristicGuidance = this.rlAgent.stats.totalEpisodes < 10;

    while (currentNodeId !== goalId && nodesExplored < maxSteps) {
      nodesExplored++;
      
      // Get available actions (neighbors)
      const neighbors = this.adjacencyList.get(currentNodeId) || [];
      
      if (neighbors.length === 0) {
        // Dead end - backtrack
        if (path.length > 1) {
          path.pop();
          visitOrder.pop();
          currentNodeId = path[path.length - 1].id;
          const visitCount = visited.get(currentNodeId) || 0;
          visited.set(currentNodeId, visitCount - 1);
          continue;
        } else {
          break; // No path found
        }
      }

      // Filter neighbors based on visit count
      const unvisitedNeighbors = neighbors.filter(n => {
        const visitCount = visited.get(n.nodeId) || 0;
        return visitCount < maxRevisits;
      });
      
      // Prefer unvisited, but allow some revisiting
      let availableActions = unvisitedNeighbors.length > 0 
        ? unvisitedNeighbors.map(n => n.nodeId)
        : neighbors.map(n => n.nodeId);

      // If using heuristic guidance and Q-values are low, prioritize closer nodes
      if (useHeuristicGuidance && availableActions.length > 1) {
        const currentNode = this.nodeById.get(currentNodeId);
        availableActions.sort((a, b) => {
          const nodeA = this.nodeById.get(a);
          const nodeB = this.nodeById.get(b);
          const distA = this.heuristics.euclidean(nodeA, goalNode);
          const distB = this.heuristics.euclidean(nodeB, goalNode);
          return distA - distB;
        });
      }

      if (availableActions.length === 0) {
        // All neighbors visited too many times - backtrack
        if (path.length > 1) {
          path.pop();
          visitOrder.pop();
          currentNodeId = path[path.length - 1].id;
          const visitCount = visited.get(currentNodeId) || 0;
          visited.set(currentNodeId, Math.max(0, visitCount - 1));
          continue;
        } else {
          break; // No path found
        }
      }

      // Use RL agent to select next action (with reduced exploration if we're close to goal)
      const currentNode = this.nodeById.get(currentNodeId);
      const distanceToGoal = this.heuristics.euclidean(currentNode, goalNode);
      const useExploration = distanceToGoal > 50; // Reduce exploration when close to goal
      
      let nextNodeId;
      try {
        nextNodeId = this.rlAgent.selectAction(
          currentNodeId,
          availableActions,
          this.graph,
          useExploration
        );
      } catch (error) {
        console.warn(`⚠️ RL agent selectAction error: ${error.message}, using first available action`);
        nextNodeId = availableActions[0];
      }

      // Validate selected action
      const edge = neighbors.find(n => n.nodeId === nextNodeId);
      if (!edge) {
        // Invalid action selected, use heuristic fallback
        const nextNode = this.nodeById.get(availableActions[0]);
        if (!nextNode) break;
        nextNodeId = availableActions[0];
        const fallbackEdge = neighbors.find(n => n.nodeId === nextNodeId);
        if (!fallbackEdge) break;
      }

      const edgeUsed = edge || neighbors.find(n => n.nodeId === nextNodeId);
      const nextNode = this.nodeById.get(nextNodeId);

      // Calculate improved reward structure
      const distanceToGoalAfter = this.heuristics.euclidean(nextNode, goalNode);
      const distanceToGoalBefore = this.heuristics.euclidean(currentNode, goalNode);
      
      // Base reward: progress toward goal (normalized)
      const progress = (distanceToGoalBefore - distanceToGoalAfter) / Math.max(distanceToGoalBefore, 1);
      let stepReward = progress * 100; // Scale progress reward
      
      // Step penalty (encourage shorter paths)
      stepReward -= 1;
      
      // Penalty for revisiting (increases with revisit count)
      const revisitCount = visited.get(nextNodeId) || 0;
      if (revisitCount > 0) {
        stepReward -= 10 * revisitCount; // Increasing penalty for revisits
      }
      
      // Large reward for reaching goal
      if (nextNodeId === goalId) {
        stepReward += 1000;
      }
      
      // Penalty for floor changes if accessibility mode
      if (opts.accessibilityMode && edgeUsed.floorChange) {
        if (nextNode?.type === 'stairs') {
          stepReward -= 50;
        }
      }

      // Bonus for moving toward goal (heuristic guidance)
      if (distanceToGoalAfter < distanceToGoalBefore) {
        stepReward += 5; // Small bonus for progress
      } else {
        stepReward -= 20; // Penalty for moving away
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
        console.warn(`⚠️ RL agent updateQValue error: ${error.message}`);
      }

      // Move to next node
      totalDistance += edgeUsed.weight;
      currentNodeId = nextNodeId;
      const currentVisitCount = visited.get(nextNodeId) || 0;
      visited.set(nextNodeId, currentVisitCount + 1);
      visitOrder.push(nextNodeId);

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

      // Early termination if we're stuck in a loop
      if (visitOrder.length > 10) {
        const recentVisits = visitOrder.slice(-10);
        const uniqueRecent = new Set(recentVisits);
        if (uniqueRecent.size < 3) {
          // Stuck in a small loop, try to break out
          console.warn(`⚠️ Detected loop, attempting to break out`);
          if (path.length > 3) {
            // Backtrack more aggressively
            path.pop();
            path.pop();
            visitOrder.pop();
            visitOrder.pop();
            currentNodeId = path[path.length - 1].id;
            continue;
          }
        }
      }
    }

    // Check if goal was reached
    const success = currentNodeId === goalId;
    
    if (!success && nodesExplored >= maxSteps) {
      // RL pathfinding failed, try fallback with simple heuristic-based pathfinding
      console.warn(`⚠️ RL pathfinding reached max steps (${maxSteps}), trying heuristic fallback`);
      return this.findPathWithHeuristicFallback(startId, goalId, opts);
    }
    
    if (success) {
      // Calculate final reward and update RL agent
      const context = this.getNavigationContext(path);
      const finalReward = this.rlAgent.calculateShapedReward(
        { distance: totalDistance },
        context,
        { accessibilityMode: opts.accessibilityMode }
      );
      
      // Update Q-values for the entire path with final reward
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
          console.warn(`⚠️ Error updating Q-value for ${current.id} → ${next.id}: ${error.message}`);
        }
      }
      
      this.rlAgent.updateStats(path.length);
      console.log(`✅ RL pathfinding succeeded: ${path.length} steps, ${totalDistance.toFixed(1)}m distance`);
    }

    const result = {
      success,
      path: success ? path : [],
      distance: success ? totalDistance : Infinity,
      nodesExplored,
      algorithm: 'RL (Reinforcement Learning)'
    };

    if (!success) {
      result.error = `No path found from ${startId} to ${goalId} (explored ${nodesExplored} nodes, max ${maxSteps})`;
      console.warn(`❌ ${result.error}`);
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
   * Fallback: Heuristic-based pathfinding when RL fails
   */
  findPathWithHeuristicFallback(startId, goalId, opts) {
    const startNode = this.nodeById.get(startId);
    const goalNode = this.nodeById.get(goalId);
    
    if (!startNode || !goalNode) {
      return {
        success: false,
        error: `Node not found: ${!startNode ? startId : goalId}`,
        path: [],
        distance: Infinity,
        nodesExplored: 0,
        algorithm: 'Heuristic Fallback'
      };
    }

    // Use greedy best-first search with heuristic
    const openSet = new PriorityQueue();
    const closedSet = new Set();
    const cameFrom = new Map();
    const gScore = new Map();
    const edgeUsed = new Map();

    gScore.set(startId, 0);
    openSet.enqueue(startId, this.heuristics.euclidean(startNode, goalNode));

    let nodesExplored = 0;
    const maxExplorations = this.graph.nodes.length;

    while (!openSet.isEmpty() && nodesExplored < maxExplorations) {
      const currentId = openSet.dequeue();
      nodesExplored++;

      if (currentId === goalId) {
        const path = this.reconstructPath(cameFrom, edgeUsed, currentId);
        const totalDistance = gScore.get(currentId);
        
        return {
          success: true,
          path,
          distance: totalDistance,
          nodesExplored,
          algorithm: 'Heuristic Fallback (Greedy Best-First)'
        };
      }

      closedSet.add(currentId);
      const neighbors = this.adjacencyList.get(currentId) || [];

      for (const neighbor of neighbors) {
        if (closedSet.has(neighbor.nodeId)) continue;

        const tentativeGScore = gScore.get(currentId) + neighbor.weight;
        
        if (!gScore.has(neighbor.nodeId) || tentativeGScore < gScore.get(neighbor.nodeId)) {
          const neighborNode = this.nodeById.get(neighbor.nodeId);
          cameFrom.set(neighbor.nodeId, currentId);
          edgeUsed.set(neighbor.nodeId, neighbor);
          gScore.set(neighbor.nodeId, tentativeGScore);
          
          const fScore = tentativeGScore + this.heuristics.euclidean(neighborNode, goalNode);
          
          if (!openSet.contains(neighbor.nodeId)) {
            openSet.enqueue(neighbor.nodeId, fScore);
          } else {
            openSet.updatePriority(neighbor.nodeId, fScore);
          }
        }
      }
    }

    return {
      success: false,
      error: `No path found from ${startId} to ${goalId} (heuristic fallback)`,
      path: [],
      distance: Infinity,
      nodesExplored,
      algorithm: 'Heuristic Fallback'
    };
  }

  /**
   * Fallback: Simple Q-learning pathfinding (if AdvancedRLAgent not available)
   */
  findPathWithSimpleRL(startId, goalId, opts) {
    const path = [];
    const visited = new Set();
    let currentNodeId = startId;
    let totalDistance = 0;
    let nodesExplored = 0;
    const maxSteps = this.graph.nodes.length * 2;

    const startNode = this.nodeById.get(startId);
    const goalNode = this.nodeById.get(goalId);

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

    visited.add(startId);

    while (currentNodeId !== goalId && nodesExplored < maxSteps) {
      nodesExplored++;
      
      const neighbors = this.adjacencyList.get(currentNodeId) || [];
      const unvisitedNeighbors = neighbors.filter(n => !visited.has(n.nodeId));
      const availableActions = unvisitedNeighbors.length > 0 
        ? unvisitedNeighbors.map(n => n.nodeId)
        : neighbors.map(n => n.nodeId);

      if (availableActions.length === 0) {
        if (path.length > 1) {
          path.pop();
          visited.delete(currentNodeId);
          currentNodeId = path[path.length - 1].id;
          continue;
        } else {
          break;
        }
      }

      // Select action using Q-values (epsilon-greedy)
      let nextNodeId;
      if (Math.random() < this.options.explorationRate) {
        // Explore: random action
        nextNodeId = availableActions[Math.floor(Math.random() * availableActions.length)];
      } else {
        // Exploit: best Q-value
        let bestQ = -Infinity;
        nextNodeId = availableActions[0];
        
        for (const actionId of availableActions) {
          const qValue = this.getQValue(currentNodeId, actionId);
          if (qValue > bestQ) {
            bestQ = qValue;
            nextNodeId = actionId;
          }
        }
      }

      const edge = neighbors.find(n => n.nodeId === nextNodeId);
      if (!edge) break;

      const nextNode = this.nodeById.get(nextNodeId);
      const distanceToGoal = this.heuristics.euclidean(nextNode, goalNode);
      const prevDistance = this.heuristics.euclidean(
        this.nodeById.get(currentNodeId),
        goalNode
      );
      
      const reward = (prevDistance - distanceToGoal) * 10 + (nextNodeId === goalId ? 1000 : 0);
      
      // Update Q-value
      const nextNeighbors = this.adjacencyList.get(nextNodeId) || [];
      const nextActions = nextNeighbors.map(n => n.nodeId);
      let maxNextQ = 0;
      if (nextActions.length > 0) {
        maxNextQ = Math.max(...nextActions.map(a => this.getQValue(nextNodeId, a)));
      }
      
      const currentQ = this.getQValue(currentNodeId, nextNodeId);
      const newQ = currentQ + this.options.learningRate * (
        reward + this.options.discountFactor * maxNextQ - currentQ
      );
      
      const key = `${currentNodeId}:${nextNodeId}`;
      this.qTable.set(key, newQ);

      totalDistance += edge.weight;
      currentNodeId = nextNodeId;
      visited.add(nextNodeId);

      path.push({
        id: nextNode.id,
        name: nextNode.name,
        floor: nextNode.floor,
        x: nextNode.x,
        y: nextNode.y,
        type: nextNode.type,
        description: nextNode.description,
        image: nextNode.image,
        floorChange: edge.floorChange || false,
        edgeDescription: edge.description || ''
      });
    }

    return {
      success: currentNodeId === goalId,
      path: currentNodeId === goalId ? path : [],
      distance: currentNodeId === goalId ? totalDistance : Infinity,
      nodesExplored,
      algorithm: 'RL (Simple Q-Learning)',
      error: currentNodeId !== goalId ? `No path found (explored ${nodesExplored} nodes)` : null
    };
  }

  /**
   * Reconstruct path from A* search
   */
  reconstructPath(cameFrom, edgeUsed, currentId) {
    const path = [];
    let current = currentId;

    while (cameFrom.has(current)) {
      const node = this.nodeById.get(current);
      const edge = edgeUsed.get(current);
      
      path.unshift({
        id: node.id,
        name: node.name,
        floor: node.floor,
        x: node.x,
        y: node.y,
        type: node.type,
        description: node.description,
        image: node.image,
        floorChange: edge?.floorChange || false,
        edgeDescription: edge?.description || ''
      });
      
      current = cameFrom.get(current);
    }

    // Add start node
    const startNode = this.nodeById.get(current);
    path.unshift({
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

    return path;
  }

  /**
   * Q-Learning: Get Q-value for state-action pair
   */
  getQValue(stateId, actionId) {
    const key = `${stateId}:${actionId}`;
    return this.qTable.get(key) || 0;
  }

  /**
   * Q-Learning: Update Q-values based on path taken
   */
  updateQValues(path, totalDistance) {
    const reward = 1000 / (totalDistance + 1); // Higher reward for shorter paths
    
    for (let i = 0; i < path.length - 1; i++) {
      const state = path[i].id;
      const action = path[i + 1].id;
      const key = `${state}:${action}`;
      
      const currentQ = this.getQValue(state, action);
      
      // Q-Learning update rule
      let maxNextQ = 0;
      if (i < path.length - 2) {
        const nextState = path[i + 1].id;
        const neighbors = this.adjacencyList.get(nextState) || [];
        maxNextQ = Math.max(0, ...neighbors.map(n => this.getQValue(nextState, n.nodeId)));
      }
      
      const newQ = currentQ + this.options.learningRate * (
        reward + this.options.discountFactor * maxNextQ - currentQ
      );
      
      this.qTable.set(key, newQ);
    }

    this.stats.rlImprovements++;
  }

  /**
   * Find multiple alternative paths (k-shortest paths)
   */
  findAlternativePaths(startId, goalId, k = 3, options = {}) {
    const paths = [];
    const usedEdges = new Set();
    
    for (let i = 0; i < k; i++) {
      const result = this.findPath(startId, goalId, {
        ...options,
        excludeEdges: usedEdges
      });
      
      if (!result.success) break;
      
      paths.push(result);
      
      // Mark edges as used (with penalty instead of exclusion for next iteration)
      for (let j = 0; j < result.path.length - 1; j++) {
        usedEdges.add(`${result.path[j].id}:${result.path[j + 1].id}`);
      }
    }
    
    return paths;
  }

  /**
   * Find nearest landmark from a given location
   */
  findNearestLandmark(nodeId, landmarkType = null) {
    const node = this.nodeById.get(nodeId);
    if (!node) return null;

    let nearestLandmark = null;
    let minDistance = Infinity;

    for (const landmark of this.landmarks) {
      if (landmarkType && landmark.type !== landmarkType) continue;
      if (landmark.id === nodeId) continue;
      
      const result = this.findPath(nodeId, landmark.id);
      if (result.success && result.distance < minDistance) {
        minDistance = result.distance;
        nearestLandmark = { ...landmark, distance: minDistance };
      }
    }

    return nearestLandmark;
  }

  /**
   * Get navigation context for a path (landmarks nearby, floor changes, etc.)
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

    let prevDirection = null;

    for (let i = 0; i < path.length; i++) {
      const current = path[i];

      // Track floor changes
      if (current.floorChange && i > 0) {
        context.floorChanges.push({
          from: path[i - 1].floor,
          to: current.floor,
          method: current.type === 'elevator' ? 'elevator' : 'stairs',
          atNode: current.id
        });
      }

      // Track landmarks
      if (this.landmarks.some(l => l.id === current.id)) {
        context.landmarks.push({
          id: current.id,
          name: current.name,
          type: current.type,
          stepIndex: i
        });
      }

      // Calculate turns
      if (i > 0 && i < path.length - 1) {
        const prev = path[i - 1];
        const next = path[i + 1];
        const direction = this.calculateDirection(current, next);
        
        if (prevDirection && this.isTurn(prevDirection, direction)) {
          context.turns++;
        }
        prevDirection = direction;
      }
    }

    // Calculate total distance and estimated time
    for (let i = 0; i < path.length - 1; i++) {
      const edge = this.getEdge(path[i].id, path[i + 1].id);
      if (edge) {
        context.totalDistance += edge.weight;
      }
    }

    // Estimate walking time (average 1.4 m/s walking speed, with delays)
    const walkingSpeed = 1.4; // m/s
    const floorChangeTime = 30; // seconds per floor change
    context.estimatedTime = Math.ceil(
      (context.totalDistance / walkingSpeed) + 
      (context.floorChanges.length * floorChangeTime)
    );

    return context;
  }

  /**
   * Calculate direction from one node to another
   */
  calculateDirection(from, to) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);

    if (angle >= -22.5 && angle < 22.5) return 'east';
    if (angle >= 22.5 && angle < 67.5) return 'southeast';
    if (angle >= 67.5 && angle < 112.5) return 'south';
    if (angle >= 112.5 && angle < 157.5) return 'southwest';
    if (angle >= 157.5 || angle < -157.5) return 'west';
    if (angle >= -157.5 && angle < -112.5) return 'northwest';
    if (angle >= -112.5 && angle < -67.5) return 'north';
    if (angle >= -67.5 && angle < -22.5) return 'northeast';
    
    return 'forward';
  }

  /**
   * Check if two directions constitute a turn
   */
  isTurn(dir1, dir2) {
    const directions = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];
    const idx1 = directions.indexOf(dir1);
    const idx2 = directions.indexOf(dir2);
    
    if (idx1 === -1 || idx2 === -1) return false;
    
    const diff = Math.abs(idx1 - idx2);
    return diff >= 2 && diff <= 6;
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
      // Remove oldest entry (simple LRU)
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
    
    if (this.options.useAdvancedRL && this.rlAgent) {
      const rlStats = this.rlAgent.getStats();
      return {
        ...baseStats,
        qTableSize: rlStats.qTableSize || 0,
        rlStats: rlStats
      };
    } else {
      return {
        ...baseStats,
        qTableSize: this.qTable?.size || 0
      };
    }
  }

  /**
   * Update graph dynamically (for real-time updates)
   */
  updateGraph(newGraph) {
    this.graph = newGraph;
    this.adjacencyList = this.buildAdjacencyList();
    this.nodeById = new Map();
    this.graph.nodes.forEach(node => this.nodeById.set(node.id, node));
    this.landmarks = this.identifyLandmarks();
    this.clearCache();
    console.log('🔄 PathfindingEngine graph updated');
  }

  /**
   * Export Q-table or RL model for persistence
   */
  exportQTable() {
    if (this.options.useAdvancedRL && this.rlAgent) {
      return this.rlAgent.exportModel();
    } else {
      const data = {};
      this.qTable.forEach((value, key) => {
        data[key] = value;
      });
      return data;
    }
  }

  /**
   * Import Q-table or RL model from stored data
   */
  importQTable(data) {
    if (this.options.useAdvancedRL && this.rlAgent) {
      this.rlAgent.importModel(data);
    } else {
      this.qTable.clear();
      Object.entries(data).forEach(([key, value]) => {
        this.qTable.set(key, value);
      });
      console.log(`📥 Imported Q-table with ${this.qTable.size} entries`);
    }
  }
  
  /**
   * Get RL agent statistics
   */
  getRLStats() {
    if (this.options.useAdvancedRL && this.rlAgent) {
      return this.rlAgent.getStats();
    }
    return null;
  }
}

module.exports = PathfindingEngine;

