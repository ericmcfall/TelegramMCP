import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createClient } from '../src/telegram.js';
import { normalizeChatId, sendMessage, sendPhoto } from '../src/tools.js';

const TOKEN = '123:SECRET';
const ok = (id = 1) => ({ ok: true, result: { message_id: id } });

// Stands in for fetch; replies from the queue and records each request.
function fakeClient(...replies) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    const reply = replies.length > 1 ? replies.shift() : replies[0];
    if (reply instanceof Error) throw reply;
    return { json: async () => reply };
  };
  return { client: createClient({ getToken: () => TOKEN, fetchImpl }), calls };
}

test('chat IDs accept numbers, group IDs and channel names', () => {
  assert.equal(normalizeChatId(123), '123');
  assert.equal(normalizeChatId('-1001234567890'), '-1001234567890');
  assert.equal(normalizeChatId('@my_channel'), '@my_channel');
});

test('invalid chat IDs are rejected before any request', async () => {
  const { client, calls } = fakeClient(ok());
  await assert.rejects(sendMessage(client, { chat_id: 'me', text: 'hi' }), /Invalid chat_id/);
  assert.equal(calls.length, 0);
});

test('html format sets parse_mode and plain does not', async () => {
  const { client, calls } = fakeClient(ok());
  await sendMessage(client, { chat_id: 1, text: '<b>hi</b>', format: 'html' });
  await sendMessage(client, { chat_id: 1, text: '<b>hi</b>' });
  assert.equal(JSON.parse(calls[0].init.body).parse_mode, 'HTML');
  assert.equal(JSON.parse(calls[1].init.body).parse_mode, undefined);
});

test('long text is sent as several messages', async () => {
  const { client, calls } = fakeClient(ok(1), ok(2));
  const result = await sendMessage(client, { chat_id: 1, text: 'word '.repeat(1000) });
  assert.equal(calls.length, 2);
  assert.match(result, /in 2 parts/);
});

test('a failure partway reports which parts were delivered', async () => {
  const { client } = fakeClient(ok(1), { ok: false, error_code: 400, description: 'Bad Request: nope' });
  await assert.rejects(
    sendMessage(client, { chat_id: 1, text: 'word '.repeat(1000) }),
    /Sent 1 of 2 parts.*Do not resend/,
  );
});

test('rate limiting waits and retries once', async () => {
  const limited = { ok: false, error_code: 429, description: 'Too Many Requests', parameters: { retry_after: 0.01 } };
  const { client, calls } = fakeClient(limited, ok(7));
  assert.match(await sendMessage(client, { chat_id: 1, text: 'hi' }), /message ID 7/);
  assert.equal(calls.length, 2);
});

test('a long rate limit wait fails instead of hanging', async () => {
  const limited = { ok: false, error_code: 429, description: 'Too Many Requests', parameters: { retry_after: 3600 } };
  const { client, calls } = fakeClient(limited);
  await assert.rejects(sendMessage(client, { chat_id: 1, text: 'hi' }), /Too Many Requests/);
  assert.equal(calls.length, 1);
});

test('the token never appears in errors', async () => {
  const network = fakeClient(new Error(`connect failed for /bot${TOKEN}/sendMessage`));
  await assert.rejects(sendMessage(network.client, { chat_id: 1, text: 'hi' }), (error) => {
    assert.ok(!error.message.includes(TOKEN));
    assert.match(error.message, /\[redacted\]/);
    return true;
  });
  const api = fakeClient({ ok: false, error_code: 400, description: `bad ${TOKEN}` });
  await assert.rejects(sendMessage(api.client, { chat_id: 1, text: 'hi' }), (error) => !error.message.includes(TOKEN));
});

test('common errors get actionable guidance', async () => {
  const notFound = fakeClient({ ok: false, error_code: 400, description: 'Bad Request: chat not found' });
  await assert.rejects(sendMessage(notFound.client, { chat_id: 1, text: 'hi' }), /must have started the bot/);
  const revoked = fakeClient({ ok: false, error_code: 401, description: 'Unauthorized' });
  await assert.rejects(sendMessage(revoked.client, { chat_id: 1, text: 'hi' }), /update config.env/);
});

test('certificate failures say nothing was sent and point at interception', async () => {
  const failure = Object.assign(new TypeError('fetch failed'), { cause: { code: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' } });
  const { client } = fakeClient(failure);
  await assert.rejects(sendMessage(client, { chat_id: 1, text: 'hi' }), /nothing was sent.*intercepting HTTPS/);
});

test('a missing token gives a setup error', async () => {
  const client = createClient({ getToken: () => null, fetchImpl: async () => assert.fail('no request expected') });
  await assert.rejects(sendMessage(client, { chat_id: 1, text: 'hi' }), /No bot token found/);
});

test('photo URLs are passed through with the caption', async () => {
  const { client, calls } = fakeClient(ok(3));
  await sendPhoto(client, { chat_id: 1, photo: 'https://x.y/a.png', caption: '<b>c</b>', format: 'html' });
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.photo, 'https://x.y/a.png');
  assert.equal(body.parse_mode, 'HTML');
});

test('local photos upload as multipart', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'tgmcp-'));
  const file = path.join(dir, 'a.png');
  await writeFile(file, 'fake-image');
  const { client, calls } = fakeClient(ok(4));
  await sendPhoto(client, { chat_id: 1, photo: file, caption: 'hello' });
  const form = calls[0].init.body;
  assert.ok(form instanceof FormData);
  assert.equal(form.get('caption'), 'hello');
  assert.equal(await form.get('photo').text(), 'fake-image');
});

test('photo validation rejects bad inputs without a request', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'tgmcp-'));
  const big = path.join(dir, 'big.jpg');
  await writeFile(big, Buffer.alloc(10 * 1024 * 1024 + 1));
  const { client, calls } = fakeClient(ok());

  await assert.rejects(sendPhoto(client, { chat_id: 1, photo: 'a.png' }), /must be absolute/);
  await assert.rejects(sendPhoto(client, { chat_id: 1, photo: path.join(dir, 'secrets.txt') }), /Unsupported photo type/);
  await assert.rejects(sendPhoto(client, { chat_id: 1, photo: path.join(dir, 'gone.png') }), /not found/);
  await assert.rejects(sendPhoto(client, { chat_id: 1, photo: big }), /limit is 10 MB/);
  await assert.rejects(
    sendPhoto(client, { chat_id: 1, photo: 'https://x.y/a.png', caption: 'c'.repeat(1025) }),
    /Caption is too long/,
  );
  assert.equal(calls.length, 0);
});
