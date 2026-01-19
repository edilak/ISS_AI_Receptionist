const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
require('dotenv').config();

// Connect to MongoDB
const { connectDB } = require('./lib/database');

const chatRoutes = require('./routes/chat');
const pathFinderRoutes = require('./routes/pathFinder');
const analyticsRoutes = require('./routes/analytics');
const spaceNavRoutes = require('./routes/spaceNav');
const speechRoutes = require('./routes/speech');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Routes
app.use('/api/chat', chatRoutes);
app.use('/api/pathfinder', pathFinderRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/space-nav', spaceNavRoutes);
app.use('/api/speech', speechRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'ISS AI Receptionist API is running' });
});

// Serve static files from React app in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/build')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/build/index.html'));
  });
}

// Initialize server
async function startServer() {
  try {
    // Connect to MongoDB
    await connectDB();
    
    // Start server
    app.listen(PORT, () => {
      console.log(`🚀 ISS AI Receptionist server running on port ${PORT}`);
      console.log(`📍 API endpoints available at http://localhost:${PORT}/api`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
  }
}

startServer();

