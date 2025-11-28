# Demonstration Guide

## Quick Demo Script

### 1. Opening (30 seconds)
- "This is the ISS AI Receptionist, similar to MTR's Virtual Service Ambassador Tracy"
- "It helps visitors navigate our facilities using AI-powered chat and intelligent path finding"

### 2. Basic Chat Demo (1 minute)
- Show the chat interface
- Type: "Hello, how can you help me?"
- Show the AI response
- Switch languages (EN, 粵, 普) to show multi-language support

### 3. Path Finding Demo (2 minutes)
- Type: "How do I get to the cafeteria?"
- Show the AI text response
- Show the path visualization that appears
- Explain the step-by-step instructions
- Show estimated time

### 4. Advanced Query (1 minute)
- Type: "Show me the way to Office 201 from Main Entrance"
- Show how it handles multi-floor navigation
- Show elevator/floor change indicators

### 5. API Integration (30 seconds)
- Mention REST API endpoints
- Show how it can be integrated with OutSystems
- Explain the standalone capability

## Key Features to Highlight

✅ **AI-Powered**: Natural language understanding
✅ **Multi-Language**: English, Cantonese, Mandarin
✅ **Path Finding**: Shortest path algorithm with visual representation
✅ **Modern UI**: Clean, professional interface
✅ **API Ready**: REST endpoints for OutSystems integration
✅ **Standalone**: Works independently for demonstration

## Sample Queries for Demo

1. **Simple Direction:**
   - "Where is the reception desk?"
   - "How do I get to Meeting Room 1?"

2. **Path Finding:**
   - "How do I get to the cafeteria?"
   - "Show me the way to Conference Hall"
   - "What's the shortest path to Office 201?"

3. **Multi-Floor:**
   - "How to get to Office 201 from Main Entrance?"
   - "Directions to Conference Hall"

4. **General Questions:**
   - "What facilities are available?"
   - "Where can I find restrooms?"

## Troubleshooting During Demo

**If API key is not set:**
- The chat will show an error message
- Explain that it needs Google API key configuration
- Show that the path finder works independently

**If path not found:**
- Explain that location data can be customized
- Show the location graph structure
- Mention it's easily configurable

## Post-Demo Discussion Points

1. **Customization:**
   - Location data can be customized per building
   - Floor plans can be integrated
   - Branding can be adjusted

2. **Integration:**
   - REST API ready for OutSystems
   - Can be embedded or linked
   - Supports current location context

3. **Future Enhancements:**
   - Voice input/output
   - Real-time location tracking
   - Integration with facility management systems
   - Analytics and usage tracking

## Technical Details (If Asked)

- **Backend**: Node.js/Express
- **Frontend**: React
- **AI**: Google Generative AI (Gemini)
- **Path Finding**: Dijkstra's algorithm
- **Architecture**: RESTful API, ready for microservices

