#!/bin/bash
# Start OpenCode Server with fixed password for Nezha integration
# Usage: ./start-opencode-server.sh

# Password for Nezha to connect
export OPENCODE_SERVER_PASSWORD="nezha-secret"
export OPENCODE_SERVER_USERNAME="opencode"

# Port (same as OpenCode Desktop default)
PORT=56795

echo "=========================================="
echo "OpenCode Server Startup Script"
echo "=========================================="
echo ""

# Kill existing OpenCode processes
echo "Checking for existing OpenCode processes..."
EXISTING_PIDS=$(pgrep -f "opencode serve" 2>/dev/null)

if [ -n "$EXISTING_PIDS" ]; then
    echo "Found existing OpenCode processes:"
    echo "$EXISTING_PIDS" | while read pid; do
        ps -p "$pid" -o pid,etime,command 2>/dev/null || true
    done
    echo ""
    echo "Stopping existing processes..."
    kill -TERM $EXISTING_PIDS 2>/dev/null || true
    sleep 2
    
    # Force kill if still running
    REMAINING=$(pgrep -f "opencode serve" 2>/dev/null)
    if [ -n "$REMAINING" ]; then
        echo "Force killing remaining processes..."
        kill -9 $REMAINING 2>/dev/null || true
        sleep 1
    fi
    echo "✓ Old processes stopped"
else
    echo "✓ No existing processes found"
fi

echo ""
echo "Starting OpenCode Server on port $PORT..."
echo "Username: $OPENCODE_SERVER_USERNAME"
echo "Password: $OPENCODE_SERVER_PASSWORD"
echo ""
echo "Nezha will use these credentials to send reminders."
echo ""

# Check if port is available
if lsof -i :$PORT >/dev/null 2>&1; then
    echo "⚠️  Warning: Port $PORT is still in use!"
    echo "Processes using port $PORT:"
    lsof -i :$PORT
    echo ""
    echo "Please manually stop these processes and try again."
    exit 1
fi

echo "=========================================="
echo "Starting server..."
echo "=========================================="
echo ""

# Start OpenCode Server
exec opencode serve --hostname 127.0.0.1 --port $PORT
