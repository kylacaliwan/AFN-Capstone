# AFN Service Management — Docker Quick-Start

## Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and **running**

## One-command start
```bash
# From the project root  (sanagumana1/sanagumana/)
docker compose up --build
```

| Service | URL |
|---------|-----|
| React / Vite frontend | http://localhost:5173 |
| Django API | http://localhost:8000/api/ |
| Django Admin | http://localhost:8000/admin/ |

## First-time admin user
After the containers are up, open a second terminal:
```bash
docker exec -it afn-backend python manage.py createsuperuser
```

## Stop everything
```bash
docker compose down
```

## Rebuild after dependency changes
```bash
docker compose up --build
```

## View logs
```bash
docker compose logs -f           # all services
docker compose logs -f backend   # Django only
docker compose logs -f frontend  # Vite only
```

## SQLite data
The database file is stored in a named Docker volume (`afn_sqlite_data`) and persists across `down`/`up` cycles.
To reset it completely:
```bash
docker compose down -v   # WARNING: deletes all data
```
