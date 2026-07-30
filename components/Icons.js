/**
 * Natro-OS icon set — hand-drawn stroke icons in the brand's restrained,
 * nature-and-science style. currentColor throughout so tiles tint them.
 * Replaces the emoji that made the UI feel like a chat app.
 */
const base = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' };

export const IconLeaf = () => (
  <svg {...base}><path d="M6 18C6 10 11 5 20 4c-.5 9-5 14-13 14"/><path d="M4 20c3-4 7-7 11-9"/></svg>
);
export const IconFlask = () => (
  <svg {...base}><path d="M10 3h4M11 3v5.5L5.8 17a3 3 0 0 0 2.6 4.5h7.2a3 3 0 0 0 2.6-4.5L13 8.5V3"/><path d="M8 14h8"/></svg>
);
export const IconMolecule = () => (
  <svg {...base}><circle cx="6" cy="17" r="2.4"/><circle cx="17" cy="18" r="2.4"/><circle cx="12" cy="6" r="2.4"/><path d="M10.9 8.1 7 14.8M13.2 8.2l2.8 7.4M8.4 17.4l6.2.5"/></svg>
);
export const IconBox = () => (
  <svg {...base}><path d="M3.5 8 12 3.5 20.5 8v8L12 20.5 3.5 16V8Z"/><path d="M3.5 8 12 12.5 20.5 8M12 12.5v8"/></svg>
);
export const IconCart = () => (
  <svg {...base}><path d="M3 4h2.2l2.2 11h10.4l2.2-8H6.2"/><circle cx="9" cy="19.5" r="1.4"/><circle cx="16.5" cy="19.5" r="1.4"/></svg>
);
export const IconWarehouse = () => (
  <svg {...base}><path d="M3 20V9l9-5 9 5v11"/><path d="M7 20v-6h10v6M7 17h10"/></svg>
);
export const IconFileText = () => (
  <svg {...base}><path d="M6 3h8l4 4v14H6V3Z"/><path d="M14 3v4h4M9.5 11h5M9.5 15h5"/></svg>
);
export const IconCoins = () => (
  <svg {...base}><ellipse cx="12" cy="6.5" rx="7" ry="3"/><path d="M5 6.5v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5"/><path d="M5 11.5v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5"/></svg>
);
export const IconUsers = () => (
  <svg {...base}><circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 19.5c.6-3.2 2.9-5 5.5-5s4.9 1.8 5.5 5"/><circle cx="16.8" cy="9.5" r="2.4"/><path d="M16.5 14.6c2.1.3 3.6 1.8 4 4.4"/></svg>
);
export const IconChart = () => (
  <svg {...base}><path d="M4 4v16h16"/><path d="M8 15v-4M12 15V8M16 15v-6"/></svg>
);
export const IconUpload = () => (
  <svg {...base}><path d="M12 15V4.5M8 8l4-3.5L16 8"/><path d="M4.5 15.5v3A1.5 1.5 0 0 0 6 20h12a1.5 1.5 0 0 0 1.5-1.5v-3"/></svg>
);
export const IconBook = () => (
  <svg {...base}><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15.5H6.5A2.5 2.5 0 0 0 4 21V5.5Z"/><path d="M4 18.5A2.5 2.5 0 0 1 6.5 16H20M8 7.5h8M8 11h5"/></svg>
);
export const IconGear = () => (
  <svg {...base}><circle cx="12" cy="12" r="3.2"/><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2-1.2L14.2 3h-4l-.4 2.7a7 7 0 0 0-2 1.2l-2.3-1-2 3.4 2 1.5A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 2 1.2l.4 2.7h4l.4-2.7a7 7 0 0 0 2-1.2l2.3 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2Z"/></svg>
);
export const IconGlobe = () => (
  <svg {...base}><circle cx="12" cy="12" r="8.5"/><path d="M12 3.5c-2.8 2.8-4.2 5.6-4.2 8.5s1.4 5.7 4.2 8.5M12 3.5c2.8 2.8 4.2 5.6 4.2 8.5s-1.4 5.7-4.2 8.5M3.5 12h17"/></svg>
);
export const IconCheck = () => (
  <svg {...base}><rect x="3.5" y="3.5" width="17" height="17" rx="3"/><path d="m8 12.5 2.8 2.8L16.5 9"/></svg>
);
export const IconClipboard = () => (
  <svg {...base}><rect x="5" y="4.5" width="14" height="17" rx="2"/><path d="M9 4.5V3h6v1.5M9 10.5h6M9 14h6M9 17.5h3.5"/></svg>
);
export const IconSparkle = () => (
  <svg {...base}><path d="M12 3.5 13.8 9 19.5 11 13.8 13 12 18.5 10.2 13 4.5 11 10.2 9 12 3.5Z"/><path d="M18.5 16.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7.7-2Z"/></svg>
);
export const IconHandshake = () => (
  <svg {...base}><path d="M8.5 12.5 5 9.2a2.3 2.3 0 0 1 0-3.3 2.4 2.4 0 0 1 3.4 0L12 9.4l3.6-3.5a2.4 2.4 0 0 1 3.4 0 2.3 2.3 0 0 1 0 3.3l-6 5.9a1.4 1.4 0 0 1-2 0"/><path d="m14.5 14.5 2 2M11.5 16.8l1.6 1.6"/></svg>
);
