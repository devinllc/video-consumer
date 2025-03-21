# Video Transcoding Service - Documentation

## Overview

This Video Transcoding Service allows users to:
- Upload videos through a web interface
- Transcode videos to multiple formats and resolutions using AWS ECS
- Monitor transcoding progress with real-time logs
- Stream transcoded videos using HLS
- Configure AWS resources and credentials
- Choose performance levels for transcoding tasks

## Quick Start

1. **Installation**:
   ```bash
   npm install
   npm run build
   npm start
   ```

2. **Access the application**:
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:3001

## System Architecture

The system consists of two main components:

### 1. Frontend
- Web interface built with HTML, CSS, and JavaScript
- Provides upload form, configuration page, and video player
- Communicates with the backend API

### 2. Backend
- Node.js/Express API server
- Handles file uploads and S3 storage
- Manages ECS task execution for video transcoding
- Provides job status monitoring and logs
- Exposes RESTful API endpoints

### 3. Transcoding Container
- Node.js application with FFmpeg
- Downloads videos from S3
- Transcodes to multiple resolutions
- Creates HLS streaming segments
- Uploads processed files back to S3

## AWS Configuration

To use this service, you need to configure the following AWS resources:

1. **S3 Bucket**:
   - Create a bucket for storing videos
   - Ensure proper CORS settings

2. **ECS Cluster and Task Definition**:
   - Set up a Fargate cluster
   - Register the transcoding task definition

3. **Networking**:
   - Configure VPC, subnets, and security groups
   - Ensure proper network access for ECS tasks

4. **IAM**:
   - Create a user/role with appropriate permissions

## API Endpoints

The backend provides the following API endpoints:

- `POST /api/upload`: Upload a video file
- `POST /api/start-transcoding`: Start a transcoding job
- `GET /api/jobs/:jobId`: Get job status and logs
- `GET /api/jobs`: List all jobs
- `POST /api/config`: Save AWS configuration
- `GET /api/config`: Get current configuration

## Performance Options

The service offers three performance tiers for transcoding:

- **Economy**: 1 vCPU, 2GB RAM
- **Standard**: 2 vCPU, 4GB RAM
- **Premium**: 4 vCPU, 8GB RAM

## Docker Deployment

For docker-based deployment:

```bash
# Build and run with Docker Compose
docker-compose up -d

# Or build and run individual containers
docker build -f Dockerfile.backend -t video-consumer-backend .
docker build -f Dockerfile.frontend -t video-consumer-frontend .
docker run -p 3001:3001 video-consumer-backend
docker run -p 3000:3000 video-consumer-frontend
```

## AWS Deployment

To deploy to AWS:

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

## Troubleshooting

Common issues and solutions:

1. **AWS Authentication Errors**: Verify your AWS credentials and IAM permissions
2. **ECS Task Failures**: Check CloudWatch logs for detailed error messages
3. **S3 Access Issues**: Confirm bucket policies and IAM roles
4. **Docker Build Errors**: Ensure Docker is running and has sufficient resources
5. **Network Connectivity**: Verify security group rules allow necessary traffic 