$ErrorActionPreference = 'Stop'
$envFile = Join-Path $PSScriptRoot '.env'
if (Test-Path $envFile) {
  Get-Content $envFile | ForEach-Object {
    if ($_ -match '^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$') { Set-Variable -Name $Matches[1] -Value $Matches[2] -Scope Script }
  }
}
$previewPort = if ($PREVIEW_PORT) { [int]$PREVIEW_PORT } else { 3001 }
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $previewPort)
$listener.Start()
$root = Join-Path $PSScriptRoot 'public'
$types = @{ '.html'='text/html; charset=utf-8'; '.css'='text/css; charset=utf-8'; '.js'='text/javascript; charset=utf-8'; '.svg'='image/svg+xml' }
Write-Host "VerificaTok preview available at http://localhost:$previewPort/"
try {
  while ($true) {
    $client = $listener.AcceptTcpClient()
    $stream = $client.GetStream()
    $reader = [System.IO.StreamReader]::new($stream)
    $requestLine = $reader.ReadLine()
    $contentLength = 0
    while (($line = $reader.ReadLine()) -and $line -ne '') {
      if ($line -match '^Content-Length:\s*(\d+)') { $contentLength = [int]$Matches[1] }
    }
    $relative = (($requestLine -split ' ')[1] -split '\?')[0].TrimStart('/')
    if ($relative -eq 'api/analyze') {
      $rawBody = ''
      if ($contentLength -gt 0) {
        $buffer = New-Object byte[] $contentLength
        $read = 0
        while ($read -lt $contentLength) { $n = $stream.Read($buffer, $read, $contentLength - $read); if ($n -le 0) { break }; $read += $n }
        $rawBody = [Text.Encoding]::UTF8.GetString($buffer, 0, $read)
      }
      $claim = ''
      try { $claim = [string](($rawBody | ConvertFrom-Json).claim) } catch { }
      $claims = @()
      if ($FACTCHECK_API_KEY -and $claim.Length -ge 12) {
        try {
          $query = [uri]::EscapeDataString($claim)
          $result = Invoke-RestMethod -Uri "https://factchecktools.googleapis.com/v1alpha1/claims:search?query=$query&languageCode=es&pageSize=5&key=$FACTCHECK_API_KEY"
          foreach ($item in @($result.claims)) {
            $review = @($item.claimReview)[0]
            $rating = [string]$review.textualRating
            $normalized = $rating.ToLowerInvariant()
            $classification = if ($normalized -match 'fals|false|incorrect') { 'FALSA' } elseif ($normalized -match 'engan|mislead|context') { 'ENGANOSA' } elseif ($normalized -match 'verdad|true|correct') { 'VERIFICADA' } else { 'NO VERIFICABLE' }
            $claims += [ordered]@{ text = [string]$item.text; claimant = [string]$item.claimant; rating = $rating; classification = $classification; publisher = [string]$review.publisher.name; url = [string]$review.url; reviewDate = [string]$review.reviewDate }
          }
          $body = [ordered]@{ configured = $true; checkedAt = (Get-Date).ToUniversalTime().ToString('o'); claims = $claims } | ConvertTo-Json -Compress -Depth 6
        } catch { $body = '{"error":"No fue posible consultar Fact Check Tools en este momento."}' }
      } else { $body = '{"configured":false,"message":"La búsqueda de verificaciones aún no está conectada. No se generó una conclusión."}' }
      $bytes = [Text.Encoding]::UTF8.GetBytes($body)
      $headers = "HTTP/1.1 200 OK`r`nContent-Type: application/json; charset=utf-8`r`nContent-Length: $($bytes.Length)`r`nConnection: close`r`n`r`n"
      $head = [Text.Encoding]::ASCII.GetBytes($headers); $stream.Write($head,0,$head.Length); $stream.Write($bytes,0,$bytes.Length); $client.Close(); continue
    }
    if ([string]::IsNullOrWhiteSpace($relative)) { $relative = 'index.html' }
    $file = Join-Path $root $relative
    $resolvedRoot = (Resolve-Path $root).Path
    try { $resolvedFile = (Resolve-Path $file).Path } catch { $resolvedFile = '' }
    if (-not $resolvedFile.StartsWith($resolvedRoot)) { $body = [Text.Encoding]::UTF8.GetBytes('Forbidden'); $response = "HTTP/1.1 403 Forbidden`r`nContent-Length: $($body.Length)`r`n`r`n"; $head = [Text.Encoding]::ASCII.GetBytes($response); $stream.Write($head,0,$head.Length); $stream.Write($body,0,$body.Length); $client.Close(); continue }
    if (Test-Path -LiteralPath $resolvedFile -PathType Leaf) {
      $bytes = [System.IO.File]::ReadAllBytes($resolvedFile)
      $ext = [System.IO.Path]::GetExtension($resolvedFile).ToLowerInvariant()
      $contentType = if ($types.ContainsKey($ext)) { $types[$ext] } else { 'application/octet-stream' }
      $headers = "HTTP/1.1 200 OK`r`nContent-Type: $contentType`r`nContent-Length: $($bytes.Length)`r`nConnection: close`r`n`r`n"
    } else { $bytes = [Text.Encoding]::UTF8.GetBytes('Not found'); $headers = "HTTP/1.1 404 Not Found`r`nContent-Length: $($bytes.Length)`r`nConnection: close`r`n`r`n" }
    $head = [Text.Encoding]::ASCII.GetBytes($headers); $stream.Write($head,0,$head.Length); $stream.Write($bytes,0,$bytes.Length); $client.Close()
  }
} finally { $listener.Stop() }
