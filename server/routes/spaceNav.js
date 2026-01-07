/**
 * Space Navigation API Routes
 * 
 * Endpoints for continuous space-based RL navigation:
 * - Save/load space definitions (corridors & destinations)
 * - Train RL agent
 * - Navigate to destinations
 */

const express = require('express');
const router = express.Router();
const { getSpaceNavigationEngine } = require('../lib/SpaceNavigationEngine');

// Get engine instance
const getEngine = () => getSpaceNavigationEngine();

/**
 * GET /api/space-nav/definitions
 * Get current space definitions (corridors & destinations)
 */
router.get('/definitions', (req, res) => {
  try {
    const engine = getEngine();
    res.json({
      corridors: engine.corridors,
      destinations: engine.destinations,
      gridSize: engine.gridSize
    });
  } catch (error) {
    console.error('Error getting space definitions:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/space-nav/definitions
 * Save space definitions
 */
router.post('/definitions', async (req, res) => {
  try {
    const { corridors, destinations, gridSize } = req.body;
    const engine = getEngine();
    
    const success = await engine.saveDefinitions({ corridors, destinations, gridSize });
    
    if (success) {
      res.json({ 
        success: true, 
        message: 'Space definitions saved',
        stats: {
          corridors: corridors?.length || 0,
          destinations: destinations?.length || 0
        }
      });
    } else {
      res.status(500).json({ success: false, error: 'Failed to save definitions' });
    }
  } catch (error) {
    console.error('Error saving space definitions:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/space-nav/train
 * Start RL agent training (non-blocking)
 */
router.post('/train', async (req, res) => {
  try {
    const { episodes = 200 } = req.body;
    const engine = getEngine();
    
    console.log(`📥 Training request received: ${episodes} episodes`);
    
    // Check if already training
    if (engine.isTraining) {
      console.log('⚠️ Training already in progress');
      return res.json({ success: false, error: 'Training already in progress' });
    }
    
    // Validate environment
    if (engine.corridors.length === 0) {
      return res.json({ success: false, error: 'No corridors defined' });
    }
    if (engine.destinations.length === 0) {
      return res.json({ success: false, error: 'No destinations defined' });
    }
    
    // Start training
    const result = engine.train(episodes);
    
    if (!result.success) {
      return res.json(result);
    }
    
    console.log('✅ Training started successfully');
    
    // Return immediately
    res.json({ 
      success: true, 
      message: 'Training started',
      episodes 
    });
  } catch (error) {
    console.error('❌ Error starting training:', error);
    console.error('   Stack:', error.stack);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/space-nav/training-progress
 * Get current training progress
 */
router.get('/training-progress', (req, res) => {
  try {
    const engine = getEngine();
    res.json(engine.getTrainingProgress());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/space-nav/navigate
 * Find path to destination using RL
 */
router.post('/navigate', async (req, res) => {
  try {
    const { from, to, floor = 1, startX, startY } = req.body;
    const engine = getEngine();
    
    console.log(`🧭 Space navigation request: ${from || 'start'} → ${to}`);
    
    const result = await engine.navigate(from || 'entrance', to, {
      floor,
      startX,
      startY
    });
    
    if (result.success) {
      res.json({
        success: true,
        path: result.path,
        svgPath: result.svgPath,
        destination: result.destination,
        start: result.start,
        stats: result.stats,
        algorithm: result.algorithm
      });
    } else {
      res.json({
        success: false,
        error: result.error,
        partialPath: result.partialPath
      });
    }
  } catch (error) {
    console.error('Error navigating:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/space-nav/destinations
 * Get all available destinations
 */
router.get('/destinations', (req, res) => {
  try {
    const { floor = 1 } = req.query;
    const engine = getEngine();
    
    res.json({
      destinations: engine.getDestinations(parseInt(floor)),
      total: engine.destinations.length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/space-nav/corridors
 * Get all corridors
 */
router.get('/corridors', (req, res) => {
  try {
    const { floor = 1 } = req.query;
    const engine = getEngine();
    
    res.json({
      corridors: engine.getCorridors(parseInt(floor)),
      total: engine.corridors.length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/space-nav/stats
 * Get navigation engine statistics
 */
router.get('/stats', (req, res) => {
  try {
    const engine = getEngine();
    res.json(engine.getStats());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/space-nav/find-destination
 * Find destination by query
 */
router.post('/find-destination', (req, res) => {
  try {
    const { query, floor = 1 } = req.body;
    const engine = getEngine();
    
    const destination = engine.findDestination(query, floor);
    
    if (destination) {
      res.json({
        found: true,
        destination
      });
    } else {
      res.json({
        found: false,
        available: engine.getDestinations(floor).map(d => ({
          name: d.name,
          zone: d.zone
        }))
      });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/space-nav/zone-exits/:zoneId
 * Get all exits for a zone (for multiple exit support)
 */
router.get('/zone-exits/:zoneId', (req, res) => {
  try {
    const { zoneId } = req.params;
    const { floor = 1 } = req.query;
    const engine = getEngine();
    
    const exits = engine.getZoneExits(zoneId, parseInt(floor));
    
    res.json({
      zoneId,
      exits,
      count: exits.length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
