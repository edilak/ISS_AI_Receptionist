const { SpaceNavigationEngine } = require('./server/lib/SpaceNavigationEngine');

async function testStats() {
    console.log("Stats Verification...");
    const engine = new SpaceNavigationEngine();

    // Test getStats
    try {
        const stats = engine.getStats();
        console.log("✅ getStats() works:", stats);

        if (typeof stats.agent.navigableCells === 'number') {
            console.log("✅ Agent stats structure correct");
        } else {
            console.error("❌ Agent stats structure incorrect");
        }
    } catch (e) {
        console.error("❌ getStats() failed:", e);
    }
}

testStats().catch(console.error);
