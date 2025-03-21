# Split Deployment Guide: Vercel (Frontend) + AWS EC2 (Backend)

This guide will help you separate the frontend and backend code, deploy only the backend on EC2, and manage your EC2 instance for cost savings.

## 1. Separate Frontend and Backend Code

Currently, your EC2 instance is serving both frontend and backend from the same codebase. Let's separate them:

### On Your EC2 Instance:

```bash
# Connect to your EC2 instance
ssh -i your-key.pem ec2-user@13.201.186.249

# Switch to root if needed
sudo su -

# Navigate to the video-consumer directory
cd ~/video-consumer

# Edit the index.js file to disable serving frontend files
nano src/index.js
```

In the editor, find and comment out the line:
```javascript
// Comment out this line:
// app.use(express.static('frontend-app'));
```

Save the file (CTRL+O, then CTRL+X).

```bash
# Restart the server
pm2 restart video-backend
```

## 2. Configure CORS for Cross-Origin Requests

Since your frontend (Vercel) and backend (EC2) will be on different domains, you need to configure CORS:

```bash
# Edit the index.js file
nano src/index.js
```

Find the CORS configuration and update it:
```javascript
// Enable CORS for all routes
app.use(cors({
    origin: ['https://your-vercel-app.vercel.app', 'http://localhost:3000'],
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
```

Replace `your-vercel-app.vercel.app` with your actual Vercel domain. Save and restart:

```bash
pm2 restart video-backend
```

## 3. Deploy Only Frontend to Vercel

First, check if your Vercel project is already set up to only deploy the frontend:

1. Go to your Vercel dashboard
2. Click on your project
3. Go to Settings → General
4. Look for "Root Directory" - if it's set to "frontend-app", you're good
5. If not, change it to "frontend-app"

## 4. Fix the Connection Test Error

The error suggests your AWS configuration is incomplete or incorrect. Set up your AWS configuration:

1. Go to http://13.201.186.249:3001/api/config to configure your AWS credentials
2. Enter valid credentials:
   - AWS Access Key ID
   - AWS Secret Access Key
   - AWS Region (e.g., ap-south-1)
   - S3 Bucket Name
   - ECS Cluster ARN (e.g., arn:aws:ecs:ap-south-1:123456789012:cluster/video-transcoder-cluster)
   - ECS Task Definition (e.g., video-transcoder:1)
   - ECS Subnet IDs (comma-separated, e.g., subnet-123456,subnet-789012)
   - ECS Security Group IDs (comma-separated, e.g., sg-123456)

## 5. EC2 Instance Management for Cost Savings

### Stopping Your EC2 Instance When Not in Use

```bash
# Connect to your AWS account via AWS CLI
aws ec2 stop-instances --instance-ids i-your-instance-id

# Or via AWS Console:
# 1. Go to EC2 Dashboard
# 2. Select your instance
# 3. Click Actions → Instance State → Stop
```

### Starting Your EC2 Instance When Needed

```bash
# Via AWS CLI
aws ec2 start-instances --instance-ids i-your-instance-id

# Or via AWS Console:
# 1. Go to EC2 Dashboard
# 2. Select your instance
# 3. Click Actions → Instance State → Start
```

### Automating with AWS Lambda (Optional)

You can create Lambda functions to automatically stop and start your EC2 instance on a schedule:

1. Create a Lambda function with appropriate IAM permissions
2. Set up CloudWatch Events for scheduling
3. Example Lambda function to stop instances:

```javascript
exports.handler = async (event) => {
    const AWS = require('aws-sdk');
    const ec2 = new AWS.EC2();
    
    try {
        const params = {
            InstanceIds: ['i-your-instance-id']
        };
        
        await ec2.stopInstances(params).promise();
        console.log('Successfully stopped instance');
        return { statusCode: 200, body: 'Instance stopped' };
    } catch (error) {
        console.error('Error stopping instance:', error);
        return { statusCode: 500, body: JSON.stringify(error) };
    }
};
```

## 6. Update Frontend URL After Instance Restart

When you restart your EC2 instance, its public IP might change (unless you're using an Elastic IP). If the IP changes:

1. Update the env.js file with the new IP:
```javascript
const API_BASE_URL = 'http://new-ip-address:3001';
```

2. Commit and push to GitHub:
```bash
git add frontend-app/env.js
git commit -m "Update backend IP address"
git push origin main
```

3. Redeploy on Vercel

### Using an Elastic IP to Avoid IP Changes (Recommended)

1. Go to EC2 Dashboard → Elastic IPs
2. Click "Allocate Elastic IP address"
3. Select "Amazon's pool of IPv4 addresses"
4. Click "Allocate"
5. Select the new Elastic IP
6. Click "Actions" → "Associate Elastic IP address"
7. Select your instance and associate

With an Elastic IP, your instance will keep the same IP even after stopping and starting.

## 7. Testing Your Setup

1. Start your EC2 instance
2. Wait for it to initialize (usually 1-2 minutes)
3. Visit your Vercel frontend URL
4. Try to configure AWS credentials and test the connection

## 8. Troubleshooting

If you're still having connection issues:

1. Check that your EC2 security group allows inbound traffic on port 3001
2. Verify your CORS settings include your Vercel domain
3. Test the backend API directly: http://your-ec2-ip:3001/health
4. Check EC2 logs: `pm2 logs video-backend`

Remember to stop your EC2 instance when not in use to avoid unnecessary charges. 