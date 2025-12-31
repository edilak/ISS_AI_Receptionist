const fs = require('fs');
const path = require('path');

// Test route reversal logic
const floorPlanPath = path.join(__dirname, '../server/data/hsitp_floorPlans.json');
const floorPlanData = JSON.parse(fs.readFileSync(floorPlanPath, 'utf8'));

const floor1 = floorPlanData.floors.find(f => f.floor === 1);
const route = floor1.paths.find(p => 
  (p.from === 'hsitp_lift_lobby_1' && p.to === 'hsitp_lav_f_1') ||
  (p.from === 'hsitp_lav_f_1' && p.to === 'hsitp_lift_lobby_1')
);

console.log('=== Route Test ===');
console.log('Route found:', route ? 'YES' : 'NO');
if (route) {
  console.log('Defined as:', route.from, '→', route.to);
  console.log('Original waypoints:');
  route.waypoints.forEach((wp, i) => {
    console.log(`  ${i+1}. (${wp.pixelX.toFixed(2)}, ${wp.pixelY.toFixed(2)})`);
  });
  
  // Test forward direction (lift_lobby → lav_f)
  console.log('\n--- Forward direction (lift_lobby → lav_f) ---');
  const isReversedForward = route.from === 'hsitp_lav_f_1' && route.to === 'hsitp_lift_lobby_1';
  const waypointsForward = isReversedForward ? [...route.waypoints].reverse() : route.waypoints;
  console.log('Is reversed:', isReversedForward);
  console.log('Waypoints to use:');
  waypointsForward.forEach((wp, i) => {
    console.log(`  ${i+1}. (${wp.pixelX.toFixed(2)}, ${wp.pixelY.toFixed(2)})`);
  });
  
  // Test reverse direction (lav_f → lift_lobby)
  console.log('\n--- Reverse direction (lav_f → lift_lobby) ---');
  const isReversedReverse = route.from === 'hsitp_lift_lobby_1' && route.to === 'hsitp_lav_f_1';
  const waypointsReverse = isReversedReverse ? [...route.waypoints].reverse() : route.waypoints;
  console.log('Is reversed:', isReversedReverse);
  console.log('Waypoints to use:');
  waypointsReverse.forEach((wp, i) => {
    console.log(`  ${i+1}. (${wp.pixelX.toFixed(2)}, ${wp.pixelY.toFixed(2)})`);
  });
}

