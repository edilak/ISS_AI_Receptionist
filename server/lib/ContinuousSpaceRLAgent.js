/**
 * Continuous Space Reinforcement Learning Agent
 * 
 * Game-changing approach: RL agent navigates in 2D continuous space
 * within polygon-defined corridors to reach exit points.
 * 
 * Key Features:
 * - Continuous state space (x, y coordinates)
 * - Discretized action space (8 directions + variable step sizes)
 * - Polygon collision detection
 * - Multiple exit support (finds closest)
 * - Q-learning with function approximation
 * - Experience replay for stable learning
 */

class ContinuousSpaceRLAgent {
  constructor(options = {}) {
    this.options = {
      // Learning parameters - OPTIMIZED for simple single-corridor setup
      learningRate: 0.25,              // Faster learning for simple environment
      discountFactor: 0.95,
      explorationRate: 0.4,            // More exploration initially
      explorationDecay: 0.997,         // Slower decay to maintain exploration
      minExplorationRate: 0.1,         // Keep some exploration even after training
      
      // Movement parameters - MATCH GRID SIZE
      stepSize: 25,                    // Match gridSize: 25 from JSON
      minStepSize: 10,
      maxStepSize: 40,
      
      // Grid discretization - MATCH JSON
      gridResolution: 25,             // MUST match gridSize in space_definitions.json
      
      // Training parameters - OPTIMIZED for small environment
      batchSize: 32,                   // Smaller batches for faster updates
      replayBufferSize: 2000,          // Smaller buffer for simple environment
      
      // Reward parameters - BALANCED for single corridor
      goalReward: 1000,
      stepPenalty: -0.5,               // Less penalty (simple corridor, fewer steps needed)
      collisionPenalty: -50,
      progressReward: 20,              // Increased but not too high (simple paths)
      
      ...options
    };

    // 8 directional actions: N, NE, E, SE, S, SW, W, NW
    this.actions = [
      { dx: 0, dy: -1, name: 'N' },
      { dx: 1, dy: -1, name: 'NE' },
      { dx: 1, dy: 0, name: 'E' },
      { dx: 1, dy: 1, name: 'SE' },
      { dx: 0, dy: 1, name: 'S' },
      { dx: -1, dy: 1, name: 'SW' },
      { dx: -1, dy: 0, name: 'W' },
      { dx: -1, dy: -1, name: 'NW' }
    ];

    // Q-table: Map of "gridX:gridY:goalId" -> action Q-values
    this.qTable = new Map();
    
    // Experience replay buffer
    this.replayBuffer = [];
    
    // Statistics
    this.stats = {
      totalEpisodes: 0,
      totalSteps: 0,
      successfulPaths: 0,
      avgPathLength: 0,
      avgReward: 0
    };

    // Corridor polygons (navigable space)
    this.corridors = [];
    
    // Destination exits
    this.destinations = [];
    
    // Pre-computed navigable grid (for fast collision checking)
    this.navigableGrid = null;
    this.gridWidth = 0;
    this.gridHeight = 0;
  }

  /**
   * Initialize environment with corridors and destinations
   */
  setEnvironment(corridors, destinations, imageDimensions) {
    this.corridors = corridors;
    this.destinations = destinations;
    this.imageDimensions = imageDimensions;
    
    // Pre-compute navigable grid for fast collision detection
    this.precomputeNavigableGrid();
    
    console.log(`🗺️ Space RL Environment initialized:`);
    console.log(`   Corridors: ${corridors.length}`);
    console.log(`   Destinations: ${destinations.length}`);
    console.log(`   Grid size: ${this.gridWidth}x${this.gridHeight}`);
  }

  /**
   * Pre-compute which grid cells are navigable (inside corridors)
   */
  precomputeNavigableGrid() {
    if (!this.imageDimensions) return;

    const { width, height } = this.imageDimensions;
    const resolution = this.options.gridResolution;
    
    this.gridWidth = Math.ceil(width / resolution);
    this.gridHeight = Math.ceil(height / resolution);
    
    // Create grid: true = navigable, false = blocked
    this.navigableGrid = new Array(this.gridWidth);
    
    for (let gx = 0; gx < this.gridWidth; gx++) {
      this.navigableGrid[gx] = new Array(this.gridHeight);
      for (let gy = 0; gy < this.gridHeight; gy++) {
        // Check center of grid cell
        const px = (gx + 0.5) * resolution;
        const py = (gy + 0.5) * resolution;
        this.navigableGrid[gx][gy] = this.isPointInAnyCorridorRaw(px, py);
      }
    }

    // Count navigable cells
    let navigableCount = 0;
    for (let gx = 0; gx < this.gridWidth; gx++) {
      for (let gy = 0; gy < this.gridHeight; gy++) {
        if (this.navigableGrid[gx][gy]) navigableCount++;
      }
    }
    console.log(`   Navigable cells: ${navigableCount}/${this.gridWidth * this.gridHeight}`);
  }

  /**
   * Check if a point is inside any corridor polygon (raw computation)
   */
  isPointInAnyCorridorRaw(x, y) {
    for (const corridor of this.corridors) {
      if (this.isPointInPolygon(x, y, corridor.polygon)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Fast check using pre-computed grid
   */
  isPointNavigable(x, y) {
    if (!this.navigableGrid) {
      return this.isPointInAnyCorridorRaw(x, y);
    }

    const gx = Math.floor(x / this.options.gridResolution);
    const gy = Math.floor(y / this.options.gridResolution);
    
    if (gx < 0 || gx >= this.gridWidth || gy < 0 || gy >= this.gridHeight) {
      return false;
    }
    
    return this.navigableGrid[gx][gy];
  }

  /**
   * Ray casting algorithm for point-in-polygon test
   */
  isPointInPolygon(x, y, polygon) {
    if (!polygon || polygon.length < 3) return false;
    
    let inside = false;
    const n = polygon.length;
    
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = polygon[i][0], yi = polygon[i][1];
      const xj = polygon[j][0], yj = polygon[j][1];
      
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
        inside = !inside;
      }
    }
    
    return inside;
  }

  /**
   * Check if a line segment intersects with corridor boundaries
   */
  isPathClear(x1, y1, x2, y2) {
    // Sample points along the path
    const distance = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
    const samples = Math.max(2, Math.ceil(distance / 5)); // Check every 5 pixels
    
    for (let i = 0; i <= samples; i++) {
      const t = i / samples;
      const x = x1 + t * (x2 - x1);
      const y = y1 + t * (y2 - y1);
      
      if (!this.isPointNavigable(x, y)) {
        return false;
      }
    }
    
    return true;
  }

  /**
   * Discretize continuous position to grid state
   */
  positionToState(x, y, goalId) {
    const gx = Math.floor(x / this.options.gridResolution);
    const gy = Math.floor(y / this.options.gridResolution);
    return `${gx}:${gy}:${goalId}`;
  }

  /**
   * Get Q-values for a state with better initialization
   */
  getQValues(state) {
    if (!this.qTable.has(state)) {
      // Initialize with optimistic values (encourages exploration)
      // Small positive values instead of near-zero
      this.qTable.set(state, this.actions.map(() => 1.0 + Math.random() * 0.5));
    }
    return this.qTable.get(state);
  }

  /**
   * Select action using improved epsilon-greedy with A* hybrid
   */
  selectAction(x, y, goalX, goalY, goalId) {
    const validActions = this.getValidActions(x, y);
    if (validActions.length === 0) return null;
    
    const state = this.positionToState(x, y, goalId);
    const qValues = this.getQValues(state);
    const currentDist = this.heuristic(x, y, goalX, goalY);
    
    // Adaptive exploration: less exploration when close to goal
    const adaptiveExplorationRate = this.options.explorationRate * Math.min(currentDist / 300, 1.0);
    
    // Exploration
    if (Math.random() < adaptiveExplorationRate) {
      // Biased exploration: prefer actions toward goal
      if (Math.random() < 0.7) { // 70% goal-directed, 30% random
        return this.getGoalDirectedAction(x, y, goalX, goalY, validActions);
      }
      return validActions[Math.floor(Math.random() * validActions.length)];
    }
    
    // Exploitation: use hybrid RL + heuristic
    return this.selectBestAction(x, y, goalX, goalY, goalId, validActions);
  }

  /**
   * Get valid actions (those that don't cause collision)
   */
  getValidActions(x, y) {
    const valid = [];
    const stepSize = this.options.stepSize;
    
    for (let i = 0; i < this.actions.length; i++) {
      const action = this.actions[i];
      const newX = x + action.dx * stepSize;
      const newY = y + action.dy * stepSize;
      
      if (this.isPointNavigable(newX, newY)) {
        valid.push(i);
      }
    }
    
    return valid;
  }

  /**
   * Get action that moves toward goal
   */
  getGoalDirectedAction(x, y, goalX, goalY, validActions) {
    const dx = goalX - x;
    const dy = goalY - y;
    
    // Find action most aligned with goal direction
    let bestAction = validActions[0];
    let bestDot = -Infinity;
    
    for (const actionIdx of validActions) {
      const action = this.actions[actionIdx];
      // Dot product with goal direction
      const dot = action.dx * dx + action.dy * dy;
      if (dot > bestDot) {
        bestDot = dot;
        bestAction = actionIdx;
      }
    }
    
    return bestAction;
  }

  /**
   * Execute action and get new position
   */
  executeAction(x, y, actionIdx) {
    if (actionIdx === null) return { x, y, collision: true };
    
    const action = this.actions[actionIdx];
    const stepSize = this.options.stepSize;
    
    const newX = x + action.dx * stepSize;
    const newY = y + action.dy * stepSize;
    
    // Check collision
    if (!this.isPointNavigable(newX, newY)) {
      return { x, y, collision: true };
    }
    
    return { x: newX, y: newY, collision: false };
  }

  /**
   * Calculate reward with improved shaping
   */
  calculateReward(x, y, newX, newY, goalX, goalY, collision, reachedGoal) {
    if (reachedGoal) {
      return this.options.goalReward;
    }
    
    if (collision) {
      return this.options.collisionPenalty;
    }
    
    // Progress reward: positive if got closer to goal
    const prevDist = Math.sqrt((goalX - x) ** 2 + (goalY - y) ** 2);
    const newDist = Math.sqrt((goalX - newX) ** 2 + (goalY - newY) ** 2);
    const progress = prevDist - newDist;
    
    let reward = this.options.stepPenalty;
    
    if (progress > 0) {
      // Stronger reward for making progress
      const progressRatio = progress / this.options.stepSize;
      reward += this.options.progressReward * progressRatio;
      
      // Bonus for getting close to goal (shaped reward)
      if (newDist < 100) {
        reward += 5; // Close to goal bonus
      }
      if (newDist < 50) {
        reward += 10; // Very close bonus
      }
    } else {
      // Penalty for moving away (scaled by distance moved)
      reward += progress * 1.0; // Stronger penalty for moving away
    }
    
    return reward;
  }

  /**
   * Update Q-values using Q-learning with improved learning
   */
  updateQValue(state, actionIdx, reward, nextState) {
    const qValues = this.getQValues(state);
    
    // Handle terminal state (goal reached)
    let maxNextQ = 0;
    if (nextState.startsWith('TERMINAL:')) {
      // Terminal state: no future reward
      maxNextQ = 0;
    } else {
      const nextQValues = this.getQValues(nextState);
      maxNextQ = Math.max(...nextQValues);
    }
    
    const currentQ = qValues[actionIdx];
    
    // Q-learning update: Q(s,a) ← Q(s,a) + α[r + γ·max(Q(s',a')) - Q(s,a)]
    const targetQ = reward + this.options.discountFactor * maxNextQ;
    const error = targetQ - currentQ;
    const newQ = currentQ + this.options.learningRate * error;
    
    qValues[actionIdx] = newQ;
    
    // Add to replay buffer for experience replay
    this.replayBuffer.push({ state, actionIdx, reward, nextState });
    if (this.replayBuffer.length > this.options.replayBufferSize) {
      this.replayBuffer.shift();
    }
    
    // Debug: log significant updates
    if (Math.abs(error) > 10) {
      console.log(`📊 Large Q-update: state=${state}, action=${actionIdx}, error=${error.toFixed(1)}, newQ=${newQ.toFixed(1)}`);
    }
  }

  /**
   * Train from replay buffer with improved learning
   */
  trainFromReplay() {
    if (this.replayBuffer.length < this.options.batchSize) return;
    
    // Sample random batch (without replacement for better diversity)
    const batch = [];
    const usedIndices = new Set();
    while (batch.length < this.options.batchSize && batch.length < this.replayBuffer.length) {
      const idx = Math.floor(Math.random() * this.replayBuffer.length);
      if (!usedIndices.has(idx)) {
        usedIndices.add(idx);
        batch.push(this.replayBuffer[idx]);
      }
    }
    
    // Update Q-values from replay
    for (const exp of batch) {
      const qValues = this.getQValues(exp.state);
      
      // Handle terminal states
      let maxNextQ = 0;
      if (exp.nextState && !exp.nextState.startsWith('TERMINAL:')) {
        const nextQValues = this.getQValues(exp.nextState);
        maxNextQ = Math.max(...nextQValues);
      }
      
      const currentQ = qValues[exp.actionIdx];
      const targetQ = exp.reward + this.options.discountFactor * maxNextQ;
      const error = targetQ - currentQ;
      
      // Use smaller learning rate for replay (0.5x) to stabilize learning
      qValues[exp.actionIdx] += this.options.learningRate * 0.3 * error;
    }
  }

  /**
   * Find closest exit for a zone
   */
  findClosestExit(x, y, zoneId, floor) {
    const zoneExits = this.destinations.filter(d => 
      d.zone === zoneId && d.floor === floor
    );
    
    if (zoneExits.length === 0) {
      // Try finding by name match
      const nameMatch = this.destinations.filter(d =>
        d.floor === floor && 
        (d.name.toLowerCase().includes(zoneId.toLowerCase()) ||
         d.zone?.toLowerCase().includes(zoneId.toLowerCase()))
      );
      if (nameMatch.length > 0) {
        return this.findClosestFromList(x, y, nameMatch);
      }
      return null;
    }
    
    return this.findClosestFromList(x, y, zoneExits);
  }

  /**
   * Find closest destination from a list
   */
  findClosestFromList(x, y, exits) {
    let closest = null;
    let minDist = Infinity;
    
    for (const exit of exits) {
      const dist = Math.sqrt((exit.x - x) ** 2 + (exit.y - y) ** 2);
      if (dist < minDist) {
        minDist = dist;
        closest = exit;
      }
    }
    
    return closest;
  }

  /**
   * Calculate heuristic distance (A* style) for better pathfinding
   */
  heuristic(x, y, goalX, goalY) {
    return Math.sqrt((goalX - x) ** 2 + (goalY - y) ** 2);
  }

  /**
   * Select best action using RL + A* heuristic hybrid
   */
  selectBestAction(x, y, goalX, goalY, goalId, validActions) {
    if (validActions.length === 0) return null;
    
    const state = this.positionToState(x, y, goalId);
    const qValues = this.getQValues(state);
    const currentDist = this.heuristic(x, y, goalX, goalY);
    
    // Calculate combined score: Q-value + heuristic guidance
    const scores = validActions.map(actionIdx => {
      const action = this.actions[actionIdx];
      const nextX = x + action.dx * this.options.stepSize;
      const nextY = y + action.dy * this.options.stepSize;
      const nextDist = this.heuristic(nextX, nextY, goalX, goalY);
      
      // Q-value (learned knowledge)
      const qValue = qValues[actionIdx] || 0;
      
      // Heuristic: prefer actions that get closer to goal
      const progress = currentDist - nextDist;
      const heuristicBonus = progress * 0.1; // Scale heuristic influence
      
      // Distance-based exploration: if far from goal, use more heuristic
      const distFactor = Math.min(currentDist / 500, 1.0); // More heuristic when far
      const combinedScore = qValue * (1 - distFactor * 0.3) + heuristicBonus * distFactor;
      
      return { actionIdx, score: combinedScore, progress };
    });
    
    // Sort by combined score
    scores.sort((a, b) => b.score - a.score);
    
    // If best action makes progress, use it
    if (scores[0].progress > 0) {
      return scores[0].actionIdx;
    }
    
    // Otherwise, use top scoring action
    return scores[0].actionIdx;
  }

  /**
   * Multi-step lookahead: evaluate action by looking ahead 2-3 steps
   */
  evaluateActionWithLookahead(x, y, actionIdx, goalX, goalY, goalId, lookaheadSteps = 2) {
    const action = this.actions[actionIdx];
    let testX = x + action.dx * this.options.stepSize;
    let testY = y + action.dy * this.options.stepSize;
    
    if (!this.isPointNavigable(testX, testY)) {
      return { score: -Infinity, finalDist: Infinity };
    }
    
    let bestDist = this.heuristic(testX, testY, goalX, goalY);
    let currentX = testX, currentY = testY;
    
    // Look ahead a few steps
    for (let step = 1; step < lookaheadSteps; step++) {
      const validActions = this.getValidActions(currentX, currentY);
      if (validActions.length === 0) break;
      
      // Find best next action from this position
      const bestNextAction = this.selectBestAction(currentX, currentY, goalX, goalY, goalId, validActions);
      if (bestNextAction === null) break;
      
      const nextAction = this.actions[bestNextAction];
      currentX += nextAction.dx * this.options.stepSize;
      currentY += nextAction.dy * this.options.stepSize;
      
      if (!this.isPointNavigable(currentX, currentY)) break;
      
      const dist = this.heuristic(currentX, currentY, goalX, goalY);
      bestDist = Math.min(bestDist, dist);
    }
    
    return { score: bestDist, finalDist: bestDist };
  }

  /**
   * Improved pathfinding with A* hybrid and lookahead
   */
  findPath(startX, startY, goalX, goalY, goalId, maxSteps = 500) {
    const startNavigable = this.isPointNavigable(startX, startY);
    const goalNavigable = this.isPointNavigable(goalX, goalY);
    console.log(`🔍 Path start (${startX.toFixed(0)}, ${startY.toFixed(0)}): ${startNavigable ? '✓ navigable' : '✗ NOT navigable'}`);
    console.log(`🔍 Path goal (${goalX.toFixed(0)}, ${goalY.toFixed(0)}): ${goalNavigable ? '✓ navigable' : '✗ NOT navigable'}`);
    
    // If start isn't navigable, find nearest navigable point
    let x = startX, y = startY;
    if (!startNavigable) {
      const nearestStart = this.findNearestNavigablePoint(startX, startY);
      if (nearestStart) {
        x = nearestStart.x;
        y = nearestStart.y;
        console.log(`📍 Adjusted start to nearest navigable: (${x.toFixed(0)}, ${y.toFixed(0)})`);
      } else {
        console.warn('⚠️ No navigable start point found, trying direct path');
        return this.findDirectPath(startX, startY, goalX, goalY);
      }
    }
    
    const path = [{ x, y }];
    const visitedStates = new Map(); // Track visit count and best distance
    let bestDistance = this.heuristic(x, y, goalX, goalY);
    let stuckCounter = 0;
    const maxStuckSteps = 10; // If not improving for 10 steps, try different approach
    
    for (let step = 0; step < maxSteps; step++) {
      const currentDist = this.heuristic(x, y, goalX, goalY);
      
      // Check if reached goal (stricter threshold)
      const goalThreshold = this.options.stepSize * 1.2; // 30px instead of 62.5px
      if (currentDist < goalThreshold) {
        path.push({ x: goalX, y: goalY });
        console.log(`✅ Path found in ${step} steps, distance: ${currentDist.toFixed(0)}px`);
        return { success: true, path, steps: step };
      }
      
      // Track progress
      if (currentDist < bestDistance) {
        bestDistance = currentDist;
        stuckCounter = 0;
      } else {
        stuckCounter++;
      }
      
      // Get valid actions
      const validActions = this.getValidActions(x, y);
      if (validActions.length === 0) {
        console.warn(`⚠️ No valid actions at (${x.toFixed(0)}, ${y.toFixed(0)})`);
        break;
      }
      
      // Check for loops: if visited this state before and not making progress
      const state = this.positionToState(x, y, goalId);
      if (visitedStates.has(state)) {
        const prevDist = visitedStates.get(state);
        if (currentDist >= prevDist - 5) { // Not improving
          // Force goal-directed action to break loop
          const goalAction = this.getGoalDirectedAction(x, y, goalX, goalY, validActions);
          if (goalAction !== null) {
            const result = this.executeAction(x, y, goalAction);
            if (!result.collision) {
              x = result.x;
              y = result.y;
              path.push({ x, y });
              visitedStates.set(state, currentDist);
              continue;
            }
          }
        }
      }
      visitedStates.set(state, currentDist);
      
      // If stuck, use aggressive goal-directed approach
      if (stuckCounter > maxStuckSteps) {
        console.log(`🔄 Stuck detected, using aggressive goal-directed navigation`);
        const goalAction = this.getGoalDirectedAction(x, y, goalX, goalY, validActions);
        if (goalAction !== null) {
          const result = this.executeAction(x, y, goalAction);
          if (!result.collision) {
            x = result.x;
            y = result.y;
            path.push({ x, y });
            stuckCounter = 0;
            continue;
          }
        }
      }
      
      // Adaptive exploration: use more heuristic when far, more RL when close
      const distToGoal = currentDist;
      const useHeuristic = distToGoal > 200; // Use heuristic when >200px away
      
      let actionIdx;
      if (useHeuristic && Math.random() < 0.7) {
        // Use A* hybrid approach (70% chance when far)
        actionIdx = this.selectBestAction(x, y, goalX, goalY, goalId, validActions);
      } else {
        // Use RL approach
        actionIdx = this.selectAction(x, y, goalX, goalY, goalId);
      }
      
      if (actionIdx === null) {
        // Fallback to goal-directed
        actionIdx = this.getGoalDirectedAction(x, y, goalX, goalY, validActions);
        if (actionIdx === null) {
          break;
        }
      }
      
      // Execute action
      const result = this.executeAction(x, y, actionIdx);
      
      if (!result.collision) {
        x = result.x;
        y = result.y;
        path.push({ x, y });
      } else {
        // Collision - try alternative actions
        const altActions = validActions.filter(a => a !== actionIdx);
        if (altActions.length > 0) {
          const goalAction = this.getGoalDirectedAction(x, y, goalX, goalY, altActions);
          const finalAction = goalAction !== null ? goalAction : altActions[0];
          const altResult = this.executeAction(x, y, finalAction);
          if (!altResult.collision) {
            x = altResult.x;
            y = altResult.y;
            path.push({ x, y });
          }
        }
      }
    }
    
    // Refine path: remove redundant points
    const refinedPath = this.refinePath(path);
    
    // Check if we got close enough
    const finalDist = this.heuristic(
      refinedPath[refinedPath.length - 1].x,
      refinedPath[refinedPath.length - 1].y,
      goalX,
      goalY
    );
    
    const goalThreshold = this.options.stepSize * 1.2; // Stricter threshold
    if (finalDist < goalThreshold) {
      refinedPath.push({ x: goalX, y: goalY });
      console.log(`✅ Path found (refined), final distance: ${finalDist.toFixed(0)}px`);
      return { success: true, path: refinedPath, steps: path.length };
    }
    
    // If RL path failed, try direct path
    if (refinedPath.length < 3) {
      console.log('🔄 RL path too short, trying direct path');
      return this.findDirectPath(startX, startY, goalX, goalY);
    }
    
    console.log(`⚠️ Path incomplete, final distance: ${finalDist.toFixed(0)}px`);
    return { success: false, path: refinedPath, steps: path.length };
  }

  /**
   * Refine path by removing redundant points (path smoothing)
   */
  refinePath(path) {
    if (path.length <= 2) return path;
    
    const refined = [path[0]];
    
    for (let i = 1; i < path.length - 1; i++) {
      const prev = refined[refined.length - 1];
      const curr = path[i];
      const next = path[i + 1];
      
      // Check if we can skip current point (direct line is clear)
      if (this.isPathClear(prev.x, prev.y, next.x, next.y)) {
        // Skip this point
        continue;
      }
      
      // Keep point if it's a necessary turn
      refined.push(curr);
    }
    
    // Always include last point
    refined.push(path[path.length - 1]);
    
    return refined;
  }

  /**
   * Find nearest navigable point to given coordinates
   */
  findNearestNavigablePoint(x, y, maxRadius = 100) {
    const stepSize = this.options.stepSize;
    
    // First check the exact point
    if (this.isPointNavigable(x, y)) {
      return { x, y };
    }
    
    // Search in expanding circles
    for (let radius = stepSize; radius <= maxRadius; radius += stepSize) {
      // Check cardinal directions first (more likely to be in corridor)
      const cardinals = [
        { dx: radius, dy: 0 },    // East
        { dx: -radius, dy: 0 },   // West
        { dx: 0, dy: radius },     // South
        { dx: 0, dy: -radius },    // North
        { dx: radius, dy: radius },      // SE
        { dx: -radius, dy: radius },     // SW
        { dx: radius, dy: -radius },     // NE
        { dx: -radius, dy: -radius }     // NW
      ];
      
      for (const dir of cardinals) {
        const testX = x + dir.dx;
        const testY = y + dir.dy;
        if (this.isPointNavigable(testX, testY)) {
          return { x: testX, y: testY };
        }
      }
      
      // Then check all angles if cardinals didn't work
      for (let angle = 0; angle < 360; angle += 30) {
        const rad = (angle * Math.PI) / 180;
        const testX = x + radius * Math.cos(rad);
        const testY = y + radius * Math.sin(rad);
        
        if (this.isPointNavigable(testX, testY)) {
          return { x: testX, y: testY };
        }
      }
    }
    
    return null;
  }

  /**
   * Find a direct path (fallback when RL fails)
   */
  findDirectPath(startX, startY, goalX, goalY) {
    const path = [];
    const distance = Math.sqrt((goalX - startX) ** 2 + (goalY - startY) ** 2);
    const steps = Math.ceil(distance / this.options.stepSize);
    
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      path.push({
        x: startX + t * (goalX - startX),
        y: startY + t * (goalY - startY)
      });
    }
    
    console.log(`📏 Direct path: ${path.length} points, ${distance.toFixed(0)}px`);
    return { success: true, path, steps: path.length, method: 'direct' };
  }

  /**
   * Train episode: simulate path finding and learn
   */
  trainEpisode(startX, startY, goalX, goalY, goalId, maxSteps = 300) {
    // Ensure start is navigable
    if (!this.isPointNavigable(startX, startY)) {
      const nearest = this.findNearestNavigablePoint(startX, startY);
      if (nearest) {
        startX = nearest.x;
        startY = nearest.y;
      } else {
        console.warn(`⚠️ Cannot train episode: start (${startX}, ${startY}) not navigable`);
        return { totalReward: this.options.collisionPenalty, steps: 0, success: false };
      }
    }
    
    let x = startX, y = startY;
    let totalReward = 0;
    let steps = 0;
    
    // For simple single-corridor setup, reduce max steps
    const adjustedMaxSteps = this.corridors.length === 1 ? 200 : maxSteps;
    
    let prevState = null;
    let prevAction = null;
    
    // Check if already at goal before starting (stricter threshold)
    const initialDist = Math.sqrt((goalX - x) ** 2 + (goalY - y) ** 2);
    const goalThreshold = this.options.stepSize * 1.2; // Stricter: must be within 30px (was 62.5px)
    if (initialDist < goalThreshold) {
      // Already at goal - give reward and exit
      totalReward += this.options.goalReward;
      this.stats.successfulPaths++;
      return { totalReward, steps: 0, success: true };
    }
    
    for (let step = 0; step < adjustedMaxSteps; step++) {
      steps++;
      
      // Check if reached goal BEFORE selecting action (stricter threshold)
      const distToGoal = Math.sqrt((goalX - x) ** 2 + (goalY - y) ** 2);
      const reachedGoal = distToGoal < goalThreshold;
      
      if (reachedGoal) {
        // Goal reached! Update previous state-action with goal reward
        const goalReward = this.options.goalReward;
        totalReward += goalReward;
        
        if (prevState !== null && prevAction !== null) {
          // Update the action that led us to goal
          const terminalState = `TERMINAL:${goalId}`;
          this.updateQValue(prevState, prevAction, goalReward, terminalState);
        }
        
        // Update stats
        this.stats.successfulPaths++;
        break;
      }
      
      // Select action (with exploration) - use higher exploration during training
      const state = this.positionToState(x, y, goalId);
      
      // During training, use more exploration to learn better
      const trainingExplorationRate = Math.min(this.options.explorationRate * 1.5, 0.8);
      const originalExplorationRate = this.options.explorationRate;
      this.options.explorationRate = trainingExplorationRate;
      
      const actionIdx = this.selectAction(x, y, goalX, goalY, goalId);
      
      // Restore exploration rate
      this.options.explorationRate = originalExplorationRate;
      
      if (actionIdx === null) {
        // No valid actions - try goal-directed
        const validActions = this.getValidActions(x, y);
        if (validActions.length > 0) {
          const goalAction = this.getGoalDirectedAction(x, y, goalX, goalY, validActions);
          if (goalAction !== null) {
            const result = this.executeAction(x, y, goalAction);
            if (!result.collision) {
              x = result.x;
              y = result.y;
              const reward = this.calculateReward(x, y, x, y, goalX, goalY, false, false);
              totalReward += reward;
              const newState = this.positionToState(x, y, goalId);
              this.updateQValue(state, goalAction, reward, newState);
              continue;
            }
          }
        }
        // Still no valid actions
        totalReward += this.options.collisionPenalty;
        break;
      }
      
      // Execute action
      const result = this.executeAction(x, y, actionIdx);
      const newX = result.x, newY = result.y;
      
      // Calculate reward (goal check happens at start of next iteration)
      const reward = this.calculateReward(x, y, newX, newY, goalX, goalY, result.collision, false);
      totalReward += reward;
      
      // Update Q-value (CRITICAL for learning)
      const newState = this.positionToState(newX, newY, goalId);
      this.updateQValue(state, actionIdx, reward, newState);
      
      // Track previous state-action for goal reward propagation
      prevState = state;
      prevAction = actionIdx;
      
      // Move to new position
      x = newX;
      y = newY;
    }
    
    // Train from replay (do this more frequently for better learning)
    if (this.replayBuffer.length >= this.options.batchSize) {
      this.trainFromReplay();
    }
    
    // Decay exploration (slower decay to maintain exploration longer)
    if (this.options.explorationRate > this.options.minExplorationRate) {
      this.options.explorationRate *= this.options.explorationDecay;
    }
    
    // Update stats
    this.stats.totalEpisodes++;
    this.stats.totalSteps += steps;
    this.stats.avgReward = (this.stats.avgReward * (this.stats.totalEpisodes - 1) + totalReward) / this.stats.totalEpisodes;
    this.stats.avgPathLength = this.stats.totalSteps / this.stats.totalEpisodes;
    
    // Success means we reached the goal (not just didn't hit max steps)
    const finalDist = Math.sqrt((goalX - x) ** 2 + (goalY - y) ** 2);
    // Use the same goalThreshold declared at the start of the function
    const actuallyReachedGoal = finalDist < goalThreshold;
    return { 
      totalReward, 
      steps, 
      success: actuallyReachedGoal,
      finalX: x,
      finalY: y,
      finalDistance: finalDist
    };
  }

  /**
   * Batch training: train multiple episodes (non-blocking)
   */
  async train(episodes = 100, progressCallback = null) {
    if (this.corridors.length === 0 || this.destinations.length === 0) {
      console.warn('⚠️ Cannot train: no corridors or destinations defined');
      throw new Error('No corridors or destinations defined');
    }

    console.log(`🧠 Starting training: ${episodes} episodes`);
    console.log(`   Environment: ${this.corridors.length} corridor(s), ${this.destinations.length} destination(s)`);
    
    // Find valid start positions (points inside corridors)
    // For simple single-corridor setup, use fewer but better positions
    const numPositions = this.corridors.length === 1 ? 10 : 20;
    const startPositions = this.findValidPositions(numPositions);
    
    if (startPositions.length === 0) {
      console.error('❌ No valid start positions found');
      console.error('   Check if corridor polygon is valid and contains navigable points');
      throw new Error('No valid start positions found in corridors');
    }

    console.log(`📍 Found ${startPositions.length} valid start positions`);
    console.log(`🎯 Training with ${this.destinations.length} destinations`);
    
    // Verify destinations are navigable
    let navigableDests = 0;
    for (const dest of this.destinations) {
      if (this.isPointNavigable(dest.x, dest.y)) {
        navigableDests++;
      } else {
        console.warn(`⚠️ Destination "${dest.name}" at (${dest.x}, ${dest.y}) is NOT navigable`);
      }
    }
    console.log(`   Navigable destinations: ${navigableDests}/${this.destinations.length}`);
    
    if (navigableDests === 0) {
      throw new Error('No navigable destinations found! Check destination placement.');
    }

    const initialStats = { ...this.stats };
    
    // Initial progress
    if (progressCallback) {
      progressCallback(0);
    }
    
    // Train episodes with progress updates
    let episodesSkipped = 0;
    let episodesTrained = 0;
    
    console.log(`🚀 Starting training: ${episodes} episodes, ${startPositions.length} start positions, ${this.destinations.length} destinations`);
    
    for (let ep = 0; ep < episodes; ep++) {
      try {
        // Random start position
        const start = startPositions[Math.floor(Math.random() * startPositions.length)];
        
        // Random destination (avoid same as start if too close)
        let dest = this.destinations[Math.floor(Math.random() * this.destinations.length)];
        let attempts = 0;
        const minDistance = this.options.stepSize * 8; // Increased: minimum 200px distance for meaningful training
        while (attempts < 20 && Math.sqrt((start.x - dest.x) ** 2 + (start.y - dest.y) ** 2) < minDistance) {
          dest = this.destinations[Math.floor(Math.random() * this.destinations.length)];
          attempts++;
        }
        
        // Log first few episodes with detailed info
        if (ep < 5) {
          const dist = Math.sqrt((start.x - dest.x) ** 2 + (start.y - dest.y) ** 2);
          console.log(`   Episode ${ep}: Start (${start.x}, ${start.y}) -> Dest ${dest.name} (${dest.x}, ${dest.y}), Distance: ${dist.toFixed(1)}px`);
        }
        
        // Ensure destination is navigable
        let targetX = dest.x, targetY = dest.y;
        if (!this.isPointNavigable(dest.x, dest.y)) {
          const nearest = this.findNearestNavigablePoint(dest.x, dest.y, 50);
          if (!nearest) {
            episodesSkipped++;
            console.warn(`⚠️ Skipping episode ${ep}: destination ${dest.name} at (${dest.x}, ${dest.y}) not navigable`);
            // Still update progress even if skipping
            if (progressCallback) {
              const progress = ((ep + 1) / episodes) * 100;
              progressCallback(Math.min(100, progress));
            }
            continue;
          }
          targetX = nearest.x;
          targetY = nearest.y;
        }
        
        // Train episode
        const episodeStartTime = Date.now();
        const episodeResult = this.trainEpisode(start.x, start.y, targetX, targetY, dest.id);
        const episodeDuration = Date.now() - episodeStartTime;
        episodesTrained++;
        
        // Log episode details (first few and every 20th)
        if (ep < 5 || ep % 20 === 0) {
          const finalDist = Math.sqrt((targetX - (episodeResult.finalX || targetX)) ** 2 + (targetY - (episodeResult.finalY || targetY)) ** 2);
          console.log(`   Episode ${ep}: Steps: ${episodeResult.steps}, Success: ${episodeResult.success}, Reward: ${episodeResult.totalReward.toFixed(1)}, Final dist: ${finalDist.toFixed(1)}px, Time: ${episodeDuration}ms`);
        }
        
        // Warn if episode completes too quickly or with too few steps
        if (episodeDuration < 5 && episodeResult.steps < 5) {
          console.warn(`   ⚠️ Episode ${ep} suspicious: ${episodeDuration}ms, ${episodeResult.steps} steps`);
        }
        
        // Progress callback (every episode for real-time updates)
        if (progressCallback) {
          const progress = ((ep + 1) / episodes) * 100;
          progressCallback(Math.min(100, progress));
        }
        
        // Log progress every 10 episodes
        if (ep % 10 === 0 && ep > 0) {
          const currentStats = this.getStats();
          const currentSuccessRate = currentStats.totalEpisodes > 0
            ? ((currentStats.successfulPaths - (initialStats.successfulPaths || 0)) / 
               (currentStats.totalEpisodes - initialStats.totalEpisodes) * 100).toFixed(1)
            : '0.0';
          console.log(`   Episode ${ep}/${episodes}: Success rate: ${currentSuccessRate}%, Q-table: ${this.qTable.size} states`);
        }
        
        // Yield to event loop every 10 episodes to allow progress updates and prevent blocking
        if (ep % 10 === 0 && ep > 0) {
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      } catch (error) {
        console.error(`❌ Error in training episode ${ep}:`, error.message);
        // Continue training despite errors, but still update progress
        if (progressCallback) {
          const progress = ((ep + 1) / episodes) * 100;
          progressCallback(Math.min(100, progress));
        }
      }
    }
    
    if (progressCallback) progressCallback(100);
    
    const finalStats = this.getStats();
    const totalEpisodesTrained = finalStats.totalEpisodes - initialStats.totalEpisodes;
    const successfulPaths = finalStats.successfulPaths - (initialStats.successfulPaths || 0);
    const successRate = totalEpisodesTrained > 0 
      ? (successfulPaths / totalEpisodesTrained * 100).toFixed(1)
      : '0.0';
    
    // Calculate average steps per episode
    const avgStepsPerEpisode = totalEpisodesTrained > 0 
      ? ((finalStats.totalSteps - (initialStats.totalSteps || 0)) / totalEpisodesTrained).toFixed(1)
      : '0.0';
    
    console.log(`✅ Training complete:`);
    console.log(`   Episodes requested: ${episodes}`);
    console.log(`   Episodes trained: ${episodesTrained} (${totalEpisodesTrained} total including previous)`);
    console.log(`   Episodes skipped: ${episodesSkipped}`);
    console.log(`   Successful paths: ${successfulPaths}`);
    console.log(`   Success rate: ${successRate}%`);
    console.log(`   Avg steps per episode: ${avgStepsPerEpisode}`);
    console.log(`   Avg reward: ${finalStats.avgReward.toFixed(1)}`);
    console.log(`   Q-table size: ${this.qTable.size} states`);
    console.log(`   Replay buffer: ${this.replayBuffer.length} experiences`);
    console.log(`   Exploration rate: ${(this.options.explorationRate * 100).toFixed(1)}%`);
    
    // Warning if success rate is suspiciously high
    if (parseFloat(successRate) > 95 && totalEpisodesTrained > 50) {
      console.warn(`⚠️ Success rate is very high (${successRate}%) - goal threshold might be too lenient`);
    }
    
    // Warning if average steps are too low
    if (parseFloat(avgStepsPerEpisode) < 5 && totalEpisodesTrained > 50) {
      console.warn(`⚠️ Average steps per episode is very low (${avgStepsPerEpisode}) - episodes might be too easy`);
    }
    
    // Warning if success rate is low
    if (parseFloat(successRate) < 50) {
      console.warn(`⚠️ Low success rate (${successRate}%). Possible issues:`);
      console.warn(`   - Destinations may not be navigable`);
      console.warn(`   - Corridor may be too small or disconnected`);
      console.warn(`   - Training episodes may be too few`);
      console.warn(`   - Step size may be too large for corridor width`);
      console.warn(`   - Try increasing episodes to 500-1000`);
    }
    
    // Warning if Q-table is too small
    if (this.qTable.size < 100 && totalEpisodesTrained > 50) {
      console.warn(`⚠️ Q-table is small (${this.qTable.size} states) for ${totalEpisodesTrained} episodes`);
      console.warn(`   - Agent may not be exploring enough`);
      console.warn(`   - Increase exploration rate or episodes`);
    }
    
    // Success indicators
    if (parseFloat(successRate) >= 70 && this.qTable.size > 200) {
      console.log(`✅ Good training results! Agent is learning well.`);
    }
    
    return {
      episodes: episodesTrained,
      successRate: parseFloat(successRate),
      avgReward: finalStats.avgReward,
      qTableSize: this.qTable.size,
      explorationRate: this.options.explorationRate
    };
  }

  /**
   * Find valid positions inside corridors
   */
  findValidPositions(count) {
    const positions = [];
    const maxAttempts = count * 200; // Increased attempts
    let attempts = 0;
    
    if (this.corridors.length === 0) {
      console.warn('⚠️ No corridors available for finding positions');
      return positions;
    }
    
    // Strategy 1: Try random points in corridors
    while (positions.length < count && attempts < maxAttempts) {
      attempts++;
      
      // Pick random corridor
      const corridor = this.corridors[Math.floor(Math.random() * this.corridors.length)];
      
      if (!corridor.polygon || corridor.polygon.length < 3) continue;
      
      // Get bounding box of corridor
      const xs = corridor.polygon.map(p => p[0]);
      const ys = corridor.polygon.map(p => p[1]);
      const minX = Math.min(...xs), maxX = Math.max(...xs);
      const minY = Math.min(...ys), maxY = Math.max(...ys);
      
      // Random point in bounding box
      const x = minX + Math.random() * (maxX - minX);
      const y = minY + Math.random() * (maxY - minY);
      
      // Check if inside corridor using polygon test
      if (this.isPointInPolygon(x, y, corridor.polygon)) {
        // Double-check with navigable grid
        if (this.isPointNavigable(x, y)) {
          positions.push({ x, y, floor: corridor.floor });
        }
      }
    }
    
    // Strategy 2: Use corridor centroids if we don't have enough
    if (positions.length < count) {
      for (const corridor of this.corridors) {
        if (positions.length >= count) break;
        if (!corridor.polygon || corridor.polygon.length < 3) continue;
        
        // Calculate centroid
        const xs = corridor.polygon.map(p => p[0]);
        const ys = corridor.polygon.map(p => p[1]);
        const centroidX = xs.reduce((a, b) => a + b, 0) / xs.length;
        const centroidY = ys.reduce((a, b) => a + b, 0) / ys.length;
        
        if (this.isPointNavigable(centroidX, centroidY)) {
          // Check if already added
          const exists = positions.some(p => 
            Math.abs(p.x - centroidX) < 10 && Math.abs(p.y - centroidY) < 10
          );
          if (!exists) {
            positions.push({ x: centroidX, y: centroidY, floor: corridor.floor });
          }
        }
      }
    }
    
    // Strategy 3: Use destination positions as valid start points
    if (positions.length < count && this.destinations.length > 0) {
      for (const dest of this.destinations) {
        if (positions.length >= count) break;
        if (this.isPointNavigable(dest.x, dest.y)) {
          const exists = positions.some(p => 
            Math.abs(p.x - dest.x) < 10 && Math.abs(p.y - dest.y) < 10
          );
          if (!exists) {
            positions.push({ x: dest.x, y: dest.y, floor: dest.floor });
          }
        }
      }
    }
    
    console.log(`📍 Found ${positions.length} valid training positions (requested: ${count})`);
    return positions;
  }

  /**
   * Export model
   */
  exportModel() {
    return {
      qTable: Object.fromEntries(this.qTable),
      stats: this.stats,
      options: this.options
    };
  }

  /**
   * Import model
   */
  importModel(data) {
    if (data.qTable) {
      this.qTable = new Map(Object.entries(data.qTable).map(([k, v]) => [k, v]));
    }
    if (data.stats) {
      this.stats = { ...this.stats, ...data.stats };
    }
    if (data.options) {
      this.options = { ...this.options, ...data.options };
    }
    console.log(`📥 Imported continuous space RL model: ${this.qTable.size} states`);
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      ...this.stats,
      explorationRate: this.options.explorationRate,
      qTableSize: this.qTable.size,
      replayBufferSize: this.replayBuffer.length
    };
  }
}

module.exports = ContinuousSpaceRLAgent;

