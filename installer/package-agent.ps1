param(
    [Parameter(Mandatory=$true)][string]$RuntimeLock,
    [Parameter(Mandatory=$true)][string]$InputDirectory,
    [Parameter(Mandatory=$true)][string]$PackagingPython,
    [Parameter(Mandatory=$true)][string]$Iscc
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$payload = Join-Path $projectRoot 'release\agent'
$inputs = (Resolve-Path -LiteralPath $InputDirectory).Path
$lock = Get-Content -LiteralPath $RuntimeLock -Raw -Encoding UTF8 | ConvertFrom-Json
if ($lock.schemaVersion -ne 1 -or $lock.platformioVersion -ne '6.2.0') { throw 'Unsupported runtime lock. Review toolchain versions before packaging.' }
if (-not (Test-Path -LiteralPath (Join-Path $payload 'agent.cjs'))) { throw 'Run npm run build:agent first.' }
if (Test-Path -LiteralPath (Join-Path $payload 'python')) { throw 'Payload already has Python. Use a fresh, reviewed release directory; do not mix runtimes.' }

function Verified-Input($entry) {
    if ($entry.file -notmatch '^[a-zA-Z0-9][a-zA-Z0-9._-]+$' -or $entry.sha256 -notmatch '^[a-fA-F0-9]{64}$') { throw 'Invalid runtime filename or checksum.' }
    $file = Join-Path $inputs $entry.file
    if ((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash -ne $entry.sha256) { throw "Checksum mismatch: $($entry.file)" }
    return $file
}

Add-Type -AssemblyName System.IO.Compression.FileSystem
function Expand-VerifiedArchive([string]$archive, [string]$destination) {
    $zip = [IO.Compression.ZipFile]::OpenRead($archive)
    try {
        foreach ($entry in $zip.Entries) {
            if ($entry.FullName.Contains('\') -or $entry.FullName.Contains(':') -or $entry.FullName.StartsWith('/') -or ($entry.FullName.Split('/') -contains '..')) { throw 'Archive contains an unsafe path.' }
        }
    } finally { $zip.Dispose() }
    [IO.Compression.ZipFile]::ExtractToDirectory($archive, $destination)
}

$nodeZip = Verified-Input $lock.node
$pythonZip = Verified-Input $lock.python
if ($lock.node.folder -notmatch '^node-v[0-9]+\.[0-9]+\.[0-9]+-win-x64$') { throw 'Expected official Windows x64 Node archive layout.' }
if ($lock.python.pth -notmatch '^python[0-9]+\._pth$') { throw 'Invalid embedded Python path file.' }
if (-not $lock.wheels -or -not $lock.requirements) { throw 'A fully pinned Python wheel lock is required.' }
$wheelFiles = @($lock.wheels | ForEach-Object {
    if ($_.file -notlike '*.whl') { throw 'Only wheels are allowed; no source package/build scripts.' }
    Verified-Input $_
})
foreach ($requirement in $lock.requirements) {
    if ($requirement -notmatch '^[A-Za-z0-9_.-]+==[A-Za-z0-9_.+!-]+$') { throw 'Every Python requirement must be exactly pinned.' }
}
if (-not ($lock.requirements -contains 'platformio==6.2.0')) { throw 'Pinned PlatformIO is required.' }
if (-not ($lock.requirements | Where-Object { $_ -match '^pip==' })) { throw 'Vendor a reviewed pip wheel for toolchain package setup.' }

$scratch = Join-Path $projectRoot ('release\runtime-input-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $scratch | Out-Null
Expand-VerifiedArchive $nodeZip (Join-Path $scratch 'node')
Expand-VerifiedArchive $pythonZip (Join-Path $payload 'python')
$nodeRoot = Join-Path (Join-Path $scratch 'node') $lock.node.folder
Copy-Item -LiteralPath (Join-Path $nodeRoot 'node.exe') -Destination (Join-Path $payload 'node.exe')
New-Item -ItemType Directory -Path (Join-Path $payload 'licenses') -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $nodeRoot 'LICENSE') -Destination (Join-Path $payload 'licenses\Node-LICENSE.txt')
$pythonRoot = Join-Path $payload 'python'
$pth = Join-Path $pythonRoot $lock.python.pth
if (-not (Test-Path -LiteralPath $pth)) { throw 'Python archive does not match its path manifest.' }
# Vendored modules: do not use global/user site-packages or install into system Python.
$stdlibZip = $lock.python.pth.Replace('._pth', '.zip')
if (-not (Test-Path -LiteralPath (Join-Path $pythonRoot $stdlibZip))) { throw 'Embedded Python standard library is missing.' }
[IO.File]::WriteAllText($pth, "$stdlibZip`n.`nLib/site-packages`nimport site`n", [Text.UTF8Encoding]::new($false))
$wheelhouse = Join-Path $scratch 'wheels'
New-Item -ItemType Directory -Path $wheelhouse | Out-Null
foreach ($file in $wheelFiles) { Copy-Item -LiteralPath $file -Destination $wheelhouse }
# PackagingPython is a maintainer tool, never installed or required on end-user machines.
# pip resolves only reviewed, hash-checked local wheels; network and source builds disabled.
$pythonVersion = $lock.python.pth.Replace('python', '').Replace('._pth', '')
& $PackagingPython -I -m pip --isolated install --no-index --only-binary=:all: --no-compile --platform win_amd64 --implementation cp --python-version $pythonVersion --abi "cp$pythonVersion" --find-links $wheelhouse --target (Join-Path $pythonRoot 'Lib\site-packages') @($lock.requirements)
if ($LASTEXITCODE -ne 0) { throw 'Vendoring Python dependencies failed.' }
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'sitecustomize.py') -Destination (Join-Path $pythonRoot 'Lib\site-packages\sitecustomize.py')
Copy-Item -LiteralPath $RuntimeLock -Destination (Join-Path $payload 'runtime-lock.json')

$csc = Join-Path $env:SystemRoot 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
& $csc /nologo /codepage:65001 /target:winexe "/out:$payload\TTESPStudioAgent.exe" /reference:System.Windows.Forms.dll /reference:System.Drawing.dll (Join-Path $PSScriptRoot 'AgentLauncher.cs')
if ($LASTEXITCODE -ne 0) { throw 'Agent launcher compilation failed.' }
$version = (Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json).version
if ($version -notmatch '^[0-9]+\.[0-9]+\.[0-9]+(-[A-Za-z0-9.-]+)?$') { throw 'Invalid version.' }
& $Iscc "/DAppVersion=$version" (Join-Path $PSScriptRoot 'TTESPStudio.iss')
if ($LASTEXITCODE -ne 0) { throw 'Installer compilation failed.' }
Get-ChildItem -LiteralPath (Join-Path $projectRoot 'release\installer') -Filter '*.exe' | Get-FileHash -Algorithm SHA256
