# PWA Icons Generation

To generate PWA icons from the base SVG, you can use any of these tools:

## Method 1: Using ImageMagick (convert)
```bash
# Install ImageMagick first
brew install imagemagick  # macOS
sudo apt install imagemagick  # Ubuntu/Debian

# Generate all required sizes
for size in 72 96 128 144 152 192 384 512; do
  convert -background transparent -resize ${size}x${size} icon-base.svg icon-${size}x${size}.png
done
```

## Method 2: Using Inkscape
```bash
# Install Inkscape first
brew install inkscape  # macOS
sudo apt install inkscape  # Ubuntu/Debian

# Generate all required sizes
for size in 72 96 128 144 152 192 384 512; do
  inkscape --export-width=${size} --export-height=${size} --export-filename=icon-${size}x${size}.png icon-base.svg
done
```

## Method 3: Using rsvg-convert
```bash
# Install librsvg first
brew install librsvg  # macOS
sudo apt install librsvg2-bin  # Ubuntu/Debian

# Generate all required sizes
for size in 72 96 128 144 152 192 384 512; do
  rsvg-convert -w ${size} -h ${size} -o icon-${size}x${size}.png icon-base.svg
done
```

## Method 4: Online Tools
You can also use online SVG to PNG converters like:
- https://cloudconvert.com/svg-to-png
- https://convertio.co/svg-png/
- https://www.iloveimg.com/convert-svg-to-png

## Required Icon Sizes
- 72x72px
- 96x96px
- 128x128px
- 144x144px
- 152x152px
- 192x192px (maskable)
- 384x384px
- 512x512px (maskable)