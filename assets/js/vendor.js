// Vendor libraries
import jQuery from 'jquery';
window.$ = window.jQuery = jQuery;

// Import Swiper core и необходимые модули
import Swiper from 'swiper';
import { Navigation, Pagination, Scrollbar, EffectFade, Autoplay } from 'swiper/modules';

// Import styles
import 'swiper/css';
import 'swiper/css/navigation';
import 'swiper/css/pagination';
import 'swiper/css/scrollbar';
import 'swiper/css/effect-fade';
import 'glightbox/dist/css/glightbox.css';
import 'animate.css';

// Import JS
import GLightbox from 'glightbox/dist/js/glightbox.min.js';
import Inputmask from 'inputmask/dist/inputmask.min.js';

// Делаем Swiper доступным глобально
window.Swiper = Swiper;
window.SwiperModules = {
  Navigation,
  Pagination,
  Scrollbar,
  EffectFade,
  Autoplay,
};

// Регистрируем модули Swiper
Swiper.use([Navigation, Pagination, Scrollbar, EffectFade, Autoplay]);

// Make libraries available globally
window.GLightbox = GLightbox;
window.Inputmask = Inputmask;
