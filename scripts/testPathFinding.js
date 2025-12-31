const axios = require('axios');

async function testPathFinding() {
  const API_URL = 'http://localhost:5000/api/pathfinder/find-path';
  
  const testCases = [
    { from: 'zone 3', to: 'zone 1' },
    { from: 'zone 3', to: 'zone 1 1 floor' },
    { from: 'Zone 03', to: 'Zone 01' },
    { from: 'hsitp_zone_03', to: 'hsitp_zone_01' }
  ];

  console.log('Testing Path Finding...');

  for (const test of testCases) {
    try {
      console.log(`\nTesting: "${test.from}" -> "${test.to}"`);
      const response = await axios.post(API_URL, test);
      
      if (response.status === 200) {
        console.log('✅ Success!');
        console.log(`  From: ${response.data.from.name} (${response.data.from.id})`);
        console.log(`  To: ${response.data.to.name} (${response.data.to.id})`);
        console.log(`  Distance: ${response.data.totalDistance}`);
        console.log(`  Steps: ${response.data.path.length}`);
      }
    } catch (error) {
      console.log('❌ Failed');
      if (error.response) {
        console.log(`  Status: ${error.response.status}`);
        console.log(`  Error: ${JSON.stringify(error.response.data)}`);
      } else {
        console.log(`  Error: ${error.message}`);
      }
    }
  }
}

testPathFinding();
