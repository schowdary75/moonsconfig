param(
  [Parameter(Mandatory = $true)]
  [string]$Hostname
)

$normalizedHost = $Hostname.Trim().ToLowerInvariant()
if ($normalizedHost -notmatch '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.moon\.com$') {
  throw "Only a single valid *.moon.com tenant hostname can be added."
}

$hostsPath = 'C:\Windows\System32\drivers\etc\hosts'
$escapedHost = [Regex]::Escape($normalizedHost)
$alreadyPresent = Select-String `
  -LiteralPath $hostsPath `
  -Pattern "^\s*(?:127\.0\.0\.1|::1)\s+$escapedHost(?:\s|$)" `
  -Quiet

if (-not $alreadyPresent) {
  Add-Content -LiteralPath $hostsPath -Value "127.0.0.1 $normalizedHost"
}

ipconfig /flushdns | Out-Null
Write-Host "$normalizedHost now resolves to 127.0.0.1"
