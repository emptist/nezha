# Content Research Skill

## Purpose
Discover trending topics and keywords for video content creation.

## Trigger Phrases
- "research trending topics"
- "find content ideas"
- "what should I make videos about"
- "analyze competitors"

## Steps
1. Define target niche and audience
2. Query Google Trends for trending topics
3. Analyze YouTube trending in category
4. Research competitor content
5. Calculate keyword difficulty
6. Generate content recommendations

## Tools Required
- Google Trends API
- YouTube Data API
- Keyword research tools (Ahrefs, SEMrush)
- Competitor analysis tools

## Parameters
| Parameter | Type | Description |
|-----------|------|-------------|
| niche | string | Target content niche |
| count | number | Number of topics to return |
| timeframe | string | Time period (7d, 30d, 90d) |
| competitors | array | List of competitor channels |

## Output
- List of trending topics
- Keyword difficulty scores
- Competitor content gaps
- Content recommendations

## Anti-Patterns
- Don't ignore seasonal trends
- Don't copy competitor content directly
- Don't target only high-difficulty keywords
- Don't skip audience research

## Examples

### Finding trending topics
```
User: Research trending topics in tech niche

AI: I'll research trending topics in technology:
1. Query Google Trends for tech category
2. Analyze YouTube trending tech videos
3. Check competitor recent uploads
4. Calculate keyword opportunities

Results:
1. "AI Tools 2026" - High interest, Medium difficulty
2. "ChatGPT Alternatives" - Rising trend, Low difficulty
3. "Cybersecurity Tips" - Steady interest, Medium difficulty
4. "Tech Under $100" - High interest, Low difficulty
5. "Coding Tutorials" - Evergreen, High competition

Recommendation: Focus on "AI Tools 2026" and "ChatGPT Alternatives" for best growth potential.
```

### Competitor analysis
```
User: Analyze competitor TechChannel for content gaps

AI: Analyzing TechChannel for content opportunities:
1. Fetch last 30 days of uploads
2. Identify top performing videos
3. Find topics they haven't covered
4. Calculate opportunity score

Content Gaps Found:
- "AI Video Editing" - They have no videos on this
- "Budget Tech Setup" - Only 1 video, high demand
- "Mobile Gaming Setup" - Trending, not covered

Recommendation: Create content on these gaps for competitive advantage.
```
