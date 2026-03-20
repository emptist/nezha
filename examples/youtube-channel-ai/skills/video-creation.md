# Video Creation Skill

## Purpose
Generate video content from text scripts using AI tools.

## Trigger Phrases
- "create video"
- "generate video content"
- "make a video about"
- "produce video"

## Steps
1. Parse topic and requirements
2. Generate script using AI
3. Create storyboard
4. Generate visuals
5. Add voiceover
6. Export final video

## Tools Required
- Text-to-video AI (e.g., Runway, Pika, Sora)
- Voice synthesis (e.g., ElevenLabs, OpenAI TTS)
- Video editing (e.g., FFmpeg, MoviePy)

## Parameters
| Parameter | Type | Description |
|-----------|------|-------------|
| topic | string | Video topic |
| duration | number | Target duration in seconds |
| style | string | Visual style (realistic, animated, etc.) |
| voice | string | Voice type for narration |

## Output
- Video file (MP4)
- Script document
- Thumbnail suggestions

## Anti-Patterns
- Don't create videos without script approval
- Don't skip copyright checks
- Don't ignore platform guidelines
- Don't use unlicensed music

## Examples

### Creating a tutorial video
```
User: Create a 5-minute tutorial video about Python list comprehensions

AI: I'll create a tutorial video following these steps:
1. Generate script explaining list comprehensions
2. Create code examples with visualizations
3. Add voiceover with clear explanations
4. Export as MP4 for YouTube upload
```

### Creating a news summary
```
User: Make a video about today's tech news

AI: I'll create a news summary video:
1. Fetch latest tech news from APIs
2. Summarize top 5 stories
3. Generate visuals for each story
4. Add professional voiceover
5. Export for upload
```
