; Build only after runtime preparation and Windows validation; no machine-wide install.
#ifndef AppVersion
  #error AppVersion must be supplied by the packaging script
#endif
[Setup]
AppId={{A7841AAD-6B23-4E41-B9A8-F7341A251615}
AppName=TT ESPStudio Agent
AppVersion={#AppVersion}
DefaultDirName={localappdata}\Programs\TTESPStudioAgent
DefaultGroupName=TT ESPStudio
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
OutputDir=..\release\installer
OutputBaseFilename=TTESPStudio-Agent-{#AppVersion}-win-x64
Compression=lzma2
SolidCompression=yes
UninstallDisplayIcon={app}\TTESPStudioAgent.exe
AppMutex=TTESPStudioAgent
CloseApplications=no
RestartApplications=no
WizardStyle=modern
[Files]
Source: "..\release\agent\*"; DestDir: "{app}"; Excludes: "*.pyc,*.pyo,python\Lib\site-packages\Scripts\*,python\Lib\site-packages\bin\*"; Flags: ignoreversion recursesubdirs createallsubdirs
[Icons]
Name: "{group}\TT ESPStudio Agent"; Filename: "{app}\TTESPStudioAgent.exe"; Parameters: "--open"
[Registry]
Root: HKCU; Subkey: "Software\Classes\ttespstudio"; ValueType: string; ValueData: "URL:TT ESPStudio Agent"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\ttespstudio"; ValueType: string; ValueName: "URL Protocol"; ValueData: ""
Root: HKCU; Subkey: "Software\Classes\ttespstudio\shell\open\command"; ValueType: string; ValueData: """{app}\TTESPStudioAgent.exe"" ""%1"""
[Run]
Filename: "{app}\TTESPStudioAgent.exe"; Parameters: "--open"; Description: "Mở TT ESPStudio Agent"; Flags: postinstall nowait skipifsilent unchecked
; No UninstallDelete: preserve user's Agent data/builds, never touch ~/.platformio.
