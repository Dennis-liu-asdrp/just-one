# Just One – Web Table

Lightweight Node.js implementation of the party game *Just One* for a single shared table. Hint givers and the guesser connect to the same server from different devices and play through rounds together.

## Getting started

1. Install Node.js 18 or newer.
2. Install dependencies (none) and start the server:

   ```sh
   npm start
   ```

3. The app is served at `http://localhost:3000/`. Open it in your browser.

## Inviting friends

- Share the link displayed under **Invite others** in the app.
- If friends are on the same Wi‑Fi/LAN, replace `localhost` with your machine's IP address, for example `http://192.168.1.42:3000/`.
- Ensure your firewall allows inbound connections on port 3000.

Everyone who opens that URL can join the table by entering a name and selecting whether they are the guesser or a hint giver.

## Gameplay flow

1. A hint giver starts a round (word is revealed only to hint givers).
2. Hint givers submit single-word clues.
3. Hint givers mark colliding clues as invalid during review.
4. Valid clues are revealed to the guesser, who submits a guess.
5. The result updates the shared score and the next round can begin.
