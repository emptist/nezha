import { CliTransport } from '../src/core/transports/index.js';

async function main() {
  const transport = new CliTransport('http://localhost:4096', 30000);
  console.log('Sending message via CLI...');
  const response = await transport.sendMessage('Say hello');
  console.log('Response:', response.substring(0, 200));
}

main().catch(console.error);
