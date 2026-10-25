#!/usr/bin/env python3
import json
import os
from pathlib import Path

def main():
    tires_dir = Path("data/img/tires")
    json_dir = Path("data/json/ru/tires")
    
    if not tires_dir.exists() or not json_dir.exists():
        print("Directories not found")
        return

    all_tires = sorted([d.name for d in tires_dir.iterdir() if d.is_dir()])
    
    for slug in all_tires:
        if slug == "check-tires-json.py": continue
        json_path = json_dir / f"{slug}.json"
        
        # Check files in raw directory
        raw_dir = tires_dir / slug / "raw"
        if not raw_dir.exists():
            print(f"[MISSING RAW DIR] {slug}")
            continue
            
        raw_files = list(raw_dir.glob("*.webp"))
        if not raw_files:
            continue
            
        if not json_path.exists():
            print(f"[MISSING JSON] {slug}")
            continue
            
        try:
            with open(json_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
        except Exception as e:
            print(f"[ERROR READING] {slug}: {e}")
            continue
            
        images_in_json = data.get("images", {})
        
        missing_in_json = []
        for f in raw_files:
            # Extract view from filename like <slug>-<view>.webp
            view = f.stem.replace(f"{slug}-", "")
            if view not in images_in_json:
                missing_in_json.append(view)
                
        if missing_in_json:
            print(f"[INCOMPLETE JSON] {slug}: missing views {missing_in_json}")
        else:
            # Check if all views in JSON actually exist as files
            missing_files = []
            for view, img_data in images_in_json.items():
                src = img_data.get("src", "")
                if not src or not os.path.exists(src):
                    missing_files.append(view)
            if missing_files:
                print(f"[BROKEN LINKS] {slug}: files missing for views {missing_files}")
            else:
                print(f"[OK] {slug}")

if __name__ == "__main__":
    main()
