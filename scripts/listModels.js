// List available Google AI models
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const API_KEY = process.env.GOOGLE_API_KEY;

if (!API_KEY) {
  console.error('❌ GOOGLE_API_KEY not found in .env file');
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(API_KEY);

async function listModels() {
  try {
    console.log('🔍 Fetching available models...\n');
    
    // Try to list models using the API
    const response = await fetch('https://generativelanguage.googleapis.com/v1/models?key=' + API_KEY);
    const data = await response.json();
    
    if (data.models) {
      console.log('✅ Available models:\n');
      data.models.forEach(model => {
        if (model.supportedGenerationMethods && model.supportedGenerationMethods.includes('generateContent')) {
          console.log(`  📌 ${model.name}`);
          console.log(`     Display Name: ${model.displayName || 'N/A'}`);
          console.log(`     Description: ${model.description || 'N/A'}`);
          console.log('');
        }
      });
      
      // Find recommended model
      const recommended = data.models.find(m => 
        m.name.includes('gemini') && 
        m.supportedGenerationMethods?.includes('generateContent')
      );
      
      if (recommended) {
        console.log(`\n✅ Recommended model: ${recommended.name}`);
        console.log(`\nUpdate server/routes/chat.js to use:`);
        console.log(`model = genAI.getGenerativeModel({ model: '${recommended.name.replace('models/', '')}' });`);
      }
    } else {
      console.log('❌ Could not fetch models. Response:', data);
    }
  } catch (error) {
    console.error('❌ Error listing models:', error.message);
    console.log('\n💡 Possible issues:');
    console.log('   1. API key might not have Generative AI API enabled');
    console.log('   2. API key might be invalid');
    console.log('   3. Need to enable Generative AI API in Google Cloud Console');
    console.log('\n📝 Steps to fix:');
    console.log('   1. Go to: https://console.cloud.google.com/apis/library');
    console.log('   2. Search for "Generative Language API"');
    console.log('   3. Click "Enable"');
    console.log('   4. Wait a few minutes and try again');
  }
}

listModels();

