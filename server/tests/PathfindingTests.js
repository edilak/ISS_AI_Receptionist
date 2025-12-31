/**
 * Comprehensive Pathfinding Test Suite
 * 
 * Tests:
 * - Algorithm correctness
 * - Performance benchmarks
 * - RL learning progress
 * - Response quality
 * - Edge cases
 */

const PathfindingEngine = require('../lib/PathfindingEngine');
const AdvancedRLAgent = require('../lib/AdvancedRLAgent');
const InstructionGenerator = require('../lib/InstructionGenerator');
const fs = require('fs');
const path = require('path');

class PathfindingTestSuite {
  constructor() {
    this.graph = null;
    this.engine = null;
    this.rlAgent = null;
    this.results = {
      passed: 0,
      failed: 0,
      errors: [],
      performance: [],
      rlProgress: []
    };
  }

  /**
   * Load test data
   */
  loadTestData() {
    const graphPath = path.join(__dirname, '../data/hsitp_locationGraph.json');
    const graphData = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
    this.graph = {
      nodes: graphData.nodes,
      edges: graphData.edges
    };
    
    this.engine = new PathfindingEngine(this.graph);
    this.rlAgent = new AdvancedRLAgent();
    
    console.log('✅ Test data loaded');
  }

  /**
   * Test basic pathfinding correctness
   */
  async testBasicPathfinding() {
    console.log('\n🧪 Testing Basic Pathfinding...');
    
    const testCases = [
      {
        name: 'Same floor path',
        from: 'hsitp_lift_lobby_1',
        to: 'hsitp_zone_06',
        expectedSuccess: true,
        maxDistance: 100
      },
      {
        name: 'Cross-floor path',
        from: 'hsitp_lift_lobby',
        to: 'hsitp_zone_06',
        expectedSuccess: true,
        maxDistance: 200
      },
      {
        name: 'Invalid start',
        from: 'invalid_node',
        to: 'hsitp_zone_06',
        expectedSuccess: false
      },
      {
        name: 'Invalid destination',
        from: 'hsitp_lift_lobby',
        to: 'invalid_node',
        expectedSuccess: false
      },
      {
        name: 'Same location',
        from: 'hsitp_zone_06',
        to: 'hsitp_zone_06',
        expectedSuccess: true,
        maxDistance: 0
      }
    ];

    for (const testCase of testCases) {
      try {
        const result = this.engine.findPath(testCase.from, testCase.to);
        
        const passed = 
          result.success === testCase.expectedSuccess &&
          (!testCase.maxDistance || result.distance <= testCase.maxDistance);
        
        if (passed) {
          this.results.passed++;
          console.log(`  ✅ ${testCase.name}`);
        } else {
          this.results.failed++;
          this.results.errors.push({
            test: testCase.name,
            expected: testCase.expectedSuccess,
            got: result.success,
            distance: result.distance
          });
          console.log(`  ❌ ${testCase.name} - Expected: ${testCase.expectedSuccess}, Got: ${result.success}`);
        }
      } catch (error) {
        this.results.failed++;
        this.results.errors.push({
          test: testCase.name,
          error: error.message
        });
        console.log(`  ❌ ${testCase.name} - Error: ${error.message}`);
      }
    }
  }

  /**
   * Test performance benchmarks
   */
  async testPerformance() {
    console.log('\n⚡ Testing Performance...');
    
    const testRoutes = [
      { from: 'hsitp_lift_lobby', to: 'hsitp_zone_06' },
      { from: 'hsitp_zone_01', to: 'hsitp_zone_07' },
      { from: 'hsitp_main_entrance', to: 'hsitp_zone_05' },
      { from: 'hsitp_lift_lobby_1', to: 'hsitp_pantry_1' },
      { from: 'hsitp_reception', to: 'hsitp_zone_03' }
    ];

    for (const route of testRoutes) {
      const startTime = process.hrtime.bigint();
      const result = this.engine.findPath(route.from, route.to);
      const endTime = process.hrtime.bigint();
      
      const duration = Number(endTime - startTime) / 1_000_000; // Convert to milliseconds
      
      this.results.performance.push({
        route: `${route.from} → ${route.to}`,
        duration: duration,
        nodesExplored: result.nodesExplored || 0,
        pathLength: result.path?.length || 0,
        distance: result.distance || 0,
        success: result.success
      });
      
      console.log(`  ${result.success ? '✅' : '❌'} ${route.from} → ${route.to}: ${duration.toFixed(2)}ms, ${result.nodesExplored || 0} nodes`);
    }

    // Calculate statistics
    const durations = this.results.performance.map(p => p.duration);
    const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
    const maxDuration = Math.max(...durations);
    const minDuration = Math.min(...durations);

    console.log(`\n  Performance Stats:`);
    console.log(`    Average: ${avgDuration.toFixed(2)}ms`);
    console.log(`    Min: ${minDuration.toFixed(2)}ms`);
    console.log(`    Max: ${maxDuration.toFixed(2)}ms`);
  }

  /**
   * Test RL learning progress
   */
  async testRLLearning() {
    console.log('\n🧠 Testing RL Learning...');
    
    // Test route to learn
    const testRoute = {
      from: 'hsitp_lift_lobby_1',
      to: 'hsitp_zone_06'
    };

    const initialStats = this.rlAgent.getStats();
    console.log(`  Initial exploration rate: ${initialStats.explorationRate.toFixed(3)}`);

    // Simulate multiple pathfinding episodes
    const episodes = 50;
    const rewards = [];

    for (let i = 0; i < episodes; i++) {
      const result = this.engine.findPath(testRoute.from, testRoute.to);
      
      if (result.success) {
        const context = this.engine.getNavigationContext(result.path);
        const reward = this.rlAgent.calculateShapedReward(
          { distance: result.distance },
          context
        );
        
        // Update RL agent
        result.path.forEach((node, idx) => {
          if (idx < result.path.length - 1) {
            const nextNode = result.path[idx + 1];
            const neighbors = this.engine.adjacencyList.get(node.id) || [];
            const nextActions = neighbors.map(n => n.nodeId);
            
            this.rlAgent.updateQValue(
              node.id,
              nextNode.id,
              reward / result.path.length,
              nextNode.id,
              nextActions,
              this.graph,
              idx === result.path.length - 2
            );
          }
        });
        
        rewards.push(reward);
        this.rlAgent.updateStats(result.path.length);
      }
      
      if (i % 10 === 0) {
        const stats = this.rlAgent.getStats();
        console.log(`  Episode ${i}: exploration=${stats.explorationRate.toFixed(3)}, avg_reward=${stats.avgReward.toFixed(2)}`);
      }
    }

    const finalStats = this.rlAgent.getStats();
    const avgReward = rewards.reduce((a, b) => a + b, 0) / rewards.length;
    
    this.results.rlProgress.push({
      episodes: episodes,
      initialExploration: initialStats.explorationRate,
      finalExploration: finalStats.explorationRate,
      avgReward: avgReward,
      improvement: finalStats.avgReward > initialStats.avgReward
    });

    console.log(`\n  RL Learning Results:`);
    console.log(`    Episodes: ${episodes}`);
    console.log(`    Exploration rate: ${initialStats.explorationRate.toFixed(3)} → ${finalStats.explorationRate.toFixed(3)}`);
    console.log(`    Average reward: ${avgReward.toFixed(2)}`);
    console.log(`    Learning: ${finalStats.avgReward > initialStats.avgReward ? '✅ Improving' : '⚠️ Needs tuning'}`);
  }

  /**
   * Test instruction generation quality
   */
  async testInstructionQuality() {
    console.log('\n📝 Testing Instruction Quality...');
    
    const instructionGen = new InstructionGenerator();
    const testPath = [
      { id: 'start', name: 'Lift Lobby', floor: 0, x: 100, y: 100, type: 'elevator' },
      { id: 'mid', name: 'Corridor', floor: 1, x: 150, y: 150, type: 'corridor', floorChange: true },
      { id: 'end', name: 'Zone 06', floor: 1, x: 200, y: 200, type: 'zone' }
    ];

    const context = {
      totalDistance: 150,
      estimatedTime: 120,
      floorChanges: [{ from: 0, to: 1, method: 'elevator' }],
      turns: 2,
      landmarks: []
    };

    const languages = ['en', 'zh-HK', 'zh-CN'];
    
    for (const lang of languages) {
      try {
        const instructions = await instructionGen.generateInstructions(
          testPath,
          context,
          { language: lang, forceRuleBased: true }
        );
        
        const hasSteps = instructions.steps && instructions.steps.length > 0;
        const hasSummary = !!instructions.summary;
        const hasTime = instructions.estimatedTime !== undefined;
        
        if (hasSteps && hasSummary && hasTime) {
          this.results.passed++;
          console.log(`  ✅ ${lang.toUpperCase()} instructions generated`);
        } else {
          this.results.failed++;
          console.log(`  ❌ ${lang.toUpperCase()} instructions incomplete`);
        }
      } catch (error) {
        this.results.failed++;
        console.log(`  ❌ ${lang.toUpperCase()} error: ${error.message}`);
      }
    }
  }

  /**
   * Test edge cases
   */
  async testEdgeCases() {
    console.log('\n🔍 Testing Edge Cases...');
    
    const edgeCases = [
      {
        name: 'Very long path',
        from: 'hsitp_main_entrance',
        to: 'hsitp_zone_07_7',
        expectedSuccess: true
      },
      {
        name: 'Isolated node (if exists)',
        from: 'hsitp_lift_lobby',
        to: 'hsitp_lift_lobby',
        expectedSuccess: true
      },
      {
        name: 'Multiple floor changes',
        from: 'hsitp_lift_lobby',
        to: 'hsitp_zone_01_7',
        expectedSuccess: true
      }
    ];

    for (const testCase of edgeCases) {
      try {
        const result = this.engine.findPath(testCase.from, testCase.to);
        
        if (result.success === testCase.expectedSuccess) {
          this.results.passed++;
          console.log(`  ✅ ${testCase.name}`);
        } else {
          this.results.failed++;
          console.log(`  ❌ ${testCase.name}`);
        }
      } catch (error) {
        this.results.failed++;
        console.log(`  ❌ ${testCase.name} - Error: ${error.message}`);
      }
    }
  }

  /**
   * Test cache effectiveness
   */
  async testCacheEffectiveness() {
    console.log('\n💾 Testing Cache Effectiveness...');
    
    const testRoute = {
      from: 'hsitp_lift_lobby_1',
      to: 'hsitp_zone_06'
    };

    // Clear cache
    this.engine.clearCache();

    // First call (cache miss)
    const start1 = process.hrtime.bigint();
    const result1 = this.engine.findPath(testRoute.from, testRoute.to);
    const end1 = process.hrtime.bigint();
    const time1 = Number(end1 - start1) / 1_000_000;

    // Second call (cache hit)
    const start2 = process.hrtime.bigint();
    const result2 = this.engine.findPath(testRoute.from, testRoute.to);
    const end2 = process.hrtime.bigint();
    const time2 = Number(end2 - start2) / 1_000_000;

    const speedup = time1 / time2;
    const stats = this.engine.getStats();

    console.log(`  First call: ${time1.toFixed(2)}ms`);
    console.log(`  Cached call: ${time2.toFixed(2)}ms`);
    console.log(`  Speedup: ${speedup.toFixed(2)}x`);
    console.log(`  Cache hit rate: ${(stats.cacheHitRate * 100).toFixed(1)}%`);

    if (speedup > 2) {
      this.results.passed++;
      console.log(`  ✅ Cache is effective`);
    } else {
      this.results.failed++;
      console.log(`  ⚠️ Cache speedup is low`);
    }
  }

  /**
   * Run all tests
   */
  async runAllTests() {
    console.log('🚀 Starting Pathfinding Test Suite\n');
    console.log('='.repeat(60));

    this.loadTestData();

    await this.testBasicPathfinding();
    await this.testPerformance();
    await this.testRLLearning();
    await this.testInstructionQuality();
    await this.testEdgeCases();
    await this.testCacheEffectiveness();

    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 Test Summary');
    console.log('='.repeat(60));
    console.log(`✅ Passed: ${this.results.passed}`);
    console.log(`❌ Failed: ${this.results.failed}`);
    console.log(`📈 Total: ${this.results.passed + this.results.failed}`);
    
    if (this.results.errors.length > 0) {
      console.log('\n❌ Errors:');
      this.results.errors.forEach(err => {
        console.log(`  - ${err.test}: ${err.error || JSON.stringify(err)}`);
      });
    }

    return this.results;
  }

  /**
   * Generate test report
   */
  generateReport() {
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        passed: this.results.passed,
        failed: this.results.failed,
        total: this.results.passed + this.results.failed,
        passRate: (this.results.passed / (this.results.passed + this.results.failed) * 100).toFixed(1) + '%'
      },
      performance: this.results.performance,
      rlProgress: this.results.rlProgress,
      errors: this.results.errors
    };

    const reportPath = path.join(__dirname, '../data/test_report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n📄 Test report saved to: ${reportPath}`);

    return report;
  }
}

// Run tests if executed directly
if (require.main === module) {
  const suite = new PathfindingTestSuite();
  suite.runAllTests()
    .then(() => suite.generateReport())
    .catch(error => {
      console.error('❌ Test suite failed:', error);
      process.exit(1);
    });
}

module.exports = PathfindingTestSuite;

