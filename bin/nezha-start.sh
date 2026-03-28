#!/bin/zsh
# nezha-start.sh - Unified startup script for Nezha AI Orchestration System
# Usage: ./bin/nezha-start.sh [--check | --stop | --restart | --status]

set -e

# Configuration - Use environment variables or defaults
NEZHA_DIR="${NEZHA_DIR:-/Users/jk/gits/hub/nezha}"
OPENCODE_PORT="${NEZHA_OPENCODE_PORT:-4096}"
NEZHA_HEALTH_PORT="${NEZHA_HEALTH_PORT:-4097}"
PSQL_PATH="${PSQL_PATH:-/Applications/Postgres.app/Contents/Versions/18/bin/psql}"
PG_CTL_PATH="${PG_CTL_PATH:-/Applications/Postgres.app/Contents/Versions/18/bin/pg_ctl}"
PG_DATA="${PG_DATA:-$HOME/Library/Application Support/Postgres/var-18-2}"
DB_NAME="nezha"
DB_USER="postgres"
DB_HOST="127.0.0.1"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() { echo "${BLUE}[INFO]${NC} $1"; }
log_success() { echo "${GREEN}[OK]${NC} $1"; }
log_warn() { echo "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo "${RED}[ERROR]${NC} $1"; }

check_postgres() {
    if "$PSQL_PATH" -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1" >/dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

start_postgres() {
    log_info "Checking PostgreSQL..."
    if check_postgres; then
        log_success "PostgreSQL is running"
        return 0
    fi
    
    log_info "Starting PostgreSQL..."
    if [ -d "$PG_DATA" ]; then
        "$PG_CTL_PATH" -D "$PG_DATA" -l "$PG_DATA/logfile" start 2>/dev/null || true
        sleep 2
        if check_postgres; then
            log_success "PostgreSQL started"
            return 0
        else
            log_error "Failed to start PostgreSQL"
            return 1
        fi
    else
        log_error "PostgreSQL data directory not found: $PG_DATA"
        return 1
    fi
}

run_migrations() {
    log_info "Running database migrations..."
    
    local output
    output=$("$PSQL_PATH" -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" 2>&1 <<'EOF'
CREATE EXTENSION IF NOT EXISTS uuid-ossp;
CREATE OR REPLACE FUNCTION cleanup_stale_sessions(interval_minutes INTEGER DEFAULT 5)
RETURNS INTEGER AS $$
DECLARE cleaned INTEGER;
BEGIN
    UPDATE agent_sessions SET status = 'dead'
    WHERE status = 'alive' AND last_heartbeat < NOW() - (interval_minutes || ' minutes')::INTERVAL;
    GET DIAGNOSTICS cleaned = ROW_COUNT;
    RETURN cleaned;
END;
$$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION generate_bot_id()
RETURNS VARCHAR(50) AS $$
BEGIN
    RETURN 'bot_' || uuid_generate_v4()::VARCHAR;
END;
$$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION git_branch_name()
RETURNS TEXT AS $$
BEGIN
    RETURN current_setting('app.git_branch', true);
EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%app.git_branch%' THEN
        RETURN NULL;
    END IF;
    RAISE;
END;
$$ LANGUAGE plpgsql;
EOF
) || {
        log_error "Migration failed: $output"
        return 1
    }
    
    log_success "Database migrations complete"
}

check_opencode() {
    if curl -s "http://localhost:$OPENCODE_PORT/health" >/dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

start_opencode() {
    log_info "Checking OpenCode server..."
    if check_opencode; then
        log_success "OpenCode server is running on port $OPENCODE_PORT"
        return 0
    fi
    
    log_info "Starting OpenCode server..."
    
    # Kill any existing processes
    pkill -f "opencode serve" 2>/dev/null || true
    sleep 1
    
    # Get current agent ID for external AIs
    AGENT_ID=$(node -e "console.log(require('./dist/config/Config.js').Config.getInstance().getAgentId())" 2>/dev/null || echo "server-ai")
    
    # Start with limits and agent ID env var
    nohup env NEZHA_AGENT_ID="$AGENT_ID" "$NEZHA_DIR/bin/opencode-limited.sh" serve --port "$OPENCODE_PORT" > /tmp/opencode_server.log 2>&1 &
    
    # Wait for startup
    for i in {1..10}; do
        sleep 1
        if check_opencode; then
            log_success "OpenCode server started on port $OPENCODE_PORT"
            log_info "External AIs will use agent ID: $AGENT_ID"
            return 0
        fi
    done
    
    log_error "OpenCode server failed to start"
    return 1
}

start_watchdog() {
    log_info "Checking OpenCode watchdog..."
    
    if pgrep -f "opencode-watchdog.sh" >/dev/null 2>&1; then
        log_success "Watchdog is running"
        return 0
    fi
    
    log_info "Starting OpenCode watchdog..."
    nohup "$NEZHA_DIR/bin/opencode-watchdog.sh" > /tmp/opencode-watchdog.log 2>&1 &
    sleep 1
    
    if pgrep -f "opencode-watchdog.sh" >/dev/null 2>&1; then
        log_success "Watchdog started"
        return 0
    else
        log_error "Watchdog failed to start"
        return 1
    fi
}

check_nezha() {
    if curl -s "http://localhost:$NEZHA_HEALTH_PORT/health" >/dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

start_nezha() {
    log_info "Checking Nezha daemon..."
    if check_nezha; then
        log_success "Nezha daemon is running on port $NEZHA_HEALTH_PORT"
        return 0
    fi
    
    log_info "Starting Nezha daemon..."
    
    # Kill any existing processes
    pkill -f "node dist/cli/index.js start" 2>/dev/null || true
    sleep 1
    
    cd "$NEZHA_DIR"
    nohup node dist/cli/index.js start > .nezha.log 2>&1 &
    
    # Wait for startup
    for i in {1..10}; do
        sleep 1
        if check_nezha; then
            log_success "Nezha daemon started on port $NEZHA_HEALTH_PORT"
            return 0
        fi
    done
    
    log_error "Nezha daemon failed to start"
    return 1
}

reset_stuck_tasks() {
    log_info "Resetting stuck tasks..."
    local count=$("$PSQL_PATH" -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -t -c \
        "UPDATE tasks SET status = 'PENDING' WHERE status = 'RUNNING' RETURNING COUNT(*);" 2>/dev/null | tr -d ' ')
    
    if [ -n "$count" ] && [ "$count" -gt 0 ]; then
        log_success "Reset $count stuck tasks to PENDING"
    else
        log_success "No stuck tasks found"
    fi
}

show_status() {
    echo ""
    echo "========================================"
    echo "       Nezha System Status"
    echo "========================================"
    echo ""
    
    # PostgreSQL
    if check_postgres; then
        echo "PostgreSQL:      ${GREEN}Running${NC}"
        
        # Task counts
        echo ""
        echo "Tasks:"
        "$PSQL_PATH" -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -c \
            "SELECT status, COUNT(*) FROM tasks GROUP BY status ORDER BY status;" 2>/dev/null
        
        # Issues count
        echo ""
        echo "Open Issues: $("$PSQL_PATH" -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -t -c \
            "SELECT COUNT(*) FROM issues WHERE status = 'open';" 2>/dev/null | tr -d ' ')"
    else
        echo "PostgreSQL:      ${RED}Not Running${NC}"
    fi
    
    echo ""
    
    # OpenCode
    if check_opencode; then
        echo "OpenCode Server: ${GREEN}Running${NC} (port $OPENCODE_PORT)"
    else
        echo "OpenCode Server: ${RED}Not Running${NC}"
    fi
    
    # Watchdog
    if pgrep -f "opencode-watchdog.sh" >/dev/null 2>&1; then
        echo "Watchdog:        ${GREEN}Running${NC}"
    else
        echo "Watchdog:        ${YELLOW}Not Running${NC}"
    fi
    
    # Nezha
    if check_nezha; then
        echo "Nezha Daemon:    ${GREEN}Running${NC} (port $NEZHA_HEALTH_PORT)"
    else
        echo "Nezha Daemon:    ${RED}Not Running${NC}"
    fi
    
    echo ""
    echo "========================================"
}

stop_all() {
    log_info "Stopping all services..."
    
    # Stop Nezha
    pkill -f "node dist/cli/index.js start" 2>/dev/null || true
    log_success "Nezha daemon stopped"
    
    # Stop watchdog
    pkill -f "opencode-watchdog.sh" 2>/dev/null || true
    log_success "Watchdog stopped"
    
    # Stop OpenCode
    pkill -f "opencode serve" 2>/dev/null || true
    log_success "OpenCode server stopped"
    
    log_success "All services stopped"
}

start_all() {
    echo ""
    echo "========================================"
    echo "    Starting Nezha System"
    echo "========================================"
    echo ""
    
    start_postgres || return 1
    run_migrations || return 1
    
    # Kill old processes first
    log_info "Cleaning up old processes..."
    pkill -f "node.*daemon" 2>/dev/null || true
    pkill -f "opencode serve" 2>/dev/null || true
    sleep 1
    
    # Kill any process on ports
    local health_pid=$(lsof -ti :$NEZHA_HEALTH_PORT 2>/dev/null)
    if [ -n "$health_pid" ]; then
        kill -9 $health_pid 2>/dev/null || true
    fi
    local opencode_pid=$(lsof -ti :$OPENCODE_PORT 2>/dev/null)
    if [ -n "$opencode_pid" ]; then
        kill -9 $opencode_pid 2>/dev/null || true
    fi
    sleep 1
    
    # Get agent ID
    AGENT_ID=$(node -e "console.log(require('./dist/config/Config.js').Config.getInstance().getAgentId())" 2>/dev/null || echo "server-ai")
    
    # Start OpenCode server FIRST (in background, wait for ready)
    log_info "Starting OpenCode server..."
    env NEZHA_AGENT_ID="$AGENT_ID" opencode serve --hostname 127.0.0.1 --port "$OPENCODE_PORT" > /tmp/opencode_server.log 2>&1 &
    local opencode_bg_pid=$!
    
    # Wait for OpenCode to be ready
    log_info "Waiting for OpenCode to be ready..."
    local wait_count=0
    while ! curl -s "http://127.0.0.1:$OPENCODE_PORT/health" > /dev/null 2>&1; do
        sleep 1
        wait_count=$((wait_count + 1))
        if [ $wait_count -ge 30 ]; then
            log_error "OpenCode failed to start within 30 seconds"
            kill $opencode_bg_pid 2>/dev/null || true
            exit 1
        fi
        printf "."
    done
    echo ""
    log_success "OpenCode server ready on port $OPENCODE_PORT"
    
    # Now start Nezha daemon
    log_info "Starting Nezha daemon in background..."
    nohup node dist/daemon/index.js > .nezha.log 2>&1 &
    sleep 2
    if check_nezha; then
        log_success "Nezha daemon started"
    else
        log_error "Nezha daemon failed to start"
        kill $opencode_bg_pid 2>/dev/null || true
        exit 1
    fi
    
    echo ""
    log_info "Nezha system is running!"
    log_info "OpenCode PID: $opencode_bg_pid"
    log_info "Press Ctrl+C to stop"
    echo ""
    
    # Show OpenCode logs in foreground
    exec tail -f /tmp/opencode_server.log
}

case "${1:-start}" in
    start)
        start_all
        ;;
    stop)
        stop_all
        ;;
    restart)
        stop_all
        sleep 2
        start_all
        ;;
    status)
        show_status
        ;;
    check)
        show_status
        if check_postgres && check_opencode && check_nezha; then
            exit 0
        else
            exit 1
        fi
        ;;
    reset-tasks)
        reset_stuck_tasks
        ;;
    opencode)
        start_postgres || exit 1
        run_migrations || exit 1
        
        if check_opencode; then
            log_warn "OpenCode server already running on port $OPENCODE_PORT"
            log_info "Use 'logs-follow' to view logs"
            exit 0
        fi
        
        # Kill any existing processes
        pkill -f "opencode serve" 2>/dev/null || true
        sleep 1
        
        # Get current agent ID for external AIs
        AGENT_ID=$(node -e "console.log(require('./dist/config/Config.js').Config.getInstance().getAgentId())" 2>/dev/null || echo "server-ai")
        
        echo ""
        log_info "Starting OpenCode server in foreground..."
        log_info "Port: $OPENCODE_PORT"
        log_info "Agent ID: $AGENT_ID"
        log_info "Press Ctrl+C to stop"
        echo ""
        
        # Run in foreground
        exec env NEZHA_AGENT_ID="$AGENT_ID" opencode serve --hostname 127.0.0.1 --port "$OPENCODE_PORT"
        ;;
    nezha)
        start_postgres || exit 1
        run_migrations || exit 1
        start_nezha || exit 1
        ;;
    logs)
        echo "OpenCode Server Logs:"
        echo "====================="
        tail -100 /tmp/opencode_server.log 2>/dev/null || echo "No logs found"
        ;;
    logs-follow)
        echo "Following OpenCode Server Logs (Ctrl+C to stop)..."
        tail -f /tmp/opencode_server.log 2>/dev/null || echo "No logs found"
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|status|check|reset-tasks|opencode|nezha|logs|logs-follow}"
        echo ""
        echo "Commands:"
        echo "  start        Start all services (default)"
        echo "  stop         Stop all services"
        echo "  restart      Restart all services"
        echo "  status       Show system status"
        echo "  check        Check if all services are running (exit code)"
        echo "  reset-tasks  Reset stuck RUNNING tasks to PENDING"
        echo "  opencode     Start only OpenCode server (with logs visible)"
        echo "  nezha        Start only Nezha daemon"
        echo "  logs         Show last 100 lines of OpenCode logs"
        echo "  logs-follow  Follow OpenCode logs in real-time"
        exit 1
        ;;
esac
