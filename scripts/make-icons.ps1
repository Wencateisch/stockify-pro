# Generates the Stockify Pro Android/iOS launcher icons and splash images.
# Requires Windows PowerShell (System.Drawing) or any host with GDI+.
#   powershell -ExecutionPolicy Bypass -File scripts/make-icons.ps1
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$android = Join-Path $root "app\android\app\src\main\res"
$ios = Join-Path $root "app\ios\App\App\Assets.xcassets\AppIcon.appiconset"

function New-Canvas([int]$size) {
  $bmp = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  return @($bmp, $g)
}

function New-RoundPath([single]$x, [single]$y, [single]$w, [single]$h, [single]$r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $p.AddArc($x, $y, $d, $d, 180, 90)
  $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $p.CloseFigure()
  return $p
}

function Add-Mark($g, [single]$s, [switch]$NoBackground) {
  # Draws the 512-unit brand mark scaled by $s into the current canvas.
  $g.ScaleTransform($s, $s)

  if (-not $NoBackground) {
    $rect = New-Object System.Drawing.RectangleF(0, 0, 512, 512)
    $bg = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
      $rect,
      [System.Drawing.Color]::FromArgb(255, 11, 18, 32),
      [System.Drawing.Color]::FromArgb(255, 4, 6, 11),
      45.0
    )
    $path = New-RoundPath 0 0 512 512 112
    $g.FillPath($bg, $path)
    $bg.Dispose()

    # Soft emerald glow, upper-left.
    $glow = New-Object System.Drawing.Drawing2D.GraphicsPath
    $glow.AddEllipse(-120, -180, 700, 700)
    $gb = New-Object System.Drawing.Drawing2D.PathGradientBrush($glow)
    $gb.CenterColor = [System.Drawing.Color]::FromArgb(90, 52, 211, 153)
    $gb.SurroundColors = @([System.Drawing.Color]::FromArgb(0, 52, 211, 153))
    $g.FillPath($gb, $glow)
    $gb.Dispose(); $glow.Dispose()

    $edge = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(26, 255, 255, 255), 3)
    $g.DrawPath($edge, (New-RoundPath 10 10 492 492 102))
    $edge.Dispose()

    $base = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(56, 255, 255, 255))
    $g.FillRectangle($base, 96, 388, 320, 12)
    $base.Dispose()
  }

  $line = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    (New-Object System.Drawing.PointF(96, 352)),
    (New-Object System.Drawing.PointF(400, 144)),
    [System.Drawing.Color]::FromArgb(255, 52, 211, 153),
    [System.Drawing.Color]::FromArgb(255, 125, 211, 252)
  )
  $pen = New-Object System.Drawing.Pen($line, 30)
  $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  $g.DrawLines($pen, @(
    (New-Object System.Drawing.PointF(96, 352)),
    (New-Object System.Drawing.PointF(176, 264)),
    (New-Object System.Drawing.PointF(240, 316)),
    (New-Object System.Drawing.PointF(400, 144))
  ))
  $g.DrawLines($pen, @(
    (New-Object System.Drawing.PointF(330, 144)),
    (New-Object System.Drawing.PointF(400, 144)),
    (New-Object System.Drawing.PointF(400, 214))
  ))
  $pen.Dispose(); $line.Dispose()
  $g.ResetTransform()
}

function Save-Icon([string]$path, [int]$size, [string]$shape = "square", [switch]$Foreground) {
  New-Item -ItemType Directory -Force -Path (Split-Path $path) | Out-Null
  $c = New-Canvas $size
  $bmp = $c[0]; $g = $c[1]
  $s = $size / 512.0
  if ($shape -eq "circle") {
    $clip = New-Object System.Drawing.Drawing2D.GraphicsPath
    $clip.AddEllipse(0, 0, $size, $size)
    $g.SetClip($clip)
  }
  if ($Foreground) {
    # Transparent foreground: keep the mark inside the 66/108 adaptive safe zone.
    Add-Mark $g ($s * 0.78) -NoBackground
  } else {
    Add-Mark $g $s
  }
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
}

function Save-Splash([string]$path, [int]$size) {
  New-Item -ItemType Directory -Force -Path (Split-Path $path) | Out-Null
  $c = New-Canvas $size
  $bmp = $c[0]; $g = $c[1]
  $g.Clear([System.Drawing.Color]::FromArgb(255, 5, 7, 13))
  $mark = [int]($size * 0.22)
  $g.TranslateTransform(($size - $mark) / 2.0, ($size - $mark) / 2.0)
  Add-Mark $g ($mark / 512.0)
  $g.ResetTransform()
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
}

$sizes = @{ mdpi = 48; hdpi = 72; xhdpi = 96; xxhdpi = 144; xxxhdpi = 192 }
foreach ($k in $sizes.Keys) {
  $d = $sizes[$k]
  Save-Icon "$android\mipmap-$k\ic_launcher.png" $d
  Save-Icon "$android\mipmap-$k\ic_launcher_round.png" $d "circle"
}

$fg = @{ mdpi = 108; hdpi = 162; xhdpi = 216; xxhdpi = 324; xxxhdpi = 432 }
foreach ($k in $fg.Keys) {
  Save-Icon "$android\mipmap-$k\ic_launcher_foreground.png" $fg[$k] "square" -Foreground
}

# Adaptive icon background.
$bgXml = @'
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#05070D</color>
</resources>
'@
Set-Content -Path "$android\values\ic_launcher_background.xml" -Value $bgXml -Encoding UTF8

# Splash screens: square source + Android density variants.
Save-Splash "$android\drawable\splash.png" 2732
foreach ($k in @{ "drawable-port-mdpi" = 320; "drawable-port-hdpi" = 480; "drawable-port-xhdpi" = 720; "drawable-port-xxhdpi" = 960; "drawable-port-xxxhdpi" = 1280; "drawable-land-mdpi" = 480; "drawable-land-hdpi" = 800; "drawable-land-xhdpi" = 1280; "drawable-land-xxhdpi" = 1600; "drawable-land-xxxhdpi" = 1920 }.GetEnumerator()) {
  Save-Splash "$android\$($k.Key)\splash.png" $k.Value
}

# iOS AppIcon (single 1024 marketing icon is enough for modern Xcode).
if (Test-Path $ios) {
  Save-Icon "$ios\AppIcon-512@2x.png" 1024
  $contents = @'
{
  "images" : [
    {
      "filename" : "AppIcon-512@2x.png",
      "idiom" : "universal",
      "platform" : "ios",
      "size" : "1024x1024"
    }
  ],
  "info" : { "author" : "xcode", "version" : 1 }
}
'@
  Set-Content -Path "$ios\Contents.json" -Value $contents -Encoding UTF8
}

# PWA / Add-to-Home-Screen icons for the web build (also used on iPhone).
$public = Join-Path $root "app\public"
foreach ($p in @{ "icon-180.png" = 180; "icon-192.png" = 192; "icon-512.png" = 512 }.GetEnumerator()) {
  Save-Icon (Join-Path $public $p.Key) $p.Value
}

Write-Host "Icons and splash screens written."
