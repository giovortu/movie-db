import os
import re
import sqlite3
from datetime import datetime
from flask import Flask, render_template, request, redirect, url_for
import argparse
from werkzeug.utils import secure_filename
from flask import send_file, jsonify
import csv
import io
import json


app = Flask(__name__)

# Configuration
DATABASE = 'movies.db'
MOVIE_EXTENSIONS = {'.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.m4v'}
SCAN_FOLDERS = ['/mnt/disk01/Movies','/mnt/disk02/Movies','/mnt/disk03/Movies' ]  # Update these

def init_db():
    conn = sqlite3.connect(DATABASE)
    c = conn.cursor()
    c.execute('''CREATE TABLE IF NOT EXISTS movies
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  filename TEXT,
                  title TEXT,
                  year INTEGER,
                  resolution TEXT,
                  codec TEXT,
                  path TEXT UNIQUE,
                  size INTEGER,
                  mod_time TIMESTAMP)''')
    conn.commit()
    conn.close()

def clean_filename(name):
    """Clean up filename while preserving meaningful punctuation"""
    name = name.replace('_', ' ').replace('.', ' ')
    name = ' '.join(name.split())
    return name.title()

def extract_metadata(filename):
    base_name = os.path.splitext(filename)[0]
    
    metadata = {
        'title': clean_filename(base_name),
        'year': None,
        'resolution': None,
        'codec': None
    }
    
    patterns = [
        r'^(?P<title>.+?[^\d])(?:\.(?P<year>\d{4}))?(?:\.(?P<resolution>\d+p))?(?:\.(?P<codec>[a-zA-Z0-9]+))?$',
        r'^(?P<title>\d+\..+?)(?:\.(?P<year>\d{4}))?(?:\.(?P<resolution>\d+p))?(?:\.(?P<codec>[a-zA-Z0-9]+))?$'
    ]
    
    for pattern in patterns:
        match = re.match(pattern, base_name)
        if match:
            for key, value in match.groupdict().items():
                if value:
                    if key == 'title':
                        metadata[key] = clean_filename(value)
                    else:
                        metadata[key] = value
            break
    
    return metadata

def update_database():
    conn = sqlite3.connect(DATABASE)
    c = conn.cursor()
    c.execute("SELECT path FROM movies")
    existing_files = {row[0] for row in c.fetchall()}
    
    new_movies = 0
    
    for folder in SCAN_FOLDERS:
        for root, _, files in os.walk(folder):
            for file in files:
                if any(file.lower().endswith(ext) for ext in MOVIE_EXTENSIONS):
                    filepath = os.path.join(root, file)
                    mod_time = os.path.getmtime(filepath)
                    
                    if filepath not in existing_files:
                        metadata = extract_metadata(file)
                        size = os.path.getsize(filepath)
                        
                        c.execute('''INSERT INTO movies 
                                    (filename, title, year, resolution, codec, path, size, mod_time) 
                                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)''',
                                 (file, metadata['title'], metadata['year'], 
                                  metadata['resolution'], metadata['codec'], 
                                  filepath, size, mod_time))
                        new_movies += 1
    
    conn.commit()
    conn.close()
    return new_movies

@app.route('/')
def index():
    view_type = request.args.get('view', 'card')
    page = request.args.get('page', 1, type=int)
    per_page = 20
    search_query = request.args.get('search', '')
    order_by = request.args.get('order_by', 'title_asc')
    
    order_mapping = {
        'title_asc': 'title ASC',
        'title_desc': 'title DESC',
        'year_asc': 'year ASC NULLS LAST',
        'year_desc': 'year DESC NULLS FIRST',
        'date_asc': 'mod_time ASC',
        'date_desc': 'mod_time DESC',
        'size_asc': 'size ASC',
        'size_desc': 'size DESC'
    }
    order_clause = order_mapping.get(order_by, 'title ASC')
    
    conn = sqlite3.connect(DATABASE)
    c = conn.cursor()
    
    base_query = "SELECT * FROM movies"
    count_query = "SELECT COUNT(*) FROM movies"
    
    if search_query:
        where_clause = " WHERE title LIKE ? OR year LIKE ? OR resolution LIKE ? OR codec LIKE ?"
        params = (f'%{search_query}%', f'%{search_query}%', f'%{search_query}%', f'%{search_query}%')
    else:
        where_clause = ""
        params = ()
    
    c.execute(count_query + where_clause, params)
    total = c.fetchone()[0]
    
    query = f"{base_query}{where_clause} ORDER BY {order_clause} LIMIT ? OFFSET ?"
    c.execute(query, params + (per_page, (page-1)*per_page))
    movies = c.fetchall()
    conn.close()
    
    total_pages = (total + per_page - 1) // per_page
    
    return render_template('index.html', 
                         movies=movies,
                         page=page,
                         total_pages=total_pages,
                         search_query=search_query,
                         message=request.args.get('message'),
                         now=datetime.now(),
                         view_type=view_type,
                         order_by=order_by)

@app.route('/update', methods=['POST'])
def update():
    new_movies = update_database()
    return redirect(url_for('index', message=f'Database updated! Added {new_movies} new movies.'))


@app.route('/export/json')
def export_json():
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row  # This enables column access by name
    c = conn.cursor()
    
    c.execute("SELECT * FROM movies")
    movies = [dict(row) for row in c.fetchall()]
    conn.close()
    
    # Create in-memory file
    file = io.StringIO()
    json.dump(movies, file, indent=4)
    file.seek(0)
    
    return send_file(
        io.BytesIO(file.getvalue().encode('utf-8')),
        mimetype='application/json',
        as_attachment=True,
        download_name='movies_export.json'
    )



@app.route('/export/csv')
def export_csv():
    conn = sqlite3.connect(DATABASE)
    c = conn.cursor()
    
    c.execute("SELECT id, title, path FROM movies")
    movies = c.fetchall()
    conn.close()
    
    # Create in-memory CSV file
    file = io.StringIO()
    writer = csv.writer(file, delimiter=';')
    writer.writerow(['ID', 'Title', 'Path'])  # Header row
    
    for movie in movies:
        writer.writerow(movie)
    
    file.seek(0)
    
    return send_file(
        io.BytesIO(file.getvalue().encode('utf-8')),
        mimetype='text/csv',
        as_attachment=True,
        download_name='movies_export.csv'
    )



if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=5000, help='Port to run the server on')
    parser.add_argument('--host', type=str, default='127.0.0.1', help='Host to bind to')
    parser.add_argument('--ssl', action='store_true', help='Enable HTTPS')
    parser.add_argument('--cert', type=str, help='Path to SSL certificate')
    parser.add_argument('--key', type=str, help='Path to SSL key')
    args = parser.parse_args()
    
    ssl_context = None
    if args.ssl:
        if args.cert and args.key:
            ssl_context = (args.cert, args.key)
        else:
            ssl_context = 'adhoc'  # Auto-generate self-signed cert
    
    init_db()
    app.run(debug=True, host=args.host, port=args.port, ssl_context=ssl_context)

