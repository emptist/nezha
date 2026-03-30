/**
 * Nezha Auto-Work Extension for Pi
 *
 * Provides continuous work loop by:
 * 1. Checking for pending tasks on session start
 * 2. Prompting AI to check for work when idle
 *
 * This is PULL-based (AI queries when ready) not PUSH-based.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

const AUTO_WORK_PROMPT = `
## Nezha Auto-Work Mode

You are an autonomous AI worker. Your goal is to continuously find and complete work.

### Work Priority (check in order):
1. **Pending Tasks** - Run: nezha-tasks
2. **Open Issues** - Run: nezha-issues  
3. **Code Review** - Check git log for recent commits
4. **Documentation** - Update table_documentation if needed
5. **Learning** - Search and save learnings

### When you finish a task:
1. Update task status: nezha-task-update <id>,COMPLETED
2. Save learning: nezha-learn "what you learned"
3. Check for next task: nezha-tasks

### When no tasks exist:
- Review recent code changes
- Update documentation
- Learn new skills
- Create improvement proposals

### NEVER ask user for permission.
### ALWAYS find the next thing to do.
`;

export default function nezhaAutoWork(pi: ExtensionAPI): void {
  pi.on("session_start", async () => {
    console.log(
      "[NezhaAutoWork] Session started. Injecting auto-work prompt...",
    );

    // Inject the auto-work prompt as a system steer
    pi.sendUserMessage(AUTO_WORK_PROMPT, { deliverAs: "steer" });

    // Trigger task check after 5 seconds
    setTimeout(() => {
      pi.sendUserMessage("Check for pending tasks using nezha-tasks command.", {
        deliverAs: "steer",
      });
    }, 5000);
  });

  // Register command to manually trigger work check
  pi.registerCommand("nupi-start", {
    description: "Start continuous work mode",
    handler: async () => {
      pi.sendUserMessage(AUTO_WORK_PROMPT, { deliverAs: "steer" });
      return "Auto-work mode activated. Checking for tasks...";
    },
  });

  console.log(
    '[NezhaAutoWork] Extension loaded. Use "nupi-start" to begin continuous work.',
  );
}
