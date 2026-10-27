---
state: provisional
gate: gate_pending
proposed_by: external_ai (via Codex)
confirmed_by: null
---
# C UI artwork provenance

The three PNG files were supplied through the existing GemTower C1/C2/C3 packet, generated in web ChatGPT on2026-10-26 with the previously approved UI/field references. Source paths and byte SHA are in provenance.json. They contain no Warcraft installation or map files.

The source PNG bytes are copied unchanged. C1 is drawn through the existing canvas UI path with declared atlas rectangles. Its renderer makes only edge-connected magenta transparent, preserving enclosed purple gem colours; the separately supplied threshold-alpha variant is not shipped. No new picture was generated. C2 has a CSS dark gradient under native title/progress text. C3 is loaded lazily for a result and receives code-painted text and actual result values.

The three star frames are indexed for source completeness but not displayed: no new star rating rule is invented. Native labels, input handlers, URL share and cancellation/clipboard/manual fallback remain. Image sharing is offered only when a prepared file and canShare support exist. A missing image/canvas/File API keeps the URL path available.

Visible application and physical share-sheet compatibility require independent review; unit/build/package checks do not approve the look or prove device behaviour.

## Startup follow-up

A cold visit requests the large decorative atlas and scene only after the game loader declares its core ready. Before then native text/controls are the fallback; already-decoded art remains available on subsequent loading screens. The loader waits explicit regular/bold game font loads rather than the document-wide FontFaceSet.ready barrier. Wide landscape desktops use C3 for the existing scene element; phones retain C2.

The result encoder requests JPEG at quality0.88. Filename and MIME follow the returned Blob, including PNG fallback if a browser returns that format. The original PNG resources remain unchanged. Share caption backing stays dark through the date line and text has an outline. Actual cold network latency, readability and encoded byte size require independent browser/device review.
