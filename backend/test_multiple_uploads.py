import httpx
import os

def test_upload():
    # Create test files
    os.makedirs("test_temp", exist_ok=True)
    with open("test_temp/test_resume_1.pdf", "w") as f:
        f.write("Dummy PDF content 1")
    with open("test_temp/test_resume_2.pdf", "w") as f:
        f.write("Dummy PDF content 2")

    files = [
        ("files", ("test_resume_1.pdf", open("test_temp/test_resume_1.pdf", "rb"), "application/pdf")),
        ("files", ("test_resume_2.pdf", open("test_temp/test_resume_2.pdf", "rb"), "application/pdf"))
    ]

    try:
        response = httpx.post("http://localhost:8000/api/resumes/upload", files=files, timeout=30.0)
        print("Status Code:", response.status_code)
        print("Response JSON:", response.json())
    except Exception as e:
        print("Error uploading:", e)
    finally:
        # Cleanup
        for name in ["test_resume_1.pdf", "test_resume_2.pdf"]:
            try:
                os.remove(f"test_temp/{name}")
            except:
                pass
        try:
            os.rmdir("test_temp")
        except:
            pass

if __name__ == "__main__":
    test_upload()
