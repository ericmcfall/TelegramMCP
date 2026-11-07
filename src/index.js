import path from 'node:path';
import tls from 'node:tls';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { loadToken } from './config.js';
import { createClient, TelegramError } from './telegram.js';
import { sendMessage, sendPhoto } from './tools.js';

// Antivirus and corporate proxies re-sign HTTPS with a root that only the OS
// trusts, and Node ignores the OS store by default. Needs Node 22.19 or later.
if (tls.setDefaultCACertificates) {
  tls.setDefaultCACertificates([...tls.getCACertificates('default'), ...tls.getCACertificates('system')]);
}

const configPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'config.env');
const client = createClient({
  getToken: () => loadToken(configPath),
  apiBase: process.env.TELEGRAM_API_BASE,
});

// Confirms the token works without sending anything. Used by install.ps1.
if (process.argv.includes('--check')) {
  try {
    const bot = await client.getMe();
    console.log(`Token OK: connected as @${bot.username}`);
  } catch (error) {
    console.error(`Token check failed: ${error.message}`);
    process.exitCode = 1;
  }
} else {
  const server = new McpServer({ name: 'telegram', version: '1.0.0' });

  const chatId = z
    .union([z.string(), z.number().int()])
    .describe('Destination chat: a numeric ID, or @channelname for a public channel. Never guess this; ask the user if it is unknown.');
  const format = z
    .enum(['plain', 'html'])
    .default('plain')
    .describe("'plain' sends text as is. 'html' uses Telegram HTML (<b>, <i>, <u>, <s>, <code>, <pre>, <a href>, <blockquote>); escape <, > and & in text as &lt; &gt; &amp;.");

  const run = (action) => async (args) => {
    try {
      return { content: [{ type: 'text', text: await action(client, args) }] };
    } catch (error) {
      if (!(error instanceof TelegramError)) throw error;
      return { content: [{ type: 'text', text: error.message }], isError: true };
    }
  };
  const annotations = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true };

  server.registerTool(
    'send_message',
    {
      title: 'Send Telegram message',
      description: 'Send a text message through the Telegram bot. Text over 4096 characters is split into several messages.',
      inputSchema: { chat_id: chatId, text: z.string().min(1).describe('Message text'), format },
      annotations,
    },
    run(sendMessage),
  );

  server.registerTool(
    'send_photo',
    {
      title: 'Send Telegram photo',
      description: 'Send a photo through the Telegram bot from an absolute local path (.jpg, .jpeg, .png, .webp, up to 10 MB) or an http(s) URL.',
      inputSchema: {
        chat_id: chatId,
        photo: z.string().min(1).describe('Absolute local file path or http(s) URL'),
        caption: z.string().optional().describe('Optional caption, up to 1024 characters'),
        format,
      },
      annotations,
    },
    run(sendPhoto),
  );

  await server.connect(new StdioServerTransport());
}
