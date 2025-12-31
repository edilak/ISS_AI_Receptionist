const express = require('express');
const router = express.Router();
const OpenAI = require('openai');
const { getInstance: getNavigationService } = require('../lib/NavigationService');
const { findShortestPath, findLocation, getLocationGraph } = require('./pathFinder');

// Validate API key is present
const apiKey = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
if (!apiKey) {
  console.warn('⚠️  WARNING: OPENAI_API_KEY not found in environment variables!');
  console.warn('   Please ensure your .env file contains: OPENAI_API_KEY=your_api_key_here');
} else {
  const keyPreview = apiKey.substring(0, 8) + '...' + apiKey.substring(apiKey.length - 4);
  console.log(`✅ OpenAI API Key loaded: ${keyPreview} | Model: ${OPENAI_MODEL}`);
}

const openai = apiKey ? new OpenAI({ apiKey }) : null;

// Navigation service instance
let navigationService = null;

// Initialize navigation service on startup
(async () => {
  try {
    navigationService = await getNavigationService();
    console.log('✅ Chat route: NavigationService connected');
  } catch (error) {
    console.warn('⚠️ NavigationService not available, using legacy pathfinding');
  }
})();

// Helper function to find location image
function findLocationImage(message, context) {
  const locationGraph = getLocationGraph();
  if (!locationGraph || !locationGraph.nodes) return null;

  // Try to find location from pathData destination (most reliable)
  if (context?.pathData?.destination) {
    const destination = context.pathData.destination;
    
    let node = locationGraph.nodes.find(n => 
      n.name.toLowerCase() === destination.toLowerCase()
    );
    
    if (!node) {
      const destinationId = destination.toLowerCase().replace(/\s+/g, '_').replace(/zone\s*0?([1-7])/i, 'zone_$1');
      node = locationGraph.nodes.find(n => 
        n.id.toLowerCase() === destinationId ||
        n.id.toLowerCase().includes(destinationId) ||
        n.id.toLowerCase().includes(`hsitp_${destinationId}`)
      );
    }
    
    if (!node) {
      node = locationGraph.nodes.find(n => 
        n.name.toLowerCase().includes(destination.toLowerCase()) ||
        destination.toLowerCase().includes(n.name.toLowerCase())
      );
    }
    
    if (node && node.image) {
      return node.image;
    }
  }

  const messageLower = message.toLowerCase();
  
  const zoneMatch = messageLower.match(/zone\s*0?([1-7])/i);
  if (zoneMatch) {
    const zoneNum = zoneMatch[1].padStart(2, '0');
    let node = locationGraph.nodes.find(n => 
      n.id === `hsitp_zone_${zoneNum}` || 
      n.id.includes(`zone_${zoneNum}`)
    );
    if (node && node.image) {
      return node.image;
    }
  }

  const locationKeywords = [
    { keywords: ['reception', 'reception desk'], id: 'hsitp_reception' },
    { keywords: ['lobby', 'main lobby'], id: 'hsitp_lobby' },
    { keywords: ['lift lobby', 'elevator lobby'], id: 'hsitp_lift_lobby' },
    { keywords: ['pantry', 'common pantry'], id: 'hsitp_pantry' },
    { keywords: ['tel equip', 'telecommunications'], id: 'hsitp_tel_equip' },
    { keywords: ['ahu', 'air handling'], id: 'hsitp_ahu' },
  ];

  for (const { keywords, id } of locationKeywords) {
    if (keywords.some(keyword => messageLower.includes(keyword))) {
      const node = locationGraph.nodes.find(n => 
        n.id === id || 
        n.id.includes(id.replace('hsitp_', ''))
      );
      if (node && node.image) {
        return node.image;
      }
    }
  }

  return null;
}

// AI-powered location normalization using NavigationService or legacy
async function normalizeLocationWithAI(userInput) {
  // Try NavigationService first
  if (navigationService) {
    const location = navigationService.findLocation(userInput);
    if (location) {
      console.log(`✅ NavigationService matched "${userInput}" → ${location.id}`);
      return location;
    }
  }

  // Fallback to AI-based matching
  if (!userInput || !openai) {
    return findLocation(userInput);
  }

  try {
    const locationGraph = getLocationGraph();
    if (!locationGraph || !locationGraph.nodes || locationGraph.nodes.length === 0) {
      return findLocation(userInput);
    }

    const availableLocations = locationGraph.nodes.map(node => ({
      id: node.id,
      name: node.name,
      floor: node.floor,
      type: node.type
    }));

    const normalizationPrompt = `You are a location matching assistant for HSITP Building 8.

User Input: "${userInput}"

Available Locations:
${availableLocations.map((loc, idx) => 
  `${idx + 1}. ID: "${loc.id}" | Name: "${loc.name}" | Floor: ${loc.floor === 0 ? 'G/F' : `${loc.floor}/F`} | Type: ${loc.type}`
).join('\n')}

Task: Match the user input to the most appropriate location from the list above.

IMPORTANT RULES:
1. Location Name Matching:
   - "lift lobby" or "lift" or "elevator" → match to "Lift Lobby" locations
   - "zone 5" or "zone 05" or "zone5" → match to "Zone 05" or "hsitp_zone_05" locations

2. Floor Matching:
   - If user specifies floor (e.g., "1/f", "1st floor"), match that specific floor
   - If NO floor specified:
     * For "lift lobby" → MUST match "hsitp_lift_lobby" (G/F, floor 0)
     * For "zone X" → MUST match "hsitp_zone_XX" on floor 1

3. Examples:
   - "lift lobby" → "hsitp_lift_lobby" (G/F, floor 0)
   - "lift lobby 1/f" → "hsitp_lift_lobby_1" (1/F, floor 1)
   - "zone 5" → "hsitp_zone_05" (1/F, floor 1)

Return ONLY a JSON object:
{
  "matchedLocationId": "exact_location_id_from_list" or null,
  "confidence": "high" | "medium" | "low",
  "reasoning": "brief explanation"
}`;

    const normalizationTextRaw = await runOpenAI(normalizationPrompt, { temperature: 0.1 });
    const normalizationText = normalizationTextRaw.replace(/```json|```/g, '').trim();
    
    let matchData = { matchedLocationId: null, confidence: 'low' };
    try {
      matchData = JSON.parse(normalizationText);
    } catch (e) {
      const idMatch = normalizationText.match(/"matchedLocationId"\s*:\s*"([^"]+)"/);
      if (idMatch) {
        matchData.matchedLocationId = idMatch[1];
      }
    }

    if (matchData.matchedLocationId) {
      const matchedNode = locationGraph.nodes.find(n => n.id === matchData.matchedLocationId);
      if (matchedNode) {
        console.log(`✅ AI matched "${userInput}" → ${matchedNode.id} [${matchData.confidence}]`);
        return matchedNode;
      }
    }

    return findLocation(userInput);

  } catch (error) {
    console.error('❌ Error in AI location normalization:', error.message);
    return findLocation(userInput);
  }
}

const formatFloorLabel = (floor) => {
  if (floor === null || floor === undefined) return '';
  if (floor === 0) return 'G/F';
  return `${floor}/F`;
};

const formatNodeLabel = (node) => {
  if (!node) return '';
  const source = node.displayName || node.name || node.id || '';
  const trimmed = source.replace(/^hsitp_/i, '');
  const lower = trimmed.toLowerCase();
  const floorSuffix = typeof node.floor === 'number' ? ` (${formatFloorLabel(node.floor)})` : '';

  if (lower.startsWith('zone_')) {
    const zone = lower.replace('zone_', '').padStart(2, '0');
    return `Zone ${zone}${floorSuffix}`;
  }
  if (lower.startsWith('corridor')) {
    const num = lower.split('_')[1] || '1';
    return `Corridor ${num}${floorSuffix}`;
  }
  if (lower.startsWith('lift_lobby')) {
    return `Lift Lobby${floorSuffix}`;
  }
  if (lower.startsWith('stairs')) {
    return `Staircase${floorSuffix}`;
  }
  if (lower.includes('lav_f')) {
    return `Female Lavatory${floorSuffix}`;
  }
  if (lower.includes('lav_m')) {
    return `Male Lavatory${floorSuffix}`;
  }
  if (lower.includes('restroom')) {
    return `Restroom${floorSuffix}`;
  }
  if (lower.includes('pantry')) {
    return `Common Pantry${floorSuffix}`;
  }
  if (lower.includes('tel_equip')) {
    return `TEL Equipment Room${floorSuffix}`;
  }
  if (lower.includes('ahu')) {
    return `AHU Room${floorSuffix}`;
  }
  if (lower.includes('meter')) {
    return `Meter Room${floorSuffix}`;
  }

  return `${trimmed.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}${floorSuffix}`;
};

const directionTextMap = {
  right: 'Turn right',
  left: 'Turn left',
  up: 'Go straight',
  down: 'Go straight'
};

const buildStepSummary = (steps = []) => {
  return steps
    .map((step, index) => {
      const nextStep = steps[index + 1];
      if (!nextStep) return null;
      const direction = step.nextDirection ? (directionTextMap[step.nextDirection] || 'Proceed') : 'Proceed';
      let sentence = `${index + 1}. ${direction} from ${formatNodeLabel(step)} to ${formatNodeLabel(nextStep)}`;
      if ((step.isFloorChange || nextStep.floor !== step.floor) && typeof nextStep.floor === 'number') {
        sentence += ` (${formatFloorLabel(nextStep.floor)})`;
      }
      if (step.routeWaypoints && step.routeWaypoints.length > 1) {
        sentence += ` (follow the marked corridor turns)`;
      }
      return sentence;
    })
    .filter(Boolean)
    .join('\n');
};

// Helper: run OpenAI chat completion
async function runOpenAI(prompt, options = {}) {
  if (!openai) {
    throw new Error('OpenAI client not initialized. Check OPENAI_API_KEY.');
  }
  const { temperature = 0, system = 'You are a helpful assistant.' } = options;
  const completion = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    temperature,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: prompt }
    ]
  });
  return completion.choices[0]?.message?.content || '';
}

// Chat endpoint
router.post('/message', async (req, res) => {
  try {
    const { message, language = 'en', context } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    if (!openai) {
      return res.status(500).json({ 
        error: 'AI model not initialized. Please check OPENAI_API_KEY in .env file' 
      });
    }

    // Step 1: Intent Classification and Entity Extraction
    const extractionPrompt = `Analyze the following user message and extract navigation intent.
User Message: "${message}"
Current Location: "${context?.currentLocation || 'Main Entrance'}"

Return ONLY a JSON object in this format:
{
  "intent": "navigation" | "chat",
  "from": "origin location name" (or null if not specified/implied),
  "to": "destination location name" (or null)
}

Rules:
- If the user asks "where is X", "how to get to X", "directions to X", intent is "navigation".
- If "from" is not specified, infer it from context or use "current location".
- Keep the original location names as the user wrote them.`;

    const extractionRaw = await runOpenAI(extractionPrompt, { temperature: 0.1 });
    const extractionText = extractionRaw.replace(/```json|```/g, '').trim();
    
    let intentData = { intent: 'chat' };
    try {
      intentData = JSON.parse(extractionText);
    } catch (e) {
      console.warn('Failed to parse intent JSON:', extractionText);
    }

    let pathResult = null;
    let pathData = null;
    let navigationResponse = null;

    // Step 2: Execute Navigation using new NavigationService
    if (intentData.intent === 'navigation' && intentData.to) {
      console.log('🧭 Navigation intent detected:', intentData);
      
      const fromInput = intentData.from || context?.currentLocation || 'Main Entrance';
      const toInput = intentData.to;
      
      console.log('🔍 Looking up locations:');
      console.log('  From:', fromInput);
      console.log('  To:', toInput);
      
      // Try NavigationService first (with A* and RL)
      if (navigationService) {
        const fromLocation = navigationService.findLocation(fromInput);
        const toLocation = navigationService.findLocation(toInput);
        
        if (fromLocation && toLocation) {
          console.log(`🚀 Using NavigationService for pathfinding (A* + RL)`);
          
          try {
            navigationResponse = await navigationService.navigate(
              fromLocation.id, 
              toLocation.id, 
              { 
                language, 
                accessibilityMode: false,
                includeVisualization: true 
              }
            );

            if (navigationResponse.success) {
              const formattedFrom = formatNodeLabel(fromLocation);
              const formattedTo = formatNodeLabel(toLocation);
              
              pathResult = {
                found: true,
                from: formattedFrom,
                to: formattedTo,
                distance: navigationResponse.pathDetails.totalDistance,
                time: Math.ceil(navigationResponse.pathDetails.estimatedTime / 60),
                steps: navigationResponse.path.length,
                algorithm: navigationResponse.pathDetails.algorithm,
                nodesExplored: navigationResponse.pathDetails.nodesExplored
              };
              
              pathData = navigationResponse.pathData;
              
              console.log(`✅ Path found via NavigationService:`);
              console.log(`   Algorithm: ${pathResult.algorithm}`);
              console.log(`   Nodes explored: ${pathResult.nodesExplored}`);
              console.log(`   Steps: ${pathResult.steps}`);
              console.log(`   Time: ~${pathResult.time} mins`);
            } else {
              console.warn(`⚠️ NavigationService couldn't find path: ${navigationResponse.error}`);
            }
          } catch (error) {
            console.warn(`⚠️ NavigationService error: ${error.message}`);
          }
        }
      }
      
      // Fallback to legacy pathfinding if NavigationService fails
      if (!pathResult || !pathResult.found) {
        console.log('🔄 Falling back to legacy pathfinding...');
        
        const fromLocation = await normalizeLocationWithAI(fromInput);
        const toLocation = await normalizeLocationWithAI(toInput);
      
      if (fromLocation && toLocation) {
        const formattedFrom = formatNodeLabel(fromLocation);
        const formattedTo = formatNodeLabel(toLocation);
          
        const graph = getLocationGraph();
        const path = findShortestPath(graph, fromLocation.id, toLocation.id);
        
          if (path && path.path && path.path.length > 0) {
            console.log(`✅ Legacy path found: ${path.path.length} steps`);
            
          pathResult = {
            found: true,
            from: formattedFrom,
            to: formattedTo,
            distance: path.totalDistance,
            time: path.estimatedTime,
              steps: path.path.length,
              algorithm: 'Dijkstra (legacy)'
          };
          
          pathData = {
            from: fromLocation,
            to: toLocation,
              path: path.path,
            totalDistance: path.totalDistance,
            estimatedTime: path.estimatedTime,
            pathIds: path.pathIds
          };
          } else {
            pathResult = { found: false, error: 'No path found' };
            }
        } else {
          const missingLocations = [];
          if (!fromLocation) missingLocations.push(`From: "${fromInput}"`);
          if (!toLocation) missingLocations.push(`To: "${toInput}"`);
          pathResult = { found: false, error: `Location not found: ${missingLocations.join(', ')}` };
        }
      }
    }

    // Step 3: Generate Conversational Response
    let systemPrompt = `You are Tracy, a friendly AI Receptionist at HSITP Building 8.
Building Info: Wet Laboratory Enabled Building, Floors G/F, 1/F-3/F, 5/F-7/F (4/F omitted).
Facilities: Zones 01-07 (Office/Labs), Lift Lobby, Service areas.
Current Location: ${context?.currentLocation || 'Main Entrance'}

User Query: "${message}"
`;

    if (intentData.intent === 'navigation') {
      if (pathResult?.found) {
        // Use AI-generated instructions if available
        const stepSummary = navigationResponse?.instructions?.instructions || 
                           (pathData?.path ? buildStepSummary(pathData.path) : '');
        
        systemPrompt += `
SYSTEM: Path found using ${pathResult.algorithm || 'pathfinding'}!
- From: ${pathResult.from}
- To: ${pathResult.to}
- Time: ~${pathResult.time} mins
- Distance: ${pathResult.distance}m
${stepSummary ? `- Directions:\n${stepSummary}` : ''}

INSTRUCTION: Provide clear, friendly directions based on the path above. Mention that the visual guide is shown below. Be concise but helpful.
`;
      } else if (pathResult) {
        systemPrompt += `
SYSTEM: Pathfinding failed. Reason: ${pathResult.error}
INSTRUCTION: Apologize and explain why. Suggest available locations (Zones 01-07, Lift Lobby, etc.).
`;
      }
    }

    systemPrompt += `
Respond in ${language === 'zh-HK' ? 'Traditional Chinese (Cantonese)' : language === 'zh-CN' ? 'Simplified Chinese (Mandarin)' : 'English'}.
Keep it helpful and concise.`;

    const responseText = await runOpenAI(systemPrompt, { temperature: 0.4, system: 'You are Tracy, a concise, friendly receptionist.' });

    const isPathQuery = intentData.intent === 'navigation';
    const locationImage = findLocationImage(message, context);

    // Include navigation stats if available
    const stats = navigationService?.getStats() || null;

    res.json({
      message: responseText,
      isPathQuery,
      locationImage: locationImage || null,
      timestamp: new Date().toISOString(),
      pathData: pathData,
      navigationStats: pathResult?.found ? {
        algorithm: pathResult.algorithm,
        nodesExplored: pathResult.nodesExplored,
        engineStats: stats
      } : null
    });

  } catch (error) {
    console.error('Chat error:', error);
    
    let errorMessage = 'Failed to process chat message';
    if (error.message.includes('404') || error.message.includes('not found')) {
      errorMessage = 'AI model not available. Please check your OpenAI API key.';
    } else if (error.message.includes('API key')) {
      errorMessage = 'Invalid API key. Please check your OPENAI_API_KEY in .env file.';
    }
    
    res.status(500).json({ 
      error: errorMessage,
      details: error.message 
    });
  }
});

// Health check for chat service
router.get('/health', async (req, res) => {
  const navStats = navigationService?.getStats() || null;
  
  res.json({ 
    status: 'ok', 
    service: 'Chat Service',
    model: openai ? 'initialized' : 'not initialized',
    navigationService: navigationService ? 'connected' : 'not available',
    stats: navStats
  });
});

// Navigation stats endpoint
router.get('/navigation-stats', (req, res) => {
  if (!navigationService) {
    return res.status(503).json({ error: 'NavigationService not available' });
  }
  
  res.json(navigationService.getStats());
});

module.exports = router;
