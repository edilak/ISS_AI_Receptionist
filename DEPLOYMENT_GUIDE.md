# Complete Deployment Guide: GitHub to Azure Ubuntu Server

This guide walks you through deploying the ISS AI Receptionist application from GitHub to your Azure Ubuntu server.

## Prerequisites

- ✅ Azure Ubuntu server: `isshkaipu01.region.iss.biz`
- ✅ SSH access with username: `edil.akynbekov`
- ✅ GitHub repository: `https://github.com/edilak/ISS_AI_Receptionist.git`
- ✅ Your `.env` file with API keys (keep this secure, don't commit to GitHub)

---

## Step 1: SSH into the Azure Ubuntu Server

From your local PC (PowerShell or Command Prompt):

```powershell
ssh edil.akynbekov@isshkaipu01.region.iss.biz
```

Enter your password when prompted.

---

## Step 2: Install Docker and Docker Compose

Once logged into the server, run these commands:

```bash
# Update system packages
sudo apt-get update -y
sudo apt-get upgrade -y

# Install prerequisites
sudo apt-get install -y ca-certificates curl gnupg lsb-release

# Add Docker's official GPG key
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

# Add Docker repository
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker Engine
sudo apt-get update -y
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Add your user to docker group (to run docker without sudo)
sudo usermod -aG docker $USER

# Log out and back in for group changes to take effect
exit
```

**SSH back into the server:**

```powershell
ssh edil.akynbekov@isshkaipu01.region.iss.biz
```

**Verify Docker installation:**

```bash
docker --version
docker compose version
docker ps  # Should work without sudo
```

---

## Step 3: Install Git (if not already installed)

```bash
sudo apt-get install -y git
```

---

## Step 4: Clone the GitHub Repository

```bash
# Navigate to home directory
cd ~

# Clone the repository
git clone https://github.com/edilak/ISS_AI_Receptionist.git

# Navigate into the project
cd ISS_AI_Receptionist
```

---

## Step 5: Create Production docker-compose.yml

The repository's `docker-compose.yml` uses port 5000. For production, we'll create a production version that uses port 80:

```bash
nano docker-compose.prod.yml
```

> [!IMPORTANT]
> When pasting the configuration below, **DO NOT** include the triple backticks (```yaml or ```) at the beginning or end.

Paste this configuration:

```yaml
version: '3.8'

services:
  mongodb:
    image: mongo:latest
    container_name: iss-mongodb
    restart: unless-stopped
    ports:
      - "27017:27017" # Required for host-side migration
    volumes:
      - mongodb_data:/data/db
    networks:
      - iss-network
    healthcheck:
      test: ["CMD", "mongosh", "--eval", "db.adminCommand('ping')"]
      interval: 10s
      timeout: 5s
      retries: 5

  app:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: iss-ai-receptionist
    restart: unless-stopped
    ports:
      - "80:5000"  # Map port 80 (HTTP) to container port 5000
    env_file:
      - .env
    environment:
      NODE_ENV: production
      PORT: 5000
      MONGODB_URI: mongodb://mongodb:27017/iss_ai_receptionist
    depends_on:
      mongodb:
        condition: service_healthy
    networks:
      - iss-network
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:5000/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

volumes:
  mongodb_data:
    driver: local

networks:
  iss-network:
    driver: bridge
```

Save and exit (Ctrl+X, then Y, then Enter).

---

## Step 6: Create .env File on Server

**Important:** The `.env` file is NOT in the repository (it's in `.gitignore`). You need to create it manually on the server.

```bash
nano .env
```

Paste your environment variables (copy from your local `.env` file):

```bash
NODE_ENV=production
PORT=5000
MONGODB_URI=mongodb://mongodb:27017/iss_ai_receptionist
AZURE_OPENAI_API_KEY=your_azure_openai_api_key_here
AZURE_OPENAI_ENDPOINT=your_azure_openai_endpoint_here
AZURE_OPENAI_DEPLOYMENT_NAME=gpt-4
AZURE_OPENAI_API_VERSION=2024-12-01-preview
# Optional:
# AZURE_SPEECH_KEY=your_speech_key_here
# AZURE_SPEECH_REGION=eastus
```

**Replace all `your_*_here` values with your actual credentials.**

Save and exit (Ctrl+X, then Y, then Enter).

**Secure the .env file:**

```bash
chmod 600 .env  # Only owner can read/write
```

---

## Step 7: Build and Start Containers

```bash
# Build and start containers using the production compose file
docker compose -f docker-compose.prod.yml up -d --build

# Check status
docker compose -f docker-compose.prod.yml ps

# View logs
docker logs -f iss-ai-receptionist
```

Wait for both containers to show "healthy" status. Press `Ctrl+C` to exit the logs view.

---

## Step 8: Run MongoDB Migration

You need to import your initial data from the JSON files into MongoDB.

### Option A: Run Migration from Server (Recommended)

```bash
# Install Node.js for migration script
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install project dependencies
npm install

# Run migration (connect to MongoDB container)
export MONGODB_URI="mongodb://localhost:27017/iss_ai_receptionist"
node scripts/migrateToMongoDB.js
```

You should see:
```
✅ space_definitions upserted: ...
✅ floor_plans upserted: ...
✅ location_graph upserted: ...
✅ rl_policy upserted: ...
```

### Option B: Run Migration Inside App Container

```bash
# Execute migration script inside the app container
docker exec -it iss-ai-receptionist sh -c "cd /app && node scripts/migrateToMongoDB.js"
```

**Note:** This requires the JSON files to be in the container. If they're not, use Option A.

---

## Step 9: Verify Deployment

1. **Check containers are running:**
   ```bash
   docker compose -f docker-compose.prod.yml ps
   ```
   Both should show "Up (healthy)".

2. **Test API endpoint:**
   ```bash
   curl http://localhost/api/health
   ```
   Should return: `{"status":"ok","mongodb":{...}}`

3. **Access from browser:**
   ```
   http://isshkaipu01.region.iss.biz/
   ```
   Or use the server's IP address if DNS isn't configured.

---

## Step 10: Set Up Automatic Startup (Systemd Service)

Create a systemd service to automatically start Docker Compose on server boot:

```bash
sudo nano /etc/systemd/system/iss-ai.service
```

Paste this configuration:

```ini
[Unit]
Description=ISS AI Receptionist
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/home/edil.akynbekov/ISS_AI_Receptionist
ExecStart=/usr/bin/docker compose -f docker-compose.prod.yml up -d
ExecStop=/usr/bin/docker compose -f docker-compose.prod.yml down
User=edil.akynbekov
Group=docker

[Install]
WantedBy=multi-user.target
```

Save and exit, then enable the service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable iss-ai.service
sudo systemctl start iss-ai.service

# Check status
sudo systemctl status iss-ai.service
```

---

## Step 11: Set Up MongoDB Backups

Create a backup script:

```bash
mkdir -p ~/backups
nano ~/backups/backup-mongodb.sh
```

Paste this script:

```bash
#!/bin/bash
BACKUP_DIR="$HOME/backups/mongodb"
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR

# Create backup inside MongoDB container
docker exec iss-mongodb mongodump --out /tmp/backup_$DATE

# Copy backup from container to host
docker cp iss-mongodb:/tmp/backup_$DATE $BACKUP_DIR/

# Cleanup inside container
docker exec iss-mongodb rm -rf /tmp/backup_$DATE

# Keep only last 7 days of backups
find $BACKUP_DIR -type d -mtime +7 -exec rm -rf {} +

echo "Backup completed: $BACKUP_DIR/backup_$DATE"
```

Make it executable:

```bash
chmod +x ~/backups/backup-mongodb.sh
```

### Schedule Daily Backups

```bash
crontab -e
```

Add this line (runs daily at 2 AM):

```
0 2 * * * /home/edil.akynbekov/backups/backup-mongodb.sh >> /home/edil.akynbekov/backups/backup.log 2>&1
```

Save and exit.

---

## Step 12: Configure Firewall (if needed)

If the server has a firewall, ensure ports are open:

```bash
# Check if UFW is active
sudo ufw status

# If active, allow HTTP and SSH
sudo ufw allow 22/tcp   # SSH
sudo ufw allow 80/tcp   # HTTP
sudo ufw reload
```

---

## Common Operations

### View Logs

```bash
# Application logs
docker logs -f iss-ai-receptionist

# MongoDB logs
docker logs -f iss-mongodb

# All services
docker compose -f docker-compose.prod.yml logs -f
```

### Restart Services

```bash
cd ~/ISS_AI_Receptionist
docker compose -f docker-compose.prod.yml restart
```

### Stop Services

```bash
cd ~/ISS_AI_Receptionist
docker compose -f docker-compose.prod.yml down
```

### Update Application (after code changes on GitHub)

```bash
cd ~/ISS_AI_Receptionist

# Pull latest code
git pull origin main

# Rebuild and restart
docker compose -f docker-compose.prod.yml up -d --build
```

### Check Disk Space

```bash
df -h
docker system df
```

### Clean Up Unused Docker Resources

```bash
docker system prune -a  # Remove unused images, containers, networks
```

---

## Troubleshooting

### Containers Won't Start

```bash
# Check logs
docker compose -f docker-compose.prod.yml logs

# Check container status
docker compose -f docker-compose.prod.yml ps

# Check Docker daemon
sudo systemctl status docker
```

### MongoDB Connection Errors

- Verify `MONGODB_URI` in `.env` is `mongodb://mongodb:27017/iss_ai_receptionist`
- Check MongoDB container: `docker logs iss-mongodb`
- Test connection: `docker exec -it iss-mongodb mongosh iss_ai_receptionist`

### Port 80 Already in Use

```bash
# Check what's using port 80
sudo lsof -i :80
# Or
sudo netstat -tulpn | grep :80

# Kill the process or change port mapping in docker-compose.prod.yml
```

### Application Not Accessible

- Check if containers are running: `docker ps`
- Check firewall rules: `sudo ufw status`
- Verify port mapping: `docker port iss-ai-receptionist`
- Test locally: `curl http://localhost/api/health`

### Out of Disk Space

```bash
# Clean Docker
docker system prune -a

# Remove old backups
find ~/backups/mongodb -type d -mtime +7 -exec rm -rf {} +
```

---

## Security Recommendations

1. ✅ **Never commit `.env` to GitHub** - It's already in `.gitignore`
2. ✅ **Use strong passwords** for server access
3. ✅ **Keep system updated:**
   ```bash
   sudo apt-get update && sudo apt-get upgrade -y
   ```
4. ✅ **Restrict SSH access** (if possible, use key-based authentication)
5. ✅ **Regular backups** - Already configured in Step 11
6. ✅ **Monitor logs** regularly for suspicious activity
7. ⚠️ **Consider HTTPS** - Set up Nginx reverse proxy with Let's Encrypt for production

---

## Next Steps (Optional)

### Set Up HTTPS with Nginx and Let's Encrypt

If you have a domain name pointing to your server:

```bash
# Install Nginx
sudo apt-get install -y nginx certbot python3-certbot-nginx

# Configure Nginx as reverse proxy
sudo nano /etc/nginx/sites-available/iss-ai
```

Add:

```nginx
server {
    listen 80;
    server_name isshkaipu01.region.iss.biz;  # Your domain

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Then:

```bash
sudo ln -s /etc/nginx/sites-available/iss-ai /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# Get SSL certificate
sudo certbot --nginx -d isshkaipu01.region.iss.biz
```

---

## Summary

Your application should now be:
- ✅ Running on `http://isshkaipu01.region.iss.biz/`
- ✅ MongoDB data stored locally on the server
- ✅ Automatically starting on server reboot
- ✅ Backing up daily at 2 AM
- ✅ Accessible via HTTP on port 80

For updates, simply run:
```bash
cd ~/ISS_AI_Receptionist
git pull origin main
docker compose -f docker-compose.prod.yml up -d --build
```

---

## Quick Reference Commands

```bash
# Start services
cd ~/ISS_AI_Receptionist && docker compose -f docker-compose.prod.yml up -d

# Stop services
cd ~/ISS_AI_Receptionist && docker compose -f docker-compose.prod.yml down

# View logs
docker logs -f iss-ai-receptionist

# Update application
cd ~/ISS_AI_Receptionist && git pull && docker compose -f docker-compose.prod.yml up -d --build

# Manual backup
~/backups/backup-mongodb.sh
```

---

**Need help?** Check the logs first: `docker logs iss-ai-receptionist`

