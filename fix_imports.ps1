$file = 'd:\desenvolvimento\node\env-vars\src\main.ts'
$content = [IO.File]::ReadAllText($file, [Text.Encoding]::Unicode)
$content = $content -replace "'./services/path-service'", "'./main/services/path-service'"
$content = $content -replace "'./ipc-manager'", "'./main/ipc-manager'"
[IO.File]::WriteAllText($file, $content, [Text.Encoding]::Unicode)
Write-Host "Done"
