# Vercel Deployment Guide for Video Consumer

This guide explains how to deploy your frontend and backend applications to Vercel for free.

## Prerequisites

1. You need a [Vercel account](https://vercel.com/signup) - Free tier works for this deployment
2. You need a [GitHub account](https://github.com/join) - To store your code
3. Install [Vercel CLI](https://vercel.com/cli) (optional, but helpful)
   ```bash
   npm install -g vercel
   ```
4. Your transcoder container should already be available in ECR

## Step 1: Prepare Your Repository

1. Create a new GitHub repository for your project
2. Push your code to the repository:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/yourusername/video-consumer.git
   git push -u origin main
   ```

## Step 2: Deploy the Backend

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click "Add New" → "Project"
3. Import your GitHub repository
4. Configure the project:
   - Root Directory: `./` (the project root)
   - Build Command: `npm run build`
   - Output Directory: `dist`
   - Install Command: `npm install`
5. Add environment variables:
   - `AWS_ACCESS_KEY_ID`: Your AWS access key
   - `AWS_SECRET_ACCESS_KEY`: Your AWS secret access key
   - `AWS_REGION`: Your AWS region (e.g., ap-south-1)
   - `S3_BUCKET_NAME`: Your S3 bucket name
   - `FRONTEND_URL`: Your frontend URL (add this after frontend deployment)
6. Click "Deploy"

### Backend Deployment via CLI (Alternative)

```bash
cd /path/to/your/project
vercel
```

Follow the CLI prompts to configure your project.

## Step 3: Deploy the Frontend

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click "Add New" → "Project"
3. Import your GitHub repository
4. Configure the project:
   - Root Directory: `./frontend-app`
   - Build Command: `npm run build`
   - Output Directory: `.`
   - Install Command: `npm install`
5. Click "Deploy"

### Frontend Deployment via CLI (Alternative)

```bash
cd /path/to/your/project/frontend-app
vercel
```

Follow the CLI prompts to configure your project.

## Step 4: Update API URL Configuration

After deploying both frontend and backend:

1. Edit the `frontend-app/env.js` file:
   ```javascript
   window.API_BASE_URL = 'https://your-backend-name.vercel.app';
   ```
2. Commit and push the changes:
   ```bash
   git add frontend-app/env.js
   git commit -m "Update API URL"
   git push
   ```
3. Vercel will automatically redeploy your frontend

## Step 5: Update CORS Settings on Backend

1. Go back to your Vercel Dashboard
2. Select your backend project
3. Add or update environment variable:
   - `FRONTEND_URL`: `https://your-frontend-name.vercel.app`
4. Trigger a redeployment

## Step 6: Test Your Deployment

1. Visit your frontend URL: `https://your-frontend-name.vercel.app`
2. Navigate to the configuration page
3. Configure your AWS settings:
   - AWS Region
   - AWS Access Key ID
   - AWS Secret Access Key
   - S3 Bucket Name
   - ECS Cluster name
   - ECS Task Definition name (for your transcoder container)
   - Subnet IDs (comma-separated)
   - Security Group IDs (comma-separated)
4. Save the configuration
5. Test uploading a video and starting the transcoding process

## Troubleshooting

1. **CORS Issues**: Make sure your backend allows requests from your frontend domain
2. **Missing Environment Variables**: Check that all required AWS credentials are set
3. **Serverless Function Timeout**: If you get timeout errors, Vercel might be timing out on large file uploads
   - Consider setting up a direct-to-S3 upload approach for larger files
4. **API Connection Failed**: Double check the API URL in env.js is correct
5. **ECS Connectivity Issues**: Ensure your backend has the proper IAM permissions to access ECS

## Free Tier Limitations

1. **Serverless Function Execution Time**: Vercel limits execution to 10 seconds on the free plan, which might affect large uploads
2. **Bandwidth**: 100GB/month on the free plan
3. **Serverless Function Size**: 50MB maximum code size
4. **Deployments**: 100 deployments per day

For a fuller experience with larger uploads, consider a paid tier or deploying to AWS Elastic Beanstalk (which has a free tier option). 