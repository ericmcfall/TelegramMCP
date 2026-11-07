import { readFileSync } from 'node:fs';

// Read on every send, so adding or replacing the token needs no restart.
export function loadToken(configPath) {
  if (process.env.TELEGRAM_BOT_TOKEN) return process.env.TELEGRAM_BOT_TOKEN.trim();

  let contents;
  try {
    contents = readFileSync(configPath, 'utf8');
  } catch {
    return null;
  }
  const match = contents.match(/^\s*TELEGRAM_BOT_TOKEN\s*=\s*(.*)$/m);
  const token = match?.[1].trim().replace(/^["']|["']$/g, '');
  return token && !token.startsWith('your-') ? token : null;
}
