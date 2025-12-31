/**
 * Performance Monitoring and Analytics
 * 
 * Tracks:
 * - Response times
 * - Path quality metrics
 * - RL learning progress
 * - User satisfaction
 * - System health
 */

class PerformanceMonitor {
  constructor() {
    this.metrics = {
      pathfinding: {
        requests: [],
        avgResponseTime: 0,
        avgNodesExplored: 0,
        avgPathLength: 0,
        cacheHitRate: 0
      },
      rl: {
        episodes: 0,
        avgReward: 0,
        explorationRate: 0,
        qTableSize: 0
      },
      instructions: {
        requests: [],
        avgGenerationTime: 0,
        aiGenerated: 0,
        ruleBased: 0
      },
      visualization: {
        requests: [],
        avgGenerationTime: 0
      },
      errors: []
    };

    this.startTime = Date.now();
    this.requestCount = 0;
  }

  /**
   * Record pathfinding request
   */
  recordPathfinding(startTime, result, cacheHit = false) {
    const duration = Date.now() - startTime;
    this.requestCount++;

    this.metrics.pathfinding.requests.push({
      timestamp: Date.now(),
      duration,
      success: result.success,
      nodesExplored: result.nodesExplored || 0,
      pathLength: result.path?.length || 0,
      distance: result.distance || 0,
      cacheHit
    });

    // Update averages
    const requests = this.metrics.pathfinding.requests;
    this.metrics.pathfinding.avgResponseTime = 
      requests.reduce((sum, r) => sum + r.duration, 0) / requests.length;
    this.metrics.pathfinding.avgNodesExplored = 
      requests.reduce((sum, r) => sum + r.nodesExplored, 0) / requests.length;
    this.metrics.pathfinding.avgPathLength = 
      requests.reduce((sum, r) => sum + r.pathLength, 0) / requests.length;
    
    const cacheHits = requests.filter(r => r.cacheHit).length;
    this.metrics.pathfinding.cacheHitRate = cacheHits / requests.length;
  }

  /**
   * Record RL statistics
   */
  recordRLStats(stats) {
    this.metrics.rl = {
      episodes: stats.totalEpisodes || 0,
      avgReward: stats.avgReward || 0,
      explorationRate: stats.explorationRate || 0,
      qTableSize: stats.qTableSize || 0,
      experienceReplaySize: stats.experienceReplaySize || 0
    };
  }

  /**
   * Record instruction generation
   */
  recordInstructionGeneration(startTime, type, success) {
    const duration = Date.now() - startTime;
    
    this.metrics.instructions.requests.push({
      timestamp: Date.now(),
      duration,
      type,
      success
    });

    if (type === 'ai-generated') {
      this.metrics.instructions.aiGenerated++;
    } else {
      this.metrics.instructions.ruleBased++;
    }

    const requests = this.metrics.instructions.requests;
    this.metrics.instructions.avgGenerationTime = 
      requests.reduce((sum, r) => sum + r.duration, 0) / requests.length;
  }

  /**
   * Record visualization generation
   */
  recordVisualization(startTime) {
    const duration = Date.now() - startTime;
    
    this.metrics.visualization.requests.push({
      timestamp: Date.now(),
      duration
    });

    const requests = this.metrics.visualization.requests;
    this.metrics.visualization.avgGenerationTime = 
      requests.reduce((sum, r) => sum + r.duration, 0) / requests.length;
  }

  /**
   * Record error
   */
  recordError(error, context = {}) {
    this.metrics.errors.push({
      timestamp: Date.now(),
      error: error.message || error,
      stack: error.stack,
      context
    });

    // Keep only last 100 errors
    if (this.metrics.errors.length > 100) {
      this.metrics.errors.shift();
    }
  }

  /**
   * Get performance summary
   */
  getSummary() {
    const uptime = Date.now() - this.startTime;
    
    return {
      uptime: Math.floor(uptime / 1000), // seconds
      totalRequests: this.requestCount,
      pathfinding: {
        totalRequests: this.metrics.pathfinding.requests.length,
        avgResponseTime: this.metrics.pathfinding.avgResponseTime.toFixed(2) + 'ms',
        avgNodesExplored: this.metrics.pathfinding.avgNodesExplored.toFixed(1),
        avgPathLength: this.metrics.pathfinding.avgPathLength.toFixed(1),
        cacheHitRate: (this.metrics.pathfinding.cacheHitRate * 100).toFixed(1) + '%',
        successRate: this.getSuccessRate()
      },
      rl: {
        ...this.metrics.rl,
        explorationRate: (this.metrics.rl.explorationRate * 100).toFixed(1) + '%'
      },
      instructions: {
        totalRequests: this.metrics.instructions.requests.length,
        avgGenerationTime: this.metrics.instructions.avgGenerationTime.toFixed(2) + 'ms',
        aiGenerated: this.metrics.instructions.aiGenerated,
        ruleBased: this.metrics.instructions.ruleBased,
        aiUsageRate: this.getAIUsageRate()
      },
      visualization: {
        totalRequests: this.metrics.visualization.requests.length,
        avgGenerationTime: this.metrics.visualization.avgGenerationTime.toFixed(2) + 'ms'
      },
      errors: {
        total: this.metrics.errors.length,
        recent: this.metrics.errors.slice(-5)
      }
    };
  }

  /**
   * Get success rate
   */
  getSuccessRate() {
    const requests = this.metrics.pathfinding.requests;
    if (requests.length === 0) return '0%';
    const successful = requests.filter(r => r.success).length;
    return ((successful / requests.length) * 100).toFixed(1) + '%';
  }

  /**
   * Get AI usage rate
   */
  getAIUsageRate() {
    const total = this.metrics.instructions.aiGenerated + this.metrics.instructions.ruleBased;
    if (total === 0) return '0%';
    return ((this.metrics.instructions.aiGenerated / total) * 100).toFixed(1) + '%';
  }

  /**
   * Get performance trends (last N requests)
   */
  getTrends(n = 50) {
    const pathfinding = this.metrics.pathfinding.requests.slice(-n);
    const instructions = this.metrics.instructions.requests.slice(-n);
    
    return {
      pathfinding: {
        responseTimeTrend: pathfinding.map(r => r.duration),
        nodesExploredTrend: pathfinding.map(r => r.nodesExplored),
        pathLengthTrend: pathfinding.map(r => r.pathLength)
      },
      instructions: {
        generationTimeTrend: instructions.map(r => r.duration),
        typeTrend: instructions.map(r => r.type)
      }
    };
  }

  /**
   * Get health status
   */
  getHealthStatus() {
    const summary = this.getSummary();
    
    const health = {
      status: 'healthy',
      issues: [],
      warnings: []
    };

    // Check response times
    if (summary.pathfinding.avgResponseTime > 1000) {
      health.status = 'degraded';
      health.warnings.push('High pathfinding response time');
    }

    // Check error rate
    const errorRate = this.metrics.errors.length / Math.max(1, this.requestCount);
    if (errorRate > 0.1) {
      health.status = 'unhealthy';
      health.issues.push('High error rate: ' + (errorRate * 100).toFixed(1) + '%');
    }

    // Check cache hit rate
    if (summary.pathfinding.cacheHitRate < 0.3 && this.requestCount > 100) {
      health.warnings.push('Low cache hit rate');
    }

    // Check RL learning
    if (this.metrics.rl.episodes > 100 && this.metrics.rl.avgReward < 0) {
      health.warnings.push('RL agent not learning effectively');
    }

    return health;
  }

  /**
   * Reset metrics
   */
  reset() {
    this.metrics = {
      pathfinding: { requests: [], avgResponseTime: 0, avgNodesExplored: 0, avgPathLength: 0, cacheHitRate: 0 },
      rl: { episodes: 0, avgReward: 0, explorationRate: 0, qTableSize: 0 },
      instructions: { requests: [], avgGenerationTime: 0, aiGenerated: 0, ruleBased: 0 },
      visualization: { requests: [], avgGenerationTime: 0 },
      errors: []
    };
    this.requestCount = 0;
    this.startTime = Date.now();
  }

  /**
   * Export metrics for analysis
   */
  exportMetrics() {
    return {
      ...this.metrics,
      summary: this.getSummary(),
      health: this.getHealthStatus(),
      trends: this.getTrends()
    };
  }
}

// Singleton instance
let instance = null;

module.exports = {
  PerformanceMonitor,
  getInstance: () => {
    if (!instance) {
      instance = new PerformanceMonitor();
    }
    return instance;
  }
};

