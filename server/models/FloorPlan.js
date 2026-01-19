/**
 * Floor Plan Model
 * 
 * Stores floor plan images and coordinate mapping for visual path representation
 */

const mongoose = require('mongoose');

const ImageSchema = new mongoose.Schema({
  url: { type: String, required: true },
  width: { type: Number, required: true },
  height: { type: Number, required: true },
  format: { type: String, enum: ['png', 'jpg', 'jpeg', 'svg', 'webp'] },
  naturalWidth: { type: Number },
  naturalHeight: { type: Number },
  aspectRatio: { type: Number }
}, { _id: false });

const ScaleSchema = new mongoose.Schema({
  pixelsPerMeter: { type: Number },
  originX: { type: Number, default: 0 },
  originY: { type: Number, default: 0 }
}, { _id: false });

const TransformSchema = new mongoose.Schema({
  scaleX: { type: Number, default: 1 },
  scaleY: { type: Number, default: 1 },
  offsetX: { type: Number, default: 0 },
  offsetY: { type: Number, default: 0 }
}, { _id: false });

const ReferencePointSchema = new mongoose.Schema({
  id: { type: String, required: true },
  pixelX: { type: Number, required: true },
  pixelY: { type: Number, required: true },
  label: { type: String }
}, { _id: false });

const NodeSchema = new mongoose.Schema({
  id: { type: String, required: true },
  pixelX: { type: Number, required: true },
  pixelY: { type: Number, required: true },
  realX: { type: Number },
  realY: { type: Number },
  marker: { type: String },
  name: { type: String }
}, { _id: false });

const FloorSchema = new mongoose.Schema({
  floor: { type: Number, required: true },
  name: { type: String, required: true },
  image: { type: ImageSchema, required: true },
  scale: { type: ScaleSchema },
  transform: { type: TransformSchema },
  referencePoints: [ReferencePointSchema],
  nodes: [NodeSchema],
  paths: { type: [mongoose.Schema.Types.Mixed], default: [] }
}, { _id: false });

const BuildingSpecificationsSchema = new mongoose.Schema({
  gFloorArea: { type: String },
  typicalFloorArea: { type: String },
  labProvisions: { type: String }
}, { _id: false });

const BuildingSchema = new mongoose.Schema({
  name: { type: String, required: true },
  fullName: { type: String },
  address: { type: String },
  type: { type: String },
  specifications: { type: BuildingSpecificationsSchema }
}, { _id: false });

const InstructionsSchema = new mongoose.Schema({
  note: { type: String },
  supportedFormats: { type: [String] },
  recommendedSize: { type: String },
  coordinateSystem: { type: String },
  buildingInfo: { type: String },
  zoneLayout: { type: String }
}, { _id: false });

const FloorPlanSchema = new mongoose.Schema({
  description: { type: String },
  building: { type: BuildingSchema },
  floors: [FloorSchema],
  instructions: { type: InstructionsSchema }
}, {
  timestamps: true,
  collection: 'floor_plans'
});

// Get latest floor plan
FloorPlanSchema.statics.getLatest = async function() {
  return await this.findOne().sort({ updatedAt: -1 });
};

FloorPlanSchema.statics.updateLatest = async function(data) {
  const latest = await this.getLatest();
  if (latest) {
    Object.assign(latest, data);
    return await latest.save();
  } else {
    return await this.create(data);
  }
};

const FloorPlan = mongoose.model('FloorPlan', FloorPlanSchema);

module.exports = FloorPlan;

