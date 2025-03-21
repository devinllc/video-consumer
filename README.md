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
