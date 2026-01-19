# Data Structures and Data Files

## Overview

This project uses data files and structures to support continuous space navigation, pathfinding, and building information. The system uses:
- **Continuous space navigation** (using corridors and destinations with RL)

---

## Core Data Files

### 1. `server/data/space_definitions.json`
**Purpose**: Defines navigable corridors and destination points for continuous space navigation.

**Structure**:
```json
{
  "corridors": [
    {
      "id": "string",           // Unique identifier (e.g., "corridor_1767842542563")
      "name": "string",         // Human-readable name (e.g., "Left Corridor")
      "floor": number,          // Floor number (0 = ground floor, 1 = first floor, etc.)
      "polygon": [              // Array of [x, y] coordinate pairs defining the corridor shape
        [x1, y1],
        [x2, y2],
        ...
      ],
      "type": "corridor"
    }
  ],
  "destinations": [
    {
      "id": "string",           // Unique identifier (e.g., "dest_1767841845451")
      "name": "string",         // Human-readable name (e.g., "AHU Room")
      "zone": "string",         // Zone identifier (e.g., "ahu_room", "zone_6")
      "floor": number,          // Floor number
      "x": number,              // X coordinate (pixels)
      "y": number,              // Y coordinate (pixels)
      "facing": "string"        // Direction: "north", "south", "east", "west"
    }
  ],
  "gridSize": number,          // Grid cell size in pixels (default: 10)
  "savedAt": "ISO8601 string"  // Timestamp of last save
}
```

**Used by**: `SpaceNavigationEngine`, `ContinuousSpaceRLAgent`, `GridGenerator`

---

### 2. `server/data/hsitp_floorPlans.json`
**Purpose**: Floor plan images and coordinate mapping for visual path representation.

**Structure**:
```json
{
  "description": "string",
  "building": {
    "name": "string",
    "fullName": "string",
    "address": "string",
    "type": "string",
    "specifications": {
      "gFloorArea": "string",
      "typicalFloorArea": "string",
      "labProvisions": "string"
    }
  },
  "floors": [
    {
      "floor": number,          // Floor number (0 = ground floor)
      "name": "string",         // Human-readable name (e.g., "Ground Floor")
      "image": {
        "url": "string",        // Path to image (e.g., "/images/building11_2d.png")
        "width": number,        // Image width in pixels
        "height": number,       // Image height in pixels
        "format": "string",      // "png", "jpg", "svg", "webp"
        "naturalWidth": number, // Original image width
        "naturalHeight": number,// Original image height
        "aspectRatio": number   // Width/height ratio
      },
      "scale": {
        "pixelsPerMeter": number, // Conversion factor (e.g., 12)
        "originX": number,        // X origin offset
        "originY": number         // Y origin offset
      },
      "transform": {
        "scaleX": number,        // X scale factor
        "scaleY": number,        // Y scale factor
        "offsetX": number,       // X offset
        "offsetY": number        // Y offset
      },
      "referencePoints": [      // Optional: calibration points
        {
          "id": "string",
          "pixelX": number,
          "pixelY": number,
          "label": "string"
        }
      ],
      "nodes": [                // Optional: node positions on this floor
        {
          "id": "string",
          "pixelX": number,
          "pixelY": number,
          "realX": number,
          "realY": number,
          "marker": "string",
          "name": "string"
        }
      ],
      "paths": []                // Optional: pre-computed paths
    }
  ],
  "instructions": {
    "note": "string",
    "supportedFormats": ["string"],
    "recommendedSize": "string",
    "coordinateSystem": "string",
    "buildingInfo": "string",
    "zoneLayout": "string"
  }
}
```

**Used by**: `PathVisualizer`, `AdvancedPathVisualizer`, `SpaceNavigationEngine` (for image dimensions)

---

## Additional Data Files

### 3. `server/data/space_rl_model.json`
**Purpose**: Saved value maps for continuous space RL agent.

**Structure**: Internal format used by `ContinuousSpaceRLAgent`.

**Used by**: `ContinuousSpaceRLAgent`, `SpaceNavigationEngine`

---

## Data Structure Relationships

```
┌─────────────────────────────────────────────────────────────┐
│              Continuous Space Navigation System              │
└─────────────────────────────────────────────────────────────┘
                            │
                     ┌───────▼────────┐
                     │ space_definitions│
                     │ .json            │
                     └───────┬────────┘
                             │
                     ┌───────▼────────┐
                     │ floorPlans.json │
                     │ (Visualization)  │
                     └─────────────────┘
```

---

## Data Flow

### **Continuous Space Navigation Flow**
```
User Query → Chat API → SpaceNavigationEngine
                                    ↓
                            Load space_definitions.json
                                    ↓
                            Load floorPlans.json (for dimensions)
                                    ↓
                            ContinuousSpaceRLAgent
                                    ↓
                            Generate path in continuous space
                                    ↓
                            Visualize on floor plan
```

---

## Key Data Structure Requirements

### For Corridors (`space_definitions.json`)
- **Polygon**: Must be a closed polygon (first and last point should be the same or connected)
- **Coordinates**: Pixel coordinates relative to floor plan image
- **Floor**: Must match floor numbers in `floorPlans.json`
- **Type**: Always "corridor"

### For Destinations (`space_definitions.json`)
- **Coordinates**: Must be within a corridor polygon on the same floor
- **Zone**: Optional identifier for grouping (e.g., "zone_6", "ahu_room")
- **Facing**: Used for orientation when arriving at destination

### For Floor Plans (`hsitp_floorPlans.json`)
- **Image URL**: Must be accessible from client (placed in `client/public/images/`)
- **Scale**: `pixelsPerMeter` is critical for coordinate conversion
- **Transform**: Used for image alignment and calibration

---

## Coordinate Systems

### 1. **Pixel Coordinates** (space_definitions.json)
- Origin: Top-left corner (0, 0)
- X-axis: Increases rightward
- Y-axis: Increases downward
- Units: Pixels relative to floor plan image

### 2. **Grid Coordinates** (Internal)
- Origin: Top-left corner (0, 0)
- Units: Grid cells (cell size = `gridSize` from space_definitions.json)
- Used for: RL agent navigation mesh

---

## Data Validation

### Required Fields

**Corridors**:
- ✅ `id`, `name`, `floor`, `polygon`, `type`

**Destinations**:
- ✅ `id`, `name`, `floor`, `x`, `y`
- ⚠️ `zone`, `facing` (optional but recommended)

**Floor Plans**:
- ✅ `floor`, `name`, `image.url`, `image.width`, `image.height`
- ⚠️ `scale.pixelsPerMeter` (required for accurate navigation)

---

## Data File Locations

```
server/data/
├── space_definitions.json          # Corridors & destinations
├── hsitp_floorPlans.json           # Floor plan images & mapping
├── space_rl_model.json             # RL value maps (auto-generated)
└── floorPlan.example.json          # Example template
```

---

## Best Practices

1. **Consistency**: Keep floor numbers consistent across all data files
2. **Coordinate Systems**: Document which coordinate system each file uses
3. **Validation**: Validate polygon closure and coordinate ranges
4. **Backups**: Keep backup files (`.backup.json`, `.bak`) before major changes
5. **Version Control**: Commit data files to track changes
6. **Testing**: Test navigation after any data structure changes

---

## Example: Adding a New Destination

1. **Edit `space_definitions.json`**:
```json
{
  "destinations": [
    {
      "id": "dest_new_room_123",
      "name": "New Meeting Room",
      "zone": "meeting_room",
      "floor": 1,
      "x": 1250,
      "y": 900,
      "facing": "north"
    }
  ]
}
```

2. **Ensure coordinates are within a corridor** on the same floor
3. **Save and reload** via API: `POST /api/space-nav/definitions`
4. **Retrain RL agent** if needed: `POST /api/space-nav/train`

---

## Example: Adding a New Corridor

1. **Edit `space_definitions.json`**:
```json
{
  "corridors": [
    {
      "id": "corridor_new_123",
      "name": "New Corridor",
      "floor": 1,
      "polygon": [
        [1000, 500],
        [1200, 500],
        [1200, 600],
        [1000, 600],
        [1000, 500]
      ],
      "type": "corridor"
    }
  ]
}
```

2. **Ensure polygon is closed** (first and last point should be the same)
3. **Save and reload** via API: `POST /api/space-nav/definitions`
4. **Retrain RL agent** if needed: `POST /api/space-nav/train`

