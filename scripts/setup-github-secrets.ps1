# Bulk import GitHub Secrets from .env file (PowerShell version for Windows)
# Usage: .\scripts\setup-github-secrets.ps1 [.env-file]

param(
    [string]$EnvFile = ".env"
)

$ErrorActionPreference = "Stop"

Write-Host "GitHub Secrets Bulk Import" -ForegroundColor Green
Write-Host "================================" -ForegroundColor Green
Write-Host ""

# Check if gh CLI is installed
try {
    $null = Get-Command gh -ErrorAction Stop
} catch {
    Write-Host "Error: GitHub CLI (gh) is not installed." -ForegroundColor Red
    Write-Host "Install it from: https://cli.github.com/" -ForegroundColor Yellow
    Write-Host "Or run: winget install GitHub.cli" -ForegroundColor Yellow
    exit 1
}

# Check if authenticated
try {
    $null = gh auth status 2>&1
} catch {
    Write-Host "Not authenticated with GitHub. Please run: gh auth login" -ForegroundColor Yellow
    exit 1
}

# Get repository name
try {
    $remoteUrl = git remote get-url origin
    if ($remoteUrl -match 'github\.com[:/]([^/]+/[^/]+)') {
        $repo = $matches[1] -replace '\.git$', ''
    } else {
        throw "Could not parse repository URL"
    }
} catch {
    Write-Host "Error: Could not determine repository. Make sure you're in a git repository." -ForegroundColor Red
    exit 1
}

Write-Host "Repository: $repo" -ForegroundColor Green
Write-Host ""

# Check if .env file exists
if (Test-Path $EnvFile) {
    Write-Host "Reading secrets from: $EnvFile" -ForegroundColor Green
    Write-Host ""
    
    $secrets = @{}
    $lines = Get-Content $EnvFile
    
    foreach ($line in $lines) {
        # Skip empty lines and comments
        if ([string]::IsNullOrWhiteSpace($line) -or $line.TrimStart().StartsWith('#')) {
            continue
        }
        
        # Parse KEY=value
        if ($line -match '^([^=]+)=(.*)$') {
            $key = $matches[1].Trim()
            $value = $matches[2].Trim()
            
            # Remove quotes if present
            if ($value -match "^['""](.*)['""]$") {
                $value = $matches[1]
            }
            
            # Skip if value is empty
            if ([string]::IsNullOrWhiteSpace($value)) {
                continue
            }
            
            # Only process recognized secrets
            $recognizedPrefixes = @(
                'DATABASE_URL', 'R2_', 'CMS_URL', 'ENGINE_MONITOR_TOKEN',
                'COOKIES_JSON', 'SEED_URL', 'JOB_CONCURRENCY', 'ITEM_CONCURRENCY',
                'PAYLOAD_SECRET', 'NEXT_PUBLIC_'
            )
            
            $isRecognized = $false
            foreach ($prefix in $recognizedPrefixes) {
                if ($key -like "$prefix*") {
                    $isRecognized = $true
                    break
                }
            }
            
            if ($isRecognized) {
                Write-Host "Setting secret: $key" -ForegroundColor Yellow
                $value | gh secret set $key --repo $repo
                if ($LASTEXITCODE -eq 0) {
                    Write-Host "✓ $key set successfully" -ForegroundColor Green
                } else {
                    Write-Host "✗ Failed to set $key" -ForegroundColor Red
                }
            } else {
                Write-Host "Skipping $key (not a recognized secret)" -ForegroundColor Yellow
            }
        }
    }
    
    Write-Host ""
    Write-Host "All secrets imported successfully!" -ForegroundColor Green
} else {
    Write-Host "No .env file found at: $EnvFile" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "You can either:"
    Write-Host "1. Create a .env file with your secrets (one per line: KEY=value)"
    Write-Host "2. Or set secrets manually using: gh secret set SECRET_NAME --repo $repo"
    Write-Host ""
    Write-Host "Required secrets based on your workflows:"
    Write-Host "  - DATABASE_URL"
    Write-Host "  - R2_ENDPOINT_URL"
    Write-Host "  - R2_BUCKET_NAME"
    Write-Host "  - R2_ACCESS_KEY_ID"
    Write-Host "  - R2_SECRET_ACCESS_KEY"
    Write-Host "  - CMS_URL (optional)"
    Write-Host "  - ENGINE_MONITOR_TOKEN (optional)"
    exit 1
}
