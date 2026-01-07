/**
 * Generate Map Image Script
 * 
 * Reads space_definitions.json and outputs an SVG file that perfectly matches the logical coordinates.
 */
const { SpaceNavigationEngine } = require('./server/lib/SpaceNavigationEngine');
const fs = require('fs');

async function generateMap() {
    console.log("🎨 Generating Map Image...");
    const engine = new SpaceNavigationEngine();
    await engine.loadDefinitions(); // Ensure loaded

    // Canvas size
    const width = 800;
    const height = 800;

    // Create SVG content
    let svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" style="background: white;">`;

    // Style for corridors
    const corridorStyle = 'fill="#f0f0f0" stroke="#333" stroke-width="2"';

    // Draw corridors from definitions
    const corridors = engine.getCorridors(1);
    console.log(`Found ${corridors.length} corridors for Floor 1`);

    corridors.forEach(c => {
        if (c.polygon) {
            const points = c.polygon.map(p => p.join(',')).join(' ');
            svg += `<polygon points="${points}" ${corridorStyle} />`;

            // Add label in center
            const xs = c.polygon.map(p => p[0]);
            const ys = c.polygon.map(p => p[1]);
            const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
            const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
            svg += `<text x="${cx}" y="${cy}" font-family="Arial" font-size="14" fill="#666" text-anchor="middle" alignment-baseline="middle">${c.name || 'Corridor'}</text>`;
        }
    });

    // Draw destinations
    const destinations = engine.getDestinations(1);
    destinations.forEach(d => {
        svg += `<circle cx="${d.x}" cy="${d.y}" r="5" fill="#e74c3c" stroke="none" />`;
        svg += `<text x="${d.x}" y="${d.y - 10}" font-family="Arial" font-size="12" fill="#e74c3c" text-anchor="middle" font-weight="bold">${d.name}</text>`;
    });

    svg += '</svg>';

    // Save to public images
    const outputPath = './client/public/images/test_space_map_aligned.svg';
    fs.writeFileSync(outputPath, svg);
    console.log(`✅ Saved aligned map to ${outputPath}`);
}

generateMap().catch(console.error);
