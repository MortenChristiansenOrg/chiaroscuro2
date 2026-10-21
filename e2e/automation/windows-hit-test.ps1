# Native WM_NCHITTEST results for many physical screen points, without moving the pointer.
param(
  [Parameter(Mandatory=$true)][string]$PointsFile,
  [Parameter(Mandatory=$true)][long]$Window
)
$ErrorActionPreference = 'Stop'
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class VerificationHitTest {
  [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
  [DllImport("user32.dll")] public static extern IntPtr SendMessageTimeout(IntPtr window, uint message, UIntPtr wParam, IntPtr lParam, uint flags, uint timeout, out UIntPtr result);
}
'@
# Electron supplies physical screen coordinates. Avoid PowerShell DPI virtualization.
[VerificationHitTest]::SetThreadDpiAwarenessContext([IntPtr]::new(-4)) | Out-Null
$points = Get-Content -Raw $PointsFile | ConvertFrom-Json
$results = New-Object System.Collections.Generic.List[int]
foreach ($point in $points) {
  $hit = [UIntPtr]::Zero
  $packed = [IntPtr]::new((([int]$point[1] -band 65535) -shl 16) -bor ([int]$point[0] -band 65535))
  # WM_NCHITTEST: 1 = HTCLIENT, 2 = HTCAPTION. Abort if the target is unresponsive.
  $sent = [VerificationHitTest]::SendMessageTimeout([IntPtr]::new($Window), 132, [UIntPtr]::Zero, $packed, 2, 1000, [ref]$hit)
  if ($sent -eq [IntPtr]::Zero) { throw 'Native hit-test timed out or failed' }
  $results.Add([int]$hit.ToUInt64())
}
ConvertTo-Json -Compress -InputObject $results.ToArray()
