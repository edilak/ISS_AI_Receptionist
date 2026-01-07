/**
 * Verification Script for Value Iteration Agent
 */
const { SpaceNavigationEngine } = require('./server/lib/SpaceNavigationEngine');

async function runVerification() {
    console.log("🧪 Starting Verification...");
    const engine = new SpaceNavigationEngine();

    // Allow engine to initialize
    await new Promise(resolve => setTimeout(resolve, 1000));

    console.log("\n--- Checking Initialization ---");
    console.log("Corridors:", engine.corridors.length);
    console.log("Destinations:", engine.destinations.length);

    // Wait for auto-training (VI) if it started
    // Or force it
    if (!engine.agent.valueMaps || engine.agent.valueMaps.size === 0) {
        console.log("Triggering VI...");
        engine.train();
        // Wait for it
        await new Promise(resolve => {
            const check = setInterval(() => {
                if (!engine.isTraining) {
                    clearInterval(check);
                    resolve();
                }
            }, 100);
        });
    }

    console.log("\n--- Testing Pathfinding ---");

    // Current definitions (from task context scan):
    // Main Entrance: (550, 700)
    // Zone 01 Exit: (1200, 800)
    // There is a corridor connecting them approx (525,650) to (2050, 850)

    // Test Path: Start Point -> End Point (U-Shape)
    // Start: (150, 150) in Left Hall
    // End: (550, 150) in Right Hall
    // Direct path is blocked. Must go Down -> Right -> Up.

    const startX = 150;
    const startY = 150;
    const destQuery = "End Point";

    console.log(`Testing Navigation from (${startX},${startY}) to '${destQuery}' (Expect U-shape path)`);

    const result = await engine.navigate(null, destQuery, {
        floor: 1,
        startX: startX,
        startY: startY
    });

    if (result.success) {
        console.log("✅ Path Found!");
        console.log(`   Steps: ${result.stats.steps}`);
        console.log(`   Distance: ${result.stats.totalDistance.toFixed(0)}`);
        console.log(`   Points: ${result.path.length}`);

        // Sanity check: path should definitely go right (increasing X)
        const first = result.path[0];
        const last = result.path[result.path.length - 1];
        console.log(`   Start: (${first.x.toFixed(0)}, ${first.y.toFixed(0)})`);
        console.log(`   End:   (${last.x.toFixed(0)}, ${last.y.toFixed(0)})`);

        if (last.x > first.x) {
            console.log("   Direction: moving East (Correct)");
        } else {
            console.log("   ⚠️ Direction seems wrong?");
        }
    } else {
        console.error("❌ Path Failed:", result.error);
    }
}

runVerification().catch(console.error);
