import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function test() {
  console.log('Testing pi with glm-4-flash...');

  try {
    const { stdout, stderr } = await execAsync(
      'export ZAI_API_KEY=$ZHIPU_API_KEY && pi execute --model zai:glm-4-flash --print "say hi"',
      { shell: '/bin/bash', timeout: 90000 }
    );
    console.log('Success!');
    console.log('Output:', stdout.substring(0, 500));
  } catch (e) {
    console.log('Error:', e.message);
    if (e.stderr) console.log('Stderr:', e.stderr.substring(0, 200));
  }
}

test();
