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

## Deploying to a free public host
This project is ready for free hosting services such as Render.

### Render deployment
1. Create a free Render account at https://render.com/
2. Connect your GitHub repository or push this repository to GitHub.
3. In Render, create a new Web Service and import this repo.
4. Use the default `npm install` build command and `npm start` start command.
5. Select the free plan.

Render will give you a public URL where the app is hosted.

## Notes
- The app uses a cookie plus the request IP to reduce repeated voting.
- Total vote counts and percentages are visible to everyone.
- Deploying to a cloud host removes the need to keep your PC running.
