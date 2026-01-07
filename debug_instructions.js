const { SpaceNavigationEngine } = require('./server/lib/SpaceNavigationEngine');

// Mock function to replicate chat.js logic (since it's not exported)
const formatNodeLabel = (node) => {
    if (!node) return '';
    return node.displayName || node.name || node.locationName || node.id || '';
};

const calculateTurn = (p1, p2, p3) => {
    const v1 = { x: p2.x - p1.x, y: p2.y - p1.y };
    const v2 = { x: p3.x - p2.x, y: p3.y - p2.y };
    const cross = v1.x * v2.y - v1.y * v2.x;

    if (Math.abs(cross) < 1000) return 'straight';
    return cross > 0 ? 'left' : 'right';
};

const buildStepSummary = (steps = []) => {
    if (steps.length < 2) return 'You are already there.';

    const segments = [];
    let currentSegment = {
        name: steps[0].locationName || 'Start',
        start: steps[0],
        end: steps[0]
    };

    for (let i = 1; i < steps.length; i++) {
        const pt = steps[i];
        const name = pt.locationName || 'Corridor';

        if (name !== currentSegment.name) {
            currentSegment.end = steps[i - 1];
            if (currentSegment.start !== currentSegment.end) {
                segments.push(currentSegment);
            }
            currentSegment = {
                name: name,
                start: steps[i - 1],
                end: pt
            };
        } else {
            currentSegment.end = pt;
        }
    }
    segments.push(currentSegment);

    return segments.map((seg, idx) => {
        const isLast = idx === segments.length - 1;
        const locName = formatNodeLabel({ name: seg.name }).replace(/_/g, ' ');

        if (idx === 0) return `Start at ${locName}.`;

        const prevSeg = segments[idx - 1];
        const turn = calculateTurn(prevSeg.start, prevSeg.end, seg.end);
        const turnText = turn === 'straight' ? 'Continue' : `Turn ${turn}`;

        if (isLast) return `${turnText} into ${locName} and arrive at destination.`;
        return `${turnText} into ${locName} and go straight.`;
    }).join(' ');
};

async function debugInstructions() {
    console.log("🔍 Debugging Instructions...");
    const engine = new SpaceNavigationEngine();
    await engine.loadDefinitions(); // Load the U-shape definitions

    // Simulate a path: Start (150,150) -> Top-Left -> Bottom-Left -> Bottom-Right -> Top-Right -> End (650,150)
    // Left Hall rect: 110,150 to 190,610
    // Bottom Hall rect: 110,610 to 690,690
    // Right Hall rect: 610,150 to 690,690

    const mockPoints = [
        { x: 150, y: 150 }, // In Left Hall
        { x: 150, y: 300 }, // In Left Hall
        { x: 150, y: 600 }, // In Left Hall (near bottom)
        { x: 150, y: 650 }, // In Bottom Hall (left side)
        { x: 400, y: 650 }, // In Bottom Hall (middle)
        { x: 650, y: 650 }, // In Bottom Hall (right side)
        { x: 650, y: 600 }, // In Right Hall (near bottom)
        { x: 650, y: 300 }, // In Right Hall
        { x: 650, y: 150 }  // In Right Hall (End)
    ];

    // 1. Check Corridor Detection
    console.log("\n1. Testing Corridor Detection:");
    const enrichedPath = mockPoints.map((p, i) => {
        const corridor = engine.getCorridorForPoint(p.x, p.y, 1);
        const name = corridor ? corridor.name : 'Unknown';
        console.log(`Point ${i} (${p.x}, ${p.y}) -> ${name}`);
        return { ...p, locationName: name };
    });

    // 2. Check Instruction Generation
    console.log("\n2. Testing Instruction Builder:");
    const text = buildStepSummary(enrichedPath);
    console.log("Generated Text:\n", text);
}

debugInstructions().catch(console.error);
