# STND. — Beyond the Standard

STND. is a contemporary fashion e-commerce storefront for men and women. The visual identity pairs editorial fashion imagery and oversized condensed typography with an off-white, black and signal-red palette.

## Brand system

- **Name:** STND.
- **Pronunciation:** Standard
- **Positioning:** Luxury contemporary fashion
- **Audience:** Men and women
- **Tagline:** Beyond the standard.
- **Palette:** Obsidian `#111111`, off-white `#F7F7F5`, signal red `#D71920`
- **Typography:** Barlow Condensed for display, DM Sans for interface and body copy
- **Art direction:** High-contrast editorial photography, monochrome product imagery, generous whitespace and restrained red accents

## Run locally

Requires Node.js 22.5 or newer (uses the built-in `node:sqlite` module).

```bash
npm install
npm start
```

Open http://localhost:3000.

## Current storefront

- Responsive editorial landing page and collection navigation
- Men, women, footwear and accessories catalogue filters
- Product imagery, search and sorting
- Shopping bag and order checkout flow
- Buyer and seller accounts, seller inventory and order views
- Google OAuth support, subject to environment configuration

The original demo seed catalogue is migrated to a six-piece STND. fashion collection when the server starts. Seller-created listings are not changed.

## Important limitations before launch

This is an initial brand and storefront redesign, not a production-ready fashion commerce platform.

- Product stock is currently tracked at product level, not by size and colour variant.
- The current checkout records orders but does not process online payments.
- Product image upload and cloud media storage are not yet implemented.
- SQLite on Render Free uses ephemeral storage. Connect the app to persistent PostgreSQL/Supabase before relying on customer, order or inventory data.
- Delivery rules, returns, tax, email notifications, fraud controls and customer support workflows still need implementation.
- The current sample collection and imagery are demonstration content, not confirmed supplier inventory or licensed campaign assets.

## Google sign-in

Configure the Google OAuth client and the following environment variables on the hosting service:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI=https://quickcart-ecommerce-gu1i.onrender.com/auth/google/callback`

Never commit OAuth secrets to the repository.
