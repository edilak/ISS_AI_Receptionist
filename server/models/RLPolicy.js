/**
 * RL Policy Model
 * 
 * Stores reinforcement learning policies (Q-tables, checkpoints, models)
 */

const mongoose = require('mongoose');

const QTableEntrySchema = new mongoose.Schema({
  state: { type: String, required: true },
  action: { type: String, required: true },
  qValue: { type: Number, required: true }
}, { _id: false });

const ContextualQTableSchema = new mongoose.Schema({
  context: { type: mongoose.Schema.Types.Mixed, required: true },
  qTable: { type: Map, of: Number, default: {} }
}, { _id: false });

const RLPolicySchema = new mongoose.Schema({
  name: { type: String, default: 'default' },
  type: { 
    type: String, 
    enum: ['q_table', 'checkpoint', 'advanced_model'],
    default: 'q_table'
  },
  
  // For basic Q-table
  qTable: { type: Map, of: mongoose.Schema.Types.Mixed },
  
  // For advanced RL agent
  contextualQTables: [ContextualQTableSchema],
  rewardWeights: { type: mongoose.Schema.Types.Mixed },
  explorationRate: { type: Number },
  stats: { type: mongoose.Schema.Types.Mixed },
  
  // Metadata
  learningRate: { type: Number },
  discountFactor: { type: Number },
  explorationDecay: { type: Number },
  minExplorationRate: { type: Number },
  
  // Training info
  totalEpisodes: { type: Number, default: 0 },
  totalSteps: { type: Number, default: 0 },
  avgReward: { type: Number, default: 0 },
  avgPathLength: { type: Number, default: 0 },
  
  // Versioning
  version: { type: Number, default: 1 },
  isActive: { type: Boolean, default: true }
}, {
  timestamps: true,
  collection: 'rl_policies'
});

// Get active policy
RLPolicySchema.statics.getActive = async function(name = 'default') {
  return await this.findOne({ name, isActive: true }).sort({ updatedAt: -1 });
};

// Get latest policy
RLPolicySchema.statics.getLatest = async function(name = 'default') {
  return await this.findOne({ name }).sort({ updatedAt: -1 });
};

// Create or update policy
RLPolicySchema.statics.savePolicy = async function(name, data) {
  const existing = await this.getActive(name);
  
  if (existing) {
    // Deactivate old policy
    existing.isActive = false;
    await existing.save();
  }
  
  // Create new active policy
  const policy = new this({
    name,
    ...data,
    isActive: true,
    version: existing ? (existing.version || 1) + 1 : 1
  });
  
  return await policy.save();
};

const RLPolicy = mongoose.model('RLPolicy', RLPolicySchema);

module.exports = RLPolicy;

