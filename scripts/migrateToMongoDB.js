/**
 * Migrate JSON data in `server/data/` into MongoDB using the Mongoose models.
 *
 * Usage:
 *   - Local (recommended when using docker-compose):
 *       set MONGODB_URI=mongodb://localhost:27017/iss_ai_receptionist
 *       node scripts/migrateToMongoDB.js
 *
 * Notes:
 * - This script is idempotent in the sense it inserts new "versions" (documents)
 *   rather than updating in-place; your runtime code reads the "latest" doc.
 * - It does NOT delete any existing MongoDB data.
 */

const fs = require('fs');
const path = require('path');

const { connectDB, disconnectDB } = require('../server/lib/database');
const { SpaceDefinition, FloorPlan, LocationGraph, RLPolicy } = require('../server/models');

function readJson(relPath) {
  const abs = path.join(__dirname, '..', relPath);
  if (!fs.existsSync(abs)) {
    throw new Error(`Missing file: ${relPath} (expected at ${abs})`);
  }
  const raw = fs.readFileSync(abs, 'utf8');
  return JSON.parse(raw);
}

function normalizeQTable(raw) {
  // RLPolicy schema supports Map<string, Mixed>. The existing JSON sometimes is:
  // - object: { "state": { "action": value } }
  // - object: { "state|action": value }
  // We'll store "as-is" under qTable for maximum compatibility.
  return raw || {};
}

async function migrateSpaceDefinitions() {
  const data = readJson('server/data/space_definitions.json');
  const doc = await SpaceDefinition.updateLatest({
    corridors: data.corridors || [],
    destinations: data.destinations || [],
    gridSize: data.gridSize || 10,
    savedAt: new Date()
  });
  console.log(`✅ space_definitions upserted: ${doc._id}`);
}

async function migrateFloorPlans() {
  const data = readJson('server/data/hsitp_floorPlans.json');
  const doc = await FloorPlan.updateLatest(data);
  console.log(`✅ floor_plans upserted: ${doc._id}`);
}

async function migrateLocationGraph() {
  const data = readJson('server/data/hsitp_locationGraph.json');
  const doc = await LocationGraph.updateLatest({
    name: data.name || 'HSITP Location Graph',
    nodes: data.nodes || [],
    edges: data.edges || [],
    metadata: data.metadata
  });
  console.log(`✅ location_graphs upserted: ${doc._id}`);
}

async function migrateRLPolicies() {
  const qTable = readJson('server/data/rl_policies/q_table.json');
  const checkpoint = readJson('server/data/rl_policies/checkpoint.json');

  // Some repos also keep additional RL artifacts:
  // - server/data/space_rl_model.json
  // - server/data/navigation_qtable.json
  // We'll import them if present.
  const optional = {};
  const spaceModelPath = path.join(__dirname, '..', 'server/data/space_rl_model.json');
  if (fs.existsSync(spaceModelPath)) {
    optional.space_rl_model = JSON.parse(fs.readFileSync(spaceModelPath, 'utf8'));
  }
  const navQPath = path.join(__dirname, '..', 'server/data/navigation_qtable.json');
  if (fs.existsSync(navQPath)) {
    optional.navigation_qtable = JSON.parse(fs.readFileSync(navQPath, 'utf8'));
  }

  const policy = await RLPolicy.savePolicy('default', {
    type: 'q_table',
    qTable: normalizeQTable(qTable),
    stats: {
      importedAt: new Date().toISOString(),
      hasCheckpoint: !!checkpoint,
      ...Object.keys(optional).reduce((acc, k) => {
        acc[k] = true;
        return acc;
      }, {})
    },
    // keep checkpoint + optional artifacts under a Mixed blob
    rewardWeights: {
      checkpoint,
      ...optional
    }
  });

  console.log(`✅ rl_policies saved (active): ${policy._id}`);
}

async function main() {
  console.log('📦 Starting MongoDB migration...');
  console.log(`   MONGODB_URI: ${process.env.MONGODB_URI || '(default: mongodb://localhost:27017/iss_ai_receptionist)'}`);

  await connectDB();

  await migrateSpaceDefinitions();
  await migrateFloorPlans();
  await migrateLocationGraph();
  await migrateRLPolicies();

  await disconnectDB();
  console.log('🎉 Migration completed.');
}

main().catch(async (err) => {
  console.error('❌ Migration failed:', err);
  try {
    await disconnectDB();
  } catch (_) {}
  process.exit(1);
});


