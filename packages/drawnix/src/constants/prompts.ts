/**
 * AI 生成的默认提示词常量
 */

// AI 图像生成默认提示词
export const AI_IMAGE_PROMPTS = {
  zh: [
    `一张写实的半身人像，一位身穿水蓝色连身裙的年轻韩国亚洲女人走进旅馆大厅，女人脸上带着温暖的微笑，左手拿着白色棒球帽，右手拉着黄色行李箱。
场景在济州岛度假感的旅馆大厅里，柔和的光线从窗外洒入室内柔和的打在女人的身上，凸显了女人的脸部表情。
使用 50mm 人像镜头拍摄，女人在画面中央，背景呈现柔和的模糊（散景）。
氛围是日系杂志的色调并充满放松度假感。直式人像构图，比例1:1。`,
    '一只可爱的小猫坐在窗台上，阳光透过窗户洒在它的毛发上',
    '美丽的山水风景，青山绿水，云雾缭绕',
    '现代简约风格的室内设计，明亮宽敞',
    '夜晚的城市天际线，霓虹灯闪烁',
    '春天的樱花盛开，粉色花瓣飘落',
    '科幻风格的太空站，星空背景',
    '温馨的咖啡厅，暖色调灯光',
    '抽象艺术风格，色彩丰富的几何图形'
  ],
  en: [
    `young Korean woman in a light blue dress holding a white baseball cap and pulling a yellow suitcase, photography,
stylish modern hotel lobby, soft sunlight streaming through the window, pastel tones, relaxed vacation mood,
centered vertical portrait with bokeh background, medium shot.`,
    'A cute kitten sitting on a windowsill with sunlight streaming through',
    'Beautiful mountain landscape with green hills and misty clouds',
    'Modern minimalist interior design, bright and spacious',
    'City skyline at night with neon lights glowing',
    'Cherry blossoms in spring with pink petals falling',
    'Sci-fi space station with starry background',
    'Cozy coffee shop with warm ambient lighting',
    'Abstract art with colorful geometric shapes'
  ]
} as const;

// AI 视频生成默认提示词
export const AI_VIDEO_PROMPTS = {
  zh: [
    `场景：日落时分，一座宏伟的城堡庭院，金色的光线透过彩色玻璃窗，营造出温暖而充满希望的氛围。  
相机：对两位公主进行中特写跟踪拍摄，然后进行广角拉出，露出整个庭院，最后缓慢向上倾斜到天空。  
动作：公主们互相微笑，然后开始和谐地唱歌，然后在灯光亮起时向天空举手。  
音频：柔和的管弦乐，伴随着令人振奋的弦乐和合唱，沙沙作响的树叶和远处鸟儿的环绕声，对话：“我们相信明天会更加光明。”
风格：迪士尼风格的动画，鲜艳的色彩，梦幻般的灯光。`,
    '生成一个美丽的日出场景，阳光从山峰后缓缓升起，云朵轻柔地飘动',
    '创造一个森林中的场景，树叶在微风中轻轻摇摆，阳光斑驳',
    '生成一个海边场景，海浪轻拍岸边，海鸟在空中盘旋',
    '创建一个花园场景，花朵在微风中轻摆，蝴蝶翩翩起舞',
    '生成一个雨后场景，水滴从树叶上缓缓滴落，彩虹出现在天空',
    '创造一个雪花飘落的冬日场景，雪花轻柔地降落',
    '生成一个星空场景，星星闪烁，云朵缓缓飘过月亮',
    '创建一个溪流场景，清水在石头间潺潺流淌，鱼儿游过'
  ],
  en: [
    `Scene: A grand castle courtyard at sunset, golden light filtering through stained glass windows, creating a warm and hopeful atmosphere.  
Camera: Medium close-up tracking shot of the two princesses, then a wide-angle pull-out to reveal the entire courtyard, ending with a slow upward tilt to the sky.  
Action: The princesses smile at each other, then begin singing in harmony, then raise their hands toward the sky as the light brightens.  
Audio: Soft orchestral music with uplifting strings and choir, ambient sounds of rustling leaves and distant birds, dialogue: "Together, we believe tomorrow will be brighter."  
Style: Disney-style animation, vibrant colors, dreamy lighting.`,
    'Generate a beautiful sunrise scene where the sun slowly rises from behind mountains with clouds gently floating',
    'Create a forest scene with leaves gently swaying in the breeze and dappled sunlight',
    'Generate a seaside scene with waves gently lapping the shore and seagulls circling overhead',
    'Create a garden scene with flowers swaying in the breeze and butterflies dancing',
    'Generate a post-rain scene with water drops slowly dripping from leaves and a rainbow appearing in the sky',
    'Create a winter scene with snowflakes gently falling',
    'Generate a starry night scene with twinkling stars and clouds slowly drifting across the moon',
    'Create a stream scene with clear water flowing gently between stones and fish swimming by'
  ]
} as const;

// 类型定义
export type Language = 'zh' | 'en';

// 获取图像生成提示词的辅助函数
export const getImagePrompts = (language: Language): readonly string[] => {
  return AI_IMAGE_PROMPTS[language];
};

// 获取视频生成提示词的辅助函数
export const getVideoPrompts = (language: Language): readonly string[] => {
  return AI_VIDEO_PROMPTS[language];
};