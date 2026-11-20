# STND. — Beyond the Standard

STND. is a single-brand contemporary fashion store for men and women. STND. is the retailer: customers buy directly from the brand, and one private store administrator manages the catalogue and orders.

## Brand system

- **Name:** STND.
- **Pronunciation:** Standard
- **Positioning:** Luxury contemporary fashion
- **Audience:** Men and women
- **Tagline:** Beyond the standard.
- **Palette:** Obsidian \`#111111\`, off-white \`#F7F7F5\`, signal red \`#D71920\`
- **Typography:** Barlow Condensed for display, DM Sans for interface and body copy

## Stack

- Frontend: HTML, CSS and browser JavaScript
- Backend: Node.js and Express
- Database: Supabase PostgreSQL, accessed server-side with \`pg\`
- Hosting: Render web service
- Optional hosted payments: Pesepay

The backend uses a small PostgreSQL connection pool. The Supabase connection string must remain in the Render environment and must never be exposed to browser JavaScript.

## Run locally

Requires Node.js 22.5 or newer.

1. Copy \`.env.example\` to \`.env\` and fill in the database connection string.
2. Install dependencies and run the syntax checks.
3. Start the app.

\`\`\`bash
npm install
npm run check
npm start
\`\`\`

Open http://localhost:3000.

## Store capabilities

- Responsive STND. storefront, product listings, search and category filters
- Shopping bag and checkout
- Guest checkout without an account
- Optional customer sign-up or existing-customer login during checkout
- Customer accounts and order history
- PostgreSQL persistence for users, sessions, customers, products, orders and order items
- Stock checks and transactional stock deductions during checkout
- Private administrator access for catalogue and order management
- Google OAuth for verified customer sign-in and owner-admin access
- Pesepay hosted checkout when credentials are configured; otherwise orders are recorded as unpaid and await manual confirmation

Public registration always creates a customer account. Admin privileges are only assigned to the verified Google identity matching \`STND_ADMIN_EMAIL\`. There are no third-party sellers or seller accounts.

## Database

The runtime expects the following Supabase tables in \`public\`:

- \`products\`, \`product_variants\`, \`product_images\`
- \`collections\`, \`product_collections\`
- \`users\`, \`sessions\`, \`customers\`
- \`orders\`, \`order_items\`

The runtime connects directly to PostgreSQL from the Express server. Keep RLS enabled on exposed Supabase tables and do not add broad public policies. Never put the database password or a Supabase service-role key in the frontend.

## Render environment

Required:

- \`DATABASE_URL\`: Supabase shared pooler **session-mode** connection string (port 5432), with reserved password characters URL-encoded
- \`STND_ADMIN_EMAIL\`: email address that is allowed to receive the admin role after Google verifies the identity

Optional Google OAuth:

- \`GOOGLE_CLIENT_ID\`
- \`GOOGLE_CLIENT_SECRET\`
- \`GOOGLE_REDIRECT_URI=https://stnd-store.onrender.com/auth/google/callback\`

Optional Pesepay:

- \`PESEPAY_ENVIRONMENT=sandbox\` (use \`live\` only after production credentials and transactions are validated)
- \`PESEPAY_INTEGRATION_KEY\`
- \`PESEPAY_ENCRYPTION_KEY\` (32 characters)

Never commit real credentials to GitHub or paste them into source files.

## Current limitations

- Product stock is tracked at product level in checkout; full size/colour variant selection and variant-level checkout stock still need to be wired into the storefront.
- Product image upload and managed cloud media storage are not implemented yet.
- Pesepay must be validated with a complete sandbox transaction before being treated as production-ready.
- Delivery rules, returns, tax, email notifications, fraud controls and customer support workflows still need implementation.
- The six launch products and imagery are demonstration content, not confirmed supplier inventory or licensed campaign assets.
