# PostgreSQL 配置指南

**创建日期**: 2026-03-17  
**目的**: 解决 PostgreSQL 认证问题

---

## 🔍 问题诊断

### 当前问题

1. **密码认证失败**: PostgreSQL 要求密码，但 Keychain 认证不工作
2. **命令行工具**: psql 命令每次都要求输入密码
3. **应用连接**: Node.js 应用无法连接数据库

### 根本原因

PostgreSQL 安装在 macOS 上，使用 Keychain 认证，但：
- 命令行工具不支持 Keychain
- Node.js pg 库不支持 Keychain
- 需要配置传统的认证方式

---

## ✅ 解决方案

### 方案 1: 修改 pg_hba.conf (推荐)

**步骤**:

1. **找到 pg_hba.conf 文件位置**
   ```bash
   # PostgreSQL.app 的配置文件位置
   ~/Library/Application Support/Postgres/var-18/pg_hba.conf
   ```

2. **修改认证方式**
   ```bash
   # 编辑文件
   nano ~/Library/Application\ Support/Postgres/var-18/pg_hba.conf
   
   # 找到这一行:
   # host    all             all             127.0.0.1/32            scram-sha-256
   
   # 改为:
   # host    all             all             127.0.0.1/32            trust
   
   # 或者添加:
   # local   all             all                                     trust
   # host    all             all             127.0.0.1/32            trust
   # host    all             all             ::1/128                 trust
   ```

3. **重启 PostgreSQL**
   ```bash
   # 通过 PostgreSQL.app 界面重启
   # 或者使用命令行
   /Applications/Postgres.app/Contents/Versions/18/bin/pg_ctl restart
   ```

4. **测试连接**
   ```bash
   /Applications/Postgres.app/Contents/Versions/18/bin/psql -U postgres -d nezha -c "SELECT version();"
   ```

### 方案 2: 创建密码

**步骤**:

1. **设置密码**
   ```bash
   # 通过 PostgreSQL.app 界面设置密码
   # 或者使用 SQL
   ALTER USER postgres PASSWORD 'your_password';
   ```

2. **更新 .env 文件**
   ```bash
   DB_PASSWORD=your_password
   ```

### 方案 3: 使用 Unix Socket

**步骤**:

1. **修改连接配置**
   ```typescript
   // src/config/Config.ts
   const dbConfig = {
     host: '/tmp',  // Unix socket 目录
     database: 'nezha',
     user: 'postgres',
     // 不需要密码
   };
   ```

2. **修改 pg_hba.conf**
   ```bash
   # 添加:
   local   all             all                                     trust
   ```

---

## 🎯 推荐方案

**最简单**: 方案 1 - 修改 pg_hba.conf 使用 trust 认证

**原因**:
- ✅ 不需要密码
- ✅ 本地开发环境安全
- ✅ 命令行和应用都能工作
- ✅ 配置简单

---

## 📝 配置文件示例

### pg_hba.conf

```conf
# PostgreSQL Client Authentication Configuration File
# ===================================================
#
# TYPE  DATABASE        USER            ADDRESS                 METHOD

# Local connections
local   all             all                                     trust

# IPv4 local connections:
host    all             all             127.0.0.1/32            trust

# IPv6 local connections:
host    all             all             ::1/128                 trust
```

### .env

```bash
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=nezha
DB_USER=postgres
DB_PASSWORD=  # 留空，使用 trust 认证
```

---

## ⚠️ 安全警告

**trust 认证仅适用于本地开发环境！**

在生产环境中，必须使用：
- scram-sha-256
- md5
- 或其他安全认证方式

---

## 🔄 下一步

1. 修改 pg_hba.conf
2. 重启 PostgreSQL
3. 测试连接
4. 更新文档
5. 提交配置

---

**状态**: 等待用户修改 pg_hba.conf
