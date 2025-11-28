# Quick Setup Guide

## Step 1: Install Dependencies

```bash
npm run install-all
```

This will install dependencies for both the root project and the React client.

## Step 2: Configure Environment

Create a `.env` file in the root directory with the following content:

```
# Server Configuration
PORT=5000
NODE_ENV=development

# Google AI API Key (Required for chat functionality)
GOOGLE_API_KEY=your_google_api_key_here

# React App Configuration
REACT_APP_API_URL=http://localhost:5000/api

# Google Maps API Key (Optional, for future use)
REACT_APP_GOOGLE_MAPS_API_KEY=your_google_maps_api_key_here
```

Replace `your_google_api_key_here` with your actual Google API Key.

**To get a Google API Key:**
1. Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Sign in with your Google account
3. Click "Create API Key"
4. Copy the key and paste it in your `.env` file

## Step 3: Run the Application

```bash
npm run dev
```

This starts both the backend server (port 5000) and frontend (port 3000).

## Step 4: Access the Application

Open your browser and go to: **http://localhost:3000**

## Testing the Chatbot

Try these example queries:
- "How do I get to the cafeteria?"
- "Where is Meeting Room 1?"
- "Show me the way to Office 201"
- "How to get to Conference Hall from Main Entrance?"

## For Demonstration

The application is fully functional and can be demonstrated without OutSystems integration. Simply:
1. Start the app with `npm run dev`
2. Open http://localhost:3000
3. Show the chat interface and path finding features

## Visual Representation Format

For floor plans and visual path representation, please provide:

**Format Options:**
1. **SVG** - Vector graphics (recommended for scalability)
2. **PNG/JPG** - Raster images with coordinate mapping
3. **JSON** - Structured data with coordinates

**Required Information:**
- Floor plan image (URL or file path)
- Node positions (x, y coordinates on the image)
- Floor information
- Scale/mapping information

**Example JSON structure:**
```json
{
  "floors": [
    {
      "floor": 1,
      "image": "floor1.png",
      "scale": 1.0,
      "width": 1000,
      "height": 800,
      "nodes": [
        {
          "id": "entrance",
          "name": "Main Entrance",
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

Please provide your floor plan data in this format, and I can integrate it into the path visualization component.

