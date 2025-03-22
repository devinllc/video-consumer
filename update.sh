#!/bin/bash
# Script to update and restart the video processing system

echo "===== Video Processing System Update ====="

# Pull latest changes
echo "Pulling latest changes..."
git pull

# Install dependencies
echo "Installing dependencies..."
npm install
npm install cors @types/cors axios jsonwebtoken @types/jsonwebtoken --save

# Create necessary directories
echo "Setting up directories..."
mkdir -p uploads
chmod 755 uploads

# Build the application
echo "Building the application..."
npm run build

# Update Nginx configuration for better streaming
echo "Checking Nginx configuration..."
if command -v nginx &> /dev/null; then
    echo "Nginx found, ensuring proper configuration..."
    if [ -d "/etc/nginx/conf.d" ]; then
        # Check if our config exists
        if [ ! -f "/etc/nginx/conf.d/video-processing.conf" ]; then
            echo "Creating Nginx configuration file..."
            # Adjust the path to match your actual installation
            INSTALL_PATH=$(pwd)
            sudo tee /etc/nginx/conf.d/video-processing.conf > /dev/null << EOF
server {
    listen 80;
    server_name _;
    
    # Set maximum file upload size
    client_max_body_size 500M;
    
    # Main site
    root ${INSTALL_PATH}/frontend-app;
    
    # Serve static files from frontend-app
    location / {
        try_files \$uri \$uri/ /index.html;
    }
    
    # Proxy API requests to Node.js backend
    location /api/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_cache_bypass \$http_upgrade;
        
        # CORS headers
        add_header 'Access-Control-Allow-Origin' '*' always;
        add_header 'Access-Control-Allow-Methods' 'GET, POST, PUT, DELETE, OPTIONS' always;
        add_header 'Access-Control-Allow-Headers' 'Accept,Authorization,Cache-Control,Content-Type,DNT,If-Modified-Since,Keep-Alive,Origin,User-Agent,X-Requested-With,Range' always;
        add_header 'Access-Control-Expose-Headers' 'Content-Length,Content-Range,Content-Disposition,Accept-Ranges' always;
        
        # Handle preflight requests
        if (\$request_method = 'OPTIONS') {
            add_header 'Access-Control-Allow-Origin' '*';
            add_header 'Access-Control-Allow-Methods' 'GET, POST, PUT, DELETE, OPTIONS';
            add_header 'Access-Control-Allow-Headers' 'Accept,Authorization,Cache-Control,Content-Type,DNT,If-Modified-Since,Keep-Alive,Origin,User-Agent,X-Requested-With,Range';
            add_header 'Access-Control-Max-Age' 86400;
            add_header 'Content-Type' 'text/plain charset=UTF-8';
            add_header 'Content-Length' 0;
            return 204;
        }
    }
    
    # Proxy health check endpoint
    location /health {
        proxy_pass http://localhost:3001/health;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }
    
    # Special configuration for HLS streaming files
    location ~ \\.(m3u8|ts)\$ {
        root ${INSTALL_PATH}/uploads;
        
        # Essential CORS headers for streaming
        add_header 'Access-Control-Allow-Origin' '*' always;
        add_header 'Access-Control-Allow-Methods' 'GET, OPTIONS' always;
        add_header 'Access-Control-Allow-Headers' 'Accept,Authorization,Cache-Control,Content-Type,DNT,If-Modified-Since,Keep-Alive,Origin,User-Agent,X-Requested-With,Range' always;
        add_header 'Access-Control-Expose-Headers' 'Content-Length,Content-Range,Content-Disposition,Accept-Ranges' always;
        
        # HLS specific headers
        add_header 'Cache-Control' 'no-cache' always;
        
        # Disable caching for m3u8 files (manifest files)
        if (\$request_uri ~* \\.m3u8\$) {
            expires -1;
            add_header 'Content-Type' 'application/vnd.apple.mpegurl' always;
        }
        
        # Enable caching for TS segments to improve playback performance
        if (\$request_uri ~* \\.ts\$) {
            expires 1d;
        }
    }
}
EOF
            # Restart Nginx
            sudo systemctl restart nginx
        else
            echo "Nginx configuration already exists"
        fi
    else
        echo "Warning: Nginx configuration directory not found"
    fi
else
    echo "Warning: Nginx not found, skipping configuration"
fi

# Check for Docker
echo "Checking Docker installation (required for transcoding)..."
if ! command -v docker &> /dev/null; then
    echo "Warning: Docker not found, which is needed for transcoding."
    echo "You may want to install Docker with:"
    echo "  sudo yum install docker -y        # For CentOS/RHEL/Amazon Linux"
    echo "  sudo apt install docker.io -y     # For Ubuntu/Debian"
    echo "  sudo systemctl start docker"
    echo "  sudo systemctl enable docker"
fi

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
    echo "Installing PM2 globally..."
    npm install -g pm2
fi

# Restart using PM2
echo "Restarting the application..."
pm2 restart ecosystem.config.js || pm2 start ecosystem.config.js

# Print system information
echo -e "\n===== System Information ====="
echo "Backend Status:"
pm2 status video-backend

# Get the public IP
PUBLIC_IP=$(curl -s ifconfig.me 2>/dev/null || echo "unknown")
echo -e "\nSystem is accessible at: http://$PUBLIC_IP"

echo -e "\n===== Update Complete ====="
echo "To check status: pm2 status"
echo "To view logs: pm2 logs video-backend"
echo "To check for issues: pm2 logs video-backend --lines 100" 