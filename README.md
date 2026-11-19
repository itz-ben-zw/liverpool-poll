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
