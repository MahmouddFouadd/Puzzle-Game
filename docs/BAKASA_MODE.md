# Bakasa – Hidden Spy mode (بكاسة – مين البِكس؟)

A party game mode. Every player sees the same secret word, except the spy (or spies), who only sees the category. Players give clues in turn, then vote on who the spy is. If the spy is caught, they get one last chance to guess the word.

## Routes
| Route | Purpose |
|---|---|
| `/bakasa` | Introduction, animated how-to-play, mode menu |
| `/bakasa/create` | Create an online room (settings with a live summary) |
| `/bakasa/join`, `/bakasa/join/:code` | Join by code or invite link, with a room preview before joining |
| `/bakasa/room/:roomId` | Lobby → role reveal → clue turns → voting → spy guess → results |
| `/bakasa/local` | Pass-the-phone mode on one device (no account needed) |
| `/bakasa/history` | The player's match history |
| `/admin/bakasa` | Admin: categories and secret words |

## Server design (migrations 0016–0018)
- Tables: `bakasa_categories`, `bakasa_words`, `bakasa_rooms`, `bakasa_players`, `bakasa_rounds`, `bakasa_roles`, `bakasa_votes`, `bakasa_messages`.
- `bakasa_rounds`, `bakasa_roles` and `bakasa_votes` have RLS enabled and **no policies**. Roles, the word and individual votes are only reachable through `SECURITY DEFINER` functions:
  - `bakasa_my_role(room)` returns only the caller's own role. A spy gets no word.
  - `bakasa_state(room)` returns public state only. The word, the spies and the vote counts appear only after the round has ended.
  - `bakasa_guess_options` / `bakasa_spy_guess` are allowed only for the accused spy, and only in the `GUESS` phase.
- Phases: `LOBBY → REVEAL → DISCUSSION → VOTING → (GUESS) → RESULT … FINISHED`.
  - Deadlines are stored on the room. Any member's client calls `bakasa_advance`, and the server checks the deadline again before moving on.
  - The host can force the next step, skip a turn, or close voting.
- Scoring (server side):
  - Spy not caught: the spy gets +3.
  - Spy caught but guesses the word: the spy gets +2.
  - Spy caught and guesses wrong: each regular player gets +2.
  - Anyone who voted for a spy gets +1.
- Ties follow `tie_rule`:
  - `REVOTE`: one revote. A second tie means the spy wins.
  - `SPY_WINS`: the spy wins straight away.
- Leaving and reconnecting:
  - A player who leaves is skipped in turns and voting.
  - The round is cancelled without scores if fewer than 3 players remain or every spy has left.
  - When the host leaves, the next seat becomes host.
  - Rejoining with the code restores the seat, the score and the private role.
- `bakasa_rematch` resets the scores and starts a new match in the same room. Earlier matches stay in history.

## Verification
- A full simulated match ran on the production schema inside a rolled-back transaction. It covered privacy checks, voting, the spy guess, scores, a tie leading to a revote and a spy win, rematch and host transfer.
- A 4-phone Playwright run played a complete online round in the browser: join by link, ready, reveal, clues, vote, guess and results.
- A pass-the-phone run on one device also passed.
