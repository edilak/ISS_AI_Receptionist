const { SpaceNavigationEngine } = require('./server/lib/SpaceNavigationEngine');

async function testNavigation() {
    console.log("🔍 Debugging Navigation...");
    const engine = new SpaceNavigationEngine();
    await engine.loadDefinitions();

    console.log(`Loaded ${engine.destinations.length} destinations.`);
    engine.destinations.forEach(d => console.log(` - "${d.name}" (Floor ${d.floor})`));

    const queries = [
        "End Point",
        "end point",
        "end",
        "endpoint"
    ];

    for (const q of queries) {
        const dest = engine.findDestination(q, 1);
        if (dest) {
            console.log(`✅ Query "${q}" matched: "${dest.name}"`);
        } else {
            console.log(`❌ Query "${q}" NOT matched`);
        }
    }
}

testNavigation().catch(console.error);
