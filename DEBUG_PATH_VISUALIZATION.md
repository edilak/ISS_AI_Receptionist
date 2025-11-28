# Debugging Path Visualization

## Common Issues and Solutions

### Issue: Path map not showing at all

**Check:**
1. Open browser console (F12) and look for errors
2. Check if `pathData` is being set:
   ```javascript
   // In browser console
   // Check if pathData exists
   ```
3. Check if `showPathMap` is true
4. Verify the API response contains path data

**Debug steps:**
1. Check browser console for:
   - "Handling path query: ..."
   - "Extracted locations - From: ... To: ..."
   - "Path data received: ..."
   - "Path map should now be visible"

2. Test the API directly:
   ```bash
   curl -X POST http://localhost:5000/api/pathfinder/find-path \
     -H "Content-Type: application/json" \
     -d '{"from": "Main Entrance", "to": "Cafeteria"}'
   ```

### Issue: Floor plan image not loading

**Check:**
1. Verify images exist in `client/public/images/`:
   - `hsitp_floor_0.svg`
   - `hsitp_floor_1.svg`
   - etc.

2. Check browser Network tab for 404 errors

3. Verify image URLs in response:
   ```bash
   curl http://localhost:5000/api/pathfinder/floor-plans
   ```

**Solution:**
- Regenerate floor plans: `node scripts/generateFloorPlans.js`
- Check file paths are correct
- Ensure images are in `client/public/images/`

### Issue: Path overlay not visible

**Check:**
1. SVG overlay might be behind the image
2. Coordinates might be wrong
3. SVG viewBox might not match image size

**Solution:**
- Check browser DevTools Elements tab
- Verify SVG is rendering (should see `<svg>` element)
- Check if path lines are being drawn

### Issue: Location not found

**Check:**
1. Location name matching:
   - "cafeteria" should match "Cafeteria"
   - "Main Entrance" should match "Main Entrance"
   - Case-insensitive matching is enabled

2. Test location search:
   ```bash
   curl "http://localhost:5000/api/pathfinder/search?q=cafeteria"
   ```

**Solution:**
- Use exact location names from the location graph
- Check available locations: `curl http://localhost:5000/api/pathfinder/locations`

## Testing Commands

### Test Path Finding API
```bash
# Test from Main Entrance to Cafeteria
curl -X POST http://localhost:5000/api/pathfinder/find-path \
  -H "Content-Type: application/json" \
  -d '{"from": "Main Entrance", "to": "Cafeteria"}'

# Test from Reception to Lab 101
curl -X POST http://localhost:5000/api/pathfinder/find-path \
  -H "Content-Type: application/json" \
  -d '{"from": "Reception Desk", "to": "Wet Lab 101"}'
```

### Test Location Search
```bash
# Search for cafeteria
curl "http://localhost:5000/api/pathfinder/search?q=cafeteria"

# Search for lab
curl "http://localhost:5000/api/pathfinder/search?q=lab"
```

### Test Floor Plans API
```bash
curl http://localhost:5000/api/pathfinder/floor-plans
```

## Console Debugging

Add these to browser console to debug:

```javascript
// Check if pathData is set
console.log('Path Data:', window.pathData);

// Check if floor plan is loaded
console.log('Floor Plan Image:', document.querySelector('.floor-plan-image')?.src);

// Check SVG overlay
console.log('SVG Overlay:', document.querySelector('.path-overlay'));
```

## Expected Flow

1. User asks: "how do I get to cafeteria"
2. AI responds and sets `isPathQuery: true`
3. `handlePathQuery` extracts: from="Main Entrance", to="cafeteria"
4. API call to `/pathfinder/find-path`
5. Response contains path data
6. `setPathData(pathData)` and `setShowPathMap(true)`
7. `PathMap` component renders
8. Floor plan image loads
9. SVG overlay draws path

Check each step in browser console!

