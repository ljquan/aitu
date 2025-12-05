# Toolbar Declarative Tracking Events

**Date**: 2025-12-05
**Task**: Add declarative tracking to all UnifiedToolbar buttons

## Summary

Added `track` attributes to all interactive elements in the UnifiedToolbar, including:
- ToolButton components
- Menu items
- Regular HTML elements (divs, select, etc.)

## Implementation Changes

### 1. ToolButton Component
**File**: `packages/drawnix/src/components/tool-button.tsx`

Added `data-track` prop support (using standard HTML data attribute):
- Added `'data-track'?: string` to `ToolButtonBaseProps`
- Applied data-track attribute to button elements: `data-track={props['data-track']}`
- Applied data-track attribute to label elements (for radio buttons)

**Why `data-track` instead of `track`?**
- `data-*` attributes are standard HTML attributes, fully supported by TypeScript
- No need for complex type casting like `{...({ track: 'event_name' } as any)}`
- Cleaner, simpler code

### 2. Tracking Events by Toolbar Section

#### AppToolbar
**File**: `packages/drawnix/src/components/toolbar/app-toolbar/app-toolbar.tsx`

| Button | Track Event | Description |
|--------|-------------|-------------|
| Menu | `toolbar_click_menu` | Open app menu |
| Undo | `toolbar_click_undo` | Undo last action |
| Redo | `toolbar_click_redo` | Redo last action |

#### App Menu Items
**File**: `packages/drawnix/src/components/toolbar/app-toolbar/app-menu-items.tsx`

| Menu Item | Track Event | Description |
|-----------|-------------|-------------|
| Open File | `toolbar_click_menu_open` | Open file dialog |
| Save to File | `toolbar_click_menu_save` | Save board to JSON |
| Export Image (main) | `toolbar_click_menu_export` | Export as image (default PNG) |
| Export PNG | `toolbar_click_menu_export_png` | Export as PNG |
| Export JPG | `toolbar_click_menu_export_jpg` | Export as JPG |
| Clean Board | `toolbar_click_menu_clean` | Clear all elements |
| Settings | `toolbar_click_menu_settings` | Open settings dialog |
| GitHub Link | `toolbar_click_menu_github` | Open GitHub repository |

#### CreationToolbar
**File**: `packages/drawnix/src/components/toolbar/creation-toolbar.tsx`

| Button | Track Event | Description |
|--------|-------------|-------------|
| Hand Tool | `toolbar_click_hand` | Pan/hand mode |
| Selection | `toolbar_click_selection` | Select elements |
| Mind Map | `toolbar_click_mind` | Create mind map |
| Text | `toolbar_click_text` | Add text element |
| Pen (Freehand) | `toolbar_click_freehand` | Freehand drawing popover |
| Arrow | `toolbar_click_arrow` | Arrow line popover |
| Shape | `toolbar_click_shape` | Shape picker popover |
| Image | `toolbar_click_image` | Upload image |
| AI Image | `toolbar_click_ai-image` | AI image generation |
| AI Video | `toolbar_click_ai-video` | AI video generation |
| Extra Tools | `toolbar_click_extra-tools` | Extra tools menu |

#### ZoomToolbar
**File**: `packages/drawnix/src/components/toolbar/zoom-toolbar.tsx`

| Button | Track Event | Description |
|--------|-------------|-------------|
| Zoom Out | `toolbar_click_zoom_out` | Decrease zoom level |
| Zoom Menu | `toolbar_click_zoom_menu` | Open zoom menu |
| Fit Viewport | `toolbar_click_zoom_fit` | Fit content to viewport |
| 100% Zoom | `toolbar_click_zoom_100` | Reset to 100% zoom |
| Zoom In | `toolbar_click_zoom_in` | Increase zoom level |

#### ThemeToolbar
**File**: `packages/drawnix/src/components/toolbar/theme-toolbar.tsx`

| Element | Track Event | Description |
|---------|-------------|-------------|
| Theme Selector | `toolbar_click_theme` | Change theme color mode |

#### FeedbackButton
**File**: `packages/drawnix/src/components/feedback-button/feedback-button.tsx`

| Button | Track Event | Description |
|--------|-------------|-------------|
| Feedback | `toolbar_click_feedback` | Show feedback QR code |

#### TaskToolbarButton
**File**: `packages/drawnix/src/components/task-queue/TaskToolbarButton.tsx`

| Button | Track Event | Description |
|--------|-------------|-------------|
| Tasks | `toolbar_click_tasks` | Toggle task queue panel |

## Technical Implementation

### Standard Data Attribute

We use the standard HTML `data-track` attribute, which is fully supported by TypeScript without any type casting:

```typescript
// For ToolButton components
<ToolButton data-track="event_name" />

// For HTML elements (div, button, select)
<div data-track="event_name" />

// For MenuItem components
<MenuItem data-track="event_name" />
```

### ToolButton Component Changes

```typescript
// Type definition
type ToolButtonBaseProps = {
  // ... other props
  'data-track'?: string;
  // ...
};

// Button element
<button
  data-track={props['data-track']}
  // ... other props
>

// Label element (for radio buttons)
<label
  data-track={props['data-track']}
  // ... other props
>
```

## Event Naming Convention

All toolbar tracking events follow the pattern: `toolbar_click_{action}`

- **Prefix**: `toolbar_click_`
- **Action**: Describes the button/action (e.g., `menu`, `undo`, `zoom_in`)
- **Submenu**: For menu items, uses `menu_{action}` (e.g., `menu_save`, `menu_export_png`)

## Total Events Added

- **AppToolbar**: 3 button events
- **App Menu**: 8 menu item events
- **CreationToolbar**: 11 button events
- **ZoomToolbar**: 5 button/menu events
- **ThemeToolbar**: 1 select event
- **FeedbackButton**: 1 button event
- **TaskToolbarButton**: 1 button event

**Total**: 30 declarative tracking events across the UnifiedToolbar

## Verification

### Manual Testing
1. Click each button and verify tracking event is fired
2. Check browser console for `[Tracking]` logs
3. Verify events appear in Umami dashboard

### Event Data Structure
Each event will include metadata from the declarative tracking system:
```json
{
  "version": "0.2.1",
  "url": "https://aitu.chat/editor",
  "timestamp": 1701849600000,
  "sessionId": "session-abc123",
  "eventType": "click",
  "viewport": "1920x1080"
}
```

## Related Documentation

- [Declarative Tracking Implementation](./IMPLEMENTATION.md)
- [Integration with Existing Analytics](./INTEGRATION.md)
- [Refactoring Summary](./REFACTORING.md)
