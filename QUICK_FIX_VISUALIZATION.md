# Quick Fix for Path Visualization Not Showing

## Issue
The path visualization is not appearing after asking for directions.

## Quick Test

1. **Open browser console** (F12)
2. **Ask a question**: "how do I get to cafeteria"
3. **Check console logs** - you should see:
   - "Path query detected, calling handlePathQuery"
   - "Handling path query: ..."
   - "Extracted locations - From: ... To: ..."
   - "Path data received: ..."
   - "✅ Setting path data and showing map"
   - "✅ Path map visibility set to true"
   - "✅ PathMap: Rendering with pathData: ..."

## If You Don't See These Logs

### Check 1: Is handlePathQuery being called?
- Look for "Path query detected" in console
- If not, the query might not be detected as a path query

### Check 2: Is the API call being made?
- Check Network tab in browser DevTools
- Look for a request to `/api/pathfinder/find-path`
- Check if it returns 200 status

### Check 3: Is pathData being set?
- In console, type: `window.pathData` (if we expose it)
- Or check React DevTools for component state

## Manual Test

Test the API directly:

```javascript
// In browser console
fetch('http://localhost:5000/api/pathfinder/find-path', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ from: 'Main Entrance', to: 'Cafeteria' })
})
.then(r => r.json())
.then(data => {
  console.log('Path data:', data);
  // This should show the path
});
```

## Common Issues

1. **Location not found**: Check location names match exactly
2. **API error**: Check server logs for errors
3. **Component not rendering**: Check if `showPathMap` is true and `pathData` exists
4. **Floor plan not loading**: Check if images exist in `client/public/images/`

## Force Show Path Map (Debug)

Add this to browser console to manually trigger:

```javascript
// Get path data
fetch('http://localhost:5000/api/pathfinder/find-path', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ from: 'Main Entrance', to: 'Cafeteria' })
})
.then(r => r.json())
.then(data => {
  // Find the App component and set state (if accessible)
  console.log('Path data:', data);
});
```

## Next Steps

1. Check browser console for errors
2. Check Network tab for failed requests
3. Verify location names are correct
4. Test with simpler query: "cafeteria"

