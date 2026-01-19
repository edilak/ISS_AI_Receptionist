/**
 * Location Graph Model
 * 
 * Stores graph-based location data for pathfinding
 */

const mongoose = require('mongoose');

const NodeSchema = new mongoose.Schema({
  id: { type: String, required: true },
  name: { type: String, required: true },
  floor: { type: Number, required: true },
  x: { type: Number, required: true },
  y: { type: Number, required: true },
  type: { 
    type: String, 
    enum: ['entrance', 'reception', 'lobby', 'elevator', 'stairs', 'corridor', 'zone', 'facility'],
    default: 'zone'
  },
  metadata: { type: mongoose.Schema.Types.Mixed }
}, { _id: false });

const EdgeSchema = new mongoose.Schema({
  from: { type: String, required: true },
  to: { type: String, required: true },
  weight: { type: Number, default: 1 },
  bidirectional: { type: Boolean, default: true },
  metadata: { type: mongoose.Schema.Types.Mixed }
}, { _id: false });

const LocationGraphSchema = new mongoose.Schema({
  name: { type: String, default: 'HSITP Location Graph' },
  nodes: [NodeSchema],
  edges: [EdgeSchema],
  version: { type: Number, default: 1 },
  metadata: { type: mongoose.Schema.Types.Mixed }
}, {
  timestamps: true,
  collection: 'location_graphs'
});

// Get latest location graph
LocationGraphSchema.statics.getLatest = async function() {
  return await this.findOne().sort({ updatedAt: -1 });
};

LocationGraphSchema.statics.updateLatest = async function(data) {
  const latest = await this.getLatest();
  if (latest) {
    latest.nodes = data.nodes || latest.nodes;
    latest.edges = data.edges || latest.edges;
    latest.version = (latest.version || 1) + 1;
    if (data.metadata) {
      latest.metadata = data.metadata;
    }
    return await latest.save();
  } else {
    return await this.create(data);
  }
};

const LocationGraph = mongoose.model('LocationGraph', LocationGraphSchema);

module.exports = LocationGraph;

