#!/usr/bin/env python3
"""A dependency-free household expense tracker (SQLite + stdlib web server)."""
from __future__ import annotations

import json
import os
import sqlite3
from datetime import date, datetime, timedelta
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).parent
DB_PATH = ROOT / "expense_tracker.db"


def db():
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def bootstrap():
    with db() as con:
        con.executescript("""
            PRAGMA foreign_keys = ON;
            CREATE TABLE IF NOT EXISTS categories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL COLLATE NOCASE UNIQUE,
                color TEXT NOT NULL DEFAULT '#5B6CFF',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS expenses (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                amount REAL NOT NULL CHECK(amount > 0),
                category_id INTEGER NOT NULL REFERENCES categories(id),
                expense_date TEXT NOT NULL,
                ownership TEXT NOT NULL CHECK(ownership IN ('common', 'personal')),
                person TEXT CHECK(person IN ('You', 'Wife')),
                note TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                CHECK((ownership = 'common' AND person IS NULL) OR (ownership = 'personal' AND person IS NOT NULL))
            );
        """)
        existing = con.execute("SELECT COUNT(*) FROM categories").fetchone()[0]
        if not existing:
            con.executemany("INSERT INTO categories(name, color) VALUES (?, ?)", [
                ("Groceries", "#6d5dfc"), ("Dining", "#fb7185"), ("Home", "#f59e0b"),
                ("Travel", "#14b8a6"), ("Utilities", "#3b82f6"), ("Health", "#22c55e"),
                ("Shopping", "#a855f7"), ("Other", "#64748b"),
            ])


def rows_to_dicts(rows):
    return [dict(row) for row in rows]


class App(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT / "static"), **kwargs)

    def json_response(self, data, status=200):
        body = json.dumps(data, default=str).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def payload(self):
        length = int(self.headers.get("Content-Length", "0"))
        return json.loads(self.rfile.read(length) or b"{}")

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/categories":
            with db() as con:
                return self.json_response(rows_to_dicts(con.execute("SELECT * FROM categories ORDER BY name")))
        if parsed.path == "/api/expenses":
            return self.list_expenses(parse_qs(parsed.query))
        if parsed.path == "/api/dashboard":
            return self.dashboard(parse_qs(parsed.query))
        if parsed.path == "/api/export":
            return self.export_csv()
        return super().do_GET()

    def list_expenses(self, q):
        clauses, values = [], []
        for key, column in (("from", "expense_date >= ?"), ("to", "expense_date <= ?"), ("ownership", "ownership = ?"), ("person", "person = ?"), ("category", "category_id = ?")):
            if q.get(key, [""])[0]:
                clauses.append(column); values.append(q[key][0])
        where = " WHERE " + " AND ".join(clauses) if clauses else ""
        sql = """SELECT e.*, c.name AS category, c.color AS category_color
                 FROM expenses e JOIN categories c ON c.id=e.category_id""" + where + " ORDER BY expense_date DESC, e.id DESC"
        with db() as con:
            self.json_response(rows_to_dicts(con.execute(sql, values)))

    def dashboard(self, q):
        period = q.get("period", ["month"])[0]
        today = date.today()
        if q.get("from", [""])[0] and q.get("to", [""])[0]:
            start, end = q["from"][0], q["to"][0]
        elif period == "week":
            start, end = (today - timedelta(days=today.weekday())).isoformat(), today.isoformat()
        elif period == "year":
            start, end = date(today.year, 1, 1).isoformat(), today.isoformat()
        else:
            start, end = date(today.year, today.month, 1).isoformat(), today.isoformat()
        with db() as con:
            base = " FROM expenses e JOIN categories c ON c.id=e.category_id WHERE e.expense_date BETWEEN ? AND ?"
            total = con.execute("SELECT COALESCE(SUM(amount),0)" + base, (start,end)).fetchone()[0]
            ownership = rows_to_dicts(con.execute("SELECT ownership, person, COALESCE(SUM(amount),0) total" + base + " GROUP BY ownership, person", (start,end)))
            categories = rows_to_dicts(con.execute("SELECT c.name, c.color, SUM(e.amount) total" + base + " GROUP BY c.id ORDER BY total DESC", (start,end)))
            trend = rows_to_dicts(con.execute("SELECT expense_date, SUM(amount) total FROM expenses WHERE expense_date BETWEEN ? AND ? GROUP BY expense_date ORDER BY expense_date", (start,end)))
        self.json_response({"start": start, "end": end, "total": total, "ownership": ownership, "categories": categories, "trend": trend})

    def export_csv(self):
        import csv, io
        output = io.StringIO(); writer = csv.writer(output)
        writer.writerow(["Date", "Amount", "Category", "Type", "Person", "Note"])
        with db() as con:
            for row in con.execute("SELECT e.expense_date,e.amount,c.name,e.ownership,e.person,e.note FROM expenses e JOIN categories c ON c.id=e.category_id ORDER BY e.expense_date DESC"):
                writer.writerow(row)
        body = output.getvalue().encode()
        self.send_response(200); self.send_header("Content-Type", "text/csv; charset=utf-8")
        self.send_header("Content-Disposition", 'attachment; filename="household-expenses.csv"')
        self.send_header("Content-Length", str(len(body))); self.end_headers(); self.wfile.write(body)

    def do_POST(self):
        if self.path == "/api/categories":
            data = self.payload(); name = data.get("name", "").strip(); color = data.get("color", "#5B6CFF")
            if not name: return self.json_response({"error":"Category name is required."}, 400)
            try:
                with db() as con:
                    cur = con.execute("INSERT INTO categories(name,color) VALUES(?,?)", (name,color))
                    row = con.execute("SELECT * FROM categories WHERE id=?", (cur.lastrowid,)).fetchone()
                return self.json_response(dict(row), 201)
            except sqlite3.IntegrityError: return self.json_response({"error":"That category already exists."}, 409)
        if self.path == "/api/expenses": return self.save_expense()
        self.json_response({"error":"Not found"}, 404)

    def do_PUT(self):
        if self.path.startswith("/api/expenses/"): return self.save_expense(int(self.path.rsplit("/",1)[-1]))
        if self.path.startswith("/api/categories/"):
            cid = int(self.path.rsplit("/",1)[-1]); data = self.payload()
            with db() as con: con.execute("UPDATE categories SET name=?, color=? WHERE id=?", (data["name"].strip(), data.get("color","#5B6CFF"), cid))
            return self.json_response({"ok":True})
        self.json_response({"error":"Not found"}, 404)

    def do_DELETE(self):
        if self.path.startswith("/api/expenses/"):
            with db() as con: con.execute("DELETE FROM expenses WHERE id=?", (int(self.path.rsplit("/",1)[-1]),))
            return self.json_response({"ok":True})
        if self.path.startswith("/api/categories/"):
            cid=int(self.path.rsplit("/",1)[-1])
            try:
                with db() as con: con.execute("DELETE FROM categories WHERE id=?", (cid,))
                return self.json_response({"ok":True})
            except sqlite3.IntegrityError: return self.json_response({"error":"Categories in use cannot be removed."},409)
        self.json_response({"error":"Not found"}, 404)

    def save_expense(self, eid=None):
        d=self.payload()
        try:
            amount=round(float(d["amount"]),2); category=int(d["category_id"]); expense_date=datetime.strptime(d["expense_date"], "%Y-%m-%d").date().isoformat()
            ownership=d["ownership"]; person=d.get("person") if ownership == "personal" else None
            if amount <= 0 or ownership not in ("common","personal") or (ownership == "personal" and person not in ("You","Wife")): raise ValueError
        except (KeyError, TypeError, ValueError): return self.json_response({"error":"Please complete the amount, category, date, and owner."},400)
        with db() as con:
            if eid: con.execute("UPDATE expenses SET amount=?,category_id=?,expense_date=?,ownership=?,person=?,note=?,updated_at=CURRENT_TIMESTAMP WHERE id=?", (amount,category,expense_date,ownership,person,d.get("note","").strip(),eid))
            else: con.execute("INSERT INTO expenses(amount,category_id,expense_date,ownership,person,note) VALUES(?,?,?,?,?,?)", (amount,category,expense_date,ownership,person,d.get("note","").strip()))
        self.json_response({"ok":True}, 200 if eid else 201)


if __name__ == "__main__":
    bootstrap()
    port = int(os.environ.get("PORT", "8000"))
    print(f"Expense Tracker running at http://localhost:{port}")
    ThreadingHTTPServer(("127.0.0.1", port), App).serve_forever()
