/**
 * Visualization Script for Value Iteration Agent
 * Generates an HTML file with SVG visualization
 */
const { SpaceNavigationEngine } = require('./server/lib/SpaceNavigationEngine');
const fs = require('fs');

async function runVisualization() {
    console.log("🎨 Starting Visualization...");
    const engine = new SpaceNavigationEngine();

    // Wait for init
    await new Promise(resolve => setTimeout(resolve, 1000));

    if (!engine.agent.valueMaps || engine.agent.valueMaps.size === 0) {
        console.log("Triggering VI...");
        engine.train();
        await new Promise(resolve => {
            const check = setInterval(() => {
                if (!engine.isTraining) {
                    clearInterval(check);
                    resolve();
                }
            }, 100);
        });
    }

    // Test Path: Start Point -> End Point (U-Shape)
    const startX = 150;
    const startY = 150;
    const destQuery = "End Point";

    console.log(`Calculating Path from (${startX},${startY}) to '${destQuery}'...`);

    const result = await engine.navigate(null, destQuery, {
        floor: 1,
        startX: startX,
        startY: startY
    });

    if (result.success) {
        console.log("✅ Path Found!");
        generateHTML(engine.corridors, result.path, startX, startY, result.destination);
    } else {
        console.error("❌ Path Failed:", result.error);
    }
}

function generateHTML(corridors, path, startX, startY, dest) {
    let svgContent = `<svg width="800" height="800" viewBox="0 0 800 800" xmlns="http://www.w3.org/2000/svg" style="background: #f0f0f0;">`;

    // Draw corridors
    corridors.forEach(c => {
        if (c.polygon) {
            const points = c.polygon.map(p => p.join(',')).join(' ');
            svgContent += `<polygon points="${points}" fill="white" stroke="#ccc" />`;
            // Add name label
            const maxX = Math.max(...c.polygon.map(p => p[0]));
            const minX = Math.min(...c.polygon.map(p => p[0]));
            const maxY = Math.max(...c.polygon.map(p => p[1]));
            const minY = Math.min(...c.polygon.map(p => p[1]));
            const cx = (minX + maxX) / 2;
            const cy = (minY + maxY) / 2;
            svgContent += `<text x="${cx}" y="${cy}" font-family="Arial" font-size="12" fill="#aaa" text-anchor="middle">${c.name}</text>`;
        }
    });

    // Draw Path
    if (path && path.length > 0) {
        let d = `M ${path[0].x} ${path[0].y}`;
        for (let i = 1; i < path.length; i++) {
            d += ` L ${path[i].x} ${path[i].y}`;
        }
        svgContent += `<path d="${d}" fill="none" stroke="#2196F3" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`;

        // Draw path points
        /*
        path.forEach(p => {
             svgContent += `<circle cx="${p.x}" cy="${p.y}" r="2" fill="#2196F3" />`;
        });
        */
    }

    // Draw Start
    svgContent += `<circle cx="${startX}" cy="${startY}" r="8" fill="#4CAF50" stroke="white" stroke-width="2"/>`;
    svgContent += `<text x="${startX}" y="${startY - 15}" font-family="Arial" font-size="14" font-weight="bold" fill="#4CAF50" text-anchor="middle">Start</text>`;

    // Draw End
    svgContent += `<circle cx="${dest.x}" cy="${dest.y}" r="8" fill="#F44336" stroke="white" stroke-width="2"/>`;
    svgContent += `<text x="${dest.x}" y="${dest.y - 15}" font-family="Arial" font-size="14" font-weight="bold" fill="#F44336" text-anchor="middle">End</text>`;

    svgContent += `</svg>`;

    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>RL Path Visualization</title>
        <style>
            body { font-family: sans-serif; padding: 20px; text-align: center; }
            .container { display: inline-block; border: 1px solid #ddd; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        </style>
    </head>
    <body>
        <h1>RL Path Visualization</h1>
        <p>Path finding from (${startX}, ${startY}) to ${dest.name}</p>
        <div class="container">
            ${svgContent}
        </div>
    </body>
    </html>
    `;

    fs.writeFileSync('path_visualization.html', html);
    console.log("📄 Generated 'path_visualization.html'");
}

runVisualization().catch(console.error);
