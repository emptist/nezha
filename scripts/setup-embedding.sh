#!/bin/bash

# Setup script for embedding support
# This script installs pgvector extension and updates the database schema

set -e

echo "🚀 Setting up embedding support for Nezha..."

# Check if psql is available
PSQL_PATH="/Applications/Postgres.app/Contents/Versions/18/bin/psql"

if [ ! -f "$PSQL_PATH" ]; then
    echo "❌ psql not found at $PSQL_PATH"
    echo "Please install Postgres.app or update the PSQL_PATH in this script"
    exit 1
fi

# Database connection parameters
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-nezha}"
DB_USER="${DB_USER:-postgres}"
DB_PASSWORD="${DB_PASSWORD:-Podbmima.jigm}"

# Migration file path
MIGRATION_FILE="src/db/migrations/003_embedding_support.sql"

echo "📊 Database: $DB_NAME"
echo "👤 User: $DB_USER"
echo "📁 Migration: $MIGRATION_FILE"
echo ""

# Run migration
echo "⚙️  Running migration..."
PGPASSWORD="$DB_PASSWORD" "$PSQL_PATH" \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    -f "$MIGRATION_FILE"

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Embedding support setup complete!"
    echo ""
    echo "📋 What was installed:"
    echo "  - pgvector extension"
    echo "  - embedding column (vector(1024))"
    echo "  - tags, importance, source columns"
    echo "  - Vector search indexes"
    echo "  - Search functions (vector, keyword, hybrid)"
    echo ""
    echo "🎯 Next steps:"
    echo "  1. Set ZHIPU_API_KEY in .env"
    echo "  2. Restart Nezha service"
    echo "  3. Test embedding functionality"
else
    echo ""
    echo "❌ Migration failed. Please check the error messages above."
    exit 1
fi
