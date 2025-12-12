# Outline Thin Server

Minimal Ruby/Sinatra server for mobile capture and calendar serving.

## Features

- **Mobile Capture**: Simple form at `/outline/capture` to add items to inbox
- **API Capture**: `POST /outline/api/inbox` for shortcuts/automation
- **Calendar Feed**: `GET /calendar/{token}/feed.ics` for calendar subscriptions
- **Read-Only Viewer**: Serve document data for static SPA viewer

## Setup

```bash
# Install dependencies
bundle install

# Copy and edit config
cp config.json.example config.json
# Edit config.json with your data_dir and calendar tokens

# Run development server
bundle exec puma -p 9292

# Or with auto-reload
bundle exec rerun -- puma -p 9292
```

## Configuration

Create `config.json`:

```json
{
  "data_dir": "/path/to/synced/.outline",
  "calendar_tokens": ["your-secret-uuid-here"]
}
```

Or use environment variables:

```bash
OUTLINE_DATA_DIR=/path/to/.outline
OUTLINE_CALENDAR_TOKENS=token1,token2
```

## Endpoints

| Endpoint | Auth | Description |
|----------|------|-------------|
| `GET /health` | None | Health check |
| `GET /calendar/{token}/feed.ics` | Token in URL | Calendar feed |
| `GET /outline/capture` | Basic Auth | Mobile capture form |
| `POST /outline/capture` | Basic Auth | Submit captured item |
| `POST /outline/api/inbox` | Basic Auth | API capture endpoint |
| `GET /outline/api/inbox` | Basic Auth | List inbox items |
| `GET /outline/data/:id/state.json` | Basic Auth | Document data |
| `GET /outline/data/documents.json` | Basic Auth | List documents |

## Nginx Setup

See `nginx.conf.example` for production configuration.

Create htpasswd file:

```bash
sudo htpasswd -c /etc/nginx/.htpasswd-outline username
```

## Production Deployment

```bash
# Install with bundler
bundle install --deployment

# Run with puma
bundle exec puma -e production -p 9292 -d

# Or use systemd (see outline-server.service)
```
