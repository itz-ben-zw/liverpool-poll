# Liverpool Fan Poll Website

A simple website for Liverpool fans to vote whether Arne Slot should be sacked.

## Project files
- `server.js` - Express server that stores votes in `data/votes.json`
- `public/index.html` - Poll user interface
- `public/style.css` - Styling for the poll page
- `public/app.js` - Front-end logic to fetch and submit votes
- `data/votes.json` - Local vote storage

## How to run locally
1. Install Node.js (includes `npm`) from https://nodejs.org/
2. Open a terminal in this folder.
3. Run `npm install`
4. Run `npm start`
5. Open `http://localhost:3000` in your browser.

## Notes
- The app uses a cookie plus the request IP to reduce repeated voting.
- Total vote counts and percentages are visible to everyone.
