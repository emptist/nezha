# System Memory - Environment Configuration

**Created**: 2026-03-17  
**Type**: System Memory  
**Importance**: HIGH  
**Category**: Environment Configuration

---

## 📝 Memory Entry

### PostgreSQL Installation Method

**Key Information**: 
- PostgreSQL is installed via **APP (Application)** method on macOS
- Authentication uses **Keychain** method, NOT password authentication
- This is a critical configuration that affects database connection setup

---

## 🔧 Configuration Details

### Installation Method
- **Method**: macOS Application (not Homebrew, not Docker)
- **Location**: Likely in `/Applications/` folder
- **Data Directory**: `/opt/homebrew/var/postgres`

### Authentication Method
- **Type**: Keychain-based authentication
- **Password**: NOT used (Keychain handles authentication)
- **User**: `postgres` (system user)

---

## ⚠️ Important Notes

### Connection Configuration

The `.env` file currently has:
```bash
NEZHA_DB_PASSWORD=your_password_here
```

**This is INCORRECT** for Keychain authentication!

### Correct Configuration

For Keychain authentication, the password field should be:
- **Option 1**: Empty string
- **Option 2**: Omitted entirely
- **Option 3**: Use `trust` authentication in `pg_hba.conf`

---

## 🔄 How to Fix

### Step 1: Update .env file

```bash
# Remove or comment out the password line
# NEZHA_DB_PASSWORD=your_password_here

# Or set to empty
NEZHA_DB_PASSWORD=
```

### Step 2: Verify pg_hba.conf

Check `/opt/homebrew/var/postgres/pg_hba.conf`:

```bash
# Should have something like:
local   all             all                                     trust
host    all             all             127.0.0.1/32            trust
```

### Step 3: Test Connection

```bash
# Should work without password
psql -U postgres -d nezha -c "SELECT version();"
```

---

## 📚 Related Documentation

- [DATABASE_TROUBLESHOOTING.md](./DATABASE_TROUBLESHOOTING.md) - General troubleshooting
- [README.md](../README.md) - Main documentation

---

## 🎯 Action Required

1. **Update .env**: Remove or empty the `NEZHA_DB_PASSWORD` field
2. **Test Connection**: Verify connection works without password
3. **Update Code**: Ensure code handles empty password correctly
4. **Document**: Update all documentation to reflect Keychain auth

---

## 💡 Why This Matters

**Problem**: Every time the system tries to connect with a password, it fails because PostgreSQL expects Keychain authentication.

**Solution**: Configure the system to use trust authentication or handle empty passwords correctly.

**Impact**: This affects:
- Task-add command
- HeartbeatService startup
- All database operations

---

## 🔄 Memory Persistence

This information should be stored in the database memory table once connection is established:

```sql
INSERT INTO memory (id, content, tags, metadata, importance, source)
VALUES (
  uuid_generate_v4(),
  'PostgreSQL installed via APP method on macOS. Uses Keychain authentication, NOT password. Configuration: NEZHA_DB_PASSWORD should be empty or omitted. Data directory: /opt/homebrew/var/postgres',
  ARRAY['environment', 'postgresql', 'authentication', 'keychain', 'configuration'],
  '{"installation_method": "app", "authentication": "keychain", "data_directory": "/opt/homebrew/var/postgres", "password_required": false}',
  10,
  'system_memory'
);
```

---

**Status**: Critical configuration information  
**Priority**: Immediate action required  
**Next Step**: Update .env and test connection
