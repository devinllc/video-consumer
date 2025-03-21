# AWS EC2 Deployment Guide for Video Transcoding

This guide will help you deploy the backend on AWS EC2 (free tier) while keeping your frontend on Vercel. This setup enables actual video transcoding instead of simulation.

## Free Tier Precautions

To avoid unexpected charges on AWS Free Tier:

1. **Stay within the limits**:
   - Use only t2.micro instances (750 hours/month free for 12 months)
   - Use only 30GB of EBS storage (free for 12 months)
   - Monitor your usage in AWS Billing dashboard

2. **Set up billing alarms**:
   - Go to CloudWatch → Alarms → Create alarm
   - Create an alarm for when your estimated charges exceed $1
   - Add your email for notifications

3. **Turn off resources when not in use**:
   - Stop your EC2 instance when not using the application
   - You're only billed for running instances

4. **Avoid accidental service usage**:
   - Only create the specific resources mentioned in this guide
   - Some AWS services have no free tier

## Backend Deployment on AWS EC2

### Step 1: Create an EC2 Instance

1. **Sign in to AWS Console**:
   - Go to [AWS Console](https://console.aws.amazon.com/)
   - Sign in with your account

2. **Launch an EC2 Instance**:
   - Go to EC2 Dashboard
   - Click "Launch Instance"
   - Enter a name (e.g., "video-consumer-backend")

3. **Choose AMI and Instance Type**:
   - Select "Amazon Linux 2023" 
   - Choose t2.micro (Free tier eligible)

4. **Configure Network**:
   - Create a new security group
   - Add inbound rules:
     - SSH (port 22) from your IP only
     - HTTP (port 80) from anywhere
     - Custom TCP (port 3001) from anywhere

5. **Add Storage**:
   - Use default 8GB (free tier eligible)

6. **Create Key Pair**:
   - Create a new key pair or use existing
   - Download the .pem file if creating new
   - Keep this file secure

7. **Launch Instance**:
   - Review and click "Launch instance"

### Step 2: Connect to Your Instance

1. **Using SSH**:
   - For macOS/Linux:
     ```bash
     chmod 400 your-key.pem
     ssh -i your-key.pem ec2-user@your-instance-public-ip
     ```
   - For Windows: Use PuTTY or Windows Subsystem for Linux

### Step 3: Install Dependencies

```bash
# Update system packages
sudo yum update -y

# Install Node.js and npm
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo yum install -y nodejs git

# Install PM2 for process management
sudo npm install -g pm2

# Clone the repository
git clone https://github.com/devinllc/video-consumer.git
cd video-consumer

# Install dependencies
npm install
```

### Step 4: Configure and Run the Application

```bash
# Create environment file
cat > .env << EOF
NODE_ENV=production
PORT=3001
EOF

# Start the application with PM2
pm2 start src/index.js --name video-backend

# Make PM2 start on system boot
pm2 startup
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u ec2-user --hp /home/ec2-user
pm2 save

# Check status
pm2 status
```

### Step 5: Set Up AWS Credentials in the Application

1. After your application is running, navigate to:
   ```
   http://your-instance-public-ip:3001
   ```

2. Go to the Configuration page and enter your AWS credentials:
   - AWS Access Key ID
   - AWS Secret Access Key
   - AWS Region
   - S3 Bucket Name
   - ECS Cluster
   - ECS Task Definition
   - Subnets
   - Security Groups

## Updating the Frontend on Vercel

### Step 1: Create API URL Configuration

1. **Create `env.js` file** in your local repository:
   ```javascript
   // frontend-app/env.js
   const API_BASE_URL = 'http://your-ec2-instance-public-ip:3001';
   ```

2. **Update your frontend HTML files** to load env.js before config.js:
   ```html
   <script src="env.js"></script>
   <script src="config.js"></script>
   ```

### Step 2: Push Changes to GitHub

```bash
git add frontend-app/env.js
git commit -m "Add env.js with EC2 backend URL"
git push origin main
```

### Step 3: Redeploy on Vercel

1. Go to your Vercel dashboard
2. Find your project
3. Click "Deployments"
4. Trigger a new deployment

## Testing the Connection

1. Open your Vercel frontend app URL
2. Try to upload and transcode a video
3. Check if real AWS ECS tasks are created
4. Monitor the job logs in the frontend

## Troubleshooting

### Front-to-Backend Connection Issues

If your frontend can't connect to the backend:

1. **Check CORS Settings**:
   - Ensure your backend allows requests from your Vercel domain
   - Edit src/index.js to update CORS configuration:
   ```javascript
   app.use(cors({
     origin: ['https://your-vercel-app.vercel.app', 'http://localhost:3000'],
     methods: ['GET', 'POST', 'PUT', 'DELETE'],
     allowedHeaders: ['Content-Type', 'Authorization']
   }));
   ```

2. **Check Security Group**:
   - Ensure port 3001 is open in EC2 security group
   - Allow all traffic from Vercel IP ranges

3. **Use HTTPS for Production**:
   - For production, set up HTTPS using Nginx and Let's Encrypt:
   ```bash
   sudo amazon-linux-extras install nginx1
   sudo systemctl start nginx
   sudo systemctl enable nginx
   ```

### AWS ECS Task Issues

If your AWS ECS tasks aren't starting:

1. **Check IAM Permissions**:
   - Your AWS credentials must have these permissions:
     - `ecs:RunTask`, `ecs:DescribeTasks`
     - `ec2:DescribeSubnets`, `ec2:DescribeSecurityGroups`
     - `s3:PutObject`, `s3:GetObject`, `s3:ListBucket`

2. **Verify ECS Configuration**:
   - Ensure your ECS cluster exists and is active
   - Verify task definition is correct and registered
   - Check subnet and security group IDs

3. **Monitor Server Logs**:
   ```bash
   pm2 logs video-backend
   ```

## Maintenance Tasks

### Updating Your Application

```bash
cd ~/video-consumer
git pull
npm install
pm2 restart video-backend
```

### Monitoring EC2 Instance Health

```bash
# Check system resources
htop

# Check disk space
df -h

# View application logs
pm2 logs
```

### Creating an EC2 Backup

1. Go to EC2 Dashboard
2. Select your instance
3. Click Actions → Image and templates → Create image
4. Follow prompts to create an AMI

## Cost Management

Even on free tier, monitor these potential cost sources:

1. **EC2 instance hours** beyond 750 hours/month
2. **EBS storage** beyond 30GB
3. **Data transfer out** beyond 1GB/month
4. **ECS task execution** (charged based on resources used)
5. **S3 storage and requests** (small charges after free tier usage)

Set up AWS Budget to monitor all costs.

## Security Best Practices

1. Keep your EC2 instance updated:
   ```bash
   sudo yum update -y
   ```

2. Store AWS credentials as environment variables instead of files
3. Use IAM roles with minimum required permissions
4. Regularly rotate AWS access keys
5. Enable AWS CloudTrail for auditing 