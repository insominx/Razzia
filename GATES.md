# Gates: Seed local quizzes on Docker deploy

Scope: A Docker/Railway deploy bakes local `config/quizz/*.json` into the image and overwrites volume quizzes on start, without touching manager password or assets.

- [x] G1: Quiz JSON under config/quizz is not gitignored (so railway up uploads it)
  CHECK: powershell -NoProfile -Command "git check-ignore -q config/quizz/netcode-for-gameobjects.json; 'EXIT=' + $LASTEXITCODE"
  EXPECT: EXIT=1
  EVIDENCE: EXIT=1

- [x] G2: Image seeds quizzes and the socket process points QUIZ_SEED_PATH at them
  CHECK: powershell -NoProfile -Command "Select-String -Path Dockerfile,docker/supervisord.conf -Pattern 'seed/quizz|QUIZ_SEED_PATH' | ForEach-Object { $_.Filename + ':' + $_.Line.Trim() }"
  EXPECT: QUIZ_SEED_PATH
  EVIDENCE: Dockerfile:COPY config/quizz /app/seed/quizz | supervisord.conf:environment=NODE_ENV="production",CONFIG_PATH="/app/config",QUIZ_SEED_PATH="/app/seed/quizz"

- [x] G3: Seed sync replaces volume quizzes with seed JSON and leaves game.json alone
  CHECK: pnpm --filter @razzia/socket exec vitest run src/services/config.test.ts --reporter=verbose
  EXPECT: Tests
  EVIDENCE: } | ]

- [x] G4: Live Netcode quiz matches local after deploy (6 questions, first prompt about a C# field)
  CHECK: powershell -NoProfile -Command "$env:VERIFY_ONLY='1'; node config/quizz/_push-live.mjs"
  EXPECT: LIVE_COUNT 6
  EVIDENCE: LIVE_COUNT 6 | LIVE_SOLUTIONS 1,2,0,1,0,1
