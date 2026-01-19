
const { SpaceNavigationEngine } = require('../server/lib/SpaceNavigationEngine');
const ContinuousSpaceRLAgent = require('../server/lib/ContinuousSpaceRLAgent');

// Mock Engine to test specific methods
class TestEngine extends SpaceNavigationEngine {
    constructor() {
        super();
        this.agent = new ContinuousSpaceRLAgent({ gridResolution: 10 });
        // Manually setup agent grid for testing
        this.agent.gridWidth = 20;
        this.agent.gridHeight = 20;
        this.agent.imageDimensions = { width: 200, height: 200 };
        this.agent.floorGrids = new Map();

        // create a simple horizontal corridor 0-200 x 80-120
        // Center is y=100
        const size = 20 * 20;
        this.agent.clearanceMap = new Float32Array(size).fill(0);
        this.agent.navigableGrid = new Uint8Array(size).fill(0);

        for (let y = 0; y < 20; y++) {
            for (let x = 0; x < 20; x++) {
                if (y >= 8 && y <= 12) {
                    this.agent.navigableGrid[y * 20 + x] = 1;
                }
            }
        }
        // Improve clearance map for gradient test
        for (let y = 8; y <= 12; y++) {
            for (let x = 0; x < 20; x++) {
                // increasing clearance towards y=10
                const dy = Math.abs(y - 10);
                const c = 3 - dy; // 3 at center, 1 at edge
                this.agent.clearanceMap[y * 20 + x] = c;
            }
        }
    }
}

async function runTests() {
    console.log("🧪 Starting Path Smoothing Tests...");
    const engine = new TestEngine();

    // 1. Test Centering
    console.log("\n--- Test 1: Centering ---");
    const rawPath = [
        { x: 10, y: 85 }, // Start (fixed)
        { x: 50, y: 85 }, // Should move down to y=100
        { x: 100, y: 85 }, // Should move down to y=100
        { x: 150, y: 85 }, // Should move down to y=100
        { x: 190, y: 85 }  // End (fixed)
    ];

    const centered = engine.centerPathOnSkeleton(rawPath, null);

    let movedCorrectly = true;
    for (let i = 1; i < centered.length - 1; i++) {
        const p = centered[i];
        if (p.y <= 85) {
            console.error(`❌ Point ${i} did not move towards center (y=100)!`);
            movedCorrectly = false;
        }
    }
    if (movedCorrectly) console.log("✅ Centering worked.");

    // 2. Test Simplification
    console.log("\n--- Test 2: Simplification ---");
    const noisyPath = [
        { x: 10, y: 100 },
        { x: 50, y: 102 },
        { x: 100, y: 98 },
        { x: 150, y: 100 },
        { x: 190, y: 100 }
    ];

    const simplified = engine.simplifyPath(noisyPath, 5);
    if (simplified.length < noisyPath.length) {
        console.log("✅ Simplification reduced point count.");
    } else {
        console.error("❌ Simplification did not reduce point count!");
    }

    // 3. Test Orthogonalization
    console.log("\n--- Test 3: Orthogonalization ---");
    const diagPath = [
        { x: 0, y: 0 },
        { x: 10, y: 10 }
    ];
    // Mock clearance for ortho
    engine.agent.getClearance = (x, y) => {
        if (x === 10 && y === 0) return 5;
        if (x === 0 && y === 10) return 1;
        // For A* test logic below:
        if (Math.abs(y - 50) < 10) return 50;
        return 10;
    };
    engine.agent.isPointNavigable = () => true;

    const ortho = engine.orthogonalizePath(diagPath, null);
    if (ortho.length === 3 && ortho[1].x === 10 && ortho[1].y === 0) {
        console.log("✅ Orthogonalization selected correct corner (10,0).");
    } else {
        console.error("❌ Orthogonalization failed.");
    }

    // 4. Test A* Rectilinear Path
    console.log("\n--- Test 4: A* Rectilinear ---");
    // Start (50, 50) -> Dest (150, 60)

    // Mock isGridNavigable for A*
    engine.agent.options = { gridResolution: 10 };
    engine.agent.gridWidth = 20;
    engine.agent.gridHeight = 20;
    engine.agent.isGridNavigable = (x, y, floorGrid) => {
        return true; // Wide open
    };

    // Clearance already mocked above to return 50 near y=50.

    const aStart = { x: 50, y: 50 };
    const aDest = { x: 150, y: 60 };

    const aPath = engine.findRectilinearPath(aStart, aDest, 1);
    console.log(`A* Path Length: ${aPath.length}`);

    if (aPath.length > 0) {
        console.log("✅ A* found a path.");

        // Count turns
        let turns = 0;
        for (let i = 1; i < aPath.length - 1; i++) {
            const dx1 = aPath[i].x - aPath[i - 1].x;
            const dx2 = aPath[i + 1].x - aPath[i].x;
            // Check if direction changed (H->V or V->H)
            const dir1 = dx1 !== 0 ? 'H' : 'V';
            const dir2 = dx2 !== 0 ? 'H' : 'V';
            if (dir1 !== dir2) turns++;
        }
        console.log(`Turns: ${turns}`);
        // Expect minimal turns (e.g. 1 or 2). A staircase would have many.
        if (turns <= 2) {
            console.log("✅ Minimal turns confirmed.");
        } else {
            console.warn(`⚠️ Path has ${turns} turns.`);
        }
    } else {
        console.error("❌ A* failed.");
    }

    if (movedCorrectly && simplified.length < noisyPath.length && ortho.length === 3 && aPath.length > 0) {
        console.log("\n✅ All Tests Passed!");
        process.exit(0);
    } else {
        console.error("\n❌ Some Tests Failed.");
        process.exit(1);
    }
}

runTests();
