#!/usr/bin/env python
import os
import json

def list_models():
    models_dir = os.path.join(os.path.dirname(__file__), '..', 'models')
    obj_files = []
    
    if os.path.exists(models_dir):
        for filename in os.listdir(models_dir):
            if filename.lower().endswith('.obj'):
                obj_files.append(filename)
    
    return json.dumps({'models': obj_files})

if __name__ == '__main__':
    print("Content-Type: application/json")
    print()
    print(list_models())