# Deploy local source with Docker (replace remote images)

This guide explains how to stop a stack that was started from the **published** `docker-compose.yaml` (pulled with `curl` from GitHub) and run **this repository’s code** instead, built as local Docker images.

## What changes

| Remote setup | Local source setup |
|--------------|-------------------|
| `image: ghcr.io/dograh-hq/dograh-api` / `dograh-ui` (or similar) | `build:` from `api/Dockerfile` and `ui/Dockerfile` in this repo |
| No clone required | Full git clone + **pipecat submodule** (required for the API image) |

The API container still talks to Postgres on **`postgres:5432`** inside the Docker network. Changing the host mapping to **`5433:5432`** only affects access from your Mac (e.g. `psql localhost:5433`); **do not** change `DATABASE_URL` in Compose for that.

## Prerequisites

- Docker Desktop (or Docker Engine + Compose v2)
- Git
- This repository checked out **at the root** (the directory that contains `api/`, `ui/`, `docker-compose.yaml`)

Initialize the Pipecat submodule (the API image copies it during build):

```bash
cd /path/to/dograh-v1.21.0
git submodule update --init --recursive
```

If `pipecat/` is empty, the API build will fail.

## 1. Stop the old stack

In the directory where you ran `docker compose up` for the **curl**-downloaded compose file:

```bash
docker compose down
```

(Optional) List running stacks to confirm nothing is left:

```bash
docker ps
```

## 2. Keep the same Compose project name (important for data)

Compose names volumes and networks using the **project name**, usually derived from the **directory name** of the compose file.

- If your old stack used project name **`hugo`** (as in Docker Desktop), your Postgres/Redis/MinIO data live under volumes like `hugo_postgres_data`.
- If you `cd` into `dograh-v1.21.0` and run `docker compose up` without setting the project name, Compose may use **`dograh-v1210`** (or similar) and create **new empty volumes**.

**Recommended:** reuse the same project name explicitly:

```bash
export COMPOSE_PROJECT_NAME=hugo
```

Replace `hugo` with the name shown for your stack in Docker Desktop if it differs.

Alternatively, pass `-p hugo` on every command:

```bash
docker compose -p hugo ...
```

## 3. Add a local build override (recommended)

Do not rely on editing the downloaded compose file in another folder. Work **inside this repo** and add `docker-compose.override.yaml` next to `docker-compose.yaml`. That file is **gitignored** in this repository so your local build settings are not committed.

Copy the tracked example and edit if needed:

```bash
cp docker-compose.override.example.yaml docker-compose.override.yaml
```

The example contains `build` / `image` blocks for `api` and `ui`. Compose **merges** `docker-compose.yaml` and `docker-compose.override.yaml` automatically when both exist. The `build` + `image` pair makes Compose build from source and tag the result so `api` / `ui` services use your local images.

For Postgres on host port **5433** when **5432** is busy: see the commented block in `docker-compose.override.example.yaml` — you typically need to avoid publishing `5432` on the host from the base file (e.g. comment it in `docker-compose.yaml`) and publish only `5433:5432` in your override. **Do not** change `DATABASE_URL`; it must stay `@postgres:5432` inside the stack.

If you prefer not to use an override, you can paste the same `build` / `image` blocks under `api` and `ui` directly in `docker-compose.yaml` (and remove or comment the `image: ${REGISTRY}...` lines).

## 4. Build and start

From the repository root:

```bash
cd /path/to/dograh-v1.21.0
export COMPOSE_PROJECT_NAME=hugo   # adjust if needed

docker compose build api ui
docker compose up -d
```

First API/UI builds can take several minutes.

Useful commands:

```bash
docker compose logs -f api
docker compose logs -f ui
```

## 5. Verify

- UI: [http://localhost:3010](http://localhost:3010)
- API health: [http://localhost:8000/api/v1/health](http://localhost:8000/api/v1/health)

## 6. After you change code

Rebuild only what changed:

```bash
export COMPOSE_PROJECT_NAME=hugo
docker compose build api    # or ui, or both
docker compose up -d
```

For a clean rebuild:

```bash
docker compose build --no-cache api ui
docker compose up -d
```

## Troubleshooting

### `pipecat` missing during `docker compose build api`

Run `git submodule update --init --recursive` and ensure `pipecat/` contains files.

### Empty database after migration

The project name almost certainly changed. Stop the stack, set `COMPOSE_PROJECT_NAME` to the **old** stack name, then `docker compose up -d` again from this repo (with the same volume names).

### Port conflicts

- **3010 / 8000 / 6379 / 9000 / 2000**: stop the other stack or change the **left** side of `ports:` mappings in an override file.
- **5432 vs 5433**: publish only `5433:5432` on the host if `5432` is taken (see comments in `docker-compose.override.example.yaml`); keep `DATABASE_URL` as `@postgres:5432`.

### `cloudflared` / Quick Tunnel

The stock `docker-compose.yaml` starts `cloudflared` for a tunnel to the API. That is optional for pure local use; you can add `profiles` or a separate override to disable it if you maintain a custom compose—otherwise leave as upstream documents.

---

**Summary:** stop the remote-image stack, work from the git repo with `pipecat` initialized, use **`COMPOSE_PROJECT_NAME`** (or `-p`) to keep volumes, add **`build`** for `api` and `ui` via `docker-compose.override.yaml` (start from `docker-compose.override.example.yaml`), then `docker compose build` and `docker compose up -d`.

**Local LLM / voice with Docker:** see the Mintlify doc *Local models with Docker* (`docs/configurations/local-models-docker.mdx`) for Ollama, LM Studio, `host.docker.internal`, and TTS voice IDs.
