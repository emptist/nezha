# Performance Analysis Skill

## Purpose
Analyze video performance metrics and generate actionable insights for growth.

## Trigger Phrases
- "analyze video performance"
- "review analytics"
- "check channel stats"
- "generate performance report"

## Steps
1. Fetch analytics data from platform
2. Calculate key performance metrics
3. Compare with previous period
4. Identify top and bottom performers
5. Analyze retention curves
6. Generate improvement recommendations
7. Create actionable tasks

## Tools Required
- YouTube Analytics API
- TikTok Analytics
- Instagram Insights
- Data visualization tools

## Parameters
| Parameter | Type | Description |
|-----------|------|-------------|
| date_range | string | Period to analyze (7d, 30d, 90d) |
| metrics | array | Metrics to track |
| compare | boolean | Compare with previous period |
| videos | array | Specific videos to analyze |

## Key Metrics

| Metric | Good | Great | Excellent |
|--------|------|-------|-----------|
| CTR | 2-5% | 5-10% | 10%+ |
| Retention | 40-50% | 50-60% | 60%+ |
| Watch Time | Growing | +10% | +20% |
| Engagement | 3-5% | 5-10% | 10%+ |

## Output
- Performance summary
- Trend analysis
- Top/bottom performers
- Retention insights
- Improvement recommendations
- Action items

## Anti-Patterns
- Don't focus only on views
- Don't ignore retention data
- Don't skip competitive analysis
- Don't neglect audience feedback

## Examples

### Weekly channel analysis
```
User: Analyze last week's channel performance

AI: Generating weekly performance report:

═══════════════════════════════════════════════════════════
WEEKLY PERFORMANCE SUMMARY (Mar 14-21, 2026)
═══════════════════════════════════════════════════════════

OVERVIEW:
┌─────────────────┬──────────┬──────────┬─────────┐
│ Metric          │ This Week│ Last Week│ Change  │
├─────────────────┼──────────┼──────────┼─────────┤
│ Views           │ 45,230   │ 38,450   │ +17.6%  │
│ Watch Time      │ 2,847 hr │ 2,312 hr │ +23.1%  │
│ Subscribers     │ +312     │ +245     │ +27.3%  │
│ Revenue         │ $127.50  │ $98.20   │ +29.8%  │
└─────────────────┴──────────┴──────────┴─────────┘

TOP PERFORMERS:
1. "Python Tutorial" - 12,450 views, 8.2% CTR, 62% retention
2. "AI Tools 2026" - 8,320 views, 7.1% CTR, 58% retention
3. "Coding Tips" - 5,890 views, 6.8% CTR, 55% retention

BOTTOM PERFORMERS:
1. "News Update" - 450 views, 2.1% CTR, 35% retention
2. "Channel Update" - 890 views, 3.2% CTR, 42% retention

RETENTION ANALYSIS:
- Average retention: 52% (+3% vs last week)
- Common drop-off: 0:15-0:30 (intro section)
- Best retention: Tutorial videos (58% avg)

TRAFFIC SOURCES:
- Suggested videos: 42%
- Search: 28%
- Browse features: 18%
- External: 12%

RECOMMENDATIONS:
1. [HIGH] Improve thumbnail for "News Update" - CTR is 2.1%
2. [HIGH] Shorten intros to under 15 seconds
3. [MEDIUM] Create more tutorial content (best retention)
4. [LOW] Optimize video descriptions for search

ACTION ITEMS CREATED:
- Task: Redesign "News Update" thumbnail
- Task: Update intro template to 10 seconds max
- Issue: Low CTR on news content
```

### Video-specific analysis
```
User: Why did my last video underperform?

AI: Analyzing video "Tech Review - March 2026":

PERFORMANCE:
- Views: 2,340 (Expected: 5,000+)
- CTR: 2.8% (Below average: 5%)
- Retention: 38% (Below average: 52%)

RETENTION CURVE ANALYSIS:
- 0:00-0:15: 100% → 85% (Normal)
- 0:15-0:45: 85% → 45% (PROBLEM: Intro too long)
- 0:45-2:00: 45% → 38% (Content not engaging)
- 2:00+: 38% → 15% (Lost audience)

TRAFFIC ANALYSIS:
- Impressions: 83,571 (Good reach)
- Click-through: 2,340 (Low CTR)
- Issue: Thumbnail/title not compelling

COMMENTS SENTIMENT:
- "Too long intro" (12 comments)
- "Where's the actual review?" (8 comments)
- "Good content but slow start" (5 comments)

ROOT CAUSES:
1. Thumbnail doesn't match content
2. Intro is 45 seconds (should be 10-15)
3. Title is vague ("Tech Review")
4. Content pacing is slow

RECOMMENDATIONS:
1. A/B test new thumbnail with product visible
2. Re-edit to cut intro to 15 seconds
3. Update title to "Best Tech Gadgets March 2026"
4. Add chapter markers for navigation

Would you like me to create tasks to implement these fixes?
```
