/**
 * AI 生成的默认提示词常量
 */

// 提示词项接口
export interface PromptItemData {
  content: string;
  scene: string;  // 适用场景描述
}

// AI 图像生成默认提示词
export const AI_IMAGE_PROMPTS: Record<'zh' | 'en', PromptItemData[]> = {
  zh: [
    {
      content: `一张写实的半身人像，一位身穿水蓝色连身裙的年轻韩国亚洲女人走进旅馆大厅，女人脸上带着温暖的微笑，左手拿着白色棒球帽，右手拉着黄色行李箱。
场景在济州岛度假感的旅馆大厅里，柔和的光线从窗外洒入室内柔和的打在女人的身上，凸显了女人的脸部表情。
使用 50mm 人像镜头拍摄，女人在画面中央，背景呈现柔和的模糊（散景）。
氛围是日系杂志的色调并充满放松度假感。直式人像构图，比例1:1。`,
      scene: '人像摄影、旅行博主、时尚杂志封面'
    },
    {
      content: '一只可爱的小猫坐在窗台上，阳光透过窗户洒在它的毛发上',
      scene: '宠物摄影、温馨治愈系图片'
    },
    {
      content: '美丽的山水风景，青山绿水，云雾缭绕',
      scene: '自然风景、壁纸背景、旅游宣传'
    },
    {
      content: '现代简约风格的室内设计，明亮宽敞',
      scene: '室内设计、家居装修参考'
    },
    {
      content: '夜晚的城市天际线，霓虹灯闪烁',
      scene: '城市夜景、科技感背景'
    },
    {
      content: '春天的樱花盛开，粉色花瓣飘落',
      scene: '春季主题、浪漫氛围、日系风格'
    },
    {
      content: '科幻风格的太空站，星空背景',
      scene: '科幻主题、游戏概念图、未来感设计'
    },
    {
      content: '温馨的咖啡厅，暖色调灯光',
      scene: '餐饮空间、休闲氛围、生活方式'
    },
    {
      content: '抽象艺术风格，色彩丰富的几何图形',
      scene: '艺术创作、海报设计、创意背景'
    }
  ],
  en: [
    {
      content: `young Korean woman in a light blue dress holding a white baseball cap and pulling a yellow suitcase, photography,
stylish modern hotel lobby, soft sunlight streaming through the window, pastel tones, relaxed vacation mood,
centered vertical portrait with bokeh background, medium shot.`,
      scene: 'Portrait photography, travel blogger, fashion magazine cover'
    },
    {
      content: 'A cute kitten sitting on a windowsill with sunlight streaming through',
      scene: 'Pet photography, cozy healing images'
    },
    {
      content: 'Beautiful mountain landscape with green hills and misty clouds',
      scene: 'Nature scenery, wallpaper, travel promotion'
    },
    {
      content: 'Modern minimalist interior design, bright and spacious',
      scene: 'Interior design, home decoration reference'
    },
    {
      content: 'City skyline at night with neon lights glowing',
      scene: 'Urban nightscape, tech-style background'
    },
    {
      content: 'Cherry blossoms in spring with pink petals falling',
      scene: 'Spring theme, romantic atmosphere, Japanese style'
    },
    {
      content: 'Sci-fi space station with starry background',
      scene: 'Sci-fi theme, game concept art, futuristic design'
    },
    {
      content: 'Cozy coffee shop with warm ambient lighting',
      scene: 'Dining space, leisure atmosphere, lifestyle'
    },
    {
      content: 'Abstract art with colorful geometric shapes',
      scene: 'Art creation, poster design, creative background'
    }
  ]
};

// AI 视频生成默认提示词
export const AI_VIDEO_PROMPTS: Record<'zh' | 'en', PromptItemData[]> = {
  zh: [
    {
      content: `场景：日落时分，一座宏伟的城堡庭院，金色的光线透过彩色玻璃窗，营造出温暖而充满希望的氛围。  
相机：对两位公主进行中特写跟踪拍摄，然后进行广角拉出，露出整个庭院，最后缓慢向上倾斜到天空。  
动作：公主们互相微笑，然后开始和谐地唱歌，然后在灯光亮起时向天空举手。  
音频：柔和的管弦乐，伴随着令人振奋的弦乐和合唱，沙沙作响的树叶和远处鸟儿的环绕声，对话："我们相信明天会更加光明。"
风格：迪士尼风格的动画，鲜艳的色彩，梦幻般的灯光。`,
      scene: '动画短片、童话故事、品牌宣传片'
    },
    {
      content: '生成一个美丽的日出场景，阳光从山峰后缓缓升起，云朵轻柔地飘动',
      scene: '自然风光、延时摄影、励志视频开场'
    },
    {
      content: '创造一个森林中的场景，树叶在微风中轻轻摇摆，阳光斑驳',
      scene: '自然纪录片、冥想放松视频'
    },
    {
      content: '生成一个海边场景，海浪轻拍岸边，海鸟在空中盘旋',
      scene: '旅游宣传、ASMR、放松背景'
    },
    {
      content: '创建一个花园场景，花朵在微风中轻摆，蝴蝶翩翩起舞',
      scene: '春季主题、婚礼视频、浪漫氛围'
    },
    {
      content: '生成一个雨后场景，水滴从树叶上缓缓滴落，彩虹出现在天空',
      scene: '治愈系视频、自然美景、情感表达'
    },
    {
      content: '创造一个雪花飘落的冬日场景，雪花轻柔地降落',
      scene: '冬季主题、节日氛围、圣诞视频'
    },
    {
      content: '生成一个星空场景，星星闪烁，云朵缓缓飘过月亮',
      scene: '夜景、浪漫氛围、科幻背景'
    },
    {
      content: '创建一个溪流场景，清水在石头间潺潺流淌，鱼儿游过',
      scene: '自然纪录片、冥想音乐视频'
    }
  ],
  en: [
    {
      content: `Scene: A grand castle courtyard at sunset, golden light filtering through stained glass windows, creating a warm and hopeful atmosphere.  
Camera: Medium close-up tracking shot of the two princesses, then a wide-angle pull-out to reveal the entire courtyard, ending with a slow upward tilt to the sky.  
Action: The princesses smile at each other, then begin singing in harmony, then raise their hands toward the sky as the light brightens.  
Audio: Soft orchestral music with uplifting strings and choir, ambient sounds of rustling leaves and distant birds, dialogue: "Together, we believe tomorrow will be brighter."  
Style: Disney-style animation, vibrant colors, dreamy lighting.`,
      scene: 'Animation short, fairy tale, brand promotional video'
    },
    {
      content: 'Generate a beautiful sunrise scene where the sun slowly rises from behind mountains with clouds gently floating',
      scene: 'Nature scenery, timelapse, inspirational video intro'
    },
    {
      content: 'Create a forest scene with leaves gently swaying in the breeze and dappled sunlight',
      scene: 'Nature documentary, meditation relaxation video'
    },
    {
      content: 'Generate a seaside scene with waves gently lapping the shore and seagulls circling overhead',
      scene: 'Travel promotion, ASMR, relaxation background'
    },
    {
      content: 'Create a garden scene with flowers swaying in the breeze and butterflies dancing',
      scene: 'Spring theme, wedding video, romantic atmosphere'
    },
    {
      content: 'Generate a post-rain scene with water drops slowly dripping from leaves and a rainbow appearing in the sky',
      scene: 'Healing video, natural beauty, emotional expression'
    },
    {
      content: 'Create a winter scene with snowflakes gently falling',
      scene: 'Winter theme, festive atmosphere, Christmas video'
    },
    {
      content: 'Generate a starry night scene with twinkling stars and clouds slowly drifting across the moon',
      scene: 'Night scenery, romantic atmosphere, sci-fi background'
    },
    {
      content: 'Create a stream scene with clear water flowing gently between stones and fish swimming by',
      scene: 'Nature documentary, meditation music video'
    }
  ]
};

// 类型定义
export type Language = 'zh' | 'en';

// 获取图像生成提示词的辅助函数
export const getImagePrompts = (language: Language): PromptItemData[] => {
  return AI_IMAGE_PROMPTS[language];
};

// 获取视频生成提示词的辅助函数
export const getVideoPrompts = (language: Language): PromptItemData[] => {
  return AI_VIDEO_PROMPTS[language];
};