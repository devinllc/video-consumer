// Environment configuration for video-consumer app
// Replace the EC2_IP_ADDRESS with your actual EC2 instance public IP
const API_BASE_URL = 'http://EC2_IP_ADDRESS:3001';

// Uncomment the line below when deploying to production with HTTPS:
// const API_BASE_URL = 'https://your-ec2-domain.com';

// Don't modify below this line
console.log('Environment loaded:', API_BASE_URL); 
