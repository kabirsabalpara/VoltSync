import os
import time
import json
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By

OUTPUT_DIR = r"d:\PORTFOLIO\intern\report_screenshots"
OP_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjZhYjhhZmYzZmVkY2NlMTkxNWY0ZjZiZCIsInJvbGUiOiJvcGVyYXRvciIsImVtYWlsIjoib3BlcmF0b3JAZXhhbXBsZS5jb20iLCJpYXQiOjE3OTE3MjM0MzIsImV4cCI6MTc5MjMyODIzMn0.xSgbLggCZqeI5JeKi43YNuK1z7XTlOTHKUienFSOeT0"

OP_USER = {
    "id": "6ab8aff3fedcce1915f4f6bd",
    "name": "Brijesh Dhanani (Operator)",
    "email": "operator@example.com",
    "phone": "",
    "evModel": "Hyundai Ioniq 5",
    "role": "operator"
}

def capture():
    options = Options()
    options.add_argument('--headless=new')
    options.add_argument('--window-size=1600,1050')
    driver = webdriver.Chrome(options=options)
    driver.set_window_size(1600, 1050)

    try:
        driver.get("http://localhost:5173/")
        time.sleep(1)

        driver.execute_script(f"""
            localStorage.setItem('voltsync_skip_globe', 'true');
            localStorage.setItem('voltsync_token', '{OP_TOKEN}');
            localStorage.setItem('voltsync_user', JSON.stringify({json.dumps(OP_USER)}));
        """)

        driver.get("http://localhost:5173/")
        time.sleep(3)

        # Click Operator Portal tab
        op_btn = driver.find_elements(By.XPATH, "//button[contains(., 'Operator Portal')]")
        if op_btn:
            op_btn[0].click()
            time.sleep(4)
            # Scroll slightly to see both revenue stats and managed nodes
            driver.save_screenshot(os.path.join(OUTPUT_DIR, "Figure_10_4_Operator_Dashboard_Analytics.png"))
            print("Successfully saved Figure_10_4_Operator_Dashboard_Analytics.png")
    finally:
        driver.quit()

if __name__ == "__main__":
    capture()
