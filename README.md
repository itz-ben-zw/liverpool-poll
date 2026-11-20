# QuickCart

A two-sided marketplace prototype with a responsive storefront, buyer accounts, seller accounts, product inventory and order handling.

## Run locally

Requires Node.js 22.5 or newer (uses the built-in `node:sqlite` module).

```bash
npm install
npm start
```

Open http://localhost:3000.

## Current functionality

- Buyer and seller registration and sign-in.
- Passwords hashed with Node.js scrypt; session tokens are random, stored as SHA-256 hashes, and delivered in HttpOnly cookies.
- Buyer order history.
- Seller-owned product creation, editing, stock adjustments and removal from the storefront.
- Seller order visibility for orders containing their products.
- Server-side checkout price and inventory validation, with stock decremented transactionally.
- Health endpoint: `GET /api/health`.

## API overview

- `POST /api/auth/register` with `name,email,password,role` (role is buyer or seller).
- `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`.
- `GET /api/products`, `POST /api/checkout`.
- Authenticated buyer: `GET /api/orders`.
- Authenticated seller: `GET /api/seller/products`, `POST /api/seller/products`, `PATCH /api/seller/products/:id`, `DELETE /api/seller/products/:id`, `GET /api/seller/orders`.

## Important deployment notes

The current app stores data in SQLite. On Render Free, the service filesystem is ephemeral, so database records can be lost when the instance restarts or redeploys. Use a persistent disk on a supported plan or complete the Supabase PostgreSQL integration before treating this as production. Supabase has a prepared marketplace schema, but this application is not yet connected to it.

This is a marketplace prototype, not a fully production-hardened commerce platform. It does not yet include payment processing, seller identity verification, admin moderation/disputes, email verification, password reset, CSRF protection, or production-grade order fulfilment workflows. Do not collect real payment details.


## Google sign-in setup

QuickCart supports Google OAuth sign-in. Configure a **Web application** OAuth client in Google Cloud Console and add this exact authorized redirect URI:

`https://quickcart-ecommerce-gu1i.onrender.com/auth/google/callback`

Add these environment variables to the Render web service:

- `GOOGLE_CLIENT_ID`: the OAuth 2.0 client ID.
- `GOOGLE_CLIENT_SECRET`: the OAuth 2.0 client secret. Keep this secret only in Render, never in browser code or GitHub.
- `GOOGLE_REDIRECT_URI`: `https://quickcart-ecommerce-gu1i.onrender.com/auth/google/callback`.

For local development, use `http://localhost:3000/auth/google/callback` as the redirect URI and set `GOOGLE_REDIRECT_URI` accordingly. Add both local and production callback URLs to the Google OAuth client if you use both.

The first Google sign-in creates a QuickCart account. New accounts use the selected buyer or seller role. If a verified Google email matches an existing QuickCart account, the Google identity is linked to that account. Google ID tokens are verified on the server using Google's Node.js authentication library. Existing email/password sign-in remains available.

## 3D packaging storefront

The marketplace product tiles now render real-time Three.js packaging models in WebGL. Each package is assembled as 3D geometry with a product-specific printed label, studio lighting, slow rotation, pointer-driven tilt and GSAP hover motion. Rendering is limited to visible cards; a static packaging fallback remains when WebGL is unavailable, and reduced-motion preferences disable the animation.

The browser also attempts to load an exported GLB at `public/models/product-<id>.glb`. If no matching GLB exists, it uses the built-in Three.js model so the storefront still works. Seller-created products receive the procedural model automatically.

### Export Blender GLB assets

A Blender Python exporter is included at `scripts/blender/create_packaging.py`. Open Blender, switch to the Scripting workspace, load that script and run it. It exports the six seeded packaging assets into `public/models/`. Commit those generated GLB files to make Blender-authored packaging replace the browser-generated versions. The current hosted experience uses the live procedural Three.js models until those Blender assets are exported and committed.

Three.js and GSAP are installed as app dependencies and served from the app itself, rather than relying on a third-party CDN.
