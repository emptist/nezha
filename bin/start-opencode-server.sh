#!/bin/bash
# Start OpenCode Server with fixed password for Nezha integration
# Usage: ./start-opencode-server.sh [PORT]

# Password for Nezha to connect
export OPENCODE_SERVER_PASSWORD="nezha-secret"
export OPENCODE_SERVER_USERNAME="opencode"

# Port: Use env var, then arg, then OpenCode config, then default
detect_opencode_port() {
    # Check NEZHA_OPENCODE_PORT env var first
    if [ -n "$NEZHA_OPENCODE_PORT" ]; then
        echo "$NEZHA_OPENCODE_PORT"
        return
    fi
    
    # Check OpenCode config files
    for config_path in "$HOME/.config/opencode/config.yaml" "$HOME/.config/opencode/config.yml" "$HOME/.opencode.yaml"; do
        if [ -f "$config_path" ]; then
            local port=$(grep -E "port:\s*[0-9]+" "$config_path" | head -1 | grep -oE "[0-9]+")
            if [ -n "$port" ]; then
                echo "$port"
                return
            fi
        fi
    done
    
    # Default port (Nezha-managed OpenCode server)
    echo "4096"
}

# Use provided port, or detect
if [ -n "$1" ]; then
    PORT="$1"
else
    PORT=$(detect_opencode_port)
fi

# Export for Nezha to use
export NEZHA_OPENCODE_PORT="$PORT"

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
