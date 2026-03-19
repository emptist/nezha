# Nezha Skills Strategy

> A comprehensive strategy for integrating, managing, and securing AI skills in the Nezha system

---

## 1. Overview

### 1.1 What Are Skills?

Skills are reusable, modular capabilities that teach AI agents how to perform specific tasks. Each skill contains:
- `SKILL.md` - Defines tool usage methods and operation guidelines
- Configuration files and prompts
- Optional code/dependencies

### 1.2 Why Skills Matter

| Benefit | Description |
|---------|-------------|
| **Reusability** | Share capabilities across projects and agents |
| **Consistency** | Standardized approaches to common tasks |
| **Efficiency** | Reduce prompt engineering overhead |
| **Community** | Leverage collective knowledge from ClawHub |

---

## 2. Skills Source: ClawHub

### 2.1 About ClawHub

ClawHub is OpenClaw's skills marketplace, similar to an "AI App Store":

| Metric | Value |
|--------|-------|
| Available Skills | 10,000+ |
| Daily Additions | 100+ new skills |
| Categories | Development, Automation, Creative, Analysis, etc. |

### 2.2 Skill Categories

```
ClawHub Skills
├── Development
│   ├── code-review
│   ├── test-generation
│   ├── documentation
│   └── refactoring
├── Automation
│   ├── git-operations
│   ├── ci-cd
│   ├── deployment
│   └── monitoring
├── Creative
│   ├── video-generation
│   ├── music-composition
│   ├── image-creation
│   └── content-writing
├── Analysis
│   ├── code-analysis
│   ├── security-audit
│   ├── performance-profiling
│   └── data-analysis
└── Integration
    ├── api-integration
    ├── database-operations
    ├── cloud-services
    └── third-party-tools
```

---

## 3. Storage Architecture

### 3.1 Database-First Approach

Unlike traditional file-based skill storage, Nezha stores skills in PostgreSQL:

```
┌─────────────────────────────────────────────────────────────┐
│                    PostgreSQL Database                        │
│                                                              │
│  ┌─────────────────┐  ┌─────────────────┐                   │
│  │    skills       │  │  skill_versions │                   │
│  │─────────────────│  │─────────────────│                   │
│  │ id (PK)         │  │ id (PK)         │                   │
│  │ name            │  │ skill_id (FK)   │                   │
│  │ description     │  │ version         │                   │
│  │ category        │  │ content         │                   │
│  │ author          │  │ checksum        │                   │
│  │ source          │  │ created_at      │                   │
│  │ status          │  │ approved_by     │                   │
│  │ created_at      │  │ approved_at     │                   │
│  │ updated_at      │  └─────────────────┘                   │
│  └─────────────────┘                                        │
│                                                              │
│  ┌─────────────────┐  ┌─────────────────┐                   │
│  │ skill_audit_log │  │skill_permissions│                   │
│  │─────────────────│  │─────────────────│                   │
│  │ id (PK)         │  │ id (PK)         │                   │
│  │ skill_id (FK)   │  │ skill_id (FK)   │                   │
│  │ action          │  │ project_id (FK) │                   │
│  │ actor           │  │ allowed_actions │                   │
│  │ timestamp       │  │ created_at      │                   │
│  │ details         │  └─────────────────┘                   │
│  └─────────────────┘                                        │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 Benefits of Database Storage

| Benefit | Description |
|---------|-------------|
| **Version Control** | Track all skill versions, rollback if needed |
| **Access Control** | Per-project or per-user skill permissions |
| **Audit Logging** | Know which skills were used when and by whom |
| **Centralized Management** | Single source of truth across all projects |
| **Security Scanning** | Validate skills before storing |
| **Fast Retrieval** | Indexed queries for quick skill loading |
| **Backup & Recovery** | Integrated with database backup strategy |

### 3.3 Database Schema

```sql
-- Skills table
CREATE TABLE skills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    category VARCHAR(100),
    author VARCHAR(255),
    source VARCHAR(50) DEFAULT 'clawhub', -- 'clawhub', 'local', 'custom'
    status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'approved', 'rejected', 'deprecated'
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Skill versions table
CREATE TABLE skill_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    skill_id UUID REFERENCES skills(id) ON DELETE CASCADE,
    version VARCHAR(50) NOT NULL,
    content TEXT NOT NULL,
    checksum VARCHAR(64) NOT NULL,
    approved_by VARCHAR(255),
    approved_at TIMESTAMP,
    security_scan_result JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(skill_id, version)
);

-- Skill audit log
CREATE TABLE skill_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    skill_id UUID REFERENCES skills(id),
    action VARCHAR(50) NOT NULL, -- 'install', 'update', 'use', 'delete', 'approve'
    actor VARCHAR(255),
    timestamp TIMESTAMP DEFAULT NOW(),
    details JSONB
);

-- Skill permissions
CREATE TABLE skill_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    skill_id UUID REFERENCES skills(id) ON DELETE CASCADE,
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    allowed_actions TEXT[] DEFAULT ARRAY['read', 'execute'],
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(skill_id, project_id)
);

-- Indexes
CREATE INDEX idx_skills_status ON skills(status);
CREATE INDEX idx_skills_category ON skills(category);
CREATE INDEX idx_skill_versions_skill_id ON skill_versions(skill_id);
CREATE INDEX idx_skill_audit_log_skill_id ON skill_audit_log(skill_id);
CREATE INDEX idx_skill_audit_log_timestamp ON skill_audit_log(timestamp);
```

---

## 4. Security Strategy

### 4.1 Threat Model

Based on ClawHub security incidents, we identify these threats:

| Threat | Example | Impact |
|--------|---------|--------|
| **Data Exfiltration** | Skill reads `.env`, SSH keys | Credential theft |
| **Code Injection** | Malicious code execution | System compromise |
| **Resource Abuse** | Cryptocurrency mining | Resource exhaustion |
| **Backdoors** | Hidden admin access | Persistent compromise |
| **Supply Chain** | Compromised dependency | Transitive attacks |

### 4.2 Security Pipeline

```
┌─────────────────────────────────────────────────────────────┐
│                  Skill Security Pipeline                     │
│                                                              │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │   Download  │───►│   Scan      │───►│   Sandbox   │     │
│  │  from       │    │   Analyze   │    │   Test      │     │
│  │  ClawHub    │    │   Content   │    │   Execute   │     │
│  └─────────────┘    └─────────────┘    └─────────────┘     │
│         │                  │                  │              │
│         ▼                  ▼                  ▼              │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │  Validate   │    │  Check for  │    │  Monitor    │     │
│  │  Checksum   │    │  Patterns   │    │  Behavior   │     │
│  └─────────────┘    └─────────────┘    └─────────────┘     │
│         │                  │                  │              │
│         └──────────────────┴──────────────────┘              │
│                            │                                 │
│                            ▼                                 │
│                    ┌─────────────┐                          │
│                    │   Approve   │                          │
│                    │   /Reject   │                          │
│                    └─────────────┘                          │
│                            │                                 │
│                            ▼                                 │
│                    ┌─────────────┐                          │
│                    │   Store in  │                          │
│                    │  Database   │                          │
│                    └─────────────┘                          │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 4.3 Security Checks

#### Static Analysis
```typescript
interface SecurityScanResult {
  passed: boolean;
  issues: SecurityIssue[];
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

interface SecurityIssue {
  type: 'file_access' | 'network' | 'code_execution' | 'suspicious_pattern';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  location: string;
  recommendation: string;
}
```

#### Blocked Patterns
```typescript
const BLOCKED_PATTERNS = [
  /\.env/i,
  /ssh.*key/i,
  /password/i,
  /api[_-]?key/i,
  /secret/i,
  /credential/i,
  /token/i,
  /eval\s*\(/i,
  /Function\s*\(/i,
  /child_process/i,
  /exec\s*\(/i,
  /spawn\s*\(/i,
];
```

#### Allowed Operations
```typescript
const ALLOWED_OPERATIONS = [
  'read_file',
  'write_file',
  'http_request',
  'database_query',
  'run_command',
];

const RESTRICTED_PATHS = [
  '.env',
  '.ssh',
  '.git',
  '.aws',
  '.gcp',
];
```

### 4.4 Approval Workflow

```
┌─────────────────────────────────────────────────────────────┐
│                  Skill Approval Workflow                     │
│                                                              │
│  Pending ──► Security Scan ──► Manual Review ──► Approved   │
│     │              │                │               │        │
│     │              ▼                ▼               │        │
│     │         Rejected         Rejected            │        │
│     │              │                │               │        │
│     └──────────────┴────────────────┴───────────────┘        │
│                                                              │
│  Roles:                                                      │
│  - Security Scanner (automated)                              │
│  - Reviewer (human approval for high-risk skills)            │
│  - Admin (override capabilities)                             │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 5. Skill Lifecycle

### 5.1 Installation Flow

```bash
# Install skill from ClawHub
nezha skill install <skill-name> [--version <version>]

# Example
nezha skill install video-generator --version 1.2.0
```

```
1. Fetch skill from ClawHub
2. Validate checksum
3. Run security scan
4. If high-risk: queue for manual review
5. If low-risk: auto-approve
6. Store in database
7. Log audit event
```

### 5.2 Usage Flow

```bash
# List installed skills
nezha skill list

# Use skill in task
nezha task-add "Generate video" "Create promotional video" --skill video-generator

# Execute skill directly
nezha skill run video-generator --input params.json
```

### 5.3 Update Flow

```bash
# Check for updates
nezha skill update --check

# Update specific skill
nezha skill update video-generator

# Update all skills
nezha skill update --all
```

### 5.4 Removal Flow

```bash
# Remove skill
nezha skill remove video-generator

# Force remove (with dependencies)
nezha skill remove video-generator --force
```

---

## 6. Skill Development

### 6.1 Skill Structure

```
my-skill/
├── SKILL.md           # Required: Skill definition
├── config.json        # Optional: Configuration schema
├── prompts/           # Optional: Prompt templates
│   ├── main.md
│   └── examples.md
├── tests/             # Optional: Test cases
│   └── test-cases.json
└── metadata.json      # Optional: Additional metadata
```

### 6.2 SKILL.md Template

```markdown
# Skill: video-generator

## Description
Generates promotional videos from text content and images.

## Capabilities
- Create video from text script
- Add background music
- Apply transitions and effects
- Export to multiple formats

## Required Tools
- ffmpeg
- image-magick
- audio-mixer

## Parameters
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| script | string | yes | Video script text |
| duration | number | no | Target duration in seconds |
| style | string | no | Visual style preset |
| format | string | no | Output format (mp4, webm) |

## Usage Example
\`\`\`json
{
  "script": "Welcome to our product...",
  "duration": 60,
  "style": "modern",
  "format": "mp4"
}
\`\`\`

## Security Considerations
- Only reads from designated input directories
- No network access required
- No sensitive data access

## Version History
- 1.2.0: Added webm format support
- 1.1.0: Added style presets
- 1.0.0: Initial release
```

### 6.3 Creating Custom Skills

```bash
# Create new skill scaffold
nezha skill create my-custom-skill

# Validate skill
nezha skill validate my-custom-skill

# Test skill locally
nezha skill test my-custom-skill --input test-params.json

# Publish to local registry
nezha skill publish my-custom-skill

# Submit to ClawHub (future)
nezha skill submit my-custom-skill --to clawhub
```

---

## 7. Integration with Nezha

### 7.1 Task Execution with Skills

```typescript
interface TaskWithSkill {
  id: string;
  title: string;
  description: string;
  skill?: {
    name: string;
    version?: string;
    parameters: Record<string, unknown>;
  };
}

// Example task
const task: TaskWithSkill = {
  id: 'task-123',
  title: 'Generate promotional video',
  description: 'Create a 60-second video for product launch',
  skill: {
    name: 'video-generator',
    version: '1.2.0',
    parameters: {
      script: 'Introducing our revolutionary product...',
      duration: 60,
      style: 'modern',
      format: 'mp4'
    }
  }
};
```

### 7.2 Skill Loading at Runtime

```typescript
async function loadSkill(skillName: string, version?: string): Promise<Skill> {
  const query = version
    ? 'SELECT * FROM skill_versions WHERE skill_id = (SELECT id FROM skills WHERE name = $1) AND version = $2'
    : 'SELECT * FROM skill_versions WHERE skill_id = (SELECT id FROM skills WHERE name = $1) ORDER BY created_at DESC LIMIT 1';
  
  const params = version ? [skillName, version] : [skillName];
  const result = await db.query(query, params);
  
  if (!result.rows[0]) {
    throw new Error(`Skill not found: ${skillName}`);
  }
  
  return parseSkillContent(result.rows[0].content);
}
```

### 7.3 Skill Context Injection

```typescript
async function executeTaskWithSkill(task: TaskWithSkill): Promise<void> {
  if (task.skill) {
    const skill = await loadSkill(task.skill.name, task.skill.version);
    
    // Inject skill context into prompt
    const enhancedPrompt = `
${skill.description}

## Available Tools
${skill.tools.map(t => `- ${t}`).join('\n')}

## Task
${task.description}

## Parameters
${JSON.stringify(task.skill.parameters, null, 2)}
`;
    
    await executeWithOpenCode(enhancedPrompt);
  } else {
    await executeWithOpenCode(task.description);
  }
}
```

---

## 8. Future Roadmap

### Phase 1: Foundation (Current)
- [x] Document skills strategy
- [ ] Design database schema
- [ ] Implement security scanner
- [ ] Create skill CLI commands

### Phase 2: Integration
- [ ] Integrate with ClawHub API
- [ ] Implement approval workflow
- [ ] Add skill versioning
- [ ] Create skill testing framework

### Phase 3: Advanced Features
- [ ] Skill marketplace UI
- [ ] Skill dependency management
- [ ] Skill performance metrics
- [ ] Community skill submissions

### Phase 4: Enterprise
- [ ] Private skill registry
- [ ] Role-based access control
- [ ] Audit compliance reports
- [ ] Custom skill development SDK

---

## 9. Best Practices

### 9.1 For Skill Users

| Practice | Reason |
|----------|--------|
| Always specify version | Ensures reproducibility |
| Review security scan results | Understand risks |
| Test in sandbox first | Validate behavior |
| Keep skills updated | Get security fixes |
| Use minimal permissions | Reduce attack surface |

### 9.2 For Skill Developers

| Practice | Reason |
|----------|--------|
| Document all parameters | Enable proper usage |
| Include security section | Build trust |
| Provide usage examples | Reduce friction |
| Version your skills | Enable rollback |
| Write test cases | Ensure quality |

### 9.3 For Administrators

| Practice | Reason |
|----------|--------|
| Enable security scanning | Catch threats early |
| Require approval for high-risk | Human oversight |
| Monitor skill usage | Detect anomalies |
| Regular security audits | Stay protected |
| Backup skill database | Enable recovery |

---

## 10. References

- [ClawHub Documentation](https://clawhub.openclaw.ai)
- [OpenClaw Skills Specification](https://docs.openclaw.ai/skills)
- [Nezha Database Schema](./DATABASE_SCHEMA.md)
- [Security Best Practices](./SECURITY.md)

---

_This document is part of the Nezha project documentation._
_Last updated: 2026-03-19_
