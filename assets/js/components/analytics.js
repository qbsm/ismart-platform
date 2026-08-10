/**
 * Цель «заявка отправлена» в Яндекс.Метрике.
 *
 * Без неё конверсии не видны ни в отчётах Метрики, ни в Директе: счётчик знает только визиты,
 * а факт заявки живёт на нашей стороне. Слушаем событие формы, а не встраиваемся в неё —
 * так цель работает для любой формы на странице.
 */
const GOAL = 'form_submit';

function counterId() {
  return window.appConfig && window.appConfig.YANDEX_METRIC_ID;
}

function goalParams(formData) {
  if (!formData) return {};

  const params = {};
  const form = formData.get('form_name') || formData.get('source') || formData.get('subject');
  if (form) params.form = String(form);

  const model = formData.get('model');
  if (model) params.model = String(model);

  return params;
}

document.addEventListener('formSubmissionSuccess', (event) => {
  const id = counterId();
  if (!id || typeof window.ym !== 'function') return;

  window.ym(id, 'reachGoal', GOAL, goalParams(event.detail && event.detail.formData));
});
