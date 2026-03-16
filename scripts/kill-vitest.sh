#!/bin/bash

echo "🔍 Checking for running vitest processes..."

# Find vitest processes
VITEST_PIDS=$(pgrep -f vitest)

if [ -z "$VITEST_PIDS" ]; then
  echo "✅ No vitest processes found"
  exit 0
fi

echo "📋 Found vitest processes:"
echo "$VITEST_PIDS" | while read pid; do
  ps -p "$pid" -o pid,pcpu,pmem,comm | tail -n +2
done

echo ""
echo "🛑 Killing all vitest processes..."
pkill -f vitest

sleep 1

# Verify
REMAINING=$(pgrep -f vitest)
if [ -z "$REMAINING" ]; then
  echo "✅ All vitest processes killed successfully"
else
  echo "⚠️  Some processes still running, forcing kill..."
  pkill -9 -f vitest
  echo "✅ Force killed remaining processes"
fi
