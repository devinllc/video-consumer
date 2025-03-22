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

## Getting Started

### Prerequisites
- AWS Account
- Docker and Docker Compose
- Node.js and npm
- AWS CLI configured with appropriate credentials

### Local Development Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/video-transcoding-service.git
   cd video-transcoding-service
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm start
   ```

4. Access the application at http://localhost:3000

### Docker Compose Setup

For a quick local deployment with Docker:

1. Build and start the containers:
   ```bash
   docker-compose up -d
   ```

2. Access the application at http://localhost:3000

### AWS Deployment

For deploying to AWS:

1. Make the deployment scripts executable:
   ```bash
   chmod +x deploy.sh deploy-ecs.sh
   ```

2. Build and push Docker images to ECR:
   ```bash
   ./deploy.sh
   ```

3. Deploy to ECS:
   ```bash
   ./deploy-ecs.sh
   ```

## API Endpoints

The backend provides the following API endpoints:

- `POST /api/upload`: Upload a video file
- `POST /api/transcode`: Start a transcoding job
- `GET /api/jobs/:jobId`: Get job status and logs
- `GET /api/jobs`: List all jobs
- `POST /api/config`: Save AWS configuration
- `GET /api/config`: Get current configuration
- `POST /api/test-connection`: Test AWS connectivity

## Configuration

### AWS Resources Required

1. **S3 Bucket**: For storing videos
2. **IAM User/Role**: With permissions for S3, ECS, and ECR
3. **ECS Cluster**: For running transcoding tasks
4. **ECR Repositories**: For storing Docker images
5. **VPC, Subnets, Security Groups**: For network configuration

### Performance Tuning

The service allows configuring different performance levels for transcoding:

- **Economy**: 1 vCPU, 2GB RAM
- **Standard**: 2 vCPU, 4GB RAM
- **Premium**: 4 vCPU, 8GB RAM

## Project Structure

```
video-transcoding-service/
├── consumer/                # Frontend web interface
│   ├── index.js           # Main transcoding code or services page
│   ├── decker
├── frontend/                # Frontend web interface
│   ├── index.html           # Main application page
│   ├── config.html          # Configuration page
│   ├── instructions.html    # User instructions
│   ├── config.js            # API configuration
│   └── styles/              # CSS styles
├── src/                     # Backend source code
│   └── index.ts             # Main server file
├── Dockerfile.frontend      # Frontend Docker image
├── Dockerfile.backend       # Backend Docker image
├── docker-compose.yml       # Local deployment config
├── deploy.sh                # ECR deployment script
├── deploy-ecs.sh            # ECS deployment script
├── task-definition-frontend.json  # ECS task definition for frontend
├── task-definition-backend.json   # ECS task definition for backend
└── DEPLOYMENT-GUIDE.md      # Detailed deployment instructions
```

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

### API Endpoints
The backend API will be available at:
```
http://your-instance-public-ip:3001/api
```

Test your connection:
```bash
curl http://your-instance-public-ip:3001/health
```

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
