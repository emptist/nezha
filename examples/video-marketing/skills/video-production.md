# Video Production Skill

## Purpose
Automated video creation pipeline from script to final export.

## Trigger Phrases
- "produce video"
- "create video from script"
- "generate video"
- "make a video"

## Steps
1. Parse script and requirements
2. Generate voiceover audio
3. Create visual assets
4. Assemble video timeline
5. Add background music
6. Apply brand overlays
7. Export final video

## Tools Required
- Text-to-video AI (Runway, Pika, Sora)
- Voice synthesis (ElevenLabs, OpenAI TTS)
- Video editing (FFmpeg, MoviePy)
- Stock footage APIs (Pexels, Pixabay)

## Parameters
| Parameter | Type | Description |
|-----------|------|-------------|
| script | string | Video script content |
| duration | number | Target duration in seconds |
| style | string | realistic, animated | whiteboard |
| voice | string | Voice ID for narration |
| music | string | Background music style |
| branding | object | Logo, colors, fonts |

## Output
- Video file (MP4, 1080p)
- Thumbnail suggestions
- Caption file (SRT)

## Anti-Patterns
- Don't use unlicensed music
- Don't skip audio quality checks
- Don't ignore platform requirements
- Don't export without quality review

## Examples

### Tutorial video production
```
User: Produce a 5-minute Python tutorial video

AI: Starting video production pipeline:

1. VOICEOVER
   - Generating narration with ElevenLabs
   - Voice: Professional male
   - Duration: 4:45

2. VISUALS
   - Code screenshots with syntax highlighting
   - Animated diagrams for concepts
   - Screen recordings of examples

3. ASSEMBLY
   - Syncing audio to visuals
   - Adding transitions between sections
   - Background music: Lo-fi beats (low volume)

4. BRANDING
   - Channel logo intro (3 seconds)
   - Lower third name display
   - End screen with subscribe CTA

5. EXPORT
   - Resolution: 1920x1080
   - Format: MP4 (H.264)
   - File size: ~150MB

Video ready for upload: tutorial_python_lists.mp4
```

### Marketing video production
```
User: Create a 60-second product showcase

AI: Creating product showcase video:

1. VOICEOVER
   - Energetic, persuasive tone
   - Duration: 58 seconds

2. VISUALS
   - Product shots (3 angles)
   - Lifestyle footage
   - Text overlays for key benefits
   - Customer testimonial clips

3. EFFECTS
   - Smooth transitions
   - Zoom effects on product
   - Color grading for brand consistency

4. MUSIC
   - Upbeat background track
   - Volume ducking for voiceover

5. EXPORT
   - Square format (1:1) for Instagram
   - Vertical format (9:16) for TikTok
   - Standard format (16:9) for YouTube

Videos ready: product_showcase_*.mp4 (3 versions)
```
