# Visual Representation Format for Floor Plans

## Overview

To display visual path representations on floor plans, we need floor plan images and coordinate mapping data. This document explains the required format.

## Required Format

### Option 1: JSON Configuration (Recommended)

Provide a JSON file with the following structure:

```json
{
  "floors": [
    {
      "floor": 1,
      "name": "Ground Floor",
      "image": {
        "url": "/images/floor1.png",
        "width": 1000,
        "height": 800
      },
      "scale": {
        "pixelsPerMeter": 10,
        "originX": 0,
        "originY": 0
      },
      "nodes": [
        {
          "id": "entrance",
          "pixelX": 50,
          "pixelY": 400,
          "realX": 0,
          "realY": 0
        }
      ]
    }
  ]
}
```

### Option 2: Simple Image with Coordinates

Provide:
1. **Floor plan image** (PNG, JPG, or SVG)
2. **Coordinate mapping** (JSON or CSV)

## Image Requirements

### Supported Formats
- **PNG** (recommended for photos)
- **JPG/JPEG** (for photos)
- **SVG** (recommended for vector graphics)

### Recommended Specifications
- **Minimum resolution**: 800x600 pixels
- **Optimal resolution**: 1000x800 pixels or higher
- **Aspect ratio**: 4:3 or 16:9
- **File size**: Under 2MB for web performance

### Image Quality
- Clear, readable labels
- Good contrast
- Straight-on view (not angled)
- Include room numbers, labels, and landmarks

## Coordinate System

### Pixel Coordinates
- **Origin (0,0)**: Top-left corner of the image
- **X-axis**: Increases from left to right
- **Y-axis**: Increases from top to bottom

### Real-World Coordinates (Optional)
- Used for distance calculations
- Measured in meters
- Can be relative or absolute

## Node Mapping

Each location (node) in your location graph needs:

```json
{
  "id": "entrance",              // Must match node ID in locationGraph
  "pixelX": 50,                  // X position on image (pixels)
  "pixelY": 400,                 // Y position on image (pixels)
  "realX": 0,                    // Optional: Real-world X (meters)
  "realY": 0,                    // Optional: Real-world Y (meters)
  "marker": "entrance"           // Optional: Marker type (entrance, room, elevator, etc.)
}
```

## Path Visualization

Paths between nodes can include waypoints:

```json
{
  "from": "entrance",
  "to": "reception",
  "waypoints": [
    { "pixelX": 125, "pixelY": 400 }
  ]
}
```

## Example Workflow

1. **Get your floor plan image**
   - Export from CAD software
   - Scan physical floor plan
   - Use building management system export

2. **Identify node positions**
   - Mark each location on the image
   - Note pixel coordinates (X, Y)
   - Match to your location graph IDs

3. **Create JSON configuration**
   - Use the example structure
   - Include all floors
   - Map all nodes

4. **Provide files**
   - Floor plan images (in `public/images/` or provide URLs)
   - JSON configuration file
   - Any additional metadata

## Sample Data Structure

See `server/data/floorPlan.example.json` for a complete example.

## Integration Steps

Once you provide the data:

1. Place floor plan images in `client/public/images/`
2. Update `server/data/floorPlan.json` with your configuration
3. The path visualization component will automatically use it
4. Paths will be drawn on the floor plan images

## Questions to Answer

To help prepare the visual representation, please provide:

1. **How many floors?** (List each floor number/name)
2. **Do you have floor plan images?** (Format, resolution, source)
3. **What's the coordinate system?** (Pixel-based or real-world measurements)
4. **Are there specific landmarks?** (Elevators, stairs, exits, etc.)
5. **Any special requirements?** (Accessibility routes, restricted areas, etc.)

## Alternative: Google Maps Integration

For outdoor navigation or buildings with Google Maps data:

- Provide building address
- Use Google Maps API
- Paths will be shown on Google Maps
- Requires `REACT_APP_GOOGLE_MAPS_API_KEY` in `.env`

## Support

If you need help preparing the data:
- Contact the development team
- Provide sample floor plans
- We can help create the coordinate mapping

