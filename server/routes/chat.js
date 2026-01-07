const express = require('express');
const router = express.Router();
const OpenAI = require('openai');
const { getSpaceNavigationEngine } = require('../lib/SpaceNavigationEngine');
// Graph-based pathfinding removed - using RL method only
const { findLocation, getLocationGraph } = require('./pathFinder'); // Only for location lookup, not pathfinding

// Azure OpenAI Configuration
const azureApiKey = process.env.AZURE_OPENAI_API_KEY;
const azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
const azureDeploymentName = process.env.AZURE_OPENAI_DEPLOYMENT_NAME || 'gpt-4';
const azureApiVersion = process.env.AZURE_OPENAI_API_VERSION || '2024-12-01-preview';
const OPENAI_MODEL = process.env.OPENAI_MODEL || azureDeploymentName;

// Check for Azure OpenAI configuration
if (!azureApiKey || !azureEndpoint) {
  console.warn('⚠️  WARNING: Azure OpenAI configuration not found!');
  console.warn('   Please ensure your .env file contains:');
  console.warn('   - AZURE_OPENAI_API_KEY=your_azure_api_key');
  console.warn('   - AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com');
  console.warn('   - AZURE_OPENAI_DEPLOYMENT_NAME=gpt-4 (optional, defaults to gpt-4)');
} else {
  const keyPreview = azureApiKey.substring(0, 8) + '...' + azureApiKey.substring(azureApiKey.length - 4);
  // Normalize endpoint (remove trailing slash if present)
  const normalizedEndpoint = azureEndpoint.replace(/\/$/, '');
  const endpointPreview = normalizedEndpoint.replace(/https?:\/\//, '').split('/')[0];
  console.log(`✅ Azure OpenAI configured: ${keyPreview} | Endpoint: ${endpointPreview} | Deployment: ${azureDeploymentName} | API Version: ${azureApiVersion}`);
}

// Initialize Azure OpenAI client
// Match Python AzureOpenAI pattern: api_version, azure_endpoint, api_key
const openai = (azureApiKey && azureEndpoint) ? (() => {
  // Normalize endpoint (ensure no trailing slash, then add deployment path)
  const normalizedEndpoint = azureEndpoint.replace(/\/$/, '');
  const baseURL = `${normalizedEndpoint}/openai/deployments/${azureDeploymentName}`;

  return new OpenAI({
    apiKey: azureApiKey,
    baseURL: baseURL,
    defaultQuery: { 'api-version': azureApiVersion },
    defaultHeaders: { 'api-key': azureApiKey },
  });
})() : null;

// Space Navigation Engine instance (RL method only)
let spaceNavEngine = null;

// Initialize Space Navigation Engine on startup
(async () => {
  try {
    spaceNavEngine = getSpaceNavigationEngine();
    console.log('✅ Space Navigation Engine (RL) initialized');
  } catch (error) {
    console.warn('⚠️ Space Navigation Engine not available');
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

// AI-powered location normalization (for location lookup only, not pathfinding)
async function normalizeLocationWithAI(userInput) {
  // Try simple location lookup (no graph pathfinding)
  const location = findLocation(userInput);
  if (location) {
    console.log(`✅ Location matched "${userInput}" → ${location.id}`);
    return location;
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

const getSegmentDirection = (p1, p2) => {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y; // Y is down

  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0 ? 'East' : 'West';
  } else {
    return dy > 0 ? 'South' : 'North';
  }
};

const buildStepSummary = (steps = []) => {
  if (steps.length < 2) return 'You are already there.';

  // Refined Strategy:
  // Identify key turning points or corridor changes
  const segments = [];
  let currentSegment = {
    name: steps[0].locationName || 'Start',
    start: steps[0],
    end: steps[0]
  };

  for (let i = 1; i < steps.length; i++) {
    const pt = steps[i];
    // Use tolerance to keep segments together if name splits momentarily
    const name = pt.locationName || currentSegment.name;

    if (name !== currentSegment.name) {
      currentSegment.end = steps[i - 1];
      if (currentSegment.start !== currentSegment.end) {
        segments.push(currentSegment);
      }
      // Start new segment
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

  // Convert segments to natural text with screen-relative directions
  return segments.map((seg, idx) => {
    const isLast = idx === segments.length - 1;
    const locName = formatNodeLabel({ name: seg.name }).replace(/_/g, ' ');

    if (idx === 0) return `Start at ${locName}.`;

    // Determine direction of the CURRENT segment
    const dir = getSegmentDirection(seg.start, seg.end);
    let action = 'Head';

    if (idx > 0) {
      // Determine relative turn based on absolute direction (Screen Relative)
      // This matches user expectation for 2D maps better than egocentric turns
      switch (dir) {
        case 'East': action = 'Turn right'; break;
        case 'West': action = 'Turn left'; break;
        case 'North': action = 'Head up'; break;
        case 'South': action = 'Head down'; break;
      }

      // If we are continuing in the same named area
      const prevSeg = segments[idx - 1];
      if (prevSeg.name === seg.name) return `Continue ${action.toLowerCase().replace('turn ', '')} along ${locName}.`;
    }

    if (isLast) return `${action} into ${locName} and arrive at destination.`;

    return `${action} into ${locName}.`;
  }).join(' ');
};

// Helper: run Azure OpenAI chat completion
async function runOpenAI(prompt, options = {}) {
  if (!openai) {
    throw new Error('Azure OpenAI client not initialized. Check AZURE_OPENAI_API_KEY and AZURE_OPENAI_ENDPOINT.');
  }
  const { temperature = 0, system = 'You are a helpful assistant.' } = options;

  try {
    // For Azure OpenAI, we don't need to specify model in the request
    // as it's already in the baseURL deployment path
    const completion = await openai.chat.completions.create({
      temperature,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt }
      ]
    });
    return completion.choices[0]?.message?.content || '';
  } catch (error) {
    console.error('❌ Azure OpenAI API Error:', error.message);
    if (error.status === 401) {
      throw new Error('Invalid Azure OpenAI API key. Please check AZURE_OPENAI_API_KEY.');
    } else if (error.status === 404) {
      throw new Error(`Deployment "${azureDeploymentName}" not found. Please check AZURE_OPENAI_DEPLOYMENT_NAME.`);
    } else if (error.status === 429) {
      throw new Error('Azure OpenAI rate limit exceeded. Please try again later.');
    }
    throw error;
  }
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
        error: 'AI model not initialized. Please check AZURE_OPENAI_API_KEY and AZURE_OPENAI_ENDPOINT in .env file'
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

    // Step 2: Execute Navigation using Space Navigation Engine (Continuous Space RL)
    if (intentData.intent === 'navigation' && intentData.to) {
      console.log('🧭 Navigation intent detected:', intentData);

      const fromInput = intentData.from || context?.currentLocation || 'Main Entrance';
      const toInput = intentData.to;

      console.log('🔍 Looking up locations:');
      console.log('  From:', fromInput);
      console.log('  To:', toInput);

      // PRIMARY: Try Space Navigation Engine (Continuous 2D RL)
      if (spaceNavEngine && spaceNavEngine.corridors.length > 0) {
        console.log('🚀 Using Space Navigation Engine (Continuous RL)');

        try {
          const spaceNavResult = await spaceNavEngine.navigate(fromInput, toInput, { floor: 1 });

          if (spaceNavResult.success) {
            const totalDistanceMeters = spaceNavResult.stats.totalDistance / 12; // Convert pixels to meters (12 pixels/meter)
            const estimatedTimeMinutes = Math.ceil(totalDistanceMeters / 80); // Walking speed ~80m/min

            pathResult = {
              found: true,
              from: fromInput,
              to: spaceNavResult.destination.name,
              distance: Math.round(totalDistanceMeters),
              time: Math.max(1, estimatedTimeMinutes),
              steps: spaceNavResult.stats.simplifiedPoints,
              algorithm: 'Continuous Space RL'
            };

            // Build path data for visualization
            pathData = {
              from: {
                name: fromInput,
                floor: 1,
                x: spaceNavResult.start.x,
                y: spaceNavResult.start.y,
                pixelX: spaceNavResult.start.x,
                pixelY: spaceNavResult.start.y
              },
              to: {
                name: spaceNavResult.destination.name,
                floor: spaceNavResult.destination.floor,
                x: spaceNavResult.destination.x,
                y: spaceNavResult.destination.y,
                pixelX: spaceNavResult.destination.x,
                pixelY: spaceNavResult.destination.y
              },
              path: spaceNavResult.path.map((p, i) => ({
                id: `step_${i}`,
                name: i === 0 ? fromInput : i === spaceNavResult.path.length - 1 ? spaceNavResult.destination.name : `Step ${i}`,
                locationName: p.locationName,
                floor: 1,
                x: p.x,
                y: p.y,
                pixelX: p.x,
                pixelY: p.y,
                type: i === spaceNavResult.path.length - 1 ? 'destination' : 'waypoint'
              })),
              visualization: {
                svgPath: spaceNavResult.svgPath,
                smoothPath: spaceNavResult.path,
                arrows: spaceNavResult.arrows || [], // Include arrows for visualization
                animation: {
                  totalLength: spaceNavResult.stats.totalDistance
                }
              },
              destination: spaceNavResult.destination,
              totalDistance: totalDistanceMeters,
              estimatedTime: estimatedTimeMinutes
            };

            console.log(`✅ Space Navigation found path:`);
            console.log(`   Algorithm: ${pathResult.algorithm}`);
            console.log(`   Path points: ${spaceNavResult.stats.originalPoints} → ${spaceNavResult.stats.simplifiedPoints}`);
            console.log(`   Distance: ${pathResult.distance}m (~${totalDistanceMeters.toFixed(0)}px)`);
            console.log(`   Time: ~${pathResult.time} min`);
          } else {
            console.warn(`⚠️ RL Navigation couldn't find path: ${spaceNavResult.error}`);
            pathResult = {
              found: false,
              error: spaceNavResult.error || 'Path not found. The RL agent may need more training, or the destination may not be reachable.'
            };
          }
        } catch (error) {
          console.error(`❌ RL Navigation error: ${error.message}`);
          pathResult = {
            found: false,
            error: `Navigation error: ${error.message}. Please ensure corridors are defined and the RL agent is trained.`
          };
        }
      } else {
        // No space navigation engine or no corridors defined
        console.warn('⚠️ Space Navigation Engine not available or no corridors defined');
        pathResult = {
          found: false,
          error: 'Navigation not configured. Please use the Space Editor to define corridors and train the RL agent.'
        };
      }

      // Ensure we have a result (RL method only, no graph fallback)
      if (!pathResult || !pathResult.found) {
        if (!spaceNavEngine || spaceNavEngine.corridors.length === 0) {
          pathResult = {
            found: false,
            error: 'Navigation not configured. Please use the Space Editor to define corridors and train the RL agent.'
          };
        } else {
          pathResult = {
            found: false,
            error: pathResult?.error || 'Could not find a path. The RL agent may need more training, or the destination may not be reachable.'
          };
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

    // Include navigation stats if available (RL method only)
    const stats = spaceNavEngine?.getStats() || null;

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
      errorMessage = 'Azure OpenAI deployment not found. Please check your AZURE_OPENAI_DEPLOYMENT_NAME.';
    } else if (error.message.includes('API key') || error.message.includes('401')) {
      errorMessage = 'Invalid Azure OpenAI API key. Please check your AZURE_OPENAI_API_KEY in .env file.';
    } else if (error.message.includes('rate limit')) {
      errorMessage = 'Azure OpenAI rate limit exceeded. Please try again later.';
    } else if (error.message.includes('endpoint') || error.message.includes('ENDPOINT')) {
      errorMessage = 'Invalid Azure OpenAI endpoint. Please check your AZURE_OPENAI_ENDPOINT in .env file.';
    }

    res.status(500).json({
      error: errorMessage,
      details: error.message
    });
  }
});

// Health check for chat service
router.get('/health', async (req, res) => {
  const navStats = spaceNavEngine?.getStats() || null;

  res.json({
    status: 'ok',
    service: 'Chat Service',
    provider: 'Azure OpenAI',
    model: openai ? azureDeploymentName : 'not initialized',
    endpoint: azureEndpoint ? azureEndpoint.replace(/https?:\/\//, '').split('/')[0] : 'not configured',
    spaceNavigationEngine: spaceNavEngine ? 'connected' : 'not available',
    stats: navStats
  });
});

// Navigation stats endpoint (RL method only)
router.get('/navigation-stats', (req, res) => {
  if (!spaceNavEngine) {
    return res.status(503).json({ error: 'Space Navigation Engine (RL) not available' });
  }

  res.json(spaceNavEngine.getStats());
});

module.exports = router;
