# Bulk Import GitHub Secrets

Instead of adding GitHub secrets one by one through the web UI, you can bulk import them using the GitHub CLI.

## Prerequisites

1. **Install GitHub CLI**: 
   - Windows: `winget install GitHub.cli` or download from https://cli.github.com/
   - macOS: `brew install gh`
   - Linux: See https://cli.github.com/manual/installation

2. **Authenticate with GitHub**:
   ```bash
   gh auth login
   ```

## Method 1: Using the Script (Recommended)

### Step 1: Create a `.env` file

Create a `.env` file in your project root with your secrets (this file should be in `.gitignore`):

```env
DATABASE_URL=postgresql://user:pass@host/dbname
R2_ENDPOINT_URL=https://your-account.r2.cloudflarestorage.com
R2_BUCKET_NAME=your-bucket-name
R2_ACCESS_KEY_ID=your-access-key
R2_SECRET_ACCESS_KEY=your-secret-key
CMS_URL=https://your-cms.netlify.app
ENGINE_MONITOR_TOKEN=your-random-token
```

### Step 2: Run the script

**On Windows (PowerShell):**
```powershell
.\scripts\setup-github-secrets.ps1
```

**On macOS/Linux (Bash):**
```bash
chmod +x scripts/setup-github-secrets.sh
./scripts/setup-github-secrets.sh
```

The script will:
- Read all secrets from your `.env` file
- Filter for recognized secret names (DATABASE_URL, R2_*, CMS_URL, etc.)
- Add them to your GitHub repository secrets automatically

## Method 2: Manual GitHub CLI Commands

If you prefer to set secrets manually one at a time:

```bash
# Get your repository name (format: owner/repo)
REPO=$(git remote get-url origin | sed -E 's/.*github.com[:/]([^/]+\/[^/]+)(\.git)?$/\1/')

# Set each secret
echo "your-database-url" | gh secret set DATABASE_URL --repo $REPO
echo "your-r2-endpoint" | gh secret set R2_ENDPOINT_URL --repo $REPO
echo "your-bucket-name" | gh secret set R2_BUCKET_NAME --repo $REPO
echo "your-access-key" | gh secret set R2_ACCESS_KEY_ID --repo $REPO
echo "your-secret-key" | gh secret set R2_SECRET_ACCESS_KEY --repo $REPO
```

## Method 3: Using GitHub API (Advanced)

You can also use the GitHub API directly, but it requires encrypting secrets with the repository's public key. The GitHub CLI handles this automatically, so Method 1 or 2 is recommended.

## Required Secrets

Based on your workflows, you need these secrets:

**Required:**
- `DATABASE_URL` - Neon Postgres connection string
- `R2_ENDPOINT_URL` - Cloudflare R2 endpoint
- `R2_BUCKET_NAME` - R2 bucket name
- `R2_ACCESS_KEY_ID` - R2 access key
- `R2_SECRET_ACCESS_KEY` - R2 secret key

**Optional:**
- `CMS_URL` - Your deployed CMS URL
- `ENGINE_MONITOR_TOKEN` - Random secure token for API auth
- `COOKIES_JSON` - Savee.com cookies (for authenticated scraping)
- `SEED_URL` - Initial URL to scrape
- `JOB_CONCURRENCY` - Number of concurrent jobs (default: 2)
- `ITEM_CONCURRENCY` - Number of concurrent items (default: 8)

## Security Notes

- ⚠️ **Never commit your `.env` file to git** - it should be in `.gitignore`
- The script only processes secrets with recognized prefixes for safety
- GitHub secrets are encrypted and only accessible to workflows
- You can view/list secrets using: `gh secret list --repo owner/repo`

## Troubleshooting

**"gh: command not found"**
- Install GitHub CLI from https://cli.github.com/

**"Not authenticated"**
- Run `gh auth login` and follow the prompts

**"Could not determine repository"**
- Make sure you're in a git repository with a GitHub remote
- Check with: `git remote -v`

**Secrets not showing in GitHub**
- Wait a few seconds and refresh the GitHub Secrets page
- Verify with: `gh secret list --repo owner/repo`
