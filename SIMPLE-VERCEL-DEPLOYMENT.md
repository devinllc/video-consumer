# Simple Vercel Deployment Guide for Non-Technical Users

This guide will help you deploy your Video Consumer application to Vercel without requiring deep technical knowledge.

## What is Vercel?

Vercel is a cloud platform that makes it easy to deploy websites and web applications. It offers a free tier that's perfect for personal projects and small applications.

## Step 1: Create Required Accounts

1. **Sign up for a Vercel account**
   - Go to [Vercel's signup page](https://vercel.com/signup)
   - Choose "Continue with GitHub" (simplest option)

2. **Create a GitHub account** (if you don't already have one)
   - Go to [GitHub's signup page](https://github.com/join)
   - Follow the instructions to create an account

## Step 2: Upload Your Code to GitHub

1. **Create a new repository on GitHub**
   - Go to [GitHub](https://github.com)
   - Click the "+" icon in the top-right corner
   - Select "New repository"
   - Name your repository (e.g., "video-consumer")
   - Set it to "Public"
   - Click "Create repository"

2. **Upload your code**
   - Ask a developer to help you upload your code to this repository
   - They'll need to follow standard git commands to push the code

## Step 3: Deploy the Backend

1. **Go to Vercel Dashboard**
   - Log in to [Vercel](https://vercel.com/dashboard)

2. **Create a New Project**
   - Click "Add New" → "Project"
   - Select your GitHub repository from the list
   - If you don't see it, click "Configure GitHub App" and grant access

3. **Configure the Backend Project**
   - Project Name: Choose a name for your backend (e.g., "video-consumer-backend")
   - Framework Preset: Select "Other"
   - Root Directory: Leave as "./" (default)
   - Build Command: `npm run build`
   - Output Directory: `dist`

4. **Add Environment Variables**
   - Click "Environment Variables" to expand the section
   - Add the following variables (get these values from your AWS account or IT department):
     - `AWS_ACCESS_KEY_ID`: Your AWS access key
     - `AWS_SECRET_ACCESS_KEY`: Your AWS secret key
     - `AWS_REGION`: Your AWS region (e.g., ap-south-1)
     - `S3_BUCKET_NAME`: Your S3 bucket name

5. **Deploy**
   - Click "Deploy"
   - Wait for the deployment to complete (you'll see a success message)
   - Copy the URL that Vercel generates (looks like https://your-project-name.vercel.app)

## Step 4: Deploy the Frontend

1. **Create Another New Project in Vercel**
   - Click "Add New" → "Project"
   - Select the same GitHub repository

2. **Configure the Frontend Project**
   - Project Name: Choose a name for your frontend (e.g., "video-consumer-frontend")
   - Framework Preset: Select "Other"
   - Root Directory: Type `frontend-app`
   - Build Command: `npm run build`
   - Output Directory: `.` (just a dot)

3. **Deploy**
   - Click "Deploy"
   - Wait for the deployment to complete
   - Copy the URL that Vercel generates for the frontend

## Step 5: Connect Frontend and Backend

1. **Update the API URL**
   - In your GitHub repository, navigate to the `frontend-app` folder
   - Find the file named `env.js` and click on it
   - Click the edit (pencil) icon
   - Find the line that looks like:
     ```javascript
     window.API_BASE_URL = 'https://your-backend-url.vercel.app';
     ```
   - Replace `https://your-backend-url.vercel.app` with your actual backend URL from Step 3
   - At the bottom, click "Commit changes"

2. **Update Backend CORS Settings**
   - Go back to your Vercel dashboard
   - Select your backend project
   - Go to "Settings" → "Environment Variables"
   - Add a new variable:
     - Key: `FRONTEND_URL`
     - Value: Your frontend URL from Step 4 (e.g., https://video-consumer-frontend.vercel.app)
   - Click "Save"
   - Go to "Deployments" tab and click "Redeploy" on the latest deployment

## Step 6: Testing Your Deployment

1. Visit your frontend URL in a web browser
2. Navigate to the configuration page
3. Enter your AWS settings 
4. Try uploading a small video file (under 4MB due to Vercel limits)
5. Check that the transcoding process starts

## Limitations

- **File Size**: The free tier has a 4.5MB limit on file uploads
- **Processing Time**: Functions time out after 10 seconds
- **Bandwidth**: Limited to 100GB per month on the free plan

## Getting Help

If you encounter any issues during deployment, the best options are:

1. Ask a technical colleague for assistance
2. Check Vercel's documentation at https://vercel.com/docs
3. Use Vercel's support through their dashboard

Remember, Vercel's free tier is great for small projects, but if you need to process large video files, you might need to explore paid options or alternative platforms. 