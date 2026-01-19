const express = require('express');
const router = express.Router();
const axios = require('axios');
require('dotenv').config();

// Azure Speech Service Configuration
const azureSpeechKey = process.env.AZURE_SPEECH_KEY;
const azureSpeechRegion = process.env.AZURE_SPEECH_REGION || 'eastus';

// Check for Azure Speech configuration
if (!azureSpeechKey) {
  console.warn('⚠️  WARNING: Azure Speech Service configuration not found!');
  console.warn('   Please ensure your .env file contains:');
  console.warn('   - AZURE_SPEECH_KEY=your_speech_key');
  console.warn('   - AZURE_SPEECH_REGION=your_region (optional, defaults to eastus)');
} else {
  const keyPreview = azureSpeechKey.substring(0, 8) + '...' + azureSpeechKey.substring(azureSpeechKey.length - 4);
  console.log(`✅ Azure Speech Service configured: ${keyPreview} | Region: ${azureSpeechRegion}`);
}

/**
 * GET /api/speech/token
 * Get an access token for Azure Speech Service
 * Tokens are valid for 10 minutes
 */
router.get('/token', async (req, res) => {
  try {
    if (!azureSpeechKey) {
      return res.status(500).json({ 
        error: 'Azure Speech Service not configured. Please set AZURE_SPEECH_KEY in .env file.' 
      });
    }

    const tokenEndpoint = `https://${azureSpeechRegion}.api.cognitive.microsoft.com/sts/v1.0/issueToken`;
    
    const response = await axios.post(tokenEndpoint, null, {
      headers: {
        'Ocp-Apim-Subscription-Key': azureSpeechKey,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': '0'
      }
    });

    const token = response.data;
    
    res.json({ 
      token: token,
      region: azureSpeechRegion,
      expiresIn: 600 // 10 minutes in seconds
    });
  } catch (error) {
    console.error('Error fetching Speech Service token:', error.response?.data || error.message);
    res.status(500).json({ 
      error: 'Failed to get Speech Service token',
      details: error.response?.data || error.message
    });
  }
});

/**
 * POST /api/speech/recognize
 * Speech-to-Text using Azure Speech Service REST API
 * This is an alternative to using the SDK on the frontend
 */
router.post('/recognize', async (req, res) => {
  try {
    if (!azureSpeechKey) {
      return res.status(500).json({ 
        error: 'Azure Speech Service not configured' 
      });
    }

    const { audioData, language } = req.body;

    if (!audioData) {
      return res.status(400).json({ error: 'Audio data is required' });
    }

    // Convert base64 audio data to buffer
    const audioBuffer = Buffer.from(audioData, 'base64');

    // Determine locale based on language setting
    const locale = language === 'zh-HK' ? 'zh-HK' : language === 'zh-CN' ? 'zh-CN' : 'en-US';

    // Use Azure Speech Service REST API for short audio
    const sttEndpoint = `https://${azureSpeechRegion}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=${locale}`;

    const response = await axios.post(sttEndpoint, audioBuffer, {
      headers: {
        'Ocp-Apim-Subscription-Key': azureSpeechKey,
        'Content-Type': 'audio/wav',
        'Accept': 'application/json'
      }
    });

    res.json({ 
      text: response.data.DisplayText || response.data.RecognitionStatus === 'Success' ? response.data.DisplayText : '',
      confidence: response.data.Confidence || 0
    });
  } catch (error) {
    console.error('Error in speech recognition:', error.response?.data || error.message);
    res.status(500).json({ 
      error: 'Speech recognition failed',
      details: error.response?.data || error.message
    });
  }
});

module.exports = router;

