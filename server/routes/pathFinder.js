const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

// Load HSITP location graph data
let locationGraph;
try {
  const locationDataPath = path.join(__dirname, '../data/hsitp_locationGraph.json');
  const locationData = JSON.parse(fs.readFileSync(locationDataPath, 'utf8'));
  locationGraph = {
    nodes: locationData.nodes,
    edges: locationData.edges
  };
  console.log(`✅ Loaded HSITP location graph: ${locationGraph.nodes.length} nodes, ${locationGraph.edges.length} edges`);
} catch (error) {
  console.error('Error loading HSITP location graph, using default:', error.message);
  // Fallback to default data
  locationGraph = {
    nodes: [
      { id: 'entrance', name: 'Main Entrance', floor: 1, x: 0, y: 0, type: 'entrance' },
      { id: 'reception', name: 'Reception Desk', floor: 1, x: 10, y: 0, type: 'reception' },
      { id: 'elevator1', name: 'Elevator 1', floor: 1, x: 20, y: 0, type: 'elevator' },
      { id: 'meeting_room_1', name: 'Meeting Room 1', floor: 1, x: 30, y: 10, type: 'room' },
      { id: 'cafeteria', name: 'Cafeteria', floor: 1, x: 40, y: 20, type: 'facility' },
      { id: 'office_201', name: 'Office 201', floor: 2, x: 30, y: 10, type: 'room' },
      { id: 'office_202', name: 'Office 202', floor: 2, x: 40, y: 10, type: 'room' },
      { id: 'conference_hall', name: 'Conference Hall', floor: 2, x: 20, y: 20, type: 'room' },
    ],
    edges: [
      { from: 'entrance', to: 'reception', weight: 10 },
      { from: 'reception', to: 'elevator1', weight: 10 },
      { from: 'elevator1', to: 'meeting_room_1', weight: 15 },
      { from: 'elevator1', to: 'cafeteria', weight: 25 },
      { from: 'elevator1', to: 'office_201', weight: 5, floorChange: true },
      { from: 'office_201', to: 'office_202', weight: 10 },
      { from: 'office_201', to: 'conference_hall', weight: 15 },
    ]
  };
}

// Dijkstra's algorithm for shortest path
function findShortestPath(graph, startId, endId) {
  const nodes = graph.nodes;
  const edges = graph.edges;
  
  // Create adjacency list
  const adjacency = {};
  nodes.forEach(node => {
    adjacency[node.id] = [];
  });
  
  edges.forEach(edge => {
    adjacency[edge.from].push({ to: edge.to, weight: edge.weight, floorChange: edge.floorChange });
    // Make bidirectional
    adjacency[edge.to].push({ to: edge.from, weight: edge.weight, floorChange: edge.floorChange });
  });

  // Dijkstra's algorithm
  const distances = {};
  const previous = {};
  const unvisited = new Set(nodes.map(n => n.id));
  
  nodes.forEach(node => {
    distances[node.id] = Infinity;
    previous[node.id] = null;
  });
  
  distances[startId] = 0;
  
  while (unvisited.size > 0) {
    // Find unvisited node with smallest distance
    let current = null;
    let minDist = Infinity;
    
    unvisited.forEach(nodeId => {
      if (distances[nodeId] < minDist) {
        minDist = distances[nodeId];
        current = nodeId;
      }
    });
    
    if (current === null || minDist === Infinity) break;
    
    unvisited.delete(current);
    
    if (current === endId) break;
    
    // Update distances to neighbors
    adjacency[current].forEach(neighbor => {
      const alt = distances[current] + neighbor.weight;
      if (alt < distances[neighbor.to]) {
        distances[neighbor.to] = alt;
        previous[neighbor.to] = current;
      }
    });
  }
  
  // Reconstruct path
  const path = [];
  let current = endId;
  
  while (current !== null) {
    path.unshift(current);
    current = previous[current];
  }
  
  if (path[0] !== startId) {
    return null; // No path found
  }
  
  // Calculate total time (assuming 1 unit = 1 second walking time)
  const totalTime = distances[endId];
  const estimatedMinutes = Math.ceil(totalTime / 60);
  
  // Get path details
  const pathDetails = path.map((nodeId, index) => {
    const node = nodes.find(n => n.id === nodeId);
    const nextNode = index < path.length - 1 ? nodes.find(n => n.id === path[index + 1]) : null;
    const edge = edges.find(e => 
      (e.from === nodeId && e.to === nextNode?.id) || 
      (e.to === nodeId && e.from === nextNode?.id)
    );
    
    return {
      ...node,
      isFloorChange: edge?.floorChange || false,
      nextDirection: nextNode ? getDirection(node, nextNode) : null
    };
  });
  
  return {
    path: pathDetails,
    totalDistance: distances[endId],
    estimatedTime: estimatedMinutes,
    pathIds: path
  };
}

function getDirection(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0 ? 'right' : 'left';
  } else {
    return dy > 0 ? 'down' : 'up';
  }
}

// Get all locations
router.get('/locations', (req, res) => {
  try {
    res.json({
      locations: locationGraph.nodes.map(node => ({
        id: node.id,
        name: node.name,
        floor: node.floor,
        type: node.type
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Find path between two locations
router.post('/find-path', (req, res) => {
  try {
    const { from, to } = req.body;
    
    if (!from || !to) {
      return res.status(400).json({ error: 'Both "from" and "to" parameters are required' });
    }
    
    // Find node IDs (support both ID and name matching)
    // Try exact match first, then partial match
    const fromLower = from.toLowerCase().trim();
    const toLower = to.toLowerCase().trim();
    
    let fromNode = locationGraph.nodes.find(n => 
      n.id.toLowerCase() === fromLower || 
      n.name.toLowerCase() === fromLower ||
      n.name.toLowerCase().replace(/^hsitp\s+/i, '') === fromLower
    );
    
    // If no exact match, try partial match
    if (!fromNode) {
      fromNode = locationGraph.nodes.find(n => 
        n.name.toLowerCase().includes(fromLower) ||
        fromLower.includes(n.name.toLowerCase().replace(/^hsitp\s+/i, ''))
      );
    }
    
    let toNode = locationGraph.nodes.find(n => 
      n.id.toLowerCase() === toLower || 
      n.name.toLowerCase() === toLower ||
      n.name.toLowerCase().replace(/^hsitp\s+/i, '') === toLower
    );
    
    // If no exact match, try partial match
    if (!toNode) {
      toNode = locationGraph.nodes.find(n => 
        n.name.toLowerCase().includes(toLower) ||
        toLower.includes(n.name.toLowerCase().replace(/^hsitp\s+/i, ''))
      );
    }
    
    if (!fromNode) {
      return res.status(404).json({ 
        error: `Starting location "${from}" not found`,
        suggestion: 'Available locations include: Main Entrance, Reception Desk, Lift Lobby, Zones 01-07 (on floors 1/F-7/F), and service areas.'
      });
    }
    
    if (!toNode) {
      // Provide helpful error message for common mistakes
      let errorMsg = `Destination "${to}" not found.`;
      if (to.toLowerCase().includes('zone') && (to.toLowerCase().includes('gf') || to.toLowerCase().includes('ground'))) {
        errorMsg += ' Note: Zones (01-07) are only available on floors 1/F, 2/F, 3/F, 5/F, 6/F, and 7/F. Ground Floor does not have zones.';
      }
      return res.status(404).json({ 
        error: errorMsg,
        suggestion: 'Available locations include: Main Entrance, Reception Desk, Lift Lobby, Zones 01-07 (on floors 1/F-7/F), and service areas.'
      });
    }
    
    if (fromNode.id === toNode.id) {
      return res.status(400).json({ error: 'Starting location and destination are the same' });
    }
    
    const result = findShortestPath(locationGraph, fromNode.id, toNode.id);
    
    if (!result) {
      return res.status(404).json({ error: 'No path found between the specified locations' });
    }
    
    res.json({
      from: fromNode,
      to: toNode,
      path: result.path,
      totalDistance: result.totalDistance,
      estimatedTime: result.estimatedTime,
      pathIds: result.pathIds
    });
    
  } catch (error) {
    console.error('Path finder error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Search locations
router.get('/search', (req, res) => {
  try {
    const { q } = req.query;
    
    if (!q) {
      return res.json({ locations: [] });
    }
    
    const query = q.toLowerCase();
    const matches = locationGraph.nodes.filter(node =>
      node.name.toLowerCase().includes(query) ||
      node.id.toLowerCase().includes(query) ||
      node.type.toLowerCase().includes(query)
    );
    
    res.json({
      locations: matches.map(node => ({
        id: node.id,
        name: node.name,
        floor: node.floor,
        type: node.type
      }))
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get floor plan configuration
router.get('/floor-plans', (req, res) => {
  try {
    const floorPlanPath = path.join(__dirname, '../data/hsitp_floorPlans.json');
    const floorPlanData = JSON.parse(fs.readFileSync(floorPlanPath, 'utf8'));
    res.json(floorPlanData);
  } catch (error) {
    console.error('Error loading floor plans:', error);
    res.status(500).json({ error: 'Failed to load floor plan data' });
  }
});

// Update floor plan configuration (for coordinate mapper)
router.post('/floor-plans/update', (req, res) => {
  try {
    const { floor, nodes } = req.body;
    
    if (floor === undefined || !nodes || !Array.isArray(nodes)) {
      return res.status(400).json({ error: 'Invalid request data. Expected floor and nodes array.' });
    }

    const floorPlanPath = path.join(__dirname, '../data/hsitp_floorPlans.json');
    const floorPlanData = JSON.parse(fs.readFileSync(floorPlanPath, 'utf8'));
    
    // Find the floor and update nodes
    const floorIndex = floorPlanData.floors.findIndex(f => f.floor === floor);
    if (floorIndex === -1) {
      return res.status(404).json({ error: `Floor ${floor} not found` });
    }

    // Update node coordinates
    const floorInfo = floorPlanData.floors[floorIndex];
    if (nodes && Array.isArray(nodes)) {
      nodes.forEach(nodeUpdate => {
        const nodeIndex = floorInfo.nodes.findIndex(n => n.id === nodeUpdate.id);
        if (nodeIndex !== -1) {
          // Update existing node
          floorInfo.nodes[nodeIndex].pixelX = nodeUpdate.pixelX;
          floorInfo.nodes[nodeIndex].pixelY = nodeUpdate.pixelY;
          if (nodeUpdate.name) {
            floorInfo.nodes[nodeIndex].name = nodeUpdate.name;
          }
        } else {
          // Add new node
          floorInfo.nodes.push({
            id: nodeUpdate.id,
            pixelX: nodeUpdate.pixelX,
            pixelY: nodeUpdate.pixelY,
            realX: nodeUpdate.realX || 0,
            realY: nodeUpdate.realY || 0,
            marker: nodeUpdate.marker || 'zone',
            name: nodeUpdate.name || nodeUpdate.id
          });
        }
      });
    }

    // Update routes/paths if provided
    if (req.body.paths && Array.isArray(req.body.paths)) {
      floorInfo.paths = req.body.paths;
      console.log(`✅ Updated ${req.body.paths.length} routes for floor ${floor}`);
    }

    // Write updated data back to file
    fs.writeFileSync(floorPlanPath, JSON.stringify(floorPlanData, null, 2), 'utf8');
    
    const nodesUpdated = nodes ? nodes.length : 0;
    const routesUpdated = req.body.paths ? req.body.paths.length : 0;
    
    console.log(`✅ Updated ${nodesUpdated} nodes and ${routesUpdated} routes for floor ${floor}`);
    res.json({ 
      success: true, 
      message: `Updated ${nodesUpdated} nodes and ${routesUpdated} routes for floor ${floor}`,
      floor: floor,
      nodesUpdated: nodesUpdated,
      routesUpdated: routesUpdated
    });
  } catch (error) {
    console.error('Error updating floor plans:', error);
    res.status(500).json({ error: 'Failed to update floor plans', details: error.message });
  }
});

module.exports = router;

