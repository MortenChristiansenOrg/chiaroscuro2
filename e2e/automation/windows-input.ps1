# Desktop click and typing for the verification app. Unlike windows-pointer.ps1 this does not
# activate a window first: the click itself decides which window becomes active.
param(
  [Parameter(Mandatory=$true)][long]$AppWindow,
  # Physical screen coordinates; negative on monitors left of or above the primary one.
  [int]$X,
  [int]$Y,
  [switch]$Click,
  # System.Windows.Forms.SendKeys syntax, for example 'hi' or '{ESC}'.
  [string]$Keys = ''
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class VerificationInput {
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }
  [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT point);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);
  [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(POINT point);
  [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr window, uint flags);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extra);
}
'@
# Electron supplies physical screen coordinates. Avoid PowerShell DPI virtualization.
[VerificationInput]::SetThreadDpiAwarenessContext([IntPtr]::new(-4)) | Out-Null
function Owner([IntPtr]$window) {
  $process = [uint32]0
  [VerificationInput]::GetWindowThreadProcessId($window, [ref]$process) | Out-Null
  return $process
}
$app = Owner ([IntPtr]::new($AppWindow))
# Never send input to another application's window: check right before every input.
function Assert-AppForeground {
  $foreground = [VerificationInput]::GetForegroundWindow()
  if ((Owner $foreground) -ne $app) { throw "Foreground window $($foreground.ToInt64()) belongs to another process" }
  return $foreground
}
$result = @{ foregroundBefore = (Assert-AppForeground).ToInt64() }
$hasPoint = $PSBoundParameters.ContainsKey('X') -and $PSBoundParameters.ContainsKey('Y')
if ($Click -and -not $hasPoint) { throw 'A click needs -X and -Y' }
if ($hasPoint) {
  if (-not [VerificationInput]::SetCursorPos($X, $Y)) { throw 'Cannot move desktop pointer' }
  $point = New-Object VerificationInput+POINT
  [VerificationInput]::GetCursorPos([ref]$point) | Out-Null
  if ($point.X -ne $X -or $point.Y -ne $Y) { throw 'Pointer did not reach the requested position' }
  $root = [VerificationInput]::GetAncestor([VerificationInput]::WindowFromPoint($point), 2)
  if ((Owner $root) -ne $app) { throw "Window $($root.ToInt64()) under the pointer belongs to another process" }
  $result.pointerWindow = $root.ToInt64()
  if ($Click) {
    Assert-AppForeground | Out-Null
    [VerificationInput]::mouse_event(2, 0, 0, 0, [UIntPtr]::Zero)
    [VerificationInput]::mouse_event(4, 0, 0, 0, [UIntPtr]::Zero)
  }
}
# One key at a time, with any modifiers, so that a window of another process that becomes
# active in between gets none of the remaining keys.
foreach ($key in [regex]::Matches($Keys, '[\^%+]*(\{[^}]+\}|\(.*?\)|.)')) {
  Assert-AppForeground | Out-Null
  [System.Windows.Forms.SendKeys]::SendWait($key.Value)
}
$result.foregroundAfter = [VerificationInput]::GetForegroundWindow().ToInt64()
$result | ConvertTo-Json -Compress
