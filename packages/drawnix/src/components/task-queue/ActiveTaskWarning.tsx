/**
 * ActiveTaskWarning Component
 *
 * Previously showed a warning when tasks were in progress.
 * Now that tasks run in Service Worker, refresh no longer interrupts them.
 * This component is kept for backwards compatibility but renders nothing.
 */

import React from 'react';

export const ActiveTaskWarning: React.FC = () => {
  // Tasks now run in Service Worker, refresh doesn't interrupt them
  // No need to show warning anymore
  return null;
};
