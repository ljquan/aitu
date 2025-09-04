"""
Gemini API 图像处理工具 v1.3
================================
功能描述：
- 支持向 Gemini AI 模型发送单张或多张图片进行分析和生成
- 自动处理API返回的混合内容（文字、base64图片、URL图片）
- 智能重试机制处理API配额超限和超时错误
- 使用流式响应确保大型图片数据的完整接收
- 将所有输出内容整理保存到带时间戳的目录中

作者：兔子CC
更新日期：2025-08-28
"""

import os
import base64
import re
import requests
import time
import json
from datetime import datetime
from openai import OpenAI

# ====================================
# 用户配置变量 - 请根据需要修改以下设置
# ====================================

# API配置
API_KEY = "sk-**"  # 请替换为你的实际API密钥
BASE_URL = "https://api.tu-zi.com/v1"  # 请替换为你的实际基础URL
MODEL_NAME = "gemini-2.5-flash-image"  # 使用的模型名称

# 图片路径（可以是单个路径或路径列表）
IMAGE_PATHS = [
    r"C:\Users\20wj2\Downloads\下载2.png",  # 第一张图片
    r"C:\Users\20wj2\Downloads\sz.png",  # 可以添加更多图片
    # r"C:\Users\20wj2\Downloads\image3.png",
]
# 为了向后兼容，如果只有一张图片也可以直接使用字符串
# IMAGE_PATHS = r"C:\Users\20wj2\Downloads\下载2.png"

# 提示词设置
PROMPT_TEXT = "依据上传图片，生成新的图片。图片1中的女士抱着图片2中人物形象的公仔，在睡觉。"  # 自定义提示词

# 重试设置
MAX_RETRIES = 10  # 最大重试次数
RETRY_DELAY = 0  # 重试延迟时间（秒），0表示立即重试

# API调用超时设置
API_TIMEOUT = 120  # API调用超时时间（秒），建议120秒以等待图片生成
USE_STREAM = True  # 必须使用流式响应才能获取完整的图片数据！

# ====================================
# 以下为功能代码，一般情况下无需修改
# ====================================

def prepare_image_data(image_path):
    """准备图片数据，转换为base64格式"""
    try:
        with open(image_path, "rb") as img_file:
            encoded_data = base64.b64encode(img_file.read()).decode("utf-8")
            return "data:image/png;base64," + encoded_data
    except Exception as e:
        print(f"准备图片数据时出错: {image_path} - {e}")
        raise

def create_output_directory():
    """创建输出目录"""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_dir = f"output_{timestamp}"
    os.makedirs(output_dir, exist_ok=True)
    return output_dir

def save_base64_image(base64_data, output_dir, image_index):
    """保存base64图片到本地"""
    try:
        # 移除data:image/png;base64,前缀（如果存在）
        if base64_data.startswith('data:image/'):
            base64_data = base64_data.split(',', 1)[1]

        # 解码base64数据
        image_data = base64.b64decode(base64_data)

        # 保存图片
        image_filename = f"image_{image_index}.png"
        image_path = os.path.join(output_dir, image_filename)

        with open(image_path, "wb") as img_file:
            img_file.write(image_data)

        print(f"已保存base64图片: {image_path}")
        return image_path
    except Exception as e:
        print(f"保存base64图片时出错: {e}")
        return None

def download_image_from_url(url, output_dir, image_index):
    """从URL下载图片到本地"""
    try:
        response = requests.get(url, stream=True)
        response.raise_for_status()

        # 获取文件扩展名
        content_type = response.headers.get('content-type', '')
        if 'png' in content_type.lower():
            ext = 'png'
        elif 'jpg' in content_type.lower() or 'jpeg' in content_type.lower():
            ext = 'jpg'
        elif 'gif' in content_type.lower():
            ext = 'gif'
        else:
            ext = 'png'  # 默认扩展名

        # 保存图片
        image_filename = f"image_url_{image_index}.{ext}"
        image_path = os.path.join(output_dir, image_filename)

        with open(image_path, "wb") as img_file:
            for chunk in response.iter_content(chunk_size=8192):
                img_file.write(chunk)

        print(f"已下载URL图片: {image_path}")
        return image_path
    except Exception as e:
        print(f"下载URL图片时出错: {e}")
        return None

def save_mixed_content(content, output_dir):
    """保存混合内容（文字、base64图片、URL图片）"""
    try:
        # 查找base64图片
        base64_pattern = r'data:image/[^;]+;base64,([A-Za-z0-9+/=]+)'
        base64_matches = re.finditer(base64_pattern, content)

        # 查找URL链接
        url_pattern = r'https?://[^\s<>"]+\.(png|jpg|jpeg|gif)'
        url_matches = re.finditer(url_pattern, content, re.IGNORECASE)

        # 保存文字内容到文件
        text_content = content
        image_index = 1

        # 处理base64图片
        for match in base64_matches:
            full_match = match.group(0)
            base64_data = match.group(1)

            # 保存base64图片
            saved_path = save_base64_image(base64_data, output_dir, image_index)
            if saved_path:
                # 在文本中替换base64数据为文件路径
                text_content = text_content.replace(full_match, f"[保存的图片: {saved_path}]")
                image_index += 1

        # 处理URL图片
        for match in url_matches:
            url = match.group(0)

            # 下载URL图片
            saved_path = download_image_from_url(url, output_dir, image_index)
            if saved_path:
                # 在文本中替换URL为文件路径
                text_content = text_content.replace(url, f"[下载的图片: {saved_path}]")
                image_index += 1

        # 保存处理后的文字内容
        text_filename = os.path.join(output_dir, "content.txt")
        with open(text_filename, "w", encoding="utf-8") as text_file:
            text_file.write(text_content)

        print(f"已保存文字内容: {text_filename}")

        # 同时保存原始内容
        original_filename = os.path.join(output_dir, "original_content.txt")
        with open(original_filename, "w", encoding="utf-8") as original_file:
            original_file.write(content)

        print(f"已保存原始内容: {original_filename}")

    except Exception as e:
        print(f"保存混合内容时出错: {e}")

def is_quota_exceeded_error(error_message):
    """检查是否为配额超出错误"""
    quota_keywords = [
        "exceeded your current quota",
        "quota exceeded",
        "billing details",
        "plan and billing"
    ]
    error_str = str(error_message).lower()
    return any(keyword in error_str for keyword in quota_keywords)

def call_api_raw(api_key, base_url, model, messages, timeout=API_TIMEOUT, use_stream=False, output_dir=None):
    """使用原始HTTP请求调用API，获取完整响应"""
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }

    data = {
        "model": model,
        "messages": messages,
        "stream": use_stream
    }

    url = f"{base_url}/chat/completions"

    try:
        print(f"发送原始HTTP请求到: {url}")
        if use_stream:
            print("使用流式响应模式...")

        response = requests.post(url, headers=headers, json=data, timeout=timeout, stream=use_stream)
        response.raise_for_status()

        if use_stream:
            # 处理流式响应
            full_content = ""
            all_chunks = []

            for line in response.iter_lines():
                if line:
                    line_str = line.decode('utf-8')
                    if line_str.startswith('data: '):
                        data_str = line_str[6:]
                        if data_str != '[DONE]':
                            try:
                                chunk = json.loads(data_str)
                                all_chunks.append(chunk)
                                if 'choices' in chunk and len(chunk['choices']) > 0:
                                    delta = chunk['choices'][0].get('delta', {})
                                    if 'content' in delta:
                                        full_content += delta['content']
                            except json.JSONDecodeError:
                                pass

            # 保存所有流式数据（调试用）
            if output_dir:
                debug_path = os.path.join(output_dir, "stream_chunks.json")
                with open(debug_path, "w", encoding="utf-8") as f:
                    json.dump(all_chunks, f, ensure_ascii=False, indent=2)

            print(f"流式响应: 接收到 {len(all_chunks)} 个数据块")
            if len(full_content) > 1000:
                print(f"获取到完整数据: {len(full_content)} 字符（包含图片）")
            else:
                print(f"获取到文本内容: {len(full_content)} 字符")

            # 构造标准响应格式
            json_response = {
                "choices": [{
                    "message": {
                        "role": "assistant",
                        "content": full_content
                    }
                }],
                "stream_chunks": all_chunks
            }
        else:
            # 获取完整的JSON响应
            json_response = response.json()

        # 保存原始JSON响应用于调试
        if output_dir:
            debug_path = os.path.join(output_dir, "raw_api_response.json")
            with open(debug_path, "w", encoding="utf-8") as f:
                json.dump(json_response, f, ensure_ascii=False, indent=2)
            print(f"原始API响应已保存到: {debug_path}")

        return json_response
    except requests.exceptions.RequestException as e:
        print(f"HTTP请求失败: {e}")
        raise

def call_openai_with_retry(client, model, messages, max_retries=MAX_RETRIES, retry_delay=RETRY_DELAY, timeout=API_TIMEOUT):
    """带重试功能的OpenAI API调用"""
    for attempt in range(max_retries):
        try:
            print(f"第 {attempt + 1} 次尝试调用API...")
            if timeout > 60:
                print(f"设置超时时间: {timeout}秒 (等待图片生成)")

            completion = client.chat.completions.create(
                model=model,
                messages=messages,
                timeout=timeout
            )

            print("API调用成功！")
            return completion

        except Exception as e:
            error_message = str(e)
            print(f"API调用失败: {error_message}")

            # 检查是否为配额超出错误或超时错误
            if is_quota_exceeded_error(error_message):
                if attempt < max_retries - 1:  # 还有重试机会
                    if retry_delay > 0:
                        print(f"检测到配额超出错误，将在 {retry_delay} 秒后进行第 {attempt + 2} 次重试...")
                        time.sleep(retry_delay)
                    else:
                        print(f"检测到配额超出错误，立即进行第 {attempt + 2} 次重试...")
                    continue
                else:
                    print("已达到最大重试次数，仍然配额超出，请检查账户余额和计费设置。")
                    raise
            elif "timeout" in error_message.lower() or "timed out" in error_message.lower():
                if attempt < max_retries - 1:  # 还有重试机会
                    print(f"API调用超时，可能图片生成需要更长时间，立即进行第 {attempt + 2} 次重试...")
                    continue
                else:
                    print("已达到最大重试次数，API仍然超时。建议增加API_TIMEOUT设置或检查网络连接。")
                    raise
            else:
                # 非配额/超时错误，直接抛出
                print("非配额/超时相关错误，不进行重试。")
                raise

    # 如果所有重试都失败了
    raise Exception(f"经过 {max_retries} 次重试后仍然失败")

# 初始化OpenAI客户端
client = OpenAI(
    api_key=API_KEY,
    base_url=BASE_URL
)

# 处理图片路径（支持单个路径或列表）
if isinstance(IMAGE_PATHS, str):
    image_paths = [IMAGE_PATHS]
else:
    image_paths = IMAGE_PATHS

# 准备所有图片数据
image_contents = []
for i, image_path in enumerate(image_paths):
    try:
        print(f"处理第 {i+1} 张图片: {image_path}")
        image_data = prepare_image_data(image_path)
        image_contents.append({
            "type": "image_url",
            "image_url": {
                "url": image_data,
            },
        })
    except Exception as e:
        print(f"处理图片时出错: {image_path} - {e}")
        continue

if not image_contents:
    print("没有成功处理任何图片，退出程序")
    exit(1)

# 构建消息内容（包含所有图片）
content_list = [{"type": "text", "text": PROMPT_TEXT}]
content_list.extend(image_contents)

messages = [
    {
        "role": "user",
        "content": content_list,
    }
]

print(f"\n共发送 {len(image_contents)} 张图片到API")

# 创建输出目录（提前创建以保存调试文件）
output_directory = create_output_directory()
print(f"创建输出目录: {output_directory}")

# 先尝试使用原始HTTP请求获取完整响应
print("\n使用原始HTTP请求调用API...")
try:
    raw_response = call_api_raw(
        api_key=API_KEY,
        base_url=BASE_URL,
        model=MODEL_NAME,
        messages=messages,
        timeout=API_TIMEOUT,
        use_stream=USE_STREAM,
        output_dir=output_directory  # 传递输出目录
    )

    # 静默处理，不再输出调试信息
    pass

    # 尝试从原始响应中提取内容
    completion = raw_response
    use_raw_response = True
except Exception as e:
    print(f"原始HTTP请求失败: {e}")
    print("\n回退到OpenAI客户端...")
    # 使用重试功能调用API
    completion = call_openai_with_retry(
        client=client,
        model=MODEL_NAME,
        messages=messages
    )
    use_raw_response = False

# 简化的调试信息（可选）
DEBUG_MODE = False  # 设置为True以查看详细调试信息

if DEBUG_MODE:
    print("\n=== 调试信息 ===")
    if use_raw_response:
        content = completion['choices'][0]['message']['content']
        print(f"Content长度: {len(content)} 字符")

        # 保存完整的content用于分析
        debug_path = os.path.join(output_directory, "raw_content_debug.txt")
        with open(debug_path, "wb") as f:
            f.write(content.encode('utf-8'))
        print(f"完整content已保存到: {debug_path}")

        # 尝试查找base64模式
        import re
        base64_pattern = r'[A-Za-z0-9+/]{100,}={0,2}'
        matches = re.findall(base64_pattern, content)
        if matches:
            print(f"发现base64图片数据: {len(matches)} 个")
    else:
        print(f"响应类型: OpenAI客户端对象")
        print("\n消息对象:", completion.choices[0].message)

        # 检查是否有其他字段包含图片
        if hasattr(completion.choices[0].message, '__dict__'):
            print("\n消息对象所有属性:")
            for key, value in completion.choices[0].message.__dict__.items():
                if value:
                    print(f"  {key}: {str(value)[:200]}...")  # 只显示前200个字符

# 获取响应内容 - 根据响应类型处理
if use_raw_response:
    # 处理原始JSON响应
    response_content = completion['choices'][0]['message'].get('content', '')

    # 检查原始响应中的所有可能的图片字段
    message_dict = completion['choices'][0]['message']

    # 常见的图片字段名称
    possible_image_fields = ['images', 'image', 'attachments', 'media', 'files', 'data']

    for field_name in possible_image_fields:
        if field_name in message_dict and message_dict[field_name]:
            print(f"\n发现图片字段 '{field_name}'!")
            images_data = message_dict[field_name]

            if isinstance(images_data, list):
                for idx, img in enumerate(images_data):
                    if isinstance(img, str):
                        # 假设是base64字符串
                        if not img.startswith('data:'):
                            response_content += f"\ndata:image/png;base64,{img}"
                        else:
                            response_content += f"\n{img}"
                    elif isinstance(img, dict):
                        # 可能是包含url或data字段的对象
                        if 'data' in img:
                            response_content += f"\ndata:image/png;base64,{img['data']}"
                        elif 'url' in img:
                            response_content += f"\n{img['url']}"
                        elif 'base64' in img:
                            response_content += f"\ndata:image/png;base64,{img['base64']}"
            elif isinstance(images_data, str):
                # 单个图片字符串
                if not images_data.startswith('data:'):
                    response_content += f"\ndata:image/png;base64,{images_data}"
                else:
                    response_content += f"\n{images_data}"
else:
    # 使用OpenAI客户端的响应
    response_content = completion.choices[0].message.content

# 检查是否有额外的图片字段（仅对OpenAI客户端响应）
if not use_raw_response:
    if hasattr(completion.choices[0].message, 'images'):
        print("\n发现images字段!")
        images = completion.choices[0].message.images
        if images:
            print(f"包含 {len(images)} 张图片")
            # 将图片添加到响应内容中
            for idx, img in enumerate(images):
                if isinstance(img, str):
                    response_content += f"\ndata:image/png;base64,{img}"
                elif hasattr(img, 'data'):
                    response_content += f"\ndata:image/png;base64,{img.data}"

print("\nAI响应内容:")
print(response_content[:500] + "..." if len(response_content) > 500 else response_content)

# 保存混合内容到本地
save_mixed_content(response_content, output_directory)
print(f"\n所有内容已保存到目录: {output_directory}")