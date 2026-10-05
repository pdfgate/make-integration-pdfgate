# Setup & Deployment

End-to-end guide to deploy the PDFGate custom app to Make and test it before submitting for
app review. Everything here uses the CLI / git workflow — no work is done in the Make web editor.

---

## 0. Prerequisites

### Make account with API access

**The Make API (and therefore the CLI) requires a paid plan.** Make's docs state that most API
endpoints are reserved for paid subscriptions and are not available on the Free tier — on Free,
the **API access** token section does not appear in your profile at all.

To get API access, use **one** of these:

| Path | How | Notes |
|------|-----|-------|
| **Core plan** (or reactivate the paid trial) | Upgrade at [make.com](https://www.make.com) | Core ≈ $9–10/mo, monthly & cancelable; the minimum tier that exposes API access |
| **Partner sandbox account** | Via the [Technology Partner program](https://www.make.com/en/become-a-partner?type=technology) | Partners get sandbox account access; the intended channel for an official vendor connector. Application submitted — awaiting reply |

You also need to be an **Organization Owner/Admin** for the API-access UI to show.

### Find your zone

Your zone is the subdomain in your Make dashboard URL, e.g. `https://eu2.make.com/…` → zone is
`eu2.make.com` (others: `us1.make.com`, `us2.make.com`, `eu1.make.com`, …).

---

## 1. Generate a Make API token

1. In Make, click your **profile icon** (top-right) → **Profile**.
2. Open the **API access** tab in the left navigation.
3. Click **+ Add token**.
4. Select scopes — at minimum:
   - `sdk-apps:read`
   - `sdk-apps:write`
5. Add a **Label** (e.g. `pdfgate-cli`), click **Add**.
6. **Copy the token immediately** — it is shown only once.

> This token authenticates the **CLI to your Make account**. It is unrelated to the PDFGate API
> key that end users enter when they create a connection. If you use multiple zones, create one
> token per zone.

---

## 2. Install & authenticate the Make CLI

```bash
npm install -g @makehq/cli

# Option A — interactive (stores credentials in ~/.config/make-cli/config.json)
make-cli login          # select your zone, paste the token
make-cli whoami         # confirm auth

# Option B — CI-friendly environment variables (used automatically by deploy.sh)
export MAKE_API_KEY="your-token"
export MAKE_ZONE="eu2.make.com"
```

---

## 3. Deploy

```bash
cd sdks/make-integration-pdfgate
scripts/deploy.sh
```

The script is idempotent — it creates the app, connection, modules, universal module, custom
function, and webhook if missing, then pushes every section from `src/`. Re-run it after editing
any file under `src/`.

The script also uploads the icon, syncs label/description/theme, links the `Envelope Events`
webhook to the PDFGate connection, and links the `watchEnvelopeEvents` trigger to that webhook
(both via the Make API, since the CLI has no flags for them). Without the webhook→connection
link, `{{connection.apiKey}}` is empty during `attach` and the webhook is never registered with
PDFGate — Make still shows a URL, but nothing appears in the PDFGate dashboard.

Verify (the deployed app on our eu1 account is `pdfgate-plqcq7`):

```bash
make-cli sdk-apps        list
make-cli sdk-modules     list --app-name=pdfgate-plqcq7 --app-version=1
make-cli sdk-connections list --app-name=pdfgate-plqcq7
make-cli sdk-webhooks    list --app-name=pdfgate-plqcq7
```

> **Auto-generated names:** Make appends a random suffix to the app name (`pdfgate-plqcq7`) and
> auto-names the connection and webhook after it. `deploy.sh` finds the app by its label
> (`PDFGate`) and resolves the connection/webhook names from Make, so nothing needs editing.
> Set `APP_NAME=<name>` to target a different app explicitly.

> **Custom IML functions are gated.** Make has disabled self-service IML functions; creating one
> returns `403 Insufficient rights, admin permission "apps edit" is needed`. The script warns
> and continues. Open a [Make helpdesk ticket](https://www.make.com/en/ticket) asking to enable
> custom IML functions for app `pdfgate-plqcq7` (or to deploy
> `src/functions/verifyPdfgateSignature/code.js` on our behalf), then re-run `deploy.sh`.

---

## 4. Test in a scenario (before submission)

Your private app appears in the scenario builder under **PDFGate**. Use a **`test_…`** API key so
everything runs against the sandbox (no billing).

### 4a. Connection & a simple action (also test an **invalid** key — the dialog must show `[401] Invalid api key`)
1. Add a module → search **PDFGate** → **Generate a PDF**.
2. Create a connection, paste your `test_…` key. The sandbox base URL is selected automatically.
3. Run once with an `html` or `url` value → confirm the output bundle has `id` and `fileUrl`.

### 4b. Universal module
- Add **Make an API call**, set `Method = GET`, `URL = /document/{id}` (from 4a) → confirm it
  returns `statusCode` 200 and the document `body`. The host is prefixed automatically.

### 4c. Envelope flow
1. **Create an Envelope** (a `sourceDocumentId` + recipient), then **Send an Envelope**.
2. Note the `envelopeId`; **Get an Envelope** to read its status.

### 4d. Instant trigger + HMAC (the live-only checks)
1. Add **Watch Envelope Events**, click **Add** next to Webhook, pick the PDFGate connection and
   an event, then save. Make calls `attach` (`POST /webhook`) immediately — the webhook should
   appear in the PDFGate dashboard. If the dialog does not ask for a connection, the webhook
   is not linked to the connection on Make (re-run `deploy.sh`) and any webhook created before
   the link must be deleted and re-created in the scenario.
2. Trigger a real event (create → send an envelope, then complete/expire it).
3. Confirm: the scenario fires with `eventId`, `event`, `envelopeId` and `data.envelope` populated,
   and a **tampered** delivery is dropped (Make answers `Accepted` but no bundle is created and the
   scenario does not run). Valid deliveries are answered with `{"message":"OK"}`. Both appear in
   the hook's logs (Make API `GET /hooks/{hookId}/logs`; only valid ones have parsed bundles).

The function test can be run from the app editor's IML function test runner (or see
`src/functions/verifyPdfgateSignature/test.js`).

---

## 5. Live-only items to confirm on first run

1. **Signature verification runs on built-in IML** (`sha256` HMAC + `createJSON`), so the
   trigger works without the custom function. It has no replay-window check until Make enables
   `verifyPdfgateSignature` (helpdesk ticket, see step 3).
2. **Attach-saved data in the webhook `api` is `{{data.secret}}`** (verified live on 2026-10-04;
   `{{webhook.secret}}` is empty there). Do not "fix" it back.
3. **Trigger module `api` is `{"response": {"output": "{{payload}}"}}`** — not `{{body}}`. With
   `{{body}}` the trigger emits an empty bundle and downstream modules get empty IDs.
4. **`{{webhook.webhookId}}`** in `detach` — Make's documented form for detach; confirm by deleting
   a hook in Make and checking it disappears from the PDFGate dashboard.

---

## 5b. Review re-submission checklist (from Make's first review, 2026-10-05)

Make asked for test scenarios covering: every module, a connection attempt with an **invalid key**,
a run that **produces an API error**, and a **webhook delivery** to the instant trigger. The same
scenario link may be reused for several modules. Module output keys changed to the API's names
(`id`), so remap `{{n.documentId}}` → `{{n.id}}` and `{{n.envelopeId}}` → `{{n.id}}` in existing
scenarios before re-running them.

## 6. Submit for app review

Custom apps stay **private** until you request review — you can share via invite link without
submitting. When ready, use **Request app review** in the Apps editor. Make checks against their
[app-review prerequisites](https://developers.make.com/custom-apps-documentation/app-review/prerequisites)
(naming, descriptions, a universal module — ✅ included, error handling, etc.).

After the app is **verified and published**, complete the
[Technology Partner](https://www.make.com/en/become-a-partner?type=technology) steps to get
PDFGate listed in the public apps directory.
