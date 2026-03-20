# YouTube Runner

AI-powered YouTube channel management using the Nezha framework.

## Features

- **Video Creation**: Generate video content with AI
- **Upload Management**: Upload and schedule videos to YouTube
- **Analytics Review**: Monitor video performance with automated alerts
- **Nezha Integration**: Full integration with task management, issue tracking, and memory

## Installation

```bash
cd examples/youtube-runner
npm install
npm run build
```

## Configuration

1. Copy `.env.example` to `.env`
2. Fill in your YouTube API credentials
3. Adjust `config.yaml` as needed

## Usage

### Create and Upload a Video

```bash
npm start create "AI Automation Tutorial"
```

### Schedule a Video

```bash
npm start schedule "Weekly Update" "2026-03-25T09:00:00Z"
```

### Review Analytics

```bash
npm start review yt_123 abc456 xyz789
```

### View Pending Tasks

```bash
npm start tasks
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    YOUTUBE RUNNER                            │
├─────────────────────────────────────────────────────────────┤
│  CLI ──► YouTubeRunner ──► VideoCreator                      │
│                         ├──► UploadManager                   │
│                         └──► AnalyticsReviewer               │
├─────────────────────────────────────────────────────────────┤
│              Nezha Integration Layer                         │
│  • Task Management  • Issue Tracking  • Memory               │
└─────────────────────────────────────────────────────────────┘
```

## Nezha Integration

YouTube Runner integrates with Nezha's core systems:

| Feature | Usage |
|---------|-------|
| Tasks | Track video creation and upload progress |
| Issues | Alert on analytics problems |
| Memory | Store learnings about video performance |
| Skills | Load approved skills from database |

## Development

```bash
npm run dev create "Test Video"
npm test
npm run typecheck
```

## License

MIT
