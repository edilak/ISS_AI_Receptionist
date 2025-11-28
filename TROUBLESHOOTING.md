# Troubleshooting Guide

## Google AI Model Errors

### Error: "models/gemini-xxx is not found"

**Cause:** The model name might be outdated or your API key doesn't have access to that model.

**Solution:**

1. **Check available models:**
   ```bash
   node scripts/listModels.js
   ```
   This will show all models available for your API key.

2. **Update model name in code:**
   The code automatically uses `gemini-2.5-flash` which should work with most API keys.

3. **If models are not available:**
   - Go to [Google Cloud Console](https://console.cloud.google.com/apis/library)
   - Search for "Generative Language API"
   - Click "Enable"
   - Wait a few minutes and try again

### Error: "API key not valid"

**Solution:**
1. Verify your API key in `.env` file
2. Make sure there are no extra spaces or quotes
3. Get a new API key from [Google AI Studio](https://makersuite.google.com/app/apikey)

## Port Already in Use

### Error: "Port 5000 already in use"

**Solution (Windows):**
```powershell
# Find process using port 5000
netstat -ano | findstr :5000

# Kill the process (replace <PID> with actual process ID)
taskkill /PID <PID> /F
```

**Solution (Mac/Linux):**
```bash
# Find and kill process
lsof -ti:5000 | xargs kill -9
```

Or change the port in `.env`:
```env
PORT=5001
REACT_APP_API_URL=http://localhost:5001/api
```

## Module Not Found Errors

### Error: "Cannot find module '@google/generative-ai'"

**Solution:**
```bash
npm run install-all
```

If that doesn't work:
```bash
# Remove node_modules and reinstall
rm -rf node_modules client/node_modules
npm run install-all
```

## React Compilation Warnings

### ESLint Warnings

These are just warnings and won't prevent the app from running. To fix:

1. **Unused imports:** Remove unused imports
2. **Missing dependencies:** Add missing dependencies to useEffect dependency arrays
3. **Or disable warnings:** Add `// eslint-disable-next-line` above the line

## Path Finding Not Working

### Error: "No path found"

**Check:**
1. Location names match exactly (case-sensitive)
2. Both locations exist in the location graph
3. There's a connection between the locations

**Test:**
```bash
# Check available locations
curl http://localhost:5000/api/pathfinder/locations

# Test path finding
curl -X POST http://localhost:5000/api/pathfinder/find-path \
  -H "Content-Type: application/json" \
  -d '{"from": "hsitp_main_entrance", "to": "hsitp_cafeteria"}'
```

## Floor Plans Not Displaying

### Issue: Floor plan images not showing

**Check:**
1. Images exist in `client/public/images/`
2. File names match: `hsitp_floor_0.svg` through `hsitp_floor_8.svg`
3. Browser console for 404 errors

**Solution:**
```bash
# Regenerate floor plans
node scripts/generateFloorPlans.js
```

## API Connection Issues

### Error: "Network Error" or "CORS Error"

**Solution:**
1. Make sure backend server is running on port 5000
2. Check `REACT_APP_API_URL` in `.env` matches server URL
3. Verify CORS is enabled in `server/index.js`

## Still Having Issues?

1. **Check logs:** Look at terminal output for detailed error messages
2. **Verify setup:** Run through SETUP_AND_RUN.md again
3. **Test components:**
   - Test API: `curl http://localhost:5000/api/health`
   - Test chat: `curl http://localhost:5000/api/chat/health`
   - Test pathfinder: `curl http://localhost:5000/api/pathfinder/locations`

4. **Common fixes:**
   - Restart the application
   - Clear browser cache
   - Reinstall dependencies
   - Check `.env` file configuration

