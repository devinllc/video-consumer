# CRITICAL FIX FOR FILE UPLOADING ISSUE

If you're getting the error:
```
GET http://13.235.75.73:3001/api/check-upload-ready 404 (Not Found)
Upload readiness check failed: 404
```

We've added the missing endpoint to the backend. To apply this fix:

```bash
# 1. Connect to your EC2 instance
ssh -i your-key.pem ec2-user@13.235.75.73

# 2. Pull the latest changes
cd ~/video-consumer
git pull origin main

# 3. Rebuild and restart
npm run build
pm2 restart video-backend
```

After restarting, refresh the browser and you should be able to upload files.

# NEW FILE UPLOAD ENDPOINT ADDED

We've added the `/api/upload` endpoint for handling file uploads and `/api/start-transcode` for processing videos. To apply these updates:

```bash
# 1. Connect to your EC2 instance
ssh -i your-key.pem ec2-user@13.235.75.73

# 2. Pull the latest changes
cd ~/video-consumer
git pull origin main

# 3. Create the uploads directory if it doesn't exist
mkdir -p uploads

# 4. Rebuild and restart
npm run build
pm2 restart video-backend
```

After restarting, you should be able to:
1. Upload video files from the main page
2. See the upload progress
3. Start transcoding jobs
4. Track job progress in real-time

# CRITICAL FIX FOR CONFIG.HTML LOCALHOST ERROR

If you're still getting the `net::ERR_CONNECTION_REFUSED` error when trying to test/save configuration:

```bash
# 1. Connect to your EC2 instance
ssh -i your-key.pem ec2-user@13.235.75.73

# 2. Pull the latest changes (force overwrite any local changes)
cd ~/video-consumer
git fetch origin
git reset --hard origin/main

# 3. Rebuild and restart
npm run build
pm2 restart video-backend

# 4. Clear your browser cache completely
# In Chrome: Ctrl+Shift+Del → Select "Cached images and files" → Clear data

# 5. Access the configuration page with a forced refresh
# Press Ctrl+F5 when visiting: http://13.235.75.73:3001/config.html
```

This fix addresses a hardcoded API URL in the config.html page that was incorrectly using localhost:3001 instead of the proper API_BASE_URL from env.js.

---

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

## Troubleshooting

### API Connection Issues

If you experience connection errors like `net::ERR_CONNECTION_REFUSED` or undefined API errors:

1. Check that the API server is running with `pm2 status`
2. Verify that `frontend-app/env.js` has the correct API URL:
   ```js
   window.API_BASE_URL = 'http://YOUR_EC2_IP:3001';
   ```
3. Make sure `frontend-app/config.js` is using the window object for API_BASE_URL:
   ```js
   BASE_URL: (typeof window.API_BASE_URL !== 'undefined' && window.API_BASE_URL !== '') ? window.API_BASE_URL : '',
   ```
4. Clear your browser cache or try in incognito mode
5. Check browser console for specific error messages
6. Verify that port 3001 is open in your EC2 security group

### SSL Errors

If you see SSL-related errors:
1. Ensure you're using `http://` and not `https://` in your API_BASE_URL (unless you've configured SSL)
2. Check for any Content-Security-Policy headers that might be blocking mixed content

### Testing the API Connection

Use curl to test API endpoints directly:
```
curl http://YOUR_EC2_IP:3001/health
curl http://YOUR_EC2_IP:3001/api/config
```

If these commands return responses but your frontend can't connect, it may be a CORS or configuration issue. 

## S3 Bucket Setup

If you see "Bucket was not found" when testing your connection:

1. **Create the S3 bucket** using AWS CLI:
   ```bash
   aws s3 mb s3://YOUR-BUCKET-NAME --region YOUR-REGION
   ```
   Example: `aws s3 mb s3://trisha.vid.ip --region ap-south-1`

2. **Set bucket policy** for public read access (if needed for streaming videos):
   ```bash
   aws s3api put-bucket-policy --bucket YOUR-BUCKET-NAME --policy '{
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Principal": "*",
         "Action": "s3:GetObject",
         "Resource": "arn:aws:s3:::YOUR-BUCKET-NAME/*"
       }
     ]
   }'
   ```

3. **Enable CORS** for browser access:
   ```bash
   aws s3api put-bucket-cors --bucket YOUR-BUCKET-NAME --cors-configuration '{
     "CORSRules": [
       {
         "AllowedHeaders": ["*"],
         "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
         "AllowedOrigins": ["*"],
         "ExposeHeaders": []
       }
     ]
   }'
   ```

4. **Test bucket permissions** with a small file:
   ```bash
   echo "Test file" > test.txt
   aws s3 cp test.txt s3://YOUR-BUCKET-NAME/
   aws s3 ls s3://YOUR-BUCKET-NAME/
   ```

After creating and configuring your bucket, return to the application configuration page and test the connection again.

## UPDATING THE AWS CONFIGURATION

If you're having trouble saving your AWS configuration through the web interface (`http://13.235.75.73:3001/config.html`), follow these steps:

1. Make sure you have all the required fields filled in:
   - AWS Region (e.g., `ap-south-1`)
   - AWS Access Key ID
   - AWS Secret Access Key
   - S3 Bucket Name
   - ECS Cluster ARN
   - ECS Task Definition
   - ECS Subnet IDs (comma-separated)
   - ECS Security Group IDs (comma-separated)

2. If you see an error about "Missing required configuration fields", ensure that:
   - All fields in both AWS and ECS tabs are completed (click on the "ECS Configuration" tab)
   - There are no extra spaces at the beginning or end of your entries
   - The format matches the examples shown under each field

3. Pull the latest code fixes to your EC2 instance:
   ```bash
   ssh -i your-key.pem ec2-user@13.235.75.73
   cd ~/video-consumer
   git fetch origin
   git reset --hard origin/main
   npm run build
   pm2 restart video-backend
   ```

4. After restarting, clear your browser cache (Ctrl+F5) and try again 