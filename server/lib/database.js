/**
 * MongoDB Database Connection
 * 
 * Handles connection to MongoDB and provides database utilities
 */

const mongoose = require('mongoose');

let isConnected = false;

/**
 * Connect to MongoDB
 */
async function connectDB() {
  if (isConnected) {
    console.log('✅ MongoDB already connected');
    return;
  }

  try {
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/iss_ai_receptionist';
    
    await mongoose.connect(mongoURI);

    isConnected = true;
    console.log('✅ MongoDB connected successfully');
    console.log(`   Database: ${mongoose.connection.name}`);
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    throw error;
  }
}

/**
 * Disconnect from MongoDB
 */
async function disconnectDB() {
  if (!isConnected) {
    return;
  }

  try {
    await mongoose.disconnect();
    isConnected = false;
    console.log('✅ MongoDB disconnected');
  } catch (error) {
    console.error('❌ MongoDB disconnection error:', error.message);
    throw error;
  }
}

/**
 * Check if MongoDB is connected
 */
function isDBConnected() {
  return isConnected && mongoose.connection.readyState === 1;
}

/**
 * Get MongoDB connection status
 */
function getConnectionStatus() {
  return {
    connected: isDBConnected(),
    readyState: mongoose.connection.readyState,
    host: mongoose.connection.host,
    name: mongoose.connection.name
  };
}

// Handle connection events
mongoose.connection.on('error', (err) => {
  console.error('❌ MongoDB connection error:', err);
  isConnected = false;
});

mongoose.connection.on('disconnected', () => {
  console.log('⚠️ MongoDB disconnected');
  isConnected = false;
});

mongoose.connection.on('reconnected', () => {
  console.log('✅ MongoDB reconnected');
  isConnected = true;
});

// Graceful shutdown
process.on('SIGINT', async () => {
  await disconnectDB();
  process.exit(0);
});

module.exports = {
  connectDB,
  disconnectDB,
  isDBConnected,
  getConnectionStatus
};

