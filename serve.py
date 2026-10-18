"""Local dev server for the project: like `python -m http.server`, but tells the browser never to cache,
so a reload always picks up edited files (the plain server lets browsers keep stale JS/CSS).

    python serve.py            # http://localhost:5177
    python serve.py 8080       # another port
"""
import http.server
import os
import sys


class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        self.send_header('Expires', '0')
        super().end_headers()


if __name__ == '__main__':
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5177
    http.server.ThreadingHTTPServer(('127.0.0.1', port), NoCache).serve_forever()
