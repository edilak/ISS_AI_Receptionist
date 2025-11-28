const express = require('express');
const router = express.Router();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || '');

// Load location graph to get image URLs
let locationGraph = null;
try {
  const locationDataPath = path.join(__dirname, '../data/hsitp_locationGraph.json');
  const locationData = JSON.parse(fs.readFileSync(locationDataPath, 'utf8'));
  locationGraph = {
    nodes: locationData.nodes,
    edges: locationData.edges
  };
  console.log(`✅ Loaded location graph for image lookup: ${locationGraph.nodes.length} nodes`);
} catch (error) {
  console.warn('⚠️ Could not load location graph for image lookup:', error.message);
}

// Helper function to find location image from message or context
function findLocationImage(message, context) {
  if (!locationGraph || !locationGraph.nodes) return null;

  // Try to find location from pathData destination (most reliable)
  if (context?.pathData?.destination) {
    const destination = context.pathData.destination;
    
    // Try exact name match first
    let node = locationGraph.nodes.find(n => 
      n.name.toLowerCase() === destination.toLowerCase()
    );
    
    // Try ID match
    if (!node) {
      const destinationId = destination.toLowerCase().replace(/\s+/g, '_').replace(/zone\s*0?([1-7])/i, 'zone_$1');
      node = locationGraph.nodes.find(n => 
        n.id.toLowerCase() === destinationId ||
        n.id.toLowerCase().includes(destinationId) ||
        n.id.toLowerCase().includes(`hsitp_${destinationId}`)
      );
    }
    
    // Try partial match
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

  // Try to extract location from message
  const messageLower = message.toLowerCase();
  
  // Check for zone mentions (e.g., "zone 6", "zone 06", "zone6")
  const zoneMatch = messageLower.match(/zone\s*0?([1-7])/i);
  if (zoneMatch) {
    const zoneNum = zoneMatch[1].padStart(2, '0');
    // Try to find zone node (prefer exact match, then any floor)
    let node = locationGraph.nodes.find(n => 
      n.id === `hsitp_zone_${zoneNum}` || 
      n.id.includes(`zone_${zoneNum}`)
    );
    if (node && node.image) {
      return node.image;
    }
  }

  // Check for other location keywords
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

// Initialize the model
let model;
try {
  // Use gemini-2.5-flash (latest stable, fast and cost-effective)
  // Alternative: gemini-2.5-pro for better quality
  model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
  console.log('✅ Successfully initialized Google AI model: gemini-2.5-flash');
} catch (error) {
  console.error('❌ Error initializing Google AI model:', error.message);
  console.log('💡 Tip: Run "node scripts/listModels.js" to see available models');
}

// Chat endpoint
router.post('/message', async (req, res) => {
  try {
    const { message, language = 'en', context } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    if (!model) {
      return res.status(500).json({ 
        error: 'AI model not initialized. Please check GOOGLE_API_KEY in .env file' 
      });
    }

    // Build context-aware prompt
    let systemPrompt = `You are Tracy, a friendly AI Receptionist Virtual Assistant for ISS Facility Services Limited at HSITP (Hong Kong-Shenzhen Innovation and Technology Park) Building 8. 
You help visitors and customers navigate the HSITP Building 8, which is a wet laboratory enabled building with Biosafety Level 3 / PRC P3 Lab provisions.

Building Information:
- Building Name: HSITP Building 8
- Location: Lok Ma Chau Loop, New Territories, Hong Kong
- Type: Wet Laboratory Enabled Building
- Floors: Ground Floor (G/F), 1/F, 2/F, 3/F, 5/F, 6/F, 7/F (Note: 4/F is omitted)
- Floor Areas: G/F ~590 m², Typical floors (1/F-7/F) ~1,900 m² each
- Lab Provisions: Biosafety Level 3 / PRC P3 Lab provisions enabled
- Facilities: Flexible zones (01, 02, 03, 05, 06, 07), Lift Lobby, Central Corridor, TEL EQUIP RM, AHU RM, Lavatories (Male/Female), METER RM, Common Pantry, Stairs

Current location context: ${context?.currentLocation || 'Main Entrance (Ground Floor)'}
Available locations: Zones 01-07 (on each floor), Lift Lobby, Central Corridor, Service areas (TEL EQUIP RM, AHU RM, Lavatories, METER RM, Common Pantry)

`;

    // If path data is provided, use ACTUAL path information
    if (context?.pathData) {
      const path = context.pathData;
      systemPrompt += `IMPORTANT: Use the ACTUAL path information provided below. DO NOT make up floor numbers or directions.

ACTUAL PATH INFORMATION:
- Destination: ${path.destination}
- Destination Floor: ${path.destinationFloor}
- Estimated Time: ${path.estimatedTime} minutes
- Number of Steps: ${path.pathSteps}
- Requires Elevator: ${path.requiresElevator ? 'Yes' : 'No'}
- Path Summary: ${path.pathSummary}

You MUST use this exact information in your response. If the destination is on ${path.destinationFloor}, say it's on ${path.destinationFloor}, NOT any other floor.
If the estimated time is ${path.estimatedTime} minutes, say ${path.estimatedTime} minutes, NOT a different time.

`;
    }

    systemPrompt += `Respond in a friendly, professional manner. If the user asks about directions or how to get somewhere:
- If path information is provided above (pathFound: true), use the ACTUAL path information. Include the exact floor number and estimated time from the path data. Then indicate that a visual path will be shown.
- If pathFound is false, explain that the location could not be found. Provide helpful information such as: "Zones (01-07) are only available on floors 1/F, 2/F, 3/F, 5/F, 6/F, and 7/F. Ground Floor does not have zones." Do NOT say a visual path will be shown if pathFound is false.

Language preference: ${language === 'zh-HK' ? 'Traditional Chinese (Cantonese)' : language === 'zh-CN' ? 'Simplified Chinese (Mandarin)' : 'English'}`;

    const prompt = `${systemPrompt}\n\nUser: ${message}\n\nAssistant:`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // Check if the message is about directions/path finding
    const isPathQuery = /(how to get|directions|path|route|way to|navigate|where is|location)/i.test(message);

    // Find location image if available
    const locationImage = findLocationImage(message, context);

    res.json({
      message: text,
      isPathQuery,
      locationImage: locationImage || null,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Chat error:', error);
    
    // Provide helpful error message
    let errorMessage = 'Failed to process chat message';
    if (error.message.includes('404') || error.message.includes('not found')) {
      errorMessage = 'AI model not available. Please check your Google API key and ensure it has access to Gemini models.';
    } else if (error.message.includes('API key')) {
      errorMessage = 'Invalid API key. Please check your GOOGLE_API_KEY in .env file.';
    }
    
    res.status(500).json({ 
      error: errorMessage,
      details: error.message 
    });
  }
});

// Health check for chat service
router.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'Chat Service',
    model: model ? 'initialized' : 'not initialized'
  });
});

module.exports = router;

