param([string]$InputFile,[string]$OutputFile,[string]$Language='en-US',[switch]$Info)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null=[Windows.Media.Ocr.OcrEngine,Windows.Foundation,ContentType=WindowsRuntime]
$null=[Windows.Storage.StorageFile,Windows.Storage,ContentType=WindowsRuntime]
$null=[Windows.Storage.Streams.IRandomAccessStreamWithContentType,Windows.Storage.Streams,ContentType=WindowsRuntime]
$null=[Windows.Graphics.Imaging.BitmapDecoder,Windows.Graphics.Imaging,ContentType=WindowsRuntime]
$null=[Windows.Graphics.Imaging.SoftwareBitmap,Windows.Graphics.Imaging,ContentType=WindowsRuntime]
$null=[Windows.Globalization.Language,Windows.Globalization,ContentType=WindowsRuntime]
$languages=@([Windows.Media.Ocr.OcrEngine]::AvailableRecognizerLanguages | ForEach-Object {$_.LanguageTag})
$dll=Join-Path $env:WINDIR 'System32/Windows.Media.Ocr.dll'
$dllStream=[IO.File]::OpenRead($dll);$hasher=[Security.Cryptography.SHA256]::Create()
try{$dllSha256=[BitConverter]::ToString($hasher.ComputeHash($dllStream)).Replace('-','').ToLowerInvariant()}finally{$dllStream.Dispose();$hasher.Dispose()}
$identity=@{engine='Windows.Media.Ocr';language=$Language;languages=$languages;os=[Environment]::OSVersion.Version.ToString();dllSha256=$dllSha256;maxDimension=[Windows.Media.Ocr.OcrEngine]::MaxImageDimension;confidenceAvailable=$false}
if($Info){$identity | ConvertTo-Json -Depth 5 -Compress;exit}
if($Language -notin $languages){throw "Local OCR language unavailable: $Language. Available: $($languages -join ', ')"}
$recognizer=[Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage([Windows.Globalization.Language]::new($Language))
if($null -eq $recognizer){throw 'Local OCR engine could not be created.'}
$asTask=([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {$_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetGenericArguments().Count -eq 1 -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'})[0]
function Await-Operation($operation,[Type]$resultType){$task=$asTask.MakeGenericMethod($resultType).Invoke($null,@($operation));$null=$task.Wait(60000);if(-not $task.IsCompleted){throw 'Local OCR operation timed out.'};return $task.Result}
$request=Get-Content -LiteralPath $InputFile -Raw -Encoding UTF8 | ConvertFrom-Json
if(@($request.files).Count -gt 64){throw 'OCR batch exceeds 64 images.'}
$results=@(foreach($item in $request.files){
  $file=Await-Operation ([Windows.Storage.StorageFile]::GetFileFromPathAsync([IO.Path]::GetFullPath($item.path))) ([Windows.Storage.StorageFile])
  $stream=Await-Operation ($file.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
  $bitmap=$null
  try{
    $decoder=Await-Operation ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
    $bitmap=Await-Operation ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
    if($bitmap.PixelWidth -gt $identity.maxDimension -or $bitmap.PixelHeight -gt $identity.maxDimension){throw 'OCR image exceeds engine dimensions.'}
    $result=Await-Operation ($recognizer.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
    $lines=@(foreach($line in $result.Lines){
      $words=@(foreach($word in $line.Words){$b=$word.BoundingRect;@{text=$word.Text;box=@(([double]$b.X/$bitmap.PixelWidth),([double]$b.Y/$bitmap.PixelHeight),([double]$b.Width/$bitmap.PixelWidth),([double]$b.Height/$bitmap.PixelHeight))}})
      @{text=$line.Text;words=$words}
    })
    @{index=$item.index;width=$bitmap.PixelWidth;height=$bitmap.PixelHeight;textAngle=$result.TextAngle;lines=$lines}
  }finally{if($null -ne $bitmap){$bitmap.Dispose()};$stream.Dispose()}
})
$json=@{identity=$identity;results=$results} | ConvertTo-Json -Depth 12 -Compress
[IO.File]::WriteAllText($OutputFile,$json,[Text.UTF8Encoding]::new($false))
