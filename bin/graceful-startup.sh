#!/bin/bash

# Graceful Startup Script for Nezha Daemon
# Sends announcement when starting to notify AI systems

set -e

# Configuration
ANNOUNCE=${1:-"true"}
LOG_FILE="/tmp/nezha-daemon-$(date +%s).log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Nezha Daemon Graceful Startup ===${NC}"
echo ""

# Check if daemon is already running
if pgrep -f "node dist/daemon/index.js" > /dev/null; then
    echo -e "${YELLOW}⚠️  Daemon is already running${NC}"
    echo -e "${YELLOW}   Use 'graceful-shutdown.sh' first to stop it${NC}"
    exit 1
fi

# Send announcement if enabled
if [ "$ANNOUNCE" = "true" ]; then
    echo -e "${GREEN}📢 Sending startup announcement...${NC}"
    
    psql -h 127.0.0.1 -U postgres -d nezha -c "
    INSERT INTO project_communications (from_ai, message_type, content, priority, metadata)
    VALUES (
      'nezha-daemon',
      'broadcast',
      '✅ **系统启动通知**

Nezha Daemon 正在启动。

**启动时间**: $(date '+%Y-%m-%d %H:%M:%S')
**服务内容**: 
- 任务调度
- 提醒服务
- 心跳检查
- OpenCode 集成

**日志文件**: '"${LOG_FILE}"'

系统已准备就绪，可以开始工作。',
      'normal',
      '{\"startup_time\": \"'$(date -Iseconds)'\", \"log_file\": \"'"${LOG_FILE}"'\"}'
    );
    " || echo -e "${RED}Failed to send announcement${NC}"
    
    echo -e "${GREEN}✓ Announcement sent${NC}"
fi

# Start daemon
echo ""
echo -e "${GREEN}🚀 Starting Nezha Daemon...${NC}"
nohup node dist/daemon/index.js > "$LOG_FILE" 2>&1 &
DAEMON_PID=$!

echo -e "${GREEN}✓ Daemon started (PID: $DAEMON_PID)${NC}"
echo -e "${GREEN}✓ Log file: $LOG_FILE${NC}"

# Wait for daemon to initialize
echo ""
echo -e "${YELLOW}⏳ Waiting for daemon to initialize...${NC}"
sleep 3

# Check if daemon is running
if ps -p $DAEMON_PID > /dev/null; then
    echo -e "${GREEN}✓ Daemon is running${NC}"
    
    # Show initial logs
    echo ""
    echo -e "${GREEN}=== Initial Logs ===${NC}"
    head -20 "$LOG_FILE"
    
    echo ""
    echo -e "${GREEN}=== Startup Complete ===${NC}"
    echo -e "${GREEN}Use 'tail -f $LOG_FILE' to monitor logs${NC}"
    exit 0
else
    echo -e "${RED}✗ Daemon failed to start${NC}"
    echo -e "${RED}Check logs: $LOG_FILE${NC}"
    exit 1
fi
