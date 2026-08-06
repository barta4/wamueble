import sqlite3
import json
from datetime import datetime, timedelta

DB_PATH = r'C:\Users\usuario\.local\share\mimocode\mimocode.db'
conn = sqlite3.connect(DB_PATH)
conn.row_factory = sqlite3.Row
cursor = conn.cursor()

# Get recent sessions (last 30 days)
cutoff = int((datetime.now() - timedelta(days=30)).timestamp() * 1000)
cursor.execute("SELECT id, time_created, directory, title FROM session WHERE time_created > ? ORDER BY time_created DESC", (cutoff,))
sessions = cursor.fetchall()

print("=== RECENT SESSIONS ===")
session_ids = []
for s in sessions:
    sid = s[0]
    session_ids.append(sid)
    print(f"\nSession: {sid}")
    print(f"  Title: {s[3]}")
    print(f"  Directory: {s[2]}")
    created = datetime.fromtimestamp(s[1]/1000).strftime('%Y-%m-%d %H:%M')
    print(f"  Created: {created}")

# Also get older sessions
cursor.execute("SELECT id, time_created, directory, title FROM session WHERE time_created <= ? ORDER BY time_created DESC LIMIT 10", (cutoff,))
old_sessions = cursor.fetchall()
if old_sessions:
    print("\n=== OLDER SESSIONS ===")
    for s in old_sessions:
        session_ids.append(s[0])
        sid = s[0]
        print(f"\nSession: {sid}")
        print(f"  Title: {s[3]}")
        print(f"  Directory: {s[2]}")
        created = datetime.fromtimestamp(s[1]/1000).strftime('%Y-%m-%d %H:%M')
        print(f"  Created: {created}")

# For each session, count messages
print("\n=== MESSAGE COUNTS ===")
for sid in session_ids:
    cursor.execute("SELECT COUNT(*) FROM message WHERE session_id = ?", (sid,))
    count = cursor.fetchone()[0]
    print(f"  {sid}: {count} messages")

# Get tool usage patterns across all sessions
print("\n=== TOOL USAGE PATTERNS (all sessions) ===")
placeholders = ','.join(['?' for _ in session_ids])
cursor.execute(f"""
    SELECT json_extract(p.data, '$.tool') as tool,
           substr(json_extract(p.data, '$.state.input'), 1, 200) as input_preview,
           count(*) as n
    FROM message m
    JOIN part p ON p.message_id = m.id
    WHERE json_extract(m.data, '$.role') = 'assistant'
      AND json_extract(p.data, '$.type') = 'tool'
      AND m.session_id IN ({placeholders})
    GROUP BY tool, input_preview
    ORDER BY n DESC
    LIMIT 50
""", session_ids)
rows = cursor.fetchall()
for r in rows:
    print(f"  {r[0]}: {r[2]}x | {r[1][:120] if r[1] else 'N/A'}")

# Get user message keywords
print("\n=== USER MESSAGE KEYWORDS ===")
cursor.execute(f"""
    SELECT substr(json_extract(m.data, '$.content'), 1, 300) as content
    FROM message m
    WHERE json_extract(m.data, '$.role') = 'user'
      AND m.session_id IN ({placeholders})
    ORDER BY m.time_created
""", session_ids)
rows = cursor.fetchall()
for r in rows:
    content = r[0] if r[0] else 'N/A'
    print(f"  - {content[:200]}")

# Get subagent patterns
print("\n=== SUBAGENT/ACTOR PATTERNS ===")
cursor.execute(f"""
    SELECT actor_id, mode, agent, description, turn_count, status
    FROM actor_registry
    WHERE session_id IN ({placeholders})
    ORDER BY time_created
""", session_ids)
rows = cursor.fetchall()
for r in rows:
    print(f"  Actor: {r[0]} | mode={r[1]} | agent={r[2]} | desc={r[3][:80] if r[3] else 'N/A'} | turns={r[4]} | status={r[5]}")

# Get task patterns
print("\n=== TASK PATTERNS ===")
cursor.execute(f"""
    SELECT id, session_id, status, summary, parent_task_id
    FROM task
    WHERE session_id IN ({placeholders})
    ORDER BY created_at
""", session_ids)
rows = cursor.fetchall()
for r in rows:
    print(f"  Task: {r[0]} | session={r[1]} | status={r[2]} | summary={r[3][:100] if r[3] else 'N/A'} | parent={r[4]}")

conn.close()
