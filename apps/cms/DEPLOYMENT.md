# Free Serverless Deployment Guide

This project is designed to run entirely on free tier services with no server costs.

## Architecture

- **CMS/API**: Netlify or Vercel (free tier)
- **Database**: Neon Postgres (free tier - 0.5GB storage)
- **Storage**: Cloudflare R2 (free tier - 10GB storage, 1M Class A operations/month)
- **Worker**: GitHub Actions (free tier - 2000 minutes/month)
- **Scheduler**: GitHub Actions cron (free)

## Setup Steps

### 1. Database (Neon)

1. Sign up at https://neon.tech
2. Create a new project
3. Copy the connection string (starts with `postgresql://`)
4. Set as `DATABASE_URL` secret

### 2. Storage (Cloudflare R2)

1. Sign up at https://cloudflare.com
2. Go to R2 → Create bucket
3. Create API token with R2 read/write permissions
4. Set secrets:
   - `R2_ENDPOINT_URL`: `https://<account-id>.r2.cloudflarestorage.com`
   - `R2_ACCESS_KEY_ID`: Your access key
   - `R2_SECRET_ACCESS_KEY`: Your secret key
   - `R2_BUCKET_NAME`: Your bucket name

### 3. GitHub Secrets

Add these secrets to your GitHub repository:

**Required:**
- `DATABASE_URL`: Neon Postgres connection string
- `R2_ENDPOINT_URL`: Cloudflare R2 endpoint
- `R2_ACCESS_KEY_ID`: R2 access key
- `R2_SECRET_ACCESS_KEY`: R2 secret key
- `R2_BUCKET_NAME`: R2 bucket name
- `CMS_URL`: Your deployed CMS URL (e.g., `https://your-app.netlify.app`)
- `ENGINE_MONITOR_TOKEN`: Random secure token for API auth

**Optional:**
- `COOKIES_JSON`: Savee.com cookies (for authenticated scraping)
- `SEED_URL`: Initial URL to scrape (e.g., `https://savee.it/`)
- `JOB_CONCURRENCY`: Number of concurrent jobs (default: 2)
- `ITEM_CONCURRENCY`: Number of concurrent items (default: 8)

### 4. Deploy CMS

#### Option A: Netlify

1. Connect your GitHub repo to Netlify
2. Set build command: `cd apps/cms && npm install && npm run build`
3. Set publish directory: `apps/cms/.next`
4. Add environment variables (same as GitHub secrets)
5. Deploy

#### Option B: Vercel

1. Import your GitHub repo to Vercel
2. Set root directory: `apps/cms`
3. Add environment variables
4. Deploy

### 5. Run Database Migrations

After first deployment, run migrations:

```bash
cd apps/worker
alembic upgrade head
```

Or set up a one-time migration job in GitHub Actions.

### 6. Verify

1. Check GitHub Actions → Monitor workflow runs every 2 minutes
2. Visit your CMS URL → `/admin/engine/jobs`
3. Add a job and verify it runs

## Cost Breakdown

- **Neon**: Free (0.5GB storage, shared CPU)
- **Cloudflare R2**: Free (10GB storage, 1M operations/month)
- **Netlify/Vercel**: Free (100GB bandwidth, 100 hours build time/month)
- **GitHub Actions**: Free (2000 minutes/month)

**Total: $0/month** 🎉

## Limitations

- GitHub Actions: 2000 minutes/month (~33 hours)
- Neon: 0.5GB database storage
- R2: 10GB storage, 1M operations/month
- Netlify/Vercel: 100GB bandwidth/month

For production scale, consider upgrading to paid tiers as needed.

## Monitoring

- Logs are stored in `job_logs` table (persistent)
- View logs in CMS UI by expanding job cards
- GitHub Actions logs show worker execution

## Troubleshooting

**Worker not running:**
- Check GitHub Actions → Monitor workflow
- Verify secrets are set correctly
- Check `CMS_URL` points to your deployed CMS

**Logs not showing:**
- Ensure database migration ran (`job_logs` table exists)
- Check browser console for errors
- Verify `ENGINE_MONITOR_TOKEN` matches in both places

**Database connection errors:**
- Verify `DATABASE_URL` is correct
- Check Neon dashboard for connection limits
- Ensure IP allowlist allows connections (if enabled)
