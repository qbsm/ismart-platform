// assets/js/pages/news.js — GLightbox для изображений в теле новости
import { onReady } from '../base/init.js';

onReady(() => {
  const body = document.querySelector('.news-detail__body');
  if (!body) return;

  const images = body.querySelectorAll('img');
  if (!images.length) return;

  // Оборачиваем каждый img в <a> для GLightbox
  images.forEach((img) => {
    const link = document.createElement('a');
    link.href = img.src;
    link.classList.add('glightbox');
    link.setAttribute('data-gallery', 'news-gallery');
    if (img.alt) {
      link.setAttribute('data-title', img.alt);
    }
    img.parentNode.insertBefore(link, img);
    link.appendChild(img);
  });

  // Инициализация GLightbox
  if (typeof window.GLightbox === 'function') {
    window.GLightbox({
      selector: '.news-detail__body .glightbox',
      touchNavigation: true,
      loop: true,
      closeOnOutsideClick: true,
    });
  }
});
