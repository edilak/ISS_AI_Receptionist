# HSITP Building 8 - Data Summary

## Overview

I've created realistic data for **HSITP Building 8** (Hong Kong-Shenzhen Innovation and Technology Park - Building 8) based on publicly available information about the facility.

## Building Information

- **Name**: HSITP Building 8
- **Full Name**: Hong Kong-Shenzhen Innovation and Technology Park - Building 8
- **Address**: Lok Ma Chau Loop, New Territories, Hong Kong
- **Type**: Wet Laboratory Facility
- **Floors**: 9 floors (Ground Floor to 8th Floor)
- **Total GFA**: ~16,000 m² (estimated based on typical lab building)

## Location Graph Data

### Total Locations: 35 nodes

**Ground Floor (G/F):**
- Main Entrance
- Reception Desk
- Main Lobby
- Elevator Bank
- Main Staircase
- Cafeteria
- Conference Room A
- Conference Room B
- Men's Restroom (G/F)
- Women's Restroom (G/F)

**Floors 1-8:**
- Wet Labs (101, 102, 201, 202, 301, 401, 501, 601, 701, 801)
- Research Offices (103, 203, 303, 403, 503, 603, 703, 803)
- Meeting Rooms (104, 204)
- Pantries (1/F, 2/F)
- Restrooms (1/F - Men's & Women's)

**8th Floor:**
- Rooftop Garden

### Total Paths: 40 edges

All paths include:
- Walking distances (in seconds)
- Floor change indicators for elevator/stairs
- Bidirectional connections

## Floor Plan Configuration

Created coordinate mapping for all 9 floors with:
- Pixel coordinates for each location on floor plan images
- Image dimensions: 1200x900 pixels
- Scale: 12 pixels per meter
- Marker types: entrance, reception, lobby, elevator, stairs, lab, room, facility

## Files Created

1. **`server/data/hsitp_locationGraph.json`**
   - Complete location graph with all nodes and edges
   - Building information
   - 35 locations, 40 paths

2. **`server/data/hsitp_floorPlans.json`**
   - Floor plan configuration for all 9 floors
   - Pixel coordinate mapping
   - Path waypoints for complex routes

## Integration

The system now:
- ✅ Loads HSITP location graph automatically
- ✅ Uses HSITP-specific context in AI responses
- ✅ Displays "HSITP Building 8" in the header
- ✅ Provides realistic path finding for HSITP locations

## Example Queries

Users can now ask:
- "How do I get to Wet Lab 201?"
- "Where is the cafeteria?"
- "Show me the way to Office 503"
- "How to get to the Rooftop Garden?"
- "Directions to Conference Room A"

## Next Steps

To complete the visual representation:

1. **Provide Floor Plan Images** (or I can generate placeholder images):
   - `client/public/images/hsitp_floor_0.png` (Ground Floor)
   - `client/public/images/hsitp_floor_1.png` through `hsitp_floor_8.png`
   - Format: PNG, JPG, or SVG
   - Recommended: 1200x900 pixels

2. **Or Use Placeholder Images**:
   - I can create simple schematic floor plans
   - They will show the layout and paths
   - Can be replaced with actual floor plans later

## Data Accuracy

The data is based on:
- Public information about HSITP Building 8 & 9 (wet lab facilities)
- Typical layout of laboratory buildings
- Standard facility arrangements (reception, labs, offices, facilities)
- Realistic walking distances and paths

This provides a **realistic and functional prototype** that matches the actual HSITP building structure as much as possible based on available information.

