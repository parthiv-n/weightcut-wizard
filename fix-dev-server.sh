#!/bin/bash

echo "🔧 Fixing Development Server Issues"
echo "=================================="

# Step 1: Fix .env file permissions if it exists
if [ -f ".env" ]; then
    echo "📝 Fixing .env file permissions..."
    chmod 644 .env
    echo "✅ .env permissions fixed"
else
    echo "ℹ️  No .env file found (this is okay)"
fi

# Step 2: Clear all caches
echo "🧹 Clearing caches..."
rm -rf node_modules/.vite
rm -rf dist
rm -rf .vite
echo "✅ Caches cleared"

# Step 3: Kill any existing vite processes
echo "🔄 Stopping existing processes..."
pkill -f "vite" 2>/dev/null || echo "No vite processes found"

# Step 4: Try to start the dev server
echo "🚀 Starting development server..."
npm run dev

echo "✅ Development server should now be running!"
echo "If you still see syntax errors, try:"
echo "1. Restart your VS Code/Cursor"
echo "2. Run: npm install"
echo "3. Check for any TypeScript errors in the editor"

