import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { CAPTION_LIMIT, splitMessage, visibleLength } from './split.js';
import { TelegramError } from './telegram.js';

const PHOTO_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const PHOTO_MAX_BYTES = 10 * 1024 * 1024;

export function normalizeChatId(chatId) {
  const id = String(chatId).trim();
  if (/^-?\d+$/.test(id) || /^@[A-Za-z][A-Za-z0-9_]{3,}$/.test(id)) return id;
  throw new TelegramError(
    `Invalid chat_id "${id}". Use a numeric ID such as 123456789 or -1001234567890, or a public @channelname.`,
  );
}

const parseMode = (format) => (format === 'html' ? { parse_mode: 'HTML' } : {});

export async function sendMessage(client, { chat_id, text, format = 'plain' }) {
  const chatId = normalizeChatId(chat_id);
  const parts = splitMessage(text, format);
  if (parts.length === 0) throw new TelegramError('Message text is empty.');

  const ids = [];
  for (const [index, part] of parts.entries()) {
    try {
      const sent = await client.sendMessage({ chat_id: chatId, text: part, ...parseMode(format) });
      ids.push(sent.message_id);
    } catch (error) {
      // Earlier parts were delivered, so a blind retry would duplicate them.
      if (index === 0) throw error;
      throw new TelegramError(
        `Sent ${index} of ${parts.length} parts, then failed: ${error.message} Do not resend the parts already delivered.`,
      );
    }
  }
  return parts.length === 1
    ? `Sent to chat ${chatId} (message ID ${ids[0]}).`
    : `Sent to chat ${chatId} in ${parts.length} parts (message IDs ${ids.join(', ')}).`;
}

async function readPhoto(filePath) {
  if (!path.isAbsolute(filePath)) {
    throw new TelegramError(`Photo path must be absolute or an http(s) URL: ${filePath}`);
  }
  const extension = path.extname(filePath).toLowerCase();
  if (!PHOTO_EXTENSIONS.has(extension)) {
    throw new TelegramError(`Unsupported photo type "${extension}". Use .jpg, .jpeg, .png or .webp.`);
  }
  let info;
  try {
    info = await stat(filePath);
  } catch {
    throw new TelegramError(`Photo file not found: ${filePath}`);
  }
  if (info.size > PHOTO_MAX_BYTES) {
    throw new TelegramError(`Photo is ${(info.size / 1048576).toFixed(1)} MB; Telegram's limit is 10 MB.`);
  }
  return readFile(filePath);
}

export async function sendPhoto(client, { chat_id, photo, caption, format = 'plain' }) {
  const chatId = normalizeChatId(chat_id);
  if (caption && visibleLength(caption, format) > CAPTION_LIMIT) {
    throw new TelegramError(
      `Caption is too long (limit ${CAPTION_LIMIT} characters). Shorten it, or send the text with send_message.`,
    );
  }
  const fields = {
    chat_id: chatId,
    ...(caption ? { caption, ...parseMode(format) } : {}),
  };

  const sent = /^https?:\/\//i.test(photo)
    ? await client.sendPhotoUrl({ ...fields, photo })
    : await client.sendPhotoFile(fields, await readPhoto(photo), path.basename(photo));
  return `Photo sent to chat ${chatId} (message ID ${sent.message_id}).`;
}
