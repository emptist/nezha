# AI Conversation Logging System

**Purpose**: Record all AI-to-AI conversations for learning and improvement  
**Created**: 2026-03-17  
**Format**: JSONL (JSON Lines)

---

## 📝 Conversation Log Format

Each conversation is recorded as a JSON object with the following structure:

```json
{
  "timestamp": "2026-03-17T21:30:00Z",
  "session_id": "uuid",
  "conversation_type": "task_execution|problem_solving|learning|review",
  "participants": ["AI-1", "AI-2"],
  "task": {
    "id": "task-uuid",
    "title": "Task title",
    "description": "Task description"
  },
  "messages": [
    {
      "role": "user|assistant|system",
      "content": "Message content",
      "timestamp": "2026-03-17T21:30:01Z"
    }
  ],
  "result": {
    "success": true,
    "output": "Result output",
    "artifacts": ["files created", "code changed"]
  },
  "learning": {
    "insights": ["What was learned"],
    "improvements": ["What can be improved"],
    "patterns": ["Patterns identified"]
  },
  "metadata": {
    "duration_ms": 5000,
    "tokens_used": 1000,
    "model": "gpt-4"
  }
}
```

---

## 📁 File Structure

```
conversations/
├── 2026-03-17/
│   ├── session-001.jsonl
│   ├── session-002.jsonl
│   └── session-003.jsonl
├── 2026-03-16/
│   └── session-001.jsonl
└── index.json  # Index of all conversations
```

---

## 🔄 Conversation Lifecycle

1. **Start**: When AI begins a task
2. **Record**: All messages are recorded in real-time
3. **End**: When task completes or fails
4. **Analyze**: Extract learning and insights
5. **Store**: Save to database memory table
6. **Index**: Update conversation index

---

## 🎯 Benefits

1. **Learning**: AI can learn from past conversations
2. **Improvement**: Identify patterns and improve over time
3. **Transparency**: All actions are recorded and auditable
4. **Debugging**: Can replay conversations to debug issues
5. **Knowledge**: Builds knowledge base from conversations

---

## 📊 Comparison with OpenClaw

| Feature | OpenClaw | Nezha (Before) | Nezha (After) |
|---------|----------|----------------|---------------|
| Conversation Logging | ✅ JSONL | ❌ None | ✅ JSONL |
| AI-to-AI Communication | ✅ OpenCode | ❌ Not used | ✅ OpenCode |
| Learning from Conversations | ✅ Yes | ❌ No | ✅ Yes |
| Conversation Replay | ✅ Yes | ❌ No | ✅ Yes |
| Knowledge Accumulation | ✅ Continuous | ❌ Fragmented | ✅ Continuous |

---

## 🔧 Implementation

### File: `src/core/ConversationLogger.ts`

```typescript
export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

export interface ConversationLog {
  timestamp: Date;
  session_id: string;
  conversation_type: 'task_execution' | 'problem_solving' | 'learning' | 'review';
  participants: string[];
  task: {
    id: string;
    title: string;
    description: string;
  };
  messages: ConversationMessage[];
  result?: {
    success: boolean;
    output: string;
    artifacts: string[];
  };
  learning?: {
    insights: string[];
    improvements: string[];
    patterns: string[];
  };
  metadata: {
    duration_ms: number;
    tokens_used?: number;
    model?: string;
  };
}

export class ConversationLogger {
  private currentConversation: ConversationLog | null = null;
  private logDir: string;

  constructor(logDir: string = 'conversations') {
    this.logDir = logDir;
    this.ensureLogDirectory();
  }

  startConversation(task: { id: string; title: string; description: string }): void {
    this.currentConversation = {
      timestamp: new Date(),
      session_id: uuidv4(),
      conversation_type: 'task_execution',
      participants: ['AI'],
      task,
      messages: [],
      metadata: {
        duration_ms: 0,
      },
    };
  }

  addMessage(role: 'user' | 'assistant' | 'system', content: string): void {
    if (!this.currentConversation) {
      throw new Error('No active conversation');
    }
    this.currentConversation.messages.push({
      role,
      content,
      timestamp: new Date(),
    });
  }

  endConversation(result: { success: boolean; output: string; artifacts: string[] }): void {
    if (!this.currentConversation) {
      return;
    }
    this.currentConversation.result = result;
    this.currentConversation.metadata.duration_ms = 
      Date.now() - this.currentConversation.timestamp.getTime();
    this.saveConversation();
    this.currentConversation = null;
  }

  private saveConversation(): void {
    const date = new Date().toISOString().split('T')[0];
    const logPath = path.join(this.logDir, date, `session-${this.currentConversation.session_id}.jsonl`);
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, JSON.stringify(this.currentConversation) + '\n');
  }
}
```

---

## 📋 Next Steps

1. ✅ Create ConversationLogger class
2. ⏸️ Integrate with Agent execution
3. ⏸️ Add conversation analysis
4. ⏸️ Create conversation replay mechanism
5. ⏸️ Build knowledge extraction from conversations
