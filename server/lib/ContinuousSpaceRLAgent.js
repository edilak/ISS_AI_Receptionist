/**
 * Continuous Space RL Agent (Value Iteration Implementation)
 * 
 * Implements Model-Based Reinforcement Learning using Value Iteration.
 * Solves the global optimization problem for the navigation grid to guarantee
 * optimal paths and eliminate "randomness".
 * 
 * Key Features:
 * - Deterministic Value Iteration
 * - Global Optimality for given grid resolution
 * - Obstacle avoidance via polygon usage
 * - Multi-destination support
 */

class ContinuousSpaceRLAgent {
    constructor(options = {}) {
        this.options = {
            gridResolution: 20, // Fine-grained grid for better accuracy (20px)
            discountFactor: 0.99, // High discount to value long-term goal reaching
            collisionCost: 10000,
            stepCost: 1,
            ...options
        };

        // Environment Data
        this.corridors = [];
        this.destinations = [];
        this.imageDimensions = null;

        // Grid System
        this.gridWidth = 0;
        this.gridHeight = 0;
        this.navigableGrid = null; // Boolean[][]
        this.floorGrids = new Map(); // Map<floor, Uint8Array> - Separate grids per floor
        this.floorClearanceMaps = new Map(); // Map<floor, Float32Array> - Separate clearance maps per floor

        // Value Function: Map<GoalId, Float32Array(width * height)>
        // Stores the optimal value to reach a specific destination from any cell
        this.valueMaps = new Map();
    }

    /**
     * Initialize environment with corridors and destinations
     */
    setEnvironment(corridors, destinations, imageDimensions) {
        this.corridors = corridors || [];
        this.destinations = destinations || [];
        this.imageDimensions = imageDimensions;

        // Reset models when environment changes
        this.valueMaps.clear();

        // Build the combined grid (for backward compatibility)
        this.buildGrid();
        
        // Build separate grids per floor for accurate floor-specific pathfinding
        this.buildFloorGrids();

        console.log(`🗺️ RL Environment Initialized:`);
        console.log(`   Dimensions: ${this.imageDimensions.width}x${this.imageDimensions.height}`);
        console.log(`   Grid: ${this.gridWidth}x${this.gridHeight} (Resolution: ${this.options.gridResolution}px)`);
        console.log(`   Corridors: ${this.corridors.length} (F0: ${this.corridors.filter(c => c.floor === 0).length}, F1: ${this.corridors.filter(c => c.floor === 1).length})`);
    }
    
    /**
     * Build separate navigable grids for each floor
     */
    buildFloorGrids() {
        if (!this.imageDimensions) return;
        
        const { width, height } = this.imageDimensions;
        const res = this.options.gridResolution;
        const gridWidth = Math.ceil(width / res);
        const gridHeight = Math.ceil(height / res);
        
        // Get unique floors from corridors
        const floors = [...new Set(this.corridors.map(c => c.floor).filter(f => f !== undefined && f !== null))];
        
        for (const floor of floors) {
            const floorGrid = new Uint8Array(gridWidth * gridHeight);
            let navigableCount = 0;
            
            // Get corridors for this floor
            const floorCorridors = this.corridors.filter(c => c.floor === floor);
            
            // Pre-compute which corridors overlap (for intersection detection)
            const corridorOverlaps = new Map(); // corridorId -> Set of overlapping corridor IDs
            for (const c1 of floorCorridors) {
                corridorOverlaps.set(c1.id, new Set());
                const bbox1 = this.getPolygonBoundingBox(c1.polygon);
                for (const c2 of floorCorridors) {
                    if (c1.id !== c2.id) {
                        const bbox2 = this.getPolygonBoundingBox(c2.polygon);
                        // Check if bounding boxes overlap
                        if (bbox1.minX < bbox2.maxX && bbox1.maxX > bbox2.minX &&
                            bbox1.minY < bbox2.maxY && bbox1.maxY > bbox2.minY) {
                            corridorOverlaps.get(c1.id).add(c2.id);
                        }
                    }
                }
            }
            
            for (let y = 0; y < gridHeight; y++) {
                for (let x = 0; x < gridWidth; x++) {
                    const cx = (x + 0.5) * res;
                    const cy = (y + 0.5) * res;
                    
                    // Check if CENTER is inside a corridor (primary check)
                    let isNavigable = this.isPointInAnyCorridorRaw(cx, cy, floor);
                    
                    // If center is not in corridor, check corners
                    if (!isNavigable) {
                        const corners = [
                            [x * res, y * res],
                            [(x + 1) * res, y * res],
                            [x * res, (y + 1) * res],
                            [(x + 1) * res, (y + 1) * res]
                        ];
                        
                        // Find which corridor(s) the corners touch
                        const touchedCorridorIds = new Set();
                        for (const [px, py] of corners) {
                            for (const corridor of floorCorridors) {
                                if (this.isPointInPolygon(px, py, corridor.polygon)) {
                                    touchedCorridorIds.add(corridor.id);
                                }
                            }
                        }
                        
                        if (touchedCorridorIds.size === 1) {
                            // Corners touch only ONE corridor - definitely navigable (not a bridge)
                            isNavigable = true;
                        } else if (touchedCorridorIds.size > 1) {
                            // Corners touch MULTIPLE corridors
                            // This is valid ONLY if those corridors actually overlap (intersection)
                            // Check if ALL touched corridors are connected (form a valid intersection)
                            const touchedArray = [...touchedCorridorIds];
                            let allConnected = true;
                            for (let i = 0; i < touchedArray.length && allConnected; i++) {
                                for (let j = i + 1; j < touchedArray.length && allConnected; j++) {
                                    const id1 = touchedArray[i];
                                    const id2 = touchedArray[j];
                                    // Check if these two corridors overlap
                                    if (!corridorOverlaps.get(id1)?.has(id2)) {
                                        allConnected = false;
                                    }
                                }
                            }
                            if (allConnected) {
                                isNavigable = true;
                            }
                        }
                    }
                    
                    if (isNavigable) {
                        floorGrid[y * gridWidth + x] = 1;
                        navigableCount++;
                    } else {
                        floorGrid[y * gridWidth + x] = 0;
                    }
                }
            }
            
            this.floorGrids.set(floor, floorGrid);
            console.log(`   Floor ${floor} grid: ${navigableCount} navigable cells`);
            
            // Compute clearance map for this floor
            const floorClearanceMap = this.computeClearanceMapForGrid(floorGrid, gridWidth, gridHeight);
            this.floorClearanceMaps.set(floor, floorClearanceMap);
        }
    }

    /**
     * Compute clearance map for a specific grid
     * @param {Uint8Array} grid - The navigable grid (1 = navigable, 0 = blocked)
     * @param {number} width - Grid width
     * @param {number} height - Grid height
     * @returns {Float32Array} Clearance map
     */
    computeClearanceMapForGrid(grid, width, height) {
        const size = width * height;
        const clearanceMap = new Float32Array(size).fill(0);

        // Initialize with max distance
        const maxDist = width + height;
        for (let i = 0; i < size; i++) {
            if (grid[i] === 0) {
                clearanceMap[i] = 0; // Obstacles have 0 clearance
            } else {
                clearanceMap[i] = maxDist;
            }
        }

        // Two-pass algorithm (Manhattan distance transform)
        // Pass 1: Top-Left to Bottom-Right
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = y * width + x;
                if (grid[idx] === 0) continue;

                let minVal = clearanceMap[idx];
                if (x > 0) minVal = Math.min(minVal, clearanceMap[idx - 1] + 1);
                if (y > 0) minVal = Math.min(minVal, clearanceMap[idx - width] + 1);
                clearanceMap[idx] = minVal;
            }
        }

        // Pass 2: Bottom-Right to Top-Left
        for (let y = height - 1; y >= 0; y--) {
            for (let x = width - 1; x >= 0; x--) {
                const idx = y * width + x;
                if (grid[idx] === 0) continue;

                let minVal = clearanceMap[idx];
                if (x < width - 1) minVal = Math.min(minVal, clearanceMap[idx + 1] + 1);
                if (y < height - 1) minVal = Math.min(minVal, clearanceMap[idx + width] + 1);
                clearanceMap[idx] = minVal;
            }
        }

        return clearanceMap;
    }

    /**
     * Build the discrete grid from continuous polygons
     */
    buildGrid() {
        if (!this.imageDimensions) return;

        const { width, height } = this.imageDimensions;
        const res = this.options.gridResolution;

        this.gridWidth = Math.ceil(width / res);
        this.gridHeight = Math.ceil(height / res);

        // Initialize Navigable Grid
        this.navigableGrid = new Uint8Array(this.gridWidth * this.gridHeight); // 1 = navigable, 0 = blocked

        let navigableCount = 0;
        for (let y = 0; y < this.gridHeight; y++) {
            for (let x = 0; x < this.gridWidth; x++) {
                // Sample multiple points in the cell to prevent "gaps" between touching polygons
                // If ANY point (Center, TL, TR, BR, BL) is inside, the cell is navigable.
                const cx = (x + 0.5) * res;
                const cy = (y + 0.5) * res;

                // Check center first (most likely)
                let isNavigable = this.isPointInAnyCorridorRaw(cx, cy);

                if (!isNavigable) {
                    // Check corners if center failed (handling edge cases and seams)
                    const corners = [
                        [x * res, y * res],             // TL
                        [(x + 1) * res, y * res],       // TR
                        [x * res, (y + 1) * res],       // BL
                        [(x + 1) * res, (y + 1) * res]  // BR
                    ];

                    for (const [px, py] of corners) {
                        if (this.isPointInAnyCorridorRaw(px, py)) {
                            isNavigable = true;
                            break;
                        }
                    }
                }

                if (isNavigable) {
                    this.navigableGrid[y * this.gridWidth + x] = 1;
                    navigableCount++;
                } else {
                    this.navigableGrid[y * this.gridWidth + x] = 0;
                }
            }
        }

        // Compute Clearance Map (Distance to nearest obstacle)
        // This is used to add a cost penalty for hugging walls, encouraging center-line paths.
        this.computeClearanceMap();

        console.log(`   Navigable Cells: ${navigableCount} / ${this.gridWidth * this.gridHeight}`);
    }

    /**
     * Compute clearance for each cell (Manhattan distance to nearest obstacle)
     */
    computeClearanceMap() {
        const width = this.gridWidth;
        const height = this.gridHeight;
        const size = width * height;
        this.clearanceMap = new Float32Array(size).fill(0); // Store distance

        // Initialize with max distance
        const maxDist = width + height;
        for (let i = 0; i < size; i++) {
            if (this.navigableGrid[i] === 0) {
                this.clearanceMap[i] = 0; // Obstacles have 0 clearance
            } else {
                this.clearanceMap[i] = maxDist;
            }
        }

        // Two-pass algorithm (Manhattan distance transform)
        // Pass 1: Top-Left to Bottom-Right
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = y * width + x;
                if (this.navigableGrid[idx] === 0) continue;

                let minVal = this.clearanceMap[idx];
                if (x > 0) minVal = Math.min(minVal, this.clearanceMap[idx - 1] + 1);
                if (y > 0) minVal = Math.min(minVal, this.clearanceMap[idx - width] + 1);
                this.clearanceMap[idx] = minVal;
            }
        }

        // Pass 2: Bottom-Right to Top-Left
        for (let y = height - 1; y >= 0; y--) {
            for (let x = width - 1; x >= 0; x--) {
                const idx = y * width + x;
                if (this.navigableGrid[idx] === 0) continue;

                let minVal = this.clearanceMap[idx];
                if (x < width - 1) minVal = Math.min(minVal, this.clearanceMap[idx + 1] + 1);
                if (y < height - 1) minVal = Math.min(minVal, this.clearanceMap[idx + width] + 1);
                this.clearanceMap[idx] = minVal;
            }
        }
    }

    /**
     * Check if point is inside any corridor polygon
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     * @param {number|null} floor - Optional floor filter (0, 1, or null for all floors)
     */
    isPointInAnyCorridorRaw(x, y, floor = null) {
        const corridorsToCheck = floor !== null 
            ? this.corridors.filter(c => c.floor === floor)
            : this.corridors;
            
        for (const corridor of corridorsToCheck) {
            if (this.isPointInPolygon(x, y, corridor.polygon)) {
                return true;
            }
        }
        return false;
    }

    isPointInPolygon(x, y, polygon) {
        if (!polygon || polygon.length < 3) return false;
        let inside = false;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const xi = polygon[i][0], yi = polygon[i][1];
            const xj = polygon[j][0], yj = polygon[j][1];
            const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }

    /**
     * Get bounding box of a polygon
     */
    getPolygonBoundingBox(polygon) {
        if (!polygon || polygon.length === 0) {
            return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
        }
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const [x, y] of polygon) {
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
        }
        return { minX, maxX, minY, maxY };
    }

    /**
     * TRAIN: Perform Value Iteration for all destinations
     * This computes the optimal policy for the entire floor.
     */
    async train(episodes = 0, progressCallback = () => { }) {
        if (!this.navigableGrid) return { success: false, error: "Environment not set" };

        console.log('🧠 Starting Value Iteration...');
        const startTime = Date.now();

        // We compute a value map for EACH unique destination location
        // Optimization: Group destinations that are close to each other? 
        // For now, solve for each destination independently.

        let completed = 0;
        const total = this.destinations.length;

        for (const dest of this.destinations) {
            // Pass the destination's floor to use the correct grid
            this.performValueIteration(dest, dest.floor);
            completed++;
            if (progressCallback) progressCallback((completed / total) * 100);

            // Yield to event loop occasionally to not block server
            if (completed % 5 === 0) await new Promise(r => setTimeout(r, 10));
        }

        const duration = Date.now() - startTime;
        console.log(`✅ Value Iteration Complete in ${duration}ms`);

        return { success: true, duration };
    }

    /**
     * Core Value Iteration Algorithm
     * V(s) <- max_a ( R(s,a) + gamma * V(s') )
     * Here specifically: V(s) = -Cost(s, dest)
     * We initialize Goal = 0, others = -Infinity
     * And propagate values.
     */
    performValueIteration(destination, floor = null, grid = null, clearanceMap = null) {
        const width = this.gridWidth;
        const height = this.gridHeight;
        const size = width * height;
        
        // Determine floor to use:
        // 1. Explicit 'floor' argument
        // 2. 'destination.floor' property
        // 3. Fallback to null (combined grid)
        const targetFloor = floor !== null ? floor : (destination.floor !== undefined ? destination.floor : null);

        // Use floor-specific grid if available
        const useGrid = grid || ((targetFloor !== null && this.floorGrids.has(targetFloor)) 
            ? this.floorGrids.get(targetFloor)
            : this.navigableGrid);

        // Use floor-specific clearance map if available
        const useClearanceMap = clearanceMap || ((targetFloor !== null && this.floorClearanceMaps.has(targetFloor))
            ? this.floorClearanceMaps.get(targetFloor)
            : this.clearanceMap);

        // Value array: Float32 for memory efficiency
        // Initialize with a very low value (representing high cost/unreachable)
        const values = new Float32Array(size).fill(-100000);

        // Convert destination to grid coords
        const gx = Math.floor(destination.x / this.options.gridResolution);
        const gy = Math.floor(destination.y / this.options.gridResolution);

        if (gx >= 0 && gx < width && gy >= 0 && gy < height) {
            // Check if exact destination is navigable
            if (useGrid[gy * width + gx] === 1) {
                values[gy * width + gx] = 0;
                console.log(`   📍 Destination ${destination.name} at grid (${gx},${gy}) is navigable`);
            } else {
                // If not navigable (e.g. inside wall), snap to nearest valid cell
                // This fixes the issue where path cannot be found TO a point, but can be found FROM it.
                // (Start points are auto-snapped by findPath, but Destinations used as VI seeds were not)
                console.log(`   ⚠️ Destination ${destination.name} at grid (${gx},${gy}) is NOT navigable, searching nearby...`);
                const snapped = this.findNearestNavigableGrid(gx, gy, useGrid);
                if (snapped) {
                    values[snapped.y * width + snapped.x] = 0;
                    console.log(`   📍 Snapped destination ${destination.name} from (${gx},${gy}) to (${snapped.x},${snapped.y})`);
                } else {
                    console.warn(`   ❌ Could not find ANY reachable point for destination ${destination.name}`);
                }
            }
        }

        const gamma = this.options.discountFactor;
        let changed = true;
        let iterations = 0;
        const maxIterations = 1000; // Safety break

        // Pre-calculate neighbor offsets (8-way connectivity)
        const neighbors = [
            { dx: 0, dy: -1, cost: 1 },  // N
            { dx: 1, dy: -1, cost: 1.414 }, // NE
            { dx: 1, dy: 0, cost: 1 },   // E
            { dx: 1, dy: 1, cost: 1.414 },  // SE
            { dx: 0, dy: 1, cost: 1 },   // S
            { dx: -1, dy: 1, cost: 1.414 }, // SW
            { dx: -1, dy: 0, cost: 1 },  // W
            { dx: -1, dy: -1, cost: 1.414 } // NW
        ];

        while (changed && iterations < maxIterations) {
            changed = false;
            iterations++;

            // Parallel update buffer (optional, but standard VI requires synchronous updates or double buffering)
            // Gauss-Seidel updates (in-place) usually converge faster. We'll use in-place.

            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const idx = y * width + x;

                    // Skip if blocked
                    if (useGrid[idx] === 0) continue;
                    // Skip if goal (value fixed at 0)
                    if (x === gx && y === gy) continue;

                    let maxVal = -100000;

                    // Wall proximity penalty (Threshold / Plateau approach)
                    // If we are "safe" (clearance > threshold), no penalty -> standard Shortest Path
                    // If we are close to wall, small penalty.
                    // REDUCED for narrow corridors - original values caused oscillation
                    const clearance = useClearanceMap[idx];
                    const SAFE_DISTANCE = 1; // Reduced from 3 - only penalize cells DIRECTLY adjacent to walls

                    let wallPenalty = 0;
                    if (clearance < SAFE_DISTANCE) {
                        // Mild penalty for wall-adjacent cells
                        wallPenalty = (SAFE_DISTANCE - clearance) * 2; // Reduced from 5
                    }

                    // Check all neighbors
                    for (const n of neighbors) {
                        const nx = x + n.dx;
                        const ny = y + n.dy;

                        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                            const nIdx = ny * width + nx;
                            if (useGrid[nIdx] === 1) {
                                // Value calculation:
                                // Reward = -StepCost * Distance * (1 + WallPenalty)
                                // V(s) = R + gamma * V(s')
                                const stepCost = n.cost * this.options.stepCost * (1 + wallPenalty);
                                const v = (-stepCost) + (gamma * values[nIdx]);
                                if (v > maxVal) maxVal = v;
                            }
                        }
                    }

                    if (Math.abs(maxVal - values[idx]) > 0.01) {
                        values[idx] = maxVal;
                        changed = true;
                    }
                }
            }
        }

        this.valueMaps.set(destination.id, values);
        // console.log(`   Solved destination ${destination.id} in ${iterations} iterations`);
    }

    /**
     * Find path using the computed Value Map
     * This effectively performs Gradient Ascent on the value function.
     */
    findPath(startX, startY, destX, destY, destId, floor = null) {
        // 1. Check if we have a value map for this destination
        // If exact ID match fails (dynamic dest?), we might need to find closest trained dest
        // For now, assume destId is valid.

        // Convert inputs to grid
        const res = this.options.gridResolution;
        let cx = Math.floor(startX / res);
        let cy = Math.floor(startY / res);

        const targetX = Math.floor(destX / res);
        const targetY = Math.floor(destY / res);

        // Use floor-specific grid if available
        const navigableGrid = (floor !== null && this.floorGrids.has(floor)) 
            ? this.floorGrids.get(floor)
            : this.navigableGrid;

        // Use floor-specific clearance map if available
        const clearanceMap = (floor !== null && this.floorClearanceMaps.has(floor))
            ? this.floorClearanceMaps.get(floor)
            : this.clearanceMap;

        // If start is blocked, find nearest navigable
        if (!this.isGridNavigable(cx, cy, navigableGrid)) {
            const nearest = this.findNearestNavigableGrid(cx, cy, navigableGrid);
            if (nearest) {
                cx = nearest.x;
                cy = nearest.y;
                console.log(`   Adjusted start to ${cx},${cy}`);
            } else {
                return { success: false, error: "Start position not navigable" };
            }
        }

        // Get value map
        let valueMap = this.valueMaps.get(destId);

        // If no pre-computed map for this specific ID (maybe generic coordinate?), 
        // we should really compute it on demand or fail. 
        // Fallback: If map missing, Run VI for this destination immediately (it's fast)
        // Use floor-specific grid if available
        if (!valueMap) {
            console.log(`⚠️ No pre-computed value map for ${destId}, computing now...`);
            this.performValueIteration({ x: destX, y: destY, id: destId }, floor, navigableGrid, clearanceMap);
            valueMap = this.valueMaps.get(destId);
        }

        const path = [];
        path.push({ x: (cx + 0.5) * res, y: (cy + 0.5) * res });

        let steps = 0;
        const maxSteps = 1000;
        let currentVal = valueMap[cy * this.gridWidth + cx];

        // Debug: Check if start position has a valid value (connected to destination)
        console.log(`   🔍 Start grid (${cx},${cy}) has value: ${currentVal.toFixed(2)}`);
        if (currentVal <= -99999) {
            console.log(`   ❌ Start position value is -100000, meaning it's NOT connected to destination in the value map!`);
        }

        while ((cx !== targetX || cy !== targetY) && steps < maxSteps) {
            steps++;

            // Look for best neighbor
            let bestNx = cx;
            let bestNy = cy;
            let bestVal = -Infinity;

            // 8-way check
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    if (dx === 0 && dy === 0) continue;

                    const nx = cx + dx;
                    const ny = cy + dy;

                    if (nx >= 0 && nx < this.gridWidth && ny >= 0 && ny < this.gridHeight) {
                        if (navigableGrid[ny * this.gridWidth + nx] === 1) {
                            const val = valueMap[ny * this.gridWidth + nx];
                            if (val > bestVal) {
                                bestVal = val;
                                bestNx = nx;
                                bestNy = ny;
                            }
                        }
                    }
                }
            }

            // Check if stuck (local maxima or flat region - shouldn't happen with VI)
            if (bestVal <= currentVal && (bestNx === cx && bestNy === cy)) {
                console.warn("⚠️ Stuck in local optima (should not happen with VI)");
                break;
            }

            // Using strict > might cause issues if values are equal? No, we take first or random?
            // Actually, bestVal > -Infinity check is enough.
            // Also check if we are going backwards?
            // With VI, values should strictly increase towards goal (or decrease in cost).

            cx = bestNx;
            cy = bestNy;
            currentVal = bestVal;

            path.push({ x: (cx + 0.5) * res, y: (cy + 0.5) * res });

            // Goal reached check
            if (cx === targetX && cy === targetY) {
                break;
            }
        }

        return {
            success: steps < maxSteps,
            path: path,
            steps: steps
        };
    }

    isGridNavigable(x, y, grid = null) {
        if (x < 0 || x >= this.gridWidth || y < 0 || y >= this.gridHeight) return false;
        const useGrid = grid || this.navigableGrid;
        return useGrid[y * this.gridWidth + x] === 1;
    }

    findNearestNavigableGrid(x, y, grid = null) {
        const useGrid = grid || this.navigableGrid;
        // Spiral search with larger radius for narrow corridors
        for (let r = 1; r < 25; r++) {
            for (let dy = -r; dy <= r; dy++) {
                for (let dx = -r; dx <= r; dx++) {
                    const nx = x + dx;
                    const ny = y + dy;
                    if (this.isGridNavigable(nx, ny, useGrid)) return { x: nx, y: ny };
                }
            }
        }
        return null;
    }

    // -- Legacy/Helper Methods to maintain interface compatibility -- //

    importModel(data) {
        // VI maps are fast to compute, we might not even need to load/save massive JSONs.
        // But we can.
        // For now, let's just trigger training which is fast.
        console.log("Method 'importModel' called - VI agent prefers fresh component computation.");
    }

    exportModel() {
        return {}; // Not saving massive value maps unless needed
    }

    isPointNavigable(x, y) {
        if (!this.imageDimensions) return false;
        const res = this.options.gridResolution;
        const gx = Math.floor(x / res);
        const gy = Math.floor(y / res);
        return this.isGridNavigable(gx, gy);
    }

    findNearestNavigablePoint(x, y) {
        const res = this.options.gridResolution;
        const gx = Math.floor(x / res);
        const gy = Math.floor(y / res);
        const nearest = this.findNearestNavigableGrid(gx, gy);
        if (nearest) {
            return { x: (nearest.x + 0.5) * res, y: (nearest.y + 0.5) * res };
        }
        return null;
    }

    /**
   * Get agent statistics
   */
    getStats() {
        return {
            gridWidth: this.gridWidth,
            gridHeight: this.gridHeight,
            resolution: this.options.gridResolution,
            navigableCells: this.navigableGrid ? this.navigableGrid.reduce((a, b) => a + b, 0) : 0,
            cachedDestinations: this.valueMaps.size
        };
    }

    /**
     * Find ANY valid position (for random start)
     */
    findValidPositions(count = 1) {
        const list = [];
        if (!this.navigableGrid) return list;

        // Random sampling
        let attempts = 0;
        const res = this.options.gridResolution;

        while (list.length < count && attempts < 1000) {
            const x = Math.floor(Math.random() * this.gridWidth);
            const y = Math.floor(Math.random() * this.gridHeight);
            if (this.navigableGrid[y * this.gridWidth + x] === 1) {
                list.push({ x: (x + 0.5) * res, y: (y + 0.5) * res });
            }
            attempts++;
        }
        return list;
    }
}

module.exports = ContinuousSpaceRLAgent;
