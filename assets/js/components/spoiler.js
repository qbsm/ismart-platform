// JavaScript для spoiler
import { onReady } from '../base/init.js';

onReady(function () {
  const spoilerTitles = document.querySelectorAll('.spoiler__item.title-wrap');

  // Добавляем обработчик события клика для каждого заголовка
  spoilerTitles.forEach((title) => {
    title.addEventListener('click', function () {
      // Находим родительский элемент (spoiler)
      const spoiler = this.closest('.spoiler');

      // Находим соответствующий блок описания
      const descWrap = spoiler.querySelector('.spoiler__item.desc-wrap');

      // Предотвращаем множественные клики во время анимации
      if (descWrap.style.transition === 'none') return;

      // Переключаем класс active для заголовка и родительского элемента
      this.classList.toggle('active');
      spoiler.classList.toggle('active');

      // Плавно разворачиваем или сворачиваем описание
      if (this.classList.contains('active')) {
        // Для активного состояния используем CSS классы
        descWrap.style.display = 'flex';
        // Устанавливаем небольшую задержку для корректного расчета высоты
        setTimeout(() => {
          descWrap.style.maxHeight = descWrap.scrollHeight + 'px';
          // После установки высоты убираем inline стили display
          setTimeout(() => {
            descWrap.style.removeProperty('display');
          }, 50);
        }, 10);
      } else {
        // Для неактивного состояния - сначала анимация, потом скрытие
        // Сохраняем текущую высоту для плавной анимации
        const currentHeight = descWrap.scrollHeight;
        descWrap.style.maxHeight = currentHeight + 'px';

        // Принудительно перерисовываем
        descWrap.offsetHeight;

        // Теперь анимируем к 0
        descWrap.style.maxHeight = '0';

        // После завершения анимации скрываем блок
        setTimeout(() => {
          if (!this.classList.contains('active')) {
            descWrap.style.display = 'none';
          }
        }, 300); // 300ms - длительность анимации
      }
    });
  });

  // Инициализация: учитываем уже активные спойлеры
  document.querySelectorAll('.spoiler').forEach((spoiler) => {
    const titleWrap = spoiler.querySelector('.spoiler__item.title-wrap');
    const descWrap = spoiler.querySelector('.spoiler__item.desc-wrap');

    if (spoiler.classList.contains('active')) {
      // Если спойлер должен быть активным изначально
      titleWrap.classList.add('active');
      // Убираем ограничения max-height для активных спойлеров
      descWrap.style.maxHeight = 'none';
      descWrap.style.overflow = 'visible';
      // Убираем inline стили display, позволяем CSS управлять
      descWrap.style.removeProperty('display');
    } else {
      // Скрываем неактивные спойлеры
      descWrap.style.maxHeight = '0';
      descWrap.style.display = 'none';
      descWrap.style.overflow = 'hidden';
    }

    // Общие стили для всех блоков описания
    descWrap.style.transition = 'max-height 0.3s ease, opacity 0.3s ease';
  });
});
