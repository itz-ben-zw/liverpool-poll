# STND. AI Assistant v1

## What it does

The assistant supports two store journeys:

- **Personal shopping:** understands a shopper's style, category and occasion needs, then recommends up to three matching products.
- **Customer support:** answers common questions using the store's documented policies and clearly hands off anything the store has not confirmed.

## Architecture

```text
Browser chat widget
  -> POST /api/assistant/chat (Express on Render)
    -> PostgreSQL product catalogue (Supabase)
    -> Gemini Interactions API
  <- reply + validated product records
```

The API retries temporary provider failures with exponential backoff, then switches to the fallback Gemini model when the primary model remains overloaded or times out. Authentication and invalid-request errors are not retried or masked by a model switch.

The browser never receives the Gemini API key. The assistant reads only active, in-stock product records. Product IDs returned by Gemini are checked against that catalogue before the API sends product cards to the browser.

## Render environment variables

Add these to the existing STND web service:

- `GEMINI_API_KEY`: key created in Google AI Studio. Keep it server-side.
- `GEMINI_MODEL`: optional primary model; defaults to `gemini-3.8-flash`.
- `GEMINI_FALLBACK_MODEL`: optional fallback model; defaults to `gemini-3.5-flash-lite`.

No Supabase schema change or new database is required.

## Privacy and safety

- Requests use Gemini's stateless `store: false` mode.
- Conversation history is held in browser memory for the current page session and is not saved to PostgreSQL.
- The assistant cannot access customer accounts, private orders or payment records.
- It cannot place orders, process refunds, change accounts or add products to the bag.
- It must not invent delivery windows, shipping costs, return windows or other unconfirmed store policies.
- The API applies a basic per-IP request limit. Provider keys and error details are not returned to the browser.

## Local verification

Run:

```sh
npm install
npm run check
```

The check script validates the server, assistant API module, assistant browser script and existing inline storefront JavaScript.
