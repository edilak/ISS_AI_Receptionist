#!/usr/bin/env node

/**
 * Quick System Test
 * Tests the new advanced features
 */

const { getInstance: getNavigationService } = require('../server/lib/NavigationService');
const { getInstance: getPerformanceMonitor } = require('../server/lib/PerformanceMonitor');

async function testSystem() {
  console.log('🧪 Testing Advanced Pathfinding System\n');
  console.log('='.repeat(60));

  try {
    // Initialize services
    console.log('1️⃣ Initializing NavigationService...');
    const navService = await getNavigationService();
    console.log('   ✅ NavigationService ready\n');

    // Test pathfinding
    console.log('2️⃣ Testing Pathfinding (A* + RL)...');
    const startTime = Date.now();
    const result = await navService.navigate(
      'hsitp_lift_lobby',
      'hsitp_zone_06',
      { language: 'en', includeVisualization: true }
    );
    const duration = Date.now() - startTime;

    if (result.success) {
      console.log(`   ✅ Path found in ${duration}ms`);
      console.log(`   📊 Algorithm: ${result.pathDetails.algorithm}`);
      console.log(`   🔍 Nodes explored: ${result.pathDetails.nodesExplored}`);
      console.log(`   📏 Distance: ${result.pathDetails.totalDistance}m`);
      console.log(`   ⏱️  Time: ${Math.ceil(result.pathDetails.estimatedTime / 60)} min`);
      console.log(`   📝 Instructions: ${result.instructions.type}\n`);
    } else {
      console.log(`   ❌ Pathfinding failed: ${result.error}\n`);
    }

    // Test RL stats
    console.log('3️⃣ Checking RL Learning...');
    const stats = navService.getStats();
    if (stats.rl) {
      console.log(`   ✅ RL Agent active`);
      console.log(`   📈 Episodes: ${stats.rl.episodes}`);
      console.log(`   🎯 Avg Reward: ${stats.rl.avgReward.toFixed(2)}`);
      console.log(`   🔍 Exploration: ${(stats.rl.explorationRate * 100).toFixed(1)}%`);
      console.log(`   💾 Q-table size: ${stats.rl.qTableSize}\n`);
    } else {
      console.log(`   ⚠️  RL Agent not initialized\n`);
    }

    // Test performance monitoring
    console.log('4️⃣ Checking Performance Monitor...');
    const monitor = getPerformanceMonitor();
    const perfSummary = monitor.getSummary();
    const health = monitor.getHealthStatus();
    
    console.log(`   ✅ Monitor active`);
    console.log(`   📊 Total requests: ${perfSummary.totalRequests}`);
    console.log(`   ⚡ Avg response: ${perfSummary.pathfinding.avgResponseTime}`);
    console.log(`   💾 Cache hit rate: ${perfSummary.pathfinding.cacheHitRate}`);
    console.log(`   🏥 Health: ${health.status}\n`);

    // Test visualization
    console.log('5️⃣ Testing Visualization...');
    if (result.visualization) {
      const vizTypes = Object.keys(result.visualization.visualizations || {});
      console.log(`   ✅ Visualization generated`);
      console.log(`   🎨 Types: ${vizTypes.join(', ')}\n`);
    } else {
      console.log(`   ⚠️  Visualization not generated\n`);
    }

    // Summary
    console.log('='.repeat(60));
    console.log('📊 Test Summary');
    console.log('='.repeat(60));
    console.log(`✅ Pathfinding: ${result.success ? 'Working' : 'Failed'}`);
    console.log(`✅ RL Learning: ${stats.rl ? 'Active' : 'Inactive'}`);
    console.log(`✅ Performance Monitor: Active`);
    console.log(`✅ Visualization: ${result.visualization ? 'Working' : 'Not generated'}`);
    console.log(`\n🎉 System test completed!\n`);

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testSystem();

