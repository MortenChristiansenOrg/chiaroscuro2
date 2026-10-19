# Acts as the user of an update installer the browser started: waits for the installer process,
# presses through its pages as a user would (Next, Install, Finish), records each page's text,
# check box states and a desktop screenshot, and exits once the installer process ended.
# Runs only on a disposable GitHub Windows runner, from e2e/packaging/update-restart.ts.
param(
  # Process name of the installer, without .exe.
  [Parameter(Mandatory=$true)][string]$ProcessName,
  [Parameter(Mandatory=$true)][string]$Artifacts,
  [int]$TimeoutSeconds = 180
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
# NSIS pages are plain Win32 dialogs: read and press their controls through window messages.
Add-Type @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public static class InstallerWizard {
  delegate bool EnumProc(IntPtr window, IntPtr data);
  [DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr parent, EnumProc callback, IntPtr data);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr window, StringBuilder text, int length);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr window, StringBuilder name, int length);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr window);
  [DllImport("user32.dll")] public static extern bool IsWindowEnabled(IntPtr window);
  [DllImport("user32.dll")] public static extern IntPtr GetParent(IntPtr window);
  [DllImport("user32.dll")] static extern int GetDlgCtrlID(IntPtr window);
  [DllImport("user32.dll")] static extern IntPtr SendMessage(IntPtr window, uint message, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] static extern bool PostMessage(IntPtr window, uint message, IntPtr w, IntPtr l);
  public static List<IntPtr> Controls(IntPtr dialog) {
    var controls = new List<IntPtr>();
    EnumChildWindows(dialog, (window, data) => { controls.Add(window); return true; }, IntPtr.Zero);
    return controls;
  }
  public static string Text(IntPtr window) {
    var text = new StringBuilder(1024);
    GetWindowText(window, text, text.Capacity);
    return text.ToString().Replace("&", "");
  }
  public static string Class(IntPtr window) {
    var name = new StringBuilder(256);
    GetClassName(window, name, name.Capacity);
    return name.ToString();
  }
  // BM_GETCHECK: 1 when a check box or radio button is checked.
  public static bool Checked(IntPtr window) { return SendMessage(window, 0x00F0, IntPtr.Zero, IntPtr.Zero) == (IntPtr)1; }
  // Press a button as a click would: WM_COMMAND with BN_CLICKED to its dialog.
  public static void Press(IntPtr button) {
    PostMessage(GetParent(button), 0x0111, (IntPtr)(GetDlgCtrlID(button) & 0xFFFF), button);
  }
}
'@

function Save-Screen([string]$Name) {
  $bounds = [System.Windows.Forms.SystemInformation]::VirtualScreen
  $bitmap = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  try {
    $graphics.CopyFromScreen($bounds.Left, $bounds.Top, 0, 0, $bitmap.Size)
    $bitmap.Save((Join-Path $Artifacts "$Name.png"), [System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $graphics.Dispose()
    $bitmap.Dispose()
  }
}

$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
Write-Output "watching for $ProcessName"
$started = $false
$step = 0
$lastReport = Get-Date
$pressed = [IntPtr]::Zero
$pressedAt = Get-Date
while ((Get-Date) -lt $deadline) {
  $installers = @(Get-Process -Name $ProcessName -ErrorAction SilentlyContinue)
  if ($installers.Count -eq 0) {
    if ($started) {
      Write-Output "installer exited after $step pages"
      exit 0
    }
    Start-Sleep -Milliseconds 100
    continue
  }
  if (-not $started) {
    $started = $true
    Write-Output "installer started: pid $($installers[0].Id)"
  }
  foreach ($installer in $installers) {
    $dialog = $installer.MainWindowHandle
    if ($dialog -eq [IntPtr]::Zero) { continue }
    $controls = @([InstallerWizard]::Controls($dialog) | Where-Object { [InstallerWizard]::IsWindowVisible($_) })
    $advance = $controls | Where-Object {
      [InstallerWizard]::Class($_) -eq 'Button' -and [InstallerWizard]::IsWindowEnabled($_) -and
        [InstallerWizard]::Text($_) -match '^(Next|Install|Finish)'
    } | Select-Object -First 1
    if (-not $advance) { continue }
    # A pressed button stays until its page is replaced; press it again only if nothing happened.
    if ($advance -eq $pressed -and ((Get-Date) - $pressedAt).TotalSeconds -lt 10) { continue }
    $step++
    $texts = @($controls | ForEach-Object {
      $text = [InstallerWizard]::Text($_)
      if (-not $text) { return }
      if ([InstallerWizard]::Class($_) -eq 'Button' -and [InstallerWizard]::GetParent($_) -ne $dialog) {
        "[$(if ([InstallerWizard]::Checked($_)) { 'x' } else { ' ' })] $text"
      } else { $text }
    })
    Write-Output "page ${step}: $($texts -join ' | ')"
    Save-Screen "update-installer-page-$step"
    Write-Output "  pressing '$([InstallerWizard]::Text($advance))'"
    [InstallerWizard]::Press($advance)
    $pressed = $advance
    $pressedAt = Get-Date
  }
  if (((Get-Date) - $lastReport).TotalSeconds -ge 10) {
    $lastReport = Get-Date
    Write-Output "waiting: $(@($installers | ForEach-Object { "$($_.Id) window $($_.MainWindowHandle) '$($_.MainWindowTitle)'" }) -join ', ')"
  }
  Start-Sleep -Milliseconds 250
}
Save-Screen 'update-installer-timeout'
throw "The update installer did not finish within $TimeoutSeconds seconds (started: $started, pages: $step)"
