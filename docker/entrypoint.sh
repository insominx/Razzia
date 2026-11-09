#!/bin/sh
# Runs as root only long enough to hand the (possibly bind-mounted) config dir to the
# unprivileged user the socket server runs as, then starts supervisord.
mkdir -p /app/config
chown -R node:node /app/config 2>/dev/null || true
exec supervisord -c /etc/supervisord.conf
