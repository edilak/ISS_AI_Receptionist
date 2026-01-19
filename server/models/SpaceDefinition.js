/**
 * Space Definition Model
 * 
 * Stores corridors and destinations for continuous space navigation
 */

const mongoose = require('mongoose');

const CorridorSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  floor: { type: Number, required: true },
  polygon: {
    type: [[Number]], // Array of [x, y] coordinate pairs
    required: true
  },
  type: { type: String, default: 'corridor' }
}, { _id: false });

const DestinationSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  zone: { type: String },
  floor: { type: Number, required: true },
  x: { type: Number, required: true },
  y: { type: Number, required: true },
  facing: { type: String, enum: ['north', 'south', 'east', 'west'] }
}, { _id: false });

const SpaceDefinitionSchema = new mongoose.Schema({
  corridors: [CorridorSchema],
  destinations: [DestinationSchema],
  gridSize: { type: Number, default: 10 },
  savedAt: { type: Date, default: Date.now },
  version: { type: Number, default: 1 }
}, {
  timestamps: true,
  collection: 'space_definitions'
});

// Create a singleton document (only one space definition document)
SpaceDefinitionSchema.statics.getLatest = async function() {
  return await this.findOne().sort({ savedAt: -1 });
};

SpaceDefinitionSchema.statics.updateLatest = async function(data) {
  const latest = await this.getLatest();
  if (latest) {
    latest.corridors = data.corridors || latest.corridors;
    latest.destinations = data.destinations || latest.destinations;
    latest.gridSize = data.gridSize || latest.gridSize;
    latest.savedAt = new Date();
    latest.version = (latest.version || 1) + 1;
    return await latest.save();
  } else {
    return await this.create(data);
  }
};

const SpaceDefinition = mongoose.model('SpaceDefinition', SpaceDefinitionSchema);

module.exports = SpaceDefinition;

