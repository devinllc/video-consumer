#!/bin/bash
# Video Processing System Setup Script
# This script installs and configures everything needed to run the video processing system

echo "========== Video Processing System Setup =========="
echo "Setting up environment and dependencies..."

# Update system
sudo yum update -y

# Install Node.js if not present
if ! command -v node &> /dev/null; then
    echo "Installing Node.js..."
    curl -sL https://rpm.nodesource.com/setup_16.x | sudo bash -
    sudo yum install -y nodejs
fi

# Install Git if not present
if ! command -v git &> /dev/null; then
    echo "Installing Git..."
    sudo yum install -y git
fi

# Install Nginx for serving the frontend
if ! command -v nginx &> /dev/null; then
    echo "Installing Nginx..."
    sudo amazon-linux-extras install nginx1 -y
fi

# Clone or update the repository
if [ -d "video-consumer" ]; then
    echo "Updating existing repository..."
    cd video-consumer
    git pull
else
    echo "Cloning repository..."
    git clone https://github.com/devinllc/video-consumer.git
    cd video-consumer
fi

# Install dependencies
echo "Installing dependencies..."
npm install

# Build the application
echo "Building the application..."
npm run build

# Configure Nginx to serve the frontend and proxy API requests
echo "Configuring Nginx..."
sudo tee /etc/nginx/conf.d/video-processing.conf > /dev/null << EOF
server {
    listen 80;
    server_name _;
    root /home/ec2-user/video-consumer/frontend-app;
    
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
        proxy_cache_bypass \$http_upgrade;
    }
    
    # Proxy health check endpoint
    location /health {
        proxy_pass http://localhost:3001/health;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF

# Get the public IP of the instance
PUBLIC_IP=$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4)
echo "Public IP: $PUBLIC_IP"

# Configure the backend to listen on all interfaces
echo "Configuring backend server..."

# Start or restart Nginx
echo "Starting Nginx..."
sudo systemctl restart nginx
sudo systemctl enable nginx

# Create a startup service for the Node.js application
echo "Creating systemd service for the backend..."
sudo tee /etc/systemd/system/video-processor.service > /dev/null << EOF
[Unit]
Description=Video Processing System Backend
After=network.target

[Service]
Type=simple
User=ec2-user
WorkingDirectory=/home/ec2-user/video-consumer
ExecStart=/usr/bin/npm run dev
Restart=on-failure
Environment=PORT=3001
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

# Reload systemd configuration
sudo systemctl daemon-reload

# Start and enable the service
sudo systemctl start video-processor
sudo systemctl enable video-processor

echo "========== Setup Complete =========="
echo "Your video processing system is now running at: http://$PUBLIC_IP"
echo "You can access the system directly using this URL from any browser."
echo "This setup will automatically adapt to IP changes when your EC2 instance restarts."
echo ""
echo "To check the status of the backend service, run: sudo systemctl status video-processor"
echo "To view the logs, run: sudo journalctl -u video-processor -f" 