# Docker Quick Start Guide

## 🚀 Quick Start (5 minutes)

### 1. Prerequisites
- Docker Desktop installed and running
- Your `.env` file configured (or environment variables)

### 2. Build and Run

```bash
# Build and start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Access application
# Open browser: http://localhost:5000
```

### 3. Migrate Data (First Time Only)

```bash
# Run migration from your HOST (recommended)
# PowerShell:
$env:MONGODB_URI="mongodb://localhost:27017/iss_ai_receptionist"
npm run migrate:mongodb
```

### 4. Stop Services

```bash
docker-compose down
```

## 📋 Common Commands

```bash
# Start services
docker-compose up -d

# Stop services
docker-compose down

# View logs
docker-compose logs -f app
docker-compose logs -f mongodb

# Restart services
docker-compose restart

# Rebuild after code changes
docker-compose up -d --build

# Execute commands in container
docker exec -it iss-ai-receptionist sh
docker exec -it iss-mongodb mongosh iss_ai_receptionist
```

## 🔧 Environment Setup

Create `.env` file in project root:

```env
AZURE_OPENAI_API_KEY=your_key
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
AZURE_OPENAI_DEPLOYMENT_NAME=gpt-4
AZURE_OPENAI_API_VERSION=2024-12-01-preview
AZURE_SPEECH_KEY=your_speech_key
AZURE_SPEECH_REGION=eastus
```

## ✅ Verification

After starting, verify everything works:

```bash
# Check health
curl http://localhost:5000/api/health

# Should return: {"status":"ok","message":"ISS AI Receptionist API is running"}
```

## 🐛 Troubleshooting

**Port already in use?**
- Change port in `docker-compose.yml`: `"5001:5000"`

**MongoDB connection failed?**
- Wait 10-15 seconds for MongoDB to fully start
- Check logs: `docker-compose logs mongodb`

**Build fails?**
- Clean build: `docker-compose build --no-cache`

## 📦 Production Build

```bash
# Build production image
docker build -t iss-ai-receptionist:latest .

# Run standalone
docker run -d \
  -p 5000:5000 \
  -e MONGODB_URI=mongodb://host.docker.internal:27017/iss_ai_receptionist \
  --env-file .env \
  iss-ai-receptionist:latest
```

