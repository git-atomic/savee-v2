# 🚀 Deployment Guide

## Overview

This project has three components:
1. **Web App** (`apps/web`) - Next.js frontend → Deploy to **Netlify**
2. **CMS** (`apps/cms`) - Payload CMS → Deploy to **Vercel** or **Railway**
3. **Worker** (`apps/worker`) - Python scraper → Deploy to **Railway**, **Render**, or **VPS**

---

## 📱 Web App Deployment (Netlify)

### Prerequisites
- Netlify account
- GitHub repository connected

### Steps

1. **Connect Repository to Netlify**
   - Go to [Netlify Dashboard](https://app.netlify.com)
   - Click "Add new site" → "Import an existing project"
   - Connect your GitHub repository
   - Select the repository and branch (`feat/web` or `main`)

2. **Configure Build Settings**
   - **Base directory**: `apps/web`
   - **Build command**: `npm install && npm run build`
   - **Publish directory**: `apps/web/.next`
   - **Node version**: `20` (set in Netlify dashboard → Site settings → Build & deploy → Environment)

3. **Set Environment Variables**
   In Netlify Dashboard → Site settings → Environment variables, add:
   ```
   NODE_ENV=production
   NEXT_PUBLIC_CMS_URL=https://your-cms-url.com
   CMS_URL=https://your-cms-url.com
   ```

4. **Deploy**
   - Netlify will automatically deploy on push
   - Or trigger manually from the dashboard

### Netlify Configuration
The `netlify.toml` file is already configured at the root. Make sure:
- Base directory is set to `apps/web`
- Next.js plugin is installed (Netlify will suggest it)

---

## 🗄️ CMS Deployment (Vercel/Railway)

### Option 1: Vercel (Recommended for Next.js)

1. **Connect Repository**
   - Go to [Vercel Dashboard](https://vercel.com)
   - Import your repository
   - Set root directory to `apps/cms`

2. **Configure Build**
   - Framework: Next.js
   - Build command: `npm run build`
   - Output directory: `.next`

3. **Environment Variables**
   ```
   DATABASE_URI=your-neon-postgres-url
   PAYLOAD_SECRET=your-secret-key
   NODE_ENV=production
   ```

### Option 2: Railway

1. Create new project on Railway
2. Connect GitHub repository
3. Add PostgreSQL service (or use Neon)
4. Set root directory to `apps/cms`
5. Add environment variables

---

## 🤖 Worker Deployment

The Python worker needs to run continuously. Options:

### Option 1: Railway (Easiest)

1. **Create New Service**
   - Add new service → GitHub repo
   - Set root directory to `apps/worker`

2. **Configure**
   - **Start command**: `python -m app.cli run --source-id <id>`
   - Or use a script that runs continuously

3. **Environment Variables**
   ```
   DATABASE_URL=your-postgres-url
   R2_ENDPOINT_URL=https://your-account.r2.cloudflarestorage.com
   R2_BUCKET_NAME=your-bucket
   R2_ACCESS_KEY_ID=your-key
   R2_SECRET_ACCESS_KEY=your-secret
   ```

4. **Deploy**
   - Railway will auto-deploy on push
   - Service runs continuously

### Option 2: Render

1. Create new **Background Worker**
2. Connect GitHub repo
3. Set root directory to `apps/worker`
4. Build command: `pip install -r requirements.txt`
5. Start command: `python -m app.cli run --source-id <id>`
6. Add environment variables

### Option 3: VPS (DigitalOcean, AWS EC2, etc.)

1. **SSH into server**
2. **Install dependencies**:
   ```bash
   sudo apt update
   sudo apt install python3.11 python3-pip postgresql-client
   ```

3. **Clone repository**:
   ```bash
   git clone your-repo-url
   cd scrapesavee/apps/worker
   pip install -r requirements.txt
   ```

4. **Set up systemd service**:
   Create `/etc/systemd/system/scrapesavee-worker.service`:
   ```ini
   [Unit]
   Description=ScrapeSavee Worker
   After=network.target

   [Service]
   Type=simple
   User=your-user
   WorkingDirectory=/path/to/scrapesavee/apps/worker
   Environment="DATABASE_URL=your-db-url"
   Environment="R2_ENDPOINT_URL=your-r2-url"
   Environment="R2_BUCKET_NAME=your-bucket"
   Environment="R2_ACCESS_KEY_ID=your-key"
   Environment="R2_SECRET_ACCESS_KEY=your-secret"
   ExecStart=/usr/bin/python3 -m app.cli run --source-id <id>
   Restart=always

   [Install]
   WantedBy=multi-user.target
   ```

5. **Start service**:
   ```bash
   sudo systemctl enable scrapesavee-worker
   sudo systemctl start scrapesavee-worker
   sudo systemctl status scrapesavee-worker
   ```

### Option 4: Docker (Any Platform)

1. **Create Dockerfile** in `apps/worker/`:
   ```dockerfile
   FROM python:3.11-slim
   WORKDIR /app
   COPY requirements.txt .
   RUN pip install --no-cache-dir -r requirements.txt
   COPY . .
   CMD ["python", "-m", "app.cli", "run", "--source-id", "1"]
   ```

2. **Deploy to**:
   - Railway (supports Docker)
   - Render (supports Docker)
   - Fly.io
   - Any Docker host

---

## 🔗 Connecting Services

### Update Environment Variables

After deploying each service, update:

1. **Web App** (Netlify):
   - `NEXT_PUBLIC_CMS_URL` = Your CMS URL
   - `CMS_URL` = Your CMS URL (for server-side)

2. **CMS** (Vercel/Railway):
   - `DATABASE_URI` = Your Neon PostgreSQL URL
   - `PAYLOAD_SECRET` = Random secret key

3. **Worker** (Railway/Render/VPS):
   - `DATABASE_URL` = Same Neon PostgreSQL URL
   - R2 credentials from Cloudflare

---

## ✅ Post-Deployment Checklist

- [ ] Web app accessible at Netlify URL
- [ ] CMS admin accessible at Vercel/Railway URL
- [ ] Worker running and processing jobs
- [ ] Database connections working
- [ ] R2 storage accessible
- [ ] Environment variables set correctly
- [ ] CORS configured (if needed)
- [ ] SSL certificates active (automatic on Netlify/Vercel)

---

## 🐛 Troubleshooting

### Web App Issues
- **Build fails**: Check Node version (should be 20)
- **API errors**: Verify `CMS_URL` environment variable
- **404 errors**: Check Next.js routing configuration

### Worker Issues
- **Connection errors**: Verify database URL and credentials
- **R2 upload fails**: Check R2 credentials and bucket permissions
- **Worker stops**: Check logs, ensure it's set to restart on failure

### Database Issues
- **Connection timeout**: Check Neon connection pooling settings
- **SSL required**: Add `?sslmode=require` to database URL

---

## 📊 Monitoring

- **Netlify**: Built-in analytics and logs
- **Vercel**: Built-in analytics
- **Railway**: Logs and metrics dashboard
- **Worker**: Check logs in deployment platform

---

**Need help?** Check the main README.md for more details.
