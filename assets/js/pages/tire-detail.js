/**
 * Tire detail page — gallery thumbnail switching + fullscreen view
 */
import { onReady } from '../base/init.js';

function getLargestImageUrl(container) {
  // Try to get the largest source from picture > source srcset
  const sources = container.querySelectorAll('picture source');
  let largest = '';
  let maxWidth = 0;

  sources.forEach((source) => {
    const srcset = source.getAttribute('srcset') || '';
    // Parse srcset entries like "url 400w, url 800w, url 1280w"
    srcset.split(',').forEach((entry) => {
      const parts = entry.trim().split(/\s+/);
      if (parts.length >= 2) {
        const w = parseInt(parts[1], 10);
        if (w > maxWidth) {
          maxWidth = w;
          largest = parts[0];
        }
      } else if (parts.length === 1 && parts[0]) {
        // Single URL without width descriptor
        if (!largest) largest = parts[0];
      }
    });
  });

  if (largest) return largest;

  // Fallback to img src
  const img = container.querySelector('img');
  return img ? img.currentSrc || img.src : '';
}

onReady(() => {
  const thumbs = document.querySelectorAll('.tire-detail__thumb');
  const mainImage = document.querySelector('.tire-detail__main-image');

  if (!mainImage) return;

  // --- Thumbnail switching (только если миниатюр > 1) ---
  thumbs.forEach((thumb) => {
    thumb.addEventListener('click', () => {
      thumbs.forEach((t) => t.classList.remove('active'));
      thumb.classList.add('active');

      const picture = thumb.querySelector('picture');
      if (!picture) return;

      const newPicture = picture.cloneNode(true);
      const img = newPicture.querySelector('img');
      if (img) {
        img.classList.add('tire-detail__img');
        img.loading = 'eager';
      }

      mainImage.innerHTML = '';
      mainImage.appendChild(newPicture);
    });
  });

  // --- Fullscreen gallery via GLightbox ---
  if (typeof window.GLightbox !== 'function') return;

  const galleryItems = [];
  if (thumbs.length > 0) {
    thumbs.forEach((thumb) => {
      const url = getLargestImageUrl(thumb);
      if (url) {
        const img = thumb.querySelector('img');
        galleryItems.push({
          href: url,
          type: 'image',
          alt: img ? img.alt || '' : '',
        });
      }
    });
  } else {
    // Одно фото без миниатюр — берём напрямую из mainImage.
    const url = getLargestImageUrl(mainImage);
    if (url) {
      const img = mainImage.querySelector('img');
      galleryItems.push({
        href: url,
        type: 'image',
        alt: img ? img.alt || '' : '',
      });
    }
  }

  if (!galleryItems.length) return;

  const lightbox = window.GLightbox({
    elements: galleryItems,
    touchNavigation: true,
    loop: true,
    closeOnOutsideClick: true,
  });

  mainImage.style.cursor = 'pointer';
  mainImage.addEventListener('click', () => {
    const activeThumb = document.querySelector('.tire-detail__thumb.active');
    const index = activeThumb ? parseInt(activeThumb.dataset.index, 10) : 0;
    lightbox.openAt(index);
  });
});
