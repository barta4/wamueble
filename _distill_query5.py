import sqlite3
import json
from datetime import datetime

DB_PATH = r'C:\Users\usuario\.local\share\mimocode\mimocode.db'
conn = sqlite3.connect(DB_PATH)
conn.row_factory = sqlite3.Row
cursor = conn.cursor()

# Get all parts from the facilmob session with full conversation
sid = 'ses_0b8cb60e1ffep0ZCSRSnaudoWU'
print(f"SESSION: {sid} (facilmob)")
print("="*60)

# Get messages with their parts
cursor.execute("""
    SELECT m.id, m.data, m.time_created
    FROM message m
    WHERE m.session_id = ?
    ORDER BY m.time_created
""", (sid,))
messages = cursor.fetchall()

for msg in messages:
    msg_data = json.loads(msg[1])
    role = msg_data.get('role', 'unknown')
    time_str = datetime.fromtimestamp(msg[2]/1000).strftime('%H:%M:%S')
    
    print(f"\n[{time_str}] {role.upper()}")
    
    # Get parts for this message
    cursor.execute("""
        SELECT data FROM part 
        WHERE message_id = ? 
        ORDER BY time_created
    """, (msg[0],))
    parts = cursor.fetchall()
    
    for part in parts:
        part_data = json.loads(part[0])
        ptype = part_data.get('type', 'unknown')
        
        if ptype == 'text':
            text = part_data.get('text', '')
            if text:
                print(f"  Text: {text[:500]}")
        elif ptype == 'reasoning':
            text = part_data.get('text', '')
            if text:
                print(f"  Reasoning: {text[:200]}...")
        elif ptype == 'tool':
            tool = part_data.get('tool', 'unknown')
            state = part_data.get('state', {})
            inp = state.get('input', {})
            out = state.get('output', '')
            print(f"  Tool: {tool}")
            if inp:
                print(f"    Input: {json.dumps(inp, ensure_ascii=False)[:300]}")
            if out:
                out_str = str(out)
                print(f"    Output: {out_str[:300]}")

# Now check the wamueble sessions
print("\n\n" + "="*60)
print("WAMUEBLE SESSIONS")
print("="*60)

wamueble_sessions = [
    'ses_0b8c6042affekDn0jgKREAfXJS',  # Auto Dream
    'ses_0b8c604a4ffezYBpuWcG8BGL5O',  # Análisis del sistema
]

for sid in wamueble_sessions:
    print(f"\n\nSESSION: {sid}")
    print("-"*40)
    
    cursor.execute("SELECT title FROM session WHERE id = ?", (sid,))
    title = cursor.fetchone()[0]
    print(f"Title: {title}")
    
    cursor.execute("""
        SELECT m.id, m.data, m.time_created
        FROM message m
        WHERE m.session_id = ?
        ORDER BY m.time_created
    """, (sid,))
    messages = cursor.fetchall()
    
    for msg in messages:
        msg_data = json.loads(msg[1])
        role = msg_data.get('role', 'unknown')
        time_str = datetime.fromtimestamp(msg[2]/1000).strftime('%H:%M:%S')
        
        print(f"\n[{time_str}] {role.upper()}")
        
        cursor.execute("""
            SELECT data FROM part 
            WHERE message_id = ? 
            ORDER BY time_created
        """, (msg[0],))
        parts = cursor.fetchall()
        
        for part in parts:
            part_data = json.loads(part[0])
            ptype = part_data.get('type', 'unknown')
            
            if ptype == 'text':
                text = part_data.get('text', '')
                if text:
                    print(f"  Text: {text[:500]}")
            elif ptype == 'reasoning':
                text = part_data.get('text', '')
                if text:
                    print(f"  Reasoning: {text[:200]}...")
            elif ptype == 'tool':
                tool = part_data.get('tool', 'unknown')
                state = part_data.get('state', {})
                inp = state.get('input', {})
                print(f"  Tool: {tool}")
                if inp:
                    print(f"    Input: {json.dumps(inp, ensure_ascii=False)[:300]}")

conn.close()
