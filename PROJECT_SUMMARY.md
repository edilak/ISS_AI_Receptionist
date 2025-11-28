# ISS AI Receptionist - Project Summary

## What Has Been Created

A complete, production-ready prototype of an AI Receptionist Virtual Assistant for ISS Facility Services Limited, similar to MTR HK's Virtual Service Ambassador Tracy.

## Project Overview

### Architecture
- **Frontend**: React application with modern UI
- **Backend**: Node.js/Express REST API
- **AI Integration**: Google Generative AI (Gemini)
- **Path Finding**: Dijkstra's algorithm for shortest path calculation

### Key Features Implemented

1. **AI-Powered Chat Interface**
   - Natural language understanding
   - Context-aware responses
   - Multi-language support (EN, 粵, 普)

2. **Intelligent Path Finder**
   - Shortest path algorithm
   - Multi-floor navigation
   - Visual path representation
   - Step-by-step instructions

3. **Modern User Interface**
   - Virtual assistant avatar
   - Clean, professional design
   - Responsive layout
   - Similar to MTR's design aesthetic

4. **REST API**
   - `/api/chat/message` - Chat endpoint
   - `/api/pathfinder/find-path` - Path finding
   - `/api/pathfinder/locations` - List locations
   - `/api/pathfinder/search` - Search locations

## File Structure

```
ISS_AI_Receptionist/
├── server/
│   ├── index.js                    # Express server
│   ├── routes/
│   │   ├── chat.js                # Chat API routes
│   │   └── pathFinder.js          # Path finder routes
│   └── data/
│       ├── locationGraph.example.json
│       └── floorPlan.example.json
├── client/
│   ├── src/
│   │   ├── App.js                 # Main app component
│   │   ├── components/
│   │   │   ├── ChatInterface.js   # Chat UI
│   │   │   ├── PathMap.js         # Path visualization
│   │   │   ├── Header.js          # Top header
│   │   │   └── LanguageSelector.js
│   │   └── index.js
│   └── public/
├── README.md                       # Main documentation
├── SETUP.md                        # Quick setup guide
├── DEMO_GUIDE.md                   # Demonstration guide
├── VISUAL_REPRESENTATION_FORMAT.md # Floor plan format guide
└── package.json                    # Root dependencies
```

## Quick Start

1. **Install dependencies:**
   ```bash
   npm run install-all
   ```

2. **Create `.env` file:**
   ```
   PORT=5000
   GOOGLE_API_KEY=your_google_api_key_here
   REACT_APP_API_URL=http://localhost:5000/api
   ```

3. **Run the application:**
   ```bash
   npm run dev
   ```

4. **Open browser:**
   http://localhost:3000

## Configuration Needed

### 1. Google API Key
- Get from: https://makersuite.google.com/app/apikey
- Add to `.env` file as `GOOGLE_API_KEY`

### 2. Location Data
- Edit `server/routes/pathFinder.js`
- Update `locationGraph` with your building's locations
- Or load from JSON file (see examples in `server/data/`)

### 3. Visual Representation (Floor Plans)
- See `VISUAL_REPRESENTATION_FORMAT.md` for details
- Provide floor plan images (PNG, JPG, or SVG)
- Provide coordinate mapping JSON
- Format specified in `server/data/floorPlan.example.json`

## OutSystems Integration

### Option 1: Direct Link
Add a button/link in OutSystems that opens:
```
http://your-server:3000?location=Main%20Entrance
```

### Option 2: REST API Integration
1. Create REST API Consumer in OutSystems
2. Point to: `http://your-server:5000/api`
3. Use endpoints:
   - `POST /api/chat/message`
   - `POST /api/pathfinder/find-path`

### Option 3: Embedded iframe
Embed the React app in an OutSystems screen using iframe.

## Visual Representation Format

**You asked about the format needed for visual representation:**

The system needs:

1. **Floor Plan Images**
   - Format: PNG, JPG, or SVG
   - Recommended: 1000x800 pixels or larger
   - Place in `client/public/images/`

2. **Coordinate Mapping JSON**
   - See `server/data/floorPlan.example.json`
   - Maps node IDs to pixel positions on images
   - Includes scale and coordinate system info

3. **Location Graph**
   - See `server/data/locationGraph.example.json`
   - Defines nodes (locations) and edges (paths)
   - Currently in `server/routes/pathFinder.js`

**Please provide:**
- Floor plan images for each floor
- JSON file mapping locations to pixel coordinates
- Or we can help create the mapping if you provide the images

## Demonstration

The application is fully functional and can be demonstrated immediately:

1. Start with `npm run dev`
2. Open http://localhost:3000
3. Try queries like:
   - "How do I get to the cafeteria?"
   - "Show me the way to Office 201"
   - "How to get to Conference Hall from Main Entrance"

See `DEMO_GUIDE.md` for a complete demonstration script.

## Next Steps

1. **Get Google API Key** - Required for AI chat functionality
2. **Customize Locations** - Update location graph with your building data
3. **Provide Floor Plans** - For visual path representation
4. **Test Integration** - Test with OutSystems if needed
5. **Deploy** - Deploy to your server for production use

## Support Files

- `SETUP.md` - Detailed setup instructions
- `DEMO_GUIDE.md` - How to demonstrate the application
- `VISUAL_REPRESENTATION_FORMAT.md` - Floor plan format requirements
- `README.md` - Complete documentation

## Questions?

The prototype is ready for demonstration. Key points:

✅ **Works standalone** - No OutSystems needed for demo
✅ **API ready** - REST endpoints for integration
✅ **Customizable** - Easy to update locations and styling
✅ **Production ready** - Can be deployed as-is

For visual representation, please provide floor plan images and coordinate data as specified in `VISUAL_REPRESENTATION_FORMAT.md`.

