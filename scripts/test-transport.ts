import { HttpTransport } from '../src/core/transports/index.js';

async function main() {
  const transport = new HttpTransport('http://localhost:4096', 60000);
  console.log('Creating session...');
  const sessionId = await transport.createSession();
  console.log('Session:', sessionId);
  console.log('Sending message...');
  const response = await transport.sendMessage('Say hi');
  console.log('Response:', response.substring(0, 200));
}

main().catch(console.error);
