const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

// Load HSITP location graph data
let locationGraph;
const locationDataPath = path.join(__dirname, '../data/hsitp_locationGraph.json');

// Function to load/reload the graph from file
function loadLocationGraph() {
  try {
    const locationData = JSON.parse(fs.readFileSync(locationDataPath, 'utf8'));
    locationGraph = {
      nodes: locationData.nodes,
      edges: locationData.edges
    };
    
    // Validate and log
    const validation = validateGraph(locationGraph);
    console.log(`✅ Loaded HSITP location graph: ${locationGraph.nodes.length} nodes, ${locationGraph.edges.length} edges`);
    
    if (validation.errors.length > 0) {
      console.warn(`⚠️  Graph validation errors found: ${validation.errors.length}`);
      validation.errors.slice(0, 5).forEach(err => console.warn(`   - ${err}`));
    }
    if (validation.warnings.length > 0) {
      console.warn(`⚠️  Graph validation warnings: ${validation.warnings.length}`);
      validation.warnings.slice(0, 5).forEach(warn => console.warn(`   - ${warn}`));
    }
    
    return true;
  } catch (error) {
    console.error('❌ Error loading HSITP location graph:', error.message);
    // Fallback to default data
    locationGraph = {
      nodes: [
        { id: 'entrance', name: 'Main Entrance', floor: 1, x: 0, y: 0, type: 'entrance' },
        { id: 'reception', name: 'Reception Desk', floor: 1, x: 10, y: 0, type: 'reception' },
      ],
      edges: [
        { from: 'entrance', to: 'reception', weight: 10 },
      ]
    };
    return false;
  }
}

// Graph validation function
function validateGraph(graph) {
  const errors = [];
  const warnings = [];
  
  // Check for duplicate node IDs
  const nodeIds = new Set();
  graph.nodes.forEach(node => {
    if (nodeIds.has(node.id)) {
      errors.push(`Duplicate node ID: ${node.id}`);
    }
    nodeIds.add(node.id);
    
    // Check required fields
    if (!node.name) warnings.push(`Node ${node.id} missing name`);
    if (node.floor === undefined) warnings.push(`Node ${node.id} missing floor`);
    if (node.x === undefined || node.y === undefined) warnings.push(`Node ${node.id} missing coordinates`);
  });
  
  // Check for edges referencing non-existent nodes
  const nodeIdSet = new Set(graph.nodes.map(n => n.id));
  graph.edges.forEach((edge, idx) => {
    if (!nodeIdSet.has(edge.from)) {
      errors.push(`Edge ${idx}: FROM node not found: ${edge.from}`);
    }
    if (!nodeIdSet.has(edge.to)) {
      errors.push(`Edge ${idx}: TO node not found: ${edge.to}`);
    }
    if (!edge.weight || edge.weight <= 0) {
      warnings.push(`Edge ${edge.from} → ${edge.to}: invalid weight (${edge.weight})`);
    }
  });
  
  // Check for isolated nodes (no edges)
  const connectedNodes = new Set();
  graph.edges.forEach(edge => {
    connectedNodes.add(edge.from);
    connectedNodes.add(edge.to);
  });
  
  graph.nodes.forEach(node => {
    if (!connectedNodes.has(node.id)) {
      warnings.push(`Isolated node (no connections): ${node.id} (${node.name})`);
    }
  });
  
  return { errors, warnings, isValid: errors.length === 0 };
}

// Initial load
loadLocationGraph();

// Load floor plan routes to constrain pathfinding
function getAvailableRoutes() {
  try {
    const floorPlanPath = path.join(__dirname, '../data/hsitp_floorPlans.json');
    const floorPlanData = JSON.parse(fs.readFileSync(floorPlanPath, 'utf8'));
    const routes = new Set();
    
    // Build set of available routes (bidirectional)
    floorPlanData.floors.forEach(floor => {
      if (floor.paths) {
        floor.paths.forEach(route => {
          // Add both directions
          routes.add(`${route.from}->${route.to}`);
          routes.add(`${route.to}->${route.from}`);
        });
      }
    });
    
    return routes;
  } catch (error) {
    console.warn('⚠️  Could not load floor plan routes, using all edges:', error.message);
    return null; // Return null to allow all edges
  }
}

// Dijkstra's algorithm for shortest path (constrained to routes only)
function findShortestPath(graph, startId, endId) {
  if (!startId || !endId) {
    console.error('❌ Invalid input: startId or endId is missing');
    return null;
  }
  
  if (startId === endId) {
    console.warn('⚠️  Start and end are the same location');
    return null;
  }
  
  const nodes = graph.nodes;
  const edges = graph.edges;
  
  // Verify nodes exist
  const startNode = nodes.find(n => n.id === startId);
  const endNode = nodes.find(n => n.id === endId);
  
  if (!startNode) {
    console.error(`❌ Start node not found in graph: ${startId}`);
    return null;
  }
  if (!endNode) {
    console.error(`❌ End node not found in graph: ${endId}`);
    return null;
  }
  
  // Get available routes from floor plan (constraint)
  const availableRoutes = getAvailableRoutes();
  
  // Create adjacency list with proper bidirectionality
  const adjacency = {};
  nodes.forEach(node => {
    adjacency[node.id] = [];
  });
  
  // Build adjacency list - ensure edges are bidirectional AND have routes
  const edgeSet = new Set(); // Track unique edges to avoid duplicates
  
  edges.forEach(edge => {
    if (!edge.from || !edge.to) {
      console.warn(`⚠️  Invalid edge: missing from or to`, edge);
      return;
    }
    
    // Check if route exists (if routes are loaded)
    if (availableRoutes !== null) {
      const forwardKey = `${edge.from}->${edge.to}`;
      const backwardKey = `${edge.to}->${edge.from}`;
      
      // Only include edge if a route exists for it
      if (!availableRoutes.has(forwardKey) && !availableRoutes.has(backwardKey)) {
        console.warn(`⚠️  Edge ${edge.from}->${edge.to} has no corresponding route in floor plan, skipping`);
        return; // Skip this edge - no route defined
      }
    }
    
    const weight = edge.weight || 10; // Default weight
    const floorChange = edge.floorChange || false;
    
    // Forward direction
    const forwardKey = `${edge.from}->${edge.to}`;
    if (!edgeSet.has(forwardKey)) {
      if (adjacency[edge.from]) {
        adjacency[edge.from].push({ to: edge.to, weight, floorChange });
        edgeSet.add(forwardKey);
      }
    }
    
    // Backward direction (bidirectional)
    const backwardKey = `${edge.to}->${edge.from}`;
    if (!edgeSet.has(backwardKey)) {
      if (adjacency[edge.to]) {
        adjacency[edge.to].push({ to: edge.from, weight, floorChange });
        edgeSet.add(backwardKey);
      }
    }
  });
  
  // Log connectivity for debugging
  console.log(`🛤️  Pathfinding: ${startId} (${adjacency[startId]?.length || 0} connections) → ${endId} (${adjacency[endId]?.length || 0} connections)`);

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
  
  // Reconstruct path (rename to pathArray to avoid collision with 'path' module)
  const pathArray = [];
  let current = endId;
  
  while (current !== null) {
    pathArray.unshift(current);
    current = previous[current];
  }
  
  if (pathArray[0] !== startId) {
    console.warn(`⚠️  Path reconstruction failed: path starts with ${pathArray[0]} but expected ${startId}`);
    console.warn(`   Path array:`, pathArray);
    return null; // No path found
  }
  
  if (pathArray.length === 0) {
    console.warn(`⚠️  Path array is empty after reconstruction`);
    return null;
  }
  
  // Calculate total time (assuming 1 unit = 1 second walking time)
  const totalTime = distances[endId];
  const estimatedMinutes = Math.ceil(totalTime / 60);
  
  // Load floor plan data to get route waypoints
  let floorPlanData = null;
  try {
    const floorPlanPath = path.join(__dirname, '../data/hsitp_floorPlans.json');
    console.log(`🔍 Loading floor plan from: ${floorPlanPath}`);
    floorPlanData = JSON.parse(fs.readFileSync(floorPlanPath, 'utf8'));
    console.log(`✅ Loaded floor plan data: ${floorPlanData.floors?.length || 0} floors`);
  } catch (error) {
    console.error('❌ Could not load floor plan data for waypoints:', error.message);
    console.error('   Attempted path:', path.join(__dirname, '../data/hsitp_floorPlans.json'));
  }

  // Get path details with route information
  const pathDetails = pathArray.map((nodeId, index) => {
    const node = nodes.find(n => n.id === nodeId);
    const nextNode = index < pathArray.length - 1 ? nodes.find(n => n.id === pathArray[index + 1]) : null;
    const edge = edges.find(e => 
      (e.from === nodeId && e.to === nextNode?.id) || 
      (e.to === nodeId && e.from === nextNode?.id)
    );
    
    // Find route definition with waypoints from floor plan
    // Handle routes that may span multiple floors (e.g., elevator/stairs connections)
    let routeInfo = null;
    let isReversed = false;
    if (nextNode && floorPlanData) {
      // Check if this is a floor change
      const isFloorChange = node.floor !== nextNode.floor;
      
      if (isFloorChange) {
        // For floor changes, try to find route on the starting floor first
        // If not found, try the destination floor
        let floorInfo = floorPlanData.floors.find(f => f.floor === node.floor);
        if (floorInfo && floorInfo.paths) {
          routeInfo = floorInfo.paths.find(p => 
            (p.from === nodeId && p.to === nextNode.id) ||
            (p.from === nextNode.id && p.to === nodeId)
          );
        }
        
        // If not found on starting floor, try destination floor
        if (!routeInfo) {
          floorInfo = floorPlanData.floors.find(f => f.floor === nextNode.floor);
          if (floorInfo && floorInfo.paths) {
            routeInfo = floorInfo.paths.find(p => 
              (p.from === nodeId && p.to === nextNode.id) ||
              (p.from === nextNode.id && p.to === nodeId)
            );
          }
        }
        
        // For floor changes, waypoints are typically not needed (direct connection)
        // But if a route is defined, use it
        if (routeInfo) {
          isReversed = routeInfo.from === nextNode.id && routeInfo.to === nodeId;
          console.log(`✅ Found floor change route: ${nodeId} (floor ${node.floor}) → ${nextNode.id} (floor ${nextNode.floor})${isReversed ? ' (reversed)' : ''}`);
        } else {
          console.log(`ℹ️  Floor change route: ${nodeId} (floor ${node.floor}) → ${nextNode.id} (floor ${nextNode.floor}) - no waypoints needed`);
        }
      } else {
        // Same floor - look for route on that floor
      const floorInfo = floorPlanData.floors.find(f => f.floor === node.floor);
      if (!floorInfo) {
        console.warn(`⚠️  Floor ${node.floor} not found in floor plan data`);
      } else if (!floorInfo.paths) {
        console.warn(`⚠️  No paths defined for floor ${node.floor}`);
      } else {
        // Try to find route definition (bidirectional)
        routeInfo = floorInfo.paths.find(p => 
          (p.from === nodeId && p.to === nextNode.id) ||
          (p.from === nextNode.id && p.to === nodeId)
        );
        
        if (routeInfo) {
          // Check if route direction is reversed (route defined as B→A but we're going A→B)
          isReversed = routeInfo.from === nextNode.id && routeInfo.to === nodeId;
          
          console.log(`✅ Found route with ${routeInfo.waypoints?.length || 0} waypoints: ${nodeId} → ${nextNode.id}${isReversed ? ' (reversed)' : ''}`);
          if (routeInfo.waypoints && routeInfo.waypoints.length > 0) {
            console.log(`   Waypoint coordinates:`, routeInfo.waypoints.map(wp => `(${wp.pixelX.toFixed(1)}, ${wp.pixelY.toFixed(1)})`).join(' → '));
          }
        } else {
          console.warn(`⚠️  No route definition found in floor plan for: ${nodeId} → ${nextNode.id} (floor ${node.floor})`);
          console.warn(`   Available routes on floor ${node.floor}:`, floorInfo.paths.map(p => `${p.from}→${p.to}`).join(', '));
          }
        }
      }
    } else if (!floorPlanData) {
      console.warn(`⚠️  Floor plan data not loaded, cannot find waypoints for ${nodeId} → ${nextNode?.id}`);
    }
    
    // Get corridor waypoints - reverse order if route direction is reversed
    let corridorWaypoints = routeInfo?.waypoints || [];
    if (isReversed && corridorWaypoints.length > 0) {
      // Reverse waypoint array to match travel direction
      corridorWaypoints = [...corridorWaypoints].reverse();
      console.log(`   ↻ Reversed ${corridorWaypoints.length} corridor waypoints for reverse direction`);
    }
    
    // Use corridor waypoints directly (no anchor-based pathfinding)
    const finalWaypoints = corridorWaypoints.map(wp => ({
      pixelX: wp.pixelX,
      pixelY: wp.pixelY,
      isAnchor: false
    }));
    
    return {
      ...node,
      isFloorChange: edge?.floorChange || false,
      nextDirection: nextNode ? getDirection(node, nextNode) : null,
      nextNodeId: nextNode?.id || null,
      routeWaypoints: finalWaypoints // Anchor-aware waypoints for this segment
    };
  });
  
  return {
    path: pathDetails,
    totalDistance: distances[endId],
    estimatedTime: estimatedMinutes,
    pathIds: pathArray
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

// Enhanced location finder with normalization
function findLocation(locationStr, preferredFloor = null) {
  if (!locationStr) return null;
  
  const normalized = locationStr.toLowerCase().trim();
  
  // Strategy 1: Exact ID match
  let node = locationGraph.nodes.find(n => n.id.toLowerCase() === normalized);
  if (node) return node;
  
  // Strategy 2: Exact name match (case-insensitive)
  node = locationGraph.nodes.find(n => n.name.toLowerCase() === normalized);
  if (node) return node;
  
  // Strategy 3: Zone number normalization
  // Handle: "zone 3", "zone 03", "zone3", "Zone 3", etc.
  const zoneMatch = normalized.match(/zone\s*0*([1-7])/i);
  if (zoneMatch) {
    const zoneNum = zoneMatch[1].padStart(2, '0'); // Normalize to "03"
    const zoneName = `zone ${zoneNum}`; // "zone 03"
    
    // If floor specified, prefer that floor
    if (preferredFloor !== null) {
      node = locationGraph.nodes.find(n => 
        n.name.toLowerCase() === zoneName && 
        n.floor === preferredFloor
      );
      if (node) return node;
    }
    
    // Otherwise find any matching zone (prefer floor 1)
    const candidates = locationGraph.nodes.filter(n => 
      n.name.toLowerCase() === zoneName || 
      n.id.includes(`zone_${zoneNum}`)
    );
    
    if (candidates.length > 0) {
      // Prefer floor 1 if multiple matches
      return candidates.find(c => c.floor === 1) || candidates[0];
    }
  }
  
  // Strategy 4: Common location names with aliases
  const commonLocations = {
    'entrance': ['main entrance', 'entrance', 'front door'],
    'reception': ['reception', 'reception desk', 'front desk'],
    'lobby': ['lobby', 'main lobby'],
    'lift': ['lift', 'elevator', 'lift lobby', 'elevator lobby'],
    'pantry': ['pantry', 'common pantry', 'kitchen'],
    'tel_equip': ['tel equip', 'telecommunications', 'tel room'],
    'ahu': ['ahu', 'air handling', 'ahu room'],
    'meter': ['meter', 'meter room'],
    'lav_f': ['female lav', 'female lavatory', 'female restroom', 'women\'s restroom', 'women\'s lavatory', 'ladies room', 'ladies lavatory', 'women restroom', 'women lavatory', 'female lav', 'female lavatory', 'female lav'],
    'lav_m': ['male lav', 'male lavatory', 'male restroom', 'men\'s restroom', 'men\'s lavatory', 'men room', 'men lavatory', 'men restroom', 'male lav'],
    'restroom_gf_f': ['ground floor female', 'gf female restroom', 'ground floor women'],
    'restroom_gf_m': ['ground floor male', 'gf male restroom', 'ground floor men'],
  };
  
  for (const [key, aliases] of Object.entries(commonLocations)) {
    // Check if normalized string matches any alias (bidirectional matching)
    const matchesAlias = aliases.some(alias => {
      const aliasLower = alias.toLowerCase();
      return normalized.includes(aliasLower) || 
             aliasLower.includes(normalized) ||
             normalized === aliasLower ||
             // Also check if normalized contains key parts (e.g., "female lav" matches "lav_f")
             (key.includes('lav_f') && /female|women|ladies/i.test(normalized) && /lav|restroom|toilet|washroom/i.test(normalized)) ||
             (key.includes('lav_m') && /male|men|gentlemen/i.test(normalized) && /lav|restroom|toilet|washroom/i.test(normalized));
    });
    
    if (matchesAlias) {
      // For lavatories, prefer floor 1 if no floor specified
      const searchFloor = preferredFloor !== null ? preferredFloor : (key.includes('lav') ? 1 : null);
      
      node = locationGraph.nodes.find(n => {
        const idMatch = n.id.includes(key);
        const floorMatch = searchFloor === null || n.floor === searchFloor;
        return idMatch && floorMatch;
      });
      
      // If not found with floor preference, try any floor
      if (!node && searchFloor !== null) {
        node = locationGraph.nodes.find(n => n.id.includes(key));
      }
      
      if (node) {
        console.log(`✅ Found location via alias: "${locationStr}" -> ${node.id} (${node.name})`);
        return node;
      }
    }
  }
  
  // Strategy 5: Service area keyword matching (lavatory, restroom, etc.)
  if (normalized.includes('lavatory') || normalized.includes('restroom') || normalized.includes('toilet') || normalized.includes('washroom')) {
    const isFemale = /(female|women|ladies|woman)/i.test(normalized);
    const isMale = /(male|men|gentlemen|man)/i.test(normalized);
    
    if (isFemale) {
      // Prefer floor 1 if not specified
      const targetFloor = preferredFloor !== null ? preferredFloor : 1;
      node = locationGraph.nodes.find(n => 
        (n.id.includes('lav_f') || n.id.includes('restroom_gf_f')) &&
        (preferredFloor === null || n.floor === targetFloor)
      );
      if (node) return node;
      // Fallback: any female lavatory
      node = locationGraph.nodes.find(n => n.id.includes('lav_f') || n.id.includes('restroom_gf_f'));
      if (node) return node;
    } else if (isMale) {
      const targetFloor = preferredFloor !== null ? preferredFloor : 1;
      node = locationGraph.nodes.find(n => 
        (n.id.includes('lav_m') || n.id.includes('restroom_gf_m')) &&
        (preferredFloor === null || n.floor === targetFloor)
      );
      if (node) return node;
      node = locationGraph.nodes.find(n => n.id.includes('lav_m') || n.id.includes('restroom_gf_m'));
      if (node) return node;
    } else {
      // Generic restroom - prefer floor 1
      node = locationGraph.nodes.find(n => 
        (n.id.includes('lav') || n.id.includes('restroom')) &&
        (preferredFloor === null || n.floor === 1)
      );
      if (node) return node;
    }
  }
  
  // Strategy 6: Partial name match (including "Female LAV", "Male LAV" variations)
  node = locationGraph.nodes.find(n => {
    const nameLower = n.name.toLowerCase();
    const idLower = n.id.toLowerCase();
    
    // Check if normalized string matches name or ID
    if (nameLower.includes(normalized) || normalized.includes(nameLower)) {
      return true;
    }
    
    // Special handling for "Female LAV" or "Male LAV" variations
    if ((normalized.includes('female') || normalized.includes('women') || normalized.includes('ladies')) && 
        (normalized.includes('lav') || normalized.includes('restroom') || normalized.includes('toilet'))) {
      if (idLower.includes('lav_f') || nameLower.includes('female') || nameLower.includes('women')) {
        return true;
      }
    }
    
    if ((normalized.includes('male') || normalized.includes('men') || normalized.includes('gentlemen')) && 
        (normalized.includes('lav') || normalized.includes('restroom') || normalized.includes('toilet'))) {
      if (idLower.includes('lav_m') || nameLower.includes('male') || nameLower.includes('men')) {
        return true;
      }
    }
    
    return false;
  });
  if (node) {
    console.log(`✅ Found location via partial name match: "${locationStr}" -> ${node.id} (${node.name})`);
    return node;
  }
  
  // Strategy 7: ID partial match
  node = locationGraph.nodes.find(n => 
    n.id.toLowerCase().includes(normalized) ||
    normalized.includes(n.id.toLowerCase())
  );
  
  if (node) {
    console.log(`✅ Found location via ID match: "${locationStr}" -> ${node.id} (${node.name})`);
    return node;
  }
  
  console.warn(`⚠️  Location not found: "${locationStr}" (normalized: "${normalized}")`);
  return null;
}

// Find path between two locations
router.post('/find-path', (req, res) => {
  try {
    const { from, to } = req.body;
    
    if (!from || !to) {
      return res.status(400).json({ error: 'Both "from" and "to" parameters are required' });
    }
    
    // Extract floor preference if specified (e.g., "zone 3, 1/f" or "zone 3 of 1f")
    const extractFloorPreference = (str) => {
      // Matches: "1/f", "1 f", "floor 1", "1st floor", "1 floor", "ground floor"
      const floorMatch = str.match(/(\d+)\s*(?:st|nd|rd|th)?\s*(?:floor|\/?f)|floor\s*(\d+)|(ground\s*floor|g\/f)/i);
      if (floorMatch) {
        if (floorMatch[3]) return 0; // Ground floor match
        const floorNum = parseInt(floorMatch[1] || floorMatch[2]);
        return floorNum === 0 ? 0 : floorNum;
      }
      return null;
    };
    
    const fromFloor = extractFloorPreference(from);
    const toFloor = extractFloorPreference(to);
    
    // Find nodes using enhanced matching
    const fromNode = findLocation(from, fromFloor);
    const toNode = findLocation(to, toFloor);
    
    console.log(`🔍 Location search: "${from}" → ${fromNode ? `✓ ${fromNode.id} (${fromNode.name})` : '✗ not found'}`);
    console.log(`🔍 Location search: "${to}" → ${toNode ? `✓ ${toNode.id} (${toNode.name})` : '✗ not found'}`);
    
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
    const pixelsPerMeter = floorInfo.scale?.pixelsPerMeter || 12; // Default conversion factor
    
    // First, identify deleted nodes (nodes that exist in floorInfo but not in incoming nodes)
    const existingNodeIds = new Set(floorInfo.nodes.map(n => n.id));
    const incomingNodeIds = new Set(nodes.map(n => n.id));
    const deletedNodeIds = [...existingNodeIds].filter(id => !incomingNodeIds.has(id));
    
    // Remove deleted nodes from floor plan
    if (deletedNodeIds.length > 0) {
      console.log(`🗑️  Deleting ${deletedNodeIds.length} node(s) from floor ${floor}: ${deletedNodeIds.join(', ')}`);
      floorInfo.nodes = floorInfo.nodes.filter(n => !deletedNodeIds.includes(n.id));
      
      // Remove routes connected to deleted nodes
      const routesBefore = floorInfo.paths?.length || 0;
      floorInfo.paths = (floorInfo.paths || []).filter(r => 
        !deletedNodeIds.includes(r.from) && !deletedNodeIds.includes(r.to)
      );
      const routesAfter = floorInfo.paths?.length || 0;
      if (routesBefore !== routesAfter) {
        console.log(`🗑️  Deleted ${routesBefore - routesAfter} route(s) connected to deleted nodes`);
      }
    }
    
    // Also remove deleted nodes and their edges from location graph
    if (deletedNodeIds.length > 0) {
      try {
        const locationGraphPath = path.join(__dirname, '../data/hsitp_locationGraph.json');
        const locationGraphData = JSON.parse(fs.readFileSync(locationGraphPath, 'utf8'));
        
        // Remove nodes
        const nodesBefore = locationGraphData.nodes.length;
        locationGraphData.nodes = locationGraphData.nodes.filter(n => !deletedNodeIds.includes(n.id));
        const nodesAfter = locationGraphData.nodes.length;
        if (nodesBefore !== nodesAfter) {
          console.log(`🗑️  Deleted ${nodesBefore - nodesAfter} node(s) from location graph`);
        }
        
        // Remove edges connected to deleted nodes
        const edgesBefore = locationGraphData.edges.length;
        locationGraphData.edges = locationGraphData.edges.filter(e => 
          !deletedNodeIds.includes(e.from) && !deletedNodeIds.includes(e.to)
        );
        const edgesAfter = locationGraphData.edges.length;
        if (edgesBefore !== edgesAfter) {
          console.log(`🗑️  Deleted ${edgesBefore - edgesAfter} edge(s) connected to deleted nodes from location graph`);
        }
        
        // Write updated location graph back to file
        fs.writeFileSync(locationGraphPath, JSON.stringify(locationGraphData, null, 2), 'utf8');
      } catch (error) {
        console.error(`❌ Error removing deleted nodes from location graph:`, error.message);
        // Don't fail the entire operation if location graph cleanup fails
      }
    }
    
    if (nodes && Array.isArray(nodes)) {
      nodes.forEach(nodeUpdate => {
        const nodeIndex = floorInfo.nodes.findIndex(n => n.id === nodeUpdate.id);
        
        // Convert pixel coordinates to real-world coordinates (meters)
        const realX = nodeUpdate.realX !== undefined 
          ? nodeUpdate.realX 
          : (nodeUpdate.pixelX / pixelsPerMeter);
        const realY = nodeUpdate.realY !== undefined 
          ? nodeUpdate.realY 
          : (nodeUpdate.pixelY / pixelsPerMeter);
        
        if (nodeIndex !== -1) {
          // Update existing node
          floorInfo.nodes[nodeIndex].pixelX = nodeUpdate.pixelX;
          floorInfo.nodes[nodeIndex].pixelY = nodeUpdate.pixelY;
          floorInfo.nodes[nodeIndex].realX = realX;
          floorInfo.nodes[nodeIndex].realY = realY;
          if (nodeUpdate.name) {
            floorInfo.nodes[nodeIndex].name = nodeUpdate.name;
          }
          // Update anchors if provided
          if (nodeUpdate.anchors !== undefined) {
            floorInfo.nodes[nodeIndex].anchors = nodeUpdate.anchors;
            console.log(`🎯 Updated ${nodeUpdate.anchors.length} anchor(s) for node: ${nodeUpdate.id}`);
          }
        } else {
          // Add new node
          const newNode = {
            id: nodeUpdate.id,
            pixelX: nodeUpdate.pixelX,
            pixelY: nodeUpdate.pixelY,
            realX: realX,
            realY: realY,
            marker: nodeUpdate.marker || 'zone',
            name: nodeUpdate.name || nodeUpdate.id
          };
          // Include anchors if provided
          if (nodeUpdate.anchors && Array.isArray(nodeUpdate.anchors)) {
            newNode.anchors = nodeUpdate.anchors;
            console.log(`🎯 Added ${nodeUpdate.anchors.length} anchor(s) for new node: ${nodeUpdate.id}`);
          }
          floorInfo.nodes.push(newNode);
        }
        
        // Also update/add to location graph
        try {
          const locationGraphPath = path.join(__dirname, '../data/hsitp_locationGraph.json');
          const locationGraphData = JSON.parse(fs.readFileSync(locationGraphPath, 'utf8'));
          
          const locationNodeIndex = locationGraphData.nodes.findIndex(n => n.id === nodeUpdate.id);
          if (locationNodeIndex !== -1) {
            // Update existing node in location graph
            locationGraphData.nodes[locationNodeIndex].x = realX;
            locationGraphData.nodes[locationNodeIndex].y = realY;
            if (nodeUpdate.name) {
              locationGraphData.nodes[locationNodeIndex].name = nodeUpdate.name;
            }
            console.log(`✅ Updated location graph node: ${nodeUpdate.id} (x: ${realX}, y: ${realY})`);
          } else {
            // Add new node to location graph
            // Determine node type from marker or default to 'zone'
            const nodeType = nodeUpdate.marker || 
                           (nodeUpdate.id.includes('zone') ? 'zone' :
                            nodeUpdate.id.includes('lift') || nodeUpdate.id.includes('elevator') ? 'elevator' :
                            nodeUpdate.id.includes('stairs') ? 'stairs' :
                            nodeUpdate.id.includes('corridor') ? 'corridor' :
                            nodeUpdate.id.includes('pantry') ? 'facility' :
                            nodeUpdate.id.includes('lav') || nodeUpdate.id.includes('restroom') ? 'facility' :
                            nodeUpdate.id.includes('reception') ? 'reception' :
                            nodeUpdate.id.includes('entrance') ? 'entrance' :
                            'zone');
            
            const newNode = {
              id: nodeUpdate.id,
              name: nodeUpdate.name || nodeUpdate.id,
              floor: floor,
              x: realX,
              y: realY,
              type: nodeType,
              description: nodeUpdate.description || `${nodeUpdate.name || nodeUpdate.id} on floor ${floor}`
            };
            
            locationGraphData.nodes.push(newNode);
            console.log(`✅ Added new node to location graph: ${nodeUpdate.id} (x: ${realX}, y: ${realY}, type: ${nodeType})`);
          }
          
          // Write updated location graph back to file
          fs.writeFileSync(locationGraphPath, JSON.stringify(locationGraphData, null, 2), 'utf8');
        } catch (error) {
          console.error(`❌ Error syncing location graph for node ${nodeUpdate.id}:`, error.message);
          // Don't fail the entire operation if location graph sync fails
        }
      });
    }

    // Update routes/paths if provided
    if (req.body.paths && Array.isArray(req.body.paths)) {
      floorInfo.paths = req.body.paths;
      console.log(`✅ Updated ${req.body.paths.length} routes for floor ${floor}`);
      
      // Also sync routes to location graph edges
      try {
        const locationGraphPath = path.join(__dirname, '../data/hsitp_locationGraph.json');
        const locationGraphData = JSON.parse(fs.readFileSync(locationGraphPath, 'utf8'));
        
        // Process each route and create/update edges
        req.body.paths.forEach(route => {
          const fromNode = locationGraphData.nodes.find(n => n.id === route.from);
          const toNode = locationGraphData.nodes.find(n => n.id === route.to);
          
          if (fromNode && toNode) {
            // Calculate distance for weight (Euclidean distance)
            const dx = toNode.x - fromNode.x;
            const dy = toNode.y - fromNode.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            // Convert meters to seconds (assuming 1.4 m/s walking speed ≈ 0.7 seconds per meter)
            const weight = Math.max(5, Math.round(distance * 0.7)); // Minimum weight of 5
            
            // Check if edge already exists (bidirectional check)
            const existingEdgeIndex = locationGraphData.edges.findIndex(e => 
              (e.from === route.from && e.to === route.to) ||
              (e.from === route.to && e.to === route.from)
            );
            
            if (existingEdgeIndex !== -1) {
              // Update existing edge weight
              locationGraphData.edges[existingEdgeIndex].weight = weight;
              if (route.waypoints && route.waypoints.length > 0) {
                locationGraphData.edges[existingEdgeIndex].hasWaypoints = true;
              }
              console.log(`✅ Updated edge weight: ${route.from} → ${route.to} (weight: ${weight})`);
            } else {
              // Add new edge
              const newEdge = {
                from: route.from,
                to: route.to,
                weight: weight,
                description: `Path from ${fromNode.name} to ${toNode.name}`
              };
              
              // Check if this is a floor change (different floors)
              if (fromNode.floor !== toNode.floor) {
                newEdge.floorChange = true;
              }
              
              // Mark if route has waypoints (for visual representation)
              if (route.waypoints && route.waypoints.length > 0) {
                newEdge.hasWaypoints = true;
              }
              
              locationGraphData.edges.push(newEdge);
              console.log(`✅ Added new edge to location graph: ${route.from} → ${route.to} (weight: ${weight})`);
            }
          } else {
            const missingNodes = [];
            if (!fromNode) missingNodes.push(route.from);
            if (!toNode) missingNodes.push(route.to);
            console.warn(`⚠️ Cannot create edge: nodes not found in location graph: ${missingNodes.join(', ')}`);
          }
        });
        
        // Write updated location graph back to file
        fs.writeFileSync(locationGraphPath, JSON.stringify(locationGraphData, null, 2), 'utf8');
        console.log(`✅ Synced ${req.body.paths.length} routes to location graph edges`);
      } catch (error) {
        console.error(`❌ Error syncing routes to location graph:`, error.message);
        // Don't fail the entire operation if edge sync fails
      }
    }

    // Write updated data back to file
    fs.writeFileSync(floorPlanPath, JSON.stringify(floorPlanData, null, 2), 'utf8');
    
    const nodesUpdated = nodes ? nodes.length : 0;
    const routesUpdated = req.body.paths ? req.body.paths.length : 0;
    
    // Reload the location graph to reflect changes
    const reloadSuccess = loadLocationGraph();
    
    console.log(`✅ Updated ${nodesUpdated} nodes and ${routesUpdated} routes for floor ${floor}`);
    res.json({ 
      success: true, 
      message: `Updated ${nodesUpdated} nodes and ${routesUpdated} routes for floor ${floor}`,
      floor: floor,
      nodesUpdated: nodesUpdated,
      routesUpdated: routesUpdated,
      graphReloaded: reloadSuccess
    });
  } catch (error) {
    console.error('❌ Error updating floor plans:', error);
    res.status(500).json({ error: 'Failed to update floor plans', details: error.message });
  }
});

// Endpoint to manually reload the graph
router.post('/reload-graph', (req, res) => {
  try {
    const success = loadLocationGraph();
    if (success) {
      res.json({ 
        success: true, 
        message: 'Graph reloaded successfully',
        nodes: locationGraph.nodes.length,
        edges: locationGraph.edges.length
      });
    } else {
      res.status(500).json({ error: 'Failed to reload graph' });
    }
  } catch (error) {
    console.error('❌ Error reloading graph:', error);
    res.status(500).json({ error: 'Failed to reload graph', details: error.message });
  }
});

// Export router as default (for use in server/index.js)
module.exports = router;

// Export functions for use in other modules
module.exports.findShortestPath = findShortestPath;
module.exports.findLocation = findLocation;
module.exports.getLocationGraph = () => locationGraph;


