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

## Architecture

The system consists of two main components:

### 1. Frontend
- Web interface built with HTML, CSS, and JavaScript
- Provides upload form, configuration page, and video player
- Communicates with the backend API
- Can be deployed independently as a static website

### 2. Backend
- Node.js/Express API server
- Handles file uploads and S3 storage
- Manages ECS task execution for video transcoding
- Provides job status monitoring and logs
- Exposes RESTful API endpoints

### AWS Services Used
- **S3**: Stores uploaded videos and transcoded outputs
- **ECR**: Hosts Docker images for frontend and backend
- **ECS/Fargate**: Runs transcoding tasks with scalable resources
- **IAM**: Manages permissions and access control
- **CloudWatch**: Logs and monitoring

## Features

### Video Upload and Processing
- Drag-and-drop file upload
- Progress tracking for uploads
- Automatic S3 storage of raw videos
- Configurable transcoding profiles

### Transcoding Options
- Multiple resolution outputs (720p, 480p, 360p)
- HLS format for adaptive streaming
- Performance level selection:
  - Economy: Lower cost, slower processing
  - Standard: Balanced performance and cost
  - Premium: Fastest processing, higher cost

### Real-time Monitoring
- Job status tracking
- Live transcoding logs
- Error reporting and troubleshooting

### Configuration Management
- AWS credentials setup
- S3 bucket configuration
- ECS cluster and task definition management
- Network and security settings

## Deployment Options

The project supports multiple deployment strategies:

### 1. Combined Deployment
- Single Docker Compose setup for both frontend and backend
- Simplest option for development and testing

### 2. Separated Frontend/Backend
- Independent deployment of frontend and backend
- Allows for different scaling strategies
- Better for production environments

### 3. Cost-Effective Student Deployment
- Uses AWS Free Tier resources
- Fargate Spot instances for lower costs
- Automatic shutdown options to minimize expenses

## Complete Deployment Guides

### Option 1: Same-Server Deployment (Frontend and Backend on Same EC2)

This is the simplest deployment option, with both frontend and backend running on the same EC2 instance.

#### Prerequisites
- AWS Account (Free Tier eligible)
- Domain name (optional)

#### Step 1: Launch an EC2 Instance
1. Login to AWS Console and navigate to EC2
2. Click "Launch Instance"
3. Choose "Amazon Linux 2023" AMI
4. Select t2.micro instance type (Free Tier eligible)
5. Configure security group to allow inbound traffic on ports:
   - 22 (SSH)
   - 80 (HTTP)
   - 3001 (Application port)
6. Create or select an existing key pair
7. Launch the instance and wait for it to start

#### Step 2: Connect to Your EC2 Instance
```bash
ssh -i your-key.pem ec2-user@your-ec2-ip
```

#### Step 3: Install Required Software
```bash
# Update system packages
sudo yum update -y

# Install Node.js
curl -sL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo yum install -y nodejs git

# Install PM2 for process management
sudo npm install -g pm2

# Verify installations
node -v
npm -v
pm2 -v
```

#### Step 4: Clone the Repository
```bash
git clone https://github.com/devinllc/video-consumer.git
cd video-consumer
npm install
```

#### Step 5: Configure for Same-Server Deployment
1. Create or update the environment file:
```bash
# Edit frontend configuration
nano frontend-app/env.js
```

2. Set API_BASE_URL to empty string for same-origin deployment:
```javascript
// Environment configuration for video-consumer app
// For same-origin requests (frontend and backend on same server)
const API_BASE_URL = '';  // Empty string means use the same origin
```

3. Save and exit (Ctrl+O, Enter, Ctrl+X)

#### Step 6: Start the Application
```bash
# Start the application with PM2
pm2 start src/index.js --name video-backend

# Make sure PM2 starts on system boot
pm2 startup
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u ec2-user --hp /home/ec2-user
pm2 save
```

#### Step 7: Access Your Application
1. Open your browser and navigate to `http://your-ec2-ip:3001`
2. Configure AWS credentials at `http://your-ec2-ip:3001/config.html`

#### Step 8: Set Environment Variable for CORS (if needed)
```bash
# Edit the PM2 environment
pm2 stop video-backend
pm2 delete video-backend
ALLOW_ALL_ORIGINS=true pm2 start src/index.js --name video-backend
pm2 save
```

### Option 2: Separate Deployment (Frontend on Vercel, Backend on EC2)

This option deploys the frontend on Vercel and the backend on EC2.

#### Prerequisites
- AWS Account (Free Tier eligible)
- Vercel account
- GitHub account

#### Part A: Deploy Backend on EC2

#### Step 1: Launch an EC2 Instance
1. Login to AWS Console and navigate to EC2
2. Click "Launch Instance"
3. Choose "Amazon Linux 2023" AMI
4. Select t2.micro instance type (Free Tier eligible)
5. Configure security group to allow inbound traffic on ports:
   - 22 (SSH)
   - 3001 (API port)
6. Create or select an existing key pair
7. Launch the instance and wait for it to start

#### Step 2: Connect to Your EC2 Instance
```bash
ssh -i your-key.pem ec2-user@your-ec2-ip
```

#### Step 3: Install Required Software
```bash
# Update system packages
sudo yum update -y

# Install Node.js
curl -sL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo yum install -y nodejs git

# Install PM2 for process management
sudo npm install -g pm2

# Verify installations
node -v
npm -v
pm2 -v
```

#### Step 4: Clone the Repository
```bash
git clone https://github.com/devinllc/video-consumer.git
cd video-consumer
npm install
```

#### Step 5: Configure CORS for Separate Deployment
1. Edit the backend server file:
```bash
nano src/index.js
```

2. Update the CORS configuration to allow your Vercel frontend:
```javascript
// Add your Vercel URL to allowed origins
if (process.env.FRONTEND_URL) {
    allowedOrigins.push(process.env.FRONTEND_URL);
}

// Add Vercel domains
allowedOrigins.push('https://video-consumer.vercel.app');
allowedOrigins.push('https://video-consumer-git-main-trisha233.vercel.app');
```

3. Save and exit (Ctrl+O, Enter, Ctrl+X)

#### Step 6: Start the Backend Server with Environment Variables
```bash
# Set environment variables and start the application
FRONTEND_URL=https://your-vercel-app.vercel.app EC2_PUBLIC_IP=your-ec2-ip pm2 start src/index.js --name video-backend

# Make sure PM2 starts on system boot
pm2 startup
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u ec2-user --hp /home/ec2-user
pm2 save
```

#### Part B: Deploy Frontend on Vercel

#### Step 1: Update Frontend Configuration
1. Update the API URL in your repository:
```bash
# On your local machine
git clone https://github.com/devinllc/video-consumer.git
cd video-consumer
```

2. Edit the environment file:
```bash
nano frontend-app/env.js
```

3. Update the API_BASE_URL to point to your EC2 instance:
```javascript
// Environment configuration for video-consumer app
const API_BASE_URL = 'http://your-ec2-ip:3001';  // Replace with your EC2 IP
```

4. Commit and push changes:
```bash
git add frontend-app/env.js
git commit -m "Update API URL for EC2 backend"
git push origin main
```

#### Step 2: Deploy to Vercel
1. Login to Vercel and import your GitHub repository
2. Configure the project:
   - Root Directory: `frontend-app`
   - Build Command: (leave empty)
   - Output Directory: (leave empty)
3. Click Deploy
4. Once deployed, access your frontend at the Vercel URL

### Troubleshooting Common Issues

#### 1. API Connection Errors (`ERR_CONNECTION_REFUSED`)
If you see "Failed to load resource: net::ERR_CONNECTION_REFUSED" errors:

1. **Check API URL Configuration**: 
   - For same-server deployment: API_BASE_URL should be empty string (`''`)
   - For separate deployment: API_BASE_URL should be full EC2 URL (`http://your-ec2-ip:3001`)

2. **Verify the EC2 Security Group**:
   - Port 3001 must be open for inbound traffic
   - For same-origin deployment, both frontend and backend use the same port

3. **Check Server Logs**:
   ```bash
   pm2 logs video-backend
   ```

#### 2. CORS Errors
If you see "Access to fetch at 'http://...' from origin 'http://...' has been blocked by CORS policy":

1. **Set ALLOW_ALL_ORIGINS Environment Variable**:
   ```bash
   pm2 stop video-backend
   pm2 delete video-backend
   ALLOW_ALL_ORIGINS=true pm2 start src/index.js --name video-backend
   pm2 save
   ```

2. **Add Your Domain to Allowed Origins**:
   ```bash
   FRONTEND_URL=https://your-domain.com pm2 start src/index.js --name video-backend
   ```

#### 3. Mixed Content Errors (HTTPS frontend to HTTP backend)
If your Vercel frontend (HTTPS) cannot access your EC2 backend (HTTP):

1. **Use a Secure Proxy**:
   - Consider setting up Nginx with Let's Encrypt
   - Or use a service like Cloudflare or ngrok

2. **For Testing Only**: Enable insecure requests in your browser

## Cost Management

The project includes several cost-saving features:

- Fargate Spot instances for transcoding tasks
- Automatic resource shutdown when not in use
- S3 lifecycle rules for automatic cleanup
- Performance level selection to balance cost vs. speed
- AWS Budget alerts to prevent unexpected charges

## Troubleshooting

Common issues and solutions:

1. **AWS Authentication Errors**: Verify your AWS credentials and IAM permissions
2. **ECS Task Failures**: Check CloudWatch logs for detailed error messages
3. **S3 Access Issues**: Confirm bucket policies and IAM roles
4. **Docker Build Errors**: Ensure Docker is running and has sufficient resources
5. **Network Connectivity**: Verify security group rules allow necessary traffic

### Connection Refused Errors

If you're experiencing "Failed to load resource: net::ERR_CONNECTION_REFUSED" errors when accessing the configuration page or API endpoints, follow these steps:

1. **Check API URL Configuration**: 
   - Open `frontend-app/env.js` and verify that `API_BASE_URL` is set correctly:
     - For same-origin deployment (frontend and backend on same server): Use empty string `""`
     - For separate deployment: Use full URL including protocol, e.g., `"http://13.235.75.73:3001"`

2. **Update the API URL manually**:
   ```bash
   # Connect to your EC2 instance
   ssh -i your-key-file.pem ec2-user@your-ec2-ip
   
   # Navigate to the application directory
   cd video-consumer
   
   # Edit the env.js file
   nano frontend-app/env.js
   
   # Set API_BASE_URL to empty string for same-origin deployment:
   # export const API_BASE_URL = '';
   
   # Save the file (Ctrl+O, Enter, Ctrl+X)
   
   # Restart the application
   pm2 restart video-backend
   ```

3. **Verify browser console**: 
   - Open your browser's developer tools (F12)
   - Check the Console tab for network errors
   - Verify the exact URLs being called with errors

4. **Test direct API access**:
   - Try accessing the API directly in your browser: `http://your-ec2-ip:3001/api/config`
   - Test using curl from your EC2 instance: `curl http://localhost:3001/api/config`

5. **Update Firewall Rules**:
   - Ensure your EC2 security group allows inbound traffic on port 3001
   - Check if any firewall on your EC2 instance is blocking connections

6. **Check Server Logs**:
   - Review PM2 logs for any backend errors: `pm2 logs video-backend`

## Additional Documentation

For more detailed information, refer to:
- [DEPLOYMENT-GUIDE.md](DEPLOYMENT-GUIDE.md): Comprehensive deployment instructions
- [ECR-SETUP-GUIDE.md](ECR-SETUP-GUIDE.md): Guide for setting up AWS ECR
- [FRONTEND-USER-GUIDE.md](FRONTEND-USER-GUIDE.md): User guide for the frontend application
- [QUICK-START-TESTING.md](QUICK-START-TESTING.md): Quick start guide for testing

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- AWS for providing the cloud infrastructure
- FFmpeg for video transcoding capabilities
- Node.js and Express for the backend framework

# Video Processing System: AWS EC2 Deployment Guide

This guide provides step-by-step instructions for deploying the Video Processing System on AWS EC2 using the free tier.

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [AWS EC2 Setup](#aws-ec2-setup)
3. [Server Configuration](#server-configuration)
4. [Application Deployment](#application-deployment)
5. [AWS S3 Configuration](#aws-s3-configuration)
6. [Accessing Your Application](#accessing-your-application)
7. [Cost Management](#cost-management)
8. [Troubleshooting](#troubleshooting)

## Prerequisites
- AWS account (free tier eligible)
- SSH client (Terminal on macOS/Linux, PuTTY on Windows)
- Basic understanding of command line

## AWS EC2 Setup

### Step 1: Launch an EC2 Instance
1. Log in to [AWS Management Console](https://console.aws.amazon.com/)
2. Navigate to EC2 Dashboard
3. Click "Launch Instance"
4. Select "Amazon Linux 2023" (free tier eligible)
5. Choose t2.micro instance type (free tier eligible)
6. Configure instance details (leave default settings)
7. Add storage (8 GB is sufficient and free tier eligible)
8. Add tags (optional)
9. Configure security group:
   - Allow SSH (port 22) from your IP
   - Allow HTTP (port 80)
   - Allow HTTPS (port 443)
   - Allow Custom TCP (port 3001)
10. Review and launch
11. Create or select an existing key pair and download it
12. Launch the instance

### Step 2: Connect to Your Instance
1. Change permissions for your key file:
   ```bash
   chmod 400 your-key-file.pem
   ```

2. Connect using SSH:
   ```bash
   ssh -i your-key-file.pem ec2-user@your-instance-public-ip
   ```

## Server Configuration

### Step 1: Update System and Install Dependencies
```bash
# Update system packages
sudo dnf update -y

# Install Node.js
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo dnf install -y nodejs git

# Install PM2 for process management
sudo npm install -g pm2
```

### Step 2: Clone the Repository
```bash
# Clone the application repository
git clone https://github.com/devinllc/video-consumer.git
cd video-consumer

# Install dependencies
npm install
```

## Application Deployment

### Step 1: Configure Environment Variables
Create a `.env` file with your AWS credentials and application settings:

```bash
# Create .env file
cat > .env << EOF
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
S3_BUCKET_NAME=your-bucket-name
PORT=3001
NODE_ENV=production
EOF
```

### Step 2: Start the Application
```bash
# Start the application with PM2
pm2 start src/index.js --name video-backend

# Ensure application starts on reboot
pm2 startup
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u ec2-user --hp /home/ec2-user
pm2 save

# Check application status
pm2 status
```

## AWS S3 Configuration

### Step 1: Create an S3 Bucket
1. Navigate to S3 in the AWS Console
2. Click "Create bucket"
3. Enter a unique bucket name
4. Select your preferred region (same as in your .env file)
5. Configure other settings as needed (default settings work for most cases)
6. Click "Create bucket"

### Step 2: Set Up IAM User and Permissions
1. Navigate to IAM in the AWS Console
2. Create a new user with programmatic access
3. Attach the "AmazonS3FullAccess" policy
4. Note the access key and secret key (add to your .env file)

## Accessing Your Application

### Frontend Application
The application includes a frontend that will be served at:
```
http://your-instance-public-ip:3001
```
For example, based on your deployment: `http://13.235.75.73:3001`

### API Endpoints
The backend API will be available at:
```
http://your-instance-public-ip:3001/api
```

Test your connection:
```bash
curl http://your-instance-public-ip:3001/health
```
For example: `curl http://13.235.75.73:3001/health` which should return a JSON response.

## Updating Frontend Configuration After Deployment

After deploying to AWS EC2, you'll need to update your frontend configuration to point to the new API endpoint:

### Step 1: Locate Your EC2 Instance Public IP
1. Find your EC2 instance public IP in the AWS Console or from SSH connection details
2. Verify the backend is running by accessing `http://your-instance-public-ip:3001/health`
   - Example: `http://13.235.75.73:3001/health`

### Step 2: Update Frontend Configuration Files
If you're hosting the frontend separately (like on Vercel):

1. Update the API base URL in `frontend-app/env.js`:
   ```javascript
   // Environment configuration for video-consumer app
   const API_BASE_URL = 'http://13.235.75.73:3001'; // Replace with your actual EC2 IP
   ```

2. If you have environment variables in your hosting platform (like Vercel):
   - Go to your project settings
   - Add an environment variable: `FRONTEND_URL` with your frontend URL
   - Add an environment variable: `API_BASE_URL` with your EC2 instance URL

### Step 3: If IP Address Changes
When you stop and start an EC2 instance, its public IP might change (unless you use an Elastic IP). If this happens:

1. Get the new IP address from AWS Console
2. Update your frontend configuration as described above
3. Redeploy your frontend or update environment variables

### Step 4: Using an Elastic IP (Optional but Recommended)
To maintain a consistent IP address even after stopping/starting your EC2 instance:

1. Go to EC2 Dashboard → Elastic IPs → Allocate Elastic IP address
2. Select the new Elastic IP and click "Associate"
3. Choose your instance and click "Associate"
4. Update your frontend configuration to use this static IP address

This way, you won't need to update your frontend configuration each time you restart your EC2 instance.

## CORS Configuration for Frontend Access

When your frontend is deployed to a different domain than your backend (e.g., frontend on Vercel, backend on EC2), you need to configure CORS to allow cross-origin requests.

### Step 1: Update EC2 Environment Variables
Connect to your EC2 instance and add the frontend URL to your environment:

```bash
# Connect to your EC2 instance
ssh -i your-key-file.pem ec2-user@your-ec2-ip

# Create or edit the .env file
nano .env

# Add your frontend URL to the file
FRONTEND_URL=https://your-frontend-domain.vercel.app

# Save and exit (Ctrl+O, Enter, Ctrl+X)

# Restart the application to apply changes
pm2 restart video-backend
```

### Step 2: Verify CORS Settings in src/index.js
The application is configured to automatically allow requests from the URL specified in `FRONTEND_URL`. If you're still having CORS issues:

1. Edit the application code to explicitly add your frontend domain:
```bash
nano src/index.js
```

2. Find the CORS configuration section and add your domain to the `allowedOrigins` array:
```javascript
const allowedOrigins = [
    // ... existing entries ...
    'https://your-frontend-domain.vercel.app'
];
```

3. Save the file and restart the application:
```bash
pm2 restart video-backend
```

### Step 3: Dealing with Mixed Content Errors
If your frontend is on HTTPS (like Vercel) but your backend uses HTTP, browsers will block the requests due to "mixed content" issues. To fix this:

1. **Option 1: Add a Content Security Policy meta tag** to your frontend HTML files:
```html
<meta http-equiv="Content-Security-Policy" content="upgrade-insecure-requests">
```

2. **Option 2: Set up HTTPS on your EC2 instance** using a service like Let's Encrypt (requires a domain name).

3. **Option 3: Use an HTTPS proxy** service like ngrok to expose your EC2 endpoint securely.

## AWS ECS Configuration

If you want to use Amazon ECS for video transcoding tasks (as shown in your configuration form), follow these steps:

### Step 1: Setting Up ECS Resources

1. **Create an ECS Cluster**:
   - Go to the ECS dashboard in AWS Console
   - Click "Create Cluster"
   - Choose "Fargate" for serverless container management
   - Name your cluster (e.g., "video-transcoder-cluster")
   - Click "Create"

2. **Create a Task Definition**:
   - In ECS dashboard, go to "Task Definitions"
   - Click "Create new Task Definition"
   - Choose "Fargate" for launch type
   - Fill in the task definition details:
     - Name: `video-transcoder`
     - Task role: Create or select a role with S3 access
     - Task execution role: Use the default
     - Task memory: 2GB (minimum for video processing)
     - Task CPU: 1 vCPU
   - Add a container:
     - Name: `transcoder-container`
     - Image: `your-account-id.dkr.ecr.region.amazonaws.com/video-transcoder:latest`
     - (You'll need to create this container image and push it to ECR)
   - Click "Create"

3. **Set Up Networking**:
   - Create a VPC if you don't have one
   - Create at least two subnets in different availability zones
   - Create a security group that allows inbound traffic from your EC2 instance

### Step 2: Configure Your Application to Use ECS

Once you have your ECS resources set up, you can configure your application:

1. Access your application's configuration page: `http://your-ec2-ip:3001/config.html`

2. Fill in the ECS configuration:
   - **ECS Cluster ARN**: `arn:aws:ecs:region:account:cluster/video-transcoder-cluster`
   - **ECS Task Definition**: `arn:aws:ecs:region:account:task-definition/video-transcoder:1`
   - **ECS Subnet IDs**: Your comma-separated subnet IDs (e.g., `subnet-xxx,subnet-yyy`)
   - **ECS Security Group IDs**: Your comma-separated security group IDs (e.g., `sg-xxx`)

3. Click "Save Configuration" and then "Test Connection" to validate

### Step 3: Troubleshooting ECS Connection

If you encounter errors in the connection test:

1. **Check AWS Credentials**:
   - Verify that your EC2 instance has the correct AWS credentials
   - Ensure the IAM role or user has permissions for ECS, ECR, and S3

2. **Verify ARNs and IDs**:
   - Double-check all ARNs and IDs for typos
   - Ensure the resources exist in the same region

3. **Check Network Configuration**:
   - Ensure subnets have internet access (via Internet Gateway or NAT Gateway)
   - Verify security groups allow necessary traffic

4. **Check Logs**:
   - View application logs: `pm2 logs video-backend`
   - Look for specific error messages related to AWS services

## Cost Management

EC2 free tier allows:
- 750 hours per month of t2.micro (enough for 1 instance 24/7)
- 30 GB of EBS storage
- 15 GB of bandwidth out

To minimize costs:
1. **Stop Your Instance When Not in Use**:
   ```bash
   # From AWS Console: Select instance → Actions → Instance State → Stop
   # Or using AWS CLI:
   aws ec2 stop-instances --instance-ids your-instance-id
   ```

2. **Monitor Usage**:
   - Set up AWS Budgets to alert you when approaching free tier limits
   - Regularly check the AWS Cost Explorer

3. **Watch S3 Usage**:
   - S3 free tier includes 5GB storage, 20,000 GET requests, and 2,000 PUT requests
   - Delete unnecessary files

## Troubleshooting

### Connection Issues
- Verify security group settings allow traffic on port 3001
- Check that the application is running: `pm2 status`
- View application logs: `pm2 logs video-backend`

### AWS Credential Issues
- Verify your AWS credentials are correct in the .env file
- Check IAM permissions for your user

### Application Errors
- Check application logs: `pm2 logs video-backend`
- Restart the application: `pm2 restart video-backend`

---

For more detailed troubleshooting or questions, please open an issue on GitHub.

## Same-Origin Deployment (Frontend and Backend on Same EC2)

If you're hosting both the frontend and backend on the same EC2 instance (as in your current setup), you can simplify the configuration:

### Step 1: Update the Frontend API Configuration

Since both components are on the same server, you should use relative URLs:

1. Edit the `frontend-app/env.js` file:
   ```bash
   nano frontend-app/env.js
   ```

2. Update the API_BASE_URL to an empty string, which means "use the current origin":
   ```javascript
   // Environment configuration for video-consumer app
   // For same-origin requests (frontend and backend on same server)
   const API_BASE_URL = '';  // Empty string means use the same origin
   ```

3. Save the file (Ctrl+O, Enter, Ctrl+X)

### Step 2: Verify Configuration in frontend-app/config.js

The config.js file is already set up to handle this case, but you can verify it:

1. Check the file:
   ```bash
   cat frontend-app/config.js
   ```

2. Confirm that the URL construction is using the API_BASE_URL correctly:
   ```javascript
   // Function to get the full API URL
   window.getApiUrl = function (endpoint) {
       return window.API_CONFIG.BASE_URL + endpoint;
   };
   ```

### Step 3: Restart Your Application

After making these changes, restart your application:

```bash
pm2 restart video-backend
```

### Step 4: Access Your Application

You can now access your application using the EC2's IP address:

```
http://13.235.75.73:3001
```

This URL will serve both the frontend interface and the backend API endpoints.

### Benefits of Same-Origin Deployment

- **No CORS issues**: Since both frontend and backend are on the same origin
- **Simplified configuration**: No need to update URLs when the EC2 IP changes
- **Reduced latency**: Direct communication between frontend and backend
- **Easier maintenance**: Only one server to manage
