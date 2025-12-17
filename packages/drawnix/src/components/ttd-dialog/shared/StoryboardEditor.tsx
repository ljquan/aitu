/**
 * StoryboardEditor Component
 *
 * Multi-scene editor for storyboard mode in video generation.
 * Supports adding/removing scenes, duration control, and prompt input.
 */

import React, { useCallback } from 'react';
import { Button, Input, Textarea, Switch } from 'tdesign-react';
import { AddIcon, DeleteIcon, TimeIcon } from 'tdesign-icons-react';
import type { StoryboardScene } from '../../../types/video.types';
import {
  createEmptyScene,
  reorderScenes,
} from '../../../utils/storyboard-utils';
import './StoryboardEditor.scss';

interface StoryboardEditorProps {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  totalDuration: number;
  maxScenes: number;
  minSceneDuration: number;
  scenes: StoryboardScene[];
  onScenesChange: (scenes: StoryboardScene[]) => void;
  disabled?: boolean;
}


export const StoryboardEditor: React.FC<StoryboardEditorProps> = ({
  enabled,
  onEnabledChange,
  totalDuration,
  maxScenes,
  minSceneDuration,
  scenes,
  onScenesChange,
  disabled = false,
}) => {
  // Handle adding a new scene with default duration (same as total)
  const handleAddScene = useCallback(() => {
    if (scenes.length >= maxScenes) return;

    const newSceneCount = scenes.length + 1;
    // New scene defaults to totalDuration (each scene can be up to totalDuration)
    const newScene = createEmptyScene(newSceneCount, totalDuration);
    onScenesChange([...scenes, newScene]);
  }, [scenes, maxScenes, totalDuration, onScenesChange]);

  // Handle removing a scene
  const handleRemoveScene = useCallback(
    (sceneId: string) => {
      if (scenes.length <= 1) return;

      const filteredScenes = scenes.filter(s => s.id !== sceneId);
      const reordered = reorderScenes(filteredScenes);
      onScenesChange(reordered);
    },
    [scenes, onScenesChange]
  );

  // Handle scene duration change - each scene can be 0.1 to totalDuration
  const handleDurationChange = useCallback(
    (sceneId: string, value: string) => {
      const newDuration = parseFloat(value);
      if (isNaN(newDuration)) return;

      const updatedScenes = scenes.map(scene => {
        if (scene.id === sceneId) {
          // Clamp duration: min is minSceneDuration, max is totalDuration
          const clampedDuration = Math.max(
            minSceneDuration,
            Math.min(newDuration, totalDuration)
          );
          // Round to 1 decimal place
          return { ...scene, duration: Math.round(clampedDuration * 10) / 10 };
        }
        return scene;
      });

      onScenesChange(updatedScenes);
    },
    [scenes, totalDuration, minSceneDuration, onScenesChange]
  );

  // Handle scene prompt change
  const handlePromptChange = useCallback(
    (sceneId: string, newPrompt: string) => {
      const updatedScenes = scenes.map(scene => {
        if (scene.id === sceneId) {
          return { ...scene, prompt: newPrompt };
        }
        return scene;
      });
      onScenesChange(updatedScenes);
    },
    [scenes, onScenesChange]
  );

  // Handle toggle enabled
  const handleToggleEnabled = useCallback(
    (value: boolean) => {
      onEnabledChange(value);
      if (value && scenes.length === 0) {
        // Initialize with first scene when enabled
        const firstScene = createEmptyScene(1, totalDuration);
        onScenesChange([firstScene]);
      }
    },
    [scenes, totalDuration, onEnabledChange, onScenesChange]
  );

  const canAddMore = scenes.length < maxScenes;

  return (
    <div className="storyboard-editor">
      {/* Toggle switch header */}
      <div className="storyboard-editor__header">
        <div className="storyboard-editor__toggle">
          <Switch
            value={enabled}
            onChange={handleToggleEnabled}
            disabled={disabled}
            size="small"
          />
          <div className="storyboard-editor__title">
            <span className="storyboard-editor__title-text">故事场景模式</span>
            <span className="storyboard-editor__title-desc">
              定义多个场景及其时长
            </span>
          </div>
        </div>
        {enabled && (
          <span className="storyboard-editor__new-badge">NEW</span>
        )}
      </div>

      {/* Scenes list */}
      {enabled && (
        <div className="storyboard-editor__content">
          {/* Section title */}
          <div className="storyboard-editor__section-header">
            <span className="storyboard-editor__section-title">场景列表</span>
            <span className="storyboard-editor__section-hint">
              每个场景时长不超过 {totalDuration} 秒
            </span>
          </div>

          {/* Scene cards */}
          <div className="storyboard-editor__scenes">
            {scenes.map((scene, index) => (
              <div key={scene.id} className="storyboard-editor__scene">
                <div className="storyboard-editor__scene-header">
                  <div className="storyboard-editor__scene-info">
                    <span className="storyboard-editor__scene-label">
                      场景 {index + 1}
                    </span>
                  </div>
                  <div className="storyboard-editor__scene-controls">
                    <TimeIcon className="storyboard-editor__time-icon" />
                    <Input
                      value={scene.duration.toString()}
                      onChange={value => handleDurationChange(scene.id, value as string)}
                      disabled={disabled}
                      className="storyboard-editor__duration-input"
                      align="center"
                    />
                    <span className="storyboard-editor__duration-unit">秒</span>
                    {scenes.length > 1 && (
                      <Button
                        theme="default"
                        variant="text"
                        size="small"
                        icon={<DeleteIcon />}
                        onClick={() => handleRemoveScene(scene.id)}
                        disabled={disabled}
                        className="storyboard-editor__scene-delete"
                      />
                    )}
                  </div>
                </div>
                <Textarea
                  value={scene.prompt}
                  onChange={value => handlePromptChange(scene.id, value as string)}
                  placeholder={`描述场景 ${index + 1} 的内容（如："飞机缓缓起飞，飞向夕阳..."）`}
                  autosize={{ minRows: 2, maxRows: 4 }}
                  disabled={disabled}
                  className="storyboard-editor__scene-prompt"
                />
              </div>
            ))}
          </div>

          {/* Add scene button */}
          {canAddMore && (
            <Button
              theme="default"
              variant="dashed"
              size="medium"
              icon={<AddIcon />}
              onClick={handleAddScene}
              disabled={disabled}
              className="storyboard-editor__add-btn"
              block
            >
              添加场景
            </Button>
          )}
        </div>
      )}
    </div>
  );
};

export default StoryboardEditor;
