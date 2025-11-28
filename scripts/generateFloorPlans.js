const fs = require('fs');
const path = require('path');

// Load floor plan data
const floorPlanData = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../server/data/hsitp_floorPlans.json'), 'utf8')
);

const locationGraph = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../server/data/hsitp_locationGraph.json'), 'utf8')
);

// Create images directory if it doesn't exist
const imagesDir = path.join(__dirname, '../client/public/images');
if (!fs.existsSync(imagesDir)) {
  fs.mkdirSync(imagesDir, { recursive: true });
}

// Helper function to get marker color
function getMarkerColor(type) {
  const colors = {
    entrance: '#4CAF50',
    reception: '#2196F3',
    lobby: '#9C27B0',
    elevator: '#FF9800',
    stairs: '#F44336',
    lab: '#00BCD4',
    room: '#3F51B5',
    facility: '#FF5722'
  };
  return colors[type] || '#757575';
}

// Helper function to get marker symbol
function getMarkerSymbol(type) {
  const symbols = {
    entrance: '🚪',
    reception: '🖥️',
    lobby: '🏢',
    elevator: '⬆️',
    stairs: '🪜',
    lab: '🔬',
    room: '🚪',
    facility: '🏛️'
  };
  return symbols[type] || '📍';
}

// Generate SVG floor plan
function generateFloorPlan(floorData, floorNumber) {
  const width = floorData.image.width;
  const height = floorData.image.height;
  const nodes = floorData.nodes || [];
  
  // Get all nodes for this floor from location graph
  const floorNodes = locationGraph.nodes.filter(n => n.floor === floorNumber);
  
  let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <style>
      .building-outline { fill: #f5f5f5; stroke: #333; stroke-width: 3; }
      .corridor { fill: #e0e0e0; stroke: #999; stroke-width: 1; }
      .room { fill: #fff; stroke: #666; stroke-width: 2; }
      .lab { fill: #e3f2fd; stroke: #1976d2; stroke-width: 2; }
      .office { fill: #f3e5f5; stroke: #7b1fa2; stroke-width: 2; }
      .facility { fill: #fff3e0; stroke: #e65100; stroke-width: 2; }
      .elevator { fill: #ffebee; stroke: #c62828; stroke-width: 2; }
      .stairs { fill: #f1f8e9; stroke: #558b2f; stroke-width: 2; }
      .grid-line { stroke: #ddd; stroke-width: 0.5; opacity: 0.3; }
      .label { font-family: Arial, sans-serif; font-size: 14px; fill: #333; font-weight: bold; }
      .floor-label { font-family: Arial, sans-serif; font-size: 24px; fill: #1976d2; font-weight: bold; }
      .marker-circle { stroke: #fff; stroke-width: 2; }
    </style>
  </defs>
  
  <!-- Background -->
  <rect width="${width}" height="${height}" fill="#fafafa"/>
  
  <!-- Grid -->
  <g id="grid">
    ${Array.from({ length: Math.floor(width / 100) }, (_, i) => 
      `<line class="grid-line" x1="${i * 100}" y1="0" x2="${i * 100}" y2="${height}"/>`
    ).join('')}
    ${Array.from({ length: Math.floor(height / 100) }, (_, i) => 
      `<line class="grid-line" x1="0" y1="${i * 100}" x2="${width}" y2="${i * 100}"/>`
    ).join('')}
  </g>
  
  <!-- Building Outline -->
  <rect class="building-outline" x="20" y="50" width="${width - 40}" height="${height - 100}"/>
  
  <!-- Main Corridor (horizontal) -->
  <rect class="corridor" x="20" y="${height / 2 - 30}" width="${width - 40}" height="60"/>
  
  <!-- Floor-specific layout -->
`;

  // Ground Floor special layout - more visually representative
  if (floorNumber === 0) {
    // Main Entrance (left side)
    svg += `  <rect class="facility" x="20" y="${height / 2 - 60}" width="150" height="120" rx="8" fill="#fff3e0" stroke="#ff9800" stroke-width="3"/>
    <text class="label" x="95" y="${height / 2 - 20}" text-anchor="middle" font-size="16">Main</text>
    <text class="label" x="95" y="${height / 2 + 5}" text-anchor="middle" font-size="16">Entrance</text>
    
    <!-- Reception Desk -->
    <rect class="facility" x="190" y="${height / 2 - 40}" width="140" height="100" rx="8" fill="#e3f2fd" stroke="#2196f3" stroke-width="3"/>
    <text class="label" x="260" y="${height / 2 - 10}" text-anchor="middle" font-size="15">Reception</text>
    <text class="label" x="260" y="${height / 2 + 15}" text-anchor="middle" font-size="15">Desk</text>
    
    <!-- Main Lobby (larger, more prominent) -->
    <rect class="lobby" x="350" y="${height / 2 - 60}" width="220" height="120" rx="8" fill="#f3e5f5" stroke="#9c27b0" stroke-width="3"/>
    <text class="label" x="460" y="${height / 2 - 20}" text-anchor="middle" font-size="18" font-weight="bold">Main Lobby</text>
    
    <!-- Elevator Bank -->
    <rect class="elevator" x="590" y="${height / 2 - 50}" width="90" height="100" rx="8" fill="#ffebee" stroke="#f44336" stroke-width="3"/>
    <text class="label" x="635" y="${height / 2 - 15}" text-anchor="middle" font-size="14">⬆️</text>
    <text class="label" x="635" y="${height / 2 + 10}" text-anchor="middle" font-size="14">Elevator</text>
    
    <!-- Stairs -->
    <rect class="stairs" x="700" y="${height / 2 - 50}" width="70" height="100" rx="8" fill="#f1f8e9" stroke="#4caf50" stroke-width="3"/>
    <text class="label" x="735" y="${height / 2 - 15}" text-anchor="middle" font-size="14">🪜</text>
    <text class="label" x="735" y="${height / 2 + 10}" text-anchor="middle" font-size="14">Stairs</text>
    
    <!-- Cafeteria (below lobby) -->
    <rect class="facility" x="250" y="${height / 2 + 90}" width="280" height="140" rx="8" fill="#fff3e0" stroke="#ff9800" stroke-width="3"/>
    <text class="label" x="390" y="${height / 2 + 140}" text-anchor="middle" font-size="18" font-weight="bold">Cafeteria</text>
    
    <!-- Conference Room A (right side, upper) -->
    <rect class="room" x="790" y="${height / 2 - 30}" width="180" height="100" rx="8" fill="#fff" stroke="#3f51b5" stroke-width="3"/>
    <text class="label" x="880" y="${height / 2 + 10}" text-anchor="middle" font-size="16" font-weight="bold">Conference</text>
    <text class="label" x="880" y="${height / 2 + 35}" text-anchor="middle" font-size="16" font-weight="bold">Room A</text>
    
    <!-- Conference Room B (right side, lower) -->
    <rect class="room" x="790" y="${height / 2 + 80}" width="180" height="100" rx="8" fill="#fff" stroke="#3f51b5" stroke-width="3"/>
    <text class="label" x="880" y="${height / 2 + 120}" text-anchor="middle" font-size="16" font-weight="bold">Conference</text>
    <text class="label" x="880" y="${height / 2 + 145}" text-anchor="middle" font-size="16" font-weight="bold">Room B</text>
    
    <!-- Restrooms (far right) -->
    <rect class="facility" x="990" y="${height / 2 - 40}" width="70" height="70" rx="8" fill="#fff3e0" stroke="#ff9800" stroke-width="2"/>
    <text class="label" x="1025" y="${height / 2 - 5}" text-anchor="middle" font-size="20">🚹</text>
    <text class="label" x="1025" y="${height / 2 + 20}" text-anchor="middle" font-size="11">Men's</text>
    
    <rect class="facility" x="1070" y="${height / 2 - 40}" width="70" height="70" rx="8" fill="#fff3e0" stroke="#ff9800" stroke-width="2"/>
    <text class="label" x="1105" y="${height / 2 - 5}" text-anchor="middle" font-size="20">🚺</text>
    <text class="label" x="1105" y="${height / 2 + 20}" text-anchor="middle" font-size="11">Women's</text>
`;
  } else {
    // Upper floors - standard lab/office layout
    const floorLabel = floorNumber === 1 ? '1st' : floorNumber === 2 ? '2nd' : 
                      floorNumber === 3 ? '3rd' : `${floorNumber}th`;
    
    // Labs on left side
    svg += `  <!-- Labs -->
    <rect class="lab" x="100" y="${height / 2 - 80}" width="200" height="120" rx="5"/>
    <text class="label" x="200" y="${height / 2 - 20}" text-anchor="middle">Lab ${floorNumber}01</text>
    
    <rect class="lab" x="400" y="${height / 2 - 80}" width="200" height="120" rx="5"/>
    <text class="label" x="500" y="${height / 2 - 20}" text-anchor="middle">Lab ${floorNumber}02</text>
    
    <!-- Offices on right side -->
    <rect class="office" x="800" y="${height / 2 - 80}" width="200" height="120" rx="5"/>
    <text class="label" x="900" y="${height / 2 - 20}" text-anchor="middle">Office ${floorNumber}03</text>
    
    <!-- Elevator Bank (same position on all floors) -->
    <rect class="elevator" x="520" y="${height / 2 - 40}" width="80" height="80" rx="5"/>
    <text class="label" x="560" y="${height / 2 + 5}" text-anchor="middle">Elevator</text>
    
    <!-- Stairs -->
    <rect class="stairs" x="610" y="${height / 2 - 40}" width="60" height="80" rx="5"/>
    <text class="label" x="640" y="${height / 2 + 5}" text-anchor="middle">Stairs</text>
`;
    
    // Add meeting rooms and pantries for floors 1-2
    if (floorNumber <= 2) {
      svg += `    <!-- Meeting Room -->
    <rect class="room" x="300" y="${height / 2 + 100}" width="150" height="80" rx="5"/>
    <text class="label" x="375" y="${height / 2 + 145}" text-anchor="middle">Meeting ${floorNumber}04</text>
    
    <!-- Pantry -->
    <rect class="facility" x="500" y="${height / 2 + 100}" width="120" height="80" rx="5"/>
    <text class="label" x="560" y="${height / 2 + 145}" text-anchor="middle">Pantry</text>
`;
    }
    
    // Rooftop garden on 8th floor
    if (floorNumber === 8) {
      svg += `    <!-- Rooftop Garden -->
    <rect class="facility" x="400" y="${height / 2 + 200}" width="300" height="150" rx="5" fill="#c8e6c9" stroke="#4caf50" stroke-width="2"/>
    <text class="label" x="550" y="${height / 2 + 285}" text-anchor="middle">Rooftop Garden</text>
`;
    }
  }
  
  // Add location markers
  nodes.forEach(node => {
    const color = getMarkerColor(node.marker);
    const symbol = getMarkerSymbol(node.marker);
    const nodeInfo = floorNodes.find(n => n.id === node.id);
    const displayName = nodeInfo ? nodeInfo.name : node.id.replace('hsitp_', '').replace(/_/g, ' ');
    
    svg += `  <!-- Marker for ${node.id} -->
    <circle cx="${node.pixelX}" cy="${node.pixelY}" r="12" fill="${color}" class="marker-circle"/>
    <text x="${node.pixelX}" y="${node.pixelY + 4}" text-anchor="middle" font-size="16">${symbol}</text>
    <text class="label" x="${node.pixelX}" y="${node.pixelY + 35}" text-anchor="middle" font-size="11">${displayName}</text>
`;
  });
  
  // Floor label
  const floorName = floorNumber === 0 ? 'Ground Floor' : 
                   floorNumber === 1 ? '1st Floor' :
                   floorNumber === 2 ? '2nd Floor' :
                   floorNumber === 3 ? '3rd Floor' :
                   floorNumber === 4 ? '4th Floor' :
                   floorNumber === 5 ? '5th Floor' :
                   floorNumber === 6 ? '6th Floor' :
                   floorNumber === 7 ? '7th Floor' : '8th Floor';
  
  svg += `  
  <!-- Floor Label -->
  <text class="floor-label" x="${width / 2}" y="30" text-anchor="middle">${floorName} - HSITP Building 8</text>
  
  <!-- Scale indicator -->
  <text x="${width - 150}" y="${height - 20}" font-family="Arial" font-size="12" fill="#666">Scale: 12px/m</text>
</svg>`;
  
  return svg;
}

// Generate all floor plans
console.log('Generating floor plans...');

floorPlanData.floors.forEach(floor => {
  const svg = generateFloorPlan(floor, floor.floor);
  const filename = `hsitp_floor_${floor.floor}.svg`;
  const filepath = path.join(imagesDir, filename);
  
  fs.writeFileSync(filepath, svg, 'utf8');
  console.log(`✅ Generated: ${filename}`);
});

console.log(`\n✅ All floor plans generated in: ${imagesDir}`);
console.log(`\nNote: SVG files can be converted to PNG if needed.`);
console.log(`To convert, you can use online tools or ImageMagick: convert hsitp_floor_*.svg hsitp_floor_*.png`);

