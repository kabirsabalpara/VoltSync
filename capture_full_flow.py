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

def run():
    options = Options()
    options.add_argument('--headless=new')
    options.add_argument('--window-size=1600,1050')
    driver = webdriver.Chrome(options=options)
    driver.set_window_size(1600, 1050)

    try:
        driver.get("http://localhost:5173/")
        time.sleep(1)

        # Inject user and token
        driver.execute_script(f"""
            localStorage.setItem('voltsync_skip_globe', 'true');
            localStorage.setItem('voltsync_token', '{TOKEN}');
            localStorage.setItem('voltsync_user', JSON.stringify({json.dumps(USER)}));
        """)

        # 1. Main Interactive Map
        driver.get("http://localhost:5173/")
        time.sleep(4)
        driver.save_screenshot(os.path.join(OUTPUT_DIR, "Figure_10_1_Interactive_Station_Map.png"))
        print("1. Figure_10_1_Interactive_Station_Map.png saved.")

        # 2. Search & Filter Drawer
        try:
            list_btn = driver.find_elements(By.XPATH, "//button[contains(., 'List') or contains(., 'Close')]")
            if list_btn:
                list_btn[0].click()
                time.sleep(2)
        except Exception as e:
            print("Drawer error:", e)
        driver.save_screenshot(os.path.join(OUTPUT_DIR, "Figure_6_4_Search_Filter_Drawer.png"))
        print("2. Figure_6_4_Search_Filter_Drawer.png saved.")

        # 3. My Reservations tab & FastPass QR Code Modal
        try:
            res_tab = driver.find_elements(By.XPATH, "//button[contains(., 'My Reservations')]")
            if res_tab:
                res_tab[0].click()
                time.sleep(3)
                # Save My Reservations list view
                driver.save_screenshot(os.path.join(OUTPUT_DIR, "My_Reservations_List_View.png"))
                
                # Click Digital Pass button on booking card
                pass_btn = driver.find_elements(By.XPATH, "//button[contains(., 'Digital Pass')] | //div[contains(@class, 'history-card')]")
                if pass_btn:
                    pass_btn[0].click()
                    time.sleep(2)
                    driver.save_screenshot(os.path.join(OUTPUT_DIR, "Figure_10_3_FastPass_QR_Code_Modal.png"))
                    print("3. Figure_10_3_FastPass_QR_Code_Modal.png saved.")
        except Exception as e:
            print("FastPass error:", e)

        # 4. Operator Portal & Analytics Dashboard
        try:
            driver.get("http://localhost:5173/")
            time.sleep(2)
            op_tab = driver.find_elements(By.XPATH, "//button[contains(., 'Operator Portal')]")
            if op_tab:
                op_tab[0].click()
                time.sleep(3)
                driver.save_screenshot(os.path.join(OUTPUT_DIR, "Figure_10_4_Operator_Dashboard_Analytics.png"))
                print("4. Figure_10_4_Operator_Dashboard_Analytics.png saved.")
        except Exception as e:
            print("Operator portal error:", e)

        # 5. Battery Estimator & Slot Booking Flow
        try:
            # Navigate back to find charger
            driver.get("http://localhost:5173/")
            time.sleep(3)
            # Find a station card in list or click station marker
            list_btn = driver.find_elements(By.XPATH, "//button[contains(., 'List')]")
            if list_btn:
                list_btn[0].click()
                time.sleep(2)
            
            # Click the reserve button inside drawer card
            reserve_btn = driver.find_elements(By.XPATH, "//button[contains(., 'Reserve') or contains(., 'Book')]")
            if reserve_btn:
                reserve_btn[0].click()
                time.sleep(2)
                driver.save_screenshot(os.path.join(OUTPUT_DIR, "Figure_10_2_Battery_Estimator_Booking_Wizard.png"))
                print("5. Figure_10_2_Battery_Estimator_Booking_Wizard.png saved.")
        except Exception as e:
            print("Booking flow error:", e)

    finally:
        driver.quit()
        print("Done.")

if __name__ == "__main__":
    run()
