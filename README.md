# ISS AI Receptionist - Virtual Assistant

An AI-powered virtual receptionist chatbot for ISS Facility Services Limited, similar to MTR HK's Virtual Service Ambassador Tracy. This application helps visitors and customers navigate buildings, offices, spaces, and malls with intelligent path finding and multi-language support.

**Currently configured for: HSITP Building 8** (Hong Kong-Shenzhen Innovation and Technology Park - Building 8)

## Features

- 🤖 **AI-Powered Chatbot**: Uses Azure OpenAI (GPT-4) for natural language understanding
- 🎤 **Voice Input**: Speech-to-text using Azure Speech Service for hands-free interaction
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
- Azure OpenAI API Key and Endpoint (for GPT-4)
- Azure Speech Service Key and Region (for voice input)

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
   Then edit `.env` and add your Azure credentials:
   ```
   # Azure OpenAI (for chatbot)
   AZURE_OPENAI_API_KEY=your_azure_openai_api_key
   AZURE_OPENAI_ENDPOINT=https://your-resource-name.openai.azure.com
   AZURE_OPENAI_DEPLOYMENT_NAME=gpt-4
   AZURE_OPENAI_API_VERSION=2024-12-01-preview
   
   # Azure Speech Service (for voice input)
   AZURE_SPEECH_KEY=your_azure_speech_key
   AZURE_SPEECH_REGION=eastus
   ```
   
   **Getting Azure OpenAI Credentials:**
   1. Go to [Azure Portal](https://portal.azure.com)
   2. Create or navigate to your Azure OpenAI resource
   3. Go to "Keys and Endpoint" to get your API key and endpoint
   4. Go to "Deployments" to create a GPT-4 deployment (or use existing one)
   5. Use the deployment name in `AZURE_OPENAI_DEPLOYMENT_NAME`
   
   **Getting Azure Speech Service Credentials:**
   1. Go to [Azure Portal](https://portal.azure.com)
   2. Create a new "Speech" resource (or use existing one)
   3. Go to "Keys and Endpoint" to get your API key
   4. Note your resource region (e.g., `eastus`, `westus`, `southeastasia`)
   5. Add `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION` to your `.env` file

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

### Speech API

- `GET /api/speech/token` - Get Azure Speech Service access token (for frontend use)
  - Returns a token valid for 10 minutes
  - Used by the VoiceInput component for speech recognition

- `POST /api/speech/recognize` - Speech-to-text recognition (alternative REST API method)
  ```json
  {
    "audioData": "base64_encoded_audio",
    "language": "en"
  }
  ```

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

## Voice Input Feature

The chatbot now supports voice input using Azure Speech Service. Users can click the microphone button to speak their questions instead of typing.

### How to Use Voice Input

1. Click the microphone button in the chat input area
2. Speak your question clearly
3. The speech will be converted to text and appear in the input field
4. Click the microphone again to stop listening, or click send to submit

### Supported Languages

- English (en-US)
- Cantonese (zh-HK)
- Mandarin (zh-CN)

### Browser Requirements

- Chrome, Edge, or Safari (latest versions)
- Microphone permissions must be granted
- HTTPS required for production (microphone access requires secure context)

### Troubleshooting Voice Input

- **Microphone not working**: Check browser permissions and ensure microphone access is granted
- **No speech detected**: Speak clearly and ensure you're in a quiet environment
- **Token errors**: Verify `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION` are correctly set in `.env`

## Future Enhancements

- [ ] Google Maps integration for outdoor navigation
- [ ] Floor plan image overlay for indoor navigation
- [ ] Voice output (text-to-speech) support
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

### Voice Input Issues
- Ensure `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION` are set in `.env`
- Check browser console for microphone permission errors
- For production, ensure your site is served over HTTPS (required for microphone access)
- Verify your Azure Speech Service resource is active and has available quota

## License

MIT

## Support

For issues or questions, please contact the development team.

