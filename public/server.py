#!/usr/bin/env python3
import http.server
import socketserver
import os
from pathlib import Path

PORT = 5173
DIST_DIR = Path(__file__).parent

class SPAHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        # If requesting a route that doesn't exist as a file, serve index.html
        file_path = DIST_DIR / self.path.lstrip('/')

        # If path doesn't exist and it's not a file in assets, serve index.html
        if not file_path.exists() and not self.path.startswith('/assets/'):
            self.path = '/index.html'

        return super().do_GET()

    def end_headers(self):
        # Prevent caching of index.html for SPA routing
        if self.path == '/index.html' or self.path == '/':
            self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
            self.send_header('Pragma', 'no-cache')
            self.send_header('Expires', '0')
        super().end_headers()

if __name__ == '__main__':
    os.chdir(DIST_DIR)

    with socketserver.TCPServer(("", PORT), SPAHandler) as httpd:
        print(f"🌐 Serving Fit4Sure at http://localhost:{PORT}/")
        print(f"📁 Serving from: {DIST_DIR}")
        print(f"📍 Go to: http://localhost:{PORT}/financials")
        print("\n✅ Press Ctrl+C to stop\n")
        httpd.serve_forever()
