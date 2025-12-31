#!/usr/bin/env node

/**
 * Test Runner Script
 * 
 * Usage: node scripts/runTests.js [--verbose] [--performance] [--rl]
 */

const PathfindingTestSuite = require('../server/tests/PathfindingTests');

const args = process.argv.slice(2);
const verbose = args.includes('--verbose');
const performanceOnly = args.includes('--performance');
const rlOnly = args.includes('--rl');

async function runTests() {
  console.log('🧪 Starting Pathfinding Test Suite\n');
  
  const suite = new PathfindingTestSuite();
  
  try {
    suite.loadTestData();
    
    if (performanceOnly) {
      await suite.testPerformance();
    } else if (rlOnly) {
      await suite.testRLLearning();
    } else {
      await suite.runAllTests();
    }
    
    const report = suite.generateReport();
    
    console.log('\n✅ Tests completed!');
    console.log(`📊 Pass Rate: ${report.summary.passRate}`);
    
    if (report.summary.failed > 0) {
      console.log(`\n⚠️  ${report.summary.failed} test(s) failed`);
      process.exit(1);
    } else {
      process.exit(0);
    }
  } catch (error) {
    console.error('❌ Test suite failed:', error);
    process.exit(1);
  }
}

runTests();

