import subprocess
import sys
import time
import os

def main():
    root_dir = os.path.dirname(os.path.abspath(__file__))
    
    # 1. Define command paths
    backend_venv_python = os.path.join(root_dir, "backend", "venv", "bin", "python")
    
    backend_cmd = [
        backend_venv_python,
        "-m", "uvicorn", "backend.main:app",
        "--port", "8000",
        "--host", "0.0.0.0",
        "--reload"
    ]
    
    frontend_cmd = [
        "npm", "run", "dev", "--", "-p", "3002", "-H", "0.0.0.0"
    ]
    
    # 2. Launch FastAPI Backend
    print("--> Starting TalentScan AI Backend (FastAPI on http://localhost:8000)...")
    backend_process = subprocess.Popen(
        backend_cmd,
        cwd=root_dir,
        stdout=sys.stdout,
        stderr=sys.stderr
    )
    
    # Wait a brief moment for FastAPI to initialize
    time.sleep(1.5)
    
    # 3. Launch Next.js Frontend
    print("\n--> Starting TalentScan AI Frontend (Next.js on http://localhost:3002)...")
    frontend_process = subprocess.Popen(
        frontend_cmd,
        cwd=root_dir,
        stdout=sys.stdout,
        stderr=sys.stderr
    )
    
    print("\n[SUCCESS] Both servers are now running!")
    print("Press Ctrl+C to terminate both servers concurrently.\n")
    
    try:
        while True:
            # Monitor if either server has exited
            if backend_process.poll() is not None:
                print("\n[ALERT] Backend server stopped unexpectedly.")
                break
            if frontend_process.poll() is not None:
                print("\n[ALERT] Frontend server stopped unexpectedly.")
                break
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n--> Received shutdown signal (Ctrl+C). Terminating both servers...")
    finally:
        # Clean shutdown of both processes
        try:
            frontend_process.terminate()
            frontend_process.wait(timeout=2)
        except Exception:
            pass
            
        try:
            backend_process.terminate()
            backend_process.wait(timeout=2)
        except Exception:
            pass
        print("--> Done. Both servers stopped.")

if __name__ == "__main__":
    main()
