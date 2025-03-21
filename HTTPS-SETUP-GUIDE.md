# Setting Up HTTPS for Your EC2 Backend

This guide will help you set up HTTPS on your EC2 instance to fix the "Mixed Content" errors when your Vercel frontend (HTTPS) tries to connect to your EC2 backend (HTTP).

## Understanding the Error

Your browser console shows:
```
Mixed Content: The page at 'https://video-consumer-frontend.vercel.app/config.html' was loaded over HTTPS, but requested an insecure resource 'http://13.201.186.249:3001/api/config'. This request has been blocked; the content must be served over HTTPS.
```

This happens because:
- Your Vercel frontend is running on HTTPS (secure)
- Your EC2 backend is running on HTTP (insecure)
- Modern browsers block secure sites from loading insecure content

## Option 1: Set Up HTTPS on EC2 with Nginx and Let's Encrypt

This is the proper production solution.

### Prerequisites:
- Domain name pointed to your EC2 IP (e.g., api.yourdomain.com → 13.201.186.249)
- EC2 instance with ports 80 and 443 open in security group

### Step 1: Install Nginx and Certbot

```bash
# Connect to EC2
ssh -i your-key.pem ec2-user@13.201.186.249
sudo su -

# Install Nginx
dnf install nginx -y

# Start and enable Nginx
systemctl start nginx
systemctl enable nginx

# Install Certbot
dnf install certbot python3-certbot-nginx -y
```

### Step 2: Configure Nginx as a Proxy

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

### Step 3: Set Up SSL with Let's Encrypt

```bash
# Get SSL certificate
certbot --nginx -d api.yourdomain.com

# This will:
# 1. Obtain a certificate
# 2. Configure Nginx to use it
# 3. Set up auto-renewal
```

### Step 4: Update Your Frontend Configuration

Update your `frontend-app/env.js` file:

```javascript
// Environment configuration for video-consumer app
const API_BASE_URL = 'https://api.yourdomain.com';  // HTTPS domain instead of IP

// Don't modify below this line
console.log('Environment loaded:', API_BASE_URL);
```

## Option 2: Use a Reverse Proxy Service (Quick Solution)

If you don't have a domain, you can use a service like [ngrok](https://ngrok.com/) or [Cloudflare Tunnel](https://www.cloudflare.com/products/tunnel/).

### Using ngrok:

1. Sign up for a free ngrok account
2. On your EC2 instance:

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

3. Update your frontend env.js with the ngrok HTTPS URL

## Option 3: Configure CORS to Allow Insecure Requests (Development Only)

This is a temporary workaround, not recommended for production.

1. In your frontend HTML files, add a `<meta>` tag to allow mixed content:

```html
<head>
  <!-- Add this line -->
  <meta http-equiv="Content-Security-Policy" content="upgrade-insecure-requests">
  
  <!-- Existing content -->
</head>
```

2. This tells browsers to automatically upgrade HTTP requests to HTTPS

## Checking Your Setup

1. After implementing one of the options, push your changes to GitHub
2. Redeploy your Vercel frontend
3. Test the connection again

## Troubleshooting

If you still have issues:

1. **Check browser console** for specific errors
2. **Check CORS settings** on your backend:
   ```javascript
   app.use(cors({
     origin: ['https://video-consumer-frontend.vercel.app', 'http://localhost:3000'],
     methods: ['GET', 'POST', 'PUT', 'DELETE'],
     allowedHeaders: ['Content-Type', 'Authorization'],
     credentials: true  // Add this for cookies/auth if needed
   }));
   ```
3. **Test your API directly** using a tool like Postman
4. **Check Nginx/Certbot logs**:
   ```bash
   journalctl -u nginx
   journalctl -u certbot
   ``` 