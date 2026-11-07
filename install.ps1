# Registers this folder's Telegram MCP server on the current computer.
# Run it again whenever the folder moves.
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    Write-Host 'Node.js was not found. Install version 20 or later from https://nodejs.org and run this again.' -ForegroundColor Red
    exit 1
}
$major = [int]((& node --version).TrimStart('v').Split('.')[0])
if ($major -lt 20) {
    Write-Host "Node.js 20 or later is required; this computer has version $major." -ForegroundColor Red
    exit 1
}

if (-not (Test-Path -LiteralPath 'config.env')) {
    Copy-Item -LiteralPath 'config.example.env' -Destination 'config.env'
    Write-Host 'Created config.env from the example.'
}

& node scripts/register.mjs install
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

& node server.mjs --check
if ($LASTEXITCODE -ne 0) {
    Write-Host 'Registered, but the token check failed. Put your bot token in config.env, then run: node server.mjs --check' -ForegroundColor Yellow
}

Write-Host 'Done. Restart Claude Desktop and any open Claude Code sessions to pick up the tools.' -ForegroundColor Green
