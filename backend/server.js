// Local development server for EasyDrive
// Mounts the real Express app from src/api/index.js with static asset serving
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const { app } = require('./src/api/index.js');
const storage = require('./src/api/storage.js');

const PORT = process.env.PORT;

if (!PORT) {
  throw new Error('[EasyDrive Server Error] Missing required PORT environment variable in .env');
}

// Serve static assets from frontend/public (CSS, JS, Fonts, Images)
app.use(express.static(path.join(__dirname, '../frontend/public')));

// Mock download endpoint for local testing
app.get('/mock-download/:filename', (req, res) => {
  const storedPath = storage.findStoredFile(req.params.filename);
  if (storedPath) {
    return res.sendFile(storedPath);
  }
  res.send(`Mock Download Content for file: ${req.params.filename}`);
});

let serverInstance = null;

function startServer(port = PORT) {
  if (!serverInstance) {
    serverInstance = app.listen(port, () => {
      console.log(`=======================================================`);
      console.log(`🚀 EasyDrive Server running at http://localhost:${port}`);
      console.log(`📡 REST API Base URL:       http://localhost:${port}/api`);
      console.log(`📁 Static Assets Directory:  frontend/public`);
      console.log(`📄 EJS Views Directory:      backend/src/api/views`);
      console.log(`=======================================================`);
    });
  }
  return serverInstance;
}

if (!process.env.TEST_MODE) {
  startServer();
}

module.exports = { app, startServer };
