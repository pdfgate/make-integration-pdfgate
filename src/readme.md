# PDFGate

Generate, process, and e-sign PDFs from your Make scenarios with [PDFGate](https://pdfgate.com).

## Connection

Create a **PDFGate** connection with your API key from the [PDFGate dashboard](https://pdfgate.com).

- Keys starting with `live_` call the production API (`https://api.pdfgate.com`).
- Keys starting with `test_` call the sandbox API (`https://api-sandbox.pdfgate.com`) — no live usage is billed.

The correct base URL is selected automatically from the key prefix.

## Modules

**Documents**

- **Generate a PDF** — render a PDF from a URL or raw HTML.
- **Upload a File** — store a PDF from a public URL for use by other modules.
- **Get a Document** — retrieve a stored document by ID.
- **Delete a Document** — delete a stored document by ID.
- **Compress a PDF** — reduce a PDF's file size.
- **Flatten a PDF** — flatten an interactive PDF into a static one.
- **Extract Form Data** — extract form field values from a fillable PDF.
- **Protect a PDF** — encrypt a PDF and apply permission restrictions.
- **Watermark a PDF** — apply a text watermark to a PDF.

**Envelopes (e-signature)**

- **Create an Envelope** — create a signing envelope from one or more documents.
- **Send an Envelope** — send an envelope to its recipients.
- **Get an Envelope** — retrieve an envelope by ID.

**Triggers**

- **Watch Envelope Events** — instant trigger that fires on `envelope.sent`, `envelope.completed`, `envelope.expired`, or `envelope.document.completed`.

**Other**

- **Make an API call** — perform an arbitrary authorized call to any PDFGate endpoint using your connection (relative path).

Modules that return a `fileUrl` accept a **Pre-Signed URL Expiry** (60–86400 seconds, default 3600) controlling how long the returned link stays valid.
