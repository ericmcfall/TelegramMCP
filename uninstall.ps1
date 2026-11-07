# Removes the Telegram MCP server from Claude on this computer.
# Leaves this folder and config.env in place.
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

& node scripts/register.mjs uninstall
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host 'Done. Restart Claude Desktop and any open Claude Code sessions.' -ForegroundColor Green
