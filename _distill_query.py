import sqlite3
import json
import os
from datetime import datetime, timedelta

DB_PATH = r'C:\Users\usuario\.local\share\mimocode\mimocode.db'
conn = sqlite3.connect(DB_PATH)
conn.row_factory = sqlite3.Row
cursor = conn.cursor()

# List tables
cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
tables = [row[0] for row in cursor.fetchall()]
print("=== TABLES ===")
print(tables)

# Schema for each table
for t in tables:
    cursor.execute(f"PRAGMA table_info({t})")
    cols = [(row[1], row[2]) for row in cursor.fetchall()]
    print(f"\n=== SCHEMA: {t} ===")
    print(cols)

# Count sessions
cursor.execute("SELECT COUNT(*) FROM session")
print(f"\n=== TOTAL SESSIONS: {cursor.fetchone()[0]} ===")

# Recent sessions (last 30 days)
cutoff = int((datetime.now() - timedelta(days=30)).timestamp() * 1000)
print(f"\n=== CUTOFF (ms): {cutoff} ===")

cursor.execute("SELECT id, time_created, directory, title FROM session WHERE time_created > ? ORDER BY time_created DESC", (cutoff,))
sessions = cursor.fetchall()
print(f"=== RECENT SESSIONS (last 30 days): {len(sessions)} ===")
for s in sessions:
    print(f"  {s[0]} | dir={s[2]} | title={s[3][:80] if s[3] else 'N/A'}")

# If no recent sessions, get all sessions
if not sessions:
    cursor.execute("SELECT id, time_created, directory, title FROM session ORDER BY time_created DESC LIMIT 20")
    sessions = cursor.fetchall()
    print(f"=== ALL SESSIONS (last 20): {len(sessions)} ===")
    for s in sessions:
        print(f"  {s[0]} | dir={s[2]} | title={s[3][:80] if s[3] else 'N/A'}")

conn.close()
