/**
 * Coordinate Validation Utilities
 * Validates coordinate data and node positions
 */

/**
 * Validate coordinates are within image bounds
 * @param {number} pixelX - X coordinate
 * @param {number} pixelY - Y coordinate
 * @param {number} imageWidth - Image width
 * @param {number} imageHeight - Image height
 * @returns {Object} Validation result with isValid flag and error message
 */
export function validateCoordinateBounds(pixelX, pixelY, imageWidth, imageHeight) {
  const errors = [];
  
  if (pixelX < 0) {
    errors.push(`X coordinate (${pixelX}) is negative`);
  }
  if (pixelX > imageWidth) {
    errors.push(`X coordinate (${pixelX}) exceeds image width (${imageWidth})`);
  }
  if (pixelY < 0) {
    errors.push(`Y coordinate (${pixelY}) is negative`);
  }
  if (pixelY > imageHeight) {
    errors.push(`Y coordinate (${pixelY}) exceeds image height (${imageHeight})`);
  }
  
  return {
    isValid: errors.length === 0,
    errors: errors,
    message: errors.length > 0 ? errors.join('; ') : 'Valid'
  };
}

/**
 * Validate all nodes in a floor plan
 * @param {Array} nodes - Array of node objects
 * @param {number} imageWidth - Image width
 * @param {number} imageHeight - Image height
 * @returns {Object} Validation results for all nodes
 */
export function validateAllNodes(nodes, imageWidth, imageHeight) {
  const results = {
    valid: [],
    invalid: [],
    summary: {
      total: nodes.length,
      validCount: 0,
      invalidCount: 0
    }
  };
  
  nodes.forEach(node => {
    const validation = validateCoordinateBounds(
      node.pixelX,
      node.pixelY,
      imageWidth,
      imageHeight
    );
    
    if (validation.isValid) {
      results.valid.push({
        id: node.id,
        ...validation
      });
      results.summary.validCount++;
    } else {
      results.invalid.push({
        id: node.id,
        pixelX: node.pixelX,
        pixelY: node.pixelY,
        ...validation
      });
      results.summary.invalidCount++;
    }
  });
  
  return results;
}

/**
 * Check if node is in expected zone/room based on coordinates
 * @param {Object} node - Node object with pixelX, pixelY
 * @param {Object} expectedZone - Expected zone bounds {minX, maxX, minY, maxY}
 * @returns {boolean} True if node is within expected zone
 */
export function validateNodeInZone(node, expectedZone) {
  return (
    node.pixelX >= expectedZone.minX &&
    node.pixelX <= expectedZone.maxX &&
    node.pixelY >= expectedZone.minY &&
    node.pixelY <= expectedZone.maxY
  );
}

/**
 * Calculate distance between two nodes
 * @param {Object} node1 - First node {pixelX, pixelY}
 * @param {Object} node2 - Second node {pixelX, pixelY}
 * @returns {number} Distance in pixels
 */
export function calculateNodeDistance(node1, node2) {
  const dx = node2.pixelX - node1.pixelX;
  const dy = node2.pixelY - node1.pixelY;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Validate floor plan data structure
 * @param {Object} floorPlanData - Floor plan data object
 * @returns {Object} Validation result
 */
export function validateFloorPlanStructure(floorPlanData) {
  const errors = [];
  const warnings = [];
  
  if (!floorPlanData) {
    return {
      isValid: false,
      errors: ['Floor plan data is null or undefined'],
      warnings: []
    };
  }
  
  if (!floorPlanData.floors || !Array.isArray(floorPlanData.floors)) {
    errors.push('Floors array is missing or invalid');
  } else {
    floorPlanData.floors.forEach((floor, index) => {
      if (!floor.image || !floor.image.url) {
        errors.push(`Floor ${index} (${floor.floor}) is missing image URL`);
      }
      
      if (!floor.image || !floor.image.width || !floor.image.height) {
        warnings.push(`Floor ${index} (${floor.floor}) is missing image dimensions`);
      }
      
      if (!floor.nodes || !Array.isArray(floor.nodes)) {
        warnings.push(`Floor ${index} (${floor.floor}) has no nodes defined`);
      } else {
        // Validate each node
        floor.nodes.forEach(node => {
          if (node.pixelX === undefined || node.pixelY === undefined) {
            errors.push(`Node ${node.id} on floor ${floor.floor} is missing coordinates`);
          }
          
          if (floor.image && floor.image.width && floor.image.height) {
            const validation = validateCoordinateBounds(
              node.pixelX,
              node.pixelY,
              floor.image.width,
              floor.image.height
            );
            
            if (!validation.isValid) {
              errors.push(`Node ${node.id} on floor ${floor.floor}: ${validation.message}`);
            }
          }
        });
      }
    });
  }
  
  return {
    isValid: errors.length === 0,
    errors: errors,
    warnings: warnings
  };
}

