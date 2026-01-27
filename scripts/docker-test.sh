#!/bin/bash
# Quick test script for Docker containerization

echo "🐳 Testing Docker containerization..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker Desktop."
    exit 1
fi

echo "✅ Docker is running"

# Build the image
echo "📦 Building Docker image..."
docker build -t iss-ai-receptionist:test .

if [ $? -eq 0 ]; then
    echo "✅ Image built successfully"
else
    echo "❌ Image build failed"
    exit 1
fi

# Test the image
echo "🧪 Testing image..."
docker run --rm -d --name iss-test \
    -p 5001:5000 \
    -e NODE_ENV=production \
    -e PORT=5000 \
    -e MONGODB_URI=mongodb://host.docker.internal:27017/iss_ai_receptionist \
    iss-ai-receptionist:test

# Wait for container to start
sleep 5

# Test health endpoint
echo "🏥 Testing health endpoint..."
response=$(curl -s http://localhost:5001/api/health)

if echo "$response" | grep -q "ok"; then
    echo "✅ Health check passed"
else
    echo "❌ Health check failed"
    echo "Response: $response"
fi

# Cleanup
echo "🧹 Cleaning up..."
docker stop iss-test > /dev/null 2>&1

echo "✅ Docker test completed!"

