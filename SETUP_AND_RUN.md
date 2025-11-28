# Complete Setup and Run Guide

## Prerequisites

Before starting, make sure you have:
- ✅ **Node.js** (v14 or higher) - [Download here](https://nodejs.org/)
- ✅ **npm** (comes with Node.js)
- ✅ **Google API Key** - [Get it here](https://makersuite.google.com/app/apikey)

## Step-by-Step Setup

### Step 1: Install Dependencies

Open a terminal in the project directory and run:

```bash
npm run install-all
```

This will install dependencies for:
- Root project (backend server)
- React client (frontend)

**Expected output:**
```
✅ Installing root dependencies...
✅ Installing client dependencies...
✅ All dependencies installed!
```

### Step 2: Create Environment File

Create a `.env` file in the root directory:

**Windows (PowerShell):**
```powershell
New-Item -Path .env -ItemType File
```

**Or manually create** a file named `.env` in the root directory with this content:

```env
# Server Configuration
PORT=5000
NODE_ENV=development

# Google AI API Key (REQUIRED for chat functionality)
GOOGLE_API_KEY=your_google_api_key_here

# React App Configuration
REACT_APP_API_URL=http://localhost:5000/api

# Google Maps API Key (Optional, for future use)
REACT_APP_GOOGLE_MAPS_API_KEY=your_google_maps_api_key_here
```

### Step 3: Get Google API Key

1. Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Sign in with your Google account
3. Click **"Create API Key"**
4. Copy the API key
5. Paste it in your `.env` file, replacing `your_google_api_key_here`

**Important:** The API key should look like: `AIzaSy...` (long string)

### Step 4: Verify Setup

Check that all files are in place:
- ✅ `.env` file exists with your API key
- ✅ `node_modules` folder exists (after running `npm run install-all`)
- ✅ `client/node_modules` folder exists

## Running the Application

### Option 1: Run Both Server and Client Together (Recommended)

```bash
npm run dev
```

This starts:
- **Backend server** on `http://localhost:5000`
- **Frontend React app** on `http://localhost:3000`

**Expected output:**
```
[0] ✅ Loaded HSITP location graph: 35 nodes, 40 edges
[0] 🚀 ISS AI Receptionist server running on port 5000
[0] 📍 API endpoints available at http://localhost:5000/api
[1] Starting the development server...
[1] Compiled successfully!
[1] webpack compiled successfully
```

### Option 2: Run Separately (Two Terminals)

**Terminal 1 - Backend:**
```bash
npm run server
```

**Terminal 2 - Frontend:**
```bash
npm run client
```

## Access the Application

Once running, open your browser and go to:

**http://localhost:3000**

You should see:
- ✅ Virtual assistant avatar (Tracy)
- ✅ Chat interface
- ✅ Language selector (EN, 粵, 普)
- ✅ Header showing "HSITP Building 8"

## Testing the Application

### Test Chat Functionality

Try these queries in the chat:

1. **Simple greeting:**
   - "Hello"
   - "How can you help me?"

2. **Path finding:**
   - "How do I get to the cafeteria?"
   - "Where is Wet Lab 201?"
   - "Show me the way to Office 503"
   - "How to get to the Rooftop Garden from Main Entrance?"

3. **Multi-floor navigation:**
   - "How do I get to Office 803 from Main Entrance?"
   - "Directions to Wet Lab 501"

### Expected Behavior

- ✅ AI responds with helpful text
- ✅ Path visualization appears below chat
- ✅ Floor plan image shows with path overlay
- ✅ Step-by-step instructions displayed

## Troubleshooting

### Issue: "GoogleGenerativeAIError: models/gemini-xxx is not found"

**Solution:** The model name has been updated to use the latest available models. The current model is `gemini-2.5-flash`.

**Fix:** 
1. Restart the server after pulling latest code:
```bash
# Stop the server (Ctrl+C)
npm run dev
```

2. If still having issues, check available models:
```bash
node scripts/listModels.js
```

This will show you all available models for your API key.

### Issue: "AI model not initialized"

**Solution:** Check your `.env` file:
1. Make sure `GOOGLE_API_KEY` is set
2. No quotes around the API key
3. No extra spaces
4. File is named exactly `.env` (not `.env.txt`)

### Issue: Port 5000 or 3000 already in use

**Solution:** Change the port in `.env`:
```env
PORT=5001
REACT_APP_API_URL=http://localhost:5001/api
```

Or kill the process using the port:
```bash
# Windows
netstat -ano | findstr :5000
taskkill /PID <PID> /F
```

### Issue: "Cannot find module" errors

**Solution:** Reinstall dependencies:
```bash
npm run install-all
```

### Issue: React app won't compile

**Solution:** 
1. Check for syntax errors in the terminal
2. Clear cache and reinstall:
```bash
cd client
rm -rf node_modules package-lock.json
npm install
cd ..
npm run dev
```

## Windows-Specific Notes

### Using PowerShell

If you encounter issues with `&&` in scripts:
- Use Git Bash or WSL instead
- Or run commands separately

### File Permissions

If you get permission errors:
- Run terminal as Administrator
- Or adjust file permissions

## Production Build

To create a production build:

```bash
npm run build
```

This creates optimized files in `client/build/` that can be deployed.

## Stopping the Application

Press `Ctrl+C` in the terminal to stop both server and client.

## Quick Reference

| Command | Description |
|---------|-------------|
| `npm run install-all` | Install all dependencies |
| `npm run dev` | Start both server and client |
| `npm run server` | Start only backend server |
| `npm run client` | Start only frontend |
| `npm run build` | Create production build |

## Next Steps

Once running successfully:
1. ✅ Test the chat interface
2. ✅ Try path finding queries
3. ✅ Test multi-language support
4. ✅ Verify floor plan visualization
5. ✅ Prepare for demonstration

## Support

If you encounter issues:
1. Check the terminal output for error messages
2. Verify `.env` file is configured correctly
3. Ensure all dependencies are installed
4. Check that ports 5000 and 3000 are available

---

**You're all set!** 🎉 The application should now be running and ready to use.

