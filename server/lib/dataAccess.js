/**
 * Data Access Layer
 *
 * Provides unified helpers to read/write navigation data.
 * Uses MongoDB (Mongoose models) first, with JSON file fallback for compatibility.
 */

const fs = require('fs');
const path = require('path');
const { SpaceDefinition, FloorPlan, LocationGraph, RLPolicy } = require('../models');

// JSON fallback paths
const paths = {
  spaceDefinitions: path.join(__dirname, '../data/space_definitions.json'),
  floorPlans: path.join(__dirname, '../data/hsitp_floorPlans.json'),
  locationGraph: path.join(__dirname, '../data/hsitp_locationGraph.json'),
  spaceRLModel: path.join(__dirname, '../data/space_rl_model.json'),
  navigationQTable: path.join(__dirname, '../data/navigation_qtable.json'),
  rlPolicyQTable: path.join(__dirname, '../data/rl_policies/q_table.json'),
  rlPolicyCheckpoint: path.join(__dirname, '../data/rl_policies/checkpoint.json')
};

// ---------- Space Definitions ----------
async function getSpaceDefinitions() {
  try {
    const latest = await SpaceDefinition.getLatest();
    if (latest) {
      return {
        corridors: latest.corridors || [],
        destinations: latest.destinations || [],
        gridSize: latest.gridSize || 10,
        savedAt: latest.savedAt || latest.updatedAt
      };
    }
  } catch (error) {
    console.warn('⚠️  MongoDB getSpaceDefinitions failed, falling back to file:', error.message);
  }

  if (fs.existsSync(paths.spaceDefinitions)) {
    return JSON.parse(fs.readFileSync(paths.spaceDefinitions, 'utf8'));
  }
  return null;
}

async function saveSpaceDefinitions(data) {
  try {
    await SpaceDefinition.updateLatest({
      corridors: data.corridors || [],
      destinations: data.destinations || [],
      gridSize: data.gridSize || 10,
      savedAt: data.savedAt || new Date()
    });
    return true;
  } catch (error) {
    console.warn('⚠️  MongoDB saveSpaceDefinitions failed, writing file:', error.message);
  }

  try {
    const dir = path.dirname(paths.spaceDefinitions);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(paths.spaceDefinitions, JSON.stringify({
      corridors: data.corridors || [],
      destinations: data.destinations || [],
      gridSize: data.gridSize || 10,
      savedAt: new Date().toISOString()
    }, null, 2));
    return true;
  } catch (err) {
    console.error('❌ Failed to save space definitions:', err.message);
    return false;
  }
}

// ---------- Floor Plans ----------
async function getFloorPlans() {
  try {
    const latest = await FloorPlan.getLatest();
    if (latest) {
      return latest.toObject();
    }
  } catch (error) {
    console.warn('⚠️  MongoDB getFloorPlans failed, falling back to file:', error.message);
  }

  if (fs.existsSync(paths.floorPlans)) {
    return JSON.parse(fs.readFileSync(paths.floorPlans, 'utf8'));
  }
  return null;
}

async function saveFloorPlans(data) {
  try {
    await FloorPlan.updateLatest(data);
    return true;
  } catch (error) {
    console.warn('⚠️  MongoDB saveFloorPlans failed, writing file:', error.message);
  }

  try {
    fs.writeFileSync(paths.floorPlans, JSON.stringify(data, null, 2));
    return true;
  } catch (err) {
    console.error('❌ Failed to save floor plans:', err.message);
    return false;
  }
}

// ---------- Location Graph ----------
async function getLocationGraph() {
  try {
    const latest = await LocationGraph.getLatest();
    if (latest) {
      return {
        nodes: latest.nodes || [],
        edges: latest.edges || []
      };
    }
  } catch (error) {
    console.warn('⚠️  MongoDB getLocationGraph failed, falling back to file:', error.message);
  }

  if (fs.existsSync(paths.locationGraph)) {
    return JSON.parse(fs.readFileSync(paths.locationGraph, 'utf8'));
  }
  return null;
}

async function saveLocationGraph(data) {
  try {
    await LocationGraph.updateLatest(data);
    return true;
  } catch (error) {
    console.warn('⚠️  MongoDB saveLocationGraph failed, writing file:', error.message);
  }

  try {
    fs.writeFileSync(paths.locationGraph, JSON.stringify(data, null, 2));
    return true;
  } catch (err) {
    console.error('❌ Failed to save location graph:', err.message);
    return false;
  }
}

// ---------- RL Policies ----------
async function getRLPolicy(name = 'q_table') {
  try {
    const policy = await RLPolicy.getActive(name) || await RLPolicy.getLatest(name);
    if (policy) {
      const plain = policy.toObject();
      // Normalize Map fields to plain objects
      if (plain.qTable instanceof Map) {
        plain.qTable = Object.fromEntries(plain.qTable);
      }
      return plain;
    }
  } catch (error) {
    console.warn(`⚠️  MongoDB getRLPolicy(${name}) failed, falling back to file:`, error.message);
  }

  // Fallbacks
  if (name === 'q_table' && fs.existsSync(paths.rlPolicyQTable)) {
    const data = JSON.parse(fs.readFileSync(paths.rlPolicyQTable, 'utf8'));
    return { qTable: data.qTable || data };
  }
  if (name === 'checkpoint' && fs.existsSync(paths.rlPolicyCheckpoint)) {
    return JSON.parse(fs.readFileSync(paths.rlPolicyCheckpoint, 'utf8'));
  }
  if (name === 'navigation_qtable' && fs.existsSync(paths.navigationQTable)) {
    const data = JSON.parse(fs.readFileSync(paths.navigationQTable, 'utf8'));
    return { qTable: data };
  }
  if (name === 'space_rl_model' && fs.existsSync(paths.spaceRLModel)) {
    return JSON.parse(fs.readFileSync(paths.spaceRLModel, 'utf8'));
  }

  return null;
}

async function saveRLPolicy(name, data) {
  try {
    await RLPolicy.savePolicy(name, data);
    return true;
  } catch (error) {
    console.warn(`⚠️  MongoDB saveRLPolicy(${name}) failed:`, error.message);
  }
  return false;
}

// ============================================================
// MongoDB-only accessors (NO file fallback)
// ============================================================

async function getSpaceDefinitionsMongoOnly() {
  const latest = await SpaceDefinition.getLatest();
  if (!latest) {
    throw new Error('No space definitions found in MongoDB');
  }
  // Convert to plain objects to ensure all properties are accessible
  const plain = latest.toObject ? latest.toObject() : latest;
  return {
    corridors: (plain.corridors || []).map(c => ({ ...c })),
    destinations: (plain.destinations || []).map(d => ({ ...d })),
    gridSize: plain.gridSize || 10,
    savedAt: plain.savedAt || plain.updatedAt
  };
}

async function saveSpaceDefinitionsMongoOnly(data) {
  await SpaceDefinition.updateLatest({
    corridors: data.corridors || [],
    destinations: data.destinations || [],
    gridSize: data.gridSize || 10,
    savedAt: data.savedAt || new Date()
  });
  return true;
}

async function getFloorPlansMongoOnly() {
  const latest = await FloorPlan.getLatest();
  if (!latest) {
    throw new Error('No floor plans found in MongoDB');
  }
  return latest.toObject();
}

async function saveFloorPlansMongoOnly(data) {
  await FloorPlan.updateLatest(data);
  return true;
}

async function getLocationGraphMongoOnly() {
  const latest = await LocationGraph.getLatest();
  if (!latest) {
    throw new Error('No location graph found in MongoDB');
  }
  // Convert to plain objects to ensure all properties are accessible
  const plain = latest.toObject ? latest.toObject() : latest;
  return {
    nodes: (plain.nodes || []).map(n => ({ ...n })),
    edges: (plain.edges || []).map(e => ({ ...e }))
  };
}

async function saveLocationGraphMongoOnly(data) {
  await LocationGraph.updateLatest(data);
  return true;
}

async function getRLPolicyMongoOnly(name = 'q_table') {
  const policy = (await RLPolicy.getActive(name)) || (await RLPolicy.getLatest(name));
  if (!policy) {
    throw new Error(`No RL policy "${name}" found in MongoDB`);
  }
  const plain = policy.toObject();
  if (plain.qTable instanceof Map) {
    plain.qTable = Object.fromEntries(plain.qTable);
  }
  return plain;
}

async function saveRLPolicyMongoOnly(name, data) {
  await RLPolicy.savePolicy(name, data);
  return true;
}

module.exports = {
  getSpaceDefinitions,
  saveSpaceDefinitions,
  getFloorPlans,
  saveFloorPlans,
  getLocationGraph,
  saveLocationGraph,
  getRLPolicy,
  saveRLPolicy,
  // MongoDB-only
  getSpaceDefinitionsMongoOnly,
  saveSpaceDefinitionsMongoOnly,
  getFloorPlansMongoOnly,
  saveFloorPlansMongoOnly,
  getLocationGraphMongoOnly,
  saveLocationGraphMongoOnly,
  getRLPolicyMongoOnly,
  saveRLPolicyMongoOnly,
  paths
};

