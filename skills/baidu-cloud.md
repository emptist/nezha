---
name: baidu-cloud
description: Call Baidu Cloud AI APIs (OCR, Speech, Face Detection) using Python. Also supports Baidu NetDisk (Pan) file management via Open Platform API.
trigger: baidu, cloud, pan, ocr, speech, face, netdisk
---

# Baidu Cloud & NetDisk API Skill

## Part 1: Baidu Cloud AI APIs

### Quick Start

```python
import requests
import base64

def get_access_token(api_key, secret_key):
    auth_url = "https://aip.baidubce.com/oauth/2.0/token"
    params = {
        "grant_type": "client_credentials",
        "client_id": api_key,
        "client_secret": secret_key
    }
    response = requests.get(auth_url, params=params)
    return response.json().get("access_token")

# OCR Example
def basic_ocr(image_path, access_token):
    with open(image_path, 'rb') as f:
        img_base64 = base64.b64encode(f.read()).decode('utf-8')
    
    url = f"https://aip.baidubce.com/rest/2.0/ocr/v1/general_basic?access_token={access_token}"
    data = {"image": img_base64, "language_type": "CHN_ENG"}
    response = requests.post(url, data=data)
    return response.json()

# Speech Recognition
def speech_recognition(audio_path, access_token):
    with open(audio_path, 'rb') as f:
        audio_data = base64.b64encode(f.read()).decode('utf-8')
    
    url = f"https://vop.baidu.com/server_api?token={access_token}"
    data = {
        "format": "wav", "rate": 16000, "channel": 1,
        "cuid": "device_id", "token": access_token,
        "speech": audio_data, "len": len(base64.b64decode(audio_data))
    }
    response = requests.post(url, json=data)
    return response.json()

# Face Detection
def face_detection(image_path, access_token):
    with open(image_path, 'rb') as f:
        img_base64 = base64.b64encode(f.read()).decode('utf-8')
    
    url = f"https://aip.baidubce.com/rest/2.0/face/v3/detect?access_token={access_token}"
    data = {
        "image": img_base64, "image_type": "BASE64",
        "face_field": "age,beauty,gender,expression"
    }
    response = requests.post(url, json=data)
    return response.json()
```

### Setup (Cloud AI)

1. Register at https://login.bce.baidu.com
2. Create application at https://console.bce.baidu.com/qianfan/ais/console/apiKey
3. Set: `BAIDU_API_KEY`, `BAIDU_SECRET_KEY`

---

## Part 2: Baidu NetDisk (Pan) API

### MCP Protocol Support

Baidu NetDisk Open Platform now supports MCP protocol. Core APIs:

| Function | Description |
|----------|-------------|
| file_list | Get file list in specified directory |
| file_doc_list | Get document list |
| file_image_list | Get image list |
| file_video_list | Get video list |
| file_meta | Get file details by ID |
| file_upload_stdio | Upload local file to cloud |
| file_keyword_search | Search files by keyword |
| file_semantics_search | Semantic search |
| file_sharelink_set | Create share link |
| user_info | Get authenticated user info |
| apiquota | Get storage quota |

### Quick Start

```python
import requests

# OAuth 2.0 Authorization
# 1. Get code: https://openapi.baidu.com/oauth/2.0/authorize?response_type=code&client_id=YOUR_APP_KEY&redirect_uri=oob&scope=basic,netdisk

# 2. Exchange code for token
def get_token(app_key, secret_key, code):
    url = "https://openapi.baidu.com/oauth/2.0/token"
    params = {
        "grant_type": "authorization_code",
        "code": code,
        "client_id": app_key,
        "client_secret": secret_key,
        "redirect_uri": "oob"
    }
    response = requests.get(url, params=params)
    return response.json()

# Get user info
def get_user_info(access_token):
    url = "https://pan.baidu.com/rest/2.0/xpan/nas"
    params = {"method": "uinfo", "access_token": access_token}
    response = requests.get(url, params=params)
    return response.json()

# Get file list
def list_files(access_token, dir="/"):
    url = "https://pan.baidu.com/rest/2.0/xpan/file"
    params = {
        "method": "list",
        "access_token": access_token,
        "dir": dir
    }
    response = requests.get(url, params=params)
    return response.json()

# Search files
def search_files(access_token, key, dir="/"):
    url = "https://pan.baidu.com/rest/2.0/xpan/file"
    params = {
        "method": "search",
        "access_token": access_token,
        "key": key,
        "dir": dir
    }
    response = requests.get(url, params=params)
    return response.json()

# Upload file (simplified)
def upload_file(access_token, local_path, remote_path):
    with open(local_path, 'rb') as f:
        file_data = f.read()
    
    # Pre-create
    url = "https://pan.baidu.com/rest/2.0/xpan/file"
    params = {
        "method": "precreate",
        "access_token": access_token,
        "path": remote_path,
        "size": len(file_data),
        "isdir": 0
    }
    pre_resp = requests.post(url, params=params).json()
    
    # Upload (use superfile2 endpoint for large files)
    # ... (see official docs for chunked upload)
    
    return pre_resp
```

### Setup (NetDisk)

1. Register at https://pan.baidu.com/union
2. Create application (requires enterprise certification now)
3. Get AppID, AppKey, SecretKey
4. OAuth 2.0授权获取access_token

### API Endpoints

| Service | URL |
|---------|-----|
| File API | https://pan.baidu.com/rest/2.0/xpan/file |
| NAS API | https://pan.baidu.com/rest/2.0/xpan/nas |
| Upload | https://d.pcs.baidu.com/rest/2.0/pcs/superfile2 |