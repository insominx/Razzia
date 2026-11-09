<p align="center">
  <img width="450" height="120" align="center" src=".github/logo.svg">
  <br>
  <div align="center">
    <img alt="Visitor Badge" src="https://api.visitorbadge.io/api/visitors?path=https://github.com/Ralex91/Razzia/edit/main/README.md&countColor=%23FF9900">
    <img src="https://img.shields.io/docker/pulls/ralex91/razzia?style=for-the-badge&color=FF9900" alt="Docker Pulls">
  </div>
</p>

## 🧩 What is this project?

Razzia is a straightforward and open-source quiz platform, allowing users to host it on their own server for smaller events.

> **Disclaimer**: Razzia is an independent, open-source software project. It is not affiliated with, endorsed by, or sponsored by any third-party quiz platform or service. Any resemblance to other quiz platforms is purely incidental.

<p align="center">
  <img width="30%" src=".github/previews/1.png" alt="Login">
  <img width="30%" src=".github/previews/2.png" alt="Manager Room">
  <img width="30%" src=".github/previews/3.png" alt="Question Screen">
</p>

## ⚙️ Prerequisites

Choose one of the following deployment methods:

### Without Docker

- Node.js : version 22.12 or higher
- PNPM : version 11 or higher (learn more [here](https://pnpm.io/))

### With Docker

- Docker and Docker Compose

## 📖 Getting Started

Choose your deployment method:

### 🐳 Using Docker (Recommended)

Using Docker Compose (recommended):
You can find the docker compose configuration in the repository:
[docker-compose.yml](/compose.yml)

```bash
docker compose up -d
```

Or using Docker directly:

```bash
docker run -d \
  -p 3000:3000 \
  -v ./config:/app/config \
  ralex91/razzia:latest
```

**Configuration Volume:**
The `-v ./config:/app/config` option mounts a local `config` folder to persist your game settings and quizzes. This allows you to:

- Edit your configuration files directly on your host machine
- Keep your settings when updating the container
- Easily backup your quizzes and game configuration

The folder will be created automatically on first run with an example quiz to get you started.

**Quizzes baked into the image:**
An image built from this repository carries the quizzes in `config/quizz` as seed data. On every start, a quiz that is missing from the volume is added, and a seeded quiz that nobody has edited is updated when the committed version changes. A quiz you created or edited in the manager is never overwritten or deleted, even when the committed version differs (the log says so). To drop a quiz, delete it in the manager. The seeder records what it wrote in `.seed-manifest.json` beside `game.json`.

The application will be available at http://localhost:3000

### 🛠️ Without Docker

1. Clone the repository:

```bash
git clone https://github.com/Ralex91/Razzia.git
cd ./Razzia
```

2. Install dependencies:

```bash
pnpm install
```

3. Build and start the application:

```bash
# Development mode
pnpm run dev

# Production mode
pnpm run build
pnpm start
```

## ⚙️ Configuration

The configuration is split into two main parts:

### 1. Game Configuration (`config/game.json`)

Main game settings:

```json
{
  "managerPassword": "PASSWORD",
  "visuals": {
    "background": {
      "kind": "config-asset",
      "path": "example-background.webp"
    }
  }
}
```

Options:

- `managerPassword`: The master password for accessing the manager interface. **Must be changed from the default `"PASSWORD"` value**, otherwise manager access is blocked.
- `visuals.background`: Optional instance-wide background. The manager's **Visuals** tab uploads PNG, JPEG, WebP, or GIF images up to 5 MB and writes this portable config-asset reference for you.
- `visuals.soundTheme`: Optional sound pack. `show` (default) is the generated score: it follows each round, climbs a semitone per question and answers the room's verdict. `classic` keeps the original quiz loops. `techno` replaces the whole pack — the answers bed plus every UI and podium cue — from `public/sounds/themes/techno/`. The manager's **Visuals** tab can switch this without changing the classic files; the pack is snapshotted when a game is created, so switching it never swaps cues under a running game.
- `visuals.showIntensity`: Optional, how big the show is: `full` (default) is everything, with light and sound hits that fill the whole frame; `calm` keeps the picture but drops the full-frame hits, the spotlight and beams, and plays the music 12 dB lower with no groove while answering; `silent` is calm with no audio. The manager's **Visuals** tab sets it, and it is fixed when a game is created. A device set to reduced motion gets calm's visuals either way.

### Third-party audio

The `techno` sound pack in `packages/web/public/sounds/themes/techno/` is
third-party audio. The classic cues in `packages/web/public/sounds/` are not
covered by these licenses.

- Answers loop (`answersMusic.mp3`): “Background Loop Melodic Techno #03” by tAUREON, [Pixabay audio 2691](https://pixabay.com/music/techno-trance-background-loop-melodic-techno-03-2691/), under the [Pixabay Content License](https://pixabay.com/service/license-summary/). Royalty-free; no attribution required; redistribution as a standalone audio file is not permitted.
- The eight one-shot cues (`answersSound`, `boump`, `show`, `results`, `three`, `second`, `snearRoll`, `first`): Mixkit sound effects 900, 2299, 3114, 3116, 253, 254, 2295, and 266, under the [Mixkit Sound Effects Free License](https://mixkit.co/license/#sfxFree). Use in games is permitted; redistribution as standalone sound files is not. Converted from the source WAVs to MP3; `answersSound.mp3` is additionally trimmed to a ~160 ms click so repeated answer pops do not overlap.

Uploaded files are stored in `config/assets/backgrounds/`. Keep that folder together with `config/game.json` and your quizzes when copying, backing up, or mounting a configuration. The repository ignores `config/` by default, so these files travel with the Docker volume or a copied config directory unless you deliberately change your Git workflow.

This is managed storage: references in `config/game.json` and
`config/quizz/*.json` determine which uploaded backgrounds remain reachable.
Replacing or clearing a reference reclaims the old file after the configuration
commit when no other config still uses it. Runtime cleanup gives uncommitted
uploads a one-hour grace and protects uploads from the current server process;
startup cleanup removes abandoned unreferenced files left by an earlier process.

### 2. Quiz Configuration (`config/quizz/*.json`)

Quizzes can be created in two ways:

- **Via the Quiz Editor** — use the built-in editor available in the manager dashboard (recommended)
  The editor's **Rehearse** button opens a tab that plays the quiz as it is on screen, saved or not, on the projector's and a phone's real screens, with no game and no login. It warns about a question that may not fit the projector.
- **Via JSON files** — manually create files in the `config/quizz/` directory

You can have multiple quiz files and select which one to use when starting a game.

Example quiz configuration (`config/quizz/example.json`):

```json
{
  "subject": "Example Quiz",
  "visuals": {
    "background": {
      "kind": "config-asset",
      "path": "quiz-background.webp"
    }
  },
  "questions": [
    {
      "question": "What is the correct answer?",
      "answers": ["No", "Yes", "No", "No"],
      "solutions": [1],
      "cooldown": 5,
      "time": 15
    },
    {
      "question": "Which of these are primary colors?",
      "answers": ["Red", "Green", "Blue", "Yellow"],
      "solutions": [0, 2, 3],
      "cooldown": 5,
      "time": 20
    },
    {
      "question": "What is the correct answer with an image?",
      "answers": ["No", "Yes", "No", "No"],
      "media": {
        "type": "image",
        "url": "https://placehold.co/600x400.png"
      },
      "solutions": [1],
      "cooldown": 5,
      "time": 20
    }
  ]
}
```

Quiz Options:

- `subject`: Title/topic of the quiz
- `visuals.background`: Optional per-quiz override uploaded from the quiz editor. When omitted, the quiz inherits the global background from `config/game.json`; when neither is configured, the bundled background is used.
- `questions`: Array of question objects containing:
  - `question`: The question text
  - `answers`: Array of possible answers (2-4 options)
  - `media`: Optional media object displayed with the question:
    - `type`: `"image"`, `"video"`, or `"audio"`
    - `url`: URL of the media
  - `solutions`: Array of correct answer indices (0-based). Use multiple indices for multi-answer questions
  - `cooldown`: Time in seconds before answers are revealed (3-15)
  - `time`: Time in seconds allowed to answer (5-120)

Background precedence is **quiz override → global default → bundled fallback**. Razzia resolves that choice when a game is created and keeps it fixed for the whole live session, including player joins and reconnects. Changing a background affects newly created games, not one already in progress. On play and editor-preview surfaces, the selected image is composited beneath a measured 75% dark scrim that met the documented contrast floor on Razzia's four X1 adversarial background fixtures (minimum measured 8.02:1).

## 🎮 How to Play

1. Access the manager interface at http://localhost:3000/manager
2. Enter the manager password (defined in `config/game.json`)
3. Share the game URL (http://localhost:3000) and room code with participants
4. Wait for players to join
5. Click the start button to begin the game

## 📊 Polls

A poll asks the room a question that has no right answer ("What should we do first?") and shows how the room voted. Polls run in a **lecture room**, so students join once, by the name they already gave, and can join late.

### Running one

1. In the manager's **Polls** tab choose **Create poll**: a question, two to six options, and whether votes are anonymous (the default) or named.
2. In the **Play** tab pick a quiz and choose **Start lecture room**. A normal game cannot run polls. Students join with the PIN as usual.
3. In the lobby, or on a results or leaderboard screen between questions, choose **Poll** at the top left and pick the poll. Every phone shows it. A tap votes, and another tap changes the vote until you close the poll.
4. Choose **Close poll** to end voting and show everyone the result, then **Done** to go back to the quiz, which carries on exactly as it was. The quiz's controls wait until you press **Done**.

While a poll is open you see live counts. Phones see counts only after it closes.

### Anonymity

- **Anonymous** (the default): no name is ever shown, sent or saved. It hides names, not timing: in a small group, watching the live counts as students vote one at a time (or kicking a student, whose vote then disappears) can still reveal who voted what.
- **Named**: you see each student's name beside their vote, and students are told so. They never see each other's names, and the names are saved in the result.

Whether a poll is named is part of the poll, not chosen at launch.

### Where things are kept

- `config/polls/<id>.json`: the polls you wrote, such as `{ "question": "What first?", "options": ["Review", "New topic"], "anonymous": true }`. A question is up to 500 characters; there are 2 to 6 options of up to 200 characters, no two alike. Edit them in the Polls tab or by hand.
- `config/poll-results/<id>.json`: one record for each poll that was run, with the question and options as they were asked, the counts, the quiz the room was for, the date, and names only for a named poll. A poll still open when its room closed is saved as **Ended early**. Open or delete these under **Polls → Results**. They are kept apart from quiz results.

Keep both folders with `config/game.json` and your quizzes when you copy, back up or mount a configuration. The Docker image does not ship any polls.

An open poll lives in the server's memory, so restarting the server loses it along with any live room: do not deploy during a class. Editing or deleting a poll does not change one that is open or a result already saved. The design is recorded in [ADR 0004](docs/adr/0004-polls-as-a-room-lane.md).

## 📝 Contributing

Contributions are welcome! Please read the [CONTRIBUTING.md](.github/CONTRIBUTING.md) guide before submitting a pull request.

For bug reports or feature requests, please [create an issue](https://github.com/Ralex91/Razzia/issues).

## ⭐ Star History

[![Star History Chart](https://api.star-history.com/svg?repos=Ralex91/Razzia&type=date&legend=bottom-right)](https://www.star-history.com/#Ralex91/Razzia&type=date&legend=bottom-right)
