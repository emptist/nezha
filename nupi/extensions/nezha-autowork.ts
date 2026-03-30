/**
 * NuPI Auto-Work Extension for Pi
 *
 * Provides continuous work loop by:
 * 1. Checking for pending tasks on session start
 * 2. Prompting AI to check for work when idle
 *
 * This is PULL-based (AI queries when ready) not PUSH-based.
 */

import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';

const AUTO_WORK_PROMPT = `
## NuPI Auto-Work Mode

You are NuPI (Nezha united with PI), an autonomous AI worker.
Your goal: continuously find and complete work WITHOUT asking user.

### Work Priority (check in order):
1. **Pending Tasks** - Run: nupi-tasks
2. **Open Issues** - Run: nupi-issues
3. **Code Review** - Check git log for recent commits
4. **Documentation** - Update table_documentation if needed
5. **Learning** - Search memory: nupi-search <keyword>

### Task Workflow:
1. Run: nupi-tasks → pick highest priority
2. Run: nupi-task-take <id> → claim it
3. Do the work
4. Run: nupi-task-done <id> → complete
5. Run: nupi-learn "<what you learned>"

### NEVER ask user for permission.
### ALWAYS find the next thing to do.
### Work autonomously for 8 hours if needed.
`;

export default function nezhaAutoWork(pi: ExtensionAPI): void {
  pi.on('session_start', async () => {
    console.log('[NuPI] Auto-work mode starting...');

    pi.sendUserMessage(AUTO_WORK_PROMPT, { deliverAs: 'steer' });

    setTimeout(() => {
      pi.sendUserMessage('Run: nupi-status to see current state, then nupi-work to start.', {
        deliverAs: 'steer',
      });
    }, 5000);
  });

  pi.registerCommand('nupi-start', {
    description: 'Start continuous work mode',
    handler: async () => {
      pi.sendUserMessage(AUTO_WORK_PROMPT, { deliverAs: 'steer' });
      return 'Auto-work mode activated. Run nupi-work to start!';
    },
  });

  console.log('[NuPI] Auto-work loaded. Use "nupi-start" to begin.');
}
