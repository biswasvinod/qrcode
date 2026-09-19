import http.server
import socketserver
import json
import os
import urllib.parse
import socket
import secrets
import subprocess
import threading
import re
from datetime import datetime, timezone

PORT = 3000
DB_FILE = os.path.join(os.path.dirname(__file__), 'db.json')
PUBLIC_URL = ""

def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return '127.0.0.1'

def start_public_tunnel():
    global PUBLIC_URL
    try:
        key_path = os.path.expanduser(r"~\.ssh\id_ed25519")
        cmd = ["ssh", "-i", key_path, "-o", "StrictHostKeyChecking=no", "-R", f"80:localhost:{PORT}", "nokey@localhost.run"]
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        for line in proc.stdout:
            match = re.search(r'https://[a-zA-Z0-9-]+\.lhr\.life', line)
            if match:
                PUBLIC_URL = match.group(0)
                print("=" * 60)
                print(" PERMANENT WORLDWIDE ONLINE HTTPS URL IS ACTIVE:")
                print(f" {PUBLIC_URL}")
                print(" Anyone anywhere in the world on 4G/5G/Wi-Fi can scan your QR codes now!")
                print("=" * 60)
                break
    except Exception as e:
        print("Tunnel failed to start:", e)

def read_db():
    if not os.path.exists(DB_FILE):
        db = {"qrcodes": [], "scans": []}
        write_db(db)
        return db
    try:
        with open(DB_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return {"qrcodes": [], "scans": []}

def write_db(data):
    try:
        with open(DB_FILE, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2)
    except Exception as e:
        print("Error writing DB:", e)

class QRHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=os.path.join(os.path.dirname(__file__), 'public'), **kwargs)

    def do_GET(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path

        # 1. Mobile & Web Redirect Handler: /r/<id>
        if path.startswith('/r/'):
            qr_id = path[3:]
            db = read_db()
            qrcode = next((q for q in db.get('qrcodes', []) if q['id'] == qr_id), None)
            
            if qrcode:
                ua = self.headers.get('User-Agent', '')
                device = 'Desktop'
                if 'Mobi' in ua or 'Android' in ua or 'iPhone' in ua:
                    device = 'Mobile'
                elif 'Tablet' in ua or 'iPad' in ua:
                    device = 'Tablet'

                browser = 'Other'
                if 'Chrome' in ua: browser = 'Chrome'
                elif 'Safari' in ua and 'Chrome' not in ua: browser = 'Safari'
                elif 'Firefox' in ua: browser = 'Firefox'
                elif 'Edge' in ua: browser = 'Edge'

                os_name = 'Other'
                if 'Windows' in ua: os_name = 'Windows'
                elif 'Macintosh' in ua: os_name = 'macOS'
                elif 'Android' in ua: os_name = 'Android'
                elif 'iPhone' in ua or 'iPad' in ua: os_name = 'iOS'
                elif 'Linux' in ua: os_name = 'Linux'

                new_scan = {
                    "id": secrets.token_hex(4),
                    "qrcodeId": qr_id,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "ip": self.client_address[0],
                    "device": device,
                    "browser": browser,
                    "os": os_name
                }

                db['scans'].append(new_scan)
                write_db(db)

                dest_url = qrcode['destinationUrl']
                if not dest_url.startswith('http://') and not dest_url.startswith('https://'):
                    dest_url = 'https://' + dest_url

                self.send_response(302)
                self.send_header('Location', dest_url)
                self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
                self.end_headers()
                return
            else:
                self.send_response(404)
                self.send_header('Content-type', 'text/html')
                self.end_headers()
                self.wfile.write(b"<h1>404: Link Not Found</h1><p>This dynamic QR code link is expired, deleted, or invalid.</p>")
                return

        # 2. GET API: /api/qrcodes
        if path == '/api/qrcodes':
            db = read_db()
            scan_counts = {}
            for s in db.get('scans', []):
                q_id = s.get('qrcodeId')
                scan_counts[q_id] = scan_counts.get(q_id, 0) + 1

            result = []
            for q in db.get('qrcodes', []):
                item = dict(q)
                item['scanCount'] = scan_counts.get(q['id'], 0)
                result.append(item)

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps(result).encode('utf-8'))
            return

        # 3. GET API: /api/qrcodes/<id>
        if path.startswith('/api/qrcodes/'):
            qr_id = path.replace('/api/qrcodes/', '')
            db = read_db()
            qrcode = next((q for q in db.get('qrcodes', []) if q['id'] == qr_id), None)
            if qrcode:
                scans = [s for s in db.get('scans', []) if s.get('qrcodeId') == qr_id]
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({"qrcode": qrcode, "scans": scans}).encode('utf-8'))
                return
            else:
                self.send_response(404)
                self.end_headers()
                return

        # 4. GET API: /api/info (Includes Public Online HTTPS URL)
        if path == '/api/info':
            local_ip = get_local_ip()
            info = {
                "port": PORT,
                "localIp": local_ip,
                "publicUrl": PUBLIC_URL,
                "serverUrl": PUBLIC_URL if PUBLIC_URL else f"http://{local_ip}:{PORT}"
            }
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps(info).encode('utf-8'))
            return

        # Serve static files from public/
        super().do_GET()

    def do_POST(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path

        content_length = int(self.headers.get('Content-Length', 0))
        body_bytes = self.rfile.read(content_length) if content_length > 0 else b'{}'
        try:
            body = json.loads(body_bytes.decode('utf-8'))
        except Exception:
            body = {}

        if path == '/api/qrcodes':
            title = body.get('title', '')
            destination_url = body.get('destinationUrl', '')
            customization = body.get('customization', {})
            qr_data_url = body.get('qrDataUrl', '')

            if not destination_url.startswith('http://') and not destination_url.startswith('https://'):
                destination_url = 'https://' + destination_url

            qr_id = body.get('id') or secrets.token_hex(4)
            db = read_db()

            new_qr = {
                "id": qr_id,
                "title": title,
                "destinationUrl": destination_url,
                "customization": customization,
                "qrDataUrl": qr_data_url,
                "createdAt": datetime.now(timezone.utc).isoformat()
            }

            db['qrcodes'].append(new_qr)
            write_db(db)

            self.send_response(201)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps(new_qr).encode('utf-8'))
            return

        if path == '/api/simulate-scan':
            qr_id = body.get('qrcodeId')
            db = read_db()
            qrcode = next((q for q in db.get('qrcodes', []) if q['id'] == qr_id), None)
            if not qrcode:
                self.send_response(404)
                self.end_headers()
                return

            new_scan = {
                "id": secrets.token_hex(4),
                "qrcodeId": qr_id,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "ip": "127.0.0.1 (Simulated)",
                "device": body.get('device', 'Mobile'),
                "browser": body.get('browser', 'Safari'),
                "os": body.get('os', 'iOS')
            }

            db['scans'].append(new_scan)
            write_db(db)

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({
                "success": True,
                "scan": new_scan,
                "destinationUrl": qrcode['destinationUrl']
            }).encode('utf-8'))
            return

    def do_PUT(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path

        if path.startswith('/api/qrcodes/'):
            qr_id = path.replace('/api/qrcodes/', '')
            content_length = int(self.headers.get('Content-Length', 0))
            body_bytes = self.rfile.read(content_length) if content_length > 0 else b'{}'
            try:
                body = json.loads(body_bytes.decode('utf-8'))
            except Exception:
                body = {}

            db = read_db()
            qrcode = next((q for q in db.get('qrcodes', []) if q['id'] == qr_id), None)
            if not qrcode:
                self.send_response(404)
                self.end_headers()
                return

            if 'destinationUrl' in body:
                dest = body['destinationUrl']
                if not dest.startswith('http://') and not dest.startswith('https://'):
                    dest = 'https://' + dest
                qrcode['destinationUrl'] = dest

            if 'title' in body:
                qrcode['title'] = body['title']

            if 'qrDataUrl' in body:
                qrcode['qrDataUrl'] = body['qrDataUrl']

            write_db(db)

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps(qrcode).encode('utf-8'))
            return

    def do_DELETE(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path

        if path.startswith('/api/qrcodes/'):
            qr_id = path.replace('/api/qrcodes/', '')
            db = read_db()
            db['qrcodes'] = [q for q in db.get('qrcodes', []) if q['id'] != qr_id]
            db['scans'] = [s for s in db.get('scans', []) if s.get('qrcodeId') != qr_id]
            write_db(db)

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({"message": "Deleted"}).encode('utf-8'))
            return

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

if __name__ == '__main__':
    # Start Public Tunnel Thread
    tunnel_thread = threading.Thread(target=start_public_tunnel, daemon=True)
    tunnel_thread.start()

    local_ip = get_local_ip()
    print("=" * 60)
    print(" QRFLOW DYNAMIC QR CODE SERVER IS RUNNING!")
    print(f" PC Dashboard:   http://localhost:{PORT}")
    print(f" Mobile Wi-Fi:   http://{local_ip}:{PORT}")
    print("=" * 60)
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("0.0.0.0", PORT), QRHandler) as httpd:
        httpd.serve_forever()
