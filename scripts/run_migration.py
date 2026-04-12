#!/usr/bin/env python3
"""
Run SQL migration on Supabase
Usage: python run_migration.py <sql_file>
"""

import os
import sys
import requests
import json
from pathlib import Path

# Load environment variables from .env.local
env_file = Path(__file__).parent / '.env.local'
if env_file.exists():
    with open(env_file) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                key, value = line.split('=', 1)
                os.environ[key] = value

# Get environment variables
SUPABASE_URL = os.environ.get('NEXT_PUBLIC_SUPABASE_URL')
SUPABASE_SERVICE_ROLE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')

if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
    print("Error: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")
    sys.exit(1)

def run_sql(sql: str):
    """Run SQL query on Supabase"""
    url = f"{SUPABASE_URL}/rest/v1/rpc/exec_sql"
    headers = {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': f'Bearer {SUPABASE_SERVICE_ROLE_KEY}',
        'Content-Type': 'application/json',
    }

    response = None
    try:
        response = requests.post(url, headers=headers, json={'sql': sql})
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        print(f"Error running SQL: {e}")
        if response is not None and response.status_code != 200:
            print(f"Response: {response.text}")
        sys.exit(1)

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python run_migration.py <sql_file>")
        sys.exit(1)

    sql_file = sys.argv[1]

    if not os.path.exists(sql_file):
        print(f"Error: SQL file not found: {sql_file}")
        sys.exit(1)

    with open(sql_file, 'r') as f:
        sql = f.read()

    print(f"Running migration: {sql_file}")
    print(f"SQL: {sql}")

    result = run_sql(sql)
    print(f"Success: {result}")
