# Docker Deployment Guide

This guide explains how to containerize and run the ISS AI Receptionist application using Docker.

## Prerequisites

- Docker Desktop installed (or Docker Engine + Docker Compose)
- Docker version 20.10 or higher
- At least 2GB free disk space

## Quick Start

### 1. Build and Run with Docker Compose

```bash
# Build and start all services (MongoDB + App)
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

### 2. Access the Application

- **Application**: http://localhost:5000
- **API Health Check**: http://localhost:5000/api/health
- **MongoDB**: localhost:27017

## Environment Variables

Create a `.env` file in the project root (or set in docker-compose.yml):

```env
# MongoDB (automatically configured in docker-compose)
MONGODB_URI=mongodb://mongodb:27017/iss_ai_receptionist

# Azure OpenAI
AZURE_OPENAI_API_KEY=your_key_here
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
AZURE_OPENAI_DEPLOYMENT_NAME=gpt-4
AZURE_OPENAI_API_VERSION=2024-12-01-preview

# Azure Speech (optional)
AZURE_SPEECH_KEY=your_speech_key
AZURE_SPEECH_REGION=your_region

# Application
NODE_ENV=production
PORT=5000
```

## Docker Commands

### Build Image

```bash
# Build production image
docker build -t iss-ai-receptionist .

# Build with specific tag
docker build -t iss-ai-receptionist:v1.0.0 .
```

### Run Container

```bash
# Run with docker-compose (recommended)
docker-compose up -d

# Run standalone container
docker run -d \
  --name iss-ai-receptionist \
  -p 5000:5000 \
  -e MONGODB_URI=mongodb://host.docker.internal:27017/iss_ai_receptionist \
  -e AZURE_OPENAI_API_KEY=your_key \
  iss-ai-receptionist
```

### Development Mode

```bash
# Run with hot reload
docker-compose -f docker-compose.dev.yml up

# This mounts your local code for live updates
```

## Data Migration

After starting the containers, migrate your data to MongoDB:

```bash
# Recommended: run migration on your HOST (so it can read `server/data/*.json`)
# and write into the MongoDB container via localhost:27017.
#
# PowerShell:
$env:MONGODB_URI="mongodb://localhost:27017/iss_ai_receptionist"
npm run migrate:mongodb
```

## Docker Compose Services

### MongoDB Service

- **Image**: mongo:latest
- **Port**: 27017
- **Volume**: `mongodb_data` (persistent storage)
- **Health Check**: Automatic

### Application Service

- **Image**: Built from Dockerfile
- **Port**: 5000
- **Depends on**: MongoDB
- **Health Check**: `/api/health` endpoint

## Useful Commands

```bash
# View running containers
docker ps

# View logs
docker-compose logs -f app
docker-compose logs -f mongodb

# Restart services
docker-compose restart

# Stop and remove containers
docker-compose down

# Stop and remove containers + volumes (⚠️ deletes data)
docker-compose down -v

# Rebuild after code changes
docker-compose up -d --build

# Execute commands in container
docker exec -it iss-ai-receptionist sh
docker exec -it iss-mongodb mongosh iss_ai_receptionist

# View container resource usage
docker stats
```

## Production Deployment

### Build for Production

```bash
# Build optimized image
docker build -t iss-ai-receptionist:prod .

# Tag for registry
docker tag iss-ai-receptionist:prod your-registry/iss-ai-receptionist:v1.0.0

# Push to registry
docker push your-registry/iss-ai-receptionist:v1.0.0
```

### Deploy to Azure Container Instances

```bash
# Create resource group
az group create --name iss-ai-rg --location eastus

# Create container instance
az container create \
  --resource-group iss-ai-rg \
  --name iss-ai-receptionist \
  --image iss-ai-receptionist:prod \
  --dns-name-label iss-ai-receptionist \
  --ports 5000 \
  --environment-variables \
    NODE_ENV=production \
    PORT=5000 \
    MONGODB_URI=your_mongodb_connection_string
```

## Troubleshooting

### Container won't start

```bash
# Check logs
docker-compose logs app

# Check MongoDB connection
docker exec -it iss-mongodb mongosh --eval "db.version()"
```

### Port already in use

```bash
# Change port in docker-compose.yml
ports:
  - "5001:5000"  # Use 5001 instead of 5000
```

### MongoDB connection issues

```bash
# Verify MongoDB is running
docker ps | grep mongodb

# Check MongoDB logs
docker-compose logs mongodb

# Test connection from app container
docker exec -it iss-ai-receptionist node -e "require('./server/lib/database').connectDB()"
```

### Build fails

```bash
# Clean build (no cache)
docker build --no-cache -t iss-ai-receptionist .

# Check disk space
docker system df
```

## Multi-Stage Build Benefits

The Dockerfile uses multi-stage builds to:
- ✅ Reduce final image size (~200MB vs ~1GB)
- ✅ Exclude dev dependencies
- ✅ Optimize build cache
- ✅ Separate build and runtime environments

## Security Best Practices

1. **Non-root user**: Container runs as `nodejs` user (UID 1001)
2. **Minimal base image**: Uses Alpine Linux
3. **Health checks**: Automatic container health monitoring
4. **Secrets**: Use environment variables or secrets management
5. **No secrets in image**: Never commit `.env` files

## Next Steps

1. ✅ Containerize application
2. ✅ Test locally with Docker
3. ✅ Deploy to Azure Container Instances or App Service
4. ✅ Set up CI/CD pipeline
5. ✅ Configure monitoring and logging

