import { onReady } from '../base/init.js';

onReady(() => {
  initLogolineSlider();
});

function initLogolineSlider() {
  if (typeof window.Swiper === 'undefined') {
    setTimeout(initLogolineSlider, 200);
    return;
  }

  const el = document.getElementById('logolineSlider');
  if (!el || el.swiperInstance) return;

  const swiper = new window.Swiper(el, {
    slidesPerView: 5,
    spaceBetween: 10,
    loop: true,
    loopedSlides: 17,
    speed: 5000,
    allowTouchMove: false,
    autoplay: {
      delay: 1,
      disableOnInteraction: false,
    },
    breakpoints: {
      768: {
        slidesPerView: 8,
        spaceBetween: 10,
      },
      1200: {
        slidesPerView: 10,
        spaceBetween: 10,
      },
    },
  });

  el.swiperInstance = swiper;
}
