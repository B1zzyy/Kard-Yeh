# Card Graphics Setup Guide

## Overview
Your Konchina card game now supports custom card graphics! The system will automatically use custom images when available and gracefully fall back to the original text-based design when images are missing.

## Directory Structure
Place your card images in the following structure:
```
assets/
└── cards/
    ├── ace_of_spades.png
    ├── ace_of_hearts.png
    ├── ace_of_diamonds.png
    ├── ace_of_clubs.png
    ├── 2_of_spades.png
    ├── 2_of_hearts.png
    ├── 2_of_diamonds.png
    ├── 2_of_clubs.png
    ├── 3_of_spades.png
    ├── 3_of_hearts.png
    ├── 3_of_diamonds.png
    ├── 3_of_clubs.png
    ├── 4_of_spades.png
    ├── 4_of_hearts.png
    ├── 4_of_diamonds.png
    ├── 4_of_clubs.png
    ├── 5_of_spades.png
    ├── 5_of_hearts.png
    ├── 5_of_diamonds.png
    ├── 5_of_clubs.png
    ├── 6_of_spades.png
    ├── 6_of_hearts.png
    ├── 6_of_diamonds.png
    ├── 6_of_clubs.png
    ├── 7_of_spades.png
    ├── 7_of_hearts.png
    ├── 7_of_diamonds.png
    ├── 7_of_clubs.png
    ├── 8_of_spades.png
    ├── 8_of_hearts.png
    ├── 8_of_diamonds.png
    ├── 8_of_clubs.png
    ├── 9_of_spades.png
    ├── 9_of_hearts.png
    ├── 9_of_diamonds.png
    ├── 9_of_clubs.png
    ├── 10_of_spades.png
    ├── 10_of_hearts.png
    ├── 10_of_diamonds.png
    ├── 10_of_clubs.png
    ├── jack_of_spades.png
    ├── jack_of_hearts.png
    ├── jack_of_diamonds.png
    ├── jack_of_clubs.png
    ├── queen_of_spades.png
    ├── queen_of_hearts.png
    ├── queen_of_diamonds.png
    ├── queen_of_clubs.png
    ├── king_of_spades.png
    ├── king_of_hearts.png
    ├── king_of_diamonds.png
    └── king_of_clubs.png
```

## Image Requirements
- **Format**: PNG, JPG, or SVG (PNG recommended for best quality)
- **Size**: Recommended 280x392 pixels (2:2.8 aspect ratio) or higher
- **Quality**: High resolution for crisp display
- **Background**: Should include card background (white/cream recommended)

## Where to Get Card Images

### Free Options:
1. **Wikimedia Commons**: High-quality public domain playing cards
   - Search for "French playing cards" or "Standard playing cards"
   - Download individual card images

2. **OpenGameArt.org**: Free game assets including playing cards
   - Look for "playing cards" or "card deck" assets

3. **Create Your Own**: Use design tools like:
   - Canva (has playing card templates)
   - GIMP (free image editor)
   - Figma (free design tool)

### Premium Options:
1. **Adobe Stock**: Professional card designs
2. **Shutterstock**: Various artistic card styles
3. **Getty Images**: High-quality photography

## Testing Your Setup
1. Add a few card images to the `assets/cards/` directory
2. Open your game in a browser
3. Start a game - cards with images will display the graphics
4. Cards without images will automatically show the original text design

## Face Card Customization
The face cards (Jack, Queen, King) are perfect candidates for custom artwork:
- **Jack**: Young male figure, often shown in profile
- **Queen**: Female figure, usually more ornate
- **King**: Mature male figure, typically with crown/beard

## Advanced Customization
If you want to use a different naming convention, modify the `getCardImagePath()` function in `script.js`:

```javascript
// Current format: ace_of_spades.png
return `assets/cards/${valueName}_of_${suitName}.png`;

// Alternative formats you could use:
// return `assets/cards/${card.value}${card.suit}.png`;  // AS.png
// return `assets/cards/${suitName}/${valueName}.png`;   // spades/ace.png
// return `assets/cards/${valueName}_${suitName}.svg`;   // ace_spades.svg
```

## Troubleshooting
- **Images not loading**: Check file names match exactly (case-sensitive)
- **Images look stretched**: Ensure proper aspect ratio (2:2.8)
- **Performance issues**: Optimize image file sizes (recommended under 100KB each)

Start by adding just the face cards (Jack, Queen, King) first - these will have the most visual impact! 