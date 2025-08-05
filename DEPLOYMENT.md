# MetaMate Deployment Guide

## Overview
This guide will help you deploy MetaMate to production:
- **Backend**: Deploy to Railway (supports WebSocket)
- **Frontend**: Deploy to Vercel

## Step 1: Deploy Backend to Railway

### 1.1 Prepare Backend
1. Create a GitHub repository and push your code
2. Make sure your backend folder structure is correct

### 1.2 Deploy to Railway
1. Go to [Railway.app](https://railway.app)
2. Sign up/Login with GitHub
3. Click "New Project" → "Deploy from GitHub repo"
4. Select your repository
5. Set the root directory to `backend`
6. Railway will automatically detect it's a Node.js app

### 1.3 Configure Environment Variables
In Railway dashboard, add these environment variables:
```
NODE_ENV=production
FRONTEND_URL=https://your-vercel-app.vercel.app
```

### 1.4 Get Backend URL
After deployment, Railway will provide a URL like:
`https://your-app-name.railway.app`

## Step 2: Deploy Frontend to Vercel

### 2.1 Prepare Frontend
1. Make sure your code is pushed to GitHub
2. The frontend should be in the `frontend` folder

### 2.2 Deploy to Vercel
1. Go to [Vercel.com](https://vercel.com)
2. Sign up/Login with GitHub
3. Click "New Project"
4. Import your GitHub repository
5. Configure the project:
   - **Framework Preset**: Create React App
   - **Root Directory**: `frontend`
   - **Build Command**: `npm run build`
   - **Output Directory**: `build`

### 2.3 Configure Environment Variables
In Vercel dashboard, add these environment variables:
```
REACT_APP_BACKEND_URL=https://your-app-name.railway.app
REACT_APP_WS_URL=wss://your-app-name.railway.app
```

### 2.4 Deploy
Click "Deploy" and wait for the build to complete.

## Step 3: Test Your Deployment

### 3.1 Test Backend
Visit your Railway URL: `https://your-app-name.railway.app`
You should see: `{"message":"MetaMate Backend API","status":"running"}`

### 3.2 Test Frontend
Visit your Vercel URL and test the video call functionality.

## Troubleshooting

### Common Issues:

1. **CORS Errors**: Make sure `FRONTEND_URL` is set correctly in Railway
2. **WebSocket Connection Failed**: Ensure you're using `wss://` (secure WebSocket) in production
3. **Build Failures**: Check that all dependencies are in `package.json`

### Environment Variables Summary:

**Railway (Backend)**:
- `NODE_ENV=production`
- `FRONTEND_URL=https://your-vercel-app.vercel.app`

**Vercel (Frontend)**:
- `REACT_APP_BACKEND_URL=https://your-app-name.railway.app`
- `REACT_APP_WS_URL=wss://your-app-name.railway.app`

## Alternative Backend Hosting

If Railway doesn't work, you can also use:
- **Render.com**: Supports WebSocket
- **Heroku**: Supports WebSocket (paid)
- **DigitalOcean App Platform**: Supports WebSocket

## Security Notes

1. Update Firebase security rules for production
2. Consider adding rate limiting to your backend
3. Use environment variables for all sensitive data
4. Enable HTTPS for all production URLs 