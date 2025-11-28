// Test script to check Google AI API and list available models
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const API_KEY = process.env.GOOGLE_API_KEY;

if (!API_KEY) {
  console.error('❌ GOOGLE_API_KEY not found in .env file');
  process.exit(1);
}

console.log('Testing Google AI API...\n');
console.log('API Key:', API_KEY.substring(0, 10) + '...' + API_KEY.substring(API_KEY.length - 4));

const genAI = new GoogleGenerativeAI(API_KEY);

// Test different model names
const modelNames = [
  'gemini-1.5-flash-latest',
  'gemini-1.5-pro-latest',
  'gemini-1.5-flash',
  'gemini-1.5-pro',
  'gemini-pro',
  'models/gemini-1.5-flash',
  'models/gemini-pro'
];

async function testModels() {
  console.log('\n🔍 Testing available models...\n');
  
  for (const modelName of modelNames) {
    try {
      console.log(`Testing: ${modelName}...`);
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent('Say "Hello"');
      const response = await result.response;
      const text = response.text();
      
      console.log(`✅ ${modelName} - WORKING!`);
      console.log(`   Response: ${text.substring(0, 50)}...\n`);
      return modelName; // Return first working model
    } catch (error) {
      console.log(`❌ ${modelName} - ${error.message}\n`);
    }
  }
  
  console.log('\n❌ No working models found. Please check:');
  console.log('   1. Your API key is correct');
  console.log('   2. Your API key has access to Gemini models');
  console.log('   3. You have enabled the Generative AI API in Google Cloud Console');
  return null;
}

testModels()
  .then(workingModel => {
    if (workingModel) {
      console.log(`\n✅ Recommended model to use: ${workingModel}`);
      console.log(`\nUpdate server/routes/chat.js to use: model = genAI.getGenerativeModel({ model: '${workingModel}' });`);
    }
  })
  .catch(error => {
    console.error('Error:', error);
  });

