import sqlite3
import json

DB_PATH = r"C:\Users\usuario\.local\share\mimocode\mimocode.db"

conn = sqlite3.connect(DB_PATH)
conn.row_factory = sqlite3.Row
c = conn.cursor()

# Focus on the "Análisis del sistema" session which has the most content
sid = "ses_0b8c604a4ffezYBpuWcG8BGL5O"

print(f"SESSION: {sid}")

# Get all assistant text parts in full
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
        # Get all text parts
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
                print(f"\n{prefix} (msg={msg_id}, time={msg['time_created']})")
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
                print(text[:500])

# Also get tool calls to understand what files were read/modified
print("\n\n=== TOOL CALLS ===")
c.execute("""
    SELECT m.id, m.agent_id, p.data, m.time_created
    FROM message m
    JOIN part p ON p.message_id = m.id
    WHERE m.session_id = ?
      AND json_extract(m.data, '$.role') = 'assistant'
      AND json_extract(p.data, '$.type') = 'tool'
    ORDER BY m.time_created, p.time_created
""", (sid,))
tools = c.fetchall()
for t in tools:
    d = json.loads(t['data'])
    tool_name = d.get('tool', 'unknown')
    state = d.get('state', {})
    inp = state.get('input', {})
    # Show tool name and key input params
    if tool_name in ['read', 'glob', 'grep', 'edit', 'write', 'bash']:
        summary = f"Tool: {tool_name}"
        if 'file_path' in inp:
            summary += f" | file={inp['file_path']}"
        if 'command' in inp:
            cmd = inp['command']
            summary += f" | cmd={cmd[:200]}"
        if 'pattern' in inp:
            summary += f" | pattern={inp['pattern']}"
        if 'old_string' in inp:
            summary += f" | edit: {inp['old_string'][:80]} -> {inp['new_string'][:80]}"
        if 'content' in inp:
            summary += f" | writing {len(inp['content'])} chars"
        print(f"  {summary}")

conn.close()
