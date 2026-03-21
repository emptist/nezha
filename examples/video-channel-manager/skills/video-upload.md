# Video Upload Skill

## Purpose
Upload videos to YouTube with proper metadata and optimization.

## Trigger Phrases
- "upload video"
- "publish to youtube"
- "schedule upload"
- "post video"

## Steps
1. Validate video file (format, size, duration)
2. Generate optimized title and description
3. Add tags and categories
4. Set or generate thumbnail
5. Schedule or publish immediately
6. Verify upload success

## Tools Required
- YouTube Data API v3
- OAuth2 credentials
- Thumbnail generator
- FFmpeg for validation

## Parameters
| Parameter | Type | Description |
|-----------|------|-------------|
| video_path | string | Path to video file |
| title | string | Video title (auto-generated if not provided) |
| description | string | Video description |
| tags | string[] | Video tags |
| category | string | YouTube category ID |
| privacy | string | public, unlisted, or private |
| schedule | datetime | Scheduled publish time |

## Output
- Video ID
- Upload status
- Published URL

## Anti-Patterns
- Don't upload without metadata
- Don't ignore upload errors
- Don't skip thumbnail optimization
- Don't violate YouTube policies

## Error Handling
| Error | Action |
|-------|--------|
| Quota exceeded | Schedule retry after quota reset |
| Invalid format | Convert video and retry |
| Network error | Add to DLQ for retry |
| Auth expired | Refresh token and retry |

## Examples

### Upload with auto-metadata
```
User: Upload the tutorial video

AI: I'll upload the video with:
1. Validate MP4 format and size
2. Generate SEO-optimized title
3. Create description with timestamps
4. Add relevant tags
5. Generate thumbnail
6. Upload and verify
```

### Schedule upload
```
User: Schedule the video for tomorrow at 9 AM

AI: I'll schedule the upload:
1. Prepare all metadata
2. Set scheduled time: tomorrow 9:00 AM
3. Queue upload task
4. Confirm scheduling
```
