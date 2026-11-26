# Player-hosted Story Puzzle rooms

Any signed-in player (including name-only guests) can open a Story Puzzle room and choose its story from
title cards. The creator becomes the room **host**. Being host never grants administrator rights.

## What the host can and cannot do

| Host can | Host cannot |
|---|---|
| Create a room (`player_create_room`) | Read story descriptions, questions, answers, pieces, solutions |
| Pick / change the story while the room is `WAITING`/`READY` (`player_set_room_story`) | Change rules, scoring, penalties or overrides |
| See the chosen story's title and approved cover | Pause, resume, end, or force-start past unready teams |
| Start the game once every team is ready (`start_game`) | Remove or approve players |
| Cancel their own room before it starts (`set_room_status('cancel')`) | Enable/disable stories, reach any admin screen or RPC |
| Everything an ordinary player can do | Open more than 3 unfinished rooms |

Other players cannot change the story. When the host changes it, every team's picture choice is cleared,
teams become unready, the server re-snapshots the story, and a `story_selected` event updates the lobby.

## Data exposure

* `list_selectable_stories()` returns only `{id, title, language, cover_url}`. `cover_url` is the story's
  `cover_image_path` when it is a public URL or bundled `demo/` asset; otherwise the card shows a generated title card.
* Story content stays in tables readable only with `story.manage` and in `room_story_snapshots`
  (readable only with `game.control`). Migration 0027 removes the old `players_read_published` policy, which let any
  signed-in user read full published story rows (description, final narrative) through the REST API.
* The room row a member can read (`settings_snapshot`) is unchanged: title, language, image positions and image hints,
  exactly what every player already sees in a lobby.

## Administrator control

A story appears in the picker only when it is `PUBLISHED`, has at least two pictures (the existing room requirement)
and is enabled in `story_player_availability`. Published stories are immutable, so availability lives in its own
table, toggled from **Admin → Stories** (checkbox "متاحة لغرف اللاعبين") via `set_story_player_selectable`.
Migration 0027 enables every story that can host a room today; switch off any you do not want players to pick.

## Host disconnects

Rooms are server-side; the host role is the `created_by` user id, so a host who drops out keeps the role and returns
through the same `/play/:roomId` link. Nobody else is promoted automatically. Teams can keep forming; administrators
can still manage or start the room from Room Control. No migration path ever exposes story content.

## Screens

* `/play/new` – story cards, name, team count (2–4, limited by the story's pictures) → creates the room.
* `/play/:roomId` – host panel: selected story, *Change story* (same cards), *Start the game* (enabled when every team
  is ready), *Close room*. Other players see the chosen title and a notice when it changes.
* Entry points: Story Puzzle game page ("Create a room & pick a story") and the Join page.

## Tests

`supabase/tests/player_hosted_rooms.sql` (in `run_all.sh`) checks: titles-only cards; no direct reads of stories,
questions, images or answers; disabled/unknown stories rejected; host cannot use admin RPCs, read snapshots, pause,
remove players, enable stories or edit the room row; non-hosts cannot change the story or start; story change
re-snapshots and emits an event; story locked after start; host cancel limited to the lobby; 3-room limit;
administrators unaffected.
