import sqlite3
import json

DB_PATH = r"C:\Users\usuario\.local\share\mimocode\mimocode.db"

conn = sqlite3.connect(DB_PATH)
conn.row_factory = sqlite3.Row
c = conn.cursor()

# Sessions for wamueble project
session_ids = [
    "ses_0b8c60415ffeOmT0ScrJhdlFPS",
    "ses_0b8c6042affekDn0jgKREAfXJS",
    "ses_0b8c604a4ffezYBpuWcG8BGL5O"
]

for sid in session_ids:
    print(f"\n{'='*80}")
    print(f"SESSION: {sid}")
    print(f"{'='*80}")
    
    # Get session info
    c.execute("SELECT title, time_created FROM session WHERE id = ?", (sid,))
    s = c.fetchone()
    if s:
        print(f"Title: {s['title']}")
    
    # Get all messages in this session
    c.execute("""
        SELECT m.id, json_extract(m.data, '$.role') as role, m.agent_id
        FROM message m
        WHERE m.session_id = ?
        ORDER BY m.time_created
    """, (sid,))
    messages = c.fetchall()
    
    for msg in messages:
        role = msg['role']
        agent_id = msg['agent_id']
        msg_id = msg['id']
        
        if role == 'user':
            # Get user message content
            c.execute("SELECT data FROM part WHERE message_id = ?", (msg_id,))
            parts = c.fetchall()
            for p in parts:
                d = json.loads(p['data'])
                if d.get('type') == 'text':
                    text = d.get('text', '')
                    print(f"\n  [USER] {text[:600]}")
        elif role == 'assistant':
            # Get assistant text parts (not tool calls)
            c.execute("""
                SELECT data FROM part 
                WHERE message_id = ? AND json_extract(data, '$.type') = 'text'
                ORDER BY time_created
            """, (msg_id,))
            parts = c.fetchall()
            for p in parts:
                d = json.loads(p['data'])
                text = d.get('text', '')
                if text.strip():
                    prefix = f"[ASSISTANT agent={agent_id}]" if agent_id else "[ASSISTANT]"
                    print(f"\n  {prefix} {text[:800]}")
            
            # Also get checkpoint parts
            c.execute("""
                SELECT data FROM part 
                WHERE message_id = ? AND json_extract(data, '$.type') = 'checkpoint'
                ORDER BY time_created
            """, (msg_id,))
            cp_parts = c.fetchall()
            for p in cp_parts:
                d = json.loads(p['data'])
                text = d.get('text', '') or json.dumps(d.get('checkpoint', {}), indent=2)[:1000]
                print(f"\n  [CHECKPOINT] {text[:600]}")

conn.close()
