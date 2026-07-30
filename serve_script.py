#!/usr/bin/env python3
"""Simple server that serves install-ready.sh as text/plain."""
import http.server
import socketserver
import os

PORT = 8899
FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "install-ready.sh")

class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path in ("/", "/install-ready.sh"):
            try:
                with open(FILE, "r") as f:
                    content = f.read()
                self.send_response(200)
                self.send_header("Content-Type", "text/plain; charset=utf-8")
                self.send_header("Content-Length", str(len(content.encode())))
                self.end_headers()
                self.wfile.write(content.encode())
            except FileNotFoundError:
                self.send_error(404, "File not found")
        else:
            self.send_error(404, "Not found")

    def log_message(self, format, *args):
        print(f"[{self.client_address[0]}] {format % args}")

with socketserver.TCPServer(("0.0.0.0", PORT), Handler) as httpd:
    print(f"Serving install-ready.sh on port {PORT}")
    httpd.serve_forever()
