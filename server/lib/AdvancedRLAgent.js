/**
 * Advanced Reinforcement Learning Agent
 * 
 * Features:
 * - Experience Replay Buffer
 * - Reward Shaping
 * - Multi-objective Optimization
 * - Context-Aware Learning
 * - Epsilon Decay
 * - Neural Network Approximation (Simple MLP)
 */

class ExperienceReplayBuffer {
  constructor(maxSize = 1000) {
    this.buffer = [];
    this.maxSize = maxSize;
  }

  add(state, action, reward, nextState, done) {
    if (this.buffer.length >= this.maxSize) {
      this.buffer.shift(); // Remove oldest
    }
    this.buffer.push({ state, action, reward, nextState, done });
  }

  sample(batchSize) {
    const size = Math.min(batchSize, this.buffer.length);
    const indices = [];
    while (indices.length < size) {
      const idx = Math.floor(Math.random() * this.buffer.length);
      if (!indices.includes(idx)) {
        indices.push(idx);
      }
    }
    return indices.map(i => this.buffer[i]);
  }

  size() {
    return this.buffer.length;
  }

  clear() {
    this.buffer = [];
  }
}

class RewardShaper {
  constructor() {
    this.rewardWeights = {
      distance: -0.1,      // Negative: shorter is better
      time: -0.05,         // Negative: faster is better
      floorChanges: -2.0,  // Negative: avoid floor changes
      turns: -0.3,         // Negative: fewer turns
      accessibility: 1.0,  // Positive: prefer accessible routes
      landmarks: 0.5,      // Positive: passing landmarks is helpful
      congestion: -0.2     // Negative: avoid congested areas
    };
  }

  calculateReward(path, context, userPreferences = {}) {
    let reward = 0;

    // Base reward: inverse of distance (normalized)
    const normalizedDistance = path.distance / 1000; // Assume max 1000m
    reward += this.rewardWeights.distance * normalizedDistance;

    // Time penalty
    const normalizedTime = (context.estimatedTime || 0) / 300; // Assume max 5 min
    reward += this.rewardWeights.time * normalizedTime;

    // Floor change penalty
    reward += this.rewardWeights.floorChanges * (context.floorChanges?.length || 0);

    // Turn penalty
    reward += this.rewardWeights.turns * (context.turns || 0);

    // Accessibility bonus
    if (userPreferences.accessibilityMode) {
      reward += this.rewardWeights.accessibility;
    }

    // Landmark bonus (passing landmarks helps navigation)
    reward += this.rewardWeights.landmarks * (context.landmarks?.length || 0);

    // Congestion penalty (if we had real-time data)
    // reward += this.rewardWeights.congestion * congestionLevel;

    // Success bonus (reaching destination)
    reward += 100;

    return reward;
  }

  updateWeights(feedback) {
    // Adaptive weight adjustment based on user feedback
    if (feedback.positive) {
      // Increase weights for features in successful paths
      Object.keys(this.rewardWeights).forEach(key => {
        if (feedback.features?.[key]) {
          this.rewardWeights[key] *= 1.1;
        }
      });
    }
  }
}

class MultiObjectiveOptimizer {
  constructor() {
    this.objectives = {
      distance: { weight: 0.4, minimize: true },
      time: { weight: 0.3, minimize: true },
      accessibility: { weight: 0.2, maximize: true },
      comfort: { weight: 0.1, maximize: true } // Fewer turns, wider corridors
    };
  }

  evaluatePath(path, context) {
    const scores = {
      distance: 1 / (1 + path.distance / 100), // Normalized
      time: 1 / (1 + (context.estimatedTime || 0) / 60),
      accessibility: context.floorChanges?.some(fc => fc.method === 'elevator') ? 1 : 0.5,
      comfort: 1 / (1 + (context.turns || 0) / 5)
    };

    let totalScore = 0;
    Object.keys(this.objectives).forEach(obj => {
      const { weight, minimize, maximize } = this.objectives[obj];
      const score = minimize ? scores[obj] : (maximize ? scores[obj] : scores[obj]);
      totalScore += weight * score;
    });

    return {
      totalScore,
      breakdown: scores,
      path
    };
  }

  comparePaths(paths) {
    return paths
      .map(path => this.evaluatePath(path.path, path.context))
      .sort((a, b) => b.totalScore - a.totalScore);
  }
}

class ContextAwareRL {
  constructor() {
    this.contextFeatures = {
      timeOfDay: null,      // Morning, afternoon, evening
      dayOfWeek: null,      // Weekday, weekend
      userType: null,       // Visitor, staff, disabled
      weather: null,        // Normal, emergency
      buildingState: null   // Normal, maintenance, emergency
    };
    
    this.contextualQTables = new Map(); // Separate Q-tables per context
  }

  getContextKey() {
    const hour = new Date().getHours();
    const day = new Date().getDay();
    
    return {
      timeOfDay: hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening',
      dayOfWeek: day === 0 || day === 6 ? 'weekend' : 'weekday'
    };
  }

  getQTable(context) {
    const key = JSON.stringify(context);
    if (!this.contextualQTables.has(key)) {
      this.contextualQTables.set(key, new Map());
    }
    return this.contextualQTables.get(key);
  }

  getQValue(state, action, context) {
    const qTable = this.getQTable(context);
    return qTable.get(`${state}:${action}`) || 0;
  }

  updateQValue(state, action, value, context) {
    const qTable = this.getQTable(context);
    qTable.set(`${state}:${action}`, value);
  }
}

class SimpleNeuralNetwork {
  constructor(inputSize, hiddenSizes = [64, 32], outputSize = 1) {
    this.weights = [];
    this.biases = [];
    
    // Initialize weights and biases
    let prevSize = inputSize;
    for (const hiddenSize of hiddenSizes) {
      this.weights.push(this.randomMatrix(prevSize, hiddenSize));
      this.biases.push(this.randomVector(hiddenSize));
      prevSize = hiddenSize;
    }
    this.weights.push(this.randomMatrix(prevSize, outputSize));
    this.biases.push(this.randomVector(outputSize));
    
    this.learningRate = 0.01;
  }

  randomMatrix(rows, cols) {
    return Array(rows).fill(0).map(() => 
      Array(cols).fill(0).map(() => (Math.random() - 0.5) * 0.1)
    );
  }

  randomVector(size) {
    return Array(size).fill(0).map(() => (Math.random() - 0.5) * 0.1);
  }

  relu(x) {
    return Math.max(0, x);
  }

  sigmoid(x) {
    return 1 / (1 + Math.exp(-x));
  }

  forward(input) {
    let activations = input;
    
    for (let i = 0; i < this.weights.length - 1; i++) {
      activations = this.matrixMultiply([activations], this.weights[i])[0];
      activations = activations.map((val, idx) => this.relu(val + this.biases[i][idx]));
    }
    
    // Output layer
    const output = this.matrixMultiply([activations], this.weights[this.weights.length - 1])[0];
    return output.map((val, idx) => val + this.biases[this.biases.length - 1][idx]);
  }

  matrixMultiply(a, b) {
    const result = [];
    for (let i = 0; i < a.length; i++) {
      result[i] = [];
      for (let j = 0; j < b[0].length; j++) {
        let sum = 0;
        for (let k = 0; k < a[0].length; k++) {
          sum += a[i][k] * b[k][j];
        }
        result[i][j] = sum;
      }
    }
    return result;
  }

  // Simplified backpropagation (for learning)
  train(input, target, epochs = 1) {
    for (let epoch = 0; epoch < epochs; epoch++) {
      const output = this.forward(input);
      const error = output.map((o, i) => target[i] - o);
      
      // Simple gradient descent update
      // In production, use proper backpropagation
      for (let i = 0; i < this.weights.length; i++) {
        for (let j = 0; j < this.weights[i].length; j++) {
          for (let k = 0; k < this.weights[i][j].length; k++) {
            this.weights[i][j][k] += this.learningRate * error[0] * input[j];
          }
        }
      }
    }
  }
}

class AdvancedRLAgent {
  constructor(options = {}) {
    this.options = {
      learningRate: 0.1,
      discountFactor: 0.95,
      explorationRate: 0.2,
      explorationDecay: 0.995,
      minExplorationRate: 0.01,
      batchSize: 32,
      replayBufferSize: 1000,
      updateFrequency: 10,
      ...options
    };

    this.experienceReplay = new ExperienceReplayBuffer(this.options.replayBufferSize);
    this.rewardShaper = new RewardShaper();
    this.multiObjectiveOptimizer = new MultiObjectiveOptimizer();
    this.contextAwareRL = new ContextAwareRL();
    
    // Neural network for complex state approximation
    this.qNetwork = new SimpleNeuralNetwork(10, [64, 32], 1); // 10 features -> 1 Q-value
    
    this.stepCount = 0;
    this.totalReward = 0;
    this.episodeRewards = [];
    
    // Statistics
    this.stats = {
      totalEpisodes: 0,
      avgReward: 0,
      avgPathLength: 0,
      explorationRate: this.options.explorationRate,
      qTableSize: 0
    };
  }

  /**
   * Extract state features for neural network
   */
  extractStateFeatures(state, action, graph) {
    // Features: [distance_to_goal, floor_diff, node_type, edge_weight, 
    //            num_neighbors, is_landmark, accessibility_score, 
    //            congestion_estimate, time_of_day, day_of_week]
    
    const node = graph.nodes.find(n => n.id === state);
    const actionNode = graph.nodes.find(n => n.id === action);
    
    if (!node || !actionNode) {
      return Array(10).fill(0);
    }

    const features = [
      Math.sqrt(Math.pow(actionNode.x - node.x, 2) + Math.pow(actionNode.y - node.y, 2)) / 100, // Normalized distance
      Math.abs(actionNode.floor - node.floor) / 10, // Floor difference
      this.getNodeTypeEncoding(node.type), // Node type (0-1)
      this.getEdgeWeight(state, action, graph) / 100, // Normalized edge weight
      this.getNeighborCount(state, graph) / 20, // Normalized neighbor count
      this.isLandmark(node) ? 1 : 0, // Is landmark
      this.getAccessibilityScore(node, actionNode), // Accessibility (0-1)
      0.5, // Congestion estimate (placeholder)
      new Date().getHours() / 24, // Time of day (0-1)
      new Date().getDay() / 7 // Day of week (0-1)
    ];

    return features;
  }

  getNodeTypeEncoding(type) {
    const types = ['entrance', 'reception', 'lobby', 'elevator', 'stairs', 'corridor', 'zone', 'facility'];
    return types.indexOf(type) / types.length;
  }

  getEdgeWeight(from, to, graph) {
    const edge = graph.edges.find(e => 
      (e.from === from && e.to === to) || (e.from === to && e.to === from)
    );
    return edge?.weight || 100;
  }

  getNeighborCount(nodeId, graph) {
    return graph.edges.filter(e => e.from === nodeId || e.to === nodeId).length;
  }

  isLandmark(node) {
    return ['entrance', 'elevator', 'stairs', 'reception', 'lobby'].includes(node.type);
  }

  getAccessibilityScore(node1, node2) {
    // Higher score if both nodes are accessible
    const accessibleTypes = ['elevator', 'lobby', 'corridor'];
    const score1 = accessibleTypes.includes(node1.type) ? 1 : 0.5;
    const score2 = accessibleTypes.includes(node2.type) ? 1 : 0.5;
    return (score1 + score2) / 2;
  }

  /**
   * Get Q-value using neural network or Q-table
   * Includes heuristic-based initialization for better initial performance
   */
  getQValue(state, action, graph, useNeuralNetwork = false) {
    if (useNeuralNetwork) {
      const features = this.extractStateFeatures(state, action, graph);
      const output = this.qNetwork.forward(features);
      return output[0];
    }

    // Use context-aware Q-table
    const context = this.contextAwareRL.getContextKey();
    let qValue = this.contextAwareRL.getQValue(state, action, context);
    
    // If Q-value is 0 (not learned yet) and we have graph info, use heuristic estimate
    if (qValue === 0 && graph && graph.nodes) {
      const stateNode = graph.nodes.find(n => n.id === state);
      const actionNode = graph.nodes.find(n => n.id === action);
      
      if (stateNode && actionNode) {
        // Use a simple heuristic: prefer actions that move toward common destinations
        // This gives a small positive bias to unexplored actions
        qValue = 0.1; // Small positive initial value to encourage exploration
      }
    }
    
    return qValue;
  }

  /**
   * Update Q-value using experience replay with improved learning
   */
  updateQValue(state, action, reward, nextState, nextActions, graph, done) {
    if (!state || !action) {
      console.warn('⚠️ Invalid state or action in updateQValue');
      return;
    }

    this.stepCount++;
    this.totalReward += reward;

    // Add to experience replay buffer
    this.experienceReplay.add(state, action, reward, nextState, done);

    // Get context
    const context = this.contextAwareRL.getContextKey();

    // Q-Learning update with improved calculation
    const currentQ = this.getQValue(state, action, graph, false);
    
    let maxNextQ = 0;
    if (!done && nextState && nextActions && nextActions.length > 0) {
      // Get max Q-value from next state actions
      const nextQValues = nextActions.map(a => 
        this.getQValue(nextState, a, graph, false)
      ).filter(q => !isNaN(q) && isFinite(q));
      
      if (nextQValues.length > 0) {
        maxNextQ = Math.max(...nextQValues);
      }
    }

    // Q-learning update: Q(s,a) = Q(s,a) + α[r + γ*max(Q(s',a')) - Q(s,a)]
    const targetQ = reward + this.options.discountFactor * maxNextQ;
    const newQ = currentQ + this.options.learningRate * (targetQ - currentQ);

    // Clamp Q-values to reasonable range to prevent explosion
    const clampedQ = Math.max(-1000, Math.min(1000, newQ));

    this.contextAwareRL.updateQValue(state, action, clampedQ, context);

    // Train neural network periodically
    if (this.stepCount % this.options.updateFrequency === 0 && 
        this.experienceReplay.size() >= this.options.batchSize) {
      try {
        this.trainFromReplay(graph);
      } catch (error) {
        console.warn(`⚠️ Error in trainFromReplay: ${error.message}`);
      }
    }

    // Decay exploration rate (but not too fast)
    if (this.options.explorationRate > this.options.minExplorationRate) {
      // Only decay after some learning has happened
      if (this.stepCount > 50) {
        this.options.explorationRate = Math.max(
          this.options.minExplorationRate,
          this.options.explorationRate * this.options.explorationDecay
        );
        this.stats.explorationRate = this.options.explorationRate;
      }
    }
  }

  /**
   * Train neural network from experience replay
   */
  trainFromReplay(graph) {
    const batch = this.experienceReplay.sample(this.options.batchSize);
    
    batch.forEach(experience => {
      const { state, action, reward, nextState } = experience;
      
      // Get current Q-value prediction
      const features = this.extractStateFeatures(state, action, graph);
      const currentQ = this.qNetwork.forward(features)[0];
      
      // Calculate target Q-value
      let targetQ = reward;
      if (!experience.done && nextState) {
        // Estimate max Q for next state (simplified)
        targetQ += this.options.discountFactor * currentQ * 0.9; // Approximation
      }
      
      // Train network
      this.qNetwork.train(features, [targetQ], 1);
    });
  }

  /**
   * Calculate shaped reward for a path
   */
  calculateShapedReward(path, context, userPreferences = {}) {
    return this.rewardShaper.calculateReward(path, context, userPreferences);
  }

  /**
   * Select best action using epsilon-greedy with improved strategy
   */
  selectAction(state, availableActions, graph, useExploration = true) {
    if (!availableActions || availableActions.length === 0) {
      console.warn('⚠️ No available actions for state:', state);
      return null;
    }

    // If only one action, return it
    if (availableActions.length === 1) {
      return availableActions[0];
    }

    // Exploration: random action (with probability based on exploration rate)
    if (useExploration && Math.random() < this.options.explorationRate) {
      const randomIndex = Math.floor(Math.random() * availableActions.length);
      return availableActions[randomIndex];
    }

    // Exploit: best Q-value (with tie-breaking using heuristics if Q-values are equal)
    let bestAction = availableActions[0];
    let bestQ = this.getQValue(state, bestAction, graph, false);
    const candidates = [bestAction]; // Track all actions with best Q-value

    for (let i = 1; i < availableActions.length; i++) {
      const action = availableActions[i];
      const qValue = this.getQValue(state, action, graph, false);
      
      if (qValue > bestQ) {
        bestQ = qValue;
        bestAction = action;
        candidates.length = 0;
        candidates.push(action);
      } else if (qValue === bestQ && Math.abs(qValue) < 0.01) {
        // If Q-values are very close to 0 (unexplored), consider all as candidates
        candidates.push(action);
      }
    }

    // If multiple candidates with same Q-value, use heuristic to break tie
    if (candidates.length > 1 && graph && graph.nodes) {
      // Find the state node to calculate distances
      const stateNode = graph.nodes.find(n => n.id === state);
      if (stateNode) {
        // Prefer actions that are closer (heuristic: shorter edges are often better)
        candidates.sort((a, b) => {
          const nodeA = graph.nodes.find(n => n.id === a);
          const nodeB = graph.nodes.find(n => n.id === b);
          if (!nodeA || !nodeB) return 0;
          
          const distA = Math.sqrt(
            Math.pow(nodeA.x - stateNode.x, 2) + 
            Math.pow(nodeA.y - stateNode.y, 2)
          );
          const distB = Math.sqrt(
            Math.pow(nodeB.x - stateNode.x, 2) + 
            Math.pow(nodeB.y - stateNode.y, 2)
          );
          return distA - distB;
        });
        bestAction = candidates[0];
      }
    }

    return bestAction;
  }

  /**
   * Optimize multiple paths using multi-objective optimization
   */
  optimizePaths(paths) {
    return this.multiObjectiveOptimizer.comparePaths(paths);
  }

  /**
   * Update statistics
   */
  updateStats(pathLength) {
    this.stats.totalEpisodes++;
    this.stats.avgReward = this.totalReward / this.stats.totalEpisodes;
    this.stats.avgPathLength = (
      (this.stats.avgPathLength * (this.stats.totalEpisodes - 1) + pathLength) /
      this.stats.totalEpisodes
    );
    
    const context = this.contextAwareRL.getContextKey();
    const qTable = this.contextAwareRL.getQTable(context);
    this.stats.qTableSize = qTable.size;
  }

  /**
   * Get agent statistics
   */
  getStats() {
    return {
      ...this.stats,
      experienceReplaySize: this.experienceReplay.size(),
      explorationRate: this.options.explorationRate
    };
  }

  /**
   * Export learned parameters
   */
  exportModel() {
    return {
      qTables: Array.from(this.contextAwareRL.contextualQTables.entries()).map(([key, table]) => ({
        context: JSON.parse(key),
        qTable: Object.fromEntries(table)
      })),
      rewardWeights: this.rewardShaper.rewardWeights,
      explorationRate: this.options.explorationRate,
      stats: this.stats
    };
  }

  /**
   * Import learned parameters
   */
  importModel(data) {
    if (data.qTables) {
      data.qTables.forEach(({ context, qTable }) => {
        const table = new Map(Object.entries(qTable));
        this.contextAwareRL.contextualQTables.set(JSON.stringify(context), table);
      });
    }
    
    if (data.rewardWeights) {
      this.rewardShaper.rewardWeights = { ...this.rewardShaper.rewardWeights, ...data.rewardWeights };
    }
    
    if (data.explorationRate !== undefined) {
      this.options.explorationRate = data.explorationRate;
    }
    
    console.log(`📥 Imported RL model: ${data.qTables?.length || 0} context Q-tables`);
  }

  /**
   * Reset for new episode
   */
  resetEpisode() {
    this.episodeRewards.push(this.totalReward);
    this.totalReward = 0;
  }
}

module.exports = AdvancedRLAgent;

