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

        // Build the grid
        this.buildGrid();

        console.log(`🗺️ RL Environment Initialized:`);
        console.log(`   Dimensions: ${this.imageDimensions.width}x${this.imageDimensions.height}`);
        console.log(`   Grid: ${this.gridWidth}x${this.gridHeight} (Resolution: ${this.options.gridResolution}px)`);
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
     */
    isPointInAnyCorridorRaw(x, y) {
        for (const corridor of this.corridors) {
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
            this.performValueIteration(dest);
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
    performValueIteration(destination) {
        const width = this.gridWidth;
        const height = this.gridHeight;
        const size = width * height;

        // Value array: Float32 for memory efficiency
        // Initialize with a very low value (representing high cost/unreachable)
        const values = new Float32Array(size).fill(-100000);

        // Convert destination to grid coords
        const gx = Math.floor(destination.x / this.options.gridResolution);
        const gy = Math.floor(destination.y / this.options.gridResolution);

        if (gx >= 0 && gx < width && gy >= 0 && gy < height) {
            // Goal State Value = 0 (Cost is 0)
            values[gy * width + gx] = 0;
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
                    if (this.navigableGrid[idx] === 0) continue;
                    // Skip if goal (value fixed at 0)
                    if (x === gx && y === gy) continue;

                    let maxVal = -100000;

                    // Wall proximity penalty (Threshold / Plateau approach)
                    // If we are "safe" (clearance > threshold), no penalty -> standard Shortest Path
                    // If we are close to wall, huge penalty.
                    // This creates a "highway" in the middle of corridors where the agent can take straight lines.
                    const clearance = this.clearanceMap[idx];
                    const SAFE_DISTANCE = 3; // ~60px

                    let wallPenalty = 0;
                    if (clearance < SAFE_DISTANCE) {
                        // Exponential penalty for getting too close to walls
                        wallPenalty = Math.pow(SAFE_DISTANCE - clearance, 2) * 5;
                    }

                    // Check all neighbors
                    for (const n of neighbors) {
                        const nx = x + n.dx;
                        const ny = y + n.dy;

                        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                            const nIdx = ny * width + nx;
                            if (this.navigableGrid[nIdx] === 1) {
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
    findPath(startX, startY, destX, destY, destId) {
        // 1. Check if we have a value map for this destination
        // If exact ID match fails (dynamic dest?), we might need to find closest trained dest
        // For now, assume destId is valid.

        // Convert inputs to grid
        const res = this.options.gridResolution;
        let cx = Math.floor(startX / res);
        let cy = Math.floor(startY / res);

        const targetX = Math.floor(destX / res);
        const targetY = Math.floor(destY / res);

        // If start is blocked, find nearest navigable
        if (!this.isGridNavigable(cx, cy)) {
            const nearest = this.findNearestNavigableGrid(cx, cy);
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
        if (!valueMap) {
            console.log(`⚠️ No pre-computed value map for ${destId}, computing now...`);
            this.performValueIteration({ x: destX, y: destY, id: destId });
            valueMap = this.valueMaps.get(destId);
        }

        const path = [];
        path.push({ x: (cx + 0.5) * res, y: (cy + 0.5) * res });

        let steps = 0;
        const maxSteps = 1000;
        let currentVal = valueMap[cy * this.gridWidth + cx];

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
                        if (this.navigableGrid[ny * this.gridWidth + nx] === 1) {
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

    isGridNavigable(x, y) {
        if (x < 0 || x >= this.gridWidth || y < 0 || y >= this.gridHeight) return false;
        return this.navigableGrid[y * this.gridWidth + x] === 1;
    }

    findNearestNavigableGrid(x, y) {
        // Spiral search
        for (let r = 1; r < 10; r++) {
            for (let dy = -r; dy <= r; dy++) {
                for (let dx = -r; dx <= r; dx++) {
                    const nx = x + dx;
                    const ny = y + dy;
                    if (this.isGridNavigable(nx, ny)) return { x: nx, y: ny };
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
