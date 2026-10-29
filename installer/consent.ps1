$ErrorActionPreference = 'Stop'
try {
    if ([string]::IsNullOrWhiteSpace($env:ESPSTUDIO_CONSENT_TEXT)) { exit 1 }
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing
    Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class ConsentPresentation {
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr window, int command);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr window);
}
'@
    [System.Windows.Forms.Application]::EnableVisualStyles()
    $form = New-Object System.Windows.Forms.Form
    $form.Text = 'TT ESPStudio Agent'
    $form.ClientSize = New-Object System.Drawing.Size(620, 330)
    $form.Font = New-Object System.Drawing.Font('Segoe UI', 10)
    $form.StartPosition = 'CenterScreen'
    $form.FormBorderStyle = 'FixedDialog'
    $form.MaximizeBox = $false
    $form.MinimizeBox = $false
    $form.ShowInTaskbar = $true
    $form.TopMost = $true
    $label = New-Object System.Windows.Forms.Label
    $label.Text = $env:ESPSTUDIO_CONSENT_TEXT
    $label.Dock = 'Fill'
    $label.Padding = New-Object System.Windows.Forms.Padding(20)
    $form.Controls.Add($label)
    $buttons = New-Object System.Windows.Forms.FlowLayoutPanel
    $buttons.Dock = 'Bottom'
    $buttons.Height = 60
    $buttons.Padding = New-Object System.Windows.Forms.Padding(10)
    $buttons.FlowDirection = 'RightToLeft'
    $no = New-Object System.Windows.Forms.Button
    $no.Text = 'No / Tu choi'
    $no.Size = New-Object System.Drawing.Size(130, 32)
    $no.DialogResult = 'No'
    $yes = New-Object System.Windows.Forms.Button
    $yes.Text = 'Yes / Dong y'
    $yes.Size = New-Object System.Drawing.Size(130, 32)
    $yes.DialogResult = 'Yes'
    $buttons.Controls.Add($no)
    $buttons.Controls.Add($yes)
    $form.Controls.Add($buttons)
    # Enter/Escape default to denial. Closing or timeout also denies.
    $form.AcceptButton = $no
    $form.CancelButton = $no
    $timer = New-Object System.Windows.Forms.Timer
    $timer.Interval = 120000
    $timer.Add_Tick({ $form.DialogResult = 'No'; $form.Close() })
    $form.Add_Shown({
        # Override the helper process's hidden startup window setting for this dialog only.
        [void][ConsentPresentation]::ShowWindow($form.Handle, 5)
        [void][ConsentPresentation]::SetForegroundWindow($form.Handle)
        $form.Activate(); $form.BringToFront(); [void]$no.Focus(); $timer.Start()
    })
    $result = $form.ShowDialog()
    $timer.Stop(); $timer.Dispose(); $form.Dispose()
    if ($result -eq [System.Windows.Forms.DialogResult]::Yes) { exit 0 }
    exit 1
} catch { exit 1 }
