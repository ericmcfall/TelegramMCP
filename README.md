# Telegram MCP (send only)

Lets Claude Code and Claude Desktop send messages and photos through your Telegram bot. It runs locally and only makes outgoing calls to Telegram: it doesn't receive messages, open ports or need hosting.

## Tools

| Tool | Inputs | Notes |
|---|---|---|
| `send_message` | `chat_id`, `text`, `format` | Text over 4096 characters is sent as several messages |
| `send_photo` | `chat_id`, `photo`, `caption`, `format` | `photo` is an absolute local path (.jpg, .jpeg, .png, .webp, up to 10 MB) or an http(s) URL. Captions can be up to 1024 characters |

- `chat_id` is always required. There is no default, so include it in your prompts, including scheduled task prompts.
- `format` is `plain` (the default) or `html` for Telegram's HTML formatting.
- A person must have started your bot, or a group or channel must have added it, before the bot can message them.

## Setup

You need Node.js 20 or later on each computer, or 22.19 or later if the computer runs antivirus or a proxy that scans HTTPS.

1. Open PowerShell in this folder and run:

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\install.ps1
   ```

2. Open `config.env` and set `TELEGRAM_BOT_TOKEN` to your token from @BotFather.
3. Check the token. This doesn't send a message:

   ```powershell
   node server.mjs --check
   ```

4. Restart Claude Desktop and any open Claude Code sessions.

## Moving to another computer

1. Copy this whole folder. You can leave out `node_modules`, which is only needed for development.
2. Run `install.ps1` on the new computer.
3. Restart Claude.

You can also clone this repository instead of copying the folder. `config.env` is deliberately not in the repository, so after cloning, run `install.ps1` and add your token to `config.env` as in Setup. `server.mjs` is included, so no build is needed.

Scheduled tasks are stored on each computer, not in this folder, so recreate them on the new computer and turn them off on the old one to avoid duplicate messages.

Run `install.ps1` again if you move the folder on the same computer, because Claude's config stores its exact location. To remove the server from a computer you're finished with, run `uninstall.ps1` there before moving the folder, then delete `config.env` if the folder stays behind.

## Replacing the token

Anyone with `config.env` can send messages as your bot, so keep this folder out of shared or public locations. If the token leaks:

1. Send `/revoke` to @BotFather in Telegram.
2. Put the new token in `config.env`.

No restart is needed, because the token is read on each send.

## Safety

- The server doesn't restrict recipients. Any chat that has started your bot can be messaged, and anyone who finds the bot can start it.
- Keep Claude's approval prompt on for these tools in interactive sessions. Scheduled tasks need sending pre-approved, so be careful with tasks that read untrusted content such as web pages or emails, which could try to trick Claude into sending data.
- `send_photo` can send any supported image file that Claude can name, including screenshots.

## Troubleshooting

| Message | What to do |
|---|---|
| `No bot token found` | Set `TELEGRAM_BOT_TOKEN` in `config.env` |
| `Unauthorized` | The token is wrong or was revoked |
| `Could not verify Telegram's certificate` | Antivirus or a proxy is intercepting HTTPS. The server trusts the Windows certificate store on Node 22.19 or later, so update Node |
| `chat not found` | Check the ID, and that the chat has started or added the bot |
| `Forbidden: bot was blocked by the user` | The person needs to unblock the bot |
| `can't parse entities` | The HTML is invalid; escape `<`, `>` and `&` in text |
| Tools don't appear in Claude | Fully quit Claude, including from the system tray, because closing the window leaves it running. Then reopen it, and run `install.ps1` again if the folder moved |

`install.ps1` saves the previous version of each Claude config file with a `.bak` extension.

## Development

```powershell
npm install
npm run build
npm test
```

Source is in `src/`. `npm run build` bundles it into `server.mjs` and regenerates `THIRD_PARTY_LICENSES.txt`, so rebuild before running the tests or copying the folder.

## License

MIT. See [LICENSE](LICENSE). `server.mjs` also includes third-party packages, which are listed with their licenses in [THIRD_PARTY_LICENSES.txt](THIRD_PARTY_LICENSES.txt).
