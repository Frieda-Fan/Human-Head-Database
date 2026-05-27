#!/usr/bin/env python
import http.server
import socketserver
import os
import json
import urllib.parse

PORT = 8000

class MyHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def do_GET(self):
        # 处理模型列表请求
        if self.path == '/web/api/list_models.py':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            
            models_dir = os.path.join(os.path.dirname(__file__), 'models')
            obj_files = []
            
            if os.path.exists(models_dir):
                for filename in os.listdir(models_dir):
                    if filename.lower().endswith('.obj'):
                        obj_files.append(filename)
            
            response = {'models': obj_files}
            self.wfile.write(json.dumps(response).encode('utf-8'))
            return
        
        # 处理其他请求
        super().do_GET()

class ThreadingTCPServer(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True

if __name__ == "__main__":
    os.chdir(os.path.dirname(__file__))
    with ThreadingTCPServer(("", PORT), MyHandler) as httpd:
        print(f"Serving at port {PORT}")
        print(f"Open http://localhost:{PORT}/web/index.html")
        httpd.serve_forever()
