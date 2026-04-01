import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function testPi() {
  console.log('Testing pi with GitHub Copilot...');

  try {
    const { stdout, stderr } = await execAsync(
      'pi execute --model github-copilot:claude-sonnet-4.5 --print "say hi"',
      { timeout: 60000 }
    );
    console.log('Success!');
    console.log('Output:', stdout.substring(0, 500));
    if (stderr) console.log('Stderr:', stderr.substring(0, 200));
  } catch (e) {
    console.log('Error:', e.message);
  }
}

testPi();
