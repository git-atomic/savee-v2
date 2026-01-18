@echo off
REM Clean Next.js build directory for Windows
REM Stop the dev server first, then run this script

echo Cleaning .next directory...

if exist .next (
  rmdir /s /q .next 2>nul
  if exist .next (
    echo Warning: Some files in .next are locked. Please stop the dev server and try again.
  ) else (
    echo .next directory removed successfully
  )
) else (
  echo .next directory doesn't exist
)

echo Done! Now run 'npm run dev' to regenerate the build files.
