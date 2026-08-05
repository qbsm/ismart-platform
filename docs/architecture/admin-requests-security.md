# Просмотр заявок: в ядре его нет

Заявки нигде не сохраняются: `ApiSendAction` отдаёт их в каналы (`mail`, `calltouch`, `telegram`,
`google_sheets`) и забывает. Логи (`logs/app-*.log`) содержат только `request_completed`, без
персональных данных.

Документ описывал эндпоинт `/admin/requests` и классы `App\Http\Routing\ApiRouter` /
`RequestsViewerController` из legacy-архитектуры (тег `legacy-archive-v0`) — в ядре их нет с момента
дистилляции. Если deployment заводит такой просмотр, он отдаёт персональные данные, и защиту к нему
проектируем там же, где заводим.
