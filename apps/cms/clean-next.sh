#!/bin/bash
# Clean Next.js build directory
# Stop the dev server first, then run this script

echo "Cleaning .next directory..."

# Try to remove .next directory
if [ -d ".next" ]; then
  rm -rf .next
  echo "✓ .next directory removed"
else
  echo "✓ .next directory doesn't exist"
fi

echo "Done! Now run 'npm run dev' to regenerate the build files."
