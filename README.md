# ShopSail • E‑Commerce Showroom (React + Vite)

A polished, Amazon/Flipkart‑inspired demo storefront. Frontend‑only, zero backend required. Includes product catalog grid with filters, product detail pages, demo login, cart in session, and a sleek Flipkart‑blue theme with optional dark mode.

## Quickstart

```bash
npm install
npm start
```

- App runs at http://localhost:3000
- Build for production: `npm run build` (outputs `dist/`)
- Preview production build: `npm run preview`

## Features
- Demo login with “Enter as Demo User”
- 20 products with images, titles, descriptions, prices, ratings
- Catalog grid with hover actions, filters sidebar, and search bar
- Product detail pages with CTA and review modal (demo only)
- Cart stored in session; “Proceed to Checkout” page (non‑functional)
- Flipkart‑style colorway; theme toggle with dark mode

## Project Structure
```
/ (root)
  package.json
  vite.config.js
  index.html
  /src
    App.jsx
    main.jsx
    styles.css
    /data
      products.js
```

## Deploy to Vercel
- Import this repository in Vercel
- Framework preset: Vite
- Build Command: `npm run build`
- Output Directory: `dist`
- Install Command: `npm install` (default)

## Screenshots
- Catalog grid with filters
- Product detail page
- Cart page and checkout demo

This project is for educational/demo purposes.