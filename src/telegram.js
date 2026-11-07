const TIMEOUT_MS = 60_000;
const MAX_RETRY_WAIT_S = 30;

export class TelegramError extends Error {}

const sleep = (seconds) => new Promise((resolve) => setTimeout(resolve, seconds * 1000));

// The token is part of every API URL, so nothing may leave here unredacted.
function redact(message, token) {
  return String(message).replaceAll(token, '[redacted]');
}

function explain(body) {
  const description = body.description ?? 'Unknown Telegram error';
  if (/chat not found/i.test(description)) {
    return `${description}. Check the chat ID. A user must have started the bot, and a group or channel must have added it.`;
  }
  if (body.error_code === 401) {
    return `${description}. The bot token is invalid or was revoked; update config.env.`;
  }
  if (/can't parse entities/i.test(description)) {
    return `${description}. In html format, escape <, > and & in text as &lt; &gt; &amp; and use only Telegram's supported tags.`;
  }
  return description;
}

export function createClient({ getToken, apiBase = 'https://api.telegram.org', fetchImpl = fetch }) {
  async function attempt(url, token, buildBody) {
    try {
      const response = await fetchImpl(url, {
        method: 'POST',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        ...buildBody(),
      });
      return await response.json();
    } catch (error) {
      const detail = error.cause?.code ?? error.message;
      if (/CERT|SIGNATURE|ISSUER/.test(detail)) {
        throw new TelegramError(
          `Could not verify Telegram's certificate (${detail}), so nothing was sent. Antivirus or a proxy may be intercepting HTTPS; Node 22.19 or later can use the certificates Windows trusts.`,
        );
      }
      throw new TelegramError(
        redact(`Could not reach Telegram (${detail}). The message may or may not have been delivered.`, token),
      );
    }
  }

  // buildBody is a function because a multipart body can only be sent once.
  async function call(method, buildBody) {
    const token = getToken();
    if (!token) {
      throw new TelegramError('No bot token found. Set TELEGRAM_BOT_TOKEN in config.env next to server.mjs.');
    }
    const url = `${apiBase}/bot${token}/${method}`;

    let body = await attempt(url, token, buildBody);
    const wait = body.parameters?.retry_after;
    if (body.error_code === 429 && wait <= MAX_RETRY_WAIT_S) {
      await sleep(wait);
      body = await attempt(url, token, buildBody);
    }
    if (!body.ok) throw new TelegramError(redact(explain(body), token));
    return body.result;
  }

  const json = (payload) => () => ({
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });

  return {
    getMe: () => call('getMe', json({})),
    sendMessage: (payload) => call('sendMessage', json(payload)),
    sendPhotoUrl: (payload) => call('sendPhoto', json(payload)),
    sendPhotoFile: (fields, bytes, filename) =>
      call('sendPhoto', () => {
        const form = new FormData();
        for (const [key, value] of Object.entries(fields)) form.set(key, String(value));
        form.set('photo', new Blob([bytes]), filename);
        return { body: form };
      }),
  };
}
