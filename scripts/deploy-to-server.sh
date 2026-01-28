#!/bin/bash
# Quick deployment script for Azure Ubuntu Server
# Run this on the server after cloning the repository

set -e  # Exit on error

echo "🚀 ISS AI Receptionist - Server Deployment Script"
echo "=================================================="
echo ""

# Check if running as root
if [ "$EUID" -eq 0 ]; then 
   echo "❌ Please do not run this script as root"
   exit 1
fi

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    echo "   See DEPLOYMENT_GUIDE.md Step 2"
    exit 1
fi

# Check if docker compose is available
if ! docker compose version &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

# Check if .env file exists
if [ ! -f .env ]; then
    echo "⚠️  .env file not found!"
    echo "   Please create .env file with your environment variables."
    echo "   See DEPLOYMENT_GUIDE.md Step 6"
    exit 1
fi

# Check if docker-compose.prod.yml exists
if [ ! -f docker-compose.prod.yml ]; then
    echo "⚠️  docker-compose.prod.yml not found!"
    echo "   Creating from template..."
    # This would need to be created manually or copied
    echo "   Please create docker-compose.prod.yml (see DEPLOYMENT_GUIDE.md Step 5)"
    exit 1
fi

echo "✅ Prerequisites check passed"
echo ""

# Build and start containers
echo "📦 Building and starting containers..."
docker compose -f docker-compose.prod.yml up -d --build

echo ""
echo "⏳ Waiting for containers to be healthy..."
sleep 10

# Check container status
echo ""
echo "📊 Container Status:"
docker compose -f docker-compose.prod.yml ps

echo ""
echo "✅ Deployment complete!"
echo ""
echo "🌐 Access your application at:"
echo "   http://$(hostname -I | awk '{print $1}')/"
echo "   or"
echo "   http://isshkaipu01.region.iss.biz/"
echo ""
echo "📝 Next steps:"
echo "   1. Run MongoDB migration: node scripts/migrateToMongoDB.js"
echo "   2. Check logs: docker logs -f iss-ai-receptionist"
echo "   3. Test API: curl http://localhost/api/health"
echo ""

