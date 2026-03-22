#!/bin/bash
# Wrapper for opencode serve with resource limits
# Usage: ./opencode-limited.sh serve --port 4096

ulimit -u 50   # Max 50 processes (including children)
ulimit -t 600  # Max 10 min CPU time per command
exec opencode "$@"
