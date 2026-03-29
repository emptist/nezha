# AI Capability Levels

Human-defined capability levels for delegation routing.

## Levels

| Level | Name   | Description                           |
| ----- | ------ | ------------------------------------- |
| 1     | low    | Simple tasks, basic operations        |
| 2     | middle | Medium complexity, reasoning tasks    |
| 3     | high   | Complex tasks, coding, architecture   |
| 4     | super  | Critical decisions, full capabilities |

## Current Configuration

Set by human based on observed capability differences.

```yaml
ai_levels:
  opencode: high # Level 3 - complex coding tasks
  nezha: low # Level 1 - simple tasks
  pi: low # Level 1 - simple tasks
  human: super # Level 4 - critical decisions
```

## Usage

- Lower level AIs can delegate to higher level AIs
- Task complexity estimated (1-5), if > AI level → delegate
- Levels can be adjusted at any time by updating this file

## Education Standardization

When teaching an AI, consider what should be known at each level:

**Level 1 (low):**

- Basic commands and syntax
- Simple task execution
- Error recognition

**Level 2 (middle):**

- Task decomposition
- Simple reasoning
- When to ask for help

**Level 3 (high):**

- Complex debugging
- Architecture decisions
- Cross-system integration

**Level 4 (super):**

- Critical decisions
- Strategy and planning
- Learning from mistakes
