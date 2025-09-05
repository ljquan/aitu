import { getSelectedElements, PlaitBoard, PlaitElement, getRectangleByElements, RectangleClient, toImage, Point } from '@plait/core';
import { MindElement } from '@plait/mind';
import { PlaitDrawElement } from '@plait/draw';
import { Node } from 'slate';
import { Freehand } from '../plugins/freehand/type';

export interface ExtractedContent {
  text: string;
  images: { url: string; name?: string }[];
}

export interface ProcessedContent {
  remainingImages: { url: string; name?: string }[];
  remainingText: string;
  graphicsImage?: string;
}

/**
 * Extract text content from a Plait element
 */
export const extractTextFromElement = (element: PlaitElement, board?: PlaitBoard): string => {
  const texts: string[] = [];
  
  // Handle MindElement (mind map nodes)
  if (board && MindElement.isMindElement(board, element)) {
    const mindElement = element as MindElement;
    
    if (mindElement.data && Array.isArray(mindElement.data)) {
      // Extract text from Slate nodes
      for (const node of mindElement.data) {
        if (Node.isNode(node)) {
          const text = Node.string(node);
          if (text.trim()) {
            texts.push(text.trim());
          }
        }
      }
    }
  }
  
  // Handle other text elements - check if they have a 'data' property with text
  if ('data' in element && Array.isArray(element.data)) {
    for (const node of element.data) {
      if (Node.isNode(node)) {
        const text = Node.string(node);
        if (text.trim()) {
          texts.push(text.trim());
        }
      }
    }
  }
  
  // Handle elements with direct text property
  if ('text' in element) {
    // Handle string text
    if (typeof element.text === 'string' && element.text.trim()) {
      texts.push(element.text.trim());
    }
    
    // Handle structured text (like the geometry text format)
    if (element.text && typeof element.text === 'object' && 'children' in element.text) {
      const structuredText = element.text as any;
      if (Array.isArray(structuredText.children)) {
        for (const child of structuredText.children) {
          if (child && typeof child === 'object' && 'text' in child && typeof child.text === 'string') {
            const childText = child.text.trim();
            if (childText) {
              texts.push(childText);
            }
          }
        }
      }
    }
  }
  
  // Handle elements with textContent property
  if ('textContent' in element && typeof element.textContent === 'string') {
    texts.push(element.textContent.trim());
  }
  
  return texts.join(' ');
};

/**
 * Classify element as image-containing
 */
export const isImageElement = (board: PlaitBoard, element: PlaitElement): boolean => {
  // Mind elements with images
  if (MindElement.isMindElement(board, element)) {
    const mindElement = element as MindElement;
    return !!(mindElement.image && mindElement.image.url);
  }
  
  // Draw image elements
  if (PlaitDrawElement.isImage && PlaitDrawElement.isImage(element)) {
    return true;
  }
  
  // Elements with url property (fallback for other image types)
  if ('url' in element && typeof element.url === 'string') {
    return true;
  }
  
  // Elements with image property
  if ('image' in element && element.image && typeof element.image === 'object' && 'url' in element.image) {
    return true;
  }
  
  return false;
};

/**
 * Classify element as pure text-containing (not graphics)
 * Mind elements are now treated as graphics, not text-only elements
 */
export const isTextElement = (board: PlaitBoard, element: PlaitElement): boolean => {
  // PlaitText elements (these are text-specific geometry elements)
  if (PlaitDrawElement.isText && PlaitDrawElement.isText(element)) {
    console.log('Element classified as PlaitText element');
    return true;
  }
  
  // Pure text elements with text properties (fallback) - but exclude mind elements which are now graphics
  if (('text' in element && element.text) || ('textContent' in element && element.textContent)) {
    // Don't classify mind elements as text-only since they're now graphics
    if (MindElement.isMindElement(board, element)) {
      console.log('Element is mind element, treating as graphics not text');
      return false;
    }
    console.log('Element classified as text element (fallback)');
    return true;
  }
  
  console.log('Element not classified as text element, type:', element.type);
  return false;
};

/**
 * Classify element as graphics/drawing
 */
export const isGraphicsElement = (board: PlaitBoard, element: PlaitElement): boolean => {
  // Mind maps/mind elements should be treated as graphics (like freehand)
  if (MindElement.isMindElement(board, element)) {
    console.log('Element classified as mind element graphics');
    return true;
  }
  
  // Freehand drawings
  if (Freehand.isFreehand(element)) {
    console.log('Element classified as freehand graphics');
    return true;
  }
  
  // Geometric shapes (but exclude text elements which also match geometry)
  if (PlaitDrawElement.isGeometry && PlaitDrawElement.isGeometry(element)) {
    // Double-check it's not a text element, since PlaitText extends PlaitGeometry
    if (PlaitDrawElement.isText && PlaitDrawElement.isText(element)) {
      console.log('Element is geometry but also text, excluding from graphics');
      return false;
    }
    console.log('Element classified as geometry graphics');
    return true;
  }
  
  // Lines and arrows (flowchart elements)
  if (PlaitDrawElement.isArrowLine && PlaitDrawElement.isArrowLine(element)) {
    console.log('Element classified as arrow line graphics');
    return true;
  }
  
  if (PlaitDrawElement.isVectorLine && PlaitDrawElement.isVectorLine(element)) {
    console.log('Element classified as vector line graphics');
    return true;
  }
  
  // Tables and swimlanes (these are considered graphics for composition purposes)
  if (PlaitDrawElement.isTable && PlaitDrawElement.isTable(element)) {
    console.log('Element classified as table graphics');
    return true;
  }
  
  // Only classify as graphics if it's a draw element but NOT an image or pure text
  if (PlaitDrawElement.isDrawElement && PlaitDrawElement.isDrawElement(element)) {
    // Double-check to make sure it's not an image or pure text element
    const isImageElement = PlaitDrawElement.isImage && PlaitDrawElement.isImage(element);
    const isTextElement = PlaitDrawElement.isText && PlaitDrawElement.isText(element);
    
    if (!isImageElement && !isTextElement) {
      console.log('Element classified as other draw graphics');
      return true;
    }
  }
  
  // Check if it's a pure image element - if so, it's NOT graphics
  if (isImageElement(board, element)) {
    console.log('Element excluded from graphics (is image)');
    return false;
  }
  
  return false;
};

/**
 * Detect if two elements overlap spatially
 */
export const detectElementOverlap = (board: PlaitBoard, element1: PlaitElement, element2: PlaitElement): boolean => {
  try {
    const rect1 = getRectangleByElements(board, [element1], false);
    const rect2 = getRectangleByElements(board, [element2], false);
    
    console.log(`Overlap check: ${element1.id} (${element1.type}) vs ${element2.id} (${element2.type})`);
    console.log('  Rect1:', rect1);
    console.log('  Rect2:', rect2);
    
    const overlaps = RectangleClient.isHit(rect1, rect2);
    console.log('  Overlaps:', overlaps);
    
    return overlaps;
  } catch (error) {
    console.warn('Error detecting element overlap:', error, 'Elements:', element1.id, element2.id);
    return false;
  }
};

/**
 * Find all elements that overlap with any graphic element
 */
export const findElementsOverlappingWithGraphics = (board: PlaitBoard, elements: PlaitElement[]): {
  graphicsElements: PlaitElement[];
  overlappingElements: PlaitElement[];
} => {
  console.log('findElementsOverlappingWithGraphics: Processing', elements.length, 'elements');
  
  const graphicsElements = elements.filter(el => {
    const isGraphics = isGraphicsElement(board, el);
    if (isGraphics) {
      console.log('Found graphics element:', el.id, 'type:', el.type);
    }
    return isGraphics;
  });
  
  const nonGraphicsElements = elements.filter(el => {
    const isGraphics = isGraphicsElement(board, el);
    if (!isGraphics) {
      const isImage = isImageElement(board, el);
      const isText = isTextElement(board, el);
      console.log('Found non-graphics element:', el.id, 'type:', el.type, 'isImage:', isImage, 'isText:', isText);
    }
    return !isGraphics;
  });
  
  console.log('Graphics elements:', graphicsElements.length, 'Non-graphics elements:', nonGraphicsElements.length);
  
  const overlappingElements: PlaitElement[] = [];
  
  for (const graphicsEl of graphicsElements) {
    console.log('Checking overlaps for graphics element:', graphicsEl.id);
    for (const otherEl of nonGraphicsElements) {
      const overlaps = detectElementOverlap(board, graphicsEl, otherEl);
      console.log('  Overlap check with', otherEl.id, ':', overlaps);
      if (overlaps && !overlappingElements.includes(otherEl)) {
        overlappingElements.push(otherEl);
        console.log('  Added overlapping element:', otherEl.id);
      }
    }
  }
  
  console.log('Final result - Graphics:', graphicsElements.length, 'Overlapping:', overlappingElements.length);
  return { graphicsElements, overlappingElements };
};

/**
 * Convert elements to image using Plait's native toImage function
 * This preserves all styling, colors, and rendering exactly as they appear
 */
export const convertElementsToImage = async (board: PlaitBoard, elements: PlaitElement[]): Promise<string | null> => {
  try {
    if (elements.length === 0) {
      return null;
    }

    console.log(`Converting ${elements.length} elements to image using Plait's native toImage function`);
    
    // Use Plait's native toImage function with the same options as export
    // This ensures all colors, styles, and rendering are preserved exactly
    const imageDataUrl = await toImage(board, {
      elements: elements, // Only render the selected elements
      fillStyle: 'white', // White background for AI image generation
      inlineStyleClassNames: '.extend,.emojis,.text', // Include style classes for proper rendering
      padding: 20, // Add padding around elements
      ratio: 2, // Higher resolution for better quality (reduced from 4 to avoid too large images)
    });

    if (imageDataUrl) {
      console.log(`Successfully converted elements to image using native Plait rendering`);
      return imageDataUrl;
    } else {
      console.warn('Plait toImage returned null');
      return null;
    }

  } catch (error) {
    console.error('Error converting elements to image using Plait toImage:', error);
    return null;
  }
};

/**
 * Extract image URLs from a Plait element
 */
export const extractImagesFromElement = (element: PlaitElement, board?: PlaitBoard): { url: string; name?: string }[] => {
  const images: { url: string; name?: string }[] = [];
  
  // Handle MindElement with images
  if (board && MindElement.isMindElement(board, element)) {
    const mindElement = element as MindElement;
    if (mindElement.image && mindElement.image.url) {
      images.push({ 
        url: mindElement.image.url,
        name: `mind-image-${Date.now()}`
      });
    }
  }
  
  // Handle DrawImage elements (assuming they have url property)
  if ('url' in element && typeof element.url === 'string') {
    images.push({ 
      url: element.url,
      name: `draw-image-${Date.now()}`
    });
  }
  
  // Handle elements with image property
  if ('image' in element && element.image && typeof element.image === 'object' && 'url' in element.image) {
    images.push({ 
      url: element.image.url as string,
      name: `element-image-${Date.now()}`
    });
  }
  
  return images;
};

/**
 * Extract text and images from currently selected elements on the board
 */
export const extractSelectedContent = (board: PlaitBoard): ExtractedContent => {
  const selectedElements = getSelectedElements(board);
  
  const texts: string[] = [];
  const images: { url: string; name?: string }[] = [];
  
  for (const element of selectedElements) {
    // Extract text
    const elementText = extractTextFromElement(element, board);
    if (elementText) {
      texts.push(elementText);
    }
    
    // Extract images
    const elementImages = extractImagesFromElement(element, board);
    images.push(...elementImages);
  }
  
  return {
    text: texts.join('\n'),
    images: images
  };
};

/**
 * Process selected elements according to new AI image generation rules
 * This implements the logic for handling graphics elements with overlap detection
 */
export const processSelectedContentForAI = async (board: PlaitBoard): Promise<ProcessedContent> => {
  const selectedElements = getSelectedElements(board);
  console.log('processSelectedContentForAI: Selected elements count:', selectedElements.length);
  
  // Debug: Log each selected element's details
  selectedElements.forEach((el, index) => {
    console.log(`Element ${index}:`, {
      id: el.id,
      type: el.type,
      isImage: isImageElement(board, el),
      isText: isTextElement(board, el),
      isGraphics: isGraphicsElement(board, el),
      element: el
    });
  });
  
  // Step 1: Find graphics elements and their overlapping elements
  const { graphicsElements, overlappingElements } = findElementsOverlappingWithGraphics(board, selectedElements);
  console.log('Graphics elements:', graphicsElements.length, 'Overlapping elements:', overlappingElements.length);
  
  // Step 2: Combine graphics elements with overlapping elements
  const allGraphicsRelatedElements = [...graphicsElements, ...overlappingElements];
  
  // Step 3: Identify remaining elements (not graphics-related)
  const remainingElements = selectedElements.filter(
    el => !allGraphicsRelatedElements.includes(el)
  );
  console.log('Remaining elements count:', remainingElements.length);
  
  // Step 4: Generate image from graphics-related elements
  let graphicsImage: string | undefined;
  if (allGraphicsRelatedElements.length > 0) {
    console.log('Converting graphics-related elements to image, count:', allGraphicsRelatedElements.length);
    try {
      const imageUrl = await convertElementsToImage(board, allGraphicsRelatedElements);
      console.log('convertElementsToImage returned:', imageUrl ? 'success' : 'null');
      if (imageUrl) {
        graphicsImage = imageUrl;
      }
    } catch (error) {
      console.warn('Failed to convert graphics elements to image:', error);
    }
  } else {
    console.log('No graphics-related elements to convert to image');
  }
  
  // Step 5: Extract images and text from remaining elements
  const remainingImages: { url: string; name?: string }[] = [];
  const remainingTexts: string[] = [];
  
  for (const element of remainingElements) {
    // Extract text
    const elementText = extractTextFromElement(element, board);
    if (elementText) {
      remainingTexts.push(elementText);
      console.log('Found text from element:', elementText.substring(0, 50));
    }
    
    // Extract images
    const elementImages = extractImagesFromElement(element, board);
    if (elementImages.length > 0) {
      remainingImages.push(...elementImages);
      console.log('Found images from element:', elementImages.length);
    }
  }
  
  const result = {
    remainingImages,
    remainingText: remainingTexts.join('\n'),
    graphicsImage
  };
  
  console.log('Final result - Images:', result.remainingImages.length, 'Text length:', result.remainingText.length, 'Graphics image:', !!result.graphicsImage);
  
  return result;
};

/**
 * Convert image URL to File object for upload
 */
export const urlToFile = async (url: string, filename: string): Promise<File | null> => {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.warn('Failed to fetch image:', url);
      return null;
    }
    
    const blob = await response.blob();
    return new File([blob], filename, { type: blob.type });
  } catch (error) {
    console.warn('Error converting URL to file:', error);
    return null;
  }
};

/**
 * Calculate insertion point for new elements when there are selected elements
 * Returns the geometric center position at the bottom of all selected elements + 20px
 */
export const getInsertionPointForSelectedElements = (board: PlaitBoard): Point | null => {
  const selectedElements = getSelectedElements(board);
  
  if (selectedElements.length === 0) {
    return null;
  }
  
  try {
    // Get the bounding rectangle of all selected elements
    const boundingRect = getRectangleByElements(board, selectedElements, false);
    
    // Calculate the geometric center X coordinate
    const centerX = boundingRect.x + boundingRect.width / 2;
    
    // Calculate the bottom Y coordinate + 20px offset
    const insertionY = boundingRect.y + boundingRect.height + 20;
    
    console.log('Insertion point calculated:', { centerX, insertionY, boundingRect });
    
    return [centerX, insertionY] as Point;
  } catch (error) {
    console.warn('Error calculating insertion point for selected elements:', error);
    return null;
  }
};

/**
 * Get the appropriate insertion point, considering selected elements
 * If elements are selected, return the calculated insertion point
 * Otherwise, return the provided default point
 */
export const getSmartInsertionPoint = (board: PlaitBoard, defaultPoint?: Point): Point | undefined => {
  const calculatedPoint = getInsertionPointForSelectedElements(board);
  return calculatedPoint || defaultPoint;
};