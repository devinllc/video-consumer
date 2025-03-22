# Understanding Your Frontends

## Which Frontend is Accessible on EC2?

Your EC2 instance is serving the `frontend-app` directory. This is configured in `src/index.js`:

```javascript
// Serve static files from frontend-app directory
app.use(express.static('frontend-app'));
```

### Frontend Directories in Your Project:

1. **`frontend-app/`** (Active on EC2)
   - Modern version with env.js for configuration
   - Uses API_BASE_URL from env.js 
   - Includes the config.html page for AWS configuration
   - This is what users see when accessing http://13.235.75.73:3001

2. **`frontend/`** (Not active)
   - Older version
   - Not currently being served

If you want to switch frontends, you would need to modify the express.static line in src/index.js.

---

# QUICK UPDATE GUIDE FOR EC2

If you're still having connection issues on your EC2 instance:

```bash
# 1. Connect to your EC2 instance
ssh -i your-key.pem ec2-user@13.235.75.73

# 2. Pull the latest changes (force overwrite package-lock.json)
cd ~/video-consumer
git checkout -- package-lock.json node_modules/.package-lock.json
git pull origin main

# 3. Rebuild and restart
npm run build
pm2 restart video-backend

# 4. Check status
pm2 status
pm2 logs video-backend
```

Then access: http://13.235.75.73:3001/config.html

---

# Video Transcoding Service

A complete solution for uploading, transcoding, and streaming videos using AWS services. This project provides a user-friendly web interface for video management and leverages AWS ECS for scalable video transcoding.

## Overview

This Video Transcoding Service allows users to:
- Upload videos through a web interface
- Transcode videos to multiple formats and resolutions using AWS ECS
- Monitor transcoding progress with real-time logs
- Stream transcoded videos using HLS
- Configure AWS resources and credentials
- Choose performance levels for transcoding tasks

## Deployment Options

### Option 1: Full-Stack on EC2 (Recommended for Simplicity)
* Deploy both frontend and backend on the same EC2 instance
* No CORS issues since both run on the same origin
* Simplest configuration, but no CDN benefits

### Option 2: Backend on EC2, Frontend on Vercel
* Deploy backend on EC2 for transcoding capabilities
* Host frontend on Vercel for CDN benefits
* Requires CORS and proper API configuration

### Option 3: Same as Option 2 with HTTPS
* Use HTTPS for secure communication
* Options include Nginx with Let's Encrypt or Ngrok for temporary solutions

## Quick Start Guide

These steps provide a fast way to get the service running:

```bash
# 1. Connect to your EC2 instance
ssh -i your-key.pem ec2-user@YOUR_EC2_IP

# 2. Install dependencies
sudo yum update -y
sudo yum install -y git nodejs npm

# 3. Clone repository
git clone https://github.com/devinllc/video-consumer.git
cd video-consumer

# 4. Install project dependencies
npm install
npm install -g pm2

# 5. Build and start the application
npm run build
pm2 start dist/index.js --name video-backend
```

Access your application at: `http://YOUR_EC2_IP:3001`

## Error Handling

### Common Issues and Solutions

#### 1. API Connection Errors

**Symptom**: Frontend cannot connect to backend API (Error: net::ERR_CONNECTION_REFUSED)
**Solutions**:
- Check if the EC2 instance is running: `pm2 status`
- Verify security group allows port 3001 traffic
- Make sure env.js has the correct API_BASE_URL: `http://13.235.75.73:3001`
- Test direct API access: `curl http://YOUR_EC2_IP:3001/health`

#### 2. Package Lock Conflicts

**Symptom**: Git pull fails due to package-lock.json conflicts
**Solutions**:
```bash
# Discard local changes to package-lock files
git checkout -- package-lock.json node_modules/.package-lock.json
git pull origin main
```

#### 3. Application Not Starting

**Symptom**: Service unavailable after restart
**Solutions**:
```bash
# Check PM2 status
pm2 status

# View application logs for errors
pm2 logs video-backend

# Restart the application
pm2 restart video-backend

# Make sure the build directory exists
npm run build
```

## Configuration

Once deployed, access the configuration page at: `http://YOUR_EC2_IP:3001/config.html`

### Required AWS Configuration:
1. **AWS Region**: The region where your AWS resources are located
2. **AWS Access Key ID**: Your AWS access key
3. **AWS Secret Access Key**: Your AWS secret key
4. **S3 Bucket Name**: The S3 bucket for storing videos
5. **ECS Cluster**: The ECS cluster for transcoding
6. **ECS Task Definition**: Task definition for transcoding
7. **ECS Subnets**: Comma-separated list of subnet IDs
8. **ECS Security Groups**: Comma-separated list of security group IDs

### Testing Configuration
After saving your configuration, use the "Test Connection" button to verify:
1. S3 connectivity
2. ECS permissions
3. EC2 subnet access
4. Security group configuration

## Cost Management

To minimize AWS costs:

1. **AWS Free Tier Usage**:
   - EC2: Use t2.micro or t3.micro instances (eligible for free tier)
   - S3: Monitor usage to stay within free tier limits
   - ECS: Choose FARGATE_SPOT for cost savings

2. **EC2 Instance Management**:
   - Stop EC2 instance when not in use:
     ```bash
     aws ec2 stop-instances --instance-ids YOUR_INSTANCE_ID
     ```
   - Start EC2 instance when needed:
     ```bash
     aws ec2 start-instances --instance-ids YOUR_INSTANCE_ID
     ``` 