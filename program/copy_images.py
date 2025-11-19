import shutil
import os
import sys

# 定義來源和目標路徑
# 注意：路徑中包含中文字符，Python 3 字串預設為 unicode，通常能正確處理
src_uav = r"D:\盛群杯2025_demo\data\Picture\S__1908821_0.jpg"
src_ugv = r"D:\盛群杯2025_demo\data\Picture\S__1908824_0.jpg"

dst_dir = r"program/static/images"
dst_uav = os.path.join(dst_dir, "uav_cam.jpg")
dst_ugv = os.path.join(dst_dir, "ugv_cam.jpg")

def copy_file(src, dst):
    try:
        if not os.path.exists(src):
            print(f"Error: Source file not found: {src}")
            # 嘗試列出目錄內容以調試
            src_dir = os.path.dirname(src)
            if os.path.exists(src_dir):
                print(f"Listing {src_dir}:")
                for f in os.listdir(src_dir):
                    print(f" - {f}")
            return False
            
        shutil.copy2(src, dst)
        print(f"Successfully copied {src} to {dst}")
        return True
    except Exception as e:
        print(f"Failed to copy {src}: {e}")
        return False

# 確保目標目錄存在
os.makedirs(dst_dir, exist_ok=True)

# 執行複製
success_uav = copy_file(src_uav, dst_uav)
success_ugv = copy_file(src_ugv, dst_ugv)

if not success_uav or not success_ugv:
    sys.exit(1)

