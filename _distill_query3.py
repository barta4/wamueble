import sqlite3
import json
from datetime import datetime

DB_PATH = r'C:\Users\usuario\.local\share\mimocode\mimocode.db'
conn = sqlite3.connect(DB_PATH)
conn.row_factory = sqlite3.Row
cursor = conn.cursor()

# Get messages from the non-distill sessions
sessions_to_check = [
    'ses_0b8c6042affekDn0jgKREAfXJS',  # Auto Dream
    'ses_0b8c604a4ffezYBpuWcG8BGL5O',  # Análisis del sistema
    'ses_0b8cb60e1ffep0ZCSRSnaudoWU',  # hola (facilmob)
]

for sid in sessions_to_check:
    print(f"\n{'='*60}")
    print(f"SESSION: {sid}")
    print(f"{'='*60}")
    
    # Get session info
    cursor.execute("SELECT title, directory, time_created FROM session WHERE id = ?", (sid,))
    session = cursor.fetchone()
    if session:
        print(f"Title: {session[0]}")
        print(f"Directory: {session[1]}")
        created = datetime.fromtimestamp(session[2]/1000).strftime('%Y-%m-%d %H:%M')
        print(f"Created: {created}")
    
    # Get messages with content
    cursor.execute("""
        SELECT id, data, time_created 
        FROM message 
        WHERE session_id = ? 
        ORDER BY time_created
    """, (sid,))
    messages = cursor.fetchall()
    
    for msg in messages:
        data = json.loads(msg[1])
        role = data.get('role', 'unknown')
        content = data.get('content', '')
        if isinstance(content, list):
            # Extract text from content blocks
            text_parts = []
            for block in content:
                if isinstance(block, dict):
                    if block.get('type') == 'text':
                        text_parts.append(block.get('text', ''))
                    elif block.get('type') == 'tool_use':
                        text_parts.append(f"[Tool: {block.get('name', 'unknown')}]")
                elif isinstance(block, str):
                    text_parts.append(block)
            content = ' '.join(text_parts)
        
        time_str = datetime.fromtimestamp(msg[2]/1000).strftime('%H:%M:%S')
        print(f"\n[{time_str}] {role}:")
        print(f"  {content[:500] if content else 'N/A'}")

conn.close()
