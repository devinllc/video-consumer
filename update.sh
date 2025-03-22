#!/bin/bash
# Script to update and restart the video processing system

echo "Updating Video Processing System..."

# Pull latest changes
git pull

# Install dependencies
npm install

# Build the application
npm run build

# Restart using PM2
pm2 restart ecosystem.config.js || pm2 start ecosystem.config.js

echo "System updated and restarted successfully!"
echo "To check status: pm2 status"
echo "To view logs: pm2 logs video-backend" 