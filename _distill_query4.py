import sqlite3
import json
from datetime import datetime

DB_PATH = r'C:\Users\usuario\.local\share\mimocode\mimocode.db'
conn = sqlite3.connect(DB_PATH)
conn.row_factory = sqlite3.Row
cursor = conn.cursor()

# Get raw message data from the facilmob session
sid = 'ses_0b8cb60e1ffep0ZCSRSnaudoWU'
print(f"SESSION: {sid}")
print("="*60)

cursor.execute("""
    SELECT id, data, time_created 
    FROM message 
    WHERE session_id = ? 
    ORDER BY time_created
    LIMIT 5
""", (sid,))
messages = cursor.fetchall()

for msg in messages:
    data = json.loads(msg[1])
    print(f"\nMessage ID: {msg[0]}")
    print(f"Data keys: {list(data.keys())}")
    print(f"Role: {data.get('role', 'N/A')}")
    
    # Check different content formats
    content = data.get('content', data.get('message', data.get('text', 'N/A')))
    if content and content != 'N/A':
        if isinstance(content, str):
            print(f"Content (str): {content[:300]}")
        elif isinstance(content, list):
            print(f"Content (list of {len(content)} items):")
            for i, item in enumerate(content[:3]):
                print(f"  [{i}]: {str(item)[:200]}")
        elif isinstance(content, dict):
            print(f"Content (dict): {json.dumps(content, indent=2)[:500]}")
    else:
        print(f"Full data: {json.dumps(data, indent=2)[:500]}")

# Also check parts table for this session
print("\n\n=== PARTS TABLE ===")
cursor.execute("""
    SELECT id, data, time_created 
    FROM part 
    WHERE session_id = ? 
    ORDER BY time_created
    LIMIT 10
""", (sid,))
parts = cursor.fetchall()

for part in parts:
    data = json.loads(part[1])
    print(f"\nPart ID: {part[0]}")
    print(f"Data keys: {list(data.keys())}")
    print(f"Type: {data.get('type', 'N/A')}")
    
    if data.get('type') == 'text':
        print(f"Text: {data.get('text', 'N/A')[:300]}")
    elif data.get('type') == 'tool':
        print(f"Tool: {data.get('tool', 'N/A')}")
        state = data.get('state', {})
        if state:
            print(f"Input preview: {str(state.get('input', ''))[:200]}")

conn.close()
