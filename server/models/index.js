/**
 * Database Models Index
 * 
 * Central export for all Mongoose models
 */

const SpaceDefinition = require('./SpaceDefinition');
const FloorPlan = require('./FloorPlan');
const LocationGraph = require('./LocationGraph');
const RLPolicy = require('./RLPolicy');

module.exports = {
  SpaceDefinition,
  FloorPlan,
  LocationGraph,
  RLPolicy
};

