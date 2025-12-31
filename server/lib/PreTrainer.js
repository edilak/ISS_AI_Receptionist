/**
 * PreTrainer - Offline training pipeline for RL agent
 * 
 * This module handles pre-training the RL agent on all possible
 * destination pairs to create a comprehensive navigation policy.
 */

const fs = require('fs').promises;
const path = require('path');
const GridGenerator = require('./GridGenerator');
const RLEnvironment = require('./RLEnvironment');
const SpaceRLAgent = require('./SpaceRLAgent');

class PreTrainer {
  constructor(options = {}) {
    this.episodesPerPair = options.episodesPerPair || 100;
    this.maxEpisodesPerPair = options.maxEpisodesPerPair || 500;
    this.convergenceThreshold = options.convergenceThreshold || 0.95; // 95% success rate
    this.checkpointInterval = options.checkpointInterval || 1000; // Save every 1000 episodes
    
    // Training state
    this.isTraining = false;
    this.progress = 0;
    this.currentPhase = '';
    this.totalPairs = 0;
    this.completedPairs = 0;
    
    // Results
    this.results = {
      startTime: null,
      endTime: null,
      totalEpisodes: 0,
      successRate: 0,
      pairsTraied: 0,
      failedPairs: []
    };
    
    // Components
    this.gridGenerator = null;
    this.environment = null;
    this.agent = null;
    
    // Paths
    this.dataDir = path.join(__dirname, '..', 'data', 'rl_policies');
  }

  /**
   * Initialize training components
   * @param {Object} spaceDefinitions - Space definitions from SpaceEditor
   * @param {number} floor - Floor to train for
   * @param {Object} imageSize - Image dimensions
   */
  async initialize(spaceDefinitions, floor, imageSize) {
    this.currentPhase = 'Initializing';
    
    // Create grid generator
    this.gridGenerator = new GridGenerator({ cellSize: spaceDefinitions.gridSize || 10 });
    
    // Generate navigation grid
    const gridData = this.gridGenerator.generate({
      corridors: spaceDefinitions.corridors,
      destinations: spaceDefinitions.destinations,
      imageWidth: imageSize.width,
      imageHeight: imageSize.height,
      floor
    });
    
    console.log('Grid generated:', gridData.stats);
    
    // Validate connectivity
    const connectivity = this.gridGenerator.validateConnectivity();
    if (!connectivity.valid) {
      throw new Error(`Grid connectivity issue: ${connectivity.message}`);
    }
    
    // Create environment
    this.environment = new RLEnvironment(this.gridGenerator);
    
    // Create agent
    this.agent = new SpaceRLAgent({
      learningRate: 0.1,
      discountFactor: 0.95,
      epsilon: 1.0,
      epsilonMin: 0.05,
      epsilonDecay: 0.998,
      useExperienceReplay: true,
      batchSize: 32
    });
    
    // Ensure data directory exists
    await this.ensureDataDir();
    
    return gridData;
  }

  /**
   * Ensure data directory exists
   */
  async ensureDataDir() {
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
  }

  /**
   * Run pre-training for all destination pairs
   * @param {Function} progressCallback - Callback for progress updates
   * @returns {Object} Training results
   */
  async train(progressCallback = null) {
    if (this.isTraining) {
      throw new Error('Training already in progress');
    }
    
    this.isTraining = true;
    this.progress = 0;
    this.results.startTime = Date.now();
    
    try {
      // Get all destinations
      const destinations = Array.from(this.gridGenerator.destinationCells.entries());
      
      if (destinations.length < 2) {
        throw new Error('Need at least 2 destinations to train');
      }
      
      // Generate all unique pairs (both directions)
      const pairs = [];
      for (let i = 0; i < destinations.length; i++) {
        for (let j = 0; j < destinations.length; j++) {
          if (i !== j) {
            pairs.push({
              startId: destinations[i][0],
              startCell: destinations[i][1],
              goalId: destinations[j][0],
              goalCell: destinations[j][1]
            });
          }
        }
      }
      
      this.totalPairs = pairs.length;
      console.log(`Training ${this.totalPairs} destination pairs`);
      
      this.currentPhase = 'Training';
      let totalEpisodes = 0;
      
      // Train each pair
      for (let pairIndex = 0; pairIndex < pairs.length; pairIndex++) {
        const pair = pairs[pairIndex];
        this.completedPairs = pairIndex;
        this.progress = Math.floor((pairIndex / pairs.length) * 100);
        
        if (progressCallback) {
          progressCallback({
            progress: this.progress,
            phase: this.currentPhase,
            currentPair: `${pair.startId} → ${pair.goalId}`,
            completedPairs: pairIndex,
            totalPairs: this.totalPairs
          });
        }
        
        // Train this pair
        const pairResult = await this.trainPair(pair);
        totalEpisodes += pairResult.episodes;
        
        if (!pairResult.success) {
          this.results.failedPairs.push({
            startId: pair.startId,
            goalId: pair.goalId,
            successRate: pairResult.successRate
          });
        }
        
        // Checkpoint periodically
        if (totalEpisodes > 0 && totalEpisodes % this.checkpointInterval === 0) {
          await this.saveCheckpoint();
        }
      }
      
      // Cache all learned policies
      this.currentPhase = 'Caching policies';
      for (const pair of pairs) {
        const pathResult = this.agent.findPath(this.environment, {
          startX: pair.startCell.x,
          startY: pair.startCell.y,
          goalId: pair.goalId
        });
        
        if (pathResult.success) {
          this.agent.cachePolicy(pair.startId, pair.goalId, pathResult.path);
        }
      }
      
      // Final save
      this.currentPhase = 'Saving';
      await this.saveQTable();
      
      // Record results
      this.results.endTime = Date.now();
      this.results.totalEpisodes = totalEpisodes;
      this.results.pairsTraied = pairs.length;
      this.results.successRate = this.agent.getStats().successRate;
      
      this.progress = 100;
      if (progressCallback) {
        progressCallback({
          progress: 100,
          phase: 'Complete',
          results: this.results
        });
      }
      
      return this.results;
      
    } finally {
      this.isTraining = false;
    }
  }

  /**
   * Train a single start-goal pair
   * @param {Object} pair - Pair to train
   * @returns {Object} Training result for this pair
   */
  async trainPair(pair) {
    let successCount = 0;
    let episodes = 0;
    const recentResults = [];
    
    while (episodes < this.maxEpisodesPerPair) {
      // Train one episode
      const result = this.agent.trainEpisode(this.environment, {
        startX: pair.startCell.x,
        startY: pair.startCell.y,
        goalId: pair.goalId
      });
      
      episodes++;
      if (result.success) successCount++;
      
      // Track recent success rate
      recentResults.push(result.success ? 1 : 0);
      if (recentResults.length > 20) recentResults.shift();
      
      // Check convergence
      if (episodes >= this.episodesPerPair) {
        const recentSuccessRate = recentResults.reduce((a, b) => a + b, 0) / recentResults.length;
        if (recentSuccessRate >= this.convergenceThreshold) {
          break;
        }
      }
    }
    
    return {
      success: successCount / episodes >= 0.5,
      successRate: (successCount / episodes * 100).toFixed(2) + '%',
      episodes
    };
  }

  /**
   * Save checkpoint during training
   */
  async saveCheckpoint() {
    const checkpointPath = path.join(this.dataDir, 'checkpoint.json');
    const data = this.agent.exportQTable();
    data.checkpoint = true;
    data.progress = this.progress;
    
    await fs.writeFile(checkpointPath, JSON.stringify(data, null, 2));
    console.log(`Checkpoint saved at ${this.progress}% progress`);
  }

  /**
   * Save final Q-table
   */
  async saveQTable() {
    const qTablePath = path.join(this.dataDir, 'q_table.json');
    const data = this.agent.exportQTable();
    data.trainingResults = this.results;
    
    await fs.writeFile(qTablePath, JSON.stringify(data, null, 2));
    console.log(`Q-table saved with ${this.agent.qTable.size} states`);
  }

  /**
   * Load existing Q-table
   * @returns {boolean} True if loaded successfully
   */
  async loadQTable() {
    try {
      const qTablePath = path.join(this.dataDir, 'q_table.json');
      const data = JSON.parse(await fs.readFile(qTablePath, 'utf8'));
      this.agent.importQTable(data);
      return true;
    } catch (error) {
      console.log('No existing Q-table found');
      return false;
    }
  }

  /**
   * Get training progress
   * @returns {Object} Progress info
   */
  getProgress() {
    return {
      isTraining: this.isTraining,
      progress: this.progress,
      phase: this.currentPhase,
      completedPairs: this.completedPairs,
      totalPairs: this.totalPairs,
      agentStats: this.agent ? this.agent.getStats() : null
    };
  }

  /**
   * Get trained agent
   * @returns {SpaceRLAgent} The trained agent
   */
  getAgent() {
    return this.agent;
  }

  /**
   * Get grid generator
   * @returns {GridGenerator} The grid generator
   */
  getGridGenerator() {
    return this.gridGenerator;
  }

  /**
   * Get environment
   * @returns {RLEnvironment} The environment
   */
  getEnvironment() {
    return this.environment;
  }

  /**
   * Test a specific path after training
   * @param {string} startId - Start destination ID
   * @param {string} goalId - Goal destination ID
   * @returns {Object} Path result
   */
  testPath(startId, goalId) {
    if (!this.agent || !this.environment) {
      throw new Error('Trainer not initialized');
    }
    
    const startDest = this.gridGenerator.destinationCells.get(startId);
    const goalDest = this.gridGenerator.destinationCells.get(goalId);
    
    if (!startDest || !goalDest) {
      throw new Error(`Unknown destination: ${startId} or ${goalId}`);
    }
    
    return this.agent.findPath(this.environment, {
      startX: startDest.x,
      startY: startDest.y,
      goalId
    });
  }

  /**
   * Get all trained paths
   * @returns {Object} All cached policies
   */
  getAllPaths() {
    const paths = {};
    
    for (const [startId, goals] of this.agent.policyCache) {
      paths[startId] = {};
      for (const [goalId, path] of goals) {
        paths[startId][goalId] = {
          pathLength: path.length,
          pixelPath: path.map(p => this.gridGenerator.gridToPixel(p.x, p.y))
        };
      }
    }
    
    return paths;
  }

  /**
   * Benchmark training results
   * @returns {Object} Benchmark results
   */
  benchmark() {
    if (!this.agent || !this.environment) {
      throw new Error('Trainer not initialized');
    }
    
    const destinations = Array.from(this.gridGenerator.destinationCells.entries());
    const results = {
      totalTests: 0,
      successfulTests: 0,
      avgPathLength: 0,
      avgSteps: 0,
      failedPaths: []
    };
    
    let totalPathLength = 0;
    let totalSteps = 0;
    
    for (let i = 0; i < destinations.length; i++) {
      for (let j = 0; j < destinations.length; j++) {
        if (i === j) continue;
        
        const [startId, startCell] = destinations[i];
        const [goalId] = destinations[j];
        
        const pathResult = this.agent.findPath(this.environment, {
          startX: startCell.x,
          startY: startCell.y,
          goalId
        });
        
        results.totalTests++;
        
        if (pathResult.success) {
          results.successfulTests++;
          totalPathLength += pathResult.path.length;
          totalSteps += pathResult.steps;
        } else {
          results.failedPaths.push({ startId, goalId });
        }
      }
    }
    
    results.successRate = ((results.successfulTests / results.totalTests) * 100).toFixed(2) + '%';
    results.avgPathLength = results.successfulTests > 0 
      ? (totalPathLength / results.successfulTests).toFixed(2)
      : 0;
    results.avgSteps = results.successfulTests > 0
      ? (totalSteps / results.successfulTests).toFixed(2)
      : 0;
    
    return results;
  }
}

module.exports = PreTrainer;

