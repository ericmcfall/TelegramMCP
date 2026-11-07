import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

// Runs the built server.mjs over stdio against a local fake Telegram API.
const serverPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'server.mjs');
const requests = [];
let telegram;
let client;
let env;

before(async () => {
  telegram = createServer((request, response) => {
    let body = '';
    request.on('data', (chunk) => (body += chunk));
    request.on('end', () => {
      requests.push({ url: request.url, body });
      const result = request.url.endsWith('/getMe') ? { username: 'fake_bot' } : { message_id: 42 };
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ ok: true, result }));
    });
  });
  await new Promise((resolve) => telegram.listen(0, '127.0.0.1', resolve));

  env = {
    ...process.env,
    TELEGRAM_BOT_TOKEN: '123:TEST',
    TELEGRAM_API_BASE: `http://127.0.0.1:${telegram.address().port}`,
  };
  client = new Client({ name: 'test', version: '1.0.0' });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [serverPath], env }));
});

after(async () => {
  await client.close();
  telegram.close();
});

test('exposes exactly the two send tools', async () => {
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((tool) => tool.name).sort(), ['send_message', 'send_photo']);
});

test('send_message reaches Telegram', async () => {
  const result = await client.callTool({ name: 'send_message', arguments: { chat_id: 123, text: 'hello' } });
  assert.equal(result.isError, undefined);
  assert.match(result.content[0].text, /message ID 42/);
  const last = requests.at(-1);
  assert.equal(last.url, '/bot123:TEST/sendMessage');
  assert.deepEqual(JSON.parse(last.body), { chat_id: '123', text: 'hello' });
});

test('chat_id is required', async () => {
  const result = await client.callTool({ name: 'send_message', arguments: { text: 'hello' } });
  assert.equal(result.isError, true);
});

test('bad input comes back as a tool error', async () => {
  const result = await client.callTool({ name: 'send_photo', arguments: { chat_id: 1, photo: 'relative.png' } });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /must be absolute/);
});

test('--check verifies the token without sending a message', async () => {
  const before = requests.length;
  const { stdout } = await promisify(execFile)(process.execPath, [serverPath, '--check'], { env });
  assert.match(stdout, /Token OK: connected as @fake_bot/);
  assert.equal(requests.length, before + 1);
  assert.ok(requests.at(-1).url.endsWith('/getMe'));
});
