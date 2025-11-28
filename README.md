# ISS AI Receptionist - Virtual Assistant

An AI-powered virtual receptionist chatbot for ISS Facility Services Limited, similar to MTR HK's Virtual Service Ambassador Tracy. This application helps visitors and customers navigate buildings, offices, spaces, and malls with intelligent path finding and multi-language support.

**Currently configured for: HSITP Building 8** (Hong Kong-Shenzhen Innovation and Technology Park - Building 8)

## Features

- 🤖 **AI-Powered Chatbot**: Uses Google Generative AI (Gemini) for natural language understanding
- 🗺️ **Path Finder**: Intelligent shortest path calculation between locations
- 🌐 **Multi-Language Support**: English, Cantonese (粵), and Mandarin (普)
- 🎨 **Modern UI**: Beautiful, responsive interface inspired by MTR's design
- 🔌 **REST API**: Ready for OutSystems integration
- 📱 **Responsive Design**: Works on desktop, tablet, and mobile devices

## Project Structure

```
ISS_AI_Receptionist/
├── server/                 # Backend API server
│   ├── routes/
│   │   ├── chat.js        # Chat API endpoints
│   │   └── pathFinder.js  # Path finding API endpoints
│   └── index.js           # Express server
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/    # React components
│   │   ├── App.js         # Main app component
│   │   └── index.js       # Entry point
│   └── public/            # Static files
├── .env.example           # Environment variables template
└── package.json           # Root package.json
```

## Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- Google API Key (for Gemini AI)

## Installation

1. **Clone or navigate to the project directory**

2. **Install dependencies:**
   ```bash
   npm run install-all
   ```

3. **Set up environment variables:**
   ```bash
   cp .env.example .env
   ```
   Then edit `.env` and add your Google API Key:
   ```
   GOOGLE_API_KEY=your_actual_api_key_here
   ```

## Running the Application

### Development Mode

Run both server and client concurrently:
```bash
npm run dev
```

Or run them separately:

**Terminal 1 - Backend:**
```bash
npm run server
```

**Terminal 2 - Frontend:**
```bash
npm run client
```

The application will be available at:
- Frontend: http://localhost:3000
- Backend API: http://localhost:5000/api

### Production Build

```bash
npm run build
```

Then start the server:
```bash
npm run server
```

## API Endpoints

### Chat API

- `POST /api/chat/message` - Send a chat message
  ```json
  {
    "message": "How do I get to the cafeteria?",
    "language": "en",
    "context": {
      "currentLocation": "Main Entrance",
      "availableLocations": "Various offices, spaces, and buildings"
    }
  }
  ```

- `GET /api/chat/health` - Check chat service health

### Path Finder API

- `GET /api/pathfinder/locations` - Get all available locations
- `POST /api/pathfinder/find-path` - Find shortest path between locations
  ```json
  {
    "from": "Main Entrance",
    "to": "Cafeteria"
  }
  ```
- `GET /api/pathfinder/search?q=office` - Search locations

## Configuration

### Location Graph

The path finder uses a graph-based data structure. The system is currently configured for **HSITP Building 8** with data loaded from `server/data/hsitp_locationGraph.json`.

**Current Configuration:**
- **Building**: HSITP Building 8 (Wet Laboratory Facility)
- **Location**: Lok Ma Chau Loop, New Territories, Hong Kong
- **Floors**: 9 floors (Ground Floor to 8th Floor)
- **Locations**: 35 nodes (entrances, labs, offices, facilities)
- **Paths**: 40 edges (connections between locations)

To customize locations, edit `server/data/hsitp_locationGraph.json` or create a new location graph file.

### Visual Representation Format

For floor plans and visual path representation, you can provide:

1. **SVG Floor Plans**: Vector graphics that can be scaled
2. **PNG/JPG Images**: Raster images with coordinate mapping
3. **GeoJSON**: For geographic data
4. **Custom JSON**: With coordinates and waypoints

**Recommended Format**: Provide a JSON file with:
- Floor plan image URL/path
- Coordinate mapping (pixel/real-world coordinates)
- Node positions on the image
- Floor information

Example structure:
```json
{
  "floors": [
    {
      "floor": 1,
      "image": "floor1.png",
      "scale": 1.0,
      "nodes": [
        {
          "id": "entrance",
          "x": 100,
          "y": 200,
          "pixelX": 150,
          "pixelY": 300
        }
      ]
    }
  ]
}
```

## OutSystems Integration

The API is designed to be easily integrated with OutSystems:

1. **Create REST API Consumer** in OutSystems
2. **Point to endpoints**: `http://your-server:5000/api`
3. **Use the chat endpoint** for AI responses
4. **Use path finder endpoint** for navigation

Example OutSystems integration:
- Add a button/link in your OutSystems UI
- On click, redirect to: `http://your-server:3000?location=Main%20Entrance`
- The chatbot will initialize with the specified location

## Demonstration

To demonstrate without OutSystems:

1. Start the application: `npm run dev`
2. Open http://localhost:3000
3. Try queries like:
   - "How do I get to the cafeteria?"
   - "Where is Meeting Room 1?"
   - "Show me the way to Office 201"
   - "How to get to Conference Hall from Main Entrance?"

## Future Enhancements

- [ ] Google Maps integration for outdoor navigation
- [ ] Floor plan image overlay for indoor navigation
- [ ] Voice input/output support
- [ ] Real-time location tracking
- [ ] Integration with facility management systems
- [ ] Analytics and usage tracking
- [ ] Multi-building support
- [ ] Accessibility features

## Troubleshooting

### Google API Key Issues
- Ensure your API key is valid and has Gemini API access enabled
- Check that the key is correctly set in `.env` file

### Port Conflicts
- Change `PORT` in `.env` if 5000 is already in use
- Change React port by setting `PORT=3001` in `client/.env`

### CORS Issues
- The server is configured to allow CORS from localhost
- For production, update CORS settings in `server/index.js`

## License

MIT

## Support

For issues or questions, please contact the development team.

