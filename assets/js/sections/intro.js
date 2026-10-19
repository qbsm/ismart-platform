// JavaScript для intro
import { onReady } from '../base/init.js';

onReady(() => {
  initIntroSlider();
});
onReady(() => {
  initIntroHeadingFade();
});

function initIntroHeadingFade() {
  const heading = document.querySelector('.intro .heading-wrap');
  if (!heading) {
    return;
  }

  // Полное затухание при прокрутке на 25rem.
  const FADE_DISTANCE_REM = 25;

  let ticking = false;
  const update = () => {
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const fadeDistance = Math.max(FADE_DISTANCE_REM * rem, 1);
    const scrollY =
      window.scrollY || window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
    const opacity = Math.max(0, Math.min(1, 1 - scrollY / fadeDistance));
    heading.style.opacity = String(opacity);
    ticking = false;
  };

  const onScroll = () => {
    if (!ticking) {
      window.requestAnimationFrame(update);
      ticking = true;
    }
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  document.addEventListener('scroll', onScroll, { passive: true, capture: true });
  window.addEventListener('resize', onScroll, { passive: true });
  update();
}

/**
 * Запускает видео в активном слайде и ставит на паузу в остальных.
 * На iOS автоплей по атрибутам часто не срабатывает — нужен программный play().
 */
function playVideosInActiveSlide(swiperInstance) {
  if (!swiperInstance || !swiperInstance.el) return;
  const container = swiperInstance.el;
  container.querySelectorAll('.swiper-slide .intro__video').forEach((video) => {
    const slide = video.closest('.swiper-slide');
    if (slide && slide.classList.contains('swiper-slide-active')) {
      video.muted = true;
      video.defaultMuted = true;
      video.setAttribute('muted', '');
      video.setAttribute('playsinline', '');
      video.setAttribute('webkit-playsinline', '');

      // iOS Safari: сброс src заставляет WebKit заново создать рендер-слой для видео.
      // Без этого видео может остаться невидимым после fade-перехода Swiper.
      if (
        /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
      ) {
        video.load();
      }

      setTimeout(() => {
        video.muted = true;
        video.defaultMuted = true;

        const p = video.play();
        if (p && typeof p.catch === 'function') {
          p.catch((e) => {
            console.warn('Автоплей видео не удался:', e);

            const playOnInteraction = () => {
              video.play().catch(() => {});
              document.removeEventListener('click', playOnInteraction);
              document.removeEventListener('touchstart', playOnInteraction);
            };
            document.addEventListener('click', playOnInteraction);
            document.addEventListener('touchstart', playOnInteraction);
          });
        }
      }, 200);
    } else {
      video.pause();
    }
  });
}

function initIntroSlider() {
  // Проверяем, доступен ли Swiper в глобальном контексте
  if (typeof window.Swiper === 'undefined') {
    console.warn('Swiper не доступен для слайдера introSlider. Пробуем инициализировать позже...');
    // Пробуем снова через 200 мс
    setTimeout(initIntroSlider, 200);
    return;
  }

  const sliderElement = document.getElementById('introSlider') || document.getElementById('projectSlider');

  if (sliderElement && !sliderElement.swiperInstance) {
    try {
      // Получение настроек из data-атрибута
      let settings = {};
      try {
        const dataSettings = sliderElement.getAttribute('data-settings');
        if (dataSettings) {
          settings = JSON.parse(dataSettings);
        }
      } catch (error) {
        console.error('Ошибка при парсинге настроек introSlider:', error);
      }

      // Создаем базовые настройки
      const swiperOptions = {
        direction: 'horizontal',
        loop: settings.loop !== undefined ? settings.loop : true,
        allowTouchMove: settings.allowTouchMove !== undefined ? settings.allowTouchMove : true,
        slidesPerView: 1,
        spaceBetween: 0,
        effect: 'fade',
        fadeEffect: {
          crossFade: true,
        },
        speed: 800,
        autoplay:
          settings.autoplay !== false
            ? {
                delay: 5000,
                disableOnInteraction: false,
              }
            : false,
        pagination: {
          el: '.swiper-pagination',
          clickable: true,
        },
        navigation: {
          nextEl: '.swiper-button-next',
          prevEl: '.swiper-button-prev',
        },
      };

      // Объединяем с настройками из data-атрибута
      if (settings.pagination) {
        if (settings.pagination.enabled) {
          swiperOptions.pagination = {
            el: '.swiper-pagination',
            clickable: true,
            ...settings.pagination,
          };
        } else {
          delete swiperOptions.pagination;
        }
      }

      if (settings.navigation) {
        if (settings.navigation.enabled) {
          swiperOptions.navigation = {
            nextEl: '.swiper-button-next',
            prevEl: '.swiper-button-prev',
            ...settings.navigation,
          };
        } else {
          delete swiperOptions.navigation;
        }
      }

      if (settings.autoplay) {
        swiperOptions.autoplay = settings.autoplay;
      }

      if (settings.effect) {
        swiperOptions.effect = settings.effect;
      }

      if (settings.breakpoints) {
        swiperOptions.breakpoints = settings.breakpoints;
      }

      const introSlider = new window.Swiper(sliderElement, swiperOptions);
      // Сохраняем экземпляр слайдера
      sliderElement.swiperInstance = introSlider;

      // iOS: автоплей по атрибутам часто не срабатывает — запускаем видео вручную
      playVideosInActiveSlide(introSlider);
      introSlider.on('slideChangeTransitionEnd', () => {
        playVideosInActiveSlide(introSlider);
      });
    } catch (error) {
      console.error('Ошибка при инициализации introSlider в секции intro:', error);
    }
  } else if (!sliderElement) {
    console.warn('Элемент слайдера #introSlider не найден на странице');
  }
}
