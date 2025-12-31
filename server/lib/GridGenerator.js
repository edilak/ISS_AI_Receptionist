/**
 * GridGenerator - Converts polygon corridors to binary navigation grid
 * 
 * This module takes polygon definitions of walkable corridors and converts them
 * into a binary grid where 1 = walkable, 0 = blocked. The grid is used by the
 * RL agent for navigation.
 */

class GridGenerator {
  constructor(options = {}) {
    this.cellSize = options.cellSize || 10; // pixels per cell
    this.width = 0;
    this.height = 0;
    this.grid = null;
    this.destinationCells = new Map(); // Maps destination IDs to grid cells
  }

  /**
   * Generate navigation grid from corridors and image dimensions
   * @param {Object} params - Generation parameters
   * @param {Array} params.corridors - Array of corridor polygons
   * @param {Array} params.destinations - Array of destination points
   * @param {number} params.imageWidth - Width of floor plan image
   * @param {number} params.imageHeight - Height of floor plan image
   * @param {number} params.floor - Floor number to generate grid for
   * @returns {Object} Grid data
   */
  generate({ corridors, destinations, imageWidth, imageHeight, floor }) {
    // Calculate grid dimensions
    this.width = Math.ceil(imageWidth / this.cellSize);
    this.height = Math.ceil(imageHeight / this.cellSize);

    console.log(`Generating grid: ${this.width}x${this.height} cells (cell size: ${this.cellSize}px)`);

    // Initialize grid with zeros (all blocked)
    this.grid = Array(this.height).fill(null).map(() => Array(this.width).fill(0));

    // Filter corridors for current floor
    const floorCorridors = corridors.filter(c => c.floor === floor);
    console.log(`Processing ${floorCorridors.length} corridors for floor ${floor}`);

    // Fill in walkable cells for each corridor polygon
    for (const corridor of floorCorridors) {
      this.fillPolygon(corridor.polygon);
    }

    // Mark destination cells
    const floorDestinations = destinations.filter(d => d.floor === floor);
    this.destinationCells.clear();
    
    for (const dest of floorDestinations) {
      const cellX = Math.floor(dest.x / this.cellSize);
      const cellY = Math.floor(dest.y / this.cellSize);
      
      // Ensure destination is within grid bounds and walkable
      if (this.isValidCell(cellX, cellY)) {
        // Mark as walkable if not already
        this.grid[cellY][cellX] = 1;
        
        // Store destination cell
        this.destinationCells.set(dest.id, {
          x: cellX,
          y: cellY,
          zone: dest.zone,
          name: dest.name,
          pixelX: dest.x,
          pixelY: dest.y,
          facing: dest.facing
        });

        console.log(`Destination ${dest.name} mapped to cell (${cellX}, ${cellY})`);
      }
    }

    // Calculate statistics
    const stats = this.calculateStats();

    return {
      grid: this.grid,
      width: this.width,
      height: this.height,
      cellSize: this.cellSize,
      floor,
      destinations: Object.fromEntries(this.destinationCells),
      stats
    };
  }

  /**
   * Fill a polygon area with walkable cells using scanline algorithm
   * @param {Array} polygon - Array of [x, y] coordinates
   */
  fillPolygon(polygon) {
    if (!polygon || polygon.length < 3) return;

    // Convert pixel coordinates to grid coordinates
    const gridPolygon = polygon.map(([x, y]) => [
      Math.floor(x / this.cellSize),
      Math.floor(y / this.cellSize)
    ]);

    // Get bounding box
    const minX = Math.max(0, Math.min(...gridPolygon.map(p => p[0])));
    const maxX = Math.min(this.width - 1, Math.max(...gridPolygon.map(p => p[0])));
    const minY = Math.max(0, Math.min(...gridPolygon.map(p => p[1])));
    const maxY = Math.min(this.height - 1, Math.max(...gridPolygon.map(p => p[1])));

    // Scanline fill
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        if (this.isPointInPolygon(x, y, gridPolygon)) {
          this.grid[y][x] = 1;
        }
      }
    }

    // Also fill polygon edges to ensure connectivity
    for (let i = 0; i < gridPolygon.length; i++) {
      const [x1, y1] = gridPolygon[i];
      const [x2, y2] = gridPolygon[(i + 1) % gridPolygon.length];
      this.drawLine(x1, y1, x2, y2);
    }
  }

  /**
   * Check if a point is inside a polygon using ray casting algorithm
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   * @param {Array} polygon - Array of [x, y] coordinates
   * @returns {boolean} True if point is inside polygon
   */
  isPointInPolygon(x, y, polygon) {
    let inside = false;
    const n = polygon.length;

    for (let i = 0, j = n - 1; i < n; j = i++) {
      const [xi, yi] = polygon[i];
      const [xj, yj] = polygon[j];

      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
        inside = !inside;
      }
    }

    return inside;
  }

  /**
   * Draw a line on the grid using Bresenham's algorithm
   * @param {number} x1 - Start X
   * @param {number} y1 - Start Y
   * @param {number} x2 - End X
   * @param {number} y2 - End Y
   */
  drawLine(x1, y1, x2, y2) {
    const dx = Math.abs(x2 - x1);
    const dy = Math.abs(y2 - y1);
    const sx = x1 < x2 ? 1 : -1;
    const sy = y1 < y2 ? 1 : -1;
    let err = dx - dy;

    let x = x1;
    let y = y1;

    while (true) {
      if (this.isValidCell(x, y)) {
        this.grid[y][x] = 1;
      }

      if (x === x2 && y === y2) break;

      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        x += sx;
      }
      if (e2 < dx) {
        err += dx;
        y += sy;
      }
    }
  }

  /**
   * Check if cell coordinates are within grid bounds
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   * @returns {boolean} True if valid
   */
  isValidCell(x, y) {
    return x >= 0 && x < this.width && y >= 0 && y < this.height;
  }

  /**
   * Calculate grid statistics
   * @returns {Object} Statistics object
   */
  calculateStats() {
    let walkableCells = 0;
    let blockedCells = 0;

    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.grid[y][x] === 1) {
          walkableCells++;
        } else {
          blockedCells++;
        }
      }
    }

    return {
      totalCells: this.width * this.height,
      walkableCells,
      blockedCells,
      walkablePercentage: ((walkableCells / (this.width * this.height)) * 100).toFixed(2),
      destinationCount: this.destinationCells.size
    };
  }

  /**
   * Get neighbors of a cell (8-directional)
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   * @param {boolean} diagonal - Include diagonal neighbors
   * @returns {Array} Array of neighbor coordinates
   */
  getNeighbors(x, y, diagonal = true) {
    const neighbors = [];
    const directions = diagonal
      ? [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]]
      : [[-1, 0], [0, -1], [0, 1], [1, 0]];

    for (const [dx, dy] of directions) {
      const nx = x + dx;
      const ny = y + dy;

      if (this.isValidCell(nx, ny) && this.grid[ny][nx] === 1) {
        neighbors.push({ x: nx, y: ny });
      }
    }

    return neighbors;
  }

  /**
   * Convert grid coordinates to pixel coordinates (center of cell)
   * @param {number} cellX - Grid X coordinate
   * @param {number} cellY - Grid Y coordinate
   * @returns {Object} Pixel coordinates
   */
  gridToPixel(cellX, cellY) {
    return {
      x: cellX * this.cellSize + this.cellSize / 2,
      y: cellY * this.cellSize + this.cellSize / 2
    };
  }

  /**
   * Convert pixel coordinates to grid coordinates
   * @param {number} pixelX - Pixel X coordinate
   * @param {number} pixelY - Pixel Y coordinate
   * @returns {Object} Grid coordinates
   */
  pixelToGrid(pixelX, pixelY) {
    return {
      x: Math.floor(pixelX / this.cellSize),
      y: Math.floor(pixelY / this.cellSize)
    };
  }

  /**
   * Find closest destination cell from a starting position
   * @param {number} startX - Starting grid X
   * @param {number} startY - Starting grid Y
   * @param {string} zone - Zone name to find exits for
   * @returns {Object} Closest destination info
   */
  findClosestDestination(startX, startY, zone) {
    let closestDest = null;
    let minDistance = Infinity;

    for (const [id, dest] of this.destinationCells) {
      // If zone specified, only consider destinations in that zone
      if (zone && dest.zone !== zone) continue;

      const distance = Math.sqrt(
        Math.pow(dest.x - startX, 2) + Math.pow(dest.y - startY, 2)
      );

      if (distance < minDistance) {
        minDistance = distance;
        closestDest = { id, ...dest, distance };
      }
    }

    return closestDest;
  }

  /**
   * Get all destinations in a zone
   * @param {string} zone - Zone name
   * @returns {Array} Array of destinations
   */
  getZoneDestinations(zone) {
    const results = [];
    for (const [id, dest] of this.destinationCells) {
      if (dest.zone === zone) {
        results.push({ id, ...dest });
      }
    }
    return results;
  }

  /**
   * Validate that destinations are reachable from each other
   * Uses BFS to check connectivity
   * @returns {Object} Validation results
   */
  validateConnectivity() {
    const destArray = Array.from(this.destinationCells.values());
    if (destArray.length < 2) {
      return { valid: true, message: 'Less than 2 destinations, connectivity not required' };
    }

    // Start BFS from first destination
    const start = destArray[0];
    const visited = new Set();
    const queue = [{ x: start.x, y: start.y }];
    visited.add(`${start.x},${start.y}`);

    while (queue.length > 0) {
      const current = queue.shift();
      const neighbors = this.getNeighbors(current.x, current.y);

      for (const neighbor of neighbors) {
        const key = `${neighbor.x},${neighbor.y}`;
        if (!visited.has(key)) {
          visited.add(key);
          queue.push(neighbor);
        }
      }
    }

    // Check if all destinations are reachable
    const unreachable = [];
    for (const dest of destArray) {
      if (!visited.has(`${dest.x},${dest.y}`)) {
        unreachable.push(dest.name);
      }
    }

    if (unreachable.length > 0) {
      return {
        valid: false,
        message: `Unreachable destinations: ${unreachable.join(', ')}`,
        unreachable
      };
    }

    return { valid: true, message: 'All destinations are connected' };
  }

  /**
   * Export grid as a compact format for storage
   * @returns {Object} Compact grid data
   */
  export() {
    // Run-length encode the grid for storage efficiency
    const encoded = [];
    
    for (let y = 0; y < this.height; y++) {
      let count = 1;
      let current = this.grid[y][0];
      
      for (let x = 1; x < this.width; x++) {
        if (this.grid[y][x] === current) {
          count++;
        } else {
          encoded.push([current, count]);
          current = this.grid[y][x];
          count = 1;
        }
      }
      encoded.push([current, count]);
      encoded.push('|'); // Row separator
    }

    return {
      width: this.width,
      height: this.height,
      cellSize: this.cellSize,
      encoded,
      destinations: Object.fromEntries(this.destinationCells)
    };
  }

  /**
   * Import grid from compact format
   * @param {Object} data - Compact grid data
   */
  import(data) {
    this.width = data.width;
    this.height = data.height;
    this.cellSize = data.cellSize;
    this.grid = Array(this.height).fill(null).map(() => Array(this.width).fill(0));
    
    // Decode RLE
    let row = 0;
    let col = 0;
    
    for (const item of data.encoded) {
      if (item === '|') {
        row++;
        col = 0;
      } else {
        const [value, count] = item;
        for (let i = 0; i < count && col < this.width; i++) {
          this.grid[row][col] = value;
          col++;
        }
      }
    }

    // Restore destinations
    this.destinationCells = new Map(Object.entries(data.destinations));
  }

  /**
   * Visualize grid as ASCII art (for debugging)
   * @returns {string} ASCII representation
   */
  toASCII() {
    let result = '';
    
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        // Check if this cell is a destination
        let isDest = false;
        for (const dest of this.destinationCells.values()) {
          if (dest.x === x && dest.y === y) {
            result += 'D';
            isDest = true;
            break;
          }
        }
        
        if (!isDest) {
          result += this.grid[y][x] === 1 ? '.' : '#';
        }
      }
      result += '\n';
    }
    
    return result;
  }
}

module.exports = GridGenerator;

