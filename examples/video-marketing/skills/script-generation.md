# Script Generation Skill

## Purpose
Create engaging video scripts optimized for viewer retention and engagement.

## Trigger Phrases
- "generate video script"
- "write script for video"
- "create script about"
- "draft video content"

## Steps
1. Analyze topic and target audience
2. Research key points and data
3. Create hook (first 10 seconds)
4. Structure main content
5. Add retention elements
6. Include call-to-action
7. Format for platform

## Tools Required
- AI text generation (GPT-4, Claude)
- Fact-checking tools
- Script templates
- Platform guidelines

## Parameters
| Parameter | Type | Description |
|-----------|------|-------------|
| topic | string | Video topic |
| duration | number | Target duration in seconds |
| style | string | Tutorial, entertainment, news |
| platform | string | YouTube, TikTok, Instagram |
| tone | string | Professional, casual, humorous |

## Script Structure

### Hook (0-10 seconds)
- Attention-grabbing statement
- Promise of value
- Question or bold claim

### Intro (10-30 seconds)
- Channel introduction
- Video overview
- What viewer will learn

### Main Content
- Segmented into digestible chunks
- Pattern interrupts every 2-3 minutes
- Visual cues and examples

### Conclusion
- Summary of key points
- Call-to-action
- Teaser for next video

## Output
- Full script with timestamps
- B-roll suggestions
- Graphics cues
- Music recommendations

## Anti-Patterns
- Don't start with "Hey guys, welcome back"
- Don't make intro longer than 30 seconds
- Don't use jargon without explanation
- Don't forget the call-to-action

## Examples

### Tutorial script
```
User: Generate a 5-minute tutorial script about Python list comprehensions

AI: Creating tutorial script for Python list comprehensions:

[0:00-0:08] HOOK
"Here's a one-line Python trick that replaces 10 lines of code."

[0:08-0:25] INTRO
"I'm [Name], and today you'll learn list comprehensions - 
the Python feature that will make your code cleaner and faster."

[0:25-1:30] BASICS
"First, let's see the traditional way..."
[Show traditional for loop]
"Now with list comprehension..."
[Show one-liner]
"Same result, 80% less code."

[1:30-3:00] SYNTAX BREAKDOWN
"Here's the pattern: [expression for item in iterable]"
[Visual diagram of syntax]

[3:00-4:30] PRACTICAL EXAMPLES
"Let's filter even numbers..."
"Transform strings to uppercase..."
"Create a dictionary..."

[4:30-5:00] CONCLUSION
"List comprehensions are powerful but don't overuse them.
Subscribe for more Python tips!"
```

### Marketing script
```
User: Create a 60-second product showcase script

AI: Creating product showcase script:

[0:00-0:05] HOOK
"What if I told you this one tool could save you 10 hours a week?"

[0:05-0:20] PROBLEM
"You're probably spending hours on [task].
It's tedious, repetitive, and frankly, a waste of your time."

[0:20-0:45] SOLUTION
"Introducing [Product] - the tool that automates [task]
in just 3 clicks. Here's how it works..."
[Demo walkthrough]

[0:45-0:55] SOCIAL PROOF
"Over 10,000 users have already saved an average of 10 hours weekly."

[0:55-1:00] CTA
"Click the link below to try it free for 14 days.
No credit card required."
```
