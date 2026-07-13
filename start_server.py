import subprocess
import sys
import time
import os

def main():
    root_dir = os.path.dirname(os.path.abspath(__file__))
    
    frontend_cmd = [
        "npm", "run", "dev", "--", "-p", "3002", "-H", "0.0.0.0"
    ]
    
    # Launch Next.js Full-Stack App
    print("\n--> Starting TalentScan AI Full-Stack App (Next.js on http://localhost:3002)...")
    frontend_process = subprocess.Popen(
        frontend_cmd,
        cwd=root_dir,
        stdout=sys.stdout,
        stderr=sys.stderr
    )
    
    print("\n[SUCCESS] Server is now running!")
    print("Press Ctrl+C to terminate.\n")
    
    try:
        while True:
            if frontend_process.poll() is not None:
                print("\n[ALERT] Server stopped unexpectedly.")
                break
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n--> Received shutdown signal (Ctrl+C). Terminating server...")
    finally:
        try:
            frontend_process.terminate()
            frontend_process.wait(timeout=2)
        except Exception:
            pass
        print("--> Done. Server stopped.")

if __name__ == "__main__":
    main()
