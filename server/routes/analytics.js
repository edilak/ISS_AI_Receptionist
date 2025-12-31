/**
 * Analytics and Performance Monitoring Endpoints
 */

const express = require('express');
const router = express.Router();
const { getInstance: getPerformanceMonitor } = require('../lib/PerformanceMonitor');
const { getInstance: getNavigationService } = require('../lib/NavigationService');

/**
 * Get performance summary
 */
router.get('/performance', async (req, res) => {
  try {
    const monitor = getPerformanceMonitor();
    const summary = monitor.getSummary();
    const health = monitor.getHealthStatus();
    
    res.json({
      success: true,
      summary,
      health
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get performance trends
 */
router.get('/trends', (req, res) => {
  try {
    const monitor = getPerformanceMonitor();
    const n = parseInt(req.query.n) || 50;
    const trends = monitor.getTrends(n);
    
    res.json({
      success: true,
      trends
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get comprehensive analytics
 */
router.get('/comprehensive', async (req, res) => {
  try {
    const monitor = getPerformanceMonitor();
    const navService = await getNavigationService();
    
    const analytics = {
      performance: monitor.exportMetrics(),
      navigation: navService?.getStats() || null,
      timestamp: new Date().toISOString()
    };
    
    res.json({
      success: true,
      analytics
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get health status
 */
router.get('/health', (req, res) => {
  try {
    const monitor = getPerformanceMonitor();
    const health = monitor.getHealthStatus();
    
    res.json({
      success: true,
      health
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Reset metrics (admin only)
 */
router.post('/reset', (req, res) => {
  try {
    const monitor = getPerformanceMonitor();
    monitor.reset();
    
    res.json({
      success: true,
      message: 'Metrics reset successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;

