import { getSelectedElements, PlaitBoard, PlaitElement, getRectangleByElements, RectangleClient } from '@plait/core';
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
 * Classify element as text-containing
 * In Plait, PlaitText extends PlaitGeometry, but we want to treat pure text elements separately
 */
export const isTextElement = (board: PlaitBoard, element: PlaitElement): boolean => {
  // Mind elements always contain text
  if (MindElement.isMindElement(board, element)) {
    console.log('Element classified as mind element (text)');
    return true;
  }
  
  // PlaitText elements (these are text-specific geometry elements)
  if (PlaitDrawElement.isText && PlaitDrawElement.isText(element)) {
    console.log('Element classified as PlaitText element');
    return true;
  }
  
  // Elements with text properties (fallback)
  if (('text' in element && element.text) || ('textContent' in element && element.textContent)) {
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
  // First, explicitly check if it's a text or image element - if so, it's NOT graphics
  if (isImageElement(board, element) || isTextElement(board, element)) {
    console.log('Element excluded from graphics (is text or image)');
    return false;
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
  
  // Lines and arrows
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
  
  // Only classify as graphics if it's a draw element but NOT an image or text
  if (PlaitDrawElement.isDrawElement && PlaitDrawElement.isDrawElement(element)) {
    // Double-check to make sure it's not an image or text element
    if (!PlaitDrawElement.isImage || !PlaitDrawElement.isImage(element)) {
      if (!PlaitDrawElement.isText || !PlaitDrawElement.isText(element)) {
        console.log('Element classified as other draw graphics');
        return true;
      }
    }
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
 * Convert elements to image by rendering them using the board's existing rendering system
 * This creates a screenshot-like image of the actual visual elements
 */
export const convertElementsToImage = async (board: PlaitBoard, elements: PlaitElement[]): Promise<string | null> => {
  try {
    if (elements.length === 0) {
      return null;
    }

    // Calculate the bounding box of all elements
    const boundingRect = getRectangleByElements(board, elements, true);
    if (!boundingRect || boundingRect.width <= 0 || boundingRect.height <= 0) {
      console.warn('Invalid bounding rectangle for elements');
      return null;
    }

    // Add padding around the elements
    const padding = 20;
    const canvasWidth = Math.max(100, boundingRect.width + padding * 2);
    const canvasHeight = Math.max(100, boundingRect.height + padding * 2);

    // Try to capture the actual rendered elements from the DOM
    try {
      const boardContainer = PlaitBoard.getBoardContainer(board);
      if (boardContainer) {
        // Find the SVG element that contains the rendered graphics
        const svgElement = boardContainer.querySelector('svg.plait-board-svg');
        if (svgElement) {
          // Clone the SVG to avoid modifying the original
          const clonedSvg = svgElement.cloneNode(true) as SVGElement;
          
          // Adjust the viewBox to focus on our selected elements
          const viewBoxX = boundingRect.x - padding;
          const viewBoxY = boundingRect.y - padding;
          clonedSvg.setAttribute('viewBox', `${viewBoxX} ${viewBoxY} ${canvasWidth} ${canvasHeight}`);
          clonedSvg.setAttribute('width', canvasWidth.toString());
          clonedSvg.setAttribute('height', canvasHeight.toString());
          
          // Hide elements that are not in our selection
          const allElements = clonedSvg.querySelectorAll('[data-element-id]');
          const selectedIds = new Set(elements.map(el => el.id));
          
          allElements.forEach(elem => {
            const elementId = elem.getAttribute('data-element-id');
            if (elementId && !selectedIds.has(elementId)) {
              (elem as HTMLElement).style.display = 'none';
            }
          });
          
          // Convert SVG to data URL
          const svgData = new XMLSerializer().serializeToString(clonedSvg);
          const dataURL = 'data:image/svg+xml;base64,' + window.btoa(svgData);
          
          console.log(`Captured actual rendered elements to image (${canvasWidth}x${canvasHeight})`);
          return dataURL;
        }
      }
    } catch (domError) {
      console.warn('Failed to capture from DOM, falling back to synthetic rendering:', domError);
    }

    // Fallback: Create a synthetic SVG representation
    const svgElements: string[] = [];
    
    // Add background
    svgElements.push(`<rect width="${canvasWidth}" height="${canvasHeight}" fill="#ffffff" stroke="none"/>`);
    
    // Sort elements by rendering order: images first (background), then graphics (foreground)
    // This ensures the correct layering in the generated SVG
    const sortedElements = elements.slice().sort((a, b) => {
      const aIsImage = isImageElement(board, a);
      const bIsImage = isImageElement(board, b);
      
      // Images should come first (render as background)
      if (aIsImage && !bIsImage) return -1;
      if (!aIsImage && bIsImage) return 1;
      
      // For same type elements, maintain original order
      return 0;
    });
    
    console.log('Element rendering order:', sortedElements.map(el => ({ id: el.id, type: el.type })));
    
    // Process each element and create a visual representation
    sortedElements.forEach((element) => {
      const elementRect = getRectangleByElements(board, [element], false);
      if (!elementRect) return;
      
      // Adjust coordinates relative to the bounding box
      const relativeX = elementRect.x - boundingRect.x + padding;
      const relativeY = elementRect.y - boundingRect.y + padding;
      const width = Math.max(10, elementRect.width);
      const height = Math.max(10, elementRect.height);
      
      // Create more detailed representations based on element type
      if (Freehand.isFreehand(element)) {
        // For freehand elements, try to render the actual path if available
        const freehandElement = element as any;
        
        // Debug: log element properties to understand its structure
        console.log('Freehand element properties:', Object.keys(freehandElement));
        console.log('Freehand element sample:', {
          strokeColor: freehandElement.strokeColor,
          color: freehandElement.color,
          stroke: freehandElement.stroke,
          style: freehandElement.style,
          strokeWidth: freehandElement.strokeWidth,
          width: freehandElement.width
        });
        
        // Extract color from the element or use default black
        const strokeColor = freehandElement.strokeColor || freehandElement.color || freehandElement.stroke || '#000000';
        const strokeWidth = freehandElement.strokeWidth || freehandElement.width || 2;
        
        if (freehandElement.points && Array.isArray(freehandElement.points)) {
          const pathData = freehandElement.points.map((point: [number, number], index: number) => {
            const x = point[0] - boundingRect.x + padding;
            const y = point[1] - boundingRect.y + padding;
            return index === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
          }).join(' ');
          
          svgElements.push(
            `<path d="${pathData}" stroke="${strokeColor}" stroke-width="${strokeWidth}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`
          );
        } else {
          // Fallback for freehand without points data
          svgElements.push(
            `<rect x="${relativeX}" y="${relativeY}" width="${width}" height="${height}" 
             fill="none" stroke="${strokeColor}" stroke-width="${strokeWidth}" stroke-dasharray="5,5" rx="5"/>`
          );
        }
      } else if (isGraphicsElement(board, element)) {
        // For other graphics elements (geometry, lines, etc.)
        const drawElement = element as any;
        
        // Extract colors and styling from the element
        const strokeColor = drawElement.strokeColor || drawElement.borderColor || drawElement.color || '#000000';
        const fillColor = drawElement.fillColor || drawElement.backgroundColor || 'none';
        const strokeWidth = drawElement.strokeWidth || drawElement.borderWidth || drawElement.width || 2;
        
        // Try to render based on the element's shape type
        if (drawElement.shape === 'rectangle' || drawElement.type === 'rectangle') {
          svgElements.push(
            `<rect x="${relativeX}" y="${relativeY}" width="${width}" height="${height}" 
             fill="${fillColor}" stroke="${strokeColor}" stroke-width="${strokeWidth}" rx="4"/>`
          );
        } else if (drawElement.shape === 'ellipse' || drawElement.type === 'ellipse') {
          const cx = relativeX + width / 2;
          const cy = relativeY + height / 2;
          const rx = width / 2;
          const ry = height / 2;
          svgElements.push(
            `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" 
             fill="${fillColor}" stroke="${strokeColor}" stroke-width="${strokeWidth}"/>`
          );
        } else if (drawElement.shape === 'line' || drawElement.type === 'line') {
          svgElements.push(
            `<line x1="${relativeX}" y1="${relativeY + height/2}" x2="${relativeX + width}" y2="${relativeY + height/2}" 
             stroke="${strokeColor}" stroke-width="${strokeWidth}" stroke-linecap="round"/>`
          );
        } else {
          // Generic graphics element - try to use actual colors
          svgElements.push(
            `<rect x="${relativeX}" y="${relativeY}" width="${width}" height="${height}" 
             fill="${fillColor}" stroke="${strokeColor}" stroke-width="${strokeWidth}" rx="6"/>`
          );
        }
      } else if (isImageElement(board, element)) {
        // Image elements: render the actual image if possible
        const imageElement = element as any;
        let imageUrl = '';
        
        console.log('Image element properties:', Object.keys(imageElement));
        console.log('Image element sample:', {
          url: imageElement.url,
          image: imageElement.image,
          src: imageElement.src,
          source: imageElement.source,
          path: imageElement.path
        });
        
        // Try to get the image URL from various possible properties
        if (imageElement.url) {
          imageUrl = imageElement.url;
        } else if (imageElement.image && imageElement.image.url) {
          imageUrl = imageElement.image.url;
        } else if (imageElement.src) {
          imageUrl = imageElement.src;
        } else if (imageElement.source) {
          imageUrl = imageElement.source;
        } else if (imageElement.path) {
          imageUrl = imageElement.path;
        }
        
        if (imageUrl) {
          console.log('Adding actual image to SVG:', imageUrl.substring(0, 100) + '...');
          svgElements.push(
            `<image x="${relativeX}" y="${relativeY}" width="${width}" height="${height}" 
             href="${imageUrl}" preserveAspectRatio="xMidYMid slice"/>`
          );
        } else {
          console.log('No image URL found, using placeholder for element:', imageElement);
          // Fallback to placeholder if no image URL found
          svgElements.push(
            `<rect x="${relativeX}" y="${relativeY}" width="${width}" height="${height}" 
             fill="#FFF3E0" stroke="#FF9800" stroke-width="2" rx="4"/>
             <text x="${relativeX + width/2}" y="${relativeY + height/2}" 
             text-anchor="middle" dy=".3em" font-family="Arial" font-size="${Math.min(16, width/4)}" fill="#E65100">📷</text>`
          );
        }
      } else if (isTextElement(board, element)) {
        // Text elements: render the actual text content
        const textContent = extractTextFromElement(element, board);
        const lines = textContent.split('\n').slice(0, 3); // Limit to 3 lines
        const fontSize = Math.min(14, width / textContent.length * 1.5);
        
        svgElements.push(
          `<rect x="${relativeX}" y="${relativeY}" width="${width}" height="${height}" 
           fill="#F9F9F9" stroke="#757575" stroke-width="1" stroke-dasharray="2,2" rx="2"/>`
        );
        
        lines.forEach((line, lineIndex) => {
          if (line.trim()) {
            const truncatedLine = line.length > Math.floor(width / fontSize * 1.5) 
              ? line.substring(0, Math.floor(width / fontSize * 1.5)) + '...' 
              : line;
            svgElements.push(
              `<text x="${relativeX + 4}" y="${relativeY + 16 + lineIndex * 18}" 
               font-family="Arial" font-size="${fontSize}" fill="#424242">${truncatedLine}</text>`
            );
          }
        });
      }
    });

    // Create the complete SVG
    const svgContent = `
      <svg width="${canvasWidth}" height="${canvasHeight}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="2" dy="2" stdDeviation="2" flood-color="#00000020"/>
          </filter>
        </defs>
        ${svgElements.join('\n        ')}
      </svg>
    `;

    // Convert to data URL using URL encoding to avoid btoa() encoding issues
    const encodedSvgContent = encodeURIComponent(svgContent);
    const dataURL = 'data:image/svg+xml;charset=utf-8,' + encodedSvgContent;
    
    console.log(`Converted ${elements.length} elements to synthetic image (${canvasWidth}x${canvasHeight})`);
    return dataURL;

  } catch (error) {
    console.error('Error converting elements to image:', error);
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