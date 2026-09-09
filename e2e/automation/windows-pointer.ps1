# Desktop input for an owned verification window; never click through an overlapping window.
param(
  [Parameter(Mandatory=$true)][int]$X,
  [Parameter(Mandatory=$true)][int]$Y,
  [Parameter(Mandatory=$true)][long]$ExpectedWindow,
  [switch]$Click
)
$ErrorActionPreference = 'Stop'
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class VerificationPointer {
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }
  [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT point);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(POINT point);
  [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr window, uint flags);
  [DllImport("user32.dll")] public static extern IntPtr SendMessageTimeout(IntPtr window, uint message, UIntPtr wParam, IntPtr lParam, uint flags, uint timeout, out UIntPtr result);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extra);
}
'@
# Electron supplies physical screen coordinates. Avoid PowerShell DPI virtualization.
[VerificationPointer]::SetThreadDpiAwarenessContext([IntPtr]::new(-4)) | Out-Null
if (-not [VerificationPointer]::SetCursorPos($X, $Y)) { throw 'Cannot move desktop pointer' }
$point = New-Object VerificationPointer+POINT
if (-not [VerificationPointer]::GetCursorPos([ref]$point)) { throw 'Cannot observe desktop pointer' }
$root = [VerificationPointer]::GetAncestor([VerificationPointer]::WindowFromPoint($point), 2).ToInt64()
$foreground = [VerificationPointer]::GetForegroundWindow().ToInt64()
if ($root -ne $ExpectedWindow -or $foreground -ne $ExpectedWindow) {
  throw "Owned window $ExpectedWindow is obscured or unfocused (pointer window $root, foreground $foreground)"
}
if ($point.X -ne $X -or $point.Y -ne $Y) { throw 'Pointer did not reach the requested position' }
$hit = [UIntPtr]::Zero
$packed = [IntPtr]::new((($Y -band 65535) -shl 16) -bor ($X -band 65535))
# WM_NCHITTEST: 1 = HTCLIENT, 2 = HTCAPTION. Abort if the target is unresponsive.
$sent = [VerificationPointer]::SendMessageTimeout([IntPtr]::new($root), 132, [UIntPtr]::Zero, $packed, 2, 1000, [ref]$hit)
if ($sent -eq [IntPtr]::Zero) { throw 'Native hit-test timed out or failed' }
if ($Click) {
  [VerificationPointer]::mouse_event(2, 0, 0, 0, [UIntPtr]::Zero)
  [VerificationPointer]::mouse_event(4, 0, 0, 0, [UIntPtr]::Zero)
}
@{ x=$point.X; y=$point.Y; window=$root; foreground=$foreground; hitTest=$hit.ToUInt64() } | ConvertTo-Json -Compress
