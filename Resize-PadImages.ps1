param(
    [Parameter(Mandatory = $true)]
    [string[]]$ImagePaths,

    [int]$TargetWidth = 1920,
    [int]$TargetHeight = 1080,

    [string]$Suffix = "_1920x1080",

    [string[]]$OutputNames
)

Add-Type -AssemblyName System.Drawing

for ($i = 0; $i -lt $ImagePaths.Count; $i++) {
    $path = $ImagePaths[$i]
    $resolved = Resolve-Path -LiteralPath $path -ErrorAction Stop
    $sourcePath = $resolved.ProviderPath
    $directory = [System.IO.Path]::GetDirectoryName($sourcePath)
    $baseName = [System.IO.Path]::GetFileNameWithoutExtension($sourcePath)

    if ($OutputNames -and $OutputNames.Count -gt $i) {
        $outputName = $OutputNames[$i]
        if ([System.IO.Path]::GetExtension($outputName) -eq "") {
            $outputName = "$outputName.png"
        }
    }
    else {
        $outputName = "$baseName$Suffix.png"
    }

    $outputPath = [System.IO.Path]::Combine($directory, $outputName)

    $source = $null
    $canvas = $null
    $graphics = $null

    try {
        $source = [System.Drawing.Image]::FromFile($sourcePath)

        $scale = [Math]::Min(
            1.0,
            [Math]::Min($TargetWidth / $source.Width, $TargetHeight / $source.Height)
        )

        $drawWidth = [Math]::Max(1, [int][Math]::Round($source.Width * $scale))
        $drawHeight = [Math]::Max(1, [int][Math]::Round($source.Height * $scale))
        $offsetX = [int][Math]::Floor(($TargetWidth - $drawWidth) / 2)
        $offsetY = [int][Math]::Floor(($TargetHeight - $drawHeight) / 2)

        $canvas = New-Object System.Drawing.Bitmap $TargetWidth, $TargetHeight, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
        $graphics = [System.Drawing.Graphics]::FromImage($canvas)
        $graphics.Clear([System.Drawing.Color]::Transparent)
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality

        $graphics.DrawImage($source, $offsetX, $offsetY, $drawWidth, $drawHeight)
        $canvas.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)

        Write-Host "Created: $outputPath"
    }
    finally {
        if ($graphics) { $graphics.Dispose() }
        if ($canvas) { $canvas.Dispose() }
        if ($source) { $source.Dispose() }
    }
}
