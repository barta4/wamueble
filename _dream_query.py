import sqlite3
import json
import os

DB_PATH = r"C:\Users\usuario\.local\share\mimocode\mimocode.db"

conn = sqlite3.connect(DB_PATH)
conn.row_factory = sqlite3.Row
c = conn.cursor()

# 1. List tables
c.execute("SELECT name FROM sqlite_master WHERE type='table'")
tables = [r[0] for r in c.fetchall()]
print("=== TABLES ===")
for t in tables:
    print(t)

# 2. List sessions
print("\n=== SESSIONS ===")
c.execute("SELECT id, directory, title, time_created FROM session ORDER BY time_created DESC")
for row in c.fetchall():
    print(f"  {row['id']} | dir={row['directory']} | title={row['title']} | created={row['time_created']}")

# 3. Check for any session notes/checkpoint content
print("\n=== CHECKPOINT PARTS (last 5 sessions) ===")
c.execute("SELECT id FROM session ORDER BY time_created DESC LIMIT 5")
session_ids = [r[0] for r in c.fetchall()]
for sid in session_ids:
    c.execute("""
        SELECT p.id, json_extract(p.data, '$.type') as part_type, substr(p.data, 1, 500) as preview
        FROM part p
        WHERE p.session_id = ? AND json_extract(p.data, '$.type') = 'checkpoint'
        ORDER BY p.time_created
    """, (sid,))
    parts = c.fetchall()
    if parts:
        print(f"\n  Session {sid}:")
        for p in parts:
            print(f"    Part {p['id']}: {p['preview'][:300]}")

# 4. Check user messages for rules/decisions
print("\n=== USER MESSAGES with durable keywords ===")
c.execute("""
    SELECT m.id, m.session_id, json_extract(m.data, '$.content') as content
    FROM message m
    WHERE json_extract(m.data, '$.role') = 'user'
    ORDER BY m.time_created DESC
""")
for row in c.fetchall():
    content = row['content'] or ""
    if isinstance(content, list):
        content = " ".join(str(x) for x in content)
    content = str(content).lower()
    keywords = ['always', 'never', 'remember', 'rule', 'decision', 'decided', 'prefer', 'use', 'no usar', 'siempre', 'nunca']
    for kw in keywords:
        if kw in content:
            # Get full content
            c2 = conn.cursor()
            c2.execute("SELECT json_extract(data, '$.content') FROM message WHERE id = ?", (row['id'],))
            full = c2.fetchone()[0]
            if isinstance(full, list):
                full = " ".join(str(x) for x in full)
            print(f"  Session {row['session_id']} | id={row['id']}: {str(full)[:500]}")
            break

conn.close()
