import os
import time
import json
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By

OUTPUT_DIR = r"d:\PORTFOLIO\intern\report_screenshots"
os.makedirs(OUTPUT_DIR, exist_ok=True)

TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjZhY2I3ZTVlMTU4Y2YxZTVlOGE2MzdmZSIsImVtYWlsIjoia2FiaXJAdm9sdHN5bmMuaW4iLCJyb2xlIjoib3BlcmF0b3IiLCJuYW1lIjoiU2FiYWxwYXJhIEthYmlyIEhhc211a2hCaGFpIiwiaWF0IjoxNzkxNzIxMDU0LCJleHAiOjE3OTIzMjU4NTR9.Zw1cXMq3ZHseA4CPEAWBcGWhg0WLFx5nOMTxVTPINqA"

USER = {
    "id": "6acb7e5e158cf1e5e8a637fe",
    "name": "Sabalpara Kabir HasmukhBhai",
    "email": "kabir@voltsync.in",
    "role": "operator",
    "evModel": "Tata Nexon EV Max"
}

def capture():
    options = Options()
    options.add_argument('--headless=new')
    options.add_argument('--window-size=1600,1050')
    driver = webdriver.Chrome(options=options)
    driver.set_window_size(1600, 1050)

    try:
        # 1. Set localStorage with valid user & token
        driver.get("http://localhost:5173/")
        time.sleep(1)
        driver.execute_script(f"""
            localStorage.setItem('voltsync_skip_globe', 'true');
            localStorage.setItem('voltsync_token', '{TOKEN}');
            localStorage.setItem('voltsync_user', JSON.stringify({json.dumps(USER)}));
        """)
        
        # 2. Capture Operator Dashboard (Figure 10.4)
        driver.get("http://localhost:5173/")
        time.sleep(3)
        
        # Click Operator Portal tab
        op_portal_btns = driver.find_elements(By.XPATH, "//button[contains(., 'Operator Portal')]")
        if op_portal_btns:
            op_portal_btns[0].click()
            time.sleep(4)
            driver.save_screenshot(os.path.join(OUTPUT_DIR, "Figure_10_4_Operator_Dashboard_Analytics.png"))
            print("Successfully captured Figure_10_4_Operator_Dashboard_Analytics.png")

        # 3. Capture Booking Flow / Battery Estimator (Figure 8.2 / Figure 10.2)
        driver.get("http://localhost:5173/")
        time.sleep(3)
        
        # Open List drawer
        list_btns = driver.find_elements(By.XPATH, "//button[contains(., 'List')]")
        if list_btns:
            driver.execute_script("arguments[0].click();", list_btns[0])
            time.sleep(2)

        # Click the first Book Slot action button using JS to avoid interception
        book_btns = driver.find_elements(By.XPATH, "//button[contains(., 'Book Slot') or contains(., 'Reserve')]")
        if book_btns:
            driver.execute_script("arguments[0].click();", book_btns[0])
            time.sleep(3)
            driver.save_screenshot(os.path.join(OUTPUT_DIR, "Figure_10_2_Battery_Estimator_Booking_Wizard.png"))
            print("Successfully captured Figure_10_2_Battery_Estimator_Booking_Wizard.png")
        else:
            print("Book button not found directly.")

    finally:
        driver.quit()

if __name__ == "__main__":
    capture()
