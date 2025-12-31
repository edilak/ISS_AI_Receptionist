/**
 * Space Navigation API Routes
 * 
 * Provides endpoints for the RL-based space navigation system.
 */

const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');

const GridGenerator = require('../lib/GridGenerator');
const RLEnvironment = require('../lib/RLEnvironment');
const SpaceRLAgent = require('../lib/SpaceRLAgent');
const PreTrainer = require('../lib/PreTrainer');
const GridPathSmoother = require('../lib/GridPathSmoother');

// Data paths
const DATA_DIR = path.join(__dirname, '..', 'data');
const SPACE_DEFINITIONS_PATH = path.join(DATA_DIR, 'space_definitions.json');
const RL_POLICIES_DIR = path.join(DATA_DIR, 'rl_policies');

// Singleton instances
let gridGenerator = null;
let environment = null;
let agent = null;
let preTrainer = null;
let pathSmoother = null;
let spaceDefinitions = null;
let isInitialized = false;
let trainingInProgress = false;
let trainingProgress = 0;

/**
 * Initialize the space navigation system
 */
async function initializeSystem() {
  try {
    // Load space definitions
    const data = await fs.readFile(SPACE_DEFINITIONS_PATH, 'utf8');
    spaceDefinitions = JSON.parse(data);
    
    // Initialize components
    gridGenerator = new GridGenerator({ cellSize: spaceDefinitions.gridSize || 10 });
    pathSmoother = new GridPathSmoother();
    agent = new SpaceRLAgent();
    
    // Try to load existing Q-table
    try {
      const qTablePath = path.join(RL_POLICIES_DIR, 'q_table.json');
      const qTableData = JSON.parse(await fs.readFile(qTablePath, 'utf8'));
      agent.importQTable(qTableData);
      console.log('Loaded existing Q-table');
    } catch (e) {
      console.log('No existing Q-table found, will need training');
    }
    
    isInitialized = true;
    console.log('Space navigation system initialized');
    
  } catch (error) {
    console.log('Space definitions not found, system needs configuration');
    isInitialized = false;
  }
}

// Initialize on startup
initializeSystem();

/**
 * GET /api/space-nav/definitions
 * Get current space definitions
 */
router.get('/definitions', async (req, res) => {
  try {
    const data = await fs.readFile(SPACE_DEFINITIONS_PATH, 'utf8');
    res.json(JSON.parse(data));
  } catch (error) {
    res.json({ corridors: [], destinations: [], gridSize: 10 });
  }
});

/**
 * POST /api/space-nav/definitions
 * Save space definitions
 */
router.post('/definitions', async (req, res) => {
  try {
    const { corridors, destinations, gridSize } = req.body;
    
    const definitions = {
      corridors: corridors || [],
      destinations: destinations || [],
      gridSize: gridSize || 10,
      updatedAt: new Date().toISOString()
    };
    
    // Ensure data directory exists
    await fs.mkdir(DATA_DIR, { recursive: true });
    
    await fs.writeFile(
      SPACE_DEFINITIONS_PATH,
      JSON.stringify(definitions, null, 2)
    );
    
    spaceDefinitions = definitions;
    isInitialized = false; // Need reinitialization
    
    res.json({ success: true, message: 'Space definitions saved' });
    
  } catch (error) {
    console.error('Error saving space definitions:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/space-nav/train
 * Start pre-training the RL agent
 */
router.post('/train', async (req, res) => {
  try {
    if (trainingInProgress) {
      return res.status(409).json({ error: 'Training already in progress' });
    }
    
    if (!spaceDefinitions || spaceDefinitions.corridors.length === 0) {
      return res.status(400).json({ error: 'No space definitions found. Please configure corridors first.' });
    }
    
    // Get floor plan dimensions
    const floorPlanPath = path.join(DATA_DIR, 'hsitp_floorPlans.json');
    let imageSize = { width: 1200, height: 900 }; // Default
    
    try {
      const floorPlanData = JSON.parse(await fs.readFile(floorPlanPath, 'utf8'));
      const floor = req.body.floor || 1;
      const floorInfo = floorPlanData.floors.find(f => f.floor === floor);
      if (floorInfo && floorInfo.image) {
        imageSize = {
          width: floorInfo.image.naturalWidth || floorInfo.image.width || 1200,
          height: floorInfo.image.naturalHeight || floorInfo.image.height || 900
        };
      }
    } catch (e) {
      console.log('Using default image size');
    }
    
    trainingInProgress = true;
    trainingProgress = 0;
    
    // Start training in background
    (async () => {
      try {
        preTrainer = new PreTrainer({
          episodesPerPair: 50,
          maxEpisodesPerPair: 200,
          convergenceThreshold: 0.9
        });
        
        const floor = req.body.floor || 1;
        await preTrainer.initialize(spaceDefinitions, floor, imageSize);
        
        await preTrainer.train((progress) => {
          trainingProgress = progress.progress;
          console.log(`Training progress: ${progress.progress}%`);
        });
        
        // Update singleton instances
        gridGenerator = preTrainer.getGridGenerator();
        environment = preTrainer.getEnvironment();
        agent = preTrainer.getAgent();
        
        isInitialized = true;
        console.log('Training complete');
        
      } catch (error) {
        console.error('Training error:', error);
      } finally {
        trainingInProgress = false;
      }
    })();
    
    res.json({ success: true, message: 'Training started' });
    
  } catch (error) {
    trainingInProgress = false;
    console.error('Error starting training:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/space-nav/training-progress
 * Get training progress
 */
router.get('/training-progress', (req, res) => {
  res.json({
    progress: trainingProgress,
    complete: !trainingInProgress && trainingProgress >= 100,
    inProgress: trainingInProgress
  });
});

/**
 * POST /api/space-nav/navigate
 * Find path between two points
 */
router.post('/navigate', async (req, res) => {
  try {
    const { startId, goalId, startPixel, floor } = req.body;
    
    if (!isInitialized || !agent || !gridGenerator) {
      return res.status(503).json({ 
        error: 'Navigation system not ready. Please train the RL agent first.' 
      });
    }
    
    // Generate grid for this floor if needed
    const floorNum = floor || 1;
    
    // Get floor plan dimensions
    const floorPlanPath = path.join(DATA_DIR, 'hsitp_floorPlans.json');
    let imageSize = { width: 1200, height: 900 };
    
    try {
      const floorPlanData = JSON.parse(await fs.readFile(floorPlanPath, 'utf8'));
      const floorInfo = floorPlanData.floors.find(f => f.floor === floorNum);
      if (floorInfo && floorInfo.image) {
        imageSize = {
          width: floorInfo.image.naturalWidth || floorInfo.image.width || 1200,
          height: floorInfo.image.naturalHeight || floorInfo.image.height || 900
        };
      }
    } catch (e) {
      // Use default
    }
    
    // Generate grid
    const gridData = gridGenerator.generate({
      corridors: spaceDefinitions.corridors,
      destinations: spaceDefinitions.destinations,
      imageWidth: imageSize.width,
      imageHeight: imageSize.height,
      floor: floorNum
    });
    
    // Create environment
    const env = new RLEnvironment(gridGenerator);
    
    // Determine start position
    let startX, startY;
    
    if (startId) {
      // Start from a destination
      const startDest = gridGenerator.destinationCells.get(startId);
      if (!startDest) {
        return res.status(400).json({ error: `Unknown start location: ${startId}` });
      }
      startX = startDest.x;
      startY = startDest.y;
    } else if (startPixel) {
      // Start from pixel coordinates
      const gridCoord = gridGenerator.pixelToGrid(startPixel.x, startPixel.y);
      startX = gridCoord.x;
      startY = gridCoord.y;
    } else {
      return res.status(400).json({ error: 'Must provide startId or startPixel' });
    }
    
    // Handle zone destinations (find closest exit)
    let actualGoalId = goalId;
    const zoneDestinations = gridGenerator.getZoneDestinations(goalId);
    
    if (zoneDestinations.length > 0) {
      // Find closest exit in the zone
      const closest = gridGenerator.findClosestDestination(startX, startY, goalId);
      if (closest) {
        actualGoalId = closest.id;
        console.log(`Zone ${goalId}: selected closest exit ${actualGoalId}`);
      }
    }
    
    // Verify goal exists
    if (!gridGenerator.destinationCells.has(actualGoalId)) {
      return res.status(400).json({ error: `Unknown destination: ${goalId}` });
    }
    
    // Find path using RL agent
    const pathResult = agent.findPath(env, {
      startX,
      startY,
      goalId: actualGoalId
    });
    
    if (!pathResult.success) {
      return res.status(404).json({ 
        error: 'Could not find path to destination',
        details: pathResult
      });
    }
    
    // Smooth the path for visualization
    const smoothedPath = pathSmoother.smooth(pathResult.path, gridGenerator);
    
    // Generate direction arrows
    const arrows = pathSmoother.generateDirectionArrows(smoothedPath, 80);
    
    // Generate animation data
    const animation = pathSmoother.generateAnimationData(smoothedPath);
    
    // Get destination info
    const goalDest = gridGenerator.destinationCells.get(actualGoalId);
    
    res.json({
      success: true,
      path: {
        gridPath: pathResult.path,
        pixelPath: pathResult.pathInPixels,
        smoothPath: smoothedPath.points,
        svgPath: smoothedPath.svgPath,
        totalLength: smoothedPath.totalLength,
        bezierCurves: smoothedPath.bezierCurves
      },
      visualization: {
        arrows,
        animation
      },
      destination: {
        id: actualGoalId,
        name: goalDest.name,
        zone: goalDest.zone,
        pixelX: goalDest.pixelX,
        pixelY: goalDest.pixelY
      },
      stats: {
        steps: pathResult.steps,
        gridCells: pathResult.path.length,
        originalPoints: smoothedPath.originalPoints,
        simplifiedPoints: smoothedPath.simplifiedPoints
      }
    });
    
  } catch (error) {
    console.error('Navigation error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/space-nav/destinations
 * Get all available destinations
 */
router.get('/destinations', async (req, res) => {
  try {
    if (!spaceDefinitions) {
      return res.json({ destinations: [] });
    }
    
    // Group destinations by zone
    const byZone = {};
    const standalone = [];
    
    for (const dest of spaceDefinitions.destinations) {
      if (dest.zone) {
        if (!byZone[dest.zone]) {
          byZone[dest.zone] = {
            zone: dest.zone,
            name: dest.zone.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase()),
            exits: []
          };
        }
        byZone[dest.zone].exits.push({
          id: dest.id,
          name: dest.name,
          facing: dest.facing
        });
      } else {
        standalone.push({
          id: dest.id,
          name: dest.name,
          facing: dest.facing
        });
      }
    }
    
    res.json({
      zones: Object.values(byZone),
      standalone,
      all: spaceDefinitions.destinations
    });
    
  } catch (error) {
    console.error('Error getting destinations:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/space-nav/grid
 * Get the navigation grid for visualization
 */
router.get('/grid', async (req, res) => {
  try {
    const floor = parseInt(req.query.floor) || 1;
    
    if (!spaceDefinitions || spaceDefinitions.corridors.length === 0) {
      return res.json({ grid: null, message: 'No space definitions' });
    }
    
    // Get floor plan dimensions
    const floorPlanPath = path.join(DATA_DIR, 'hsitp_floorPlans.json');
    let imageSize = { width: 1200, height: 900 };
    
    try {
      const floorPlanData = JSON.parse(await fs.readFile(floorPlanPath, 'utf8'));
      const floorInfo = floorPlanData.floors.find(f => f.floor === floor);
      if (floorInfo && floorInfo.image) {
        imageSize = {
          width: floorInfo.image.naturalWidth || floorInfo.image.width || 1200,
          height: floorInfo.image.naturalHeight || floorInfo.image.height || 900
        };
      }
    } catch (e) {
      // Use default
    }
    
    const generator = new GridGenerator({ cellSize: spaceDefinitions.gridSize || 10 });
    const gridData = generator.generate({
      corridors: spaceDefinitions.corridors,
      destinations: spaceDefinitions.destinations,
      imageWidth: imageSize.width,
      imageHeight: imageSize.height,
      floor
    });
    
    res.json({
      ...gridData,
      connectivity: generator.validateConnectivity()
    });
    
  } catch (error) {
    console.error('Error generating grid:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/space-nav/stats
 * Get navigation system statistics
 */
router.get('/stats', (req, res) => {
  const stats = {
    isInitialized,
    trainingInProgress,
    trainingProgress: trainingInProgress ? trainingProgress : 100,
    agentStats: agent ? agent.getStats() : null,
    environmentStats: environment ? environment.getStats() : null,
    spaceDefinitions: spaceDefinitions ? {
      corridors: spaceDefinitions.corridors.length,
      destinations: spaceDefinitions.destinations.length,
      gridSize: spaceDefinitions.gridSize
    } : null
  };
  
  res.json(stats);
});

/**
 * POST /api/space-nav/reset
 * Reset the navigation system
 */
router.post('/reset', async (req, res) => {
  try {
    if (agent) {
      agent.reset();
    }
    
    // Delete Q-table
    try {
      await fs.unlink(path.join(RL_POLICIES_DIR, 'q_table.json'));
    } catch (e) {
      // File may not exist
    }
    
    isInitialized = false;
    trainingProgress = 0;
    
    res.json({ success: true, message: 'Navigation system reset' });
    
  } catch (error) {
    console.error('Error resetting system:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/space-nav/test
 * Test the navigation system with a sample query
 */
router.get('/test', async (req, res) => {
  try {
    if (!isInitialized || !agent) {
      return res.json({ 
        status: 'not_ready',
        message: 'System needs training'
      });
    }
    
    // Get available destinations
    const destinations = Array.from(gridGenerator.destinationCells.keys());
    
    if (destinations.length < 2) {
      return res.json({
        status: 'insufficient_destinations',
        message: 'Need at least 2 destinations'
      });
    }
    
    // Test a random path
    const startId = destinations[0];
    const goalId = destinations[1];
    
    const startDest = gridGenerator.destinationCells.get(startId);
    const env = new RLEnvironment(gridGenerator);
    
    const result = agent.findPath(env, {
      startX: startDest.x,
      startY: startDest.y,
      goalId
    });
    
    res.json({
      status: result.success ? 'ok' : 'path_failed',
      testPath: {
        from: startId,
        to: goalId,
        success: result.success,
        steps: result.steps
      },
      agentStats: agent.getStats()
    });
    
  } catch (error) {
    res.json({
      status: 'error',
      message: error.message
    });
  }
});

module.exports = router;

