# .env File Template

Copy the content below into a new `.env` file in your project root.

```bash
# ISS AI Receptionist - Environment Variables
# Copy this content to .env file and fill in your actual values

# ============================================
# REQUIRED - Application Configuration
# ============================================

NODE_ENV=production
PORT=5000

# MongoDB Connection URI
# For local development with Docker Compose:
MONGODB_URI=mongodb://localhost:27017/iss_ai_receptionist
# For production with Docker Compose (use this):
# MONGODB_URI=mongodb://mongodb:27017/iss_ai_receptionist

# ============================================
# REQUIRED - Azure OpenAI Configuration
# ============================================

# Get these from: Azure Portal -> Your OpenAI Resource -> Keys and Endpoint
AZURE_OPENAI_API_KEY=your_azure_openai_api_key_here
AZURE_OPENAI_ENDPOINT=https://your-resource-name.openai.azure.com
AZURE_OPENAI_DEPLOYMENT_NAME=gpt-4
AZURE_OPENAI_API_VERSION=2024-12-01-preview

# ============================================
# OPTIONAL - Azure Speech Services
# ============================================

# Uncomment and fill if you're using Azure Speech Services
# AZURE_SPEECH_KEY=your_azure_speech_key_here
# AZURE_SPEECH_REGION=eastus

# ============================================
# OPTIONAL - Google Generative AI
# ============================================

# Uncomment if using Google instead of Azure OpenAI
# GOOGLE_API_KEY=your_google_api_key_here
```

