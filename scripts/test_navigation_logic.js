
const { SpaceNavigationEngine } = require('../server/lib/SpaceNavigationEngine');

// Subclass to bypass real initialization
class TestEngine extends SpaceNavigationEngine {
    constructor() {
        super();
        // Manually setup what constructor would have set up if it didn't crash or if we need it
        // but initialize() is overridden so it won't load files.
    }

    // Override initialize to prevent file loading and training
    async initialize() {
        console.log("✅ MockEngine: Skipping real initialization.");
        this.corridors = [];
        this.destinations = [];
        this.gridSize = 10;
        // Mock agent immediately (constructor sets real one, we overwrite)
        this.agent = {
            isPointNavigable: () => true,
            isPointInPolygon: () => true,
            findPath: () => ({ success: true, path: [], steps: 0 }),
            setEnvironment: () => { },
            findValidPositions: () => [],
            findNearestNavigablePoint: () => ({ x: 0, y: 0 })
        };
        this.corridorCenters = new Map();
    }
}

// Mock data
const mockCorridors = [
    { id: 'c1', name: 'Corridor F0', floor: 0, polygon: [[0, 0], [10, 0], [10, 10], [0, 10]] },
    { id: 'c2', name: 'Corridor F1', floor: 1, polygon: [[0, 0], [10, 0], [10, 10], [0, 10]] }
];

const mockDestinations = [
    { id: 'd1_f0', name: 'Meeting Room', floor: 0, x: 5, y: 5 },
    { id: 'd1_f1', name: 'Meeting Room', floor: 1, x: 5, y: 5 },
    { id: 'd2_f0', name: 'Pantry', floor: 0, x: 15, y: 15 },
    { id: 'd_unique', name: 'Unique Room', floor: 1, x: 20, y: 20 },
    { id: 'd_lifts', name: 'Lift Lobby', floor: 0, x: 50, y: 50 },
    { id: 'd_lifts2', name: 'Lift Lobby', floor: 1, x: 50, y: 50 }
];

async function runTests() {
    console.log("🧪 Starting Navigation Logic Tests (Mocked Engine)...");

    const engine = new TestEngine();

    // Inject mock data
    engine.corridors = mockCorridors;
    engine.destinations = mockDestinations;

    // Mock internal methods that might be called
    engine.findPathToDestination = (start, dest, floor) => {
        return { success: true, start, destination: dest, floor, stats: { totalDistance: 10 } };
    };
    engine.findMultiFloorPath = (start, dest) => {
        return { success: true, start, destination: dest, isMultiFloor: true, stats: { totalDistance: 100 } };
    };
    engine.getZoneExits = (q, f) => [];
    // Mock isPointInPolygon (superclass might not have it or it delegates to agent?)
    // In original code Check: isPointInPolygon is on `this` or `this.agent`? 
    // Codes says: `this.isPointInPolygon` in Step 2 logic, wait.
    // Line 663: `this.isPointInPolygon(startX, startY, corridor.polygon)`
    // Let's check if `isPointInPolygon` is defined on SpaceNavigationEngine or inherited?
    // It seems to be missing from `SpaceNavigationEngine` class definition in the view we saw?
    // Ah, line 1214: `this.agent.isPointInPolygon`.
    // But line 663 calls `this.isPointInPolygon`.
    // If specific method is missing, we should define it on engine or it will crash.
    // Let's assume it relies on `this.agent.isPointInPolygon` but maybe line 663 is a bug in original code?
    // Let's mock it on engine just in case.
    engine.isPointInPolygon = (x, y, poly) => true;

    let errors = 0;

    // Helper check
    const check = (desc, result, expectedDestFloor, expectedStartFloor) => {
        if (!result.success) {
            console.error(`❌ ${desc}: Failed with error: ${result.error}`);
            errors++;
            return;
        }
        const sFloor = result.start.floor;
        const dFloor = result.destination.floor;
        const sName = result.start.name;
        const dName = result.destination.name;

        // Check resolved floor
        let pass = true;
        if (expectedDestFloor !== null && dFloor !== expectedDestFloor) pass = false;
        if (expectedStartFloor !== null && sFloor !== expectedStartFloor) pass = false;

        if (pass) {
            console.log(`✅ ${desc}: Correctly resolved to S(F${sFloor}) -> D(F${dFloor})`);
        } else {
            console.error(`❌ ${desc}: Expected S(F${expectedStartFloor})->D(F${expectedDestFloor}), got S(F${sFloor})->D(F${dFloor})`);
            errors++;
        }
    };

    try {
        // Test 1: Implicit Priority (Start known on F0 -> Dest should be F0)
        // "Meeting Room" exists on both. Start is explicit coords on F0.
        console.log("--- Test 1 ---");
        const t1 = await engine.navigate(null, "Meeting Room", {
            startX: 5, startY: 5, startFloor: 0
        });
        check("Implicit Priority F0", t1, 0, 0);

        // Test 2: Implicit Priority (Start explicitly F1 -> Dest should be F1)
        console.log("--- Test 2 ---");
        // Note: For explicit coordinates without startFloor, engine tries to detect floor from corridors.
        // We mocked corridors. 
        // Let's pass startFloor explicitly to test the priority logic.
        const t2 = await engine.navigate(null, "Meeting Room", {
            startX: 5, startY: 5, startFloor: 1
        });
        check("Implicit Priority F1", t2, 1, 1);

        // Test 3: Explicit Query "Meeting Room floor 1" (Start F0 -> Dest F1)
        console.log("--- Test 3 ---");
        const t3 = await engine.navigate(null, "Meeting Room floor 1", {
            startX: 5, startY: 5, startFloor: 0
        });
        check("Explicit Dest Query F1", t3, 1, 0);

        // Test 4: Explicit Query "Meeting Room 0 floor" (dest F0, Start F1)
        console.log("--- Test 4 ---");
        const t4 = await engine.navigate(null, "Meeting Room 0 floor", {
            startX: 5, startY: 5, startFloor: 1
        });
        check("Explicit Dest Query F0", t4, 0, 1);

        // Test 5: Unique Destination (Start F0 -> Dest F1 forced)
        console.log("--- Test 5 ---");
        const t5 = await engine.navigate(null, "Unique Room", {
            startX: 5, startY: 5, startFloor: 0
        });
        check("Unique Dest (Cross Floor)", t5, 1, 0);

        // Test 6: Parsing check
        console.log("--- Test 6 ---");
        const p1 = engine.parseFloorFromQuery("Level 2 Meeting Room");
        if (p1.floor === 2 && p1.cleanQuery === "Meeting Room") console.log("✅ Parse 'Level 2' OK");
        else { console.error("❌ Parse 'Level 2' Failed", p1); errors++; }

    } catch (e) {
        console.error("❌ Exception during tests:", e);
        errors++;
    }

    console.log(`\nTests Completed with ${errors} errors.`);
    if (errors > 0) process.exit(1);
}

runTests().catch(e => {
    console.error("Fatal:", e);
    process.exit(1);
});
