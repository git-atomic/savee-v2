# 🚀 Deployment Guide

## Overview

This project has three components:
1. **Web App** (`apps/web`) - Next.js frontend → Deploy to **Netlify**
2. **CMS** (`apps/cms`) - Payload CMS → Deploy to **Netlify**
3. **Worker** (`apps/worker`) - Python scraper → Run on **GitHub Actions**

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

## 🗄️ CMS Deployment (Netlify)

### Steps

1. **Create New Site on Netlify**
   - Go to [Netlify Dashboard](https://app.netlify.com)
   - Click "Add new site" → "Import an existing project"
   - Connect your GitHub repository (same repo as web app)

2. **Configure Build Settings**
   - **Base directory**: `apps/cms`
   - **Build command**: `cd apps/cms && npm install && npm run build`
   - **Publish directory**: `apps/cms/.next`
   - **Node version**: `20` (set in Site settings → Environment)

3. **Set Environment Variables**
   In Netlify Dashboard → Site settings → Environment variables, add:
   ```
   NODE_ENV=production
   DATABASE_URI=your-neon-postgres-url
   PAYLOAD_SECRET=your-secret-key
   ```

4. **Deploy**
   - Netlify will automatically deploy on push
   - Or trigger manually from the dashboard

### Note
You'll have two separate Netlify sites:
- One for `apps/web` (frontend)
- One for `apps/cms` (admin/API)

---

## 🤖 Worker Deployment (GitHub Actions)

The Python worker runs on GitHub Actions, either on a schedule or manually triggered.

### Setup

1. **Add GitHub Secrets**
   Go to your repository → Settings → Secrets and variables → Actions → New repository secret
   
   Add these secrets:
   ```
   DATABASE_URL=your-neon-postgres-url
   R2_ENDPOINT_URL=https://your-account.r2.cloudflarestorage.com
   R2_BUCKET_NAME=your-bucket-name
   R2_ACCESS_KEY_ID=your-r2-access-key
   R2_SECRET_ACCESS_KEY=your-r2-secret-key
   ```

2. **Workflow Configuration**
   The workflow file (`.github/workflows/worker.yml`) is already configured:
   - **Scheduled runs**: Every hour (configurable via cron)
   - **Manual trigger**: Go to Actions → ScrapeSavee Worker → Run workflow
   - **Auto-run on push**: When worker code changes

3. **How It Works**
   - The workflow runs on GitHub's Ubuntu runners
   - Installs Python 3.11 and dependencies
   - Runs the worker with specified source ID
   - Timeout: 60 minutes (adjustable)

4. **Manual Trigger**
   - Go to Actions tab in GitHub
   - Select "ScrapeSavee Worker"
   - Click "Run workflow"
   - Enter the source ID you want to process
   - Click "Run workflow"

### Customizing Schedule

Edit `.github/workflows/worker.yml` to change the cron schedule:
```yaml
schedule:
  - cron: '0 * * * *'  # Every hour
  # Examples:
  # '0 */2 * * *'  # Every 2 hours
  # '0 0 * * *'    # Daily at midnight
  # '*/30 * * * *' # Every 30 minutes
```

### Monitoring

- View runs in the Actions tab
- Check logs for each run
- Failed runs will upload logs as artifacts

---

## 🔗 Connecting Services

### Update Environment Variables

After deploying each service, update:

1. **Web App** (Netlify):
   - `NEXT_PUBLIC_CMS_URL` = Your CMS Netlify URL
   - `CMS_URL` = Your CMS Netlify URL (for server-side)

2. **CMS** (Netlify):
   - `DATABASE_URI` = Your Neon PostgreSQL URL
   - `PAYLOAD_SECRET` = Random secret key (generate with `openssl rand -base64 32`)

3. **Worker** (GitHub Actions):
   - Add all secrets in GitHub repository settings
   - `DATABASE_URL` = Same Neon PostgreSQL URL
   - R2 credentials from Cloudflare dashboard

---

## ✅ Post-Deployment Checklist

- [ ] Web app accessible at Netlify URL
- [ ] CMS admin accessible at Netlify URL (different site)
- [ ] GitHub Actions workflow enabled and running
- [ ] Worker secrets added to GitHub repository
- [ ] Database connections working
- [ ] R2 storage accessible
- [ ] Environment variables set correctly in both Netlify sites
- [ ] CORS configured (if needed)
- [ ] SSL certificates active (automatic on Netlify)

---

## 🐛 Troubleshooting

### Web App Issues
- **Build fails**: Check Node version (should be 20)
- **API errors**: Verify `CMS_URL` environment variable
- **404 errors**: Check Next.js routing configuration

### Worker Issues
- **Workflow not running**: Check GitHub Actions is enabled for the repository
- **Connection errors**: Verify secrets are set correctly in GitHub
- **R2 upload fails**: Check R2 credentials in GitHub secrets
- **Timeout errors**: Increase timeout in workflow file if jobs take longer
- **Manual trigger fails**: Verify source ID exists in database

### Database Issues
- **Connection timeout**: Check Neon connection pooling settings
- **SSL required**: Add `?sslmode=require` to database URL

---

## 📊 Monitoring

- **Netlify**: Built-in analytics and logs for both web and CMS sites
- **GitHub Actions**: View workflow runs, logs, and artifacts in Actions tab
- **Worker Logs**: Check GitHub Actions run logs for each execution
- **Database**: Monitor via Neon dashboard
- **R2 Storage**: Monitor via Cloudflare dashboard

---

**Need help?** Check the main README.md for more details.
