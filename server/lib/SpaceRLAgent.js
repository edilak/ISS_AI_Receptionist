/**
 * SpaceRLAgent - Q-Learning agent for grid-based space navigation
 * 
 * This agent learns optimal paths through the building using Q-learning
 * with experience replay and epsilon-greedy exploration.
 */

class SpaceRLAgent {
  constructor(options = {}) {
    // Q-table: Map<stateKey, Map<actionIndex, qValue>>
    this.qTable = new Map();
    
    // Learning parameters
    this.learningRate = options.learningRate || 0.1;
    this.discountFactor = options.discountFactor || 0.95;
    this.epsilon = options.epsilon || 1.0;           // Initial exploration rate
    this.epsilonMin = options.epsilonMin || 0.01;   // Minimum exploration rate
    this.epsilonDecay = options.epsilonDecay || 0.995; // Decay rate per episode
    
    // Experience replay
    this.experienceBuffer = [];
    this.maxBufferSize = options.maxBufferSize || 10000;
    this.batchSize = options.batchSize || 32;
    this.useExperienceReplay = options.useExperienceReplay !== false;
    
    // Number of actions (8 directions)
    this.numActions = 8;
    
    // Training statistics
    this.episodeCount = 0;
    this.totalSteps = 0;
    this.totalReward = 0;
    this.successfulEpisodes = 0;
    this.recentRewards = [];
    this.recentSteps = [];
    
    // Pre-trained policies cache
    this.policyCache = new Map(); // startId -> goalId -> path
  }

  /**
   * Get Q-value for a state-action pair
   * @param {string} stateKey - State key
   * @param {number} action - Action index
   * @returns {number} Q-value
   */
  getQValue(stateKey, action) {
    if (!this.qTable.has(stateKey)) {
      this.qTable.set(stateKey, new Map());
    }
    const stateActions = this.qTable.get(stateKey);
    return stateActions.get(action) || 0;
  }

  /**
   * Set Q-value for a state-action pair
   * @param {string} stateKey - State key
   * @param {number} action - Action index
   * @param {number} value - Q-value to set
   */
  setQValue(stateKey, action, value) {
    if (!this.qTable.has(stateKey)) {
      this.qTable.set(stateKey, new Map());
    }
    this.qTable.get(stateKey).set(action, value);
  }

  /**
   * Get best action for a state
   * @param {string} stateKey - State key
   * @param {Array} validActions - List of valid action indices
   * @returns {number} Best action index
   */
  getBestAction(stateKey, validActions) {
    if (!validActions || validActions.length === 0) {
      return 0; // Default action
    }

    let bestAction = validActions[0];
    let bestValue = this.getQValue(stateKey, bestAction);

    for (const action of validActions) {
      const value = this.getQValue(stateKey, action);
      if (value > bestValue) {
        bestValue = value;
        bestAction = action;
      }
    }

    return bestAction;
  }

  /**
   * Select action using epsilon-greedy policy
   * @param {string} stateKey - State key
   * @param {Array} validActions - List of valid action indices
   * @returns {number} Selected action index
   */
  selectAction(stateKey, validActions) {
    if (!validActions || validActions.length === 0) {
      return 0;
    }

    // Exploration: random action
    if (Math.random() < this.epsilon) {
      return validActions[Math.floor(Math.random() * validActions.length)];
    }

    // Exploitation: best known action
    return this.getBestAction(stateKey, validActions);
  }

  /**
   * Update Q-value based on experience
   * @param {string} stateKey - Current state key
   * @param {number} action - Action taken
   * @param {number} reward - Reward received
   * @param {string} nextStateKey - Next state key
   * @param {Array} nextValidActions - Valid actions from next state
   * @param {boolean} done - Whether episode is done
   */
  update(stateKey, action, reward, nextStateKey, nextValidActions, done) {
    const currentQ = this.getQValue(stateKey, action);
    
    let targetQ;
    if (done) {
      targetQ = reward;
    } else {
      // Get max Q-value for next state
      const nextBestAction = this.getBestAction(nextStateKey, nextValidActions);
      const nextMaxQ = this.getQValue(nextStateKey, nextBestAction);
      targetQ = reward + this.discountFactor * nextMaxQ;
    }

    // Q-learning update
    const newQ = currentQ + this.learningRate * (targetQ - currentQ);
    this.setQValue(stateKey, action, newQ);
  }

  /**
   * Store experience in replay buffer
   * @param {Object} experience - Experience tuple
   */
  storeExperience(experience) {
    if (!this.useExperienceReplay) return;

    this.experienceBuffer.push(experience);
    
    // Remove oldest experiences if buffer is full
    while (this.experienceBuffer.length > this.maxBufferSize) {
      this.experienceBuffer.shift();
    }
  }

  /**
   * Learn from a batch of experiences
   */
  replayExperience() {
    if (!this.useExperienceReplay || this.experienceBuffer.length < this.batchSize) {
      return;
    }

    // Sample random batch
    const batch = [];
    for (let i = 0; i < this.batchSize; i++) {
      const index = Math.floor(Math.random() * this.experienceBuffer.length);
      batch.push(this.experienceBuffer[index]);
    }

    // Update Q-values from batch
    for (const exp of batch) {
      this.update(
        exp.stateKey,
        exp.action,
        exp.reward,
        exp.nextStateKey,
        exp.nextValidActions,
        exp.done
      );
    }
  }

  /**
   * Train for one episode
   * @param {RLEnvironment} env - The environment
   * @param {Object} params - Training parameters
   * @returns {Object} Episode results
   */
  trainEpisode(env, params) {
    const { startX, startY, goalId } = params;
    
    let state = env.reset({ startX, startY, goalId });
    let stateKey = env.getStateKey();
    let totalReward = 0;
    let steps = 0;
    let done = false;

    while (!done) {
      // Select action
      const action = this.selectAction(stateKey, state.validActions);
      
      // Take action
      const result = env.step(action);
      const nextStateKey = env.getStateKey();
      
      // Store experience
      this.storeExperience({
        stateKey,
        action,
        reward: result.reward,
        nextStateKey,
        nextValidActions: result.state.validActions,
        done: result.done
      });
      
      // Update Q-value
      this.update(
        stateKey,
        action,
        result.reward,
        nextStateKey,
        result.state.validActions,
        result.done
      );
      
      // Experience replay
      if (steps % 4 === 0) {
        this.replayExperience();
      }
      
      totalReward += result.reward;
      steps++;
      stateKey = nextStateKey;
      state = result.state;
      done = result.done;
    }

    // Decay epsilon
    this.epsilon = Math.max(this.epsilonMin, this.epsilon * this.epsilonDecay);
    
    // Update statistics
    this.episodeCount++;
    this.totalSteps += steps;
    this.totalReward += totalReward;
    if (env.path[env.path.length - 1].x === env.goalX && 
        env.path[env.path.length - 1].y === env.goalY) {
      this.successfulEpisodes++;
    }
    
    // Track recent performance
    this.recentRewards.push(totalReward);
    this.recentSteps.push(steps);
    if (this.recentRewards.length > 100) {
      this.recentRewards.shift();
      this.recentSteps.shift();
    }

    return {
      steps,
      totalReward,
      success: env.path[env.path.length - 1].x === env.goalX && 
               env.path[env.path.length - 1].y === env.goalY,
      path: env.getPath(),
      epsilon: this.epsilon
    };
  }

  /**
   * Find path using learned policy (inference mode)
   * @param {RLEnvironment} env - The environment
   * @param {Object} params - Path parameters
   * @returns {Object} Path result
   */
  findPath(env, params) {
    const { startX, startY, goalId } = params;
    
    let state = env.reset({ startX, startY, goalId });
    let stateKey = env.getStateKey();
    let steps = 0;
    const maxInferenceSteps = 500;

    while (!env.done && steps < maxInferenceSteps) {
      // Use best action (no exploration)
      const action = this.getBestAction(stateKey, state.validActions);
      
      const result = env.step(action);
      stateKey = env.getStateKey();
      state = result.state;
      steps++;
    }

    return {
      success: env.path[env.path.length - 1].x === env.goalX && 
               env.path[env.path.length - 1].y === env.goalY,
      path: env.getPath(),
      pathInPixels: env.getPathInPixels(),
      steps,
      goalReached: env.done && steps < maxInferenceSteps
    };
  }

  /**
   * Get training statistics
   * @returns {Object} Statistics
   */
  getStats() {
    const avgRecentReward = this.recentRewards.length > 0
      ? this.recentRewards.reduce((a, b) => a + b, 0) / this.recentRewards.length
      : 0;
    
    const avgRecentSteps = this.recentSteps.length > 0
      ? this.recentSteps.reduce((a, b) => a + b, 0) / this.recentSteps.length
      : 0;

    return {
      episodeCount: this.episodeCount,
      totalSteps: this.totalSteps,
      totalReward: this.totalReward,
      successfulEpisodes: this.successfulEpisodes,
      successRate: this.episodeCount > 0 
        ? ((this.successfulEpisodes / this.episodeCount) * 100).toFixed(2) + '%'
        : '0%',
      epsilon: this.epsilon.toFixed(4),
      qTableSize: this.qTable.size,
      experienceBufferSize: this.experienceBuffer.length,
      avgRecentReward: avgRecentReward.toFixed(2),
      avgRecentSteps: avgRecentSteps.toFixed(2)
    };
  }

  /**
   * Export Q-table for persistence
   * @returns {Object} Serializable Q-table
   */
  exportQTable() {
    const exported = {};
    
    for (const [stateKey, actions] of this.qTable) {
      exported[stateKey] = Object.fromEntries(actions);
    }
    
    return {
      qTable: exported,
      epsilon: this.epsilon,
      episodeCount: this.episodeCount,
      successfulEpisodes: this.successfulEpisodes,
      learningRate: this.learningRate,
      discountFactor: this.discountFactor,
      timestamp: Date.now()
    };
  }

  /**
   * Import Q-table from saved data
   * @param {Object} data - Saved Q-table data
   */
  importQTable(data) {
    this.qTable.clear();
    
    for (const [stateKey, actions] of Object.entries(data.qTable)) {
      const actionMap = new Map(Object.entries(actions).map(([k, v]) => [parseInt(k), v]));
      this.qTable.set(stateKey, actionMap);
    }
    
    if (data.epsilon !== undefined) this.epsilon = data.epsilon;
    if (data.episodeCount !== undefined) this.episodeCount = data.episodeCount;
    if (data.successfulEpisodes !== undefined) this.successfulEpisodes = data.successfulEpisodes;
    
    console.log(`Imported Q-table with ${this.qTable.size} states`);
  }

  /**
   * Clear all learned data
   */
  reset() {
    this.qTable.clear();
    this.experienceBuffer = [];
    this.episodeCount = 0;
    this.totalSteps = 0;
    this.totalReward = 0;
    this.successfulEpisodes = 0;
    this.recentRewards = [];
    this.recentSteps = [];
    this.epsilon = 1.0;
  }

  /**
   * Cache a learned policy for fast inference
   * @param {string} startId - Start location ID
   * @param {string} goalId - Goal location ID
   * @param {Array} path - Learned path
   */
  cachePolicy(startId, goalId, path) {
    if (!this.policyCache.has(startId)) {
      this.policyCache.set(startId, new Map());
    }
    this.policyCache.get(startId).set(goalId, path);
  }

  /**
   * Get cached policy if available
   * @param {string} startId - Start location ID
   * @param {string} goalId - Goal location ID
   * @returns {Array|null} Cached path or null
   */
  getCachedPolicy(startId, goalId) {
    if (this.policyCache.has(startId)) {
      return this.policyCache.get(startId).get(goalId) || null;
    }
    return null;
  }

  /**
   * Get summary of learning progress
   * @returns {Object} Learning summary
   */
  getLearningProgress() {
    const windowSize = 50;
    const recentSuccess = this.recentSteps.slice(-windowSize);
    const earlySuccess = this.recentSteps.slice(0, windowSize);
    
    let improvement = 0;
    if (earlySuccess.length > 0 && recentSuccess.length > 0) {
      const earlyAvg = earlySuccess.reduce((a, b) => a + b, 0) / earlySuccess.length;
      const recentAvg = recentSuccess.reduce((a, b) => a + b, 0) / recentSuccess.length;
      improvement = ((earlyAvg - recentAvg) / earlyAvg * 100);
    }

    return {
      episodesCompleted: this.episodeCount,
      learningImprovement: improvement.toFixed(2) + '%',
      explorationRate: (this.epsilon * 100).toFixed(2) + '%',
      knowledgeBase: this.qTable.size + ' states',
      convergenceProgress: Math.min(100, (1 - this.epsilon) * 100).toFixed(1) + '%'
    };
  }
}

module.exports = SpaceRLAgent;

