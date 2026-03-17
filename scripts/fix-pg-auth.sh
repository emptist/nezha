#!/bin/bash

# Fix PostgreSQL authentication for TCP/IP connections
# This script adds trust authentication for host connections

PG_HBA_CONF="/Users/jk/Library/Application Support/Postgres/var-18/pg_hba.conf"

echo "🔧 Fixing PostgreSQL authentication configuration..."

# Backup original file
cp "$PG_HBA_CONF" "${PG_HBA_CONF}.backup"

# Add trust authentication for host connections
cat >> "$PG_HBA_CONF" << 'EOF'

# Added by Nezha for local development
host    all             all             127.0001/32            trust
host    all             all             ::1/128                 trust
EOF

echo "✅ Added trust authentication for host connections"
echo "⚠️  Please restart PostgreSQL for changes to take effect"
echo ""
echo "To restart PostgreSQL:"
echo "  Option 1: Restart via Postgres.app menu"
echo "  Option 2: Or run: killall -HUP postgres && /Applications/Postgres.app/Contents/MacOS/Postgres"
