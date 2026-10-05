# make-integration-pdfgate

The [PDFGate](https://pdfgate.com) **custom app for [Make](https://www.make.com)** — generate,
process, and e-sign PDFs from Make scenarios.

This repo is developed **programmatically, from the CLI** — no work is done in the Make
web editor. Every component is a version-controlled section file under [`src/`](src) and is
pushed to Make with the [Make CLI](https://developers.make.com/make-cli) via
[`scripts/deploy.sh`](scripts/deploy.sh).

## How it works

A Make custom app is not hosted code — it is declarative JSON that tells Make how to call the
existing PDFGate REST API. Each component (the app **base**, the **connection**, each
**module**, the **webhook**) is made of named *sections* (`base`, `api`, `parameters`,
`expect`, `interface`, `attach`, `detach`, …). We keep one file per section in git and
`deploy.sh` calls `make-cli sdk-* set-section` to upload them.

```
src/
  base.imljson                     # shared base URL + auth header + error handling
  readme.md                        # app docs shown inside Make
  connections/pdfgate/
    api.imljson                    # credential validation (GET /auth)
    parameters.imljson             # the API Key field
  modules/<module>/
    api.imljson                    # HTTP request (communication)
    expect.imljson                 # mappable input parameters
    interface.imljson              # output fields
  webhooks/envelopeEvents/
    api.imljson  parameters.imljson  attach.imljson  detach.imljson
  functions/verifyPdfgateSignature/
    code.js  test.js                # HMAC-SHA256 signature verification
scripts/deploy.sh                  # make-cli deploy
assets/icon-512.png                # app icon uploaded by deploy.sh (Make requires 512×512)
app.json                           # app metadata (name, label, theme, …)
```

### Sandbox vs. production

There is a single connection. The base URL is chosen from the API key prefix:

- `test_…` → `https://api-sandbox.pdfgate.com` (sandbox, not billed)
- `live_…` → `https://api.pdfgate.com` (production)

## Prerequisites

> Full step-by-step (account, API access/plan, token, deploy, and a scenario test checklist) is in
> **[SETUP.md](SETUP.md)**. Note: the Make API/CLI requires a **paid plan or a partner sandbox** —
> the Free tier has no API access.

```bash
npm install -g @makehq/cli
```

Authenticate (pick one):

```bash
# Interactive (stores credentials in ~/.config/make-cli/config.json)
make-cli login && make-cli whoami

# OR CI-friendly environment variables
export MAKE_API_KEY="your-make-api-key"
export MAKE_ZONE="eu2.make.com"        # your account's zone
```

> The Make API key here authenticates the **CLI to your Make account** — it is unrelated to
> your PDFGate API key (which end users enter when they create the connection).

## Deploy

```bash
scripts/deploy.sh
```

The script is idempotent: it creates the app, connection, modules, and webhook if they are
missing, then pushes every section. Re-run it after editing any file under `src/`.

Make appends a random suffix to the app name on creation (ours is `pdfgate-plqcq7`), and
connection / webhook names are auto-generated too. The script resolves all three from Make
(by label) and prints them in its final summary. To target a specific app, set
`APP_NAME=<name>`. It also performs two links the CLI cannot: webhook → connection (required
for `attach`/`detach` to authenticate) and trigger module → webhook.

Verify:

```bash
make-cli sdk-apps        list
make-cli sdk-modules     list --app-name=pdfgate-plqcq7 --app-version=1
make-cli sdk-connections list --app-name=pdfgate-plqcq7
make-cli sdk-webhooks    list --app-name=pdfgate-plqcq7
```

## Modules

Groups as shown in the scenario builder (`src/groups.imljson`):

| Group | Module | Endpoint |
|------|--------|----------|
| Triggers | Watch envelope events (instant) | `POST /webhook` (attach) / `DELETE /webhook/{id}` (detach) |
| PDF operations | Generate a PDF | `POST /v1/generate/pdf` |
| PDF operations | Compress a PDF | `POST /compress/pdf` |
| PDF operations | Flatten a PDF | `POST /forms/flatten` |
| PDF operations | Extract form data | `POST /forms/extract-data` |
| PDF operations | Protect a PDF | `POST /protect/pdf` |
| PDF operations | Watermark a PDF | `POST /watermark/pdf` |
| Documents | Get a document | `GET /document/{id}` |
| Documents | Upload a file | `POST /upload` (public URL) |
| Documents | Delete a document | `DELETE /document/{id}` |
| Envelopes | Get an envelope | `GET /envelope/{id}` |
| Envelopes | Create an envelope | `POST /envelope` |
| Envelopes | Send an envelope | `POST /envelope/{id}/send` |
| Other | Make an API call | any endpoint, relative path, host prefixed from the key (`test_` → sandbox) |

A published Make app cannot delete modules, so retired modules (currently `downloadFile`) are kept
**hidden** (`set-private`) by `deploy.sh` and are not part of the reviewed app.

Conventions required by Make's app review (all applied):

- Module outputs are the API response **as is** (`"output": "{{body}}"`); interfaces use the API's
  key names (`id`, not `documentId`/`envelopeId`) with labels "Document ID" / "Envelope ID".
- Labels in sentence case (acronyms kept), descriptions in the third person, module action
  (`crud`) set for single-purpose modules, every module `public` (visible).
- Base `timeout` is 300000 ms (Make's maximum); the Generate "Render timeout" is capped to match.
- Connection `apiKey` is of type `password`; connection errors surface `[status] body.message`.
- Array parameters use singular item labels and a custom "Add …" button label.

## Known follow-ups

1. **Custom IML function not deployed.** Make has disabled self-service custom IML functions
   platform-wide; the CLI returns `403 Insufficient rights, admin permission "apps edit" is
   needed`. `deploy.sh` warns and continues. Until Make deploys `verifyPdfgateSignature` for us,
   the webhook verifies signatures with built-in IML instead (no replay window — see
   Signature verification). Request the function via the
   [Make helpdesk](https://www.make.com/en/ticket) (attach `src/functions/verifyPdfgateSignature/code.js`)
   to restore replay protection.
2. **`detach` uses `{{webhook.webhookId}}`** (documented form for detach). In the webhook `api`
   the same data is `{{data.*}}` (verified live); confirm detach works by deleting a hook in Make
   and checking the webhook disappears from the PDFGate dashboard.

## Signature verification

PDFGate signs every delivery with `x-pdfgate-signature` (HMAC-SHA256, header format
`t=<ts>,v1=<sig>[,v1=<sig>]`, signed over `` `${ts}.${JSON.stringify(payload)}` ``).

Because Make has disabled self-service custom IML functions (see Known follow-ups), the webhook
`api` verifies the signature with **built-in IML only**, computed once in `temp.valid`:

```
contains(sig, 'v1=' + sha256(substring(sig, 2, indexOf(sig, ',')) + '.' + createJSON(body), 'hex', data.secret))
```

`createJSON(body)` re-serializes the parsed body exactly like the sender's `JSON.stringify` (verified
byte-for-byte against live deliveries: same length and matching HMAC), `sha256(text, 'hex', key)` is
Make's HMAC form, and `contains` accepts any `v1=` during secret rotation. A `rawBody` variable is
**not** available in the webhook runtime — referencing it throws an IML error (tested 2026-10-05), so
the re-serialization approach is the only byte-exact option without a custom function. `condition` is
`{{temp.valid}}`; valid deliveries are answered `200 {"message":"OK"}`. When the condition is false
Make stops before `respond` and answers its default `200 Accepted` with no bundle, so the scenario
never runs for a bad signature (verified live by replaying signed, tampered and unsigned requests).

> **Attach-saved data is `data.*` inside the webhook communication.** Values stored via
> `response.data` in `attach` (`secret`, `webhookId`) are exposed as `{{data.secret}}` in the
> webhook `api`; `{{webhook.*}}` is **empty** there and only works in `detach`.
>
> **Instant-trigger module output must be `{{payload}}`.** The webhook `output` builds the bundle
> and the trigger module receives it as `payload`; `{{body}}` yields an empty bundle.

**Trade-off:** no replay window (the 5-minute timestamp check), because Make documents no
`now`/`timestamp` keyword for custom-app IML. The full implementation lives in
[`src/functions/verifyPdfgateSignature`](src/functions/verifyPdfgateSignature); once Make enables
custom IML functions for the app, switch the webhook `api` to
`{{verifyPdfgateSignature(headers.`x-pdfgate-signature`, body, data.secret)}}`.

## License

[MIT](LICENSE)
