#!/bin/bash

# Pre-Shutdown Safety Check Script
# Checks for active work before allowing shutdown

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}=== Pre-Shutdown Safety Check ===${NC}"
echo ""

# Database connection
PSQL="psql -h 127.0.0.1 -U postgres -d nezha"

# Check 1: Running tasks
echo -e "${YELLOW}📋 Checking for running tasks...${NC}"
RUNNING_TASKS=$($PSQL -t -c "
SELECT COUNT(*) FROM tasks WHERE status IN ('PENDING', 'RUNNING');
" | tr -d ' ')

if [ "$RUNNING_TASKS" -gt 0 ]; then
    echo -e "${RED}⚠️  Found $RUNNING_TASKS running/pending tasks${NC}"
    $PSQL -c "
    SELECT 
      LEFT(title, 50) as title,
      status,
      ROUND(EXTRACT(EPOCH FROM (NOW() - updated_at)) / 60) as minutes_active
    FROM tasks 
    WHERE status IN ('PENDING', 'RUNNING')
    ORDER BY updated_at DESC
    LIMIT 5;
    "
    echo ""
    echo -e "${RED}❌ Cannot proceed with shutdown${NC}"
    echo -e "${YELLOW}   Wait for tasks to complete or manually cancel them${NC}"
    exit 1
else
    echo -e "${GREEN}✓ No running tasks${NC}"
fi

# Check 2: Recent activity (last 5 minutes)
echo ""
echo -e "${YELLOW}📊 Checking recent activity...${NC}"
RECENT_ACTIVITY=$($PSQL -t -c "
SELECT COUNT(*) FROM tasks 
WHERE updated_at > NOW() - INTERVAL '5 minutes'
AND status = 'RUNNING';
" | tr -d ' ')

if [ "$RECENT_ACTIVITY" -gt 0 ]; then
    echo -e "${YELLOW}⚠️  Recent activity detected (last 5 minutes)${NC}"
    echo -e "${YELLOW}   Consider waiting a few more minutes${NC}"
    read -p "Continue anyway? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${YELLOW}Shutdown cancelled${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}✓ No recent activity${NC}"
fi

# Check 3: OpenCode session status
echo ""
echo -e "${YELLOW}🤖 Checking OpenCode session...${NC}"
if curl -s http://localhost:56795/health > /dev/null 2>&1; then
    echo -e "${GREEN}✓ OpenCode is running${NC}"
    
    # Check if OpenCode is busy
    SESSION_STATUS=$(curl -s http://localhost:56795/session 2>/dev/null | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4)
    if [ "$SESSION_STATUS" = "busy" ]; then
        echo -e "${YELLOW}⚠️  OpenCode session is busy${NC}"
        echo -e "${YELLOW}   Consider waiting for current operation to complete${NC}"
        read -p "Continue anyway? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            echo -e "${YELLOW}Shutdown cancelled${NC}"
            exit 1
        fi
    else
        echo -e "${GREEN}✓ OpenCode session is idle${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  OpenCode is not running${NC}"
fi

# Check 4: File locks
echo ""
echo -e "${YELLOW}🔒 Checking for file locks...${NC}"
LOCK_FILES=$(find /Users/jk/gits/hub/nezha -name "*.lock" -o -name "*.pid" 2>/dev/null | wc -l)
if [ "$LOCK_FILES" -gt 0 ]; then
    echo -e "${YELLOW}⚠️  Found $LOCK_FILES lock files${NC}"
    find /Users/jk/gits/hub/nezha -name "*.lock" -o -name "*.pid" 2>/dev/null
    echo ""
    read -p "Continue anyway? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${YELLOW}Shutdown cancelled${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}✓ No file locks found${NC}"
fi

# All checks passed
echo ""
echo -e "${GREEN}=== All Safety Checks Passed ===${NC}"
echo -e "${GREEN}✓ Safe to proceed with shutdown${NC}"
exit 0
