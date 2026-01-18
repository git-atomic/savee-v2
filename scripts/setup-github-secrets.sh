#!/bin/bash

# Bulk import GitHub Secrets from .env file or environment variables
# Usage: ./scripts/setup-github-secrets.sh [.env-file]

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}GitHub Secrets Bulk Import${NC}"
echo "================================"

# Check if gh CLI is installed
if ! command -v gh &> /dev/null; then
    echo -e "${RED}Error: GitHub CLI (gh) is not installed.${NC}"
    echo "Install it from: https://cli.github.com/"
    echo "Or run: brew install gh (macOS) / winget install GitHub.cli (Windows)"
    exit 1
fi

# Check if authenticated
if ! gh auth status &> /dev/null; then
    echo -e "${YELLOW}Not authenticated with GitHub. Please run: gh auth login${NC}"
    exit 1
fi

# Get repository name (current directory's git remote)
REPO=$(git remote get-url origin 2>/dev/null | sed -E 's/.*github.com[:/]([^/]+\/[^/]+)(\.git)?$/\1/' || echo "")
if [ -z "$REPO" ]; then
    echo -e "${RED}Error: Could not determine repository. Make sure you're in a git repository.${NC}"
    exit 1
fi

echo -e "Repository: ${GREEN}$REPO${NC}"
echo ""

# Determine source of secrets
ENV_FILE="${1:-.env}"
SECRETS_SET=0

# Function to set a secret if value is provided
set_secret_if_exists() {
    local key=$1
    local value=$2
    
    if [ -n "$value" ] && [ "$value" != "" ]; then
        echo -e "Setting secret: ${YELLOW}$key${NC}"
        echo "$value" | gh secret set "$key" --repo "$REPO" 2>&1
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}✓${NC} $key set successfully"
            SECRETS_SET=$((SECRETS_SET + 1))
        else
            echo -e "${RED}✗${NC} Failed to set $key"
        fi
        return 0
    fi
    return 1
}

# Try reading from .env file first
if [ -f "$ENV_FILE" ]; then
    echo -e "Reading secrets from: ${GREEN}$ENV_FILE${NC}"
    echo ""
    
    # Read .env file and set secrets
    while IFS='=' read -r key value || [ -n "$key" ]; do
        # Skip empty lines and comments
        [[ -z "$key" || "$key" =~ ^[[:space:]]*# ]] && continue
        
        # Remove quotes from value if present
        value=$(echo "$value" | sed -E "s/^['\"]|['\"]$//g")
        
        # Skip if value is empty
        [[ -z "$value" ]] && continue
        
        # Only process secrets that start with specific prefixes (for safety)
        if [[ "$key" =~ ^(DATABASE_URL|R2_|CMS_URL|ENGINE_MONITOR_TOKEN|COOKIES_JSON|SEED_URL|JOB_CONCURRENCY|ITEM_CONCURRENCY|PAYLOAD_SECRET|NEXT_PUBLIC_) ]]; then
            set_secret_if_exists "$key" "$value"
        else
            echo -e "${YELLOW}Skipping${NC} $key (not a recognized secret)"
        fi
    done < "$ENV_FILE"
elif [ -n "$DATABASE_URL" ] || [ -n "$R2_ENDPOINT_URL" ]; then
    # Try reading from environment variables
    echo -e "Reading secrets from: ${GREEN}environment variables${NC}"
    echo ""
    
    set_secret_if_exists "DATABASE_URL" "$DATABASE_URL"
    set_secret_if_exists "R2_ENDPOINT_URL" "$R2_ENDPOINT_URL"
    set_secret_if_exists "R2_BUCKET_NAME" "$R2_BUCKET_NAME"
    set_secret_if_exists "R2_ACCESS_KEY_ID" "$R2_ACCESS_KEY_ID"
    set_secret_if_exists "R2_SECRET_ACCESS_KEY" "$R2_SECRET_ACCESS_KEY"
    set_secret_if_exists "CMS_URL" "$CMS_URL"
    set_secret_if_exists "ENGINE_MONITOR_TOKEN" "$ENGINE_MONITOR_TOKEN"
    set_secret_if_exists "COOKIES_JSON" "$COOKIES_JSON"
    set_secret_if_exists "SEED_URL" "$SEED_URL"
    set_secret_if_exists "JOB_CONCURRENCY" "$JOB_CONCURRENCY"
    set_secret_if_exists "ITEM_CONCURRENCY" "$ITEM_CONCURRENCY"
else
    echo -e "${YELLOW}No .env file found and no environment variables set${NC}"
    echo ""
    echo "To bulk import secrets, you can either:"
    echo ""
    echo "1. Create a .env file with your secrets:"
    echo "   DATABASE_URL=postgresql://..."
    echo "   R2_ENDPOINT_URL=https://..."
    echo "   R2_BUCKET_NAME=your-bucket"
    echo "   R2_ACCESS_KEY_ID=your-key"
    echo "   R2_SECRET_ACCESS_KEY=your-secret"
    echo "   Then run: ./scripts/setup-github-secrets.sh"
    echo ""
    echo "2. Export environment variables and run this script:"
    echo "   export DATABASE_URL='postgresql://...'"
    echo "   export R2_ENDPOINT_URL='https://...'"
    echo "   # ... etc"
    echo "   ./scripts/setup-github-secrets.sh"
    echo ""
    echo "3. Set secrets manually:"
    echo "   echo 'value' | gh secret set SECRET_NAME --repo $REPO"
    echo ""
    echo "Required secrets based on your workflows:"
    echo "  - DATABASE_URL"
    echo "  - R2_ENDPOINT_URL"
    echo "  - R2_BUCKET_NAME"
    echo "  - R2_ACCESS_KEY_ID"
    echo "  - R2_SECRET_ACCESS_KEY"
    echo "  - CMS_URL (optional)"
    echo "  - ENGINE_MONITOR_TOKEN (optional)"
    exit 1
fi

if [ $SECRETS_SET -gt 0 ]; then
    echo ""
    echo -e "${GREEN}Successfully set $SECRETS_SET secret(s)!${NC}"
else
    echo ""
    echo -e "${YELLOW}No secrets were set. Please provide values via .env file or environment variables.${NC}"
    exit 1
fi
