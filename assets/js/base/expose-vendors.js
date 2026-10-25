import Swiper from 'swiper';
import GLightbox from 'glightbox';
import $ from 'jquery';
import Inputmask from 'inputmask';

// Явно присваиваем библиотеки к глобальному объекту window,
// если они еще не были определены
if (typeof window.Swiper === 'undefined') window.Swiper = Swiper;
if (typeof window.GLightbox === 'undefined') window.GLightbox = GLightbox;
if (typeof window.$ === 'undefined') window.$ = $;
if (typeof window.jQuery === 'undefined') window.jQuery = $;
if (typeof window.Inputmask === 'undefined') window.Inputmask = Inputmask;

export default {
  Swiper,
  GLightbox,
  jQuery: $,
  $,
  Inputmask,
};
