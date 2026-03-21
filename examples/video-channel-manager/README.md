# Video Channel Manager - Multi-Platform Example Client Project

This is an example client project demonstrating how to use Nezha for managing AI-made video channels across multiple platforms (YouTube, Bilibili, etc.).

## Project Structure

```
video-channel-manager/
├── skills/
│   ├── video-creation.md
│   ├── video-upload.md
│   ├── thumbnail-design.md
│   └── analytics-review.md
├── platforms/
│   ├── youtube/
│   │   └── adapter.yaml
│   └── bilibili/
│       └── adapter.yaml
├── tasks/
│   └── weekly-content-plan.md
├── config.yaml
└── README.md
```

## Supported Platforms

| Platform | Status | Runner |
|----------|--------|--------|
| YouTube | ✅ Supported | `youtube-runner` |
| Bilibili | 🚧 Planned | `bilibili-runner` |

## Platform Adapters

Each platform has its own adapter that handles platform-specific logic:

### YouTube Adapter
- **Upload API**: YouTube Data API v3
- **Metadata**: Title (100 chars), Description (5000 chars), Tags (500 chars total)
- **Thumbnail**: 1280x720px, max 2MB
- **Analytics**: YouTube Analytics API

### Bilibili Adapter
- **Upload API**: Bilibili Creative Center API
- **Metadata**: Title (80 chars), Description (2000 chars), Tags (12 tags max)
- **Thumbnail**: 960x600px, max 2MB
- **Analytics**: Bilibili Creator Analytics

## How It Uses Nezha

### 1. Task Management
- Create content creation tasks
- Track video production workflow
- Schedule uploads across platforms

### 2. Issue Tracking
- Report video processing errors
- Track copyright claims
- Monitor platform-specific guideline issues

### 3. Review System
- AI reviews video scripts
- Quality control for thumbnails
- Performance review of published content

### 4. DLQ Integration
- Failed upload retries
- API rate limit handling
- Network error recovery

## Skills for Video Channel Management

### video-creation.md
```markdown
# Video Creation Skill

## Purpose
Generate video content from text scripts using AI tools.

## Trigger Phrases
- "create video"
- "generate video content"
- "make a video about"

## Steps
1. Parse topic and requirements
2. Generate script using AI
3. Create storyboard
4. Generate visuals
5. Add voiceover
6. Export final video

## Tools Required
- Text-to-video AI (e.g., Runway, Pika)
- Voice synthesis (e.g., ElevenLabs)
- Video editing (e.g., FFmpeg)

## Anti-Patterns
- Don't create videos without script approval
- Don't skip copyright checks
- Don't ignore platform guidelines
```

### video-upload.md
```markdown
# Video Upload Skill

## Purpose
Upload videos to video platforms with proper metadata.

## Trigger Phrases
- "upload video"
- "publish to platform"
- "schedule upload"

## Steps
1. Validate video file
2. Generate title and description
3. Add tags and categories
4. Set thumbnail (platform-specific size)
5. Schedule or publish
6. Verify upload success

## Platform-Specific Notes
- YouTube: Title max 100 chars, thumbnail 1280x720
- Bilibili: Title max 80 chars, thumbnail 960x600

## Tools Required
- Platform-specific API client
- OAuth2 credentials
- Thumbnail generator

## Anti-Patterns
- Don't upload without metadata
- Don't ignore upload errors
- Don't skip thumbnail optimization
```

## Integration with Nezha

### CLI Commands

```bash
# Create a video creation task
node dist/cli/index.js task-add "Create weekly news video" "Generate 5-minute news summary video" 7

# Track upload issues
node dist/cli/index.js issue-add "Upload failed" "Video processing timeout" --type bug --severity high

# Review video quality
node dist/cli/index.js review-add "video-quality" "Weekly video quality check" --score 8
```

### Database Connection

The client project connects to Nezha's PostgreSQL database:

```typescript
import { DatabaseClient } from 'nezha';

const db = new DatabaseClient({
  host: 'localhost',
  database: 'nezha',
  user: 'postgres',
});

// Create tasks for video production
await db.query(`
  INSERT INTO tasks (title, description, category, priority)
  VALUES ($1, $2, 'content', $3)
`, ['Create tutorial video', 'Step-by-step guide', 7]);
```

## Workflow Example

```
┌─────────────────────────────────────────────────────────────┐
│               VIDEO CHANNEL MANAGER WORKFLOW                 │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. CONTENT PLANNING                                        │
│     ├── Create task: "Weekly content plan"                  │
│     ├── AI generates topic ideas                            │
│     └── Review and approve topics                           │
│                                                              │
│  2. VIDEO CREATION                                          │
│     ├── Task: "Create video about X"                        │
│     ├── Skill: video-creation.md                            │
│     ├── Generate script                                     │
│     ├── Create visuals                                      │
│     └── Export video                                        │
│                                                              │
│  3. PLATFORM UPLOAD                                         │
│     ├── Task: "Upload video X to [platform]"                │
│     ├── Skill: video-upload.md                              │
│     ├── Platform adapter: youtube/bilibili                  │
│     ├── Add platform-specific metadata                      │
│     ├── Schedule publish                                    │
│     └── Verify success                                      │
│                                                              │
│  4. ANALYTICS REVIEW                                        │
│     ├── Task: "Weekly analytics review"                     │
│     ├── Skill: analytics-review.md                          │
│     ├── Pull platform analytics                             │
│     ├── Generate report                                     │
│     └── Create improvement issues                           │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Multi-Platform Upload Example

```typescript
import { VideoChannelManager } from '@nezha/video-channel-manager';

const manager = new VideoChannelManager();

// Upload to multiple platforms
await manager.upload({
  video: '/path/to/video.mp4',
  platforms: ['youtube', 'bilibili'],
  metadata: {
    title: 'My Awesome Video',
    description: 'This is a great video about...',
    tags: ['tutorial', 'how-to'],
  },
  thumbnails: {
    youtube: '/path/to/youtube-thumbnail.png',
    bilibili: '/path/to/bilibili-thumbnail.png',
  },
});
```

## Getting Started

1. Clone Nezha repository
2. Set up PostgreSQL database
3. Create client project directory
4. Add skills to Nezha skills table
5. Configure platform adapters
6. Start creating tasks

## Benefits

- **Multi-Platform Support**: Manage YouTube, Bilibili, and more from one place
- **AI Collaboration**: Multiple AIs work on different aspects
- **Task Tracking**: Never lose track of content pipeline
- **Error Recovery**: DLQ handles upload failures
- **Quality Control**: Review system ensures content quality
- **Continuous Improvement**: Learn from analytics and feedback
- **Platform Abstraction**: Write once, publish everywhere
