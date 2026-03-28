#!/bin/bash

# Graceful Shutdown Script for Nezha Daemon
# Sends announcement before stopping to allow AI systems to prepare

set -e

# Configuration
SHUTDOWN_DELAY=${1:-10}
REASON=${2:-"maintenance"}
ANNOUNCE=${3:-"true"}

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}=== Nezha Daemon Graceful Shutdown ===${NC}"
echo ""

# Check if daemon is running
if ! pgrep -f "node dist/daemon/index.js" > /dev/null; then
    echo -e "${YELLOW}⚠️  Daemon is not running${NC}"
    exit 0
fi

# Send announcement if enabled
if [ "$ANNOUNCE" = "true" ]; then
    echo -e "${GREEN}📢 Sending shutdown announcement...${NC}"
    
    psql -h 127.0.0.1 -U postgres -d nezha -c "
    INSERT INTO project_communications (from_ai, message_type, content, priority, metadata)
    VALUES (
      'nezha-daemon',
      'broadcast',
      '⚠️ **系统维护通知**

Nezha Daemon 即将停止进行维护。

**停止时间**: 约 ${SHUTDOWN_DELAY} 秒后
**原因**: ${REASON}
**影响**: 提醒服务将暂停，OpenCode 将不会收到定期提醒

**建议行动**:
- 保存当前工作进度
- 记录重要状态
- 等待系统重启完成

系统将在维护完成后自动恢复服务。',
      'high',
      '{\"shutdown_delay_seconds\": ${SHUTDOWN_DELAY}, \"reason\": \"${REASON}\", \"auto_restart\": true}'
    );
    " || echo -e "${RED}Failed to send announcement${NC}"
    
    echo -e "${GREEN}✓ Announcement sent${NC}"
fi

# Wait for systems to prepare
echo ""
echo -e "${YELLOW}⏳ Waiting ${SHUTDOWN_DELAY} seconds for AI systems to prepare...${NC}"
for i in $(seq $SHUTDOWN_DELAY -1 1); do
    echo -ne "\r   $i seconds remaining... "
    sleep 1
done
echo -e "\r   0 seconds remaining...   "
echo ""

# Stop daemon gracefully
echo -e "${YELLOW}🛑 Stopping Nezha Daemon...${NC}"
pkill -TERM -f "node dist/daemon/index.js"
sleep 2

# Verify stopped
if pgrep -f "node dist/daemon/index.js" > /dev/null; then
    echo -e "${YELLOW}⚠️  Daemon still running, sending SIGKILL...${NC}"
    pkill -9 -f "node dist/daemon/index.js"
    sleep 1
fi

# Final check
if ! pgrep -f "node dist/daemon/index.js" > /dev/null; then
    echo -e "${GREEN}✓ Nezha Daemon stopped successfully${NC}"
    echo ""
    echo -e "${GREEN}=== Shutdown Complete ===${NC}"
    exit 0
else
    echo -e "${RED}✗ Failed to stop daemon${NC}"
    exit 1
fi
