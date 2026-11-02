# PS 5.1 and PS 7: explicitly configure both native pipes and console output.
$utf8Encoding=New-Object System.Text.UTF8Encoding($false)
[Console]::InputEncoding=$utf8Encoding
[Console]::OutputEncoding=$utf8Encoding
$OutputEncoding=$utf8Encoding
