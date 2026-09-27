# GridCut

Print an image at an exact size on a normal home printer. GridCut splits the picture across A4, Letter, A3, Legal, or Tabloid pages and downloads a PDF with crop marks and an assembly guide.

Everything runs in the browser. Images are not uploaded.

## Use it

Try it in the browser: [grid-cut.netlify.app](https://grid-cut.netlify.app)

Or open `index.html` locally, then **Start printing** (`app.html`).

1. Drop, paste, or choose an image (PNG, JPG, WebP, GIF, BMP, or SVG).
2. Set the finished width and height in centimeters or inches, or mark two points and enter the real distance between them.
3. Choose the paper, orientation, margin, and overlap. The overlap starts at 1 mm.
4. Download the PDF and print every page at **100% / actual size**. Turn off “Fit to page”.

The first PDF page is the assembly guide. Trim on the crop marks, overlap the joins, and tape the sheets from the back.

## In the printer

- Crop with draggable edges, magic erase, rotate, and flip. Undo and redo cover those edits.
- Click a page in the preview to leave it out of the PDF.
- Crop marks, registration marks, page numbers, and the assembly guide can be switched on or off. The preview updates with them.
- The assembly guide stays in a panel on the right.

## Files

| File | Role |
| --- | --- |
| `index.html` | Home page |
| `app.html` | Printer |
| `app.js` | Layout, editing, and PDF |
| `styles.css` | Printer styles |
| `vendor/pdf-lib.min.js` | PDF generation ([pdf-lib](https://pdf-lib.js.org/), MIT) |
