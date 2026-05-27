#!/usr/bin/env python
from flask import Flask, jsonify, send_from_directory
import os

app = Flask(__name__, static_folder='.')

@app.route('/web/api/list_models.py')
def list_models():
    models_dir = os.path.join(os.path.dirname(__file__), 'models')
    obj_files = []
    
    if os.path.exists(models_dir):
        for filename in os.listdir(models_dir):
            if filename.lower().endswith('.obj'):
                obj_files.append(filename)
    
    return jsonify({'models': obj_files})

@app.route('/web/<path:path>')
def serve_web(path):
    return send_from_directory('web', path)

@app.route('/models/<path:path>')
def serve_models(path):
    return send_from_directory('models', path)

@app.route('/')
def index():
    return send_from_directory('web', 'index.html')

if __name__ == '__main__':
    print("服务器已启动...")
    print("打开浏览器访问: http://localhost:8001")
    app.run(port=8001, debug=True)