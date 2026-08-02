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

- Node.js : version 22 or higher
- PNPM : version 10.16 or higher (learn more [here](https://pnpm.io/))

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

## 📝 Contributing

Contributions are welcome! Please read the [CONTRIBUTING.md](.github/CONTRIBUTING.md) guide before submitting a pull request.

For bug reports or feature requests, please [create an issue](https://github.com/Ralex91/Razzia/issues).

## ⭐ Star History

[![Star History Chart](https://api.star-history.com/svg?repos=Ralex91/Razzia&type=date&legend=bottom-right)](https://www.star-history.com/#Ralex91/Razzia&type=date&legend=bottom-right)
