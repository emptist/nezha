#!/bin/bash
# opencode-watchdog.sh - Monitor and limit opencode processes
# Prevents runaway CPU from opencode spawning too many children

MAX_PROCESSES=10
MAX_CPU_PERCENT=100
CHECK_INTERVAL=5
LOG_FILE="/tmp/opencode-watchdog.log"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

cleanup_orphans() {
    for pid in $(pgrep -f "opencode" 2>/dev/null); do
        ppid=$(ps -o ppid= -p "$pid" 2>/dev/null | tr -d ' ')
        if [ -n "$ppid" ]; then
            if [ "$ppid" = "1" ] || ! kill -0 "$ppid" 2>/dev/null; then
                log "Killing orphan opencode process $pid (ppid=$ppid)"
                kill -9 "$pid" 2>/dev/null
            fi
        fi
    done
}

log "Starting opencode watchdog (max: $MAX_PROCESSES processes, $MAX_CPU_PERCENT% CPU)"

while true; do
    cleanup_orphans
    
    PIDS=$(pgrep -f "opencode" 2>/dev/null | wc -l)
    CPU_TOTAL=$(ps aux | grep -E "[o]pencode" | awk '{sum += $3} END {print int(sum)}')
    
    if [ "$PIDS" -gt "$MAX_PROCESSES" ]; then
        log "WARNING: Too many processes ($PIDS > $MAX_PROCESSES)"
        pkill -9 -f "opencode" 2>/dev/null
    fi
    
    if [ -n "$CPU_TOTAL" ] && [ "$CPU_TOTAL" -gt "$MAX_CPU_PERCENT" ]; then
        log "WARNING: High CPU ($CPU_TOTAL%)"
        pkill -9 -f "opencode" 2>/dev/null
    fi
    
    sleep "$CHECK_INTERVAL"
done
