/**
 * RLEnvironment - Grid-based navigation environment for RL agent
 * 
 * This provides a Gym-style environment interface for the RL agent to learn
 * navigation in the building space.
 */

class RLEnvironment {
  constructor(gridGenerator, options = {}) {
    this.gridGenerator = gridGenerator;
    this.grid = gridGenerator.grid;
    this.width = gridGenerator.width;
    this.height = gridGenerator.height;
    this.cellSize = gridGenerator.cellSize;
    
    // Current state
    this.currentX = 0;
    this.currentY = 0;
    this.goalX = 0;
    this.goalY = 0;
    this.goalId = null;
    this.startX = 0;
    this.startY = 0;
    
    // Episode tracking
    this.steps = 0;
    this.maxSteps = options.maxSteps || 1000;
    this.done = false;
    this.path = [];
    
    // Reward configuration
    this.rewards = {
      step: options.stepReward || -1,           // Penalty per step to encourage efficiency
      wallCollision: options.wallReward || -10,  // Penalty for hitting walls
      goal: options.goalReward || 1000,          // Reward for reaching destination
      revisit: options.revisitReward || -5,      // Penalty for revisiting cells
      progress: options.progressReward || 1,     // Reward for getting closer to goal
      diagonal: options.diagonalReward || -0.4   // Extra cost for diagonal moves
    };
    
    // Actions: 8 directions
    this.actions = [
      { name: 'N', dx: 0, dy: -1, diagonal: false },
      { name: 'NE', dx: 1, dy: -1, diagonal: true },
      { name: 'E', dx: 1, dy: 0, diagonal: false },
      { name: 'SE', dx: 1, dy: 1, diagonal: true },
      { name: 'S', dx: 0, dy: 1, diagonal: false },
      { name: 'SW', dx: -1, dy: 1, diagonal: true },
      { name: 'W', dx: -1, dy: 0, diagonal: false },
      { name: 'NW', dx: -1, dy: -1, diagonal: true }
    ];
    
    // Visited cells tracking
    this.visited = new Set();
    
    // Statistics
    this.episodeCount = 0;
    this.totalReward = 0;
    this.successCount = 0;
    this.avgStepsToGoal = 0;
  }

  /**
   * Reset the environment for a new episode
   * @param {Object} params - Reset parameters
   * @param {number} params.startX - Starting X position (grid coordinates)
   * @param {number} params.startY - Starting Y position (grid coordinates)
   * @param {string} params.goalId - Destination ID
   * @returns {Object} Initial state
   */
  reset({ startX, startY, goalId }) {
    // Find goal position from destination ID
    const destination = this.gridGenerator.destinationCells.get(goalId);
    if (!destination) {
      throw new Error(`Unknown destination: ${goalId}`);
    }

    // Validate start position
    if (!this.isWalkable(startX, startY)) {
      // Find nearest walkable cell
      const walkable = this.findNearestWalkable(startX, startY);
      startX = walkable.x;
      startY = walkable.y;
    }

    this.startX = startX;
    this.startY = startY;
    this.currentX = startX;
    this.currentY = startY;
    this.goalX = destination.x;
    this.goalY = destination.y;
    this.goalId = goalId;
    
    this.steps = 0;
    this.done = false;
    this.path = [{ x: startX, y: startY }];
    this.visited.clear();
    this.visited.add(`${startX},${startY}`);
    this.totalReward = 0;

    return this.getState();
  }

  /**
   * Take an action in the environment
   * @param {number} actionIndex - Index of action to take (0-7)
   * @returns {Object} { state, reward, done, info }
   */
  step(actionIndex) {
    if (this.done) {
      throw new Error('Episode is done. Call reset() first.');
    }

    const action = this.actions[actionIndex];
    if (!action) {
      throw new Error(`Invalid action index: ${actionIndex}`);
    }

    const newX = this.currentX + action.dx;
    const newY = this.currentY + action.dy;

    let reward = this.rewards.step;
    let info = { action: action.name };

    // Check for wall collision
    if (!this.isWalkable(newX, newY)) {
      reward += this.rewards.wallCollision;
      info.collision = true;
      // Don't move, but still count the step
    } else {
      // Valid move
      const prevDistance = this.distanceToGoal(this.currentX, this.currentY);
      
      this.currentX = newX;
      this.currentY = newY;
      this.path.push({ x: newX, y: newY });

      // Progress reward
      const newDistance = this.distanceToGoal(newX, newY);
      if (newDistance < prevDistance) {
        reward += this.rewards.progress;
        info.progress = true;
      }

      // Diagonal movement cost
      if (action.diagonal) {
        reward += this.rewards.diagonal;
      }

      // Revisit penalty
      const cellKey = `${newX},${newY}`;
      if (this.visited.has(cellKey)) {
        reward += this.rewards.revisit;
        info.revisit = true;
      }
      this.visited.add(cellKey);

      // Check if reached goal
      if (newX === this.goalX && newY === this.goalY) {
        reward += this.rewards.goal;
        this.done = true;
        this.successCount++;
        info.success = true;
        
        // Update average steps
        this.avgStepsToGoal = (this.avgStepsToGoal * (this.successCount - 1) + this.steps) / this.successCount;
      }
    }

    this.steps++;
    this.totalReward += reward;

    // Check max steps
    if (this.steps >= this.maxSteps) {
      this.done = true;
      info.timeout = true;
    }

    this.episodeCount++;

    return {
      state: this.getState(),
      reward,
      done: this.done,
      info
    };
  }

  /**
   * Get current state representation
   * @returns {Object} State object
   */
  getState() {
    return {
      x: this.currentX,
      y: this.currentY,
      goalX: this.goalX,
      goalY: this.goalY,
      distance: this.distanceToGoal(this.currentX, this.currentY),
      relativeX: this.goalX - this.currentX,
      relativeY: this.goalY - this.currentY,
      validActions: this.getValidActions(),
      steps: this.steps
    };
  }

  /**
   * Get state as a string key for Q-table
   * @returns {string} State key
   */
  getStateKey() {
    // Simplified state: current position relative to goal
    const dx = this.goalX - this.currentX;
    const dy = this.goalY - this.currentY;
    return `${this.currentX},${this.currentY}|${this.goalX},${this.goalY}`;
  }

  /**
   * Get compact state key for generalization
   * Uses binned relative position to goal
   * @returns {string} Compact state key
   */
  getCompactStateKey() {
    const dx = this.goalX - this.currentX;
    const dy = this.goalY - this.currentY;
    
    // Bin relative position into categories
    const binSize = 5;
    const binX = Math.floor(dx / binSize) * binSize;
    const binY = Math.floor(dy / binSize) * binSize;
    
    // Include local obstacles info
    const obstacles = this.getLocalObstacles();
    
    return `${binX},${binY}|${obstacles}`;
  }

  /**
   * Get local obstacle pattern around current position
   * @returns {string} Binary pattern of obstacles
   */
  getLocalObstacles() {
    let pattern = '';
    for (const action of this.actions) {
      const nx = this.currentX + action.dx;
      const ny = this.currentY + action.dy;
      pattern += this.isWalkable(nx, ny) ? '1' : '0';
    }
    return pattern;
  }

  /**
   * Get list of valid actions from current position
   * @returns {Array} Array of valid action indices
   */
  getValidActions() {
    const valid = [];
    for (let i = 0; i < this.actions.length; i++) {
      const action = this.actions[i];
      const nx = this.currentX + action.dx;
      const ny = this.currentY + action.dy;
      if (this.isWalkable(nx, ny)) {
        valid.push(i);
      }
    }
    return valid;
  }

  /**
   * Calculate Euclidean distance to goal
   * @param {number} x - X position
   * @param {number} y - Y position
   * @returns {number} Distance
   */
  distanceToGoal(x, y) {
    return Math.sqrt(
      Math.pow(this.goalX - x, 2) + Math.pow(this.goalY - y, 2)
    );
  }

  /**
   * Calculate Manhattan distance to goal
   * @param {number} x - X position
   * @param {number} y - Y position
   * @returns {number} Manhattan distance
   */
  manhattanDistance(x, y) {
    return Math.abs(this.goalX - x) + Math.abs(this.goalY - y);
  }

  /**
   * Check if a cell is walkable
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   * @returns {boolean} True if walkable
   */
  isWalkable(x, y) {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
      return false;
    }
    return this.grid[y][x] === 1;
  }

  /**
   * Find nearest walkable cell to a given position
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   * @returns {Object} Nearest walkable cell
   */
  findNearestWalkable(x, y) {
    // BFS to find nearest walkable
    const queue = [{ x, y, dist: 0 }];
    const visited = new Set();
    visited.add(`${x},${y}`);

    while (queue.length > 0) {
      const current = queue.shift();
      
      if (this.isWalkable(current.x, current.y)) {
        return { x: current.x, y: current.y };
      }

      // Check all 8 neighbors
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          if (dx === 0 && dy === 0) continue;
          
          const nx = current.x + dx;
          const ny = current.y + dy;
          const key = `${nx},${ny}`;
          
          if (!visited.has(key) && nx >= 0 && nx < this.width && ny >= 0 && ny < this.height) {
            visited.add(key);
            queue.push({ x: nx, y: ny, dist: current.dist + 1 });
          }
        }
      }
    }

    // No walkable cell found (shouldn't happen if grid is valid)
    return { x: 0, y: 0 };
  }

  /**
   * Get the current path taken
   * @returns {Array} Array of {x, y} positions
   */
  getPath() {
    return this.path;
  }

  /**
   * Convert path to pixel coordinates
   * @returns {Array} Array of pixel coordinates
   */
  getPathInPixels() {
    return this.path.map(p => this.gridGenerator.gridToPixel(p.x, p.y));
  }

  /**
   * Get action name from index
   * @param {number} actionIndex - Action index
   * @returns {string} Action name
   */
  getActionName(actionIndex) {
    return this.actions[actionIndex]?.name || 'Unknown';
  }

  /**
   * Get action index from name
   * @param {string} name - Action name
   * @returns {number} Action index
   */
  getActionIndex(name) {
    return this.actions.findIndex(a => a.name === name);
  }

  /**
   * Get environment statistics
   * @returns {Object} Statistics
   */
  getStats() {
    return {
      episodeCount: this.episodeCount,
      successCount: this.successCount,
      successRate: this.episodeCount > 0 ? (this.successCount / this.episodeCount * 100).toFixed(2) : 0,
      avgStepsToGoal: this.avgStepsToGoal.toFixed(2),
      gridSize: `${this.width}x${this.height}`,
      cellSize: this.cellSize
    };
  }

  /**
   * Clone the environment for parallel training
   * @returns {RLEnvironment} Cloned environment
   */
  clone() {
    const cloned = new RLEnvironment(this.gridGenerator, {
      maxSteps: this.maxSteps,
      stepReward: this.rewards.step,
      wallReward: this.rewards.wallCollision,
      goalReward: this.rewards.goal,
      revisitReward: this.rewards.revisit,
      progressReward: this.rewards.progress,
      diagonalReward: this.rewards.diagonal
    });
    return cloned;
  }

  /**
   * Render the current state as ASCII (for debugging)
   * @returns {string} ASCII representation
   */
  render() {
    let result = '';
    
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (x === this.currentX && y === this.currentY) {
          result += 'A'; // Agent
        } else if (x === this.goalX && y === this.goalY) {
          result += 'G'; // Goal
        } else if (x === this.startX && y === this.startY) {
          result += 'S'; // Start
        } else if (this.path.some(p => p.x === x && p.y === y)) {
          result += '*'; // Path
        } else if (this.grid[y][x] === 1) {
          result += '.'; // Walkable
        } else {
          result += '#'; // Wall
        }
      }
      result += '\n';
    }
    
    return result;
  }
}

module.exports = RLEnvironment;

