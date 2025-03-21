# Deploying for Actual Video Transcoding

As you've discovered, the application in Vercel only **simulates** transcoding jobs because:

1. Vercel is a serverless platform with function execution time limits (10-60 seconds)
2. Video transcoding requires minutes or hours of processing time
3. Serverless platforms don't support long-running background processes

## Free Options for Actual Transcoding

### Option 1: Oracle Cloud Free Tier (Recommended)

Oracle Cloud offers a generous free tier with 2 AMD-based Compute VMs:

1. **Sign up at [Oracle Cloud](https://www.oracle.com/cloud/free/)**
   - Create a free tier account
   - No credit card required for Always Free resources

2. **Create a VM Instance**
   - Select "Create a VM Instance"
   - Choose "Always Free Eligible" shape (VM.Standard.E2.1.Micro)
   - Select Ubuntu 20.04 as operating system
   - Generate or upload SSH key

3. **Configure Security**
   - Add ingress rule for port 3001
   - Configure VCN and subnet with internet access

4. **Connect to Your VM**
   ```bash
   ssh -i /path/to/private_key ubuntu@<your-instance-ip>
   ```

5. **Install Dependencies**
   ```bash
   sudo apt update
   sudo apt install -y nodejs npm git ffmpeg
   ```

6. **Deploy Your Application**
   ```bash
   git clone https://github.com/devinllc/video-consumer.git
   cd video-consumer
   npm install
   npm start
   ```

7. **Keep It Running**
   ```bash
   # Install PM2 to keep your app running
   npm install -g pm2
   pm2 start src/index.js
   pm2 startup
   pm2 save
   ```

### Option 2: AWS Free Tier

AWS offers 12 months of free tier access:

1. **Sign up for [AWS Free Tier](https://aws.amazon.com/free/)**

2. **Launch EC2 Instance**
   - t2.micro instance (750 hours per month free for 12 months)
   - Amazon Linux or Ubuntu
   - Configure security group to allow port 3001

3. **SSH into your instance**
   ```bash
   ssh -i /path/to/key.pem ec2-user@<your-instance-ip>
   ```

4. **Install dependencies and deploy**
   ```bash
   sudo yum update -y
   sudo yum install -y nodejs npm git ffmpeg
   git clone https://github.com/devinllc/video-consumer.git
   cd video-consumer
   npm install
   npm start
   ```

### Option 3: Google Cloud Free Tier

Google Cloud offers free f1-micro instances:

1. **Sign up for [Google Cloud](https://cloud.google.com/free)**

2. **Create a VM Instance**
   - Select e2-micro (2 vCPU, 1GB memory)
   - Select Ubuntu 20.04 LTS
   - Allow HTTP/HTTPS traffic

3. **SSH into your instance**
   - Use the GCP console's built-in SSH
   - Or set up your SSH keys

4. **Install dependencies and deploy**
   ```bash
   sudo apt update
   sudo apt install -y nodejs npm git ffmpeg
   git clone https://github.com/devinllc/video-consumer.git
   cd video-consumer
   npm install
   npm start
   ```

## Updating Your Frontend

After deploying the backend on a VM, you'll need to update your frontend to use the new backend URL:

1. Create a file called `env.js` in your frontend-app directory:
   ```javascript
   // env.js
   const API_BASE_URL = 'http://YOUR_VM_IP:3001';
   ```

2. Make sure this file is loaded before `config.js` in your HTML files

## Setting Up Proper AWS Credentials

Your VM-hosted backend needs AWS credentials with these permissions:

- S3 full access
- ECS full access
- EC2 access for network configuration

Ensure your AWS credentials are correctly set up in the application configuration page once deployed.

## Monitoring Your Transcoding Jobs

With a traditional deployment:

1. Your backend will actually launch ECS tasks
2. Tasks will show up in your AWS ECS console
3. Real transcoding will occur on the ECS cluster
4. Job status will update based on actual task status

## Troubleshooting Tips

- If tasks don't start, check your AWS credentials and permissions
- Verify VPC, subnet, and security group settings are correct
- Check that your ECS task definition exists and is properly configured
- Monitor backend logs by SSH'ing into your VM and checking `npm logs` 