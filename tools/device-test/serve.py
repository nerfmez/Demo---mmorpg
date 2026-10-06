#!/usr/bin/env python3
"""Serve this test bundle read-only. --lan explicitly exposes it to the trusted LAN."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import socket

ROOT = Path(__file__).resolve().parent
class Handler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, '.mjs': 'text/javascript'}
    def list_directory(self, path):
        self.send_error(403, 'Directory listing disabled')
        return None
    def send_head(self):
        candidate = Path(self.translate_path(self.path)).resolve()
        if candidate != ROOT and ROOT not in candidate.parents:
            self.send_error(403, 'Outside bundle'); return None
        return super().send_head()
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        super().end_headers()

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--lan', action='store_true')
    parser.add_argument('--port', type=int, default=8765)
    args = parser.parse_args()
    if not 1024 <= args.port <= 65535: parser.error('Choose a port from 1024 to 65535')
    host = '0.0.0.0' if args.lan else '127.0.0.1'
    print(f'PC: http://127.0.0.1:{args.port}/', flush=True)
    if args.lan:
        print('LAN enabled: use only on trusted Wi-Fi. No firewall settings are changed.', flush=True)
        try:
            for ip in sorted(set(socket.gethostbyname_ex(socket.gethostname())[2])):
                if not ip.startswith('127.'): print(f'iPad: http://{ip}:{args.port}/', flush=True)
        except OSError: print('Find the PC LAN IPv4 address in network settings.', flush=True)
    try:
        server = ThreadingHTTPServer((host, args.port), partial(Handler, directory=str(ROOT)))
        print('Read-only test server. Ctrl+C stops it. No results are uploaded.', flush=True)
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nStopped.')
    except OSError as error:
        raise SystemExit(f'Could not start server: {error}')
