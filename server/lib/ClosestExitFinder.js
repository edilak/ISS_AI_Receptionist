/**
 * ClosestExitFinder - Utility for finding closest exits to zones with multiple doors
 * 
 * When a zone has multiple exits (e.g., Zone 01 has north and south doors),
 * this utility helps find the closest exit based on the user's current position.
 */

class ClosestExitFinder {
  constructor(gridGenerator) {
    this.gridGenerator = gridGenerator;
  }

  /**
   * Find the closest exit for a zone
   * @param {Object} params - Parameters
   * @param {number} params.fromX - Starting X position (grid coordinates)
   * @param {number} params.fromY - Starting Y position (grid coordinates)
   * @param {string} params.zone - Zone name to find exits for
   * @returns {Object} Closest exit info or null
   */
  findClosestExit({ fromX, fromY, zone }) {
    const exits = this.gridGenerator.getZoneDestinations(zone);
    
    if (exits.length === 0) {
      return null;
    }
    
    if (exits.length === 1) {
      return {
        ...exits[0],
        distance: this.calculateDistance(fromX, fromY, exits[0].x, exits[0].y),
        isOnlyExit: true
      };
    }
    
    // Find closest exit
    let closest = null;
    let minDistance = Infinity;
    
    for (const exit of exits) {
      const distance = this.calculateDistance(fromX, fromY, exit.x, exit.y);
      
      if (distance < minDistance) {
        minDistance = distance;
        closest = {
          ...exit,
          distance,
          isOnlyExit: false,
          alternativeExits: exits.filter(e => e.id !== exit.id).map(e => ({
            id: e.id,
            name: e.name,
            distance: this.calculateDistance(fromX, fromY, e.x, e.y)
          }))
        };
      }
    }
    
    return closest;
  }

  /**
   * Find closest exit from pixel coordinates
   * @param {Object} params - Parameters
   * @param {number} params.pixelX - Starting X position (pixel coordinates)
   * @param {number} params.pixelY - Starting Y position (pixel coordinates)
   * @param {string} params.zone - Zone name to find exits for
   * @returns {Object} Closest exit info or null
   */
  findClosestExitFromPixel({ pixelX, pixelY, zone }) {
    const gridCoords = this.gridGenerator.pixelToGrid(pixelX, pixelY);
    return this.findClosestExit({
      fromX: gridCoords.x,
      fromY: gridCoords.y,
      zone
    });
  }

  /**
   * Find closest exit from a destination ID
   * @param {Object} params - Parameters
   * @param {string} params.fromId - Starting destination ID
   * @param {string} params.zone - Zone name to find exits for
   * @returns {Object} Closest exit info or null
   */
  findClosestExitFromDestination({ fromId, zone }) {
    const fromDest = this.gridGenerator.destinationCells.get(fromId);
    
    if (!fromDest) {
      throw new Error(`Unknown destination: ${fromId}`);
    }
    
    return this.findClosestExit({
      fromX: fromDest.x,
      fromY: fromDest.y,
      zone
    });
  }

  /**
   * Calculate Euclidean distance between two points
   * @param {number} x1 - First X coordinate
   * @param {number} y1 - First Y coordinate
   * @param {number} x2 - Second X coordinate
   * @param {number} y2 - Second Y coordinate
   * @returns {number} Distance
   */
  calculateDistance(x1, y1, x2, y2) {
    return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
  }

  /**
   * Get all exits for a zone with distances from a starting point
   * @param {Object} params - Parameters
   * @param {number} params.fromX - Starting X position
   * @param {number} params.fromY - Starting Y position
   * @param {string} params.zone - Zone name
   * @returns {Array} Array of exits with distances, sorted by distance
   */
  getAllExitsWithDistances({ fromX, fromY, zone }) {
    const exits = this.gridGenerator.getZoneDestinations(zone);
    
    return exits.map(exit => ({
      ...exit,
      distance: this.calculateDistance(fromX, fromY, exit.x, exit.y),
      distanceInMeters: this.calculateDistance(fromX, fromY, exit.x, exit.y) * 
        (this.gridGenerator.cellSize / 12) // Approximate meters (12 pixels per meter)
    })).sort((a, b) => a.distance - b.distance);
  }

  /**
   * Get recommendation text for which exit to use
   * @param {Object} closestExit - Result from findClosestExit
   * @param {string} language - Language code ('en', 'zh-HK', 'zh-CN')
   * @returns {string} Recommendation text
   */
  getExitRecommendation(closestExit, language = 'en') {
    if (!closestExit) {
      return language === 'en' 
        ? 'No exits found for this zone' 
        : '找不到此區域的出口';
    }
    
    if (closestExit.isOnlyExit) {
      if (language === 'en') {
        return `Head to ${closestExit.name}`;
      }
      return `前往 ${closestExit.name}`;
    }
    
    const distanceText = Math.round(closestExit.distanceInMeters || closestExit.distance);
    
    if (language === 'en') {
      return `Use ${closestExit.name} (${closestExit.facing || 'nearest'} exit, ~${distanceText}m away)`;
    } else if (language === 'zh-HK') {
      const facingText = {
        'north': '北面',
        'south': '南面',
        'east': '東面',
        'west': '西面'
      }[closestExit.facing] || '最近';
      return `請使用 ${closestExit.name} (${facingText}出口，約${distanceText}米)`;
    } else {
      const facingText = {
        'north': '北面',
        'south': '南面',
        'east': '东面',
        'west': '西面'
      }[closestExit.facing] || '最近';
      return `请使用 ${closestExit.name} (${facingText}出口，约${distanceText}米)`;
    }
  }

  /**
   * Check if a destination ID is a zone (has multiple exits)
   * @param {string} id - Destination ID or zone name
   * @returns {boolean} True if it's a zone with multiple exits
   */
  isZone(id) {
    const exits = this.gridGenerator.getZoneDestinations(id);
    return exits.length > 1;
  }

  /**
   * Get zone summary
   * @param {string} zone - Zone name
   * @returns {Object} Zone summary with exit count and positions
   */
  getZoneSummary(zone) {
    const exits = this.gridGenerator.getZoneDestinations(zone);
    
    return {
      zone,
      exitCount: exits.length,
      exits: exits.map(e => ({
        id: e.id,
        name: e.name,
        facing: e.facing,
        position: { x: e.x, y: e.y }
      })),
      hasMultipleExits: exits.length > 1
    };
  }
}

module.exports = ClosestExitFinder;

