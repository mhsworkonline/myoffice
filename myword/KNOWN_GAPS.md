# Known gaps

Things that work differently from Microsoft Word or aren't implemented.

## Layout
- **Pictures, text boxes, WordArt, charts, SmartArt and shapes** sit in line with the text. Floating objects from .docx/.doc are shown in line, and there is no text wrapping around objects.
- **Continuous section breaks** don't balance the columns of the section before the break.
- **Rows that span several rows** (vertical merges) don't break across pages. Other rows do.
- **Hyphenation** is not available.
- **Line breaking** follows Word for Latin text. Right-to-left scripts aren't supported.

## Objects
- **SmartArt:** six layouts (block list, process, cycle, organization chart, pyramid, vertical bullet list).
  - In .docx it is saved as a picture plus MyWord data, so Word shows a picture.
  - Word SmartArt opens as a block list with its text.
- **Charts:**
  - In .docx they are saved as pictures plus MyWord data, so Word shows a picture, not an editable chart.
  - Word charts open from their cached values.
- **Equations:**
  - Linear format covers fractions, scripts, radicals, large operators (∑ ∫ ∏ …), delimiters, functions and symbols.
  - Matrices, accents, equation arrays and limits-under in OMML are converted to plain linear text.
- **Shapes** can't hold text (use a text box), and their geometry can't be adjusted after inserting.
- **Not available:** icons, 3D models, screenshot, Draw tab ink.

## Proofing
- **Spelling:** English (US) only, with your own words in the custom dictionary. There is no grammar check.

## Review
- **Track Changes** records typing and deletions. Formatting changes are not tracked.
- **Not available:** Compare, Protect with password, Mail Merge.

## Files
- **.doc (Word 97-2003):**
  - Opens as a copy (Compatibility Mode) and saves as .docx.
  - Not supported: floating pictures and shapes, text boxes, comments, password-protected files, and Word 6/95 files.
  - Lists, tables and fields are read in their common forms.
- **.odt** opens as a copy and saves as .docx.
- **Unknown .docx content** (content controls, custom XML from other apps, macros in .docm) is not kept when saving.
- **PDF on the web** goes through the browser's print dialog ("Save as PDF"). The desktop app writes the PDF directly, using the first page's size for all pages.
