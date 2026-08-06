import sqlite3
import json

DB_PATH = r"C:\Users\usuario\.local\share\mimocode\mimocode.db"

conn = sqlite3.connect(DB_PATH)
conn.row_factory = sqlite3.Row
c = conn.cursor()

# Check the "Auto Distill" session
sid = "ses_0b8c60415ffeOmT0ScrJhdlFPS"

print(f"SESSION: {sid}")

c.execute("""
    SELECT m.id, json_extract(m.data, '$.role') as role, m.agent_id, m.time_created
    FROM message m
    WHERE m.session_id = ?
    ORDER BY m.time_created
""", (sid,))
messages = c.fetchall()

for msg in messages:
    role = msg['role']
    agent_id = msg['agent_id']
    msg_id = msg['id']
    
    if role == 'assistant':
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
                print(f"\n{prefix} (msg={msg_id})")
                print(text)
    elif role == 'user':
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
                print(f"\n[USER] (msg={msg_id})")
                print(text[:1000])

conn.close()
