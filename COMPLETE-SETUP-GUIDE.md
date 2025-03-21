# Complete Setup Guide: Video Processing System

This comprehensive guide covers everything you need to set up the Video Processing System with:
- Frontend deployed on Vercel
- Backend running on AWS EC2

## Table of Contents
1. [System Architecture Overview](#system-architecture-overview)
2. [EC2 Backend Setup](#ec2-backend-setup)
3. [Vercel Frontend Setup](#vercel-frontend-setup)
4. [HTTPS Configuration](#https-configuration)
5. [Mixed Content Workaround](#mixed-content-workaround)
6. [Managing EC2 Costs](#managing-ec2-costs)
7. [Troubleshooting](#troubleshooting)

## System Architecture Overview

The Video Processing System consists of:

- **Frontend**: HTML/CSS/JavaScript applications hosted on Vercel
- **Backend**: Node.js Express server running on EC2
- **Storage**: AWS S3 for video storage
- **Processing**: Backend server handles video transcoding tasks

## EC2 Backend Setup

### Step 1: Launch an EC2 Instance

1. Log in to AWS Console and go to EC2 dashboard
2. Click "Launch Instance"
3. Choose Amazon Linux 2023 AMI
4. Select t2.micro for free tier eligibility
5. Configure security groups:
   - Allow SSH (port 22)
   - Allow HTTP (port 80)
   - Allow HTTPS (port 443)
   - Allow Custom TCP (port 3001)
6. Launch instance and download key pair

### Step 2: Connect to Your EC2 Instance

```bash
chmod 400 your-key.pem
ssh -i your-key.pem ec2-user@YOUR_EC2_IP
```

### Step 3: Install Required Software

```bash
# Update system packages
sudo dnf update -y

# Install Node.js
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo dnf install -y nodejs git

# Install PM2 for process management
sudo npm install pm2 -g

# Clone the repository
git clone https://github.com/devinllc/video-consumer.git
cd video-consumer

# Install dependencies
npm install
```

### Step 4: Create Environment Configuration

Create `.env` file:

```bash
cat > .env << 'EOF'
AWS_REGION=your-region
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
S3_BUCKET_NAME=your-bucket-name
PORT=3001
NODE_ENV=production
EOF
```

### Step 5: Start the Backend Server

```bash
# Start the server with PM2
pm2 start src/index.js --name video-backend

# Ensure it starts on reboot
pm2 startup
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u ec2-user --hp /home/ec2-user
pm2 save

# Check the status
pm2 status
```

Test your backend is running:
```bash
curl http://localhost:3001/health
```

## Vercel Frontend Setup

### Step 1: Update the Frontend Configuration

1. Update the `frontend-app/env.js` file to point to your EC2 instance:

```javascript
// Environment configuration for video-consumer app
const API_BASE_URL = 'http://YOUR_EC2_IP:3001';

// Don't modify below this line
console.log('Environment loaded:', API_BASE_URL);
```

2. Push these changes to your GitHub repository:

```bash
git add frontend-app/env.js
git commit -m "Update API base URL to EC2 instance"
git push origin main
```

### Step 2: Deploy Frontend to Vercel

1. Log in to Vercel and create a new project
2. Connect to your GitHub repository
3. Configure the project:
   - Root Directory: `frontend-app`
   - Build Command: (leave blank)
   - Output Directory: (leave blank)
4. Deploy the project

## HTTPS Configuration

To fix mixed content errors (HTTPS frontend calling HTTP backend), you need to set up HTTPS on your EC2 instance.

### Option 1: Set Up HTTPS with Nginx and Let's Encrypt

#### Prerequisites:
- Domain name pointed to your EC2 IP (e.g., api.yourdomain.com → YOUR_EC2_IP)
- EC2 instance with ports 80 and 443 open in security group

#### Install Nginx and Certbot

```bash
# Connect to EC2
ssh -i your-key.pem ec2-user@YOUR_EC2_IP
sudo su -

# Install Nginx
dnf install nginx -y

# Start and enable Nginx
systemctl start nginx
systemctl enable nginx

# Install Certbot
dnf install certbot python3-certbot-nginx -y
```

#### Configure Nginx as a Proxy

```bash
# Create Nginx configuration
cat > /etc/nginx/conf.d/video-backend.conf << 'EOF'
server {
    listen 80;
    server_name api.yourdomain.com;  # Replace with your actual domain

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

# Test and reload Nginx
nginx -t
systemctl reload nginx
```

#### Set Up SSL with Let's Encrypt

```bash
# Get SSL certificate
certbot --nginx -d api.yourdomain.com

# This will:
# 1. Obtain a certificate
# 2. Configure Nginx to use it
# 3. Set up auto-renewal
```

#### Update Your Frontend Configuration

Update `frontend-app/env.js` file:

```javascript
// Environment configuration for video-consumer app
const API_BASE_URL = 'https://api.yourdomain.com';  // HTTPS domain instead of IP

// Don't modify below this line
console.log('Environment loaded:', API_BASE_URL);
```

### Option 2: Use a Reverse Proxy Service (Quick Solution)

If you don't have a domain, you can use ngrok:

```bash
# Install ngrok
wget https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-linux-amd64.tgz
tar xvzf ngrok-v3-stable-linux-amd64.tgz
./ngrok config add-authtoken YOUR_AUTH_TOKEN

# Create a service for ngrok
cat > /etc/systemd/system/ngrok.service << 'EOF'
[Unit]
Description=ngrok
After=network.target

[Service]
ExecStart=/root/ngrok http 3001
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# Enable and start ngrok
systemctl enable ngrok
systemctl start ngrok

# Get your HTTPS URL
curl http://localhost:4040/api/tunnels | jq -r .tunnels[0].public_url
```

Then update your frontend env.js with the ngrok HTTPS URL.

## Mixed Content Workaround

If you can't set up HTTPS immediately, you can use a Content Security Policy workaround. This tells browsers to upgrade HTTP requests to HTTPS.

Add this meta tag to all frontend HTML files:

```html
<head>
  <!-- Add this line -->
  <meta http-equiv="Content-Security-Policy" content="upgrade-insecure-requests">
  
  <!-- Existing content -->
</head>
```

This has already been added to:
- frontend-app/index.html
- frontend-app/config.html
- frontend-app/quick-fix.html (test page)

## Managing EC2 Costs

### Manual Management

To save costs when not using the service:

1. **Stop the instance** through AWS Console:
   - EC2 Dashboard → Instances
   - Select your instance
   - Click "Instance state" → "Stop instance"

2. **Start the instance** when needed:
   - EC2 Dashboard → Instances
   - Select your instance
   - Click "Instance state" → "Start instance"

3. **Remember**: IP address will change when restarted unless you use an Elastic IP.

### Using AWS CLI

If you have AWS CLI configured:

```bash
# Stop the instance
aws ec2 stop-instances --instance-ids i-1234567890abcdef0

# Start the instance
aws ec2 start-instances --instance-ids i-1234567890abcdef0

# Get the new public IP address
aws ec2 describe-instances --instance-ids i-1234567890abcdef0 --query "Reservations[0].Instances[0].PublicIpAddress" --output text
```

### Using Elastic IP (Optional)

To keep the same IP address even after stopping/starting:

1. EC2 Dashboard → Elastic IPs
2. Click "Allocate Elastic IP address"
3. Select the new EIP and click "Associate"
4. Choose your instance
5. Click "Associate"

**Note**: There's no charge for an Elastic IP as long as it's associated with a running instance.

## Troubleshooting

### Mixed Content Errors

If you see errors like:
```
Mixed Content: The page at 'https://video-consumer-frontend.vercel.app/config.html' was loaded over HTTPS, but requested an insecure resource 'http://13.201.186.249:3001/api/config'. This request has been blocked; the content must be served over HTTPS.
```

1. Verify the `<meta http-equiv="Content-Security-Policy" content="upgrade-insecure-requests">` tag is present in your HTML files
2. Try using the quick-fix.html page to test if the backend is accessible
3. Implement one of the HTTPS solutions above

### AWS Configuration Issues

If the S3 connection test fails:

1. Verify your AWS credentials are correct
2. Make sure the region format is valid (e.g., "us-east-1")
3. Check that the S3 bucket exists and is accessible
4. Verify IAM permissions allow S3 access

### EC2 Connection Issues

If the frontend can't connect to the backend:

1. Verify EC2 is running
2. Check security group allows traffic on port 3001
3. Make sure the API_BASE_URL in env.js points to the correct IP/domain
4. Try accessing the API directly using curl or Postman

### Transcoding Issues

If video transcoding fails:

1. Make sure AWS credentials have appropriate permissions
2. Check disk space on EC2 (transcoding requires temporary storage)
3. Verify the Node.js application has necessary permissions
4. Check logs: `pm2 logs video-backend`

## Additional Resources

- [AWS EC2 Documentation](https://docs.aws.amazon.com/ec2/)
- [Let's Encrypt Documentation](https://letsencrypt.org/docs/)
- [Nginx Documentation](https://nginx.org/en/docs/)
- [PM2 Documentation](https://pm2.keymetrics.io/docs/usage/quick-start/) 