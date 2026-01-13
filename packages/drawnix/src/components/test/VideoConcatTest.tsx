/**
 * Video Concat Test Component
 *
 * 测试原生 MP4 拼接功能
 */

import React, { useState } from 'react';
import { Button, Progress, Space, MessagePlugin } from 'tdesign-react';
import { videoConcatService, type ConcatProgressCallback } from '../../services/video-concat-service';

export const VideoConcatTest: React.FC = () => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState<string>('');
  const [resultUrl, setResultUrl] = useState<string>('');

  const handleTest = async () => {
    setIsProcessing(true);
    setProgress(0);
    setStage('');
    setResultUrl('');

    try {
      // 测试视频 URL（需要替换为实际的视频 URL）
      const testUrls = [
        'https://example.com/video1.mp4',
        'https://example.com/video2.mp4',
      ];

      const onProgress: ConcatProgressCallback = (prog, st) => {
        setProgress(Math.round(prog));
        setStage(st);
        // console.log(`[Test] Progress: ${Math.round(prog)}% - ${st}`);
      };

      const result = await videoConcatService.concatVideos(testUrls, onProgress);

      setResultUrl(result.url);
      MessagePlugin.success('视频合并成功！');
      // console.log('[Test] Result:', result);
    } catch (error) {
      console.error('[Test] Error:', error);
      MessagePlugin.error(`合并失败: ${error}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const stageLabels: Record<string, string> = {
    downloading: '下载视频',
    parsing: '解析格式',
    merging: '合并数据',
    building: '构建文件',
  };

  return (
    <div style={{ padding: '24px', maxWidth: '800px', margin: '0 auto' }}>
      <h2>视频拼接测试（原生实现）</h2>

      <Space direction="vertical" style={{ width: '100%' }}>
        <div>
          <p>测试直接拼接 MP4 容器（无需 FFmpeg）</p>
          <p style={{ fontSize: '12px', color: '#666' }}>
            ⚠️ 注意：此实现处于实验阶段，可能不适用于所有 MP4 文件
          </p>
        </div>

        <Button
          onClick={handleTest}
          loading={isProcessing}
          theme="primary"
          disabled={isProcessing}
        >
          {isProcessing ? '处理中...' : '开始测试'}
        </Button>

        {isProcessing && (
          <div>
            <p>当前阶段: {stageLabels[stage] || stage}</p>
            <Progress percentage={progress} />
          </div>
        )}

        {resultUrl && (
          <div>
            <h3>合并结果</h3>
            <video
              src={resultUrl}
              controls
              style={{ width: '100%', maxWidth: '600px' }}
            />
            <div style={{ marginTop: '12px' }}>
              <a href={resultUrl} download="merged-video.mp4">
                <Button theme="default">下载视频</Button>
              </a>
            </div>
          </div>
        )}
      </Space>
    </div>
  );
};
