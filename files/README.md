# Wigo

A private chat app. You add friends with their Wigo ID and their name, then chat, call, play and share.

## Run it
    npm install
    npm start        # http://localhost:3000

Optional: send real emails (needs a Gmail App Password)

    SMTP_USER=you@gmail.com SMTP_PASS=your-app-password npm start

Calls, camera, microphone and screen sharing only work on https:// or http://localhost,
so use HTTPS when you put Wigo online. Calls use a public STUN server; people on very
strict networks may need a TURN server added in `public/js/calls.js`.

Data lives in `data/users.json` (accounts, friends, groups). Keep that folder private.
