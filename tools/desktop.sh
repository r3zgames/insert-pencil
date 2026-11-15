#!/bin/sh
# Desktop apps (owner 2026-11-15, like Jimothy's releases): the website build in Electron for macOS (universal),
# Windows (x64) and Linux (x64), zipped into Releases/ with SHA256SUMS-desktop.txt beside the single-file release.
# macOS is ad-hoc signed and not notarized (first launch: right-click > Open); Windows is unsigned.
# Needs desktop/node_modules (cd desktop && npm install); Electron downloads its platform builds on first use.
# Usage: sh tools/desktop.sh [mac|win|linux ...]   (default: all three)
set -e
cd "$(dirname "$0")/.."
VERSION=$(node -p "require('./build/manifest.json').version")
NAME="No. 2 Arcade"
OUT=desktop/out
REL=Releases
TARGETS=${*:-mac win linux}
mkdir -p "$OUT" "$REL"

echo "website build into desktop/web"
rm -rf desktop/web
node build/build.cjs --web desktop/web | tail -1

echo "icons from the approved home-screen icon"
python3 - <<'EOF'
import os, subprocess, shutil
from PIL import Image
# the approved 2048 px original where it exists (this Mac), else the packed 512 px copy (the public repository)
src = Image.open('art/ui-hub/app-icon/app-icon-home-v2.png' if os.path.exists('art/ui-hub/app-icon/app-icon-home-v2.png') else 'assets/arcade/page/app-icon-512.png').convert('RGB')
src.resize((512, 512), Image.LANCZOS).save('desktop/icon.png')
src.resize((256, 256), Image.LANCZOS).save('desktop/out/icon.ico', sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
# macOS: the system does not round a desktop app's icon, so the square is drawn as a rounded tile with a margin
from PIL import ImageDraw
def tile(n):
    m = int(n * 0.1); s = n - 2 * m
    im = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    mask = Image.new('L', (s, s), 0); ImageDraw.Draw(mask).rounded_rectangle((0, 0, s - 1, s - 1), radius=int(s * 0.225), fill=255)
    im.paste(src.resize((s, s), Image.LANCZOS), (m, m), mask)
    return im
d = 'desktop/out/icon.iconset'; shutil.rmtree(d, ignore_errors=True); os.makedirs(d)
for n in (16, 32, 128, 256, 512):
    tile(n).save(f'{d}/icon_{n}x{n}.png'); tile(n * 2).save(f'{d}/icon_{n}x{n}@2x.png')
subprocess.run(['iconutil', '-c', 'icns', d, '-o', 'desktop/out/icon.icns'], check=True)
EOF

pack() { # platform arch icon
  desktop/node_modules/.bin/electron-packager desktop "$NAME" --platform="$1" --arch="$2" --icon="$3" \
    --app-version="$VERSION" --app-copyright="R3Z Games LLC" --out="$OUT" --overwrite \
    --ignore='^/out($|/)' --ignore='^/node_modules($|/)' --ignore='\.DS_Store$' \
    --appBundleId=de.no2arca.arcade --appCategoryType=public.app-category.arcade-games \
    --win32metadata.CompanyName="R3Z Games LLC" --win32metadata.ProductName="$NAME" --win32metadata.FileDescription="$NAME" >/dev/null
}

for t in $TARGETS; do
  case $t in
    mac)
      echo "macOS (universal)"
      pack darwin universal desktop/out/icon.icns
      APP="$OUT/$NAME-darwin-universal/$NAME.app"
      codesign --force --deep --sign - "$APP"
      rm -f "$REL/No2-Arcade-v$VERSION-macos.zip"
      ditto -c -k --keepParent "$APP" "$REL/No2-Arcade-v$VERSION-macos.zip" ;;
    win)
      echo "Windows (x64)"
      pack win32 x64 desktop/out/icon.ico
      rm -f "$REL/No2-Arcade-v$VERSION-windows.zip"
      (cd "$OUT/$NAME-win32-x64" && zip -q -r -9 "../../../$REL/No2-Arcade-v$VERSION-windows.zip" .) ;;
    linux)
      echo "Linux (x64)"
      pack linux x64 desktop/icon.png
      rm -f "$REL/No2-Arcade-v$VERSION-linux.zip"
      (cd "$OUT/$NAME-linux-x64" && zip -q -r -y -9 "../../../$REL/No2-Arcade-v$VERSION-linux.zip" .) ;;
  esac
done

(cd "$REL" && shasum -a 256 No2-Arcade-v"$VERSION"-macos.zip No2-Arcade-v"$VERSION"-windows.zip No2-Arcade-v"$VERSION"-linux.zip 2>/dev/null > SHA256SUMS-desktop.txt || true)
ls -l "$REL"/No2-Arcade-v"$VERSION"-*.zip
