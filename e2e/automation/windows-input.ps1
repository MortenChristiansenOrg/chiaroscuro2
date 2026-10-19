# Desktop click and typing for the verification app. Unlike windows-pointer.ps1 this does not
# activate a window first: the click itself decides which window becomes active.
param(
  [Parameter(Mandatory=$true)][long]$AppWindow,
  [int]$X = -1,
  [int]$Y = -1,
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
# Never send input to another application's window.
$foreground = [VerificationInput]::GetForegroundWindow()
if ((Owner $foreground) -ne $app) { throw "Foreground window $($foreground.ToInt64()) belongs to another process" }
$result = @{ foregroundBefore = $foreground.ToInt64() }
if ($X -ge 0 -and $Y -ge 0) {
  if (-not [VerificationInput]::SetCursorPos($X, $Y)) { throw 'Cannot move desktop pointer' }
  $point = New-Object VerificationInput+POINT
  [VerificationInput]::GetCursorPos([ref]$point) | Out-Null
  if ($point.X -ne $X -or $point.Y -ne $Y) { throw 'Pointer did not reach the requested position' }
  $root = [VerificationInput]::GetAncestor([VerificationInput]::WindowFromPoint($point), 2)
  if ((Owner $root) -ne $app) { throw "Window $($root.ToInt64()) under the pointer belongs to another process" }
  $result.pointerWindow = $root.ToInt64()
  if ($Click) {
    [VerificationInput]::mouse_event(2, 0, 0, 0, [UIntPtr]::Zero)
    [VerificationInput]::mouse_event(4, 0, 0, 0, [UIntPtr]::Zero)
  }
}
if ($Keys -ne '') { [System.Windows.Forms.SendKeys]::SendWait($Keys) }
$result.foregroundAfter = [VerificationInput]::GetForegroundWindow().ToInt64()
$result | ConvertTo-Json -Compress
