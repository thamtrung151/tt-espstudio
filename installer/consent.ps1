$ErrorActionPreference = 'Stop'
try {
    if ([string]::IsNullOrWhiteSpace($env:ESPSTUDIO_CONSENT_TEXT)) { exit 1 }
    $dialog = New-Object -ComObject WScript.Shell
    # Yes/No, question icon, default No, foreground. Automatically expires in 120s.
    $result = $dialog.Popup($env:ESPSTUDIO_CONSENT_TEXT, 120, 'TT ESPStudio Agent', (4 + 32 + 256 + 65536))
    if ($result -eq 6) { exit 0 }
    exit 1
} catch { exit 1 }
